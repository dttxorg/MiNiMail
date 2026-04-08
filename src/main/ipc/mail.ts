import { ipcMain } from 'electron';
import log from 'electron-log';
import { fetchMailList, fetchMailDetail, getMailFolders, setMessageFlags, deleteMessage, moveMessage } from '../services/mail';
import { syncMails, fetchFullMessage as svcFetchFullMessage, getFolders as svcGetFolders, loadCachedMails } from '../services/mailService';
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
  ipcMain.handle('mail:sync', async (_event, accountId: number, folder: string) => {
    try {
      const result = await syncMails(accountId, folder);
      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
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
