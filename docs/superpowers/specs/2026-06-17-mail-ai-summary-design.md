# Mail-Level AI Summary Persistence — Design Spec

**Date:** 2026-06-17
**Status:** Draft → Pending user review
**Owner:** MiNiMail core
**Scope:** Layer 1 of the "AI knowledge bedrock" series (L1 of 5)

---

## 1. Problem statement

MiNiMail 已经把**联系人维度**的知识沉淀下来了(`contact_knowledge_wikis` + `contact_knowledge_chunks` + FTS5),并且这些档案会注入到 5 个 AI prompt(summary / reply / quick-reply / key-info / action-suggestions)。

但是**邮件维度**的知识沉淀仍然是空的:

- `assistantResultCache` 是 renderer 内存 `Map`,关掉 MailDetail 标签就没了。
- `mail_cache` 没有 `ai_summary` / `ai_key_info` / `ai_quick_reply` 字段。
- 用户问"上个月老板跟我说的预算到底是多少"——只能从 chunks 全文搜,搜不到 AI 已经抽象过的语义。
- 每次重开同一封邮件,AI 总结都要重新调云端,既慢又贵。

这意味着 MiNiMail 的"AI 原生"承诺,在"知识沉淀"半边只完成了一半:有 per-contact 档案,但没有 per-mail / per-thread 时间线。

---

## 2. Goal & non-goals

### Goal

把 AI 对**每封邮件**和**每个会话(thread)**的结构化总结持久化到 SQLite,让 MiNiMail 的"深度回复 + 总结 + 长期关系记忆"三个场景共用一个**邮件级语义地基**。

### Non-goals(留给后续 PR)

- **L3:** 给 contact wiki 的每条 insight 加 `evidenceIds` provenance。
- **L4:** wiki 自动后台 rebuild + 在 Sidebar / MailDetail 主动展示。
- **L5:** 知识变更时间线 + 置信度衰减。
- 跨设备同步(本 PR 不碰 `syncReadiness`)。
- 多模态总结(图片附件摘要)。

---

## 3. Decisions confirmed with user

| 决策点 | 选择 |
|---|---|
| 核心场景 | **三个都要**:深度回复 / 邮件总结 / 长期联系人关系记忆 |
| 成本策略 | **客户自主决定**:Settings 里加开关,默认 conservative |
| 优先层 | **L1**:邮件级总结回写 DB + 检索 |
| 总结粒度 | **双轨**:mail 级 + thread 级并存 |
| 触发策略 | **首次点 AI 后后台预热**:用户首次点 AI 时同步落库,后续后台异步补齐最近 7 天"已点开过但未总结"的邮件 |
| 检索入口 | **Sidebar 加独立入口**"📚 知识库",全局自然语言查询 |

---

## 4. Architecture overview

```
┌────────────────────────────────────────────────────────────┐
│ Renderer (MailDetail.tsx)                                   │
│   1. user clicks AI button                                  │
│   2. cache miss → IPC call → write back to DB after success │
│   3. cache hit → reuse in-memory                            │
│   4. Sidebar 知识库入口 → invokes search IPC                │
└─────────────┬──────────────────────────┬───────────────────┘
              │                          │
              ▼                          ▼
┌─────────────────────────┐    ┌──────────────────────────┐
│ ai:upsertMailSummary    │    │ ai:searchSummaries       │
│ ai:upsertThreadSummary  │    │  (FTS5 + bm25)           │
│ ai:getMailSummary       │    │                          │
└─────────────┬───────────┘    └──────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────┐
│ main/services/mailSummaryService.ts          │
│   - ensureSchema()                           │
│   - buildMailSummary()  → call AI            │
│   - buildThreadSummary() → call AI           │
│   - enqueuePreSummarizeJob()                 │
│   - processPreSummarizeQueue()               │
│   - markStale()                              │
└─────────────┬────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────┐
│ SQLite (mail_cache.db)                       │
│   mail_ai_summary                            │
│   mail_ai_summary_fts (FTS5)                 │
│   mail_ai_thread_summary                     │
└──────────────────────────────────────────────┘
```

