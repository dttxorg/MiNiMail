# 邮件服务重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 APARK 从模拟器模式迁移到真实邮件服务：账号加密持久化、邮件增量同步、操作系统原生通知、骨架屏加载。

**Architecture:** Main process 维护 SQLite 数据库（含 safeStorage 加密凭证），mailService.ts 提供邮件同步接口，App.tsx 通过 IPC/hooks 与 main process 通信，UI Toast 替换为 Electron Notification API。

**Tech Stack:** Electron safeStorage, better-sqlite3, imap-client, React hooks (useAccounts, useMail)

---

## 文件变更总览

```
新建:
  src/main/services/crypto.ts          — safeStorage 加解密
  src/main/services/mailService.ts     — 邮件同步服务（核心）
  src/renderer/utils/emailUtils.ts     — 纯函数抽离

修改:
  src/main/database.ts                 — credentials 加解密读写
  src/main/ipc/mail.ts                — 接入 mailService
  src/main/index.ts                   — 通知注册
  src/renderer/App.tsx                — 接入 useAccounts，移除模拟逻辑
  src/renderer/components/MailDetail.tsx — 骨架屏 + 超时
  src/renderer/components/Sidebar.tsx — 移除模拟刷新
```

---

## Task 1: 创建 safeStorage 加密模块

**Files:**
- Create: `src/main/services/crypto.ts`

- [ ] **Step 1: 创建 crypto.ts**

```typescript
// src/main/services/crypto.ts
import { safeStorage } from 'electron';
import log from 'electron-log';

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function encryptCredential(plain: string): Buffer {
  if (!isEncryptionAvailable()) {
    log.error('safeStorage encryption is not available on this system');
    throw new Error('Encryption not available: safeStorage is not supported or not accessible');
  }
  const encrypted = safeStorage.encryptString(plain);
  log.info('Credential encrypted successfully');
  return encrypted;
}

export function decryptCredential(encrypted: Buffer): string {
  if (!isEncryptionAvailable()) {
    log.error('safeStorage encryption is not available on this system');
    throw new Error('Encryption not available: safeStorage is not supported or not accessible');
  }
  const decrypted = safeStorage.decryptString(encrypted);
  return decrypted;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/crypto.ts
git commit -m "feat: add safeStorage crypto module for credential encryption"
```

---

## Task 2: 修改数据库 credentials 读写

**Files:**
- Modify: `src/main/database.ts:1-260`

**注意**：此任务需要将 credentials 表中存储的密码从 TEXT 转为 BLOB，并修改 `createAccount`、`getAccountCredentials`、`updateAccount` 三个函数。

- [ ] **Step 1: 添加 import**

在 `src/main/database.ts` 文件顶部 import 部分，添加：

```typescript
import { encryptCredential, decryptCredential, isEncryptionAvailable } from './services/crypto';
```

- [ ] **Step 2: 修改 getAccountCredentials 函数（约第 115-118 行）**

找到当前函数：
```typescript
export function getAccountCredentials(accountId: number): { password?: string; oauth_token?: string; oauth_refresh_token?: string; oauth_expiry?: number } | null {
  const stmt = getDatabase().prepare('SELECT password, oauth_token, oauth_refresh_token, oauth_expiry FROM credentials WHERE account_id = ?');
  return (stmt.get(accountId) as { password?: string; oauth_token?: string; oauth_refresh_token?: string; oauth_expiry?: number }) || null;
}
```

