# IMAP 真实连接实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** 将 mailService.ts 从"模拟演戏"替换为真实 IMAP 连接，删除所有硬编码假数据，引入 SQLite 邮件摘要持久化。

**Architecture:** mailService.ts 是唯一修改文件。它调用现有的 `mail.ts`（imap-client 真实 IMAP）获取数据，将邮件摘要写入本地 SQLite，下次启动时优先读本地缓存实现增量同步。

**Tech Stack:** imap-client, better-sqlite3, safeStorage (crypto.ts)

---

## 文件变更总览

```
修改:
  src/main/services/mailService.ts  — 核心：删除 mock，引入真实 IMAP + SQLite 缓存
```

（mail.ts 的 IMAP 逻辑已经是真实的，无需改动）

---

## Task 1: 重写 mailService.ts（删除 Mock，引入真实 IMAP + SQLite 缓存）

**Files:**
- Modify: `src/main/services/mailService.ts`

### Step 1: 读取现有 mailService.ts 和 mail.ts

先读取 `src/main/services/mailService.ts` 和 `src/main/services/mail.ts`，了解当前状态。

### Step 2: 重写 mailService.ts

用以下完整实现替换整个文件：

```typescript
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
  date: string; // ISO string for SQLite
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  accountId: number;
  cachedAt: string;
}

export interface SyncResult {
  newMails: MailSummary[];
  totalCached: number;
  errors: string[];
}

// ─── SQLite mail cache helpers ───────────────────────────────────────────────

function getMailCacheDb() {
  const Database = require('better-sqlite3');
  const path = require('path');
  const { app } = require('electron');
  const dbPath = path.join(app.getPath('userData'), 'mail_cache.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

function ensureMailCacheTable(db: InstanceType<typeof import('better-sqlite3').default>) {
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
      (id, uid, "from", from_name, "to", subject, date, snippet, has_attachments, is_read, is_starred, folder, account_id, cached_at)
    VALUES
      (@id, @uid, @from, @fromName, @to, @subject, @date, @snippet, @hasAttachments, @isRead, @isStarred, @folder, @accountId, @cachedAt)
  `).run({
    id: mail.id,
    uid: mail.uid,
    from: mail.from,
    fromName: mail.fromName,
    to: mail.to,
    subject: mail.subject,
    date: mail.date instanceof Date ? mail.date.toISOString() : mail.date,
    snippet: mail.snippet,
    hasAttachments: mail.hasAttachments ? 1 : 0,
    isRead: mail.isRead ? 1 : 0,
    isStarred: mail.isStarred ? 1 : 0,
    folder: mail.folder,
    accountId: mail.accountId,
    cachedAt: new Date().toISOString(),
  });
  db.close();
}

