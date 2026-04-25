// src/main/services/mailService.ts
import path from 'node:path';
import Database from 'better-sqlite3';
import log from 'electron-log';
import { Notification, BrowserWindow, app } from 'electron';
import { fetchMailList, fetchMailDetail, getMailFolders } from './mail';
import { getAccountById, getAccountCredentials, getSetting, setSetting } from '../database';
import type { MailSummary, MailDetail, FolderInfo, MailAttachmentMetadata } from './mail';
import { buildLocalizedMailNotificationContent, buildMailNotificationKey, shouldNotifyMail } from './mailNotification';
import { getMailNotificationIconPath } from '../brand';
import {
  buildHistoryStages,
  coerceMailCacheRange,
  mailCacheRangeToMs,
  mailHistoryRangeToMs,
  type MailCacheRange,
  type MailHistoryRange,
  shouldUseHistoryRange,
} from '../../shared/mailSyncSettings';
import { resolveLocalDraftId } from '../../shared/mailDraftIdentity';
import { buildCachedMailListQuery } from '../../shared/mailCacheQuery';
import { folderMatches } from '../../shared/mailFolders';

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
  /** Persisted body — written when full message is fetched */
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
  attachments?: MailAttachmentMetadata[];
}

interface CachedMailLoadOptions {
  limit?: number;
  offset?: number;
}

export interface SyncResult {
  newMails: MailSummary[];
  totalCached: number;
  errors: string[];
}

export interface DraftDeleteIdentity {
  accountId?: number;
  folder?: string;
  uid?: number;
  id?: string;
  messageId?: string;
  localDraftKey?: string;
}

export interface StagedSyncProgress {
  accountId: number;
  folder: string;
  stageRange: MailHistoryRange;
  loadedCount: number;
  stageIndex: number;
  totalStages: number;
  done: boolean;
}

const appStartedAt = Date.now();
const notifiedMailKeys = new Set<string>();
const MAIL_CACHE_RANGE_SETTING_KEY = 'mail_cache_range';
const HISTORY_SYNC_COMPLETE_PREFIX = 'mail_history_sync_complete';
const INCREMENTAL_SYNC_SAFETY_MS = 60 * 60 * 1000;
type StagedSyncListener = (progress: StagedSyncProgress) => void;
const stagedSyncListeners = new Set<StagedSyncListener>();
const syncInFlight = new Map<string, Promise<SyncResult>>();
let mailCacheDb: Database.Database | null = null;
let isMailCacheSchemaReady = false;

type SyncMailOptions = {
  notify?: boolean;
  folderKind?: 'inbox' | 'other';
  historyRange?: MailHistoryRange;
  forceHistoryRange?: boolean;
  onPageFlushed?: (loadedCount: number) => void | Promise<void>;
};

export function subscribeStagedSyncProgress(listener: StagedSyncListener): () => void {
  stagedSyncListeners.add(listener);
  return () => stagedSyncListeners.delete(listener);
}

function emitStagedSyncProgress(progress: StagedSyncProgress): void {
  for (const listener of stagedSyncListeners) {
    try {
      listener(progress);
    } catch (error) {
      log.error('[mailService] staged sync progress listener failed:', error);
    }
  }
}

// ─── SQLite mail cache helpers ───────────────────────────────────────────────

export function closeMailCacheDb(): void {
  if (!mailCacheDb) return;
  mailCacheDb.close();
  mailCacheDb = null;
  isMailCacheSchemaReady = false;
}

app.once('before-quit', closeMailCacheDb);