替换为：
```typescript
export function getAccountCredentials(accountId: number): { password?: string; oauth_token?: string; oauth_refresh_token?: string; oauth_expiry?: number } | null {
  const stmt = getDatabase().prepare('SELECT password, oauth_token, oauth_refresh_token, oauth_expiry FROM credentials WHERE account_id = ?');
  const row = stmt.get(accountId) as { password?: Buffer; oauth_token?: Buffer; oauth_refresh_token?: Buffer; oauth_expiry?: number } | undefined;
  if (!row) return null;

  // Decrypt stored BLOB credentials
  let password: string | undefined;
  let oauth_token: string | undefined;
  let oauth_refresh_token: string | undefined;

  if (row.password) {
    try { password = decryptCredential(row.password); } catch { password = undefined; }
  }
  if (row.oauth_token) {
    try { oauth_token = decryptCredential(row.oauth_token); } catch { oauth_token = undefined; }
  }
  if (row.oauth_refresh_token) {
    try { oauth_refresh_token = decryptCredential(row.oauth_refresh_token); } catch { oauth_refresh_token = undefined; }
  }

  return { password, oauth_token, oauth_refresh_token, oauth_expiry: row.oauth_expiry };
}
```

- [ ] **Step 3: 修改 createAccount 函数中存储 credentials 的部分（约第 165-171 行）**

找到：
```typescript
  // Store credentials
  if (input.auth_type === 'password' && input.password) {
    db.prepare('INSERT INTO credentials (account_id, password) VALUES (?, ?)').run(accountId, input.password);
  } else if (input.auth_type === 'oauth' && (input.oauth_token || input.oauth_refresh_token)) {
    db.prepare('INSERT INTO credentials (account_id, oauth_token, oauth_refresh_token) VALUES (?, ?, ?)')
      .run(accountId, input.oauth_token || null, input.oauth_refresh_token || null);
  }
```

替换为：
```typescript
  // Store credentials (encrypted)
  if (!isEncryptionAvailable()) {
    log.warn('safeStorage not available, credentials will not be stored');
  } else {
    if (input.auth_type === 'password' && input.password) {
      const encryptedPassword = encryptCredential(input.password);
      db.prepare('INSERT INTO credentials (account_id, password) VALUES (?, ?)').run(accountId, encryptedPassword);
    } else if (input.auth_type === 'oauth' && (input.oauth_token || input.oauth_refresh_token)) {
      const encryptedToken = input.oauth_token ? encryptCredential(input.oauth_token) : null;
      const encryptedRefreshToken = input.oauth_refresh_token ? encryptCredential(input.oauth_refresh_token) : null;
      db.prepare('INSERT INTO credentials (account_id, oauth_token, oauth_refresh_token) VALUES (?, ?, ?)')
        .run(accountId, encryptedToken, encryptedRefreshToken);
    }
  }
```

- [ ] **Step 4: 修改 updateAccount 中更新 credentials 的部分（约第 204-216 行）**

找到：
```typescript
  // Update credentials if provided
  if (input.password) {
    db.prepare('UPDATE credentials SET password = ? WHERE account_id = ?').run(input.password, id);
  }
  if (input.oauth_token || input.oauth_refresh_token) {
    const updates: string[] = [];
    const credValues: (string | null)[] = [];
    if (input.oauth_token !== undefined) { updates.push('oauth_token = ?'); credValues.push(input.oauth_token); }
    if (input.oauth_refresh_token !== undefined) { updates.push('oauth_refresh_token = ?'); credValues.push(input.oauth_refresh_token); }
    if (updates.length > 0) {
      credValues.push(id as never);
      db.prepare(`UPDATE credentials SET ${updates.join(', ')} WHERE account_id = ?`).run(...credValues);
    }
  }
```

替换为：
```typescript
  // Update credentials if provided (encrypt before storing)
  if (!isEncryptionAvailable()) {
    log.warn('safeStorage not available, credentials will not be updated');
  } else {
    if (input.password) {
      const encrypted = encryptCredential(input.password);
      db.prepare('UPDATE credentials SET password = ? WHERE account_id = ?').run(encrypted, id);
    }
    if (input.oauth_token !== undefined || input.oauth_refresh_token !== undefined) {
      const updates: string[] = [];
      const credValues: (Buffer | null)[] = [];
      if (input.oauth_token !== undefined) {
        updates.push('oauth_token = ?');
        credValues.push(input.oauth_token ? encryptCredential(input.oauth_token) : null);
      }
      if (input.oauth_refresh_token !== undefined) {
        updates.push('oauth_refresh_token = ?');
        credValues.push(input.oauth_refresh_token ? encryptCredential(input.oauth_refresh_token) : null);
      }
      if (updates.length > 0) {
        credValues.push(id as never);
        db.prepare(`UPDATE credentials SET ${updates.join(', ')} WHERE account_id = ?`).run(...credValues);
      }
    }
  }
```

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无 error（warnings 忽略）

