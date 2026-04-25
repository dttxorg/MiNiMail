import type {
  AttachmentMetadata,
  EmailAddress,
  GithubRedactionInput,
  GithubRedactionOptions,
  GithubRedactionResult,
  GitHubSemanticTokens,
  ParsedEmailMessage,
  RedactedEntity,
  RedactionCandidate,
  RedactionInputMetadata,
  RedactionMapEntry,
  RedactionOptions,
  RedactionResult,
  SensitiveEntityType,
} from './types';

const ENTITY_PRIORITY: Record<SensitiveEntityType, number> = {
    SECRET: 100,
    PAYMENT: 90,
    ID: 85,
    EMAIL: 80,
    PHONE: 75,
    ADDRESS: 70,
    ORG: 50,
  PERSON: 40,
  REPO: 20,
  DOMAIN: 10,
};

const DEFAULT_TOGGLES = {
  PERSON: true,
  EMAIL: true,
  PHONE: true,
  ORG: true,
  ADDRESS: true,
  ID: true,
  PAYMENT: true,
  SECRET: true,
};

const SECRET_PARAM_NAMES = new Set([
  'token',
  'signature',
  'sig',
  'access_token',
  'refresh_token',
  'apikey',
  'api_key',
  'key',
  'code',
  'auth',
  'password',
  'secret',
  'email',
]);

const PUBLIC_GITHUB_ACTIONS = ['review requested', 'assigned', 'mentioned', 'workflow failed', 'workflow passed', 'security alert'];
const GITHUB_NOREPLY_EMAIL_REGEX = /\b[A-Z0-9._%+-]+@users\.noreply\.github\.com\b/gi;

function normalizeLegacyOptions(options?: RedactionOptions): Required<typeof DEFAULT_TOGGLES> {
  return {
    PERSON: options?.PERSON ?? options?.names ?? DEFAULT_TOGGLES.PERSON,
    EMAIL: options?.EMAIL ?? options?.emails ?? DEFAULT_TOGGLES.EMAIL,
    PHONE: options?.PHONE ?? options?.phones ?? DEFAULT_TOGGLES.PHONE,
    ORG: options?.ORG ?? options?.companies ?? DEFAULT_TOGGLES.ORG,
    ADDRESS: options?.ADDRESS ?? options?.addresses ?? DEFAULT_TOGGLES.ADDRESS,
    ID: options?.ID ?? options?.orderIds ?? DEFAULT_TOGGLES.ID,
    PAYMENT: options?.PAYMENT ?? DEFAULT_TOGGLES.PAYMENT,
    SECRET: options?.SECRET ?? DEFAULT_TOGGLES.SECRET,
  };
}

function asMetadata(options?: RedactionOptions): RedactionInputMetadata {
  return {
    subject: options?.subject,
    from: options?.from,
    to: options?.to,
    cc: options?.cc,
    headers: options?.headers,
  };
}

function normalizeTextKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhoneKey(value: string): string {
  return value.replace(/[^\d+]+/g, '');
}

function normalizeAddressKey(value: string): string {
  return normalizeTextKey(value).replace(/[,.]/g, '');
}

function normalizeIdKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeCandidateValue(type: SensitiveEntityType, value: string): string {
  if (type === 'EMAIL') return value.trim().toLowerCase();
  if (type === 'PHONE') return normalizePhoneKey(value);
  if (type === 'ADDRESS') return normalizeAddressKey(value);
  if (type === 'ID' || type === 'PAYMENT') return normalizeIdKey(value);
  if (type === 'SECRET') return value.trim();
  return normalizeTextKey(value);
}

function pushCandidate(
  sink: RedactionCandidate[],
  type: SensitiveEntityType,
  original: string,
  start: number,
  end: number,
  score: number
): void {
  if (!original || start < 0 || end <= start) return;
  sink.push({
    type,
    original,
    normalized: normalizeCandidateValue(type, original),
    start,
    end,
    score,
  });
}

function collectAddressMetadata(metadata?: RedactionInputMetadata): EmailAddress[] {
  return [...(metadata?.from || []), ...(metadata?.to || []), ...(metadata?.cc || [])].filter((entry) => entry?.address);
}

