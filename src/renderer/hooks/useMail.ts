// src/renderer/hooks/useMail.ts
import { useState, useCallback } from 'react';
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

  const syncMails = useCallback(async (accountId: number, folder: string = 'INBOX') => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const response = await window.electronAPI.invoke('mail:sync', accountId, folder);
      const result = response as ApiResponse<{ newMails: RendererMailSummary[]; totalCached: number }>;
      if (result.success && result.data) {
        setMailList(prev => [...result.data!.newMails, ...prev]);
      } else {
        setSyncError(result.error || 'Sync failed');
      }
    } catch (err) {
      setSyncError((err as Error).message);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const fetchMailDetail = useCallback(async (accountId: number, messageUid: number, folder: string = 'INBOX') => {
    setMailLoadingState('loading');
    setMailError(null);
    setCurrentMail(null);

    try {
      const response = await window.electronAPI.invoke('mail:fetchFull', accountId, messageUid, folder);
      const result = response as ApiResponse<RendererMailDetail>;
      if (result.success && result.data) {
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
  };
}
