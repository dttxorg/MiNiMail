// Tests for the mail-level AI summary persistence layer (Layer 1 of the
// "knowledge bedrock" series). These tests exercise the SQL surface
// directly using an in-memory better-sqlite3 database, so the runtime
// service is not required to be importable in a pure-Node test runner.
//
// The same CREATE TABLE / CREATE INDEX / CREATE VIRTUAL TABLE statements
// used in `src/main/services/mailSummaryService.ts::ensureMailAiSummarySchema`
// are replicated here verbatim. If the production schema ever drifts from
// this file, this test must be updated to match.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

let tmpDir: string;
let db: Database.Database;

test.beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mail-summary-test-'));
  db = new Database(join(tmpDir, 'mail_cache.db'));
});

test.afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// Mirrors `ensureMailAiSummarySchema` from src/main/services/mailSummaryService.ts.
function initSchema(target: Database.Database): { ftsOk: boolean } {
  target.exec(`
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
  target.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_ai_summary_updated
      ON mail_ai_summary(updated_at DESC)
  `);
  target.exec(`
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
  target.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_ai_thread_summary_updated
      ON mail_ai_thread_summary(updated_at DESC)
  `);
  let ftsOk = true;
  try {
    target.exec(`
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
  } catch {
    ftsOk = false;
  }
  return { ftsOk };
}

test('schema: creates three tables idempotently', () => {
  const { ftsOk } = initSchema(db);
  assert.ok(ftsOk, 'FTS5 should be available in better-sqlite3');
  // Running initSchema twice must not throw
  initSchema(db);
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table')`)
    .all() as Array<{ name: string }>;
  const names = tables.map((t) => t.name);
  assert.ok(names.includes('mail_ai_summary'));
  assert.ok(names.includes('mail_ai_thread_summary'));
  assert.ok(names.includes('mail_ai_summary_fts'));
});

test('mail_ai_summary: indexes exist on updated_at DESC', () => {
  initSchema(db);
  const indexes = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`)
    .all() as Array<{ name: string }>;
  const names = indexes.map((i) => i.name);
  assert.ok(names.includes('idx_mail_ai_summary_updated'));
  assert.ok(names.includes('idx_mail_ai_thread_summary_updated'));
});

test('mail_ai_summary: upsert round-trips and updates updated_at but preserves created_at', () => {
  initSchema(db);
  const upsert = db.prepare(`
    INSERT INTO mail_ai_summary
      (account_id, mail_id, subject, what, urgency, key_facts_json, prompt_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, mail_id) DO UPDATE SET
      what = excluded.what,
      urgency = excluded.urgency,
      key_facts_json = excluded.key_facts_json,
      prompt_hash = excluded.prompt_hash,
      updated_at = excluded.updated_at
  `);
  const t1 = '2026-06-17T00:00:00.000Z';
  const t2 = '2026-06-17T00:01:00.000Z';
  upsert.run(1, 'm1', '预算', '50w 上限', 'now', '["a"]', 'h1', t1, t1);
  upsert.run(1, 'm1', '预算', '60w 上限', 'now', '["b"]', 'h2', t2, t2);
  const row = db
    .prepare(`SELECT what, key_facts_json, prompt_hash, created_at, updated_at FROM mail_ai_summary WHERE account_id = 1 AND mail_id = 'm1'`)
    .get() as { what: string; key_facts_json: string; prompt_hash: string; created_at: string; updated_at: string };
  assert.equal(row.what, '60w 上限');
  assert.equal(row.prompt_hash, 'h2');
  assert.equal(row.created_at, t1, 'created_at must be preserved on conflict update');
  assert.equal(row.updated_at, t2, 'updated_at must reflect the latest write');
  const keyFacts = JSON.parse(row.key_facts_json);
  assert.deepEqual(keyFacts, ['b']);
});

test('mail_ai_summary: JSON columns store arbitrary structured payloads', () => {
  initSchema(db);
  const payload = {
    what: '老板确认预算',
    impact: '影响 Q3 计划',
    action: '提交申请',
    urgency: 'today',
    keyFacts: ['50w', '周三前', '老板确认'],
    keyInfo: { amount: '50w', deadline: '2026-06-19', owner: 'boss@example.com' },
    quickReplies: [{ style: 'short', body: '好的,周三前提交。' }],
    model: 'cloud',
    promptHash: 'abc123',
  };
  db.prepare(`
    INSERT INTO mail_ai_summary
      (account_id, mail_id, subject, what, impact, action, urgency,
       key_facts_json, key_info_json, quick_replies_json,
       model, prompt_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    1, 'm1', '预算', payload.what, payload.impact, payload.action, payload.urgency,
    JSON.stringify(payload.keyFacts), JSON.stringify(payload.keyInfo),
    JSON.stringify(payload.quickReplies), payload.model, payload.promptHash,
    new Date().toISOString(), new Date().toISOString()
  );
  const row = db.prepare(`SELECT * FROM mail_ai_summary WHERE account_id = 1 AND mail_id = 'm1'`).get() as Record<string, unknown>;
  assert.equal(row.what, payload.what);
  assert.equal(row.impact, payload.impact);
  assert.equal(row.action, payload.action);
  assert.equal(row.urgency, payload.urgency);
  assert.deepEqual(JSON.parse(row.key_facts_json as string), payload.keyFacts);
  assert.deepEqual(JSON.parse(row.key_info_json as string), payload.keyInfo);
  assert.deepEqual(JSON.parse(row.quick_replies_json as string), payload.quickReplies);
  assert.equal(row.model, payload.model);
  assert.equal(row.prompt_hash, payload.promptHash);
});