---

## 5. Database schema

所有表都加在现有 `mail_cache.db`(沿用 `CREATE TABLE IF NOT EXISTS` + 幂等 `ALTER TABLE` 风格,不引入 migration 框架)。

### 5.1 `mail_ai_summary` — 邮件级总结

```sql
CREATE TABLE IF NOT EXISTS mail_ai_summary (
  account_id INTEGER NOT NULL,
  mail_id TEXT NOT NULL,                -- = mail_cache.id
  subject TEXT NOT NULL DEFAULT '',
  what TEXT,
  impact TEXT,
  action TEXT,
  urgency TEXT,                         -- now|today|later|none
  key_facts_json TEXT NOT NULL DEFAULT '[]',
  key_info_json TEXT NOT NULL DEFAULT '{}',
  quick_replies_json TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  prompt_hash TEXT,                     -- 邮件 body+subject 的 content_hash
  evidence_hash TEXT,                   -- 关联到 contact_knowledge
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, mail_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_ai_summary_updated
  ON mail_ai_summary(updated_at DESC);
```

### 5.2 `mail_ai_thread_summary` — 会话级总结(滚动累积)

```sql
CREATE TABLE IF NOT EXISTS mail_ai_thread_summary (
  account_id INTEGER NOT NULL,
  thread_id TEXT NOT NULL,              -- = hash(normalize(subject) + sorted participants)
  thread_subject TEXT,
  thread_participants_json TEXT NOT NULL DEFAULT '[]',
  mail_count INTEGER NOT NULL DEFAULT 0,
  overall_summary TEXT,                 -- 到目前为止这段对话的走向
  overall_open_loops_json TEXT NOT NULL DEFAULT '[]',
  overall_commitments_json TEXT NOT NULL DEFAULT '[]',
  overall_action_items_json TEXT NOT NULL DEFAULT '[]',
  latest_round_summary TEXT,            -- 本轮新增
  latest_round_at TEXT,                 -- 上次更新的最新邮件时间
  model TEXT,
  evidence_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_ai_thread_summary_updated
  ON mail_ai_thread_summary(updated_at DESC);
```

