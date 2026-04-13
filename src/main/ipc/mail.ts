import { ipcMain } from 'electron';
import log from 'electron-log';
import type { MailExportRequest } from '../../shared/backup';
import { fetchMailList, fetchMailDetail, getMailFolders, setMessageFlags, setMessageStarred, setMessageRead, deleteMessage, moveMessage } from '../services/mail';
import {
  syncMails,
  fetchFullMessage as svcFetchFullMessage,
  getFolders as svcGetFolders,
  loadCachedMails,
  getCachedBody,
  updateCachedMailCategory,
  updateCachedMailRead,
  updateCachedMailStar,
  saveLocalMailToCache,
  deleteCachedMailById,
} from '../services/mailService';
import { cancelMailBackupTask, exportMailsToEml } from '../services/mailBackup';
import { sendMail, testSmtpConnection } from '../services/smtp';
import { getAccountById } from '../database';

export function registerMailHandlers(): void {
  log.info('Registering mail IPC handlers');

  // Get mail folders
  ipcMain.handle('mail:getFolders', async (_event, accountId: number) => {
    try {
      const folders = await getMailFolders(accountId);
      return { success: true, data: folders };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to get folders for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Sync mails (main entry point for refresh)
  ipcMain.handle('mail:sync', async (_event, accountId: number, folder: string, options?: { notify?: boolean; folderKind?: 'inbox' | 'other' }) => {
    console.log('[IPC mail:sync] RECEIVED accountId=', accountId, 'folder=', folder, 'options=', options);
    try {
      console.log('[IPC mail:sync] calling syncMails service...');
      const result = await syncMails(accountId, folder, options);
      console.log('[IPC mail:sync] syncMails returned:', JSON.stringify(result).slice(0, 200));
      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
      console.error('[IPC mail:sync] syncMails THREW:', error.message, '\n', error.stack);
      log.error(`Failed to sync mails for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Load cached mails from SQLite (for offline/startup)
  ipcMain.handle('mail:loadCached', async (_event, accountId: number, folder: string) => {
    try {
      const cached = loadCachedMails(accountId, folder);
      return { success: true, data: cached };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to load cached mails for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Load cached body from SQLite (for session reuse without re-fetching IMAP)
  ipcMain.handle('mail:loadCachedBody', async (_event, accountId: number, uid: number) => {
    try {
      const body = getCachedBody(accountId, uid);
      return { success: true, data: body };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to load cached body for account ${accountId} UID ${uid}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Fetch full message with 15s timeout
  ipcMain.handle('mail:fetchFull', async (_event, accountId: number, messageUid: number, folder: string) => {
    try {
      const detail = await svcFetchFullMessage(accountId, messageUid, folder);
      return { success: true, data: detail };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to fetch full message UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Get mail list
  ipcMain.handle('mail:getList', async (_event, accountId: number, folder: string, options: { limit?: number; offset?: number; search?: string }) => {
    try {
      const mails = await fetchMailList(accountId, folder, options);
      return { success: true, data: mails };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to get mail list for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Get mail detail
  ipcMain.handle('mail:getDetail', async (_event, accountId: number, messageUid: number, folder: string) => {
    try {
      const mail = await fetchMailDetail(accountId, messageUid, folder);
      return { success: true, data: mail };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to get mail detail for account ${accountId}, UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Set message flags (mark as read, starred, etc.)
  ipcMain.handle('mail:setFlags', async (_event, accountId: number, messageUid: number, flags: string[], folder: string) => {
    try {
      await setMessageFlags(accountId, messageUid, flags, folder);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to set flags for account ${accountId}, UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:setStarred', async (_event, accountId: number, messageUid: number, starred: boolean, folder: string) => {
    try {
      await setMessageStarred(accountId, messageUid, starred, folder);
      updateCachedMailStar(accountId, folder, messageUid, starred);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to set starred for account ${accountId}, UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:setRead', async (_event, accountId: number, messageUid: number, read: boolean, folder: string) => {
    try {
      await setMessageRead(accountId, messageUid, read, folder);
      updateCachedMailRead(accountId, folder, messageUid, read);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to set read for account ${accountId}, UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:updateCategories', async (_event, updates: Array<{ accountId: number; uid: number; folder: string; category: string }>) => {
    try {
      for (const update of updates) {
        updateCachedMailCategory(update.accountId, update.folder, update.uid, update.category);
      }
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to update cached categories:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:cacheLocal', async (_event, mail: {
    id: string;
    uid: number;
    from: string;
    fromName: string;
    to: string;
    subject: string;
    date: string;
    snippet: string;
    hasAttachments: boolean;
    isRead: boolean;
    isStarred: boolean;
    folder: string;
    accountId: number;
    cachedAt: string;
    messageId?: string;
    inReplyTo?: string;
    references?: string;
    bodyHtml?: string;
    bodyText?: string;
    category?: string;
  }) => {
    try {
      saveLocalMailToCache(mail);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to cache local mail:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:deleteCachedById', async (_event, id: string) => {
    try {
      deleteCachedMailById(id);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to delete cached local mail by id:', error);
      return { success: false, error: error.message };
    }
  });

  // Get current folder for account (stored in account settings)
  ipcMain.handle('mail:getCurrentFolder', async (_event, accountId: number) => {
    try {
      const account = getAccountById(accountId);
      if (!account) {
        return { success: false, error: 'Account not found' };
      }
      return { success: true, data: 'INBOX' };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:exportEml', async (event, request: MailExportRequest) => {
    try {
      const result = await exportMailsToEml(request, (progress) => {
        event.sender.send('mail:backup-progress', progress);
      });
      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to export mail backup:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:cancelBackup', async (_event, taskId: string) => {
    try {
      return { success: cancelMailBackupTask(taskId) };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to cancel mail backup:', error);
      return { success: false, error: error.message };
    }
  });

  // Send email
  ipcMain.handle('mail:send', async (_event, accountId: number, options: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    isHtml?: boolean;
  }) => {
    try {
      const result = await sendMail({ accountId, ...options });
      return result;
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to send email for account ${accountId}:`, error);
      return { success: false, message: error.message };
    }
  });

  // Test SMTP connection
  ipcMain.handle('mail:testSmtp', async (_event, accountId: number) => {
    try {
      const result = await testSmtpConnection(accountId);
      return result;
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to test SMTP for account ${accountId}:`, error);
      return { success: false, message: error.message };
    }
  });

  // Delete message (move to Trash)
  ipcMain.handle('mail:delete', async (_event, accountId: number, messageUid: number, folder: string) => {
    try {
      await deleteMessage(accountId, messageUid, folder);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to delete message ${messageUid} for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Move message to another folder
  ipcMain.handle('mail:move', async (_event, accountId: number, messageUid: number, fromFolder: string, toFolder: string) => {
    try {
      await moveMessage(accountId, messageUid, fromFolder, toFolder);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to move message ${messageUid} for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  log.info('Mail IPC handlers registered');
}
