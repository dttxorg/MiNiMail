export type ContactKnowledgeMailLike = {
  id: string;
  accountId: number;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  date: string | Date;
  snippet?: string;
  bodyText?: string;
  bodyHtml?: string;
  folder?: string;
  deliveryState?: string;
};

export type ContactKnowledgeChunkKind = 'message_body' | 'sent_message' | 'draft' | 'scheduled_sent';
export type ContactKnowledgeMailDirection = 'inbound' | 'outbound' | 'mixed';

export type ContactKnowledgeChunkInput = {
  mailId: string;
  subject: string;
  date: string | Date;
  text: string;
  direction?: ContactKnowledgeMailDirection;
  chunkKind?: ContactKnowledgeChunkKind;
};

export type ContactKnowledgeChunk = {
  id: string;
  mailId: string;
  subject: string;
  date: string;
  text: string;
  tokenEstimate: number;
  contentHash: string;
  direction: ContactKnowledgeMailDirection;
  chunkKind: ContactKnowledgeChunkKind;
  searchTerms: string;
  languageHint: ContactKnowledgeLanguageHint;
};

export type ContactKnowledgeLanguageHint = 'zh' | 'ja' | 'ko' | 'latin' | 'mixed' | 'unknown';
export type ContactWikiConfidenceLevel = 'low' | 'medium' | 'high';

function stripDisplayName(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
}

export function splitContactAddresses(value?: string | null): string[] {
  return (value || '')
    .split(',')
    .map(stripDisplayName)
    .filter((address) => /@/.test(address));
}

export function normalizeContactEmail(value: string): string {
  return stripDisplayName(value);
}

export function mailMatchesContact(
  mail: Pick<ContactKnowledgeMailLike, 'accountId' | 'from' | 'to'>,
  accountId: number,
  contactEmail: string,
): boolean {
  if (mail.accountId !== accountId) return false;
  const normalizedContact = normalizeContactEmail(contactEmail);
  if (!normalizedContact) return false;
  return [
    ...splitContactAddresses(mail.from),
    ...splitContactAddresses(mail.to),
  ].includes(normalizedContact);
}

export function normalizeContactAliases(contactEmail: string, aliases: string[] = []): string[] {
  return Array.from(new Set([contactEmail, ...aliases].map(normalizeContactEmail).filter(Boolean)));
}

export function mailMatchesAnyContact(
  mail: Pick<ContactKnowledgeMailLike, 'accountId' | 'from' | 'to'>,
  accountId: number,
  contactEmail: string,
  aliases: string[] = [],
): boolean {
  return normalizeContactAliases(contactEmail, aliases).some((email) => mailMatchesContact(mail, accountId, email));
}

export function inferContactMailDirection(
  mail: Pick<ContactKnowledgeMailLike, 'from' | 'to'>,
  contactEmail: string,
  aliases: string[] = [],
): ContactKnowledgeMailDirection {
  const contacts = new Set(normalizeContactAliases(contactEmail, aliases));
  const fromMatches = splitContactAddresses(mail.from).some((address) => contacts.has(address));
  const toMatches = splitContactAddresses(mail.to).some((address) => contacts.has(address));
  if (fromMatches && toMatches) return 'mixed';
  return fromMatches ? 'inbound' : 'outbound';
}

export function inferContactChunkKind(
  mail: Pick<ContactKnowledgeMailLike, 'folder' | 'deliveryState'>,
  direction: ContactKnowledgeMailDirection,
): ContactKnowledgeChunkKind {
  const folder = (mail.folder || '').toLowerCase();
  if (mail.deliveryState === 'scheduled' || mail.deliveryState === 'sending') return 'draft';
  if (mail.deliveryState === 'sent' || folder.includes('sent')) return 'sent_message';
  if (folder.includes('draft') || mail.deliveryState === 'cancelled') return 'draft';
  if (direction === 'outbound') return 'sent_message';
  return 'message_body';
}