function addMetadataCandidates(text: string, sink: RedactionCandidate[], metadata?: RedactionInputMetadata, toggles = DEFAULT_TOGGLES): void {
  const addresses = collectAddressMetadata(metadata);
  const names = Array.from(new Set(addresses.map((entry) => entry.name?.trim()).filter(Boolean))) as string[];
  const orgs = Array.from(new Set(
    addresses
      .map((entry) => entry.address.split('@')[1] || '')
      .map((domain) => domain.split('.').slice(0, -1).join('.') || domain.split('.')[0] || '')
      .filter((value) => value && !['gmail', 'outlook', 'hotmail', 'yahoo', 'icloud', 'qq', '163', '126', 'protonmail'].includes(value.toLowerCase()))
  ));

  if (toggles.PERSON) {
    for (const name of names.sort((a, b) => b.length - a.length)) {
      for (const match of text.matchAll(new RegExp(escapeRegExp(name), 'g'))) {
        pushCandidate(sink, 'PERSON', match[0], match.index || 0, (match.index || 0) + match[0].length, 0.92);
      }
    }
  }

  if (toggles.EMAIL) {
    for (const entry of addresses) {
      for (const match of text.matchAll(new RegExp(escapeRegExp(entry.address), 'gi'))) {
        pushCandidate(sink, 'EMAIL', match[0], match.index || 0, (match.index || 0) + match[0].length, 0.99);
      }
    }
  }

  if (toggles.ORG) {
    for (const org of orgs.sort((a, b) => b.length - a.length)) {
      for (const match of text.matchAll(new RegExp(`\\b${escapeRegExp(org)}\\b`, 'gi'))) {
        pushCandidate(sink, 'ORG', match[0], match.index || 0, (match.index || 0) + match[0].length, 0.7);
      }
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLikelyDateOrAmount(value: string): boolean {
  return /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/.test(value) || /[$€¥£]\s?\d/.test(value);
}

function isProtectedIssueLike(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 18), start);
  const current = text.slice(start, end);
  return /\b(?:issue|pr|pull request|discussion)\s*$/i.test(before) || /^#\d+\b/.test(current);
}

function collectRegexCandidates(text: string, sink: RedactionCandidate[], toggles = DEFAULT_TOGGLES): void {
  if (toggles.EMAIL) {
    for (const match of text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) {
      pushCandidate(sink, 'EMAIL', match[0], match.index || 0, (match.index || 0) + match[0].length, 0.99);
    }
  }

  if (toggles.PHONE) {
    for (const match of text.matchAll(/(?:\+?\d[\d\s().-]{6,}\d)/g)) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 16) continue;
      if (isLikelyDateOrAmount(match[0])) continue;
      const context = text.slice(Math.max(0, (match.index || 0) - 12), Math.min(text.length, (match.index || 0) + match[0].length + 12)).toLowerCase();
      if (/\b(?:ord|order|case|ticket|invoice|account|合同|订单|工单|cve)\b/.test(context)) continue;
      pushCandidate(sink, 'PHONE', match[0], match.index || 0, (match.index || 0) + match[0].length, 0.9);
    }
  }

  if (toggles.PAYMENT) {
    for (const match of text.matchAll(/\b(?:[A-Z]{2}\d{2}[A-Z0-9]{10,30}|(?:\d[ -]*?){13,19})\b/g)) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length >= 13 || /^[A-Z]{2}\d{2}/.test(match[0])) {
        pushCandidate(sink, 'PAYMENT', match[0], match.index || 0, (match.index || 0) + match[0].length, 0.88);
      }
    }
  }

  if (toggles.ADDRESS) {
    const patterns = [
      /\b\d{1,5}\s+[A-Za-z0-9.\s]+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct)\b[^\n,]*/gi,
      /(?:地址[:：]?\s*)?[\p{Script=Han}A-Za-z0-9\s-]{4,50}(?:省|市|区|县|路|街|道|大道|号|室)/gu,
      /\b[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]+\b/g,
      /(?<!https?:)\/(?:Users|home|var|opt|srv|etc|tmp|private)\/[^\s\r\n'"`]+/g,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[0].trim();
        if (value.length < 6) continue;
        pushCandidate(sink, 'ADDRESS', value, match.index || 0, (match.index || 0) + match[0].length, 0.78);
      }
    }
  }

  if (toggles.ID) {
    const patterns = [
      /\b(?:order|ticket|case|contract|account|invoice|customer|worker|工单|订单|合同|账号|客户|发票|证件)[\s#:：-]*([A-Z]{1,10}(?:-\d+)+|\d{6,}|[A-Z0-9-]{6,})\b/gi,
      /\b(?:ORD|ORDER|CASE|TICKET|CONTRACT|ACC|INV)(?:[-_]\d+)+\b/gi,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[1] || match[0];
        const start = (match.index || 0) + match[0].indexOf(value);
        const end = start + value.length;
        if (isProtectedIssueLike(text, start, end) || isLikelyDateOrAmount(value)) continue;
        pushCandidate(sink, 'ID', value, start, end, 0.82);
      }
    }
  }

  if (toggles.ORG) {
    const patterns = [
      /\b[A-Z][A-Za-z0-9&.\- ]{1,40}(?:Inc|LLC|Ltd|Limited|Corp|Corporation|Company|Bank|University|Foundation)\b/g,
      /[A-Za-z0-9\u4e00-\u9fff]{2,30}(?:公司|集团|银行|大学|研究院|事务所)/g,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        pushCandidate(sink, 'ORG', match[0], match.index || 0, (match.index || 0) + match[0].length, 0.7);
      }
    }
  }

  if (toggles.PERSON) {
    const patterns = [
      /\b(?:Hi|Hello|Dear)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
      /\b(?:Contact|Reach|Thanks to|From)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?=\s+(?:via|at)\b|\b)/g,
      /\b(?:Best regards|Regards|Thanks|Sincerely)[,\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
      /(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?=\n(?:[A-Za-z].*(?:LLC|Ltd|Inc|Corp|Company)|[A-Z0-9._%+-]+@|\+?\d))/g,
      /(?:你好|您好|致|联系人)[:：]?\s*([\u4e00-\u9fff]{2,4})/g,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[1] || match[0];
        const start = (match.index || 0) + match[0].indexOf(value);
        pushCandidate(sink, 'PERSON', value, start, start + value.length, 0.62);
      }
    }

    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        offset += line.length + 1;
        continue;
      }

      const previous = lines[i - 1]?.trim().toLowerCase().replace(/[,:]$/g, '') || '';
      const next = lines[i + 1]?.trim() || '';
      const isNameLine = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(trimmed) || /^[\u4e00-\u9fff]{2,4}$/.test(trimmed);
      const followsSignoff = /^(best|best regards|regards|thanks|sincerely|谢谢|此致)$/.test(previous);
      const followedByContact = /^[A-Z0-9._%+-]+@/i.test(next) || /^\+?\d/.test(next) || /(?:LLC|Ltd|Inc|Corp|Company|公司|集团|银行)$/.test(next);
      if (isNameLine && (followsSignoff || followedByContact)) {
        const start = offset + line.indexOf(trimmed);
        pushCandidate(sink, 'PERSON', trimmed, start, start + trimmed.length, 0.74);
      }

      offset += line.length + 1;
    }
  }
}

