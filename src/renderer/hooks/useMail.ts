import { useState, useCallback, useRef } from 'react';
import type { MailHistoryRange } from '../../shared/mailSyncSettings';
import { MailCacheRefreshQueue } from '../utils/mailCacheRefreshQueue';
import { sharedMailBodyStore, type SharedMailBodyLoadResult } from '../utils/mailBodyLoader';

export interface RendererMailSummary {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  accountId: number;
  category?: string;
  isScanned?: boolean;
  scanResult?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  localSendId?: string;
  deliveryState?: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  deliveryError?: string;
  localDraftKey?: string;
  draftPayload?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: RendererMailAttachment[];
}

export interface RendererMailAttachment {
  cacheId?: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  disposition?: string;
  inline?: boolean;
  cid?: string;
  partId?: string;
  attachmentId?: string;
}

export interface RendererMailDetail extends RendererMailSummary {
  bodyHtml?: string;
  bodyText?: string;
  attachments: RendererMailAttachment[];
  headers: Record<string, string>;
  flags?: string[];
}

export type MailLoadingState = 'idle' | 'loading' | 'success' | 'error' | 'timeout';

export interface RendererMailSyncOptions {
  notify?: boolean;
  folderKind?: 'inbox' | 'other';
  historyRange?: MailHistoryRange;
  forceHistoryRange?: boolean;
}

export type LoadMailBodyFn = (
  accountId: number,
  messageUid: number,
  folder?: string,
) => Promise<SharedMailBodyLoadResult>;

function mergeDetailFromBodyResult(
  result: SharedMailBodyLoadResult,
  summaryBase: RendererMailSummary | RendererMailDetail | null,
): RendererMailDetail | null {
  const resultDetail = result.detail;

  if (!summaryBase && resultDetail) return resultDetail;
  if (!summaryBase) return null;

  return {
    ...summaryBase,
    ...resultDetail,
    bodyHtml: result.bodyHtml,
    bodyText: result.bodyText,
    folder: summaryBase.folder,
    accountId: summaryBase.accountId,
    snippet: resultDetail?.snippet ?? summaryBase.snippet,
    hasAttachments: (resultDetail?.attachments?.length || result.attachments?.length) ? true : summaryBase.hasAttachments,
    isRead: resultDetail?.flags?.includes('\\Seen') ?? summaryBase.isRead,
    isStarred: resultDetail?.flags?.includes('\\Flagged') ?? summaryBase.isStarred,
    messageId: resultDetail?.messageId ?? summaryBase.messageId,
    inReplyTo: resultDetail?.inReplyTo ?? summaryBase.inReplyTo,
    references: resultDetail?.references ?? summaryBase.references,
    attachments: resultDetail?.attachments ?? result.attachments ?? [],
    headers: resultDetail?.headers ?? {},
  };
}

function mergeMailsById(prev: RendererMailSummary[], next: RendererMailSummary[]): RendererMailSummary[] {
  if (next.length === 0) return prev;
  const byId = new Map(prev.map((mail) => [mail.id, mail]));
  for (const mail of next) {
    byId.set(mail.id, mail);
  }
  return Array.from(byId.values());
}