test('mail_ai_thread_summary: mail_count monotonically increases per upsert', () => {
  initSchema(db);
  // Production behavior: each upsert reads the previous mail_count and writes +1.
  // We mirror that here to verify the schema supports it.
  const select = db.prepare(`SELECT mail_count FROM mail_ai_thread_summary WHERE account_id = ? AND thread_id = ?`);
  const upsert = db.prepare(`
    INSERT INTO mail_ai_thread_summary
      (account_id, thread_id, thread_subject, thread_participants_json, mail_count,
       overall_summary, latest_round_summary, latest_round_at, model, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, thread_id) DO UPDATE SET
      mail_count = excluded.mail_count,
      latest_round_summary = excluded.latest_round_summary,
      latest_round_at = excluded.latest_round_at,
      overall_summary = excluded.overall_summary,
      updated_at = excluded.updated_at
  `);
  const now = new Date().toISOString();
  function nextRound(round: number, summary: string, latest: string): void {
    const existing = select.get(1, 't1') as { mail_count: number } | undefined;
    const mailCount = (existing?.mail_count ?? 0) + 1;
    upsert.run(1, 't1', '预算讨论', '["a@x.com","b@x.com"]', mailCount, summary, latest, now, 'cloud', now, now);
  }
  nextRound(1, '老板确认 50w', '第 1 轮');
  nextRound(2, '老板确认 60w', '第 2 轮');
  nextRound(3, '老板确认 70w', '第 3 轮');
  const row = db.prepare(`SELECT mail_count, overall_summary, latest_round_summary FROM mail_ai_thread_summary WHERE account_id = 1 AND thread_id = 't1'`).get() as { mail_count: number; overall_summary: string; latest_round_summary: string };
  assert.equal(row.mail_count, 3);
  assert.equal(row.overall_summary, '老板确认 70w');
  assert.equal(row.latest_round_summary, '第 3 轮');
});