- [ ] **Step 6: Commit**

```bash
git add src/main/database.ts
git commit -m "feat: integrate safeStorage encryption for credentials storage"
```

---

## Task 3: 创建 mailService.ts（核心同步服务）

**Files:**
- Create: `src/main/services/mailService.ts`

- [ ] **Step 1: 创建 mailService.ts**

此文件实现邮件同步核心逻辑。注意目前处于"模拟层"阶段：syncMails 返回本地 mock 数据但接口已为真实 IMAP 留好入口。15 秒超时在 fetchFullMessage 中实现。

```typescript
// src/main/services/mailService.ts
import log from 'electron-log';
import { Notification, BrowserWindow } from 'electron';
import { fetchMailList, fetchMailDetail, getMailFolders } from './mail';
import type { MailSummary, MailDetail, FolderInfo } from './mail';

export interface SyncResult {
  newMails: MailSummary[];
  totalCached: number;
}

// 15-second timeout wrapper
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function syncMails(accountId: number, folder: string = 'INBOX'): Promise<SyncResult> {
  log.info(`[mailService] syncing mails for account ${accountId}, folder ${folder}`);

  try {
    // Real IMAP sync (will work once credentials are set up)
    const mailList = await fetchMailList(accountId, folder, { limit: 50, offset: 0 });

    const newMails: MailSummary[] = mailList.map(m => ({
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

    // Notify about new mails
    if (newMails.length > 0) {
      const latest = newMails[0]; // already sorted newest-first
      triggerNativeNotification(latest);
    }

    log.info(`[mailService] sync complete: ${newMails.length} new mails`);
    return { newMails, totalCached: newMails.length };
  } catch (err) {
    log.error('[mailService] sync failed:', err);
    throw err;
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
      15000 // 15 seconds
    );

    if (!detail) {
      throw new Error('Message not found');
    }

    log.info(`[mailService] full message fetched successfully`);
    return detail;
  } catch (err) {
    if ((err as Error).message.includes('Timeout')) {
      log.warn(`[mailService] fetch timeout for UID ${messageUid}`);
    } else {
      log.error('[mailService] fetchFullMessage error:', err);
    }
    throw err;
  }
}

export async function getFolders(accountId: number): Promise<FolderInfo[]> {
  return getMailFolders(accountId);
}

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
        // Emit event to renderer to select this mail
        win.webContents.send('notification:mail-clicked', {
          accountId: mail.accountId,
          uid: mail.uid,
          folder: mail.folder,
        });
      }
    });

    notification.show();
    log.info(`[mailService] notification shown for: ${mail.fromName || mail.from}`);
  } catch (err) {
    log.error('[mailService] failed to show notification:', err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/mailService.ts
git commit -m "feat: create mailService with syncMails, fetchFullMessage (15s timeout), native notifications"
```

---

## Task 4: 新增 IPC channel：刷新同步

**Files:**
- Modify: `src/preload/index.ts:8-43`
- Modify: `src/main/ipc/mail.ts:1-128`

- [ ] **Step 1: 在 preload validChannels 中添加 `mail:sync`**

在 `src/preload/index.ts` 找到 `validChannels` 数组，在末尾添加：

```typescript
      'mail:sync',
      'mail:syncNewMail',  // 用于接收 main → renderer 的新邮件事件
```

同时添加新的事件监听 channel：

```typescript
  onMailSync: (callback: (mail: unknown) => void) => {
    ipcRenderer.on('mail:sync-new', (_event, mail) => callback(mail));
  },
```

