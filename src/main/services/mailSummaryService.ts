// Main-process service for mail-level AI summary persistence (Layer 1 of
// the "knowledge bedrock" series). The schema is intentionally minimal in
// Phase 1: two regular tables + one FTS5 virtual table. Read/write/upsert
// helpers live below this block in later phases; do not add them here.
//
// Tables:
//   - mail_ai_summary: one row per (accountId, mailId), updated when the
//     user runs an AI summary on a mail.
//   - mail_ai_thread_summary: one row per (accountId, threadId),
//     monotonically accumulating the latest round on top of the previous
//     overall summary.
//   - mail_ai_summary_fts: FTS5 mirror of mail_ai_summary for the Sidebar
//     "Knowledge Base" search entry. If FTS5 is unavailable on this
//     machine (rare on macOS but possible in some CI images), the search
//     function in Phase 1.6 falls back to LIKE queries against
//     mail_ai_summary directly.

import log from 'electron-log';
import { createHash } from 'node:crypto';
import { getMailCacheDb } from './mailService';
import type {
  MailAiSummaryRecord,
  MailAiThreadSummaryRecord,
  MailAiSummarySearchHit,
  MailAiUrgency,
  PreheatMode,
  PreheatStatus,
} from '../../shared/email-ai/mailSummaryTypes';
import { PREHEAT_DAILY_CAPS } from '../../shared/email-ai/mailSummaryTypes';

export type { MailAiSummaryRecord, MailAiThreadSummaryRecord, MailAiSummarySearchHit, MailAiUrgency, PreheatMode, PreheatStatus };

let schemaReady = false;