test('mail_ai_thread_summary: per-account isolation', () => {
  initSchema(db);
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO mail_ai_thread_summary
      (account_id, thread_id, thread_subject, mail_count, overall_summary, model, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)
  `);
  upsert.run(1, 't1', 'a subject', 'a summary', 'cloud', now, now);
  upsert.run(2, 't1', 'a subject', 'b summary', 'cloud', now, now);
  const a = db.prepare(`SELECT overall_summary FROM mail_ai_thread_summary WHERE account_id = 1 AND thread_id = 't1'`).get() as { overall_summary: string };
  const b = db.prepare(`SELECT overall_summary FROM mail_ai_thread_summary WHERE account_id = 2 AND thread_id = 't1'`).get() as { overall_summary: string };
  assert.equal(a.overall_summary, 'a summary');
  assert.equal(b.overall_summary, 'b summary');
});

test('FTS5: prefix search returns substring matches', () => {
  initSchema(db);
  const ins = db.prepare(`
    INSERT INTO mail_ai_summary_fts (mail_id, account_id, subject, what, impact, action, key_facts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  ins.run('m1', 1, 'budget discussion', 'boss confirmed 50k', 'affects Q3', 'submit request', '50k budget');
  ins.run('m2', 1, 'contract signing', 'zhang signed contract', 'affects Q3', 'sign contract', 'contract zhang');
  ins.run('m3', 1, 'hiring plan', 'need to hire 2 engineers', 'affects Q4', 'post JD', 'hiring engineer');
  const rows = db.prepare(`
    SELECT mail_id, bm25(mail_ai_summary_fts) AS score
    FROM mail_ai_summary_fts
    WHERE account_id = 1 AND mail_ai_summary_fts MATCH 'confirm*'
    ORDER BY score ASC
  `).all() as Array<{ mail_id: string; score: number }>;
  const ids = rows.map((r) => r.mail_id).sort();
  assert.deepEqual(ids, ['m1']);
});

test('FTS5: OR query against multiple tokens', () => {
  initSchema(db);
  const ins = db.prepare(`
    INSERT INTO mail_ai_summary_fts (mail_id, account_id, subject, what, impact, action, key_facts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  ins.run('m1', 1, 'budget discussion', 'boss confirmed 50k', 'affects Q3', 'submit request', '50k budget');
  ins.run('m2', 1, 'contract signing', 'zhang signed contract', 'affects Q3', 'sign contract', 'contract zhang');
  ins.run('m3', 1, 'hiring plan', 'need to hire 2 engineers', 'affects Q4', 'post JD', 'hiring engineer');
  const rows = db.prepare(`
    SELECT mail_id FROM mail_ai_summary_fts
    WHERE account_id = 1 AND mail_ai_summary_fts MATCH 'budget* OR contract*'
  `).all() as Array<{ mail_id: string }>;
  const ids = rows.map((r) => r.mail_id).sort();
  assert.deepEqual(ids, ['m1', 'm2']);
});

test('FTS5: per-account filter is honored', () => {
  initSchema(db);
  const ins = db.prepare(`
    INSERT INTO mail_ai_summary_fts (mail_id, account_id, subject, what, impact, action, key_facts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  ins.run('m1', 1, 'budget', 'boss confirmed 50k', 'affects Q3', 'submit request', '50k budget');
  ins.run('m9', 2, 'other account', 'misc item', '', '', '');
  const rows = db.prepare(`
    SELECT mail_id FROM mail_ai_summary_fts
    WHERE account_id = 1 AND mail_ai_summary_fts MATCH 'budget*'
  `).all() as Array<{ mail_id: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mail_id, 'm1');
});

test('LIKE fallback: substring match works on mail_ai_summary', () => {
  initSchema(db);
  db.prepare(`
    INSERT INTO mail_ai_summary
      (account_id, mail_id, subject, what, impact, action, urgency, key_facts_json, key_info_json, quick_replies_json, created_at, updated_at)
    VALUES (1, 'm1', '预算讨论', '50w', 'Q3', '提交', 'now', '["50w"]', '{}', '[]', '2026-06-17T00:00:00Z', '2026-06-17T00:00:00Z')
  `).run();
  db.prepare(`
    INSERT INTO mail_ai_summary
      (account_id, mail_id, subject, what, impact, action, urgency, key_facts_json, key_info_json, quick_replies_json, created_at, updated_at)
    VALUES (1, 'm2', '合同签署', '张三', 'Q3', '签署', 'today', '["合同"]', '{}', '[]', '2026-06-17T00:00:00Z', '2026-06-17T00:00:00Z')
  `).run();
  const rows = db.prepare(`
    SELECT mail_id FROM mail_ai_summary
    WHERE account_id = 1 AND (subject LIKE ? OR what LIKE ?)
  `).all('%预算%', '%预算%') as Array<{ mail_id: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mail_id, 'm1');
});
