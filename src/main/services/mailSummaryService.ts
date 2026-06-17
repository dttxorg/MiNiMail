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