export function redactSensitiveUrlParams(text: string): RedactionResult {
  const redactionMap: RedactionMapEntry[] = [];
  const entities: RedactedEntity[] = [];
  let working = text;
  const seen = new Map<string, string>();
  let counters: Record<SensitiveEntityType, number> = {
    PERSON: 0, EMAIL: 0, PHONE: 0, ORG: 0, ADDRESS: 0, ID: 0, PAYMENT: 0, SECRET: 0, REPO: 0, DOMAIN: 0,
  };

  const urlRegex = /https?:\/\/[^\s)>\]]+/gi;
  working = working.replace(urlRegex, (url) => {
    try {
      const parsed = new URL(url);
      let touched = false;
      for (const [key, value] of parsed.searchParams.entries()) {
        if (!SECRET_PARAM_NAMES.has(key.toLowerCase()) || !value) continue;
        const normalized = `SECRET:${value}`;
        let placeholder = seen.get(normalized);
        if (!placeholder) {
          counters.SECRET += 1;
          placeholder = `[SECRET_${counters.SECRET}]`;
          seen.set(normalized, placeholder);
          redactionMap.push({ type: 'SECRET', original: value, placeholder });
        }
        parsed.searchParams.set(key, placeholder);
        touched = true;
      }
      let nextUrl = touched ? parsed.toString() : url;
      if (touched) {
        for (const placeholder of redactionMap.map((entry) => entry.placeholder)) {
          nextUrl = nextUrl.replace(new RegExp(escapeRegExp(encodeURIComponent(placeholder)), 'g'), placeholder);
        }
      }
      if (touched) {
        for (const entry of redactionMap.filter((item) => url.includes(item.original))) {
          const start = text.indexOf(url);
          entities.push({
            type: 'SECRET',
            original: entry.original,
            normalized: entry.original,
            start,
            end: start + url.length,
            score: 0.99,
            placeholder: entry.placeholder,
          });
        }
      }
      return nextUrl;
    } catch {
      return url;
    }
  });

  return { redactedText: working, redactionMap, entities };
}