function getCachedMails(accountId: number, folder: string, limit: number = 50): MailSummaryStored[] {
  const db = getMailCacheDb();
  ensureMailCacheTable(db);
  const rows = db.prepare(`
    SELECT id, uid, "from", from_name, "to", subject, date, snippet,
           has_attachments, is_read, is_starred, folder, account_id, cached_at
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
  }));
}

// ─── IMAP fetch (delegates to mail.ts) ──────────────────────────────────────

async function fetchFromImap(accountId: number, folder: string): Promise<MailSummary[]> {
  const account = getAccountById(accountId);
  if (!account) throw new Error('Account not found');

  // fetchMailList already does the real IMAP connection via mail.ts
  const mailList = await fetchMailList(accountId, folder, { limit: 100, offset: 0 });

  return mailList.map(m => ({
    id: m.id,
    uid: m.uid,
    from: m.from,
    fromName: m.fromName,
    to: m.to,
    subject: m.subject,
    date: m.date,
    snippet: m.snippet,
    hasAttachments: m.hasAttachments,
    isRead: m.isRead,
    isStarred: m.isStarred,
    folder,
    accountId,
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
  log.info(`[mailService] syncing mails for account ${accountId}, folder ${folder}`);
  const errors: string[] = [];

  try {
    // Step 1: Fetch from IMAP (real connection)
    let remoteMails: MailSummary[] = [];
    try {
      remoteMails = await withTimeout(fetchFromImap(accountId, folder), 15000);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('Timeout') || msg.includes('timeout')) {
        throw new Error('连接超时，请检查网络后重试');
      }
      // Auth or connection error — surface the real message
      throw new Error(msg);
    }

    // Step 2: Get locally cached UIDs for incremental sync
    const cachedUids = getCachedUids(accountId, folder);
    const newMails: MailSummary[] = [];

    // Step 3: Store new mails to SQLite cache
    for (const mail of remoteMails) {
      if (!cachedUids.has(mail.uid)) {
        upsertMailCache({
          ...mail,
          cachedAt: new Date().toISOString(),
        } as MailSummaryStored);
        newMails.push(mail);
      }
    }

    // Step 4: Notify for new mails
    if (newMails.length > 0) {
      triggerNativeNotification(newMails[0]);
    }

    log.info(`[mailService] sync complete: ${newMails.length} new mails, ${remoteMails.length} total`);
    return { newMails, totalCached: remoteMails.length, errors };
  } catch (err) {
    log.error('[mailService] sync failed:', err);
    throw err; // Let caller handle
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
      snippet: c.snippet,
      hasAttachments: c.hasAttachments,
      isRead: c.isRead,
      isStarred: c.isStarred,
      folder: c.folder,
      accountId: c.accountId,
    }));
  } catch (err) {
    log.warn('[mailService] loadCachedMails failed:', err);
    return [];
  }
}

// ─── Native notification ─────────────────────────────────────────────────────

function triggerNativeNotification(mail: MailSummary): void {
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
```

### Step 3: 验证编译

Run: `npx tsc --noEmit -p tsconfig.main.json`
Expected: 无 error

### Step 4: Commit

```bash
git add src/main/services/mailService.ts
git commit -m "feat: wire mailService to real IMAP via mail.ts, add SQLite mail_cache for offline"
```

---

## Task 2: 更新 IPC handler 以支持离线缓存加载

**Files:**
- Modify: `src/main/ipc/mail.ts`

### Step 1: 添加 mail:loadCached handler

在 `src/main/ipc/mail.ts` 的 `registerMailHandlers` 函数中添加：

```typescript
import { syncMails, fetchFullMessage as svcFetchFullMessage, loadCachedMails } from '../services/mailService';

// ...existing handlers...

// Load cached mails on startup (offline support)
ipcMain.handle('mail:loadCached', async (_event, accountId: number, folder: string) => {
  try {
    const cached = loadCachedMails(accountId, folder);
    return { success: true, data: cached };
  } catch (err) {
    const error = err as Error;
    log.error(`Failed to load cached mails for account ${accountId}:`, error);
    return { success: false, error: error.message };
  }
});
```

同时在 preload 的 validChannels 数组中添加 `'mail:loadCached'`。

### Step 2: Commit

```bash
git add src/main/ipc/mail.ts src/preload/index.ts
git commit -m "feat: add mail:loadCached IPC for offline mail cache on startup"
```

---

## Task 3: 验证构建

### Step 1: 运行构建

Run: `npm run build`
Expected: vite build + tsc 均通过

### Step 2: Commit

```bash
git add -A && git commit -m "chore: verify full build passes after IMAP real-connection"
```

---

## 自检清单

- [ ] mailService.ts 无任何 `return [{` 硬编码假数据
- [ ] 所有邮件数据来自 `fetchMailList` (mail.ts → imap-client)
- [ ] 新邮件写入 SQLite mail_cache 表
- [ ] 启动时通过 `loadCachedMails` 读取本地缓存
- [ ] 错误消息真实透传（授权错误、连接超时）
- [ ] 15 秒 IMAP 超时throw `Error('连接超时，请检查网络后重试')`
- [ ] `npm run build` 通过
