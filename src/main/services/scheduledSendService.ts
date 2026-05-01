import crypto from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';
import log from 'electron-log';

export type ScheduledSendJobStatus = 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'missed';

export interface ScheduledSendJob {
  id: string;
  localSendId: string;
  accountId: number;
  fromEmail: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  editableBody: string;
  outgoingAttachments: unknown[];
  draftPayload?: unknown;
  sentFolderPath?: string;
  scheduledAt: string;
  status: ScheduledSendJobStatus;
  createdAt: string;
  updatedAt: string;
  failureReason?: string;
  lastAttemptAt?: string;
  sentMessageId?: string;
}

export interface CreateScheduledSendJobInput {
  localSendId?: string;
  accountId: number;
  fromEmail?: string;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  editableBody?: string;
  outgoingAttachments?: unknown;
  draftPayload?: unknown;
  sentFolderPath?: string;
  scheduledAt: string | Date;
}

export interface ScheduledSendJobFilter {
  status?: ScheduledSendJobStatus | ScheduledSendJobStatus[];
  accountId?: number;
}

interface ScheduledSendJobRow {
  id: string;
  local_send_id: string;
  account_id: number;
  from_email: string;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  editable_body: string;
  outgoing_attachments_json: string;
  draft_payload_json: string | null;
  sent_folder_path: string | null;
  scheduled_at: string;
  status: ScheduledSendJobStatus;
  created_at: string;
  updated_at: string;
  failure_reason: string | null;
  last_attempt_at: string | null;
  sent_message_id: string | null;
}

interface ScheduledSendStatement {
  run(params?: unknown): { changes: number; lastInsertRowid?: number | bigint };
  get(params?: unknown): unknown;
  all(params?: unknown): unknown[];
}

interface ScheduledSendDatabase {
  exec(sql: string): void;
  prepare(sql: string): ScheduledSendStatement;
  pragma?(sql: string): unknown;
  close(): void;
}

let scheduledSendDb: ScheduledSendDatabase | null = null;
let isScheduledSendSchemaReady = false;
let scheduledSendDbPathOverride: string | null = null;

function getDefaultScheduledSendDbPath(): string {
  // Lazy-load Electron so service tests can provide an explicit database path.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), 'mail_cache.db');
}

function getScheduledSendDb(): ScheduledSendDatabase {
  if (!scheduledSendDb) {
    scheduledSendDb = new Database(scheduledSendDbPathOverride || getDefaultScheduledSendDbPath());
    scheduledSendDb.pragma?.('journal_mode = WAL');
  }

  if (!isScheduledSendSchemaReady) {
    initScheduledSendSchema();
  }

  return scheduledSendDb;
}

export function closeScheduledSendDb(): void {
  if (!scheduledSendDb) return;
  scheduledSendDb.close();
  scheduledSendDb = null;
  isScheduledSendSchemaReady = false;
}

export function configureScheduledSendDbPathForTests(dbPath: string): void {
  closeScheduledSendDb();
  scheduledSendDbPathOverride = dbPath;
}

export function configureScheduledSendDbForTests(db: ScheduledSendDatabase): void {
  closeScheduledSendDb();
  scheduledSendDbPathOverride = null;
  scheduledSendDb = db;
  isScheduledSendSchemaReady = false;
}