export function extractSensitiveCandidates(
  text: string,
  metadata?: RedactionInputMetadata,
  options: RedactionOptions = {}
): RedactionCandidate[] {
  const toggles = normalizeLegacyOptions(options);
  const candidates: RedactionCandidate[] = [];
  collectRegexCandidates(text, candidates, toggles);
  addMetadataCandidates(text, candidates, metadata, toggles);

  if (toggles.SECRET) {
    const directSecretPatterns = [
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z\-_]{20,})\b/g,
    ];
    for (const pattern of directSecretPatterns) {
      for (const match of text.matchAll(pattern)) {
        pushCandidate(candidates, 'SECRET', match[0], match.index || 0, (match.index || 0) + match[0].length, 0.97);
      }
    }

    const capturedValuePatterns = [
      /\bBearer\s+([A-Za-z0-9._=-]{8,})\b/gi,
      /\b[A-Z][A-Z0-9_]{1,40}(?:TOKEN|KEY|SECRET|PASSWORD)\s*=\s*([^\s'"`]{8,})/g,
      /\b(?:Authorization|Auth|Api[- ]?Key|Access[- ]?Key|Client[- ]?Secret)\s*[:=]\s*([^\s'"`]{8,})/gi,
    ];
    for (const pattern of capturedValuePatterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[1];
        if (!value) continue;
        const start = (match.index || 0) + match[0].lastIndexOf(value);
        pushCandidate(candidates, 'SECRET', value, start, start + value.length, 0.95);
      }
    }

    for (const match of text.matchAll(GITHUB_NOREPLY_EMAIL_REGEX)) {
      pushCandidate(candidates, 'EMAIL', match[0], match.index || 0, (match.index || 0) + match[0].length, 0.99);
    }
  }

  return candidates;
}

function toParsedInputMetadata(parsed: ParsedEmailMessage): RedactionInputMetadata {
  return {
    subject: parsed.subject,
    from: parsed.from,
    to: parsed.to,
    cc: parsed.cc,
    headers: parsed.headers,
  };
}

function isParsedEmailMessage(value: string | ParsedEmailMessage): value is ParsedEmailMessage {
  return typeof value === 'object' && value !== null && 'plainText' in value && 'from' in value && 'to' in value;
}

export function mergeOverlappingEntities(candidates: RedactionCandidate[]): RedactionCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const aPriority = ENTITY_PRIORITY[a.type] ?? 0;
    const bPriority = ENTITY_PRIORITY[b.type] ?? 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return (b.end - b.start) - (a.end - a.start);
  });

  const merged: RedactionCandidate[] = [];
  for (const candidate of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || candidate.start >= previous.end) {
      merged.push(candidate);
      continue;
    }

    const prevPriority = ENTITY_PRIORITY[previous.type] ?? 0;
    const nextPriority = ENTITY_PRIORITY[candidate.type] ?? 0;
    const previousLength = previous.end - previous.start;
    const nextLength = candidate.end - candidate.start;
    if (nextPriority > prevPriority || (nextPriority === prevPriority && nextLength > previousLength)) {
      merged[merged.length - 1] = candidate;
    }
  }

  return merged;
}

