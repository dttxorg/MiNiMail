import { useState, useEffect, useCallback } from 'react';
import type { ApiResponse } from '../types';

export interface SendMailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
}

export interface MailSummary {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  flags: string[];
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
}

export interface MailDetail {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  cc?: string;
  subject: string;
  date: Date;
  flags: string[];
  bodyHtml?: string;
  bodyText?: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    contentId?: string;
  }>;
  headers: Record<string, string>;
}

export interface FolderInfo {
  name: string;
  path: string;
  delimiter: string;
  flags: string[];
}

export function useMail(accountId: number | null, folder: string = 'INBOX') {
  const [mails, setMails] = useState<MailSummary[]>([]);
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMail, setSelectedMail] = useState<MailDetail | null>(null);
  const [selectedMailUid, setSelectedMailUid] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchFolders = useCallback(async () => {
    if (!accountId) return;
    try {
      const response = await window.electronAPI.invoke('mail:getFolders', accountId) as ApiResponse<FolderInfo[]>;
      if (response.success && response.data) {
        setFolders(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    }
  }, [accountId]);

  const fetchMailList = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('mail:getList', accountId, folder, { limit: 50 }) as ApiResponse<MailSummary[]>;
      if (response.success && response.data) {
        setMails(response.data);
      } else {
        setError(response.error || 'Failed to fetch mails');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId, folder]);

  const fetchMailDetail = useCallback(async (uid: number) => {
    if (!accountId) return;
    setLoadingDetail(true);
    setSelectedMailUid(uid);
    try {
      const response = await window.electronAPI.invoke('mail:getDetail', accountId, uid, folder) as ApiResponse<MailDetail>;
      if (response.success && response.data) {
        setSelectedMail(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch mail detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, [accountId, folder]);

  const setFlags = useCallback(async (uid: number, flags: string[]) => {
    if (!accountId) return;
    try {
      await window.electronAPI.invoke('mail:setFlags', accountId, uid, flags, folder);
      // Refresh the mail list
      await fetchMailList();
    } catch (err) {
      console.error('Failed to set flags:', err);
    }
  }, [accountId, folder, fetchMailList]);

  const markAsRead = useCallback((uid: number) => {
    setFlags(uid, ['\\Seen']);
  }, [setFlags]);

  const markAsUnread = useCallback((uid: number) => {
    setFlags(uid, ['\\Seen']);
  }, [setFlags]);

  const toggleStar = useCallback((mail: MailSummary) => {
    const newFlags = mail.isStarred
      ? ['\\Flagged']
      : ['\\Seen', '\\Flagged'];
    setFlags(mail.uid, newFlags);
  }, [setFlags]);

  const sendMail = useCallback(async (options: SendMailOptions): Promise<{ success: boolean; message: string }> => {
    if (!accountId) {
      return { success: false, message: 'No account selected' };
    }
    try {
      const response = await window.electronAPI.invoke('mail:send', accountId, options) as ApiResponse<{ messageId?: string }>;
      if (response.success) {
        return { success: true, message: '邮件发送成功' };
      }
      return { success: false, message: response.error || '发送失败' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }, [accountId]);

  const deleteMail = useCallback(async (messageUid: number): Promise<{ success: boolean; message: string }> => {
    if (!accountId) {
      return { success: false, message: 'No account selected' };
    }
    try {
      const response = await window.electronAPI.invoke('mail:delete', accountId, messageUid, folder) as ApiResponse<void>;
      if (response.success) {
        await fetchMailList();
        return { success: true, message: '邮件已删除' };
      }
      return { success: false, message: response.error || '删除失败' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }, [accountId, folder, fetchMailList]);

  const moveMail = useCallback(async (messageUid: number, toFolder: string): Promise<{ success: boolean; message: string }> => {
    if (!accountId) {
      return { success: false, message: 'No account selected' };
    }
    try {
      const response = await window.electronAPI.invoke('mail:move', accountId, messageUid, folder, toFolder) as ApiResponse<void>;
      if (response.success) {
        await fetchMailList();
        return { success: true, message: '邮件已移动' };
      }
      return { success: false, message: response.error || '移动失败' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }, [accountId, folder, fetchMailList]);

  useEffect(() => {
    if (accountId) {
      fetchFolders();
      fetchMailList();
    }
  }, [accountId, fetchFolders, fetchMailList]);

  return {
    mails,
    folders,
    loading,
    error,
    selectedMail,
    selectedMailUid,
    loadingDetail,
    fetchMailList,
    fetchMailDetail,
    setFlags,
    markAsRead,
    toggleStar,
    sendMail,
    deleteMail,
    moveMail,
  };
}