export function initScheduledSendSchema(): void {
  const db: ScheduledSendDatabase = scheduledSendDb || new Database(scheduledSendDbPathOverride || getDefaultScheduledSendDbPath());
  if (!scheduledSendDb) {
    scheduledSendDb = db;
    scheduledSendDb.pragma?.('journal_mode = WAL');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_send_jobs (
      id TEXT PRIMARY KEY,
      local_send_id TEXT NOT NULL,
      account_id INTEGER NOT NULL,
      from_email TEXT NOT NULL DEFAULT '',
      to_json TEXT NOT NULL DEFAULT '[]',
      cc_json TEXT NOT NULL DEFAULT '[]',
      bcc_json TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      body_html TEXT,
      editable_body TEXT NOT NULL DEFAULT '',
      outgoing_attachments_json TEXT NOT NULL DEFAULT '[]',
      draft_payload_json TEXT,
      sent_folder_path TEXT,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'sending', 'sent', 'cancelled', 'failed', 'missed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      failure_reason TEXT,
      last_attempt_at TEXT,
      sent_message_id TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_send_jobs_status
    ON scheduled_send_jobs(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_send_jobs_scheduled_at
    ON scheduled_send_jobs(scheduled_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_send_jobs_local_send_id
    ON scheduled_send_jobs(local_send_id)
  `);

  isScheduledSendSchemaReady = true;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeDateIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new Error('Invalid scheduled time');
  return date.toISOString();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function stringifyJson(value: unknown, fallback: unknown): string {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJsonArray(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return normalizeStringArray(parsed);
  } catch {
    return [];
  }
}

function parseUnknownJson(value: string | null | undefined): unknown | undefined {
  if (value == null) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function sanitizeScheduledFailureReason(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason || '');
  return message
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function mapScheduledSendJobRow(row: ScheduledSendJobRow): ScheduledSendJob {
  return {
    id: row.id,
    localSendId: row.local_send_id,
    accountId: row.account_id,
    fromEmail: row.from_email,
    to: parseJsonArray(row.to_json),
    cc: parseJsonArray(row.cc_json),
    bcc: parseJsonArray(row.bcc_json),
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html ?? undefined,
    editableBody: row.editable_body,
    outgoingAttachments: parseUnknownJson(row.outgoing_attachments_json) as unknown[] || [],
    draftPayload: parseUnknownJson(row.draft_payload_json),
    sentFolderPath: row.sent_folder_path ?? undefined,
    scheduledAt: row.scheduled_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    failureReason: row.failure_reason ?? undefined,
    lastAttemptAt: row.last_attempt_at ?? undefined,
    sentMessageId: row.sent_message_id ?? undefined,
  };
}

export function createScheduledSendJob(input: CreateScheduledSendJobInput): ScheduledSendJob {
  const accountId = Number(input.accountId);
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error('Invalid account id');

  const scheduledAt = normalizeDateIso(input.scheduledAt);
  const createdAt = nowIso();
  const id = crypto.randomUUID();
  const localSendId = String(input.localSendId || `scheduled:${accountId}:${crypto.randomUUID()}`);
  const to = normalizeStringArray(input.to);
  const cc = normalizeStringArray(input.cc);
  const bcc = normalizeStringArray(input.bcc);
  const outgoingAttachments = Array.isArray(input.outgoingAttachments) ? input.outgoingAttachments : [];

  getScheduledSendDb().prepare(`
    INSERT INTO scheduled_send_jobs (
      id, local_send_id, account_id, from_email, to_json, cc_json, bcc_json,
      subject, body_text, body_html, editable_body, outgoing_attachments_json,
      draft_payload_json, sent_folder_path, scheduled_at, status, created_at, updated_at
    )
    VALUES (
      @id, @localSendId, @accountId, @fromEmail, @toJson, @ccJson, @bccJson,
      @subject, @bodyText, @bodyHtml, @editableBody, @outgoingAttachmentsJson,
      @draftPayloadJson, @sentFolderPath, @scheduledAt, 'scheduled', @createdAt, @createdAt
    )
  `).run({
    id,
    localSendId,
    accountId,
    fromEmail: String(input.fromEmail || ''),
    toJson: stringifyJson(to, []),
    ccJson: stringifyJson(cc, []),
    bccJson: stringifyJson(bcc, []),
    subject: String(input.subject || ''),
    bodyText: String(input.bodyText || ''),
    bodyHtml: input.bodyHtml ? String(input.bodyHtml) : null,
    editableBody: String(input.editableBody || ''),
    outgoingAttachmentsJson: stringifyJson(outgoingAttachments, []),
    draftPayloadJson: input.draftPayload === undefined ? null : stringifyJson(input.draftPayload, null),
    sentFolderPath: input.sentFolderPath ? String(input.sentFolderPath) : null,
    scheduledAt,
    createdAt,
  });

  log.info('[scheduledSend] job created', { id, accountId, status: 'scheduled', scheduledAt });
  return getScheduledSendJob(id)!;
}

export function getScheduledSendJob(id: string): ScheduledSendJob | null {
  const row = getScheduledSendDb().prepare(`
    SELECT * FROM scheduled_send_jobs WHERE id = ?
  `).get(id) as ScheduledSendJobRow | undefined;
  return row ? mapScheduledSendJobRow(row) : null;
}

export function listScheduledSendJobs(filter: ScheduledSendJobFilter = {}): ScheduledSendJob[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.accountId !== undefined) {
    clauses.push('account_id = @accountId');
    params.accountId = Number(filter.accountId);
  }
  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    if (statuses.length > 0) {
      clauses.push(`status IN (${statuses.map((_, index) => `@status${index}`).join(', ')})`);
      statuses.forEach((status, index) => {
        params[`status${index}`] = status;
      });
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getScheduledSendDb().prepare(`
    SELECT * FROM scheduled_send_jobs
    ${where}
    ORDER BY scheduled_at ASC, created_at ASC
  `).all(params) as ScheduledSendJobRow[];
  return rows.map(mapScheduledSendJobRow);
}

export function cancelScheduledSendJob(id: string): ScheduledSendJob | null {
  const updatedAt = nowIso();
  const result = getScheduledSendDb().prepare(`
    UPDATE scheduled_send_jobs
    SET status = 'cancelled', updated_at = @updatedAt
    WHERE id = @id AND status IN ('scheduled', 'missed', 'failed')
  `).run({ id, updatedAt });

  if (result.changes > 0) {
    const job = getScheduledSendJob(id);
    log.info('[scheduledSend] job cancelled', {
      id,
      accountId: job?.accountId,
      status: job?.status,
      scheduledAt: job?.scheduledAt,
    });
    return job;
  }
  return getScheduledSendJob(id);
}

export function markMissedScheduledJobs(now: string | Date = new Date()): number {
  const updatedAt = nowIso();
  const nowValue = normalizeDateIso(now);
  const result = getScheduledSendDb().prepare(`
    UPDATE scheduled_send_jobs
    SET status = 'missed', updated_at = @updatedAt
    WHERE status = 'scheduled' AND scheduled_at <= @nowValue
  `).run({ updatedAt, nowValue });

  if (result.changes > 0) {
    log.info('[scheduledSend] jobs marked missed', { count: result.changes, now: nowValue });
  }
  return result.changes;
}

export function restoreScheduledSendJobs(now: string | Date = new Date()): {
  missedCount: number;
  scheduled: ScheduledSendJob[];
  missed: ScheduledSendJob[];
} {
  initScheduledSendSchema();
  const missedCount = markMissedScheduledJobs(now);
  const scheduled = listScheduledSendJobs({ status: 'scheduled' });
  const missed = listScheduledSendJobs({ status: 'missed' });
  log.info('[scheduledSend] restore complete', {
    missedCount,
    scheduledCount: scheduled.length,
    missedTotal: missed.length,
  });
  return { missedCount, scheduled, missed };
}

export function tryMarkJobSending(id: string): boolean {
  const now = nowIso();
  const result = getScheduledSendDb().prepare(`
    UPDATE scheduled_send_jobs
    SET status = 'sending', last_attempt_at = @now, updated_at = @now
    WHERE id = @id AND status IN ('scheduled', 'missed', 'failed')
  `).run({ id, now });

  if (result.changes > 0) {
    const job = getScheduledSendJob(id);
    log.info('[scheduledSend] job locked for sending', {
      id,
      accountId: job?.accountId,
      status: job?.status,
      scheduledAt: job?.scheduledAt,
    });
  }
  return result.changes === 1;
}

export function markScheduledJobFailed(id: string, safeReason: unknown): ScheduledSendJob | null {
  const now = nowIso();
  const failureReason = sanitizeScheduledFailureReason(safeReason);
  getScheduledSendDb().prepare(`
    UPDATE scheduled_send_jobs
    SET status = 'failed', failure_reason = @failureReason, updated_at = @now, last_attempt_at = COALESCE(last_attempt_at, @now)
    WHERE id = @id
  `).run({ id, failureReason, now });

  const job = getScheduledSendJob(id);
  log.warn('[scheduledSend] job failed', {
    id,
    accountId: job?.accountId,
    status: job?.status,
    errorType: safeReason instanceof Error ? safeReason.name : typeof safeReason,
  });
  return job;
}

export function markScheduledJobSent(id: string, sentMessageId?: string): ScheduledSendJob | null {
  const now = nowIso();
  getScheduledSendDb().prepare(`
    UPDATE scheduled_send_jobs
    SET status = 'sent', sent_message_id = @sentMessageId, updated_at = @now
    WHERE id = @id
  `).run({ id, sentMessageId: sentMessageId || null, now });

  const job = getScheduledSendJob(id);
  log.info('[scheduledSend] job sent', {
    id,
    accountId: job?.accountId,
    status: job?.status,
    sentMessageId: job?.sentMessageId,
  });
  return job;
}