export function normalizePlaceholderAssignment(candidates: RedactionCandidate[]): RedactedEntity[] {
  const counters: Record<SensitiveEntityType, number> = {
    PERSON: 0, EMAIL: 0, PHONE: 0, ORG: 0, ADDRESS: 0, ID: 0, PAYMENT: 0, SECRET: 0, REPO: 0, DOMAIN: 0,
  };
  const byKey = new Map<string, string>();

  return candidates.map((candidate) => {
    const key = `${candidate.type}:${candidate.normalized}`;
    let placeholder = byKey.get(key);
    if (!placeholder) {
      counters[candidate.type] += 1;
      placeholder = `[${candidate.type}_${counters[candidate.type]}]`;
      byKey.set(key, placeholder);
    }
    return { ...candidate, placeholder };
  });
}

function applyAssignedEntities(text: string, entities: RedactedEntity[]): RedactionResult {
  const sorted = [...entities].sort((a, b) => a.start - b.start);
  let cursor = 0;
  let redactedText = '';

  for (const entity of sorted) {
    redactedText += text.slice(cursor, entity.start);
    redactedText += entity.placeholder;
    cursor = entity.end;
  }
  redactedText += text.slice(cursor);

  const redactionMap: RedactionMapEntry[] = [];
  const seen = new Set<string>();
  for (const entity of sorted) {
    const key = `${entity.type}:${entity.placeholder}`;
    if (seen.has(key)) continue;
    seen.add(key);
    redactionMap.push({
      type: entity.type,
      original: entity.original,
      placeholder: entity.placeholder,
    });
  }

  return { redactedText, redactionMap, entities: sorted };
}