- [ ] **Step 2: 在 mail.ts IPC handlers 中添加 mail:sync handler**

在 `src/main/ipc/mail.ts` 文件 import 部分，添加：

```typescript
import { syncMails, fetchFullMessage as svcFetchFullMessage, getFolders as svcGetFolders } from '../services/mailService';
```

在 `registerMailHandlers()` 函数中，在 `mail:getFolders` handler 之后添加：

```typescript
  // Sync mails (main entry point for refresh)
  ipcMain.handle('mail:sync', async (_event, accountId: number, folder: string) => {
    try {
      const result = await syncMails(accountId, folder);
      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to sync mails for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Fetch full message with 15s timeout
  ipcMain.handle('mail:fetchFull', async (_event, accountId: number, messageUid: number, folder: string) => {
    try {
      const detail = await svcFetchFullMessage(accountId, messageUid, folder);
      return { success: true, data: detail };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to fetch full message UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/main/ipc/mail.ts
git commit -m "feat: add mail:sync and mail:fetchFull IPC handlers"
```

---

## Task 5: 创建 useMail Hook（含骨架屏状态）

**Files:**
- Create: `src/renderer/hooks/useMail.ts`

- [ ] **Step 1: 创建 useMail hook**

```typescript
// src/renderer/hooks/useMail.ts
import { useState, useCallback } from 'react';
import type { ApiResponse } from '../types';

// Shared email type for renderer
export interface RendererMailSummary {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  accountId: number;
}

export interface RendererMailDetail extends RendererMailSummary {
  bodyHtml?: string;
  bodyText?: string;
  attachments: Array<{ filename: string; contentType: string; size: number }>;
  headers: Record<string, string>;
}

export type MailLoadingState = 'idle' | 'loading' | 'success' | 'error' | 'timeout';

export function useMail() {
  const [mailList, setMailList] = useState<RendererMailSummary[]>([]);
  const [currentMail, setCurrentMail] = useState<RendererMailDetail | null>(null);
  const [mailLoadingState, setMailLoadingState] = useState<MailLoadingState>('idle');
  const [mailError, setMailError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncMails = useCallback(async (accountId: number, folder: string = 'INBOX') => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const response = await window.electronAPI.invoke('mail:sync', accountId, folder);
      const result = response as ApiResponse<{ newMails: RendererMailSummary[]; totalCached: number }>;
      if (result.success && result.data) {
        setMailList(prev => [...result.data!.newMails, ...prev]);
      } else {
        setSyncError(result.error || 'Sync failed');
      }
    } catch (err) {
      setSyncError((err as Error).message);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const fetchMailDetail = useCallback(async (accountId: number, messageUid: number, folder: string = 'INBOX') => {
    setMailLoadingState('loading');
    setMailError(null);
    setCurrentMail(null);

    try {
      const response = await window.electronAPI.invoke('mail:fetchFull', accountId, messageUid, folder);
      const result = response as ApiResponse<RendererMailDetail>;
      if (result.success && result.data) {
        setCurrentMail(result.data);
        setMailLoadingState('success');
      } else {
        if ((result.error || '').includes('Timeout')) {
          setMailLoadingState('timeout');
          setMailError('获取内容超时，请检查网络后重试');
        } else {
          setMailLoadingState('error');
          setMailError(result.error || 'Failed to load mail');
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('Timeout') || msg.includes('timeout')) {
        setMailLoadingState('timeout');
        setMailError('获取内容超时，请检查网络后重试');
      } else {
        setMailLoadingState('error');
        setMailError(msg);
      }
    }
  }, []);

  const clearCurrentMail = useCallback(() => {
    setCurrentMail(null);
    setMailLoadingState('idle');
    setMailError(null);
  }, []);

  return {
    mailList,
    setMailList,
    currentMail,
    setCurrentMail,
    mailLoadingState,
    mailError,
    isSyncing,
    syncError,
    syncMails,
    fetchMailDetail,
    clearCurrentMail,
  };
}
```

