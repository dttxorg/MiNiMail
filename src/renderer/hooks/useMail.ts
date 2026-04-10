// src/renderer/hooks/useMail.ts
import { useState, useCallback, useRef } from 'react';
import type { ApiResponse } from '../types';

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
  /** AI classification result — one of the 6 canonical category strings */
  category?: string;
  /** RFC 2822 Message-ID header value */
  messageId?: string;
  /** RFC 2822 In-Reply-To header value (messageId of parent) */
  inReplyTo?: string;
}

export interface RendererMailDetail extends RendererMailSummary {
  bodyHtml?: string;
  bodyText?: string;
  attachments: Array<{ filename: string; contentType: string; size: number }>;
  headers: Record<string, string>;
}

export type MailLoadingState = 'idle' | 'loading' | 'success' | 'error' | 'timeout';

export function useMail() {
  const [mailList, setMailList] = useState<RendererMailSummary[]>([]);
  const [currentMail, setCurrentMail] = useState<RendererMailDetail | null>(null);
  const [mailLoadingState, setMailLoadingState] = useState<MailLoadingState>('idle');
  const [mailError, setMailError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  /** Session-level body cache — avoids re-fetching when switching between already-viewed emails */
  const bodyCache = useRef<Map<string, RendererMailDetail>>(new Map());

  const syncMails = useCallback(async (accountId: number, folder: string = 'INBOX') => {
    setIsSyncing(true);
    setSyncError(null);
    console.log('[syncMails] START accountId=', accountId, 'folder=', folder);
    try {
      console.log('[syncMails] invoking IPC mail:sync for accountId=', accountId, 'folder=', folder);
      const response = await window.electronAPI.invoke('mail:sync', accountId, folder);
      console.log('[syncMails] IPC response received:', JSON.stringify(response).slice(0, 300));
      const result = response as { success: boolean; data?: { newMails: RendererMailSummary[]; totalCached: number }; error?: string };
      if (result.success && result.data) {
        const { newMails, totalCached } = result.data;
        console.log('[syncMails] success: newMails=', newMails.length, 'totalCached=', totalCached);
        // Always load full cached list so existing mails show on startup
        try {
          const cachedResp = await window.electronAPI.invoke('mail:loadCached', accountId, folder) as { success: boolean; data?: RendererMailSummary[] };
          if (cachedResp.success && cachedResp.data) {
            const allCached = cachedResp.data;
            console.log('[syncMails] loaded', allCached.length, 'cached mails for account', accountId);
            setMailList(prev => {
              // Remove old entries for this account+folder, then prepend fresh data
              const others = prev.filter(m => !(m.accountId === accountId && m.folder.toLowerCase() === folder.toLowerCase()));
              const merged = [...allCached, ...others];
              console.log('[syncMails] setMailList: prev len=', prev.length, 'new len=', merged.length);
              return merged;
            });
          } else {
            // Fallback: only add newMails
            setMailList(prev => {
              const merged = [...newMails, ...prev];
              console.log('[syncMails] setMailList (fallback): prev len=', prev.length, 'new len=', merged.length);
              return merged;
            });
          }
        } catch {
          setMailList(prev => {
            const merged = [...newMails, ...prev];
            console.log('[syncMails] setMailList (fallback): prev len=', prev.length, 'new len=', merged.length);
            return merged;
          });
        }
      } else {
        const errMsg = result.error || 'Sync failed';
        console.error('[syncMails] sync failed:', errMsg);
        setSyncError(errMsg);
        // 即使 sync 失败，也尝试加载缓存数据
        try {
          const cachedResp = await window.electronAPI.invoke('mail:loadCached', accountId, folder) as { success: boolean; data?: RendererMailSummary[] };
          if (cachedResp.success && cachedResp.data && cachedResp.data.length > 0) {
            console.log('[syncMails] loading', cachedResp.data.length, 'cached mails');
            setMailList(prev => [...cachedResp.data!, ...prev]);
          }
        } catch (cacheErr) {
          console.error('[syncMails] loadCached failed:', cacheErr);
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[syncMails] exception:', msg);
      setSyncError(msg);
    } finally {
      console.log('[syncMails] END, isSyncing=false');
      setIsSyncing(false);
    }
  }, []);

  const fetchMailDetail = useCallback(async (accountId: number, messageUid: number, folder: string = 'INBOX') => {
    const cacheKey = `${accountId}:${messageUid}`;

    // Cache hit: render instantly, skip IPC
    const cached = bodyCache.current.get(cacheKey);
    if (cached) {
      setCurrentMail(cached);
      setMailLoadingState('success');
      setMailError(null);
      return;
    }

    setMailLoadingState('loading');
    setMailError(null);
    setCurrentMail(null);

    try {
      const response = await window.electronAPI.invoke('mail:fetchFull', accountId, messageUid, folder);
      const result = response as ApiResponse<RendererMailDetail>;
      if (result.success && result.data) {
        // Write to cache before setting state
        bodyCache.current.set(cacheKey, result.data);
        setCurrentMail(result.data);
        setMailLoadingState('success');
      } else {
        if ((result.error || '').includes('Timeout')) {
          setMailLoadingState('timeout');
          setMailError('获取内容超时，请检查网络后重试');
        } else {
          setMailLoadingState('error');
          setMailError(result.error || 'Failed to load mail');
        }
      }
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
  }, []);

  const clearCurrentMail = useCallback(() => {
    setCurrentMail(null);
    setMailLoadingState('idle');
    setMailError(null);
  }, []);

  /** Remove a specific entry from body cache (call when deleting an email) */
  const clearBodyCacheEntry = useCallback((accountId: number, uid: number) => {
    bodyCache.current.delete(`${accountId}:${uid}`);
  }, []);

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
    clearCurrentMail,
    clearBodyCacheEntry,
  };
}
