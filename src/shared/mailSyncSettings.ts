export type MailHistoryRange = '7d' | '15d' | '1mo' | '6mo' | '1y' | 'all';
export type MailCacheRange = '3d' | '7d' | '1mo' | '6mo' | 'all';
export type BodyCacheStage = '3d' | MailHistoryRange;

export const MAIL_HISTORY_RANGE_VALUES = ['7d', '15d', '1mo', '6mo', '1y', 'all'] as const satisfies readonly MailHistoryRange[];
export const MAIL_CACHE_RANGE_VALUES = ['3d', '7d', '1mo', '6mo', 'all'] as const satisfies readonly MailCacheRange[];
const HISTORY_STAGE_ORDER = ['7d', '15d', '1mo', '6mo', '1y', 'all'] as const satisfies readonly MailHistoryRange[];
const BODY_CACHE_STAGE_ORDER = ['3d', '7d', '15d', '1mo', '6mo', '1y', 'all'] as const satisfies readonly BodyCacheStage[];
const CACHE_RANGE_HISTORY_LIMITS: Record<Exclude<MailCacheRange, 'all'>, MailHistoryRange> = {
  '3d': '7d',
  '7d': '7d',
  '1mo': '1mo',
  '6mo': '6mo',
};

const MAIL_HISTORY_RANGE_TO_MS: Record<Exclude<MailHistoryRange, 'all'>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '15d': 15 * 24 * 60 * 60 * 1000,
  '1mo': 30 * 24 * 60 * 60 * 1000,
  '6mo': 6 * 30 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

const MAIL_CACHE_RANGE_TO_MS: Record<Exclude<MailCacheRange, 'all'>, number> = {
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '1mo': 30 * 24 * 60 * 60 * 1000,
  '6mo': 6 * 30 * 24 * 60 * 60 * 1000,
};

export interface MailSyncSettings {
  mailFetchHistoryRange: MailHistoryRange;
  mailCacheRange: MailCacheRange;
  autoFetchIntervalMinutes: number;
}

export function coerceMailHistoryRange(value?: string | null): MailHistoryRange {
  return MAIL_HISTORY_RANGE_VALUES.includes(value as MailHistoryRange)
    ? (value as MailHistoryRange)
    : '1mo';
}

export function mailHistoryRangeToMs(range: MailHistoryRange): number | null {
  if (range === 'all') return null;
  return MAIL_HISTORY_RANGE_TO_MS[range];
}

export function coerceMailCacheRange(value?: string | null): MailCacheRange {
  return MAIL_CACHE_RANGE_VALUES.includes(value as MailCacheRange)
    ? (value as MailCacheRange)
    : '1mo';
}

export function mailCacheRangeToMs(range: MailCacheRange): number | null {
  if (range === 'all') return null;
  return MAIL_CACHE_RANGE_TO_MS[range];
}

export function shouldUseHistoryRange(cachedCount: number, forceHistoryRange: boolean = false): boolean {
  if (forceHistoryRange) return true;
  return cachedCount <= 0;
}

export function buildHistoryStages(range: MailHistoryRange): MailHistoryRange[] {
  const index = HISTORY_STAGE_ORDER.indexOf(range);
  if (index === -1) return ['1mo'];
  return HISTORY_STAGE_ORDER.slice(0, index + 1) as MailHistoryRange[];
}

export function clampHistoryRangeToCacheRange(
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
): MailHistoryRange {
  if (cacheRange === 'all') return historyRange;

  const historyIndex = HISTORY_STAGE_ORDER.indexOf(historyRange);
  const cacheLimitIndex = HISTORY_STAGE_ORDER.indexOf(CACHE_RANGE_HISTORY_LIMITS[cacheRange]);

  if (historyIndex === -1 || cacheLimitIndex === -1) return historyRange;
  return HISTORY_STAGE_ORDER[Math.min(historyIndex, cacheLimitIndex)];
}

export function buildBodyCacheStages(
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
): BodyCacheStage[] {
  const effectiveHistoryRange = clampHistoryRangeToCacheRange(historyRange, cacheRange);
  const maxStage: BodyCacheStage = effectiveHistoryRange === '7d' && cacheRange === '3d'
    ? '3d'
    : effectiveHistoryRange;

  const index = BODY_CACHE_STAGE_ORDER.indexOf(maxStage);
  if (index === -1) return ['3d', '7d', '15d', '1mo'];
  return BODY_CACHE_STAGE_ORDER.slice(0, index + 1) as BodyCacheStage[];
}