function getMailCacheDb(): Database.Database {
  if (!mailCacheDb) {
    const dbPath = path.join(app.getPath('userData'), 'mail_cache.db');
    mailCacheDb = new Database(dbPath);
    mailCacheDb.pragma('journal_mode = WAL');
  }

  if (!isMailCacheSchemaReady) {
    ensureMailCacheTable(mailCacheDb);
    isMailCacheSchemaReady = true;
  }

  return mailCacheDb;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateMailCacheTable(db: any) {
  // Idempotent: ALTER TABLE is a no-op if column already exists (caught and ignored)
  const migrations = [
    'ALTER TABLE mail_cache ADD COLUMN message_id TEXT',
    'ALTER TABLE mail_cache ADD COLUMN in_reply_to TEXT',
    'ALTER TABLE mail_cache ADD COLUMN references_header TEXT',
    'ALTER TABLE mail_cache ADD COLUMN body_html TEXT',
    'ALTER TABLE mail_cache ADD COLUMN body_text TEXT',
    'ALTER TABLE mail_cache ADD COLUMN draft_payload TEXT',
    'ALTER TABLE mail_cache ADD COLUMN local_draft_id TEXT',
    'ALTER TABLE mail_cache ADD COLUMN local_send_id TEXT',
    'ALTER TABLE mail_cache ADD COLUMN category TEXT',
    'ALTER TABLE mail_cache ADD COLUMN is_scanned INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE mail_cache ADD COLUMN scan_result TEXT',
    'ALTER TABLE mail_cache ADD COLUMN delivery_state TEXT',
    'ALTER TABLE mail_cache ADD COLUMN delivery_error TEXT',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists — safe to ignore */ }
  }
  backfillLocalDraftIds(db);
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mail_cache_local_draft_id
      ON mail_cache(account_id, local_draft_id)
      WHERE local_draft_id IS NOT NULL
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mail_cache_local_send_id
      ON mail_cache(account_id, local_send_id)
      WHERE local_send_id IS NOT NULL
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mail_cache_account_folder_date
      ON mail_cache(account_id, folder, date DESC)
    `);
  } catch (error) {
    log.warn('[mailService] mail cache index migration skipped:', error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function backfillLocalDraftIds(db: any): void {
  try {
    const rows = db.prepare(`
      SELECT id, message_id, local_draft_id
      FROM mail_cache
      WHERE local_draft_id IS NULL
    `).all() as Array<{ id?: string | null; message_id?: string | null; local_draft_id?: string | null }>;
    const update = db.prepare('UPDATE mail_cache SET local_draft_id = ? WHERE id = ?');

    for (const row of rows) {
      const localDraftId = resolveLocalDraftId({
        id: row.id,
        messageId: row.message_id,
        localDraftId: row.local_draft_id,
      });
      if (localDraftId && row.id) {
        update.run(localDraftId, row.id);
      }
    }
  } catch (error) {
    log.warn('[mailService] local draft id backfill skipped:', error);
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
      local_draft_id TEXT,
      local_send_id TEXT,
      delivery_state TEXT,
      delivery_error TEXT,
      category TEXT,
      is_scanned INTEGER NOT NULL DEFAULT 0,
      scan_result TEXT,
      UNIQUE(account_id, folder, uid)
    )
  `);
  migrateMailCacheTable(db);
  ensureMailAttachmentTable(db);
  ensureDraftTombstoneTable(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureDraftTombstoneTable(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_draft_tombstones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      folder TEXT,
      uid INTEGER,
      message_id TEXT,
      local_draft_id TEXT,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_draft_tombstones_local_draft_id
    ON mail_draft_tombstones(local_draft_id)
    WHERE local_draft_id IS NOT NULL
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_draft_tombstones_uid
    ON mail_draft_tombstones(account_id, folder, uid)
    WHERE uid IS NOT NULL
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_draft_tombstones_message
    ON mail_draft_tombstones(account_id, folder, message_id)
    WHERE message_id IS NOT NULL
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureMailAttachmentTable(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_attachments (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      folder TEXT NOT NULL DEFAULT 'INBOX',
      uid INTEGER NOT NULL,
      message_id TEXT,
      filename TEXT NOT NULL DEFAULT 'attachment',
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL DEFAULT 0,
      content_id TEXT,
      disposition TEXT,
      inline INTEGER NOT NULL DEFAULT 0,
      part_id TEXT,
      attachment_id TEXT,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_attachments_mail
    ON mail_attachments(account_id, folder, uid)
  `);
}

function isDownloadableAttachmentMetadata(attachment: MailAttachmentMetadata): boolean {
  const disposition = attachment.disposition?.toLowerCase();
  const contentType = attachment.contentType?.toLowerCase() || '';
  const isInlineCidImage = Boolean(attachment.cid || attachment.contentId) &&
    (attachment.inline === true || disposition === 'inline' || contentType.startsWith('image/'));
  return !isInlineCidImage;
}

function hasDownloadableAttachmentMetadata(attachments?: MailAttachmentMetadata[]): boolean {
  return Array.isArray(attachments) && attachments.some(isDownloadableAttachmentMetadata);
}

function replaceCachedAttachments(
  db: Database.Database,
  mail: Pick<MailSummaryStored, 'accountId' | 'folder' | 'uid' | 'messageId' | 'attachments'>,
): void {
  if (!Array.isArray(mail.attachments)) return;

  db.prepare(`
    DELETE FROM mail_attachments
    WHERE account_id = ? AND folder = ? AND uid = ?
  `).run(mail.accountId, mail.folder, mail.uid);

  if (mail.attachments.length === 0) return;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO mail_attachments
      (id, account_id, folder, uid, message_id, filename, content_type, size, content_id, disposition, inline, part_id, attachment_id, cached_at)
    VALUES
      (@id, @accountId, @folder, @uid, @messageId, @filename, @contentType, @size, @contentId, @disposition, @inline, @partId, @attachmentId, @cachedAt)
  `);

  const cachedAt = new Date().toISOString();
  mail.attachments.forEach((attachment, index) => {
    insert.run({
      id: `${mail.accountId}:${mail.folder}:${mail.uid}:${index}`,
      accountId: mail.accountId,
      folder: mail.folder,
      uid: mail.uid,
      messageId: mail.messageId ?? null,
      filename: attachment.filename || 'attachment',
      contentType: attachment.contentType || 'application/octet-stream',
      size: Number.isFinite(attachment.size) ? Math.max(0, Math.floor(attachment.size)) : 0,
      contentId: attachment.contentId ?? null,
      disposition: attachment.disposition ?? null,
      inline: attachment.inline ? 1 : 0,
      partId: attachment.partId ?? null,
      attachmentId: attachment.attachmentId ?? null,
      cachedAt,
    });
  });
}

function getCachedAttachments(accountId: number, folder: string, uid: number): MailAttachmentMetadata[] {
  const db = getMailCacheDb();
  const rows = db.prepare(`
    SELECT id, filename, content_type, size, content_id, disposition, inline, part_id, attachment_id
    FROM mail_attachments
    WHERE account_id = ? AND folder = ? AND uid = ?
    ORDER BY id ASC
  `).all(accountId, folder, uid) as Record<string, unknown>[];

  return rows.map((row) => {
    const contentId = row.content_id != null ? String(row.content_id) : undefined;
    return {
      cacheId: row.id != null ? String(row.id) : undefined,
      filename: row.filename != null ? String(row.filename) : 'attachment',
      contentType: row.content_type != null ? String(row.content_type) : 'application/octet-stream',
      size: Number(row.size || 0),
      contentId,
      disposition: row.disposition != null ? String(row.disposition) : undefined,
      inline: Boolean(row.inline),
      cid: contentId,
      partId: row.part_id != null ? String(row.part_id) : undefined,
      attachmentId: row.attachment_id != null ? String(row.attachment_id) : undefined,
    };
  });
}

export function getCachedAttachmentMetadata(
  accountId: number,
  folder: string,
  uid: number,
  attachmentCacheId: string,
): MailAttachmentMetadata | null {
  const db = getMailCacheDb();
  const row = db.prepare(`
    SELECT id, filename, content_type, size, content_id, disposition, inline, part_id, attachment_id
    FROM mail_attachments
    WHERE account_id = ? AND folder = ? AND uid = ? AND id = ?
    LIMIT 1
  `).get(accountId, folder, uid, attachmentCacheId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const contentId = row.content_id != null ? String(row.content_id) : undefined;
  return {
    cacheId: row.id != null ? String(row.id) : undefined,
    filename: row.filename != null ? String(row.filename) : 'attachment',
    contentType: row.content_type != null ? String(row.content_type) : 'application/octet-stream',
    size: Number(row.size || 0),
    contentId,
    disposition: row.disposition != null ? String(row.disposition) : undefined,
    inline: Boolean(row.inline),
    cid: contentId,
    partId: row.part_id != null ? String(row.part_id) : undefined,
    attachmentId: row.attachment_id != null ? String(row.attachment_id) : undefined,
  };
}

function getCachedUids(accountId: number, folder: string): Set<number> {
  const db = getMailCacheDb();
  const rows = db.prepare(
    'SELECT uid FROM mail_cache WHERE account_id = ? AND folder = ?'
  ).all(accountId, folder) as { uid: number }[];
  return new Set(rows.map(r => r.uid));
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

function resolveDraftDeleteLocalId(identity: DraftDeleteIdentity): string | null {
  return resolveLocalDraftId({
    id: identity.id,
    messageId: identity.messageId,
    localDraftId: identity.localDraftKey,
  });
}

function isDraftTombstoned(
  db: Database.Database,
  identity: DraftDeleteIdentity,
): boolean {
  const localDraftId = resolveDraftDeleteLocalId(identity);
  if (localDraftId) {
    const row = db.prepare(`
      SELECT 1 FROM mail_draft_tombstones
      WHERE local_draft_id = ?
      LIMIT 1
    `).get(localDraftId);
    if (row) return true;
  }

  const accountId = Number(identity.accountId);
  const folder = normalizeOptionalString(identity.folder);
  if (!Number.isFinite(accountId) || !folder) return false;

  const uid = Number(identity.uid);
  if (Number.isFinite(uid)) {
    const row = db.prepare(`
      SELECT 1 FROM mail_draft_tombstones
      WHERE account_id = ? AND folder = ? AND uid = ?
      LIMIT 1
    `).get(accountId, folder, uid);
    if (row) return true;
  }

  const messageId = normalizeOptionalString(identity.messageId);
  if (messageId) {
    const row = db.prepare(`
      SELECT 1 FROM mail_draft_tombstones
      WHERE account_id = ? AND folder = ? AND message_id = ?
      LIMIT 1
    `).get(accountId, folder, messageId);
    if (row) return true;
  }

  return false;
}

function insertDraftTombstone(
  db: Database.Database,
  identity: DraftDeleteIdentity,
): void {
  const localDraftId = resolveDraftDeleteLocalId(identity);
  const folder = normalizeOptionalString(identity.folder);
  const accountId = Number(identity.accountId);
  const uid = Number(identity.uid);
  const messageId = normalizeOptionalString(identity.messageId);
  const hasServerIdentity = Number.isFinite(accountId) && folder && (Number.isFinite(uid) || messageId);

  if (!localDraftId && !hasServerIdentity) return;

  db.prepare(`
    INSERT INTO mail_draft_tombstones
      (account_id, folder, uid, message_id, local_draft_id, deleted_at)
    VALUES
      (@accountId, @folder, @uid, @messageId, @localDraftId, @deletedAt)
  `).run({
    accountId: Number.isFinite(accountId) ? accountId : null,
    folder,
    uid: Number.isFinite(uid) ? uid : null,
    messageId,
    localDraftId,
    deletedAt: new Date().toISOString(),
  });
}

function upsertMailCache(mail: MailSummaryStored): void {
  const db = getMailCacheDb();
  if (folderMatches(mail.folder, 'drafts') && isDraftTombstoned(db, {
    accountId: mail.accountId,
    folder: mail.folder,
    uid: mail.uid,
    id: mail.id,
    messageId: mail.messageId,
    localDraftKey: mail.localDraftKey,
  })) {
    log.info('[mailService] skipped tombstoned draft cache row', {
      accountId: mail.accountId,
      folder: mail.folder,
      uid: mail.uid,
      hasMessageId: Boolean(mail.messageId),
      hasLocalDraftKey: Boolean(mail.localDraftKey),
    });
    return;
  }

  const existingByUid = db.prepare(`
    SELECT id, uid, snippet, has_attachments, message_id, in_reply_to, references_header, body_html, body_text, draft_payload, local_draft_id, local_send_id, delivery_state, delivery_error, category, is_scanned, scan_result
    FROM mail_cache
    WHERE account_id = ? AND folder = ? AND uid = ?
  `).get(mail.accountId, mail.folder, mail.uid) as Record<string, unknown> | undefined;
  const existingByMessageId = !existingByUid && mail.messageId
    ? db.prepare(`
        SELECT id, uid, snippet, has_attachments, message_id, in_reply_to, references_header, body_html, body_text, draft_payload, local_draft_id, local_send_id, delivery_state, delivery_error, category, is_scanned, scan_result
        FROM mail_cache
        WHERE account_id = ? AND folder = ? AND message_id = ?
        ORDER BY
          CASE WHEN body_html IS NOT NULL OR body_text IS NOT NULL THEN 0 ELSE 1 END,
          datetime(cached_at) DESC
        LIMIT 1
      `).get(mail.accountId, mail.folder, mail.messageId) as Record<string, unknown> | undefined
    : undefined;
  const existing = existingByUid ?? existingByMessageId;
  const hasAttachments = Array.isArray(mail.attachments)
    ? hasDownloadableAttachmentMetadata(mail.attachments)
    : (mail.hasAttachments || Boolean(existing?.has_attachments));
  const keepDraftPayload = !mail.deliveryState || mail.deliveryState === 'scheduled' || mail.deliveryState === 'cancelled';

  db.prepare(`
    INSERT OR REPLACE INTO mail_cache
      (id, uid, "from", from_name, "to", subject, date, snippet,
       has_attachments, is_read, is_starred, folder, account_id, cached_at,
       message_id, in_reply_to, references_header, body_html, body_text, draft_payload, local_draft_id, local_send_id, delivery_state, delivery_error, category, is_scanned, scan_result)
    VALUES
      (@id, @uid, @from, @fromName, @to, @subject, @date, @snippet,
       @hasAttachments, @isRead, @isStarred, @folder, @accountId, @cachedAt,
       @messageId, @inReplyTo, @references, @bodyHtml, @bodyText, @draftPayload, @localDraftId, @localSendId, @deliveryState, @deliveryError, @category, @isScanned, @scanResult)
  `).run({
    id: mail.id,
    uid: mail.uid,
    from: mail.from,
    fromName: mail.fromName,
    to: mail.to,
    subject: mail.subject,
    date: typeof mail.date === 'string' ? mail.date : (mail.date as Date).toISOString(),
    snippet: mail.snippet || (existing?.snippet as string | undefined) || '',
    hasAttachments: hasAttachments ? 1 : 0,
    isRead: mail.isRead ? 1 : 0,
    isStarred: mail.isStarred ? 1 : 0,
    folder: mail.folder,
    accountId: mail.accountId,
    cachedAt: new Date().toISOString(),
    messageId: mail.messageId ?? existing?.message_id ?? null,
    inReplyTo: mail.inReplyTo ?? existing?.in_reply_to ?? null,
    references: mail.references ?? existing?.references_header ?? null,
    bodyHtml: mail.bodyHtml ?? existing?.body_html ?? null,
    bodyText: mail.bodyText ?? existing?.body_text ?? null,
    draftPayload: keepDraftPayload ? (mail.draftPayload ?? existing?.draft_payload ?? null) : null,
    localDraftId: resolveLocalDraftId({
      id: mail.id,
      messageId: mail.messageId ?? (existingByUid?.message_id as string | undefined),
      localDraftId: mail.localDraftKey ?? (existingByUid?.local_draft_id as string | undefined),
    }),
    localSendId: mail.localSendId ?? existing?.local_send_id ?? null,
    deliveryState: mail.deliveryState ?? existing?.delivery_state ?? null,
    deliveryError: mail.deliveryError ?? existing?.delivery_error ?? null,
    category: mail.category ?? existing?.category ?? null,
    isScanned: mail.isScanned != null ? (mail.isScanned ? 1 : 0) : ((existing?.is_scanned as number | undefined) ?? 0),
    scanResult: mail.scanResult ?? existing?.scan_result ?? null,
  });

  replaceCachedAttachments(db, mail);

  if (existingByMessageId && existingByMessageId.uid !== mail.uid) {
    db.prepare(`
      DELETE FROM mail_cache
      WHERE account_id = ?
        AND folder = ?
        AND message_id = ?
        AND uid != ?
        AND local_draft_id IS NULL
    `).run(mail.accountId, mail.folder, mail.messageId, mail.uid);
  }
}

export function pruneCachedMailStore(range: MailCacheRange, accountId?: number, folder?: string): number {
  const maxAgeMs = mailCacheRangeToMs(range);
  if (maxAgeMs == null) return 0;

  const db = getMailCacheDb();
  const cutoffIso = new Date(Date.now() - maxAgeMs).toISOString();

  const result = accountId != null && folder
    ? db.prepare(`
        UPDATE mail_cache
        SET body_html = NULL, body_text = NULL
        WHERE account_id = ? AND folder = ? AND datetime(date) < datetime(?)
          AND (body_html IS NOT NULL OR body_text IS NOT NULL)
      `).run(accountId, folder, cutoffIso)
    : accountId != null
      ? db.prepare(`
          UPDATE mail_cache
          SET body_html = NULL, body_text = NULL
          WHERE account_id = ? AND datetime(date) < datetime(?)
            AND (body_html IS NOT NULL OR body_text IS NOT NULL)
        `).run(accountId, cutoffIso)
      : db.prepare(`
          UPDATE mail_cache
          SET body_html = NULL, body_text = NULL
          WHERE datetime(date) < datetime(?)
            AND (body_html IS NOT NULL OR body_text IS NOT NULL)
        `).run(cutoffIso);
  return Number(result.changes || 0);
}

function getConfiguredMailCacheRange(): MailCacheRange {
  return coerceMailCacheRange(getSetting(MAIL_CACHE_RANGE_SETTING_KEY));
}

function getHistorySyncCompleteKey(
  accountId: number,
  folder: string,
  historyRange: MailHistoryRange,
  _cacheRange: MailCacheRange,
): string {
  return `${HISTORY_SYNC_COMPLETE_PREFIX}:${accountId}:${encodeURIComponent(folder)}:${historyRange}`;
}

function getLegacyHistorySyncCompleteKey(
  accountId: number,
  folder: string,
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
): string {
  return `${HISTORY_SYNC_COMPLETE_PREFIX}:${accountId}:${encodeURIComponent(folder)}:${historyRange}:${cacheRange}`;
}

function isHistorySyncComplete(
  accountId: number,
  folder: string,
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
): boolean {
  return getSetting(getHistorySyncCompleteKey(accountId, folder, historyRange, cacheRange)) === '1' ||
    getSetting(getLegacyHistorySyncCompleteKey(accountId, folder, historyRange, cacheRange)) === '1';
}

function markHistorySyncComplete(
  accountId: number,
  folder: string,
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
): void {
  setSetting(getHistorySyncCompleteKey(accountId, folder, historyRange, cacheRange), '1');
}

function getCachedMails(accountId: number, folder: string, options: CachedMailLoadOptions & { historyCutoffIso?: string | null } = {}): MailSummaryStored[] {
  const db = getMailCacheDb();
  const query = buildCachedMailListQuery({
    accountId,
    folder,
    historyCutoffIso: options.historyCutoffIso,
    limit: options.limit,
    offset: options.offset,
  });
  const rows = db.prepare(query.sql).all(...query.params) as Record<string, unknown>[];

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
    draftPayload: row.draft_payload != null ? (row.draft_payload as string) : undefined,
    localDraftKey: row.local_draft_id != null ? (row.local_draft_id as string) : undefined,
    localSendId: row.local_send_id != null ? (row.local_send_id as string) : undefined,
    deliveryState: row.delivery_state != null ? (row.delivery_state as 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled') : undefined,
    deliveryError: row.delivery_error != null ? (row.delivery_error as string) : undefined,
    category: row.category != null ? (row.category as string) : undefined,
    isScanned: Boolean(row.is_scanned),
    scanResult: row.scan_result != null ? (row.scan_result as string) : undefined,
  }));
}

function getLatestCachedMailTimestamp(accountId: number, folder: string): number | null {
  const db = getMailCacheDb();
  const row = db.prepare(`
    SELECT MAX(date) as latest_date
    FROM mail_cache
    WHERE account_id = ? AND folder = ?
  `).get(accountId, folder) as { latest_date?: string | null } | undefined;

  if (!row?.latest_date) return null;
  const timestamp = new Date(row.latest_date).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getCachedMailRecordsWithBodies(accountId: number, folder: string): MailSummaryStored[] {
  const db = getMailCacheDb();
  const rows = db.prepare(`
    SELECT id, uid, "from", from_name, "to", subject, date, snippet,
           has_attachments, is_read, is_starred, folder, account_id, cached_at,
           message_id, in_reply_to, references_header, body_html, body_text, draft_payload, local_draft_id, local_send_id, delivery_state, delivery_error, category, is_scanned, scan_result
    FROM mail_cache
    WHERE account_id = ? AND folder = ?
    ORDER BY uid DESC
  `).all(accountId, folder) as Record<string, unknown>[];

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
    bodyHtml: row.body_html != null ? (row.body_html as string) : undefined,
    bodyText: row.body_text != null ? (row.body_text as string) : undefined,
    draftPayload: row.draft_payload != null ? (row.draft_payload as string) : undefined,
    localDraftKey: row.local_draft_id != null ? (row.local_draft_id as string) : undefined,
    localSendId: row.local_send_id != null ? (row.local_send_id as string) : undefined,
    deliveryState: row.delivery_state != null ? (row.delivery_state as 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled') : undefined,
    deliveryError: row.delivery_error != null ? (row.delivery_error as string) : undefined,
    category: row.category != null ? (row.category as string) : undefined,
    isScanned: Boolean(row.is_scanned),
    scanResult: row.scan_result != null ? (row.scan_result as string) : undefined,
    attachments: getCachedAttachments(row.account_id as number, row.folder as string, row.uid as number),
  }));
}

/** Fetch only the body fields from SQLite (for session reuse after first fetch) */
export function getCachedBody(accountId: number, uid: number, folder: string = 'INBOX'): { bodyHtml?: string; bodyText?: string; attachments?: MailAttachmentMetadata[] } | null {
  const db = getMailCacheDb();
  const row = db.prepare(`
    SELECT body_html, body_text FROM mail_cache WHERE account_id = ? AND folder = ? AND uid = ?
  `).get(accountId, folder, uid) as Record<string, unknown> | undefined;
  if (!row) return null;
  const attachments = getCachedAttachments(accountId, folder, uid);
  return {
    bodyHtml: row.body_html != null ? (row.body_html as string) : undefined,
    bodyText: row.body_text != null ? (row.body_text as string) : undefined,
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

// ─── IMAP fetch via existing mail.ts ────────────────────────────────────────

async function fetchFromImap(
  accountId: number,
  folder: string,
  historyRange?: MailHistoryRange,
  cachedCount: number = 0,
  forceHistoryRange: boolean = false,
  onPage?: (page: MailSummary[], totalLoadedCount: number) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<number> {
  const historyWindowMs = historyRange ? mailHistoryRangeToMs(historyRange) : null;
  const useHistoryRange = shouldUseHistoryRange(cachedCount, forceHistoryRange);
  const historySince = historyWindowMs != null && useHistoryRange
    ? new Date(Date.now() - historyWindowMs)
    : null;
  const latestCachedTimestamp = !useHistoryRange && cachedCount > 0
    ? getLatestCachedMailTimestamp(accountId, folder)
    : null;
  const incrementalSince = latestCachedTimestamp != null
    ? new Date(Math.max(0, latestCachedTimestamp - INCREMENTAL_SYNC_SAFETY_MS))
    : null;
  const querySince = historySince ?? incrementalSince;
  const shouldPage = useHistoryRange || incrementalSince != null;
  const pageSize = 200;
  let totalLoadedCount = 0;
  let offset = 0;

  while (true) {
    if (signal?.aborted) {
      throw new Error('Sync aborted after timeout');
    }

    const batch = await fetchMailList(accountId, folder, { limit: pageSize, offset, historySince: querySince });
    if (signal?.aborted) {
      throw new Error('Sync aborted after timeout');
    }

    const normalized = batch.map(m => ({
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
    totalLoadedCount += normalized.length;
    if (normalized.length > 0) {
      await onPage?.(normalized, totalLoadedCount);
    }

    if (batch.length < pageSize) {
      break;
    }

    if (!shouldPage) {
      break;
    }

    offset += pageSize;
  }

  return totalLoadedCount;
}

// ─── 15-second timeout wrapper ───────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

function getSyncTimeoutMs(historyRange?: MailHistoryRange, forceHistoryRange: boolean = false): number {
  if (forceHistoryRange || historyRange === 'all') return 120000;
  if (historyRange === '6mo' || historyRange === '1y') return 60000;
  return 15000;
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function syncMailsOnce(
  accountId: number,
  folder: string = 'INBOX',
  options?: SyncMailOptions,
): Promise<SyncResult> {
  const errors: string[] = [];

  try {
    // Step 1: Fetch from IMAP (real connection via mail.ts → imap-client)
    const cachedUids = getCachedUids(accountId, folder);
    const newMails: MailSummary[] = [];
    const seenNewUids = new Set<number>();
    let remoteMailCount = 0;
    try {
      const syncAbortController = new AbortController();
      remoteMailCount = await withTimeout(
        fetchFromImap(
          accountId,
          folder,
          options?.historyRange,
          cachedUids.size,
          options?.forceHistoryRange === true,
          async (page, loadedCount) => {
            for (const mail of page) {
              upsertMailCache({
                ...mail,
                cachedAt: new Date().toISOString(),
              } as unknown as MailSummaryStored);

              if (!cachedUids.has(mail.uid) && !seenNewUids.has(mail.uid)) {
                newMails.push(mail);
                seenNewUids.add(mail.uid);
              }

              cachedUids.add(mail.uid);
            }

            await options?.onPageFlushed?.(loadedCount);
          },
          syncAbortController.signal,
        ),
        getSyncTimeoutMs(options?.historyRange, options?.forceHistoryRange === true),
        () => syncAbortController.abort(),
      );
    } catch (err) {
      const e = err as Error;
      log.error('[mailService] fetchFromImap failed:', e.message);
      if (e.message.includes('Timeout') || e.message.includes('timeout')) {
        throw new Error('连接超时，请检查网络后重试');
      }
      throw new Error(e.message);
    }

    // Step 4: Notify for new mails
    if (newMails.length > 0) {
      const account = getAccountById(accountId);
      const folderKind = options?.folderKind ?? (folder.toLowerCase() === 'inbox' ? 'inbox' : 'other');
      const candidate = newMails.find((mail) => {
        const key = buildMailNotificationKey(accountId, folder, mail);
        return shouldNotifyMail({
          notify: options?.notify !== false,
          accountEmail: account?.email,
          appStartedAt,
          mail,
          folderKind,
          alreadyNotified: notifiedMailKeys.has(key),
        });
      });

      if (candidate) {
        const key = buildMailNotificationKey(accountId, folder, candidate);
        notifiedMailKeys.add(key);
        triggerNativeNotification(candidate as MailSummary & { accountId: number; folder: string });
      }
    }

    log.info(`[mailService] sync complete: ${newMails.length} new mails, ${remoteMailCount} total`);
    return { newMails, totalCached: remoteMailCount, errors };
  } catch (err) {
    log.error('[mailService] sync failed:', err);
    throw err;
  }
}

async function syncMailsStaged(
  accountId: number,
  folder: string,
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
  options?: SyncMailOptions,
): Promise<SyncResult> {
  const stages = buildHistoryStages(historyRange);
  let lastResult: SyncResult = { newMails: [], totalCached: 0, errors: [] };

  for (let index = 0; index < stages.length; index += 1) {
    const stageRange = stages[index];
    lastResult = await syncMailsOnce(accountId, folder, {
      ...options,
      historyRange: stageRange,
      forceHistoryRange: true,
      notify: index === 0 ? options?.notify : false,
      onPageFlushed: (loadedCount) => {
        emitStagedSyncProgress({
          accountId,
          folder,
          stageRange,
          loadedCount,
          stageIndex: index,
          totalStages: stages.length,
          done: false,
        });
      },
    });

    pruneCachedMailStore(cacheRange, accountId, folder);

    emitStagedSyncProgress({
      accountId,
      folder,
      stageRange,
      loadedCount: lastResult.totalCached,
      stageIndex: index,
      totalStages: stages.length,
      done: index === stages.length - 1,
    });
  }

  return lastResult;
}

export async function syncMails(
  accountId: number,
  folder: string = 'INBOX',
  options?: SyncMailOptions,
): Promise<SyncResult> {
  const syncKey = `${accountId}:${folder}`;
  const existingSync = syncInFlight.get(syncKey);
  if (existingSync) {
    return existingSync;
  }

  const syncPromise = (async () => {
    const cacheRange = getConfiguredMailCacheRange();
    const historyRange = options?.historyRange ?? '1mo';
    pruneCachedMailStore(cacheRange, accountId, folder);

    const shouldStage = options?.forceHistoryRange === true &&
      !isHistorySyncComplete(accountId, folder, historyRange, cacheRange);

    if (shouldStage) {
      const result = await syncMailsStaged(
        accountId,
        folder,
        historyRange,
        cacheRange,
        options,
      );
      markHistorySyncComplete(accountId, folder, historyRange, cacheRange);
      return result;
    }

    return syncMailsOnce(accountId, folder, {
      ...options,
      forceHistoryRange: false,
    });
  })();

  syncInFlight.set(syncKey, syncPromise);
  try {
    return await syncPromise;
  } finally {
    if (syncInFlight.get(syncKey) === syncPromise) {
      syncInFlight.delete(syncKey);
    }
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

    // Persist body to SQLite so future loads skip IMAP fetch
    upsertMailCache({
      id: detail.id,
      uid: detail.uid,
      from: detail.from,
      fromName: detail.fromName,
      to: detail.to,
      subject: detail.subject,
      date: typeof detail.date === 'string' ? detail.date : detail.date.toISOString(),
      snippet: (detail as Partial<MailSummary>).snippet ?? '',
      hasAttachments: hasDownloadableAttachmentMetadata(detail.attachments),
      isRead: detail.flags.includes('\\Seen'),
      isStarred: detail.flags.includes('\\Flagged'),
      folder,
      accountId,
      cachedAt: new Date().toISOString(),
      messageId: (detail as any).messageId,
      inReplyTo: (detail as any).inReplyTo,
      bodyHtml: detail.bodyHtml,
      bodyText: detail.bodyText,
      attachments: detail.attachments,
    } as unknown as MailSummaryStored);

    detail.attachments = getCachedAttachments(accountId, folder, detail.uid);
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
export function loadCachedMails(
  accountId: number,
  folder: string = 'INBOX',
  historyRange?: MailHistoryRange,
  options: CachedMailLoadOptions = {},
): MailSummary[] {
  try {
    pruneCachedMailStore(getConfiguredMailCacheRange(), accountId, folder);
    const historyWindowMs = historyRange ? mailHistoryRangeToMs(historyRange) : null;
    const historyCutoffIso = historyWindowMs == null
      ? null
      : new Date(Date.now() - historyWindowMs).toISOString();
    const cached = getCachedMails(accountId, folder, {
      historyCutoffIso,
      limit: options.limit,
      offset: options.offset,
    });
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
      draftPayload: c.draftPayload,
      localDraftKey: c.localDraftKey,
      localSendId: c.localSendId,
      deliveryState: c.deliveryState,
      deliveryError: c.deliveryError,
      category: c.category,
      isScanned: c.isScanned,
      scanResult: c.scanResult,
    } as MailSummary));
  } catch (err) {
    log.warn('[mailService] loadCachedMails failed:', err);
    return [];
  }
}

export function loadCachedMailRecords(accountId: number, folder: string = 'INBOX'): MailSummaryStored[] {
  try {
    return getCachedMailRecordsWithBodies(accountId, folder);
  } catch (err) {
    log.warn('[mailService] loadCachedMailRecords failed:', err);
    return [];
  }
}

export function loadCachedLocalDrafts(accountId?: number): MailSummary[] {
  try {
    const db = getMailCacheDb();
    const localDraftWhere = `
            (
              local_draft_id IS NOT NULL
              OR delivery_state = 'cancelled'
              OR (
                draft_payload IS NOT NULL
                AND (delivery_state IS NULL OR delivery_state = 'cancelled')
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM mail_draft_tombstones tombstone
              WHERE
                (
                  mail_cache.local_draft_id IS NOT NULL
                  AND tombstone.local_draft_id = mail_cache.local_draft_id
                )
                OR (
                  tombstone.account_id = mail_cache.account_id
                  AND tombstone.folder = mail_cache.folder
                  AND (
                    (tombstone.uid IS NOT NULL AND tombstone.uid = mail_cache.uid)
                    OR (
                      tombstone.message_id IS NOT NULL
                      AND mail_cache.message_id IS NOT NULL
                      AND tombstone.message_id = mail_cache.message_id
                    )
                  )
                )
            )
    `;
    const rows = (accountId != null
      ? db.prepare(`
          SELECT id, uid, "from", from_name, "to", subject, date, snippet,
                 has_attachments, is_read, is_starred, folder, account_id, cached_at,
                 message_id, in_reply_to, references_header, body_text, draft_payload, local_draft_id, local_send_id, delivery_state, category, is_scanned, scan_result
          FROM mail_cache
          WHERE account_id = ?
            AND ${localDraftWhere}
          ORDER BY datetime(cached_at) DESC
        `).all(accountId)
      : db.prepare(`
          SELECT id, uid, "from", from_name, "to", subject, date, snippet,
                 has_attachments, is_read, is_starred, folder, account_id, cached_at,
                 message_id, in_reply_to, references_header, body_text, draft_payload, local_draft_id, local_send_id, delivery_state, category, is_scanned, scan_result
          FROM mail_cache
          WHERE ${localDraftWhere}
          ORDER BY datetime(cached_at) DESC
        `).all()) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      uid: row.uid as number,
      from: row.from as string,
      fromName: row.from_name as string,
      to: row.to as string,
      subject: row.subject as string,
      date: new Date(row.date as string),
      flags: [],
      snippet: row.snippet as string,
      hasAttachments: Boolean(row.has_attachments),
      isRead: Boolean(row.is_read),
      isStarred: Boolean(row.is_starred),
      folder: row.folder as string,
      accountId: row.account_id as number,
      messageId: row.message_id != null ? (row.message_id as string) : undefined,
      inReplyTo: row.in_reply_to != null ? (row.in_reply_to as string) : undefined,
      references: row.references_header != null ? (row.references_header as string) : undefined,
      draftPayload: row.draft_payload != null ? (row.draft_payload as string) : undefined,
      localDraftKey: row.local_draft_id != null ? (row.local_draft_id as string) : undefined,
      localSendId: row.local_send_id != null ? (row.local_send_id as string) : undefined,
      deliveryState: row.delivery_state != null ? (row.delivery_state as 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled') : undefined,
      bodyText: row.body_text != null ? (row.body_text as string) : undefined,
      category: row.category != null ? (row.category as string) : undefined,
      isScanned: Boolean(row.is_scanned),
      scanResult: row.scan_result != null ? (row.scan_result as string) : undefined,
    } as MailSummary));
  } catch (err) {
    log.warn('[mailService] loadCachedLocalDrafts failed:', err);
    return [];
  }
}

export function updateCachedMailCategory(
  accountId: number,
  folder: string,
  uid: number,
  category: string,
  scanResult?: string,
): void {
  const db = getMailCacheDb();
  db.prepare(`
    UPDATE mail_cache
    SET category = ?, is_scanned = 1, scan_result = ?, cached_at = ?
    WHERE account_id = ? AND folder = ? AND uid = ?
  `).run(category, scanResult ?? category, new Date().toISOString(), accountId, folder, uid);
}

export function clearCachedMailScanState(
  accountId: number,
  folder: string,
  uid: number,
): void {
  const db = getMailCacheDb();
  db.prepare(`
    UPDATE mail_cache
    SET category = NULL, is_scanned = 0, scan_result = NULL, cached_at = ?
    WHERE account_id = ? AND folder = ? AND uid = ?
  `).run(new Date().toISOString(), accountId, folder, uid);
}

export function updateCachedMailStar(
  accountId: number,
  folder: string,
  uid: number,
  isStarred: boolean,
): void {
  const db = getMailCacheDb();
  db.prepare(`
    UPDATE mail_cache
    SET is_starred = ?, cached_at = ?
    WHERE account_id = ? AND folder = ? AND uid = ?
  `).run(isStarred ? 1 : 0, new Date().toISOString(), accountId, folder, uid);
}

export function updateCachedMailRead(
  accountId: number,
  folder: string,
  uid: number,
  isRead: boolean,
): void {
  const db = getMailCacheDb();
  db.prepare(`
    UPDATE mail_cache
    SET is_read = ?, cached_at = ?
    WHERE account_id = ? AND folder = ? AND uid = ?
  `).run(isRead ? 1 : 0, new Date().toISOString(), accountId, folder, uid);
}

export function saveLocalMailToCache(mail: MailSummaryStored): void {
  upsertMailCache(mail);
}

export function deleteCachedDraft(identity: DraftDeleteIdentity): void {
  const db = getMailCacheDb();
  const localDraftId = resolveDraftDeleteLocalId(identity);
  const accountId = Number(identity.accountId);
  const folder = normalizeOptionalString(identity.folder);
  const uid = Number(identity.uid);
  const messageId = normalizeOptionalString(identity.messageId);
  const id = normalizeOptionalString(identity.id);

  insertDraftTombstone(db, identity);

  const transaction = db.transaction(() => {
    if (localDraftId) {
      db.prepare(`
        DELETE FROM mail_cache
        WHERE local_draft_id = ?
      `).run(localDraftId);
    }

    if (Number.isFinite(accountId) && folder && folderMatches(folder, 'drafts')) {
      if (Number.isFinite(uid)) {
        db.prepare(`
          DELETE FROM mail_cache
          WHERE account_id = ? AND folder = ? AND uid = ?
        `).run(accountId, folder, uid);
      }

      if (messageId) {
        db.prepare(`
          DELETE FROM mail_cache
          WHERE account_id = ? AND folder = ? AND message_id = ?
        `).run(accountId, folder, messageId);
      }
    }

    if (id) {
      db.prepare(`
        DELETE FROM mail_cache
        WHERE id = ?
          AND (
            local_draft_id IS NOT NULL
            OR delivery_state = 'cancelled'
            OR folder IN ('Drafts', 'DRAFTS', '[Gmail]/Drafts', '[Google Mail]/Drafts')
          )
      `).run(id);
    }
  });

  transaction();
}

export function deleteCachedMailById(id: string): void {
  const db = getMailCacheDb();
  const localDraftId = resolveLocalDraftId({ id, localDraftId: id });

  if (localDraftId) {
    deleteCachedDraft({ id, localDraftKey: localDraftId });
    return;
  }

  db.prepare(`
    DELETE FROM mail_cache
    WHERE id = ?
      AND local_draft_id IS NULL
  `).run(id);
}

// ─── Native notification ─────────────────────────────────────────────────────

function triggerNativeNotification(mail: MailSummary & { accountId: number; folder: string }): void {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    const appLanguage = getSetting('app_language');
    const localized = buildLocalizedMailNotificationContent(appLanguage, mail);
    const notification = new Notification({
      title: localized.title,
      body: localized.body,
      icon: getMailNotificationIconPath(),
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