export function ensureMailAiSummarySchema(): void {
  if (schemaReady) return;
  const db = getMailCacheDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_ai_summary (
      account_id INTEGER NOT NULL,
      mail_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      what TEXT,
      impact TEXT,
      action TEXT,
      urgency TEXT,
      key_facts_json TEXT NOT NULL DEFAULT '[]',
      key_info_json TEXT NOT NULL DEFAULT '{}',
      quick_replies_json TEXT NOT NULL DEFAULT '[]',
      model TEXT,
      prompt_hash TEXT,
      evidence_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (account_id, mail_id)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_ai_summary_updated
      ON mail_ai_summary(updated_at DESC)
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_ai_thread_summary (
      account_id INTEGER NOT NULL,
      thread_id TEXT NOT NULL,
      thread_subject TEXT,
      thread_participants_json TEXT NOT NULL DEFAULT '[]',
      mail_count INTEGER NOT NULL DEFAULT 0,
      overall_summary TEXT,
      overall_open_loops_json TEXT NOT NULL DEFAULT '[]',
      overall_commitments_json TEXT NOT NULL DEFAULT '[]',
      overall_action_items_json TEXT NOT NULL DEFAULT '[]',
      latest_round_summary TEXT,
      latest_round_at TEXT,
      model TEXT,
      evidence_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (account_id, thread_id)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_ai_thread_summary_updated
      ON mail_ai_thread_summary(updated_at DESC)
  `);
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS mail_ai_summary_fts USING fts5(
        mail_id UNINDEXED,
        account_id UNINDEXED,
        subject,
        what,
        impact,
        action,
        key_facts,
        tokenize='unicode61'
      )
    `);
  } catch (error) {
    log.warn('[mailSummary] FTS5 unavailable, falling back to LIKE', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  schemaReady = true;
}

export function normalizeSubjectForThread(subject: string): string {
  return String(subject || '')
    .toLowerCase()
    .replace(/^(re|fw|fwd|回复|转发)[:：\s]+/gi, '')
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .slice(0, 80);
}

function normalizeParticipants(participants: string[]): string[] {
  return Array.from(
    new Set(
      participants.map((p) => String(p || '').toLowerCase().trim()).filter(Boolean)
    )
  ).sort();
}

export function getOrBuildThreadId(input: { subject: string; from: string; to: string[] }): string {
  const subject = normalizeSubjectForThread(input.subject);
  const participants = normalizeParticipants([input.from, ...(input.to || [])]);
  const seed = `${subject}|${participants.join(',')}`;
  return createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

export function hashPrompt(input: { subject: string; body: string }): string {
  return createHash('sha256')
    .update(`${input.subject || ''}\n${(input.body || '').slice(0, 4000)}`)
    .digest('hex')
    .slice(0, 32);
}

type MailAiSummaryRow = {
  account_id: number;
  mail_id: string;
  subject: string;
  what: string | null;
  impact: string | null;
  action: string | null;
  urgency: string | null;
  key_facts_json: string;
  key_info_json: string;
  quick_replies_json: string;
  model: string | null;
  prompt_hash: string | null;
  evidence_hash: string | null;
  created_at: string;
  updated_at: string;
};

type MailAiThreadSummaryRow = {
  account_id: number;
  thread_id: string;
  thread_subject: string | null;
  thread_participants_json: string;
  mail_count: number;
  overall_summary: string | null;
  overall_open_loops_json: string;
  overall_commitments_json: string;
  overall_action_items_json: string;
  latest_round_summary: string | null;
  latest_round_at: string | null;
  model: string | null;
  evidence_hash: string | null;
  created_at: string;
  updated_at: string;
};

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToSummary(row: MailAiSummaryRow): MailAiSummaryRecord {
  return {
    accountId: row.account_id,
    mailId: row.mail_id,
    subject: row.subject,
    what: row.what || '',
    impact: row.impact,
    action: row.action,
    urgency: (row.urgency as MailAiUrgency) || 'none',
    keyFacts: safeParseJson<string[]>(row.key_facts_json, []),
    keyInfo: safeParseJson<Record<string, string | string[] | null>>(row.key_info_json, {}),
    quickReplies: safeParseJson<MailAiSummaryRecord['quickReplies']>(row.quick_replies_json, []),
    model: row.model || '',
    promptHash: row.prompt_hash || '',
    evidenceHash: row.evidence_hash || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToThreadSummary(row: MailAiThreadSummaryRow): MailAiThreadSummaryRecord {
  return {
    accountId: row.account_id,
    threadId: row.thread_id,
    threadSubject: row.thread_subject || '',
    threadParticipants: safeParseJson<string[]>(row.thread_participants_json, []),
    mailCount: row.mail_count,
    overallSummary: row.overall_summary || '',
    overallOpenLoops: safeParseJson<string[]>(row.overall_open_loops_json, []),
    overallCommitments: safeParseJson<string[]>(row.overall_commitments_json, []),
    overallActionItems: safeParseJson<string[]>(row.overall_action_items_json, []),
    latestRoundSummary: row.latest_round_summary || '',
    latestRoundAt: row.latest_round_at || '',
    model: row.model || '',
    evidenceHash: row.evidence_hash || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getMailSummary(input: { accountId: number; mailId: string }): MailAiSummaryRecord | null {
  ensureMailAiSummarySchema();
  const db = getMailCacheDb();
  const row = db
    .prepare(
      `SELECT * FROM mail_ai_summary WHERE account_id = ? AND mail_id = ?`
    )
    .get(input.accountId, input.mailId) as MailAiSummaryRow | undefined;
  return row ? rowToSummary(row) : null;
}

export function getThreadSummary(input: {
  accountId: number;
  threadId: string;
}): MailAiThreadSummaryRecord | null {
  ensureMailAiSummarySchema();
  const db = getMailCacheDb();
  const row = db
    .prepare(
      `SELECT * FROM mail_ai_thread_summary WHERE account_id = ? AND thread_id = ?`
    )
    .get(input.accountId, input.threadId) as MailAiThreadSummaryRow | undefined;
  return row ? rowToThreadSummary(row) : null;
}

export type UpsertMailSummaryInput = {
  accountId: number;
  mailId: string;
  subject: string;
  summary: Omit<
    MailAiSummaryRecord,
    'accountId' | 'mailId' | 'subject' | 'createdAt' | 'updatedAt' | 'promptHash'
  >;
  promptHash: string;
  evidenceHash?: string;
};

export function upsertMailSummary(input: UpsertMailSummaryInput): MailAiSummaryRecord {
  ensureMailAiSummarySchema();
  const db = getMailCacheDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mail_ai_summary (
      account_id, mail_id, subject, what, impact, action, urgency,
      key_facts_json, key_info_json, quick_replies_json,
      model, prompt_hash, evidence_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, mail_id) DO UPDATE SET
      subject = excluded.subject,
      what = excluded.what,
      impact = excluded.impact,
      action = excluded.action,
      urgency = excluded.urgency,
      key_facts_json = excluded.key_facts_json,
      key_info_json = excluded.key_info_json,
      quick_replies_json = excluded.quick_replies_json,
      model = excluded.model,
      prompt_hash = excluded.prompt_hash,
      evidence_hash = excluded.evidence_hash,
      updated_at = excluded.updated_at`
  ).run(
    input.accountId,
    input.mailId,
    input.subject,
    input.summary.what,
    input.summary.impact,
    input.summary.action,
    input.summary.urgency,
    JSON.stringify(input.summary.keyFacts),
    JSON.stringify(input.summary.keyInfo),
    JSON.stringify(input.summary.quickReplies),
    input.summary.model,
    input.promptHash,
    input.evidenceHash ?? null,
    now,
    now
  );
  syncMailSummaryFts(input.accountId, input.mailId);
  const result = getMailSummary({ accountId: input.accountId, mailId: input.mailId });
  if (!result) throw new Error('mail_ai_summary upsert failed');
  return result;
}

function syncMailSummaryFts(accountId: number, mailId: string): void {
  ensureMailAiSummarySchema();
  const db = getMailCacheDb();
  const row = db
    .prepare(
      `SELECT subject, what, impact, action, key_facts_json FROM mail_ai_summary
       WHERE account_id = ? AND mail_id = ?`
    )
    .get(accountId, mailId) as
    | { subject: string; what: string | null; impact: string | null; action: string | null; key_facts_json: string }
    | undefined;
  if (!row) return;
  const keyFacts = safeParseJson<string[]>(row.key_facts_json, []);
  try {
    db.prepare(`DELETE FROM mail_ai_summary_fts WHERE mail_id = ? AND account_id = ?`).run(
      mailId,
      accountId
    );
    db.prepare(
      `INSERT INTO mail_ai_summary_fts (mail_id, account_id, subject, what, impact, action, key_facts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      mailId,
      accountId,
      row.subject,
      row.what || '',
      row.impact || '',
      row.action || '',
      keyFacts.join(' ')
    );
  } catch (error) {
    log.warn('[mailSummary] FTS sync failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type UpsertThreadSummaryInput = {
  accountId: number;
  threadId: string;
  threadSubject: string;
  participants: string[];
  latestMailId: string;
  overallSummary: string;
  overallOpenLoops: string[];
  overallCommitments: string[];
  overallActionItems: string[];
  latestRoundSummary: string;
  latestRoundAt: string;
  model: string;
  evidenceHash?: string;
};

export function upsertThreadSummary(input: UpsertThreadSummaryInput): MailAiThreadSummaryRecord {
  ensureMailAiSummarySchema();
  const db = getMailCacheDb();
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT mail_count FROM mail_ai_thread_summary WHERE account_id = ? AND thread_id = ?`
    )
    .get(input.accountId, input.threadId) as { mail_count: number } | undefined;
  const mailCount = (existing?.mail_count ?? 0) + 1;
  db.prepare(
    `INSERT INTO mail_ai_thread_summary (
      account_id, thread_id, thread_subject, thread_participants_json,
      mail_count, overall_summary, overall_open_loops_json,
      overall_commitments_json, overall_action_items_json,
      latest_round_summary, latest_round_at, model, evidence_hash,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, thread_id) DO UPDATE SET
      thread_subject = excluded.thread_subject,
      thread_participants_json = excluded.thread_participants_json,
      mail_count = excluded.mail_count,
      overall_summary = excluded.overall_summary,
      overall_open_loops_json = excluded.overall_open_loops_json,
      overall_commitments_json = excluded.overall_commitments_json,
      overall_action_items_json = excluded.overall_action_items_json,
      latest_round_summary = excluded.latest_round_summary,
      latest_round_at = excluded.latest_round_at,
      model = excluded.model,
      evidence_hash = excluded.evidence_hash,
      updated_at = excluded.updated_at`
  ).run(
    input.accountId,
    input.threadId,
    input.threadSubject,
    JSON.stringify(input.participants),
    mailCount,
    input.overallSummary,
    JSON.stringify(input.overallOpenLoops),
    JSON.stringify(input.overallCommitments),
    JSON.stringify(input.overallActionItems),
    input.latestRoundSummary,
    input.latestRoundAt,
    input.model,
    input.evidenceHash ?? null,
    now,
    now
  );
  const result = getThreadSummary({ accountId: input.accountId, threadId: input.threadId });
  if (!result) throw new Error('mail_ai_thread_summary upsert failed');
  return result;
}

function tokenizeQueryForLike(query: string): string[] {
  return String(query || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 6);
}

function buildLikeSnippet(value: string | null | undefined, max = 160): string {
  const v = String(value || '').replace(/\s+/g, ' ').trim();
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

export function searchAiSummaries(input: {
  accountId: number;
  query: string;
  limit?: number;
}): MailAiSummarySearchHit[] {
  ensureMailAiSummarySchema();
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const cleaned = String(input.query || '').trim();
  if (!cleaned) return [];
  const db = getMailCacheDb();
  const ftsQuery = cleaned
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => `${t}*`)
    .join(' ');

  if (ftsQuery) {
    try {
      const rows = db
        .prepare(
          `SELECT mail_id, subject, what, impact, action, bm25(mail_ai_summary_fts) AS score
           FROM mail_ai_summary_fts
           WHERE account_id = ? AND mail_ai_summary_fts MATCH ?
           ORDER BY score ASC
           LIMIT ?`
        )
        .all(input.accountId, ftsQuery, limit) as Array<{
        mail_id: string;
        subject: string;
        what: string;
        impact: string;
        action: string;
        score: number;
      }>;
      return rows.map((r) => ({
        mailId: r.mail_id,
        subject: r.subject,
        snippet: buildLikeSnippet(r.what || r.action || r.impact),
        score: -r.score,
        source: 'mail' as const,
      }));
    } catch (error) {
      log.warn('[mailSummary] FTS5 search failed, falling back to LIKE', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const likeTokens = tokenizeQueryForLike(cleaned);
  if (likeTokens.length === 0) return [];
  const where = likeTokens
    .map(() => '(subject LIKE ? OR what LIKE ? OR action LIKE ? OR key_facts_json LIKE ?)')
    .join(' AND ');
  const params: string[] = [];
  for (const t of likeTokens) {
    const wildcard = `%${t}%`;
    params.push(wildcard, wildcard, wildcard, wildcard);
  }
  params.push(String(input.accountId), String(limit));
  const rows = db
    .prepare(
      `SELECT mail_id, subject, what, impact, action FROM mail_ai_summary
       WHERE ${where} AND account_id = ? LIMIT ?`
    )
    .all(...params) as Array<{
    mail_id: string;
    subject: string;
    what: string;
    impact: string;
    action: string;
  }>;
  return rows.map((r, i) => ({
    mailId: r.mail_id,
    subject: r.subject,
    snippet: buildLikeSnippet(r.what || r.action || r.impact),
    score: rows.length - i,
    source: 'mail' as const,
  }));
}

// Phase 1 stubs for the preheat settings helpers. Phase 2 (Task 2.1) will
// replace these with real settings-table-backed implementations, daily cap
// tracking, and queue length reporting. For Phase 1 they return a fixed
// "conservative" status with zero usage so the IPC handlers in 1.8 can be
// registered and the preload allowlist can be validated.
const SETTING_KEY_MODE = 'ai_mail_summary_preheat';
const SETTING_KEY_DAILY_COUNT = 'ai_mail_summary_daily_count';
const SETTING_KEY_DAILY_RESET = 'ai_mail_summary_daily_reset_at';

// Forward declaration for the preheat job queue; Phase 2.2 will fill this in
// with the actual queue + worker. We declare it as `let` here so 2.1 helpers
// can reference `preheatQueue.length` for queueLength reporting without
// TS6200 / block-scoped-before-declared errors.
type PreheatJob = {
  accountId: number;
  mailId: string;
  subject: string;
  bodyText: string;
  enqueuedAt: number;
};
let preheatQueue: PreheatJob[] = [];
let preheatWorkerRunning = false;
let preheatWorkerPromise: Promise<void> | null = null;

export function enqueuePreSummarizeJob(input: { accountId: number; mailIds: string[] }): void {
  const db = getMailCacheDb();
  const stmt = db.prepare(`SELECT subject, body_text FROM mail_cache WHERE id = ? AND account_id = ?`);
  for (const mailId of input.mailIds) {
    const row = stmt.get(mailId, input.accountId) as { subject?: string; body_text?: string | null } | undefined;
    if (!row || !row.body_text) continue;
    preheatQueue.push({
      accountId: input.accountId,
      mailId,
      subject: row.subject || '',
      bodyText: row.body_text,
      enqueuedAt: Date.now(),
    });
  }
}

export async function processPreSummarizeQueue(): Promise<{ processed: number; skipped: number; failed: number }> {
  if (preheatWorkerRunning) return { processed: 0, skipped: 0, failed: 0 };
  const mode = getPreheatMode();
  if (mode === 'off') {
    const skipped = preheatQueue.length;
    preheatQueue.length = 0;
    return { processed: 0, skipped, failed: 0 };
  }
  const cap = PREHEAT_DAILY_CAPS[mode];
  preheatWorkerRunning = true;
  const stats = { processed: 0, skipped: 0, failed: 0 };
  try {
    while (preheatQueue.length > 0) {
      const used = maybeResetDailyCount();
      if (used >= cap) {
        stats.skipped = preheatQueue.length;
        preheatQueue.length = 0;
        break;
      }
      const job = preheatQueue.shift();
      if (!job) break;
      try {
        const existing = getMailSummary({ accountId: job.accountId, mailId: job.mailId });
        if (existing && hashPrompt({ subject: job.subject, body: job.bodyText }) === existing.promptHash) {
          stats.skipped += 1;
          continue;
        }
        await runAiSummaryForJob(job);
        incrementDailyCount();
        stats.processed += 1;
      } catch (err) {
        log.warn('[mailSummary] preheat job failed', {
          mailId: job.mailId,
          error: err instanceof Error ? err.message : String(err),
        });
        stats.failed += 1;
      }
    }
  } finally {
    preheatWorkerRunning = false;
  }
  return stats;
}

async function runAiSummaryForJob(job: PreheatJob): Promise<void> {
  // Lazy import to avoid loading the AI provider stack unless the worker
  // actually runs. This keeps `mailSummaryService.ts` importable from
  // renderer-side test rigs without dragging in the provider manager.
  const { callAI } = await import('./ai');
  const promptHash = hashPrompt({ subject: job.subject, body: job.bodyText });
  const response = await callAI({
    system: 'You summarize a single email. Return one strict JSON object only. No markdown.',
    prompt: `Subject: ${job.subject || '(no subject)'}\n\nBody:\n${job.bodyText.slice(0, 8000)}`,
    temperature: 0.3,
    maxTokens: 600,
  });
  if (!response.success || !response.content) return;
  const parsed = parseAiSummaryResponse(response.content);
  upsertMailSummary({
    accountId: job.accountId,
    mailId: job.mailId,
    subject: job.subject,
    summary: parsed,
    promptHash,
  });
}

function parseAiSummaryResponse(content: string): Omit<MailAiSummaryRecord, 'accountId' | 'mailId' | 'subject' | 'createdAt' | 'updatedAt' | 'promptHash'> {
  const trimmed = content.trim();
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const urgency = String(obj.urgency || 'none');
    const validUrgency = ['now', 'today', 'later', 'none'].includes(urgency) ? urgency : 'none';
    return {
      what: String(obj.what || '').trim(),
      impact: obj.impact == null ? null : String(obj.impact).trim(),
      action: obj.action == null ? null : String(obj.action).trim(),
      urgency: validUrgency as MailAiUrgency,
      keyFacts: Array.isArray(obj.keyFacts)
        ? (obj.keyFacts as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 6)
        : [],
      keyInfo: typeof obj.keyInfo === 'object' && obj.keyInfo
        ? obj.keyInfo as MailAiSummaryRecord['keyInfo']
        : {},
      quickReplies: [],
      model: 'cloud',
    };
  } catch {
    return {
      what: trimmed.slice(0, 240),
      impact: null,
      action: null,
      urgency: 'none',
      keyFacts: [],
      keyInfo: {},
      quickReplies: [],
      model: 'cloud',
    };
  }
}

export function bootstrapPreheatWorker(): void {
  if (preheatWorkerPromise) return;
  preheatWorkerPromise = (async () => {
    await new Promise((r) => setTimeout(r, 2000));
    while (true) {
      try {
        await processPreSummarizeQueue();
      } catch (err) {
        log.warn('[mailSummary] preheat loop error', err);
      }
      await new Promise((r) => setTimeout(r, 60_000));
    }
  })();
}

function getSettingsValue(key: string): string | null {
  try {
    const db = getMailCacheDb();
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function setSettingsValue(key: string, value: string): void {
  const db = getMailCacheDb();
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

function maybeResetDailyCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  const resetAt = getSettingsValue(SETTING_KEY_DAILY_RESET);
  if (resetAt !== today) {
    setSettingsValue(SETTING_KEY_DAILY_RESET, today);
    setSettingsValue(SETTING_KEY_DAILY_COUNT, '0');
    return 0;
  }
  return Number(getSettingsValue(SETTING_KEY_DAILY_COUNT) ?? 0);
}

export function getPreheatMode(): PreheatMode {
  const v = getSettingsValue(SETTING_KEY_MODE);
  if (v === 'off' || v === 'conservative' || v === 'aggressive') return v;
  return 'conservative';
}

export function setPreheatMode(mode: PreheatMode): PreheatStatus {
  if (!['off', 'conservative', 'aggressive'].includes(mode)) {
    throw new Error(`Invalid preheat mode: ${mode}`);
  }
  setSettingsValue(SETTING_KEY_MODE, mode);
  return getPreheatStatus(0);
}

export function getPreheatStatus(_accountId: number): PreheatStatus {
  const mode = getPreheatMode();
  const dailyUsed = maybeResetDailyCount();
  return {
    mode,
    queueLength: preheatQueue.length,
    dailyUsed,
    dailyCap: PREHEAT_DAILY_CAPS[mode],
  };
}

function incrementDailyCount(): void {
  maybeResetDailyCount();
  const next = Number(getSettingsValue(SETTING_KEY_DAILY_COUNT) ?? 0) + 1;
  setSettingsValue(SETTING_KEY_DAILY_COUNT, String(next));
}
