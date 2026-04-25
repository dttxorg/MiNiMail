import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import log from 'electron-log';
import type { MailExportRequest, MailImportRequest } from '../../shared/backup';
import { fetchMailList, fetchMailDetail, getMailFolders, setMessageFlags, setMessageStarred, setMessageRead, deleteMessage, moveMessage, fetchMailAttachmentContent, sanitizeAttachmentFilename } from '../services/mail';
import {
  syncMails,
  subscribeStagedSyncProgress,
  fetchFullMessage as svcFetchFullMessage,
  getFolders as svcGetFolders,
  loadCachedMails,
  loadCachedLocalDrafts,
  pruneCachedMailStore,
  getCachedBody,
  updateCachedMailCategory,
  clearCachedMailScanState,
  updateCachedMailRead,
  updateCachedMailStar,
  saveLocalMailToCache,
  deleteCachedDraft,
  deleteCachedMailById,
  getCachedAttachmentMetadata,
} from '../services/mailService';
import { cancelMailBackupTask, exportMailsToEml, importMailsFromEml } from '../services/mailBackup';
import { sendMail, testSmtpConnection } from '../services/smtp';
import { getAccountById } from '../database';
import type { MailHistoryRange } from '../../shared/mailSyncSettings';
import type { MailCacheRange } from '../../shared/mailSyncSettings';

let stagedSyncProgressForwarderDispose: (() => void) | null = null;

type AttachmentActionRequest = {
  accountId: number;
  folder: string;
  uid: number;
  attachmentCacheId: string | number;
};

function resolveAttachmentActionRequest(input: AttachmentActionRequest): {
  accountId: number;
  folder: string;
  uid: number;
  attachmentCacheId: string;
} {
  const accountId = Number(input.accountId);
  const uid = Number(input.uid);
  const folder = typeof input.folder === 'string' && input.folder.trim() ? input.folder : 'INBOX';
  const attachmentCacheId = String(input.attachmentCacheId || '');
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error('Invalid account id');
  if (!Number.isFinite(uid) || uid < 0) throw new Error('Invalid message uid');
  if (!attachmentCacheId) throw new Error('Missing attachment id');
  return { accountId, folder, uid, attachmentCacheId };
}

function getRequestWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
}

async function loadAttachmentForAction(request: AttachmentActionRequest) {
  const { accountId, folder, uid, attachmentCacheId } = resolveAttachmentActionRequest(request);
  const metadata = getCachedAttachmentMetadata(accountId, folder, uid, attachmentCacheId);
  if (!metadata) throw new Error('Attachment metadata not found');
  return fetchMailAttachmentContent(accountId, uid, folder, metadata);
}

function registerStagedSyncProgressForwarder(): void {
  if (stagedSyncProgressForwarderDispose) return;

  const unsubscribe = subscribeStagedSyncProgress((progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (typeof win.isDestroyed === 'function' && win.isDestroyed()) continue;
        if (typeof win.webContents?.isDestroyed === 'function' && win.webContents.isDestroyed()) continue;
        win.webContents.send('mail:stagedSyncProgress', progress);
      } catch (error) {
        log.error('Failed to forward staged sync progress to window:', error);
      }
    }
  });

  const cleanup = () => {
    unsubscribe();
    stagedSyncProgressForwarderDispose = null;
    app.removeListener('before-quit', cleanup);
  };

  stagedSyncProgressForwarderDispose = cleanup;
  app.once('before-quit', cleanup);
}

