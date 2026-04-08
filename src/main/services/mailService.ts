// src/main/services/mailService.ts
import log from 'electron-log';
import { Notification, BrowserWindow } from 'electron';
import { fetchMailList, fetchMailDetail, getMailFolders } from './mail';
import type { MailSummary, MailDetail, FolderInfo } from './mail';

export interface MailSummaryExtended extends MailSummary {
  folder: string;
  accountId: number;
}

export interface SyncResult {
  newMails: MailSummaryExtended[];
  totalCached: number;
}

// 15-second timeout wrapper
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function syncMails(accountId: number, folder: string = 'INBOX'): Promise<SyncResult> {
  log.info(`[mailService] syncing mails for account ${accountId}, folder ${folder}`);

  try {
    // Real IMAP sync via existing mail service
    const mailList = await fetchMailList(accountId, folder, { limit: 50, offset: 0 });

    const newMails: MailSummaryExtended[] = mailList.map(m => ({
      id: m.id,
      uid: m.uid,
      from: m.from,
      fromName: m.fromName,
      to: m.to,
      subject: m.subject,
      date: m.date,
      flags: m.flags,
      snippet: m.snippet,
      hasAttachments: m.hasAttachments,
      isRead: m.isRead,
      isStarred: m.isStarred,
      folder,
      accountId,
    }));

    // Notify about new mails
    if (newMails.length > 0) {
      const latest = newMails[0]; // already sorted newest-first
      triggerNativeNotification(latest);
    }

    log.info(`[mailService] sync complete: ${newMails.length} new mails`);
    return { newMails, totalCached: newMails.length };
  } catch (err) {
    log.error('[mailService] sync failed:', err);
    throw err;
  }
}

export async function fetchFullMessage(
  accountId: number,
  messageUid: number,
  folder: string = 'INBOX'
): Promise<MailDetail> {
  log.info(`[mailService] fetching full message UID=${messageUid} for account ${accountId}`);

  try {
    const detail = await withTimeout(
      fetchMailDetail(accountId, messageUid, folder),
      15000 // 15 seconds
    );

    if (!detail) {
      throw new Error('Message not found');
    }

    log.info(`[mailService] full message fetched successfully`);
    return detail;
  } catch (err) {
    if ((err as Error).message.includes('Timeout')) {
      log.warn(`[mailService] fetch timeout for UID ${messageUid}`);
    } else {
      log.error('[mailService] fetchFullMessage error:', err);
    }
    throw err;
  }
}

export async function getFolders(accountId: number): Promise<FolderInfo[]> {
  return getMailFolders(accountId);
}

function triggerNativeNotification(mail: MailSummaryExtended): void {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    const notification = new Notification({
      title: mail.fromName || mail.from,
      body: mail.snippet || mail.subject,
      silent: false,
    });

    notification.on('click', () => {
      if (win) {
        win.show();
        win.focus();
        // Emit event to renderer to select this mail
        win.webContents.send('notification:mail-clicked', {
          accountId: mail.accountId,
          uid: mail.uid,
          folder: mail.folder,
        });
      }
    });

    notification.show();
    log.info(`[mailService] notification shown for: ${mail.fromName || mail.from}`);
  } catch (err) {
    log.error('[mailService] failed to show notification:', err);
  }
}