export function stableContactKnowledgeHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function uniqueLimited(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

export function inferContactKnowledgeLanguageHint(value: string): ContactKnowledgeLanguageHint {
  const sample = value.slice(0, 6000);
  const zh = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
  const ja = (sample.match(/[\u3040-\u30ff]/g) || []).length;
  const ko = (sample.match(/[\uac00-\ud7af]/g) || []).length;
  const latin = (sample.match(/[a-z]/gi) || []).length;
  const active = [zh, ja, ko, latin].filter((count) => count >= 12).length;
  if (active > 1) return 'mixed';
  if (zh >= 8) return 'zh';
  if (ja >= 8) return 'ja';
  if (ko >= 8) return 'ko';
  if (latin >= 12) return 'latin';
  return 'unknown';
}

export function buildContactKnowledgeSearchTerms(value: string): string {
  const normalized = value.toLowerCase().replace(/https?:\/\/\S+/g, ' ');
  const latinTokens = normalized
    .replace(/[^\p{L}\p{N}@._-]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && token.length <= 64);
  const domains = Array.from(normalized.matchAll(/\b[a-z0-9.-]+\.[a-z]{2,}\b/g)).map((match) => match[0]);
  const cjkRuns = normalized.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g) || [];
  const cjkTerms: string[] = [];
  for (const run of cjkRuns) {
    if (run.length <= 2) {
      cjkTerms.push(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      cjkTerms.push(run.slice(index, Math.min(run.length, index + 3)));
    }
  }
  return uniqueLimited([...latinTokens, ...domains, ...cjkTerms], 220).join(' ');
}

export function searchTermOverlapScore(query: string, searchTerms: string): number {
  const queryTerms = new Set(buildContactKnowledgeSearchTerms(query).split(/\s+/).filter(Boolean));
  if (queryTerms.size === 0) return 0;
  const candidateTerms = new Set(searchTerms.split(/\s+/).filter(Boolean));
  let hits = 0;
  for (const term of queryTerms) {
    if (candidateTerms.has(term)) hits += 1;
  }
  return hits / queryTerms.size;
}

function htmlToText(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function cleanContactKnowledgeText(mail: Pick<ContactKnowledgeMailLike, 'bodyText' | 'bodyHtml' | 'snippet'>): string {
  const source = mail.bodyText?.trim() || htmlToText(mail.bodyHtml).trim() || mail.snippet || '';
  const lines = source
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^>/.test(line)) continue;
    if (/^on .+ wrote:$/i.test(line)) break;
    if (/^from:\s|^sent:\s|^to:\s|^subject:\s/i.test(line)) continue;
    if (/unsubscribe|manage preferences|confidentiality notice|this email and any attachments/i.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function isLowValueMarketingEvidenceLine(line: string): boolean {
  const normalized = line.replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  if (/^\[?https?:\/\/\S+\.(?:png|jpe?g|gif|svg|webp)(?:[?#]\S*)?\]?$/i.test(normalized)) return true;
  if (/unsubscribe|manage preferences|view (?:this )?email|privacy policy|terms of use|contact us|follow us/i.test(normalized)) return true;
  if (/^(shop now|buy now|learn more|read more|explore more|get started|watch now|see more|try now|download now|claim offer)$/i.test(normalized)) return true;
  if (/^(立即|马上|了解更多|探索更多|查看详情|点击查看|开始使用|去看看|立即购买|立即下载|现在购买)$/.test(normalized)) return true;
  const hasDecisionSignal = /[$€£]\s?\d|\d{1,3}(?:\.\d+)?\s*%|\b(?:new|launch(?:ed)?|released|added|introducing|update[ds]?|upgrade|integration|available|coming soon|deadline|expires?|until|ends?|pricing|plan|policy|statement|invoice|receipt|security|verification|transaction|billing|pro\+?)\b|新增|上线|发布|更新|变更|调整|截止|到期|限时|价格|折扣|优惠|账单|结单|发票|验证|交易|安全|政策|集成|上新|新功能|即将推出/i.test(normalized);
  if (hasDecisionSignal) return false;
  if (normalized.length <= 36) return true;
  if (/^[^\d。.!?！？]{1,80}[!！]?$/.test(normalized) && /(?:探索|直面|精彩|巅峰|大展身手|不容错过|全新体验|更多精彩|discover|explore|ultimate|amazing|fear|ready|time to)/i.test(normalized)) return true;
  return false;
}

export function redactContactKnowledgeEvidenceText(value: string): string {
  return value
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]');
}

export function isForumRelayBoilerplateLine(line: string): boolean {
  const normalized = line.replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  if (/^\[?https?:\/\/\S+/i.test(normalized)) return true;
  if (/\[url\]/i.test(normalized) && /(?:访问话题|訪問話題|visit|topic|unsubscribe|退订|退訂|取消订阅|取消訂閱)/i.test(normalized)) return true;
  if (/^\[?(?:访问话题|訪問話題|查看话题|查看話題|visit the topic|view topic|read full topic)\]?/i.test(normalized)) return true;
  if (/回复此电子邮件以进行回复|回覆此電子郵件以進行回覆|reply to this email to respond|reply by email/i.test(normalized)) return true;
  if (/要退订这些电子邮件|要退訂這些電子郵件|unsubscribe from these emails|unsubscribe|manage preferences/i.test(normalized)) return true;
  if (/^(?:显示远程图片|顯示遠端圖片|remote images blocked|show remote images)$/i.test(normalized)) return true;
  if (/^(?:发件人|寄件者|收件人|寄送時間|发送时间|sent|from|to):/i.test(normalized)) return true;
  if (/^\[[^\]]*(?:论坛|論壇|forum|community)[^\]]*\]\s*\[[^\]]+\]/i.test(normalized)) return true;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*\|\s*\[[^\]]*(?:论坛|論壇|forum|community)[^\]]*\]/i.test(normalized)) return true;
  return false;
}

export function hasForumRelayContext(value: string): boolean {
  const normalized = redactContactKnowledgeEvidenceText(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (/\b(?:discourse|forums?)\b|论坛|論壇|小众软件官方论坛/i.test(normalized)) {
    return true;
  }
  if (/\bcommunity\b/i.test(normalized) && /\b(?:discussion|reply|replied|post|comment|topic|thread|forum)\b/i.test(normalized)) {
    return true;
  }
  if (/\b(?:visit|view|read)\s+(?:the\s+)?topic\b|访问话题|訪問話題|查看话题|查看話題/i.test(normalized)) {
    return true;
  }
  if (/(?:回复此电子邮件|回覆此電子郵件|reply to this email|reply by email)/i.test(normalized)
    && /\b(?:discourse|forums?|visit\s+(?:the\s+)?topic|view\s+(?:the\s+)?topic|read\s+(?:the\s+)?topic|unsubscribe from these emails)\b|论坛|論壇|访问话题|訪問話題|退订这些电子邮件|退訂這些電子郵件/i.test(normalized)) {
    return true;
  }
  return false;
}

export function extractJsonObjectPayload(value: string): string | null {
  const text = value
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

export function isForumFeedbackEvidenceLine(line: string): boolean {
  const normalized = redactContactKnowledgeEvidenceText(line).replace(/\s+/g, ' ').trim();
  if (!normalized || isForumRelayBoilerplateLine(normalized)) return false;
  if (normalized.length < 8) return false;
  if (/^\[[^\]]+\]\(\[url\]\)$/i.test(normalized)) return false;
  return /(?:体验|體驗|使用|感觉|感覺|认为|認為|相当于|相當於|框架|毛坯|基础|基礎|初步|安装|安裝|试用|試用|找不到|没找到|沒找到|没有|沒有|没看到|沒看到|缺少|缺失|希望|建议|建議|可以|应该|應該|参考|參考|对标|對標|功能|效率|模板|範本|信纸|信紙|签名|簽名|定期发送|定時發送|快捷操作|快捷|问题|問題|反馈|反饋|experience|feels?|cannot find|could not find|missing|lack|should|suggest|recommend|feedback|feature|template|signature|scheduled send|quick action|(?:tried|tested|installed|used).{0,60}(?:app|product|client|tool|software|feature|install|use|experience|setup))/i.test(normalized);
}

function targetIsChinese(value: string): boolean {
  return /chinese|zh|中文|繁體|简体|繁体/i.test(value);
}

function compactForumSignal(value: string, maxLength = 180): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function collectForumFeatures(lines: string[]): string[] {
  const featureMap: Array<[string, RegExp]> = [
    ['信纸模板', /信纸|信紙|stationery|template/i],
    ['快捷操作', /快捷操作|quick action|shortcut/i],
    ['签名', /签名|簽名|signature/i],
    ['定期发送', /定期发送|定時發送|scheduled send/i],
    ['基础邮件功能', /基础功能|基礎功能|邮件功能|郵件功能/i],
  ];
  const found: string[] = [];
  const joined = lines.join('\n');
  for (const [label, pattern] of featureMap) {
    if (pattern.test(joined) && !found.includes(label)) found.push(label);
  }
  return found;
}

export function extractForumFeedbackSignals(
  chunks: Array<Pick<ContactKnowledgeChunk, 'subject' | 'text' | 'date'>>,
  targetLang = 'English',
  limit = 5,
): string[] {
  const context = chunks.map((chunk) => `${chunk.subject || ''}\n${chunk.text || ''}`).join('\n');
  if (!hasForumRelayContext(context)) {
    return [];
  }
  const evidenceLines: string[] = [];
  const seenLines = new Set<string>();
  for (const chunk of chunks) {
    const rawLines = (chunk.text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => redactContactKnowledgeEvidenceText(line).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    for (const line of rawLines) {
      if (!isForumFeedbackEvidenceLine(line)) continue;
      const key = line.toLowerCase();
      if (seenLines.has(key)) continue;
      seenLines.add(key);
      evidenceLines.push(line);
      if (evidenceLines.length >= 18) break;
    }
    if (evidenceLines.length >= 18) break;
  }

  if (evidenceLines.length === 0) return [];
  const zh = targetIsChinese(targetLang);
  const rows: string[] = [];
  const joined = evidenceLines.join('\n');
  const features = collectForumFeatures(evidenceLines);
  const hasMaturityFeedback = /框架|毛坯|基础|基礎|初步|只花了?\d*分钟|只花了?\d*分鐘|体验|體驗|experience|tried/i.test(joined);
  const mentionsAi = /\bAI\b|Ai|人工智能|大模型/i.test(joined);
  const mentionsFoxmail = /foxmail/i.test(joined);
  const mentionsOutlook = /outlook/i.test(joined);

  if (hasMaturityFeedback) {
    rows.push(zh
      ? `初体验反馈：认为产品仍偏早期${mentionsAi ? '，AI 已接入但' : '，'}基础邮件体验还不完整。`
      : `Early-use feedback: the product feels early-stage${mentionsAi ? ' with AI present but' : ' and'} the core email experience is still incomplete.`);
  }
  if (features.length > 0) {
    rows.push(zh
      ? `功能缺口：找不到或缺少 ${features.join('、')}。`
      : `Missing-feature feedback: users could not find or still need ${features.join(', ')}.`);
  }
  if (mentionsFoxmail || /建议|建議|参考|參考|对标|對標|suggest|recommend/i.test(joined)) {
    rows.push(zh
      ? `建议：优先补齐基础邮件客户端能力${mentionsFoxmail ? '，可参考 Foxmail' : ''}${mentionsOutlook ? '，不必优先对标 Outlook' : ''}。`
      : `Suggestion: prioritize core email-client capabilities${mentionsFoxmail ? ' and use Foxmail as a reference' : ''}${mentionsOutlook ? ' instead of prioritizing Outlook parity' : ''}.`);
  }

  for (const line of evidenceLines) {
    if (rows.length >= limit) break;
    const candidate = zh ? `正文反馈：${line}` : `Body feedback: ${line}`;
    rows.push(candidate);
  }

  const seen = new Set<string>();
  return rows
    .map((row) => compactForumSignal(row))
    .filter((row) => {
      const key = row.toLowerCase();
      if (!row || seen.has(key) || isForumRelayBoilerplateLine(row)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function cleanScenarioEvidenceText(value: string): string {
  return value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isLowValueMarketingEvidenceLine(line) && !isForumRelayBoilerplateLine(line))
    .map(redactContactKnowledgeEvidenceText)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildContactKnowledgeChunks(
  inputs: ContactKnowledgeChunkInput[],
  options: { maxChars?: number; overlapChars?: number } = {},
): ContactKnowledgeChunk[] {
  const maxChars = Math.max(800, options.maxChars ?? 1800);
  const overlapChars = Math.max(0, Math.min(300, options.overlapChars ?? 160));
  const chunks: ContactKnowledgeChunk[] = [];

  for (const input of inputs) {
    const text = input.text.trim();
    if (!text) continue;
    let start = 0;
    let index = 0;
    while (start < text.length) {
      const end = Math.min(text.length, start + maxChars);
      const chunkText = text.slice(start, end).trim();
      if (chunkText) {
        chunks.push({
          id: `${input.mailId}:${index}`,
          mailId: input.mailId,
          subject: input.subject,
          date: new Date(input.date).toISOString(),
          text: chunkText,
          tokenEstimate: Math.ceil(chunkText.length / 4),
          contentHash: stableContactKnowledgeHash([
            input.subject,
            new Date(input.date).toISOString(),
            input.direction || 'inbound',
            input.chunkKind || 'message_body',
            chunkText,
          ].join('\n')),
          direction: input.direction || 'inbound',
          chunkKind: input.chunkKind || 'message_body',
          searchTerms: buildContactKnowledgeSearchTerms(`${input.subject}\n${chunkText}`),
          languageHint: inferContactKnowledgeLanguageHint(`${input.subject}\n${chunkText}`),
        });
      }
      if (end >= text.length) break;
      start = Math.max(end - overlapChars, start + 1);
      index += 1;
    }
  }

  return chunks;
}

function tokenizeForKeywordScore(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}_@.-]+/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 80);
}

export function keywordOverlapScore(query: string, candidate: string): number {
  const queryTokens = new Set(tokenizeForKeywordScore(query));
  if (queryTokens.size === 0) return 0;
  const candidateTokens = new Set(tokenizeForKeywordScore(candidate));
  let hits = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) hits += 1;
  }
  return hits / queryTokens.size;
}

export function recencyScore(date: string | Date, now: Date = new Date()): number {
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return 0;
  const ageDays = Math.max(0, (now.getTime() - time) / 86_400_000);
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.75;
  if (ageDays <= 90) return 0.45;
  if (ageDays <= 365) return 0.2;
  return 0.05;
}

export function hybridContactChunkScore(input: {
  vectorScore: number;
  keywordScore: number;
  searchTermScore?: number;
  date: string | Date;
  subject: string;
  querySubject?: string;
  direction?: ContactKnowledgeMailDirection;
  chunkKind?: ContactKnowledgeChunkKind;
}): number {
  const sameSubjectBoost = input.querySubject
    && input.subject
    && keywordOverlapScore(input.querySubject, input.subject) >= 0.5
    ? 0.18
    : 0;
  const directionBoost = input.direction === 'inbound' ? 0.04 : 0.02;
  const kindBoost = input.chunkKind === 'sent_message' ? 0.05 : input.chunkKind === 'draft' ? 0.03 : 0;
  return (
    input.vectorScore * 0.54
    + input.keywordScore * 0.24
    + (input.searchTermScore || 0) * 0.10
    + recencyScore(input.date) * 0.12
    + sameSubjectBoost
    + directionBoost
    + kindBoost
  );
}

export function calculateContactWikiConfidence(input: {
  sourceMailCount: number;
  timespanDays: number;
  latestEvidenceAt?: string | Date | null;
  behaviorSampleCount?: number;
  usefulFeedbackCount?: number;
  negativeFeedbackCount?: number;
  languageCoverage?: number;
}, now: Date = new Date()): number {
  const mailFactor = Math.min(1, Math.max(0, input.sourceMailCount) / 30);
  const timespanFactor = Math.min(1, Math.max(0, input.timespanDays) / 90);
  const recentFactor = input.latestEvidenceAt ? recencyScore(input.latestEvidenceAt, now) : 0;
  const behaviorFactor = Math.min(1, Math.max(0, input.behaviorSampleCount || 0) / 20);
  const positive = Math.max(0, input.usefulFeedbackCount || 0);
  const negative = Math.max(0, input.negativeFeedbackCount || 0);
  const feedbackFactor = positive + negative === 0 ? 0.5 : positive / (positive + negative);
  const languageFactor = Math.min(1, Math.max(0, input.languageCoverage ?? 0.5));
  const score = (
    mailFactor * 0.20
    + timespanFactor * 0.15
    + recentFactor * 0.15
    + behaviorFactor * 0.20
    + feedbackFactor * 0.20
    + languageFactor * 0.10
  );
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

export function contactWikiConfidenceLevel(score: number): ContactWikiConfidenceLevel {
  if (score < 0.45) return 'low';
  if (score < 0.75) return 'medium';
  return 'high';
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}
