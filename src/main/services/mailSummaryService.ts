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
  PREHEAT_DAILY_CAPS as _PreheatDailyCapsTypeOnly,
} from '../../shared/email-ai/mailSummaryTypes';

// The import above keeps the shared types linked to this module even though
// they are not yet referenced here; later phases will use them. We re-export
// the type-only PREHEAT_DAILY_CAPS handle to silence the unused import
// warning under noUnusedLocals while preserving the import as a contract
// anchor for downstream tasks.
export type { MailAiSummaryRecord, MailAiThreadSummaryRecord, MailAiSummarySearchHit, MailAiUrgency, PreheatMode, PreheatStatus };
export type _PreheatDailyCapsTypeOnlyAnchor = typeof _PreheatDailyCapsTypeOnly;

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