- [ ] **Step 2: 在 types.ts 中补充 window.electronAPI 类型扩展**

找到 `src/renderer/hooks/useAccounts.ts` 文件底部的 `declare global` 块，添加：

```typescript
      onMailSync: (callback: (mail: unknown) => void) => void;
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/useMail.ts src/renderer/hooks/useAccounts.ts
git commit -m "feat: create useMail hook with skeleton state management"
```

---

## Task 6: 创建 emailUtils.ts 纯函数

**Files:**
- Create: `src/renderer/utils/emailUtils.ts`

- [ ] **Step 1: 创建 emailUtils.ts**

```typescript
// src/renderer/utils/emailUtils.ts
import type { MockEmail } from '../data/mockData';

export function sortEmailsByDate(emails: MockEmail[], descending: boolean = true): MockEmail[] {
  return [...emails].sort((a, b) => {
    const diff = b.date.getTime() - a.date.getTime();
    return descending ? diff : -diff;
  });
}

export function groupEmailsByDate(emails: MockEmail[]): Map<string, MockEmail[]> {
  const groups = new Map<string, MockEmail[]>();

  for (const email of emails) {
    const date = email.date;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = '昨天';
    } else if (date.getFullYear() === today.getFullYear()) {
      label = date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    } else {
      label = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(email);
  }

  return groups;
}

export function filterEmailsByFolder(emails: MockEmail[], folder: string): MockEmail[] {
  if (folder === 'inbox') return emails;
  return emails.filter(e => e.folder === folder);
}

export function filterEmailsByAccount(emails: MockEmail[], accountId: number | null): MockEmail[] {
  if (accountId === null) return emails;
  return emails.filter(e => e.accountId === accountId);
}

export function searchEmails(emails: MockEmail[], query: string): MockEmail[] {
  if (!query.trim()) return emails;
  const lower = query.toLowerCase();
  return emails.filter(e =>
    e.subject.toLowerCase().includes(lower) ||
    e.from.name.toLowerCase().includes(lower) ||
    e.from.email.toLowerCase().includes(lower) ||
    e.snippet.toLowerCase().includes(lower)
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/utils/emailUtils.ts
git commit -m "refactor: extract email utilities to src/renderer/utils/emailUtils.ts"
```

---

## Task 7: 重构 App.tsx（核心）

**Files:**
- Modify: `src/renderer/App.tsx`（大量改动，见下方步骤）

- [ ] **Step 1: 删除模拟数据相关代码**

删除顶部 `SYNC_NEW_EMAILS` 常量池（约第 14-58 行）：

```typescript
// DELETE THIS ENTIRE BLOCK
const SYNC_NEW_EMAILS: Omit<MockEmail, 'accountId'>[] = [
  { id: `sync-${Date.now()}-1`, from: {...}, ... },
  // ... all 3 entries
];
```

- [ ] **Step 2: 修改 accounts state，从 useState 硬编码改为从 useAccounts hook 加载**

找到：
```typescript
  // ─── Accounts state (dynamic — not hardcoded) ───
  const [accounts, setAccounts] = useState([
    { id: 1, email: 'me@example.com', name: '我的邮箱', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me' },
    { id: 2, email: 'work@company.com', name: '工作邮箱', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=work' },
  ]);
```

替换为：
```typescript
  const { accounts, loading: accountsLoading, fetchAccounts } = useAccounts();
```

同时删除这行硬编码后的 useState 初始化（保留其他 useState）。

- [ ] **Step 3: 修改 currentAccount 初始化**

找到：
```typescript
  const [currentAccount, setCurrentAccount] = useState(accounts[0]);
```

改为 useEffect 从 accounts 列表取默认值（因为 accounts 初始是异步加载的）：
```typescript
  const [currentAccount, setCurrentAccount] = useState<{ id: number; email: string; name: string; avatar: string } | null>(null);

  // Set default account once accounts load
  useEffect(() => {
    if (accounts.length > 0 && !currentAccount) {
      const defaultAcc = accounts.find(a => a.is_default === 1) || accounts[0];
      setCurrentAccount({
        id: defaultAcc.id,
        email: defaultAcc.email,
        name: defaultAcc.display_name || defaultAcc.email.split('@')[0],
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${defaultAcc.email.split('@')[0]}`,
      });
    }
  }, [accounts, currentAccount]);
