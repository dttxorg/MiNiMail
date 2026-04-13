export type MailHistoryRange = '7d' | '15d' | '1mo' | '6mo' | '1y' | 'all';

export const MAIL_HISTORY_RANGE_VALUES = ['7d', '15d', '1mo', '6mo', '1y', 'all'] as const satisfies readonly MailHistoryRange[];

const MAIL_HISTORY_RANGE_TO_MS: Record<Exclude<MailHistoryRange, 'all'>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '15d': 15 * 24 * 60 * 60 * 1000,
  '1mo': 30 * 24 * 60 * 60 * 1000,
  '6mo': 6 * 30 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

export interface MailSyncSettings {
  mailFetchHistoryRange: MailHistoryRange;
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
