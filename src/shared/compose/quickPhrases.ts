export const COMPOSE_QUICK_PHRASES_SETTING_KEY = 'compose_quick_phrases_v1';

export type ComposeQuickPhraseSettings = {
  version: 1;
  phrases: ComposeQuickPhrase[];
};

export type ComposeQuickPhrase = {
  id: string;
  title: string;
  text: string;
  tags: string[];
  updatedAt: string;
};

export type ComposeQuickPhraseInput = {
  id?: string;
  title?: string;
  text: string;
  tags?: string[] | string;
  updatedAt?: string;
};

export type ComposeTextInsertion = {
  body: string;
  cursor: number;
};

export function createEmptyComposeQuickPhraseSettings(): ComposeQuickPhraseSettings {
  return {
    version: 1,
    phrases: [],
  };
}

export function normalizeQuickPhraseText(text: string): string {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

function normalizeQuickPhraseTitle(title: string): string {
  return String(title || '').replace(/\s+/g, ' ').trim();
}

function generateQuickPhraseTitle(text: string): string {
  const compact = normalizeQuickPhraseTitle(text);
  if (!compact) return 'Quick phrase';
  return compact.length > 32 ? `${compact.slice(0, 32).trimEnd()}...` : compact;
}

function normalizeQuickPhraseTags(tags: string[] | string | undefined): string[] {
  const rawTags = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of rawTags) {
    const value = normalizeQuickPhraseTitle(tag);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

function normalizeQuickPhraseId(id: string | undefined): string {
  return String(id || '').trim();
}

function createQuickPhraseId(): string {
  return `phrase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseComposeQuickPhraseSettings(raw: string | null | undefined): ComposeQuickPhraseSettings {
  if (!raw) return createEmptyComposeQuickPhraseSettings();

  try {
    const parsed = JSON.parse(raw) as Partial<ComposeQuickPhraseSettings> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.phrases)) {
      return createEmptyComposeQuickPhraseSettings();
    }

    const seenIds = new Set<string>();
    const seenTexts = new Set<string>();
    const phrases: ComposeQuickPhrase[] = [];

    for (const phrase of parsed.phrases) {
      if (!phrase || typeof phrase !== 'object') continue;
      const text = normalizeQuickPhraseText((phrase as Partial<ComposeQuickPhrase>).text || '');
      if (!text) continue;

      const id = normalizeQuickPhraseId((phrase as Partial<ComposeQuickPhrase>).id);
      if (!id || seenIds.has(id)) continue;

      const textKey = text.toLowerCase();
      if (seenTexts.has(textKey)) continue;
      seenIds.add(id);
      seenTexts.add(textKey);

      const title = normalizeQuickPhraseTitle((phrase as Partial<ComposeQuickPhrase>).title || '')
        || generateQuickPhraseTitle(text);
      phrases.push({
        id,
        title,
        text,
        tags: normalizeQuickPhraseTags((phrase as Partial<ComposeQuickPhrase>).tags),
        updatedAt: String((phrase as Partial<ComposeQuickPhrase>).updatedAt || ''),
      });
    }

    return { version: 1, phrases };
  } catch {
    return createEmptyComposeQuickPhraseSettings();
  }
}

export function serializeComposeQuickPhraseSettings(settings: ComposeQuickPhraseSettings): string {
  return JSON.stringify({
    version: 1,
    phrases: (settings.phrases || []).map((phrase) => ({
      id: phrase.id,
      title: normalizeQuickPhraseTitle(phrase.title) || generateQuickPhraseTitle(phrase.text),
      text: normalizeQuickPhraseText(phrase.text),
      tags: normalizeQuickPhraseTags(phrase.tags),
      updatedAt: phrase.updatedAt,
    })).filter((phrase) => phrase.id && phrase.text),
  } satisfies ComposeQuickPhraseSettings);
}

export function upsertComposeQuickPhrase(
  settings: ComposeQuickPhraseSettings | null | undefined,
  input: ComposeQuickPhraseInput,
  updatedAt = new Date().toISOString(),
): ComposeQuickPhraseSettings {
  const text = normalizeQuickPhraseText(input.text);
  if (!text) {
    throw new Error('Quick phrase text is required.');
  }

  const phrases = [...(settings || createEmptyComposeQuickPhraseSettings()).phrases];
  const inputId = normalizeQuickPhraseId(input.id);
  const duplicateTextIndex = phrases.findIndex((phrase) =>
    normalizeQuickPhraseText(phrase.text).toLowerCase() === text.toLowerCase()
  );
  const existingIndex = inputId
    ? phrases.findIndex((phrase) => phrase.id === inputId)
    : duplicateTextIndex;
  const existing = existingIndex >= 0 ? phrases[existingIndex] : null;

  const nextPhrase: ComposeQuickPhrase = {
    id: existing?.id || inputId || createQuickPhraseId(),
    title: normalizeQuickPhraseTitle(input.title || '') || generateQuickPhraseTitle(text),
    text,
    tags: normalizeQuickPhraseTags(input.tags),
    updatedAt: input.updatedAt || updatedAt,
  };

  if (existingIndex >= 0) {
    phrases[existingIndex] = nextPhrase;
  } else {
    phrases.push(nextPhrase);
  }

  return { version: 1, phrases };
}

export function deleteComposeQuickPhrase(
  settings: ComposeQuickPhraseSettings | null | undefined,
  id: string,
): ComposeQuickPhraseSettings {
  const targetId = normalizeQuickPhraseId(id);
  return {
    version: 1,
    phrases: (settings || createEmptyComposeQuickPhraseSettings()).phrases
      .filter((phrase) => phrase.id !== targetId),
  };
}

export function insertTextAtSelection(
  body: string,
  text: string,
  start: number,
  end: number,
): ComposeTextInsertion {
  const source = String(body || '');
  const safeStart = Number.isFinite(start) ? Math.max(0, Math.min(source.length, Math.floor(start))) : source.length;
  const safeEnd = Number.isFinite(end) ? Math.max(safeStart, Math.min(source.length, Math.floor(end))) : safeStart;
  const suffix = source.slice(safeEnd);
  const isBeforeSignature = /^\n{0,3}-- \n/.test(suffix);
  const insertion = isBeforeSignature
    ? String(text || '').replace(/\r\n/g, '\n').replace(/\s*$/, '\n\n')
    : String(text || '').replace(/\r\n/g, '\n');
  const nextSuffix = isBeforeSignature ? suffix.replace(/^\n{1,3}/, '') : suffix;
  const nextBody = `${source.slice(0, safeStart)}${insertion}${nextSuffix}`;
  return {
    body: nextBody,
    cursor: safeStart + insertion.length,
  };
}
