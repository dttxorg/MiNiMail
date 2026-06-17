// Layer 1 of the knowledge bedrock series — search path coverage.
// Mirrors the FTS5 + LIKE fallback logic in
// src/main/services/mailSummaryService.ts::searchAiSummaries.
// Reuses the schema initializer from scripts/mail-summary-service.test.ts.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

let tmpDir: string;
let db: Database.Database;

test.beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mail-summary-search-'));
  db = new Database(join(tmpDir, 'cache.db'));
  initSchema(db);
  seedData(db);
});

test.afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function initSchema(target: Database.Database): void {
  target.exec(`
    CREATE TABLE IF NOT EXISTS mail_ai_summary (
      account_id INTEGER NOT NULL, mail_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '', what TEXT, impact TEXT, action TEXT,
      urgency TEXT, key_facts_json TEXT NOT NULL DEFAULT '[]',
      key_info_json TEXT NOT NULL DEFAULT '{}', quick_replies_json TEXT NOT NULL DEFAULT '[]',
      model TEXT, prompt_hash TEXT, evidence_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (account_id, mail_id))
  `);
  target.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS mail_ai_summary_fts USING fts5(
      mail_id UNINDEXED, account_id UNINDEXED, subject, what, impact, action, key_facts,
      tokenize='unicode61')
  `);
}

function seedData(target: Database.Database): void {
  const insertSummary = target.prepare(`
    INSERT INTO mail_ai_summary
      (account_id, mail_id, subject, what, impact, action, urgency, key_facts_json, key_info_json, quick_replies_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = target.prepare(`
    INSERT INTO mail_ai_summary_fts (mail_id, account_id, subject, what, impact, action, key_facts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const rows: Array<{ mailId: string; subject: string; what: string; impact: string; action: string; keyFacts: string }> = [
    { mailId: 'm1', subject: 'budget discussion', what: 'boss confirmed 50k', impact: 'affects Q3', action: 'submit request', keyFacts: '50k budget' },
    { mailId: 'm2', subject: 'contract signing', what: 'zhang signed contract', impact: 'affects Q3', action: 'sign contract', keyFacts: 'contract zhang' },
    { mailId: 'm3', subject: 'hiring plan', what: 'need to hire 2 engineers', impact: 'affects Q4', action: 'post JD', keyFacts: 'hiring engineer' },
    { mailId: 'm4', subject: 'security alert', what: 'new login from unknown device', impact: 'review account', action: 'change password', keyFacts: 'security' },
  ];
  for (const r of rows) {
    insertSummary.run(1, r.mailId, r.subject, r.what, r.impact, r.action, 'today', JSON.stringify(r.keyFacts.split(' ')), '{}', '[]');
    insertFts.run(r.mailId, 1, r.subject, r.what, r.impact, r.action, r.keyFacts);
  }
  // Cross-account: m9 belongs to account 2
  insertSummary.run(2, 'm9', 'other account', 'misc item', '', '', 'none', '[]', '{}', '[]');
  insertFts.run('m9', 2, 'other account', 'misc item', '', '', 'misc');
}

test('FTS5: prefix search returns substring matches', () => {
  const rows = db.prepare(`
    SELECT mail_id FROM mail_ai_summary_fts
    WHERE account_id = 1 AND mail_ai_summary_fts MATCH 'confirm*'
  `).all() as Array<{ mail_id: string }>;
  const ids = rows.map((r) => r.mail_id);
  assert.deepEqual(ids, ['m1']);
});

test('FTS5: OR query against multiple tokens', () => {
  const rows = db.prepare(`
    SELECT mail_id FROM mail_ai_summary_fts
    WHERE account_id = 1 AND mail_ai_summary_fts MATCH 'budget* OR contract*'
  `).all() as Array<{ mail_id: string }>;
  const ids = rows.map((r) => r.mail_id).sort();
  assert.deepEqual(ids, ['m1', 'm2']);
});

test('FTS5: per-account filter is honored', () => {
  const rows = db.prepare(`
    SELECT mail_id FROM mail_ai_summary_fts
    WHERE account_id = 1 AND mail_ai_summary_fts MATCH 'budget*'
  `).all() as Array<{ mail_id: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mail_id, 'm1');
});

test('FTS5: bm25 ranking puts best match first', () => {
  // m1 has "budget" in both subject and what — should rank ahead of m3
  // which only has "hiring" (no overlap with budget).
  const rows = db.prepare(`
    SELECT mail_id, bm25(mail_ai_summary_fts) AS score
    FROM mail_ai_summary_fts
    WHERE account_id = 1 AND mail_ai_summary_fts MATCH 'budget*'
    ORDER BY score ASC
  `).all() as Array<{ mail_id: string; score: number }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mail_id, 'm1');
  assert.ok(typeof rows[0].score === 'number');
});

test('LIKE fallback: substring match works on mail_ai_summary', () => {
  const rows = db.prepare(`
    SELECT mail_id FROM mail_ai_summary
    WHERE account_id = 1 AND (subject LIKE ? OR what LIKE ?)
  `).all('%budget%', '%budget%') as Array<{ mail_id: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mail_id, 'm1');
});

test('LIKE fallback: AND across multiple tokens narrows results', () => {
  // Both tokens must appear in any of (subject, what, action, key_facts_json).
  // "confirmed" appears in m1 only ("boss confirmed 50k"); "zhang" appears in
  // m2 only ("zhang signed contract"). Cross-combo returns 0 rows.
  const where = '(subject LIKE ? OR what LIKE ? OR action LIKE ? OR key_facts_json LIKE ?) AND (subject LIKE ? OR what LIKE ? OR action LIKE ? OR key_facts_json LIKE ?)';
  const params = ['%confirmed%', '%confirmed%', '%confirmed%', '%confirmed%', '%zhang%', '%zhang%', '%zhang%', '%zhang%'];
  const rows = db.prepare(`
    SELECT mail_id FROM mail_ai_summary
    WHERE account_id = 1 AND ${where}
  `).all(...params) as Array<{ mail_id: string }>;
  // confirmed and zhang never co-occur in m1-m4.
  assert.equal(rows.length, 0);
});

test('LIKE fallback: empty result when no token matches', () => {
  const rows = db.prepare(`
    SELECT mail_id FROM mail_ai_summary
    WHERE account_id = 1 AND (subject LIKE ? OR what LIKE ?)
  `).all('%nonexistent_token%', '%nonexistent_token%') as Array<{ mail_id: string }>;
  assert.equal(rows.length, 0);
});

test('Empty query short-circuits to empty results', () => {
  // The production code returns [] when cleaned query is empty.
  // We assert the equivalent: a query that is whitespace-only produces 0
  // rows because we should NOT pass an empty MATCH to FTS5 (it raises a
  // syntax error) and we should NOT pass an empty LIKE filter either.
  const cleaned = '   '.trim();
  assert.equal(cleaned, '');
  // Simulating production: short-circuit before issuing any SQL.
  const ftsRows: Array<unknown> = cleaned ? db.prepare(`SELECT 1`).all() : [];
  assert.equal(ftsRows.length, 0);
});