### 5.3 FTS5 索引(让 Sidebar 检索命中 AI 摘要)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS mail_ai_summary_fts USING fts5(
  mail_id UNINDEXED,
  account_id UNINDEXED,
  subject,
  what,
  impact,
  action,
  key_facts,
  tokenize='unicode61'
);
```

FTS5 失败时降级为 `LIKE` 查询,记 `log.warn`,行为不阻塞(参考 `contact_knowledge_chunks_fts` 的 fallback 模式)。

---

## 6. Public API (`src/main/services/mailSummaryService.ts`)

```ts
export type MailAiSummaryRecord = {
  accountId: number;
  mailId: string;
  subject: string;
  what: string;
  impact: string | null;
  action: string | null;
  urgency: 'now' | 'today' | 'later' | 'none';
  keyFacts: string[];
  keyInfo: Record<string, string | string[] | null>;
  quickReplies: Array<{ style: 'short' | 'formal' | 'best'; body: string }>;
  model: string;
  promptHash: string;
  evidenceHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type MailAiThreadSummaryRecord = {
  accountId: number;
  threadId: string;
  threadSubject: string;
  threadParticipants: string[];
  mailCount: number;
  overallSummary: string;
  overallOpenLoops: string[];
  overallCommitments: string[];
  overallActionItems: string[];
  latestRoundSummary: string;
  latestRoundAt: string;
  model: string;
  evidenceHash?: string;
  createdAt: string;
  updatedAt: string;
};

// === Mail-level ===
export function getMailSummary(input: { accountId: number; mailId: string }): MailAiSummaryRecord | null;
export async function upsertMailSummary(input: {
  accountId: number;
  mailId: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  force?: boolean;
}): Promise<MailAiSummaryRecord>;

// === Thread-level ===
export function getOrBuildThreadId(input: { subject: string; from: string; to: string[] }): string;
export function getThreadSummary(input: { accountId: number; threadId: string }): MailAiThreadSummaryRecord | null;
export async function upsertThreadSummary(input: {
  accountId: number;
  threadId: string;
  threadSubject: string;
  participants: string[];
  latestMailId: string;
  latestMailBody: string;
  force?: boolean;
}): Promise<MailAiThreadSummaryRecord>;

// === Stale marking ===
export function markSummariesStaleForContact(input: { accountId: number; contactEmail: string }): void;
// 复用 contact_knowledge 的 contactEmail 关联,新邮件入库时一起调用

// === Background preheat ===
export function enqueuePreSummarizeJob(input: { accountId: number; mailIds: string[] }): void;
export async function processPreSummarizeQueue(): Promise<{ processed: number; skipped: number; failed: number }>;
// 单 worker,串行处理,带 daily cap

// === Search ===
export function searchAiSummaries(input: {
  accountId: number;
  query: string;
  limit?: number;
}): Promise<Array<{
  mailId: string;
  subject: string;
  snippet: string;
  score: number;
  source: 'mail' | 'thread';
}>>;
```

---

## 7. Trigger policy

| 时机 | 行为 | 成本 |
|---|---|---|
| 用户在 MailDetail **首次点 AI 按钮** | 调云端 → 结果同时写 renderer cache + `mail_ai_summary` | 一次性 |
| 同封邮件**再次打开**(renderer cache 命中) | 直接用 cache,DB 不动 | 零 |
| 新邮件入库到 thread | `markSummariesStaleForContact`,后台预热 enqueue | 触发后台 |
| 后台预热 worker | 每天 cap 默认 50 次,优先补"最近 7 天点开过但未总结的" | 可控 |
| 新邮件入库时**不主动**调云端 | 只标记 stale | 零 |

设置项:`ai_mail_summary_preheat` ∈ `{ off, conservative(默认), aggressive }`。

- `off`:不预热,所有总结必须用户主动点 AI。
- `conservative`:每天 ≤ 50 次预热,只补 7 天内。
- `aggressive`:每天 ≤ 200 次预热,补 30 天内。

---

## 8. UI changes

### 8.1 Sidebar 新增"📚 知识库"入口

`src/renderer/components/Sidebar.tsx` 在已有 folders 列表和"星标"之间插入一个独立 section:

```
收件箱
已发送
草稿
...
─────────
📚 知识库        ← 点击进入 KnowledgeBasePanel
─────────
⭐ 星标
...
```

### 8.2 新组件 `KnowledgeBasePanel.tsx`

布局:

```
┌──────────────────────────────────────────┐
│ 🔍 搜索 AI 总结...                  [×] │
├──────────────────────────────────────────┤
│ 📧 邮件级                                │
│   • 老板说预算 50w (3 天前)              │
│     "Q3 预算上限 50w,周三前提交..."      │
│   • 张三确认合同 (上周)                  │
│     "已签署,周五前发发票..."             │
├──────────────────────────────────────────┤
│ 💬 会话级                                │
│   • [Thread] 预算讨论 (5 封邮件)         │
│     "老板最终确认 50w,周三前提交..."     │
└──────────────────────────────────────────┘
```

- 输入查询 → IPC `ai:searchSummaries` → FTS5 `bm25()` 排序 → 渲染
- 每条结果点击 → `setSelectedFolder('INBOX')` + `setSelectedMailId(mailId)`(沿用现有 MailDetail 打开逻辑)

### 8.3 MailDetail 改动

`getAssistantCacheKey` 现在的 `(emailId, language, contactWikiKey)` 加一个 `summaryKey`:`${mailSummary?.updatedAt ?? 'no-summary'}`,这样 summary 落库后再开同一封邮件,会用更新过的 cache key 触发刷新(避免显示 stale 总结)。

---

## 9. IPC layer

新增 IPC channels(全部进 preload allowlist):

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `ai:getMailSummary` | renderer → main | `{accountId, mailId}` | `MailAiSummaryRecord \| null` |
| `ai:upsertMailSummary` | renderer → main | `{accountId, mailId, subject, bodyText, bodyHtml?, force?}` | `MailAiSummaryRecord` |
| `ai:getThreadSummary` | renderer → main | `{accountId, threadId}` | `MailAiThreadSummaryRecord \| null` |
| `ai:upsertThreadSummary` | renderer → main | `{accountId, threadId, ...}` | `MailAiThreadSummaryRecord` |
| `ai:searchSummaries` | renderer → main | `{accountId, query, limit?}` | `Array<{mailId, subject, snippet, score, source}>` |
| `ai:getMailSummaryPreheatStatus` | renderer → main | `{accountId}` | `{queueLength, dailyUsed, dailyCap, mode}` |
| `ai:setMailSummaryPreheatMode` | renderer → main | `{mode: 'off'\|'conservative'\|'aggressive'}` | `{success: true}` |

实施要求:
- 全部进 `src/main/ipc/ai.ts`,统一 catch + `sanitizeAIProviderError`。
- 全部进 `src/preload/index.ts` allowlist。
- 全部进 `src/preload/electronAPI.d.ts` 类型。
- 新增 `scripts/electron-sandbox-security.test.cjs` 边界 case(确认未知 channel 抛 `Invalid IPC channel`)。

---

## 10. Privacy & cost guard

- **脱敏统一入口**:所有 `bodyText` / `subject` / `from` 在调云端前走 `redactCloudTextDetailed`(沿用 `contactKnowledgeService.ts` 现有路径);`keyInfo` / `quickReplies` 输出用 `applyRedactionMapToText` 反向脱敏。
- **失败摘要**:调云端失败时 `upsertMailSummary` 不抛错,返回 `null` 并记 `log.warn`;UI 继续用 renderer cache(已有 fallback)。
- **Daily cap**:后台预热 worker 用 settings 表存 `ai_mail_summary_daily_count` + `ai_mail_summary_daily_reset_at`,每天 UTC 0 点重置。
- **正文长度 cap**:超 8000 字截断后再送(沿用 contact knowledge 的 truncate 模式)。

---

## 11. Testing plan

新增 4 个测试文件,全部接入 `scripts/test-release.cjs`:

| 文件 | 覆盖 |
|---|---|
| `scripts/mail-summary-service.test.ts` | schema 幂等 + thread id 生成 + 总结 upsert/读取 + stale 标记 + FTS5 搜索命中 |
| `scripts/mail-summary-ipc.test.ts` | 全部 IPC channel payload 边界 + 错误路径 + 安全 catch |
| `scripts/mail-summary-renderer.test.ts` | MailDetail cache key 变化 + Sidebar KnowledgeBasePanel 渲染 + 输入防抖 |
| `scripts/mail-summary-search.test.ts` | FTS5 命中准确性 + bm25 排序 + fallback LIKE 路径 |

更新:
- `scripts/test-release.cjs` 入口加 4 个新文件。
- `scripts/electron-sandbox-security.test.cjs` 加新 channel allowlist case。

---

## 12. Rollout & rollback

### Rollout

1. PR 1: schema + service 骨架 + IPC(无 UI)
2. PR 2: MailDetail cache key 变更 + 后台预热 worker
3. PR 3: Sidebar KnowledgeBasePanel + 搜索入口
4. PR 4: settings 开关 + 测试接入

每个 PR 单独 ship,允许回滚到上一个 PR。

### Rollback

- `mail_ai_summary*` 三张表用 `CREATE TABLE IF NOT EXISTS`,rollback 时 `DROP TABLE` 即可,不破坏现有 `mail_cache`。
- IPC channel 可以从 preload allowlist 移除,renderer 调 `Invalid IPC channel` 自动降级到内存 cache 路径。

---

## 13. Open questions

无(决策已通过 `AskUserQuestion` 锁定)。

---

## 14. Spec self-review

- [x] **Placeholder scan**:无 TBD/TODO,所有决策已锁定。
- [x] **Internal consistency**:schema ↔ service API ↔ IPC payload ↔ UI 字段对齐。
- [x] **Scope check**:聚焦 L1,未越界引入 L3/L4/L5。
- [x] **Ambiguity check**:`mode` 枚举、`daily cap` 数值、`stale` 触发条件都已明确。