export function registerMailHandlers(): void {
  log.info('Registering mail IPC handlers');
  registerStagedSyncProgressForwarder();

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
  ipcMain.handle('mail:sync', async (_event, accountId: number, folder: string, options?: { notify?: boolean; folderKind?: 'inbox' | 'other'; historyRange?: MailHistoryRange; forceHistoryRange?: boolean }) => {
    try {
      const result = await syncMails(accountId, folder, options);
      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to sync mails for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Load cached mails from SQLite (for offline/startup)
  ipcMain.handle('mail:loadCached', async (_event, accountId: number, folder: string, historyRange?: MailHistoryRange, options?: { limit?: number; offset?: number }) => {
    try {
      const cached = loadCachedMails(accountId, folder, historyRange, options);
      return { success: true, data: cached };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to load cached mails for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:loadLocalDrafts', async (_event, accountId?: number) => {
    try {
      const cached = loadCachedLocalDrafts(accountId);
      return { success: true, data: cached };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to load cached local drafts:', error);
      return { success: false, error: error.message };
    }
  });

  // Load cached body from SQLite (for session reuse without re-fetching IMAP)
  ipcMain.handle('mail:loadCachedBody', async (_event, accountId: number, uid: number, folder: string = 'INBOX') => {
    try {
      const body = getCachedBody(accountId, uid, folder);
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

  ipcMain.handle('mail:downloadAttachment', async (event, request: AttachmentActionRequest) => {
    try {
      const attachment = await loadAttachmentForAction(request);
      const safeFilename = sanitizeAttachmentFilename(attachment.filename);
      const saveOptions = {
        defaultPath: path.join(app.getPath('downloads'), safeFilename),
        filters: [{ name: 'All Files', extensions: ['*'] }],
      };
      const ownerWindow = getRequestWindow(event);
      const saveResult = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, saveOptions)
        : await dialog.showSaveDialog(saveOptions);
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, error: 'cancelled' };
      }
      await fs.promises.writeFile(saveResult.filePath, attachment.content);
      return { success: true, filePath: saveResult.filePath };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to download mail attachment:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:openAttachment', async (_event, request: AttachmentActionRequest) => {
    try {
      const attachment = await loadAttachmentForAction(request);
      const safeFilename = sanitizeAttachmentFilename(attachment.filename);
      const tempDir = path.join(app.getPath('temp'), 'MiNiMail', 'attachments', crypto.randomUUID());
      await fs.promises.mkdir(tempDir, { recursive: true });
      const filePath = path.join(tempDir, safeFilename);
      await fs.promises.writeFile(filePath, attachment.content);
      const openError = await shell.openPath(filePath);
      if (openError) return { success: false, filePath, error: openError };
      return { success: true, filePath };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to open mail attachment:', error.message);
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

  ipcMain.handle('mail:pruneCache', async (_event, options?: { range?: MailCacheRange; accountId?: number; folder?: string }) => {
    try {
      const changes = pruneCachedMailStore(options?.range || '1mo', options?.accountId, options?.folder);
      return { success: true, data: { changes } };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to prune mail cache:', error);
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

  ipcMain.handle('mail:updateCategories', async (_event, updates: Array<{ accountId: number; uid: number; folder: string; category: string; scanResult?: string }>) => {
    try {
      for (const update of updates) {
        updateCachedMailCategory(update.accountId, update.folder, update.uid, update.category, update.scanResult);
      }
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to update cached categories:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:clearScanResults', async (_event, updates: Array<{ accountId: number; uid: number; folder: string }>) => {
    try {
      for (const update of updates) {
        clearCachedMailScanState(update.accountId, update.folder, update.uid);
      }
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to clear cached scan results:', error);
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
    draftPayload?: string;
    localDraftKey?: string;
    localSendId?: string;
    deliveryState?: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
    deliveryError?: string;
    category?: string;
    isScanned?: boolean;
    scanResult?: string;
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

  ipcMain.handle('mail:deleteCachedDraft', async (_event, identity: {
    accountId?: number;
    folder?: string;
    uid?: number;
    id?: string;
    messageId?: string;
    localDraftKey?: string;
  }) => {
    try {
      deleteCachedDraft(identity || {});
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to delete cached draft:', error);
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

  ipcMain.handle('mail:importEml', async (event, request: MailImportRequest) => {
    try {
      const result = await importMailsFromEml(request, (progress) => {
        event.sender.send('mail:backup-progress', progress);
      });
      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to import mail backup:', error);
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