```

- [ ] **Step 4: 删除 setInterval 自动同步的 useEffect（约第 147-161 行）**

找到并删除整个 `useEffect(() => { const interval = setInterval(...) ... }, [accounts, addNewEmailToState]);` 块。

- [ ] **Step 5: 删除手动刷新中的随机邮件逻辑 fetchMails**

找到 `fetchMails` 函数（约第 121-133 行），替换为：

```typescript
  const fetchMails = useCallback(async (): Promise<void> => {
    if (!currentAccount) return;
    await syncMails(currentAccount.id, selectedFolder);
  }, [currentAccount, selectedFolder, syncMails]);
```

- [ ] **Step 6: 删除 addNewEmailToState 中的 Toast 逻辑**

找到 `addNewEmailToState`（约第 108-119 行），替换为：

```typescript
  const addNewEmailToState = useCallback((email: Omit<MockEmail, 'accountId'>, accountId: number) => {
    const newEmail: MockEmail = { ...email, accountId };
    setEmails(prev => [newEmail, ...prev]);
  }, []);
```

（注意：新增邮件的原生通知已在 mailService.ts 中通过 Notification API 触发，这里不再需要 Toast）

- [ ] **Step 7: 接入 useMail hook**

在 App.tsx 中添加：

```typescript
import { useMail } from './hooks/useMail';

