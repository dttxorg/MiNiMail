// src/main/services/mailService.ts
import log from 'electron-log';
import { Notification, BrowserWindow } from 'electron';
import { fetchMailList, fetchMailDetail, getMailFolders } from './mail';
import { getAccountById, getAccountCredentials } from '../database';
import type { MailSummary, MailDetail, FolderInfo } from './mail';

export interface MailSummaryStored {
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
  /** RFC 2822 References header */
  references?: string;
}

export interface SyncResult {
  newMails: MailSummary[];
  totalCached: number;
  errors: string[];
}

// ─── SQLite mail cache helpers ───────────────────────────────────────────────

function getMailCacheDb() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron');
  const dbPath = path.join(app.getPath('userData'), 'mail_cache.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateMailCacheTable(db: any) {
  // Idempotent: ALTER TABLE is a no-op if column already exists (caught and ignored)
  const migrations = [
    'ALTER TABLE mail_cache ADD COLUMN message_id TEXT',
    'ALTER TABLE mail_cache ADD COLUMN in_reply_to TEXT',
    'ALTER TABLE mail_cache ADD COLUMN references_header TEXT',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists — safe to ignore */ }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureMailCacheTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_cache (
      id TEXT PRIMARY KEY,
      uid INTEGER NOT NULL,
      "from" TEXT NOT NULL DEFAULT '',
      from_name TEXT NOT NULL DEFAULT '',
      "to" TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      snippet TEXT NOT NULL DEFAULT '',
      has_attachments INTEGER NOT NULL DEFAULT 0,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      folder TEXT NOT NULL DEFAULT 'INBOX',
      account_id INTEGER NOT NULL,
      cached_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(account_id, folder, uid)
    )
  `);
  migrateMailCacheTable(db);
}

function getCachedUids(accountId: number, folder: string): Set<number> {
  const db = getMailCacheDb();
  ensureMailCacheTable(db);
  const rows = db.prepare(
    'SELECT uid FROM mail_cache WHERE account_id = ? AND folder = ?'
  ).all(accountId, folder) as { uid: number }[];
  db.close();
  return new Set(rows.map(r => r.uid));
}

function upsertMailCache(mail: MailSummaryStored): void {
  const db = getMailCacheDb();
  ensureMailCacheTable(db);
  db.prepare(`
    INSERT OR REPLACE INTO mail_cache
      (id, uid, "from", from_name, "to", subject, date, snippet,
       has_attachments, is_read, is_starred, folder, account_id, cached_at,
       message_id, in_reply_to, references_header)
    VALUES
      (@id, @uid, @from, @fromName, @to, @subject, @date, @snippet,
       @hasAttachments, @isRead, @isStarred, @folder, @accountId, @cachedAt,
       @messageId, @inReplyTo, @references)
  `).run({
    id: mail.id,
    uid: mail.uid,
    from: mail.from,
    fromName: mail.fromName,
    to: mail.to,
    subject: mail.subject,
    date: typeof mail.date === 'string' ? mail.date : (mail.date as Date).toISOString(),
    snippet: mail.snippet,
    hasAttachments: mail.hasAttachments ? 1 : 0,
    isRead: mail.isRead ? 1 : 0,
    isStarred: mail.isStarred ? 1 : 0,
    folder: mail.folder,
    accountId: mail.accountId,
    cachedAt: new Date().toISOString(),
    messageId: mail.messageId ?? null,
    inReplyTo: mail.inReplyTo ?? null,
    references: mail.references ?? null,
  });
  db.close();
}

function getCachedMails(accountId: number, folder: string, limit: number = 50): MailSummaryStored[] {
  const db = getMailCacheDb();
  ensureMailCacheTable(db);
  const rows = db.prepare(`
    SELECT id, uid, "from", from_name, "to", subject, date, snippet,
           has_attachments, is_read, is_starred, folder, account_id, cached_at,
           message_id, in_reply_to, references_header
    FROM mail_cache
    WHERE account_id = ? AND folder = ?
    ORDER BY uid DESC
    LIMIT ?
  `).all(accountId, folder, limit) as Record<string, unknown>[];
  db.close();
  return rows.map(row => ({
    id: row.id as string,
    uid: row.uid as number,
    from: row.from as string,
    fromName: row.from_name as string,
    to: row.to as string,
    subject: row.subject as string,
    date: row.date as string,
    snippet: row.snippet as string,
    hasAttachments: Boolean(row.has_attachments),
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    folder: row.folder as string,
    accountId: row.account_id as number,
    cachedAt: row.cached_at as string,
    messageId: row.message_id != null ? (row.message_id as string) : undefined,
    inReplyTo: row.in_reply_to != null ? (row.in_reply_to as string) : undefined,
    references: row.references_header != null ? (row.references_header as string) : undefined,
  }));
}

// ─── IMAP fetch via existing mail.ts ────────────────────────────────────────

async function fetchFromImap(accountId: number, folder: string): Promise<MailSummary[]> {
  // This calls the REAL imap-client based fetchMailList in mail.ts
  const mailList = await fetchMailList(accountId, folder, { limit: 100, offset: 0 });
  return mailList.map(m => ({
    id: m.id,
    uid: m.uid,
    from: m.from,
    fromName: m.fromName,
    to: m.to,
    subject: m.subject,
    date: m.date,
    flags: m.flags ?? [],
    snippet: m.snippet,
    hasAttachments: m.hasAttachments,
    isRead: m.isRead,
    isStarred: m.isStarred,
    folder,
    accountId,
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
  }));
}

// ─── 15-second timeout wrapper ───────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function syncMails(accountId: number, folder: string = 'INBOX'): Promise<SyncResult> {
  console.log('[mailService] syncMails ENTER accountId=', accountId, 'folder=', folder);
  const errors: string[] = [];

  try {
    // Step 1: Fetch from IMAP (real connection via mail.ts → imap-client)
    let remoteMails: MailSummary[] = [];
    try {
      console.log('[mailService] Step1: calling fetchFromImap for accountId=', accountId);
      remoteMails = await withTimeout(fetchFromImap(accountId, folder), 15000);
      console.log('[mailService] Step1: fetchFromImap SUCCESS, got', remoteMails.length, 'mails');
    } catch (err) {
      const e = err as Error;
      console.error('[mailService] Step1: fetchFromImap FAILED:', e.message, '\n', e.stack);
      if (e.message.includes('Timeout') || e.message.includes('timeout')) {
        throw new Error('连接超时，请检查网络后重试');
      }
      throw new Error(e.message);
    }

    // Step 2: Get locally cached UIDs for incremental sync
    const cachedUids = getCachedUids(accountId, folder);
    console.log('[mailService] Step2: cached UIDs count=', cachedUids.size);

    const newMails: MailSummary[] = [];

    // Step 3: Store new mails to SQLite cache
    console.log('[mailService] Step3: upserting', remoteMails.length, 'mails to SQLite...');
    for (const mail of remoteMails) {
      if (!cachedUids.has(mail.uid)) {
        upsertMailCache({
          ...mail,
          cachedAt: new Date().toISOString(),
        } as unknown as MailSummaryStored);
        newMails.push(mail);
      }
    }
    console.log('[mailService] Step3: SQLite write done. New mails:', newMails.length, '/ Total fetched:', remoteMails.length);

    // Step 4: Notify for new mails
    if (newMails.length > 0) {
      triggerNativeNotification(newMails[0] as MailSummary & { accountId: number; folder: string });
    }

    console.log('[mailService] sync complete: newMails=', newMails.length, 'totalCached=', remoteMails.length);
    log.info(`[mailService] sync complete: ${newMails.length} new mails, ${remoteMails.length} total`);
    return { newMails, totalCached: remoteMails.length, errors };
  } catch (err) {
    const e = err as Error;
    console.error('[mailService] syncMails THREW exception:', e.message, '\n', e.stack);
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
      15000
    );
    if (!detail) throw new Error('Message not found');
    return detail;
  } catch (err) {
    if ((err as Error).message.includes('Timeout')) {
      log.warn(`[mailService] fetch timeout for UID ${messageUid}`);
      throw new Error('获取内容超时，请检查网络后重试');
    }
    log.error('[mailService] fetchFullMessage error:', err);
    throw err;
  }
}

export async function getFolders(accountId: number): Promise<FolderInfo[]> {
  return getMailFolders(accountId);
}

// Load cached mails on startup (for offline/initial render)
export function loadCachedMails(accountId: number, folder: string = 'INBOX'): MailSummary[] {
  try {
    const cached = getCachedMails(accountId, folder);
    return cached.map(c => ({
      id: c.id,
      uid: c.uid,
      from: c.from,
      fromName: c.fromName,
      to: c.to,
      subject: c.subject,
      date: new Date(c.date),
      flags: [],
      snippet: c.snippet,
      hasAttachments: c.hasAttachments,
      isRead: c.isRead,
      isStarred: c.isStarred,
      folder: c.folder,
      accountId: c.accountId,
      messageId: c.messageId,
      inReplyTo: c.inReplyTo,
      references: c.references,
    } as MailSummary));
  } catch (err) {
    log.warn('[mailService] loadCachedMails failed:', err);
    return [];
  }
}

// ─── Native notification ─────────────────────────────────────────────────────

function triggerNativeNotification(mail: MailSummary & { accountId: number; folder: string }): void {
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
        win.webContents.send('notification:mail-clicked', {
          accountId: mail.accountId,
          uid: mail.uid,
          folder: mail.folder,
        });
      }
    });
    notification.show();
  } catch (err) {
    log.error('[mailService] notification error:', err);
  }
}