export function useMail() {
  const [mailList, setMailList] = useState<RendererMailSummary[]>([]);
  const [currentMail, setCurrentMail] = useState<RendererMailDetail | null>(null);
  const [mailLoadingState, setMailLoadingState] = useState<MailLoadingState>('idle');
  const [mailError, setMailError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const bodyPrefetchQueue = useRef<RendererMailSummary[]>([]).current;
  const bodyPrefetchQueuedSet = useRef(new Set<string>()).current;
  const bodyPrefetchWorkerActive = useRef(false);
  const cacheRefreshQueue = useRef(new MailCacheRefreshQueue()).current;

  const loadMailBody = useCallback<LoadMailBodyFn>(async (
    accountId: number,
    messageUid: number,
    folder: string = 'INBOX',
  ) => (
    sharedMailBodyStore.load(window.electronAPI, { accountId, uid: messageUid, folder })
  ), []);

  const refreshCachedFolder = useCallback(async (
    accountId: number,
    folder: string,
    historyRange?: MailHistoryRange,
  ) => {
    const cachedResp = await window.electronAPI.invoke('mail:loadCached', accountId, folder, historyRange) as {
      success: boolean;
      data?: RendererMailSummary[];
    };

    if (!cachedResp.success || !cachedResp.data) return;

    const allCached = cachedResp.data;
    setMailList((prev) => {
      const others = prev.filter((mail) => !(mail.accountId === accountId && mail.folder.toLowerCase() === folder.toLowerCase()));
      return [...allCached, ...others];
    });
  }, []);

  const scheduleCachedFolderRefresh = useCallback((
    accountId: number,
    folder: string,
    historyRange?: MailHistoryRange,
  ) => {
    const key = `${accountId}:${folder}:${historyRange ?? 'default'}`;
    return cacheRefreshQueue.schedule(key, () => refreshCachedFolder(accountId, folder, historyRange));
  }, [cacheRefreshQueue, refreshCachedFolder]);

  const syncMails = useCallback(async (
    accountId: number,
    folder: string = 'INBOX',
    options?: RendererMailSyncOptions,
  ) => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      const response = await window.electronAPI.invoke('mail:sync', accountId, folder, options);
      const result = response as { success: boolean; data?: { newMails: RendererMailSummary[]; totalCached: number }; error?: string };

      if (result.success && result.data) {
        const { newMails } = result.data;
        if (newMails.length > 0) {
          setMailList((prev) => mergeMailsById(prev, newMails));
        }
        return;
      }

      const errMsg = result.error || 'Sync failed';
      setSyncError(errMsg);
      await scheduleCachedFolderRefresh(accountId, folder, options?.historyRange);
    } catch (err) {
      const msg = (err as Error).message;
      setSyncError(msg);
    } finally {
      setIsSyncing(false);
    }
  }, [scheduleCachedFolderRefresh]);

  const fetchMailDetail = useCallback(async (
    accountId: number,
    messageUid: number,
    folder: string = 'INBOX',
    summary?: RendererMailSummary,
  ) => {
    if (sharedMailBodyStore.has({ accountId, uid: messageUid, folder }) && currentMail &&
        currentMail.accountId === accountId && currentMail.uid === messageUid &&
        (currentMail.bodyHtml || currentMail.bodyText)) {
      setMailLoadingState('success');
      setMailError(null);
      return;
    }

    setMailLoadingState('loading');
    setMailError(null);

    try {
      const result = await loadMailBody(accountId, messageUid, folder);
      if (result.detail || result.bodyHtml || result.bodyText) {
        const summaryBase =
          summary ??
          (currentMail && currentMail.accountId === accountId && currentMail.uid === messageUid
            ? currentMail
            : null);
        const mergedDetail = mergeDetailFromBodyResult(result, summaryBase);

        if (mergedDetail) {
          setCurrentMail(mergedDetail);
          setMailLoadingState('success');
          return;
        }
      }

      console.warn('[useMail] mail body missing after cache/IMAP lookup', {
        accountId,
        folder,
        uid: messageUid,
        selectedId: summary?.id,
        selectedMessageId: summary?.messageId,
        hasSnippet: Boolean(summary?.snippet),
      });
      setMailLoadingState('error');
      setMailError('Failed to load mail');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('Timeout') || msg.includes('timeout')) {
        setMailLoadingState('timeout');
        setMailError('获取内容超时，请检查网络后重试');
      } else {
        setMailLoadingState('error');
        setMailError(msg);
      }
    }
  }, [currentMail, loadMailBody]);

  const clearCurrentMail = useCallback(() => {
    setCurrentMail(null);
    setMailLoadingState('idle');
    setMailError(null);
  }, []);

  const clearBodyCacheEntry = useCallback((accountId: number, uid: number, folder: string = 'INBOX') => {
    const cacheKey = `${accountId}:${folder}:${uid}`;
    bodyPrefetchQueuedSet.delete(cacheKey);
    sharedMailBodyStore.clear({ accountId, uid, folder });
  }, [bodyPrefetchQueuedSet]);

  const runBodyPrefetchWorker = useCallback(async () => {
    if (bodyPrefetchWorkerActive.current) return;
    bodyPrefetchWorkerActive.current = true;

    try {
      let processedCount = 0;
      while (bodyPrefetchQueue.length > 0) {
        const mail = bodyPrefetchQueue.shift();
        if (!mail) break;

        const cacheKey = `${mail.accountId}:${mail.folder}:${mail.uid}`;
        bodyPrefetchQueuedSet.delete(cacheKey);

        if (sharedMailBodyStore.has({ accountId: mail.accountId, uid: mail.uid, folder: mail.folder })) {
          continue;
        }

        try {
          await loadMailBody(mail.accountId, mail.uid, mail.folder);
        } catch (err) {
          console.warn('[runBodyPrefetchWorker] failed for', cacheKey, err);
        }

        processedCount += 1;
        if (processedCount % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } finally {
      bodyPrefetchWorkerActive.current = false;
      if (bodyPrefetchQueue.length > 0) {
        void runBodyPrefetchWorker();
      }
    }
  }, [bodyPrefetchQueue, bodyPrefetchQueuedSet, loadMailBody]);

  const preloadMailBodies = useCallback(async (
    mails: RendererMailSummary[],
    limit: number = 8,
  ) => {
    const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 8;
    for (const mail of mails.slice(0, normalizedLimit)) {
      const cacheKey = `${mail.accountId}:${mail.folder}:${mail.uid}`;
      if (
        sharedMailBodyStore.has({ accountId: mail.accountId, uid: mail.uid, folder: mail.folder })
        || bodyPrefetchQueuedSet.has(cacheKey)
      ) {
        continue;
      }
      bodyPrefetchQueuedSet.add(cacheKey);
      bodyPrefetchQueue.push(mail);
    }

    await runBodyPrefetchWorker();
  }, [bodyPrefetchQueue, bodyPrefetchQueuedSet, runBodyPrefetchWorker]);

  return {
    mailList,
    setMailList,
    currentMail,
    setCurrentMail,
    mailLoadingState,
    mailError,
    isSyncing,
    syncError,
    syncMails,
    fetchMailDetail,
    loadMailBody,
    preloadMailBodies,
    clearCurrentMail,
    clearBodyCacheEntry,
  };
}