function nextPlaceholderForType(type: SensitiveEntityType, entries: RedactionMapEntry[]): string {
  const maxIndex = entries.reduce((max, entry) => {
    if (entry.type !== type) return max;
    const match = entry.placeholder.match(/_(\d+)\]$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `[${type}_${maxIndex + 1}]`;
}

function mergeRedactionMapEntries(
  existingEntries: RedactionMapEntry[],
  incomingEntries: RedactionMapEntry[],
): Map<string, string> {
  const placeholderMap = new Map<string, string>();

  for (const entry of incomingEntries) {
    const existing = existingEntries.find((item) => item.type === entry.type && item.original === entry.original);
    const placeholder = existing?.placeholder || nextPlaceholderForType(entry.type, existingEntries);
    if (!existing) {
      existingEntries.push({
        ...entry,
        placeholder,
      });
    }
    placeholderMap.set(entry.placeholder, placeholder);
  }

  return placeholderMap;
}

function remapPlaceholders(text: string, placeholderMap: Map<string, string>): string {
  let nextText = text;
  for (const [from, to] of placeholderMap.entries()) {
    if (from === to) continue;
    nextText = nextText.replace(new RegExp(escapeRegExp(from), 'g'), to);
  }
  return nextText;
}

function appendMetadataRedactionMap(
  entries: RedactionMapEntry[],
  metadata: RedactionInputMetadata,
  options: RedactionOptions
): void {
  const toggles = normalizeLegacyOptions(options);
  const addresses = collectAddressMetadata(metadata);
  const orgNames = Array.from(new Set(
    addresses
      .map((entry) => entry.address.split('@')[1] || '')
      .map((domain) => domain.split('.').slice(0, -1).join('.') || domain.split('.')[0] || '')
      .filter(Boolean)
  ));

  const tryPush = (type: SensitiveEntityType, original: string) => {
    if (!original.trim()) return;
    if (entries.some((entry) => entry.type === type && entry.original === original)) return;
    entries.push({
      type,
      original,
      placeholder: nextPlaceholderForType(type, entries),
    });
  };

  if (toggles.EMAIL) {
    addresses.forEach((entry) => tryPush('EMAIL', entry.address));
  }
  if (toggles.PERSON) {
    addresses.map((entry) => entry.name?.trim()).filter(Boolean).forEach((name) => tryPush('PERSON', name as string));
  }
  if (toggles.ORG) {
    orgNames.forEach((name) => tryPush('ORG', name));
  }
}

export function redactSensitiveEntities(
  input: string | ParsedEmailMessage,
  options: RedactionOptions = {}
): RedactionResult {
  const parsedInput = isParsedEmailMessage(input) ? input : null;
  const originalText: string = parsedInput ? parsedInput.plainText : (input as string);
  const metadata = parsedInput ? toParsedInputMetadata(parsedInput) : asMetadata(options);
  let workingText = originalText;
  const combinedMap: RedactionMapEntry[] = [];

  if (normalizeLegacyOptions(options).SECRET) {
    const secretUrlResult = redactSensitiveUrlParams(workingText);
    workingText = secretUrlResult.redactedText;
    combinedMap.push(...secretUrlResult.redactionMap);
  }

  const candidates = extractSensitiveCandidates(workingText, metadata, options);
  const merged = mergeOverlappingEntities(candidates);
  const assigned = normalizePlaceholderAssignment(merged);
  const result = applyAssignedEntities(workingText, assigned);

  for (const entry of result.redactionMap) {
    if (!combinedMap.some((item) => item.placeholder === entry.placeholder && item.original === entry.original)) {
      combinedMap.push(entry);
    }
  }
  if (parsedInput) {
    appendMetadataRedactionMap(combinedMap, metadata, options);
  }

  return {
    redactedText: result.redactedText,
    redactionMap: combinedMap,
    entities: result.entities,
    redacted: parsedInput
      ? {
          plainText: result.redactedText,
        }
      : {
          plainText: result.redactedText,
        },
  };
}

export function restoreSensitiveEntities(text: string, redactionMap: RedactionMapEntry[]): string {
  return [...redactionMap]
    .sort((a, b) => b.placeholder.length - a.placeholder.length)
    .reduce((acc, entry) => acc.replace(new RegExp(escapeRegExp(entry.placeholder), 'g'), entry.original), text);
}

function extractGitHubUsernames(text: string): string[] {
  const candidates = new Set<string>();

  for (const match of text.matchAll(/\b(?:by|from|requested by|assigned to|mentioned by|triggered by)\s+([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\b/gi)) {
    candidates.add(match[1]);
  }

  for (const match of text.matchAll(/github\.com\/([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\//gi)) {
    candidates.add(match[1]);
  }

  return Array.from(candidates);
}

function collectGithubUsernameCandidates(text: string, usernames: string[]): RedactionCandidate[] {
  const candidates: RedactionCandidate[] = [];
  const seen = new Set<string>();

  for (const username of usernames.sort((a, b) => b.length - a.length)) {
    if (!username) continue;
    const barePattern = new RegExp(`(?<![A-Za-z0-9_./-])${escapeRegExp(username)}(?![A-Za-z0-9_-])`, 'gi');
    const handlePattern = new RegExp(`@${escapeRegExp(username)}(?![A-Za-z0-9_-])`, 'gi');

    for (const pattern of [handlePattern, barePattern]) {
      for (const match of text.matchAll(pattern)) {
        const original = match[0];
        const start = match.index || 0;
        const end = start + original.length;
        const key = `${start}:${end}:${original.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pushCandidate(candidates, 'PERSON', original, start, end, 0.86);
      }
    }
  }

  return candidates;
}

function redactAttachmentField(
  value: string | undefined,
  combinedMap: RedactionMapEntry[],
  options: RedactionOptions,
): string | undefined {
  if (!value) return value;
  const result = redactSensitiveEntities(value, options);
  const placeholderMap = mergeRedactionMapEntries(combinedMap, result.redactionMap);
  return remapPlaceholders(result.redactedText, placeholderMap);
}

function redactAttachmentOpaqueField(
  value: string | undefined,
  combinedMap: RedactionMapEntry[],
  type: SensitiveEntityType = 'SECRET',
): string | undefined {
  if (!value) return value;
  const existing = combinedMap.find((entry) => entry.type === type && entry.original === value);
  const placeholder = existing?.placeholder || nextPlaceholderForType(type, combinedMap);
  if (!existing) {
    combinedMap.push({
      type,
      original: value,
      placeholder,
    });
  }
  return placeholder;
}

function redactGithubAttachmentMetadata(
  attachments: AttachmentMetadata[] | undefined,
  combinedMap: RedactionMapEntry[],
  options: GithubRedactionOptions,
): AttachmentMetadata[] | undefined {
  if (!attachments?.length) return undefined;

  const fieldOptions: RedactionOptions = {
    PERSON: options.PERSON ?? true,
    EMAIL: options.EMAIL ?? true,
    PHONE: options.PHONE ?? true,
    ORG: options.ORG ?? false,
    ADDRESS: options.ADDRESS ?? true,
    ID: options.ID ?? true,
    PAYMENT: options.PAYMENT ?? true,
    SECRET: options.SECRET ?? true,
  };

  return attachments.map((attachment) => ({
    ...attachment,
    filename: redactAttachmentField(attachment.filename, combinedMap, fieldOptions) || attachment.filename,
    contentId: attachment.contentId && /(token|secret|key|oauth|auth|session|credential)/i.test(attachment.contentId)
      ? redactAttachmentOpaqueField(attachment.contentId, combinedMap, 'SECRET')
      : redactAttachmentField(attachment.contentId, combinedMap, fieldOptions),
    attachmentId: attachment.attachmentId
      ? redactAttachmentOpaqueField(attachment.attachmentId, combinedMap, 'SECRET')
      : undefined,
  }));
}

export function preserveGithubSemanticTokens(
  input: GithubRedactionInput,
  options: GithubRedactionOptions = {}
): GitHubSemanticTokens {
  const fullText = [input.subject, input.plainText, input.metadata?.repo, input.metadata?.url].filter(Boolean).join('\n');
  const repoMentions = new Set<string>();
  if (input.metadata?.repo) {
    repoMentions.add(input.metadata.repo);
  }
  const subjectRepoMatch = input.subject.match(/\[([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\]/);
  if (subjectRepoMatch) {
    repoMentions.add(subjectRepoMatch[1]);
  }
  for (const match of fullText.matchAll(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\/|#|\b)/gi)) {
    repoMentions.add(match[1]);
  }

  const ownerRepoNumbers = Array.from(new Set(Array.from(fullText.matchAll(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+)\b/g)).map((match) => match[1])));
  const issueNumbers = Array.from(new Set(Array.from(fullText.matchAll(/(?:#|PR\s+#|issue\s+#|pull request\s+#)(\d+)/gi)).map((match) => Number(match[1])))).filter(Number.isFinite);
  const usernames = options.preservePublicUsernames === false ? [] : extractGitHubUsernames(fullText);
  const workflowStatusTokens = PUBLIC_GITHUB_ACTIONS.filter((token) => fullText.toLowerCase().includes(token));
  if (/\bfailed\b/i.test(fullText)) workflowStatusTokens.push('failed');
  if (/\bpassed\b|\bsucceeded\b/i.test(fullText)) workflowStatusTokens.push('passed');
  const urlsPreserved = Array.from(new Set(Array.from(fullText.matchAll(/https?:\/\/[^\s)>\]]+/gi)).map((match) => match[0]).filter((url) => /github\.com\//i.test(url))));

  return {
    repoMentions: Array.from(repoMentions),
    issueNumbers,
    ownerRepoNumbers,
    usernames,
    workflowStatusTokens,
    urlsPreserved,
  };
}

export function optionalRepoMasking(
  text: string,
  semantics: GitHubSemanticTokens,
  options: GithubRedactionOptions = {}
): { text: string; entries: RedactionMapEntry[] } {
  let nextText = text;
  const entries: RedactionMapEntry[] = [];
  const repoMap = new Map<string, string>();
  const domainMap = new Map<string, string>();

  if (options.maskRepositories) {
    for (const repo of semantics.repoMentions.sort((a, b) => b.length - a.length)) {
      const placeholder = repoMap.get(repo) || `[REPO_${repoMap.size + 1}]`;
      repoMap.set(repo, placeholder);
      nextText = nextText.replace(new RegExp(escapeRegExp(repo), 'g'), placeholder);
      entries.push({ type: 'REPO', original: repo, placeholder });
    }
  }

  if (options.maskInternalDomains && options.internalDomains?.length) {
    for (const domain of options.internalDomains.sort((a, b) => b.length - a.length)) {
      const placeholder = domainMap.get(domain) || `[DOMAIN_${domainMap.size + 1}]`;
      domainMap.set(domain, placeholder);
      nextText = nextText.replace(new RegExp(escapeRegExp(domain), 'g'), placeholder);
      entries.push({ type: 'DOMAIN', original: domain, placeholder });
    }
  }

  return { text: nextText, entries };
}

export function redactGithubMailEntities(
  input: GithubRedactionInput,
  options: GithubRedactionOptions = {}
): GithubRedactionResult {
  const semantics = preserveGithubSemanticTokens(input, options);
  const metadata: RedactionInputMetadata = {
    subject: input.subject,
    headers: input.headers || input.metadata?.headers,
  };

  const protectedMap = new Map<string, string>();
  let protectedText = input.plainText;
  const protect = (value: string, prefix: string) => {
    if (!value) return;
    const marker = `__${prefix}_${protectedMap.size + 1}__`;
    protectedMap.set(marker, value);
    protectedText = protectedText.replace(new RegExp(escapeRegExp(value), 'g'), marker);
  };

  if (options.preservePublicRepositories !== false) {
    semantics.ownerRepoNumbers.forEach((token) => protect(token, 'GHREF'));
    semantics.repoMentions.forEach((token) => protect(token, 'GHREPO'));
  }
  semantics.issueNumbers.forEach((number) => protect(`#${number}`, 'GHNUM'));
  if (options.preservePublicUsernames !== false) {
    semantics.usernames.forEach((name) => protect(name, 'GHUSER'));
  }
  semantics.workflowStatusTokens.forEach((token) => protect(token, 'GHSTATUS'));

  const result = redactSensitiveEntities(protectedText, {
    ...metadata,
    PERSON: options.PERSON ?? true,
    EMAIL: options.EMAIL ?? true,
    PHONE: options.PHONE ?? true,
    ORG: options.ORG ?? false,
    ADDRESS: options.ADDRESS ?? true,
    ID: options.ID ?? false,
    PAYMENT: options.PAYMENT ?? true,
    SECRET: options.SECRET ?? true,
  });

  let redactedText = result.redactedText;
  for (const [marker, original] of protectedMap.entries()) {
    redactedText = redactedText.replace(new RegExp(escapeRegExp(marker), 'g'), original);
  }

  const combinedMap = [...result.redactionMap];

  if (options.preservePublicUsernames === false) {
    const recipientHeader = input.headers?.['x-github-recipient'];
    const headerRecipients = Array.isArray(recipientHeader)
      ? recipientHeader
      : typeof recipientHeader === 'string'
        ? [recipientHeader]
        : [];
    const usernames = Array.from(new Set([
      ...semantics.usernames,
      ...headerRecipients.map((value) => value.trim()).filter(Boolean),
    ]));

    const usernameCandidates = normalizePlaceholderAssignment(
      mergeOverlappingEntities(collectGithubUsernameCandidates(redactedText, usernames))
    );
    const usernameResult = applyAssignedEntities(redactedText, usernameCandidates);
    redactedText = usernameResult.redactedText;

    for (const entry of usernameResult.redactionMap) {
      if (!combinedMap.some((item) => item.placeholder === entry.placeholder && item.original === entry.original)) {
        combinedMap.push(entry);
      }
    }
  }

  const repoMasking = optionalRepoMasking(redactedText, semantics, options);
  const redactedAttachments = redactGithubAttachmentMetadata(input.attachments, combinedMap, options);
  return {
    redactedText: repoMasking.text,
    redactionMap: [...combinedMap, ...repoMasking.entries],
    entities: result.entities,
    preservedGithubSemantics: semantics,
    redactedAttachments,
  };
}