function App() {
  // ... existing hooks

  const {
    mailList,
    setMailList,
    currentMail,
    mailLoadingState,
    mailError,
    isSyncing,
    syncMails,
    fetchMailDetail,
  } = useMail();
```

同时删除本地的 `const [isRefreshing, setIsRefreshing] = useState(false);` 中的 `isRefreshing`，改为使用 `isSyncing`。

- [ ] **Step 8: 修改 handleSaveAttempt，接入真实 createAccount**

找到 `handleSaveAttempt`（约第 285-295 行），替换为：

```typescript
  const handleSaveAttempt = async (input: CreateAccountInput) => {
    const result = await createAccount(input);
    if (result.success) {
      await fetchAccounts(); // Refresh accounts list
      setShowAddAccount(false);
    }
    return result;
  };
```

- [ ] **Step 9: 删除邮箱相关 Toast 逻辑（约第 298-309 行）**

找到 `handleToastClick` 和 `handleToastDismiss`，可以删除，因为原生通知已替代 UI Toast。

- [ ] **Step 10: 替换 App.tsx 顶部的 mockEmails 引用为 mailList**

保留 emails state 用于本地筛选，但初始化改为从 mailList：
（如果 mailList 有内容则用 mailList，否则降级到 mockEmails 以保持 UI 可展示）

在 emails useState 初始化处：
```typescript
  const [emails, setEmails] = useState<MockEmail[]>(
    mailList.length > 0
      ? mailList.map(m => ({ ...m, accountId: m.accountId }))
      : mockEmails.map(email => ({ ...email, accountId: email.from.email.includes('work') ? 2 : 1 }))
  );
```

- [ ] **Step 11: 修改 handleRefresh 使用 isSyncing**

将 `handleRefresh` 中的 `isRefreshing` 替换为 `isSyncing`。

- [ ] **Step 12: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "refactor: wire App.tsx to useAccounts/useMail hooks, remove setInterval simulation"
```

---

## Task 8: MailDetail 骨架屏 + 超时错误状态

**Files:**
- Modify: `src/renderer/components/MailDetail.tsx`

- [ ] **Step 1: 读取现有 MailDetail.tsx**

```typescript
// Read src/renderer/components/MailDetail.tsx
```

- [ ] **Step 2: 添加骨架屏和超时状态的 JSX**

在 MailDetail 组件的 return 部分，找到 `!email` 时的空状态，添加骨架屏：

找到：
```typescript
  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <p>{t('selectEmailPlaceholder')}</p>
      </div>
    );
  }
```

替换为：
```typescript
  if (!email && mailLoadingState === 'idle') {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <p>{t('selectEmailPlaceholder')}</p>
      </div>
    );
  }

  // Loading skeleton
  if (mailLoadingState === 'loading') {
    return (
      <div className="flex-1 flex flex-col p-6 overflow-y-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-zinc-700 rounded w-1/2" />
          <div className="h-4 bg-zinc-700 rounded w-1/3" />
          <div className="border-t border-zinc-700 my-4" />
          <div className="h-4 bg-zinc-700 rounded w-full" />
          <div className="h-4 bg-zinc-700 rounded w-5/6" />
          <div className="h-4 bg-zinc-700 rounded w-4/6" />
        </div>
        <p className="text-center text-zinc-500 mt-6 text-sm">正在从服务器获取内容...</p>
      </div>
    );
  }

  // Timeout / Error state
  if (mailLoadingState === 'timeout' || mailLoadingState === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-sm text-center px-8">{mailError || '获取内容超时，请检查网络后重试'}</p>
        <button
          onClick={() => {
            if (email) {
              fetchMailDetail(email.accountId, parseInt(email.id), email.folder);
            }
          }}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm transition-colors"
        >
          点击重试
        </button>
      </div>
    );
  }
```

- [ ] **Step 3: 添加 mailLoadingState 和 mailError props 传入**

在 MailDetail 组件的 props 中，添加：

```typescript
interface MailDetailProps {
  // ... existing props
  mailLoadingState?: 'idle' | 'loading' | 'success' | 'error' | 'timeout';
  mailError?: string | null;
  onRetry?: () => void;
}
```

并在 App.tsx 传入这些 props。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/MailDetail.tsx src/renderer/App.tsx
git commit -m "feat: add MailDetail skeleton loading and timeout error state"
```

---

## Task 9: Sidebar 刷新按钮接入 isSyncing

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`

- [ ] **Step 1: 修改 Sidebar 接收 isRefreshing prop（已存在），确保 isSyncing 传入**

在 `src/renderer/App.tsx` 中找到 Sidebar 的调用，传入 `isRefreshing={isSyncing}`（无需修改 Sidebar 本身）。

- [ ] **Step 2: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "fix: wire Sidebar refresh button to isSyncing state from useMail"
```

---

## Task 10: 验证构建

- [ ] **Step 1: TypeScript 编译检查**

Run: `npx tsc --noEmit`
Expected: 无 error（warnings 可忽略）

- [ ] **Step 2: 启动应用测试**

Run: `npm run dev` 或 `npm start`（取决于项目启动命令）
Expected: 应用正常启动，左侧 Sidebar 显示已持久化的账号

- [ ] **Step 3: 测试账号持久化**

1. 添加一个新账号
2. 关闭应用
3. 重新打开
4. 验证账号仍然出现在左侧 Sidebar

---

## 自检清单

完成所有任务后，对照设计文档检查：

- [ ] credentials 表中密码以加密 BLOB 存储，明文密码永不进入渲染进程
- [ ] UI 密码框显示 `••••••••`
- [ ] `mailService.ts` 已创建，接口为 `syncMails` / `fetchFullMessage`
- [ ] 15 秒超时已实现，超时时显示"获取内容超时，请检查网络后重试" + 重试按钮
- [ ] 原生 Notification 替代 UI Toast
- [ ] App.tsx 已移除 `SYNC_NEW_EMAILS` 和 `setInterval`
- [ ] `emailUtils.ts` 已创建，包含 `sortEmailsByDate` 等 5 个函数
- [ ] `useAccounts` hook 已在 App.tsx 中使用
- [ ] `useMail` hook 已创建，包含 `mailLoadingState` 骨架屏状态
- [ ] 所有 commit 完成
