import { strict as assert } from 'node:assert';
import test from 'node:test';
import Database from 'better-sqlite3';

const memDb = new Database(':memory:');
memDb.exec(`
  CREATE TABLE mail_ai_summary (
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
  );

  CREATE TABLE mail_ai_thread_summary (
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
    latest_mail_id TEXT,
    model TEXT,
    evidence_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, thread_id)
  );
`);

const DECAY_HALF_LIFE_DAYS = 180;
function computeEffectiveConfidence(updatedAt: string, now: Date = new Date()): number {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return 1;
  const ageDays = Math.max(0, (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
  return Math.pow(2, -ageDays / DECAY_HALF_LIFE_DAYS);
}

function searchTest(query: string, accountId = 1) {
  const cleaned = query.trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const hits: Array<{ id: string; subject: string; source: 'mail' | 'thread'; score: number }> = [];

  // Search mail_ai_summary
  const where = tokens.map(() => '(subject LIKE ? OR what LIKE ?)').join(' AND ');
  const params: string[] = [];
  for (const t of tokens) {
    params.push(`%${t}%`, `%${t}%`);
  }
  params.push(String(accountId));

  const mailRows = memDb.prepare(`
    SELECT mail_id, subject, what, updated_at FROM mail_ai_summary
    WHERE ${where} AND account_id = ?
  `).all(...params) as Array<{ mail_id: string; subject: string; what: string; updated_at: string }>;

  for (let i = 0; i < mailRows.length; i++) {
    const r = mailRows[i];
    const confidence = computeEffectiveConfidence(r.updated_at);
    hits.push({
      id: r.mail_id,
      subject: r.subject,
      source: 'mail',
      score: 10 * confidence,
    });
  }

  // Search mail_ai_thread_summary
  const threadWhere = tokens.map(() => '(thread_subject LIKE ? OR overall_summary LIKE ?)').join(' AND ');
  const threadParams: string[] = [];
  for (const t of tokens) {
    threadParams.push(`%${t}%`, `%${t}%`);
  }
  threadParams.push(String(accountId));

  const threadRows = memDb.prepare(`
    SELECT thread_id, thread_subject, overall_summary, updated_at FROM mail_ai_thread_summary
    WHERE ${threadWhere} AND account_id = ?
  `).all(...threadParams) as Array<{ thread_id: string; thread_subject: string; overall_summary: string; updated_at: string }>;

  for (let i = 0; i < threadRows.length; i++) {
    const tr = threadRows[i];
    const confidence = computeEffectiveConfidence(tr.updated_at);
    hits.push({
      id: tr.thread_id,
      subject: tr.thread_subject,
      source: 'thread',
      score: 12 * confidence,
    });
  }

  return hits.sort((a, b) => b.score - a.score);
}

test('dual source search: returns both mail and thread hits for chinese query', () => {
  // Insert fresh mail
  memDb.prepare(`
    INSERT INTO mail_ai_summary (account_id, mail_id, subject, what, updated_at)
    VALUES (1, 'm1', '项目预算审批', '张总已同意Q3项目预算方案50万', datetime('now'))
  `).run();

  // Insert thread summary
  memDb.prepare(`
    INSERT INTO mail_ai_thread_summary (account_id, thread_id, thread_subject, overall_summary, updated_at)
    VALUES (1, 'th1', '关于Q3项目预算的多轮沟通', '讨论了服务器采购预算与人力成本，最终达成一致', datetime('now'))
  `).run();

  const results = searchTest('预算');
  assert.equal(results.length, 2);
  assert.ok(results.some((r) => r.source === 'mail' && r.id === 'm1'));
  assert.ok(results.some((r) => r.source === 'thread' && r.id === 'th1'));
});

test('confidence decay: fresh hit outranks older hit with same keyword', () => {
  // Fresh hit
  memDb.prepare(`
    INSERT INTO mail_ai_summary (account_id, mail_id, subject, what, updated_at)
    VALUES (1, 'fresh_mail', '发票寄送提醒', '今天寄出了增值税发票', datetime('now'))
  `).run();

  // 1 year old hit (365 days ago)
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  memDb.prepare(`
    INSERT INTO mail_ai_summary (account_id, mail_id, subject, what, updated_at)
    VALUES (1, 'old_mail', '发票寄送记录', '去年的老发票已归档', ?)
  `).run(oneYearAgo);

  const results = searchTest('发票');
  assert.equal(results[0].id, 'fresh_mail');
  assert.ok(results[0].score > results[1].score * 2);
});
