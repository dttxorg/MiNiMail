import { buildBodyCacheStages, type BodyCacheStage, type MailCacheRange, type MailHistoryRange } from '../../shared/mailSyncSettings';

type BodyCacheCandidateMail = {
  id: string;
  uid: number;
  accountId: number;
  folder: string;
  date: Date;
};

const BODY_CACHE_STAGE_TO_MS: Record<Exclude<BodyCacheStage, 'all'>, number> = {
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '15d': 15 * 24 * 60 * 60 * 1000,
  '1mo': 30 * 24 * 60 * 60 * 1000,
  '6mo': 6 * 30 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

export function pickBodyPrefetchCandidates<T extends BodyCacheCandidateMail>(
  mails: T[],
  options: {
    historyRange: MailHistoryRange;
    cacheRange: MailCacheRange;
    limit?: number;
    now?: number;
  },
): T[] {
  const stages = buildBodyCacheStages(options.historyRange, options.cacheRange);
  const effectiveStage = stages.length > 0 ? stages[stages.length - 1] : '3d';
  const now = options.now ?? Date.now();
  const seenKeys = new Set<string>();
  const cutoffMs = effectiveStage === 'all' ? null : BODY_CACHE_STAGE_TO_MS[effectiveStage as Exclude<BodyCacheStage, 'all'>];

  const filtered = [...mails]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .filter((mail) => {
      const key = `${mail.accountId}:${mail.folder}:${mail.uid}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);

      if (cutoffMs == null) return true;
      return mail.date.getTime() >= now - cutoffMs;
    });

  return typeof options.limit === 'number'
    ? filtered.slice(0, options.limit)
    : filtered;
}
