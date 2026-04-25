import { coerceMailCacheRange, coerceMailHistoryRange, type MailCacheRange, type MailHistoryRange } from '../../shared/mailSyncSettings';

export const MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY = 'mail_auto_fetch_interval_minutes' as const;
export const MAIL_FETCH_HISTORY_RANGE_SETTING_KEY = 'mail_fetch_history_range' as const;
export const MAIL_CACHE_RANGE_SETTING_KEY = 'mail_cache_range' as const;
export const AI_LOOKBACK_SETTING_KEY = 'ai_lookback' as const;
export const GITHUB_NOTIFICATIONS_VIEW_ENABLED_SETTING_KEY = 'github_notifications_view_enabled' as const;

export interface RawMailSettingsSnapshot {
  aiLookback?: string | null;
  mailAutoFetchIntervalMinutes?: string | null;
  mailFetchHistoryRange?: string | null;
  mailCacheRange?: string | null;
  githubNotificationsViewEnabled?: string | null;
}

export interface NormalizedMailSettingsSnapshot {
  aiLookback: string | null;
  mailAutoFetchIntervalMinutes: number;
  mailFetchHistoryRange: MailHistoryRange;
  mailCacheRange: MailCacheRange;
  githubNotificationsViewEnabled: boolean;
}

export function normalizeMailSettingsSnapshot(input: RawMailSettingsSnapshot): NormalizedMailSettingsSnapshot {
  const parsedInterval = Number(input.mailAutoFetchIntervalMinutes);
  const githubNotificationsViewEnabled = input.githubNotificationsViewEnabled == null
    ? true
    : input.githubNotificationsViewEnabled === 'true';

  return {
    aiLookback: input.aiLookback ?? null,
    mailAutoFetchIntervalMinutes: Number.isFinite(parsedInterval) ? parsedInterval : 0,
    mailFetchHistoryRange: coerceMailHistoryRange(input.mailFetchHistoryRange),
    mailCacheRange: coerceMailCacheRange(input.mailCacheRange),
    githubNotificationsViewEnabled,
  };
}
