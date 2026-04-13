import { coerceMailHistoryRange, type MailHistoryRange } from '../../shared/mailSyncSettings';

export const MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY = 'mail_auto_fetch_interval_minutes' as const;
export const MAIL_FETCH_HISTORY_RANGE_SETTING_KEY = 'mail_fetch_history_range' as const;
export const AI_LOOKBACK_SETTING_KEY = 'ai_lookback' as const;

export interface RawMailSettingsSnapshot {
  aiLookback?: string | null;
  mailAutoFetchIntervalMinutes?: string | null;
  mailFetchHistoryRange?: string | null;
}

export interface NormalizedMailSettingsSnapshot {
  aiLookback: string | null;
  mailAutoFetchIntervalMinutes: number;
  mailFetchHistoryRange: MailHistoryRange;
}

export function normalizeMailSettingsSnapshot(input: RawMailSettingsSnapshot): NormalizedMailSettingsSnapshot {
  const parsedInterval = Number(input.mailAutoFetchIntervalMinutes);

  return {
    aiLookback: input.aiLookback ?? null,
    mailAutoFetchIntervalMinutes: Number.isFinite(parsedInterval) ? parsedInterval : 0,
    mailFetchHistoryRange: coerceMailHistoryRange(input.mailFetchHistoryRange),
  };
}
