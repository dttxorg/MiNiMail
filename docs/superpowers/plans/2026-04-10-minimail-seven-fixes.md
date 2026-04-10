# minimail 7-Issue Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 core defects: body cache, IMAP-header-based thread view, AI panel layout, state isolation, unified avatar, copy/screenshot, and AI business logic.

**Architecture:** Session-level in-memory body cache (Map in useRef); threading via `messageId`/`inReplyTo` from IMAP envelope persisted to SQLite; AI panel moved inside the single scroll container; useEffect on `[email?.accountId, email?.uid]` resets all transient state; shared `SenderAvatar` component replaces all avatar logic; real IPC calls replace mocks in ComposeDialog; `runBatchAnalysis` switched to `ai:classifyBatch` with proper state write-back.

**Tech Stack:** Electron 28 + React 19 + TypeScript 5 + ImapFlow + better-sqlite3 + DOMPurify + html-to-image + Tailwind CSS

---

## File Map

| File | Action | Tasks |
|------|--------|-------|
| `src/renderer/components/SenderAvatar.tsx` | Create | 1 |
| `src/main/services/mailService.ts` | Modify | 2 |
| `src/main/services/mail.ts` | Modify | 3 |
| `src/renderer/hooks/useMail.ts` | Modify | 4 |
| `src/renderer/components/MailDetail.tsx` | Modify | 5, 6 |
| `src/renderer/App.tsx` | Modify | 6, 9 |
| `src/renderer/components/MailList.tsx` | Modify | 7 |
| `src/renderer/components/ComposeDialog.tsx` | Modify | 8 |

---

## Task 1: Create SenderAvatar Shared Component

**Files:**
- Create: `src/renderer/components/SenderAvatar.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/renderer/components/SenderAvatar.tsx
import React from 'react';

const AVATAR_COLORS = [
  '#ff375f', '#ff9f0a', '#30d158',
  '#64d2ff', '#0071e3', '#bf5af2',
  '#ffd60a', '#ff6b35',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

interface SenderAvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function SenderAvatar({ name, size = 28, className = '' }: SenderAvatarProps) {
  const displayName = name || '?';
  const bg = getAvatarColor(displayName);
  const initials = getInitials(displayName);
  const fontSize = size <= 24 ? 10 : size <= 32 ? 11 : 13;

  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 rounded-full font-semibold text-white select-none ${className}`}
      style={{ width: size, height: size, backgroundColor: bg, fontSize }}
    >
      {initials}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/SenderAvatar.tsx
git commit -m "feat: add SenderAvatar shared component with deterministic color hash"
```

---

## Task 2: Backend — DB Schema Migration for Thread Headers

Add `message_id` and `in_reply_to` columns to `mail_cache` table.

**Files:**
- Modify: `src/main/services/mailService.ts`

- [ ] **Step 1: Extend `MailSummaryStored` interface**

In `src/main/services/mailService.ts`, find the `MailSummaryStored` interface (line ~8) and add two optional fields:

```typescript
export interface MailSummaryStored {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  accountId: number;
  cachedAt: string;
  messageId?: string;
  inReplyTo?: string;
}
```

- [ ] **Step 2: Add migration function after `ensureMailCacheTable`**

After the closing brace of `ensureMailCacheTable` (around line 67), add:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateMailCacheTable(db: any) {
  // Idempotent: ALTER TABLE is a no-op if column already exists (caught and ignored)
  const migrations = [
    'ALTER TABLE mail_cache ADD COLUMN message_id TEXT',
    'ALTER TABLE mail_cache ADD COLUMN in_reply_to TEXT',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists — safe to ignore */ }
  }
}
```

- [ ] **Step 3: Call migration inside `ensureMailCacheTable`**

Inside `ensureMailCacheTable`, after `db.exec(...)`, add the migration call:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureMailCacheTable(db: any) {
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
  migrateMailCacheTable(db);
}
```

- [ ] **Step 4: Update `upsertMailCache` to include new columns**

Replace the entire `upsertMailCache` function body (the `db.prepare(...).run(...)` call):

```typescript
function upsertMailCache(mail: MailSummaryStored): void {
  const db = getMailCacheDb();
  ensureMailCacheTable(db);
  db.prepare(`
    INSERT OR REPLACE INTO mail_cache
      (id, uid, "from", from_name, "to", subject, date, snippet,
       has_attachments, is_read, is_starred, folder, account_id, cached_at,
       message_id, in_reply_to)
    VALUES
      (@id, @uid, @from, @fromName, @to, @subject, @date, @snippet,
       @hasAttachments, @isRead, @isStarred, @folder, @accountId, @cachedAt,
       @messageId, @inReplyTo)
  `).run({
    id: mail.id,
    uid: mail.uid,
    from: mail.from,
    fromName: mail.fromName,
    to: mail.to,
    subject: mail.subject,
    date: typeof mail.date === 'string' ? mail.date : (mail.date as Date).toISOString(),
    snippet: mail.snippet,
    hasAttachments: mail.hasAttachments ? 1 : 0,
    isRead: mail.isRead ? 1 : 0,
    isStarred: mail.isStarred ? 1 : 0,
    folder: mail.folder,
    accountId: mail.accountId,
    cachedAt: new Date().toISOString(),
    messageId: mail.messageId ?? null,
    inReplyTo: mail.inReplyTo ?? null,
  });
  db.close();
}
```

- [ ] **Step 5: Update `getCachedMails` SELECT and mapping**

Replace the `getCachedMails` function:

```typescript
function getCachedMails(accountId: number, folder: string, limit: number = 50): MailSummaryStored[] {
  const db = getMailCacheDb();
  ensureMailCacheTable(db);
  const rows = db.prepare(`
    SELECT id, uid, "from", from_name, "to", subject, date, snippet,
           has_attachments, is_read, is_starred, folder, account_id, cached_at,
           message_id, in_reply_to
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
    messageId: row.message_id as string | undefined,
    inReplyTo: row.in_reply_to as string | undefined,
  }));
}
```

- [ ] **Step 6: Update `fetchFromImap` mapping to forward thread headers**

In `fetchFromImap`, add `messageId` and `inReplyTo` to the returned object map:

```typescript
async function fetchFromImap(accountId: number, folder: string): Promise<MailSummary[]> {
  const mailList = await fetchMailList(accountId, folder, { limit: 100, offset: 0 });
  return mailList.map(m => ({
    id: m.id,
    uid: m.uid,
    from: m.from,
    fromName: m.fromName,
    to: m.to,
    subject: m.subject,
    date: m.date,
    flags: m.flags ?? [],
    snippet: m.snippet,
    hasAttachments: m.hasAttachments,
    isRead: m.isRead,
    isStarred: m.isStarred,
    folder,
    accountId,
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
  }));
}
```

- [ ] **Step 7: Update `loadCachedMails` to include thread fields**

Replace the inner mapping inside `loadCachedMails`:

```typescript
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
      flags: [],
      snippet: c.snippet,
      hasAttachments: c.hasAttachments,
      isRead: c.isRead,
      isStarred: c.isStarred,
      folder: c.folder,
      accountId: c.accountId,
      messageId: c.messageId,
      inReplyTo: c.inReplyTo,
    } as MailSummary));
  } catch (err) {
    log.warn('[mailService] loadCachedMails failed:', err);
    return [];
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add src/main/services/mailService.ts
git commit -m "feat: add message_id/in_reply_to columns to mail_cache for thread support"
```

---

## Task 3: Backend — Extract Thread Headers from IMAP Envelope

**Files:**
- Modify: `src/main/services/mail.ts`

- [ ] **Step 1: Extend `MailSummary` interface with thread fields**

In `src/main/services/mail.ts`, find the `MailSummary` interface (line ~6) and add two optional fields:

```typescript
export interface MailSummary {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  flags: string[];
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  messageId?: string;
  inReplyTo?: string;
}
```

- [ ] **Step 2: Extract `messageId` and `inReplyTo` in `fetchMailList`**

Inside `fetchMailList`, in the `for await` loop body, after the existing `summaries.push({...})` call, update the push to include the envelope thread fields. Replace the existing `summaries.push` call:

```typescript
summaries.push({
  id: String(msg.uid),
  uid: Number(msg.uid),
  from: fromParsed.address,
  fromName: fromParsed.name,
  to: toParsed,
  subject: typeof subject === 'string' ? subject : '(No Subject)',
  date: msg.envelope?.date ? new Date(msg.envelope.date) : new Date(),
  flags,
  snippet: '',
  hasAttachments: false,
  isRead: flags.includes('\\Seen'),
  isStarred: flags.includes('\\Flagged'),
  messageId: msg.envelope?.messageId || undefined,
  inReplyTo: msg.envelope?.inReplyTo || undefined,
});
```

- [ ] **Step 3: Verify build passes**

```bash
cd "D:\下载\编程\APARK" && npm run build
```

Expected: build completes without TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/services/mail.ts
git commit -m "feat: extract messageId and inReplyTo from IMAP envelope for threading"
```

---

## Task 4: Renderer — Extend Types + Add Body Cache

**Files:**
- Modify: `src/renderer/hooks/useMail.ts`

- [ ] **Step 1: Extend `RendererMailSummary` with thread fields**

Add two optional fields to the `RendererMailSummary` interface:

```typescript
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
  /** AI classification result — one of the 6 canonical category strings */
  category?: string;
  /** RFC 2822 Message-ID header value */
  messageId?: string;
  /** RFC 2822 In-Reply-To header value (messageId of parent) */
  inReplyTo?: string;
}
```

- [ ] **Step 2: Add body cache ref and update `useMail` return**

Replace the entire `useMail` function with the version that includes the body cache. The key changes are: adding `bodyCache` useRef, modifying `fetchMailDetail` to check cache before IPC, and exposing `clearBodyCacheEntry`:

```typescript
export function useMail() {
  const [mailList, setMailList] = useState<RendererMailSummary[]>([]);
  const [currentMail, setCurrentMail] = useState<RendererMailDetail | null>(null);
  const [mailLoadingState, setMailLoadingState] = useState<MailLoadingState>('idle');
  const [mailError, setMailError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  /** Session-level body cache — avoids re-fetching when switching between already-viewed emails */
  const bodyCache = useRef<Map<string, RendererMailDetail>>(new Map());

  const syncMails = useCallback(async (accountId: number, folder: string = 'INBOX') => {
    setIsSyncing(true);
    setSyncError(null);
    console.log('[syncMails] START accountId=', accountId, 'folder=', folder);
    try {
      console.log('[syncMails] invoking IPC mail:sync for accountId=', accountId, 'folder=', folder);
      const response = await window.electronAPI.invoke('mail:sync', accountId, folder);
      console.log('[syncMails] IPC response received:', JSON.stringify(response).slice(0, 300));
      const result = response as { success: boolean; data?: { newMails: RendererMailSummary[]; totalCached: number }; error?: string };
      if (result.success && result.data) {
        const { newMails, totalCached } = result.data;
        console.log('[syncMails] success: newMails=', newMails.length, 'totalCached=', totalCached);
        try {
          const cachedResp = await window.electronAPI.invoke('mail:loadCached', accountId, folder) as { success: boolean; data?: RendererMailSummary[] };
          if (cachedResp.success && cachedResp.data) {
            const allCached = cachedResp.data;
            console.log('[syncMails] loaded', allCached.length, 'cached mails for account', accountId);
            setMailList(prev => {
              const others = prev.filter(m => !(m.accountId === accountId && m.folder.toLowerCase() === folder.toLowerCase()));
              const merged = [...allCached, ...others];
              console.log('[syncMails] setMailList: prev len=', prev.length, 'new len=', merged.length);
              return merged;
            });
          } else {
            setMailList(prev => {
              const merged = [...newMails, ...prev];
              console.log('[syncMails] setMailList (fallback): prev len=', prev.length, 'new len=', merged.length);
              return merged;
            });
          }
        } catch {
          setMailList(prev => {
            const merged = [...newMails, ...prev];
            console.log('[syncMails] setMailList (fallback): prev len=', prev.length, 'new len=', merged.length);
            return merged;
          });
        }
      } else {
        const errMsg = result.error || 'Sync failed';
        console.error('[syncMails] sync failed:', errMsg);
        setSyncError(errMsg);
        try {
          const cachedResp = await window.electronAPI.invoke('mail:loadCached', accountId, folder) as { success: boolean; data?: RendererMailSummary[] };
          if (cachedResp.success && cachedResp.data && cachedResp.data.length > 0) {
            console.log('[syncMails] loading', cachedResp.data.length, 'cached mails');
            setMailList(prev => [...cachedResp.data!, ...prev]);
          }
        } catch (cacheErr) {
          console.error('[syncMails] loadCached failed:', cacheErr);
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[syncMails] exception:', msg);
      setSyncError(msg);
    } finally {
      console.log('[syncMails] END, isSyncing=false');
      setIsSyncing(false);
    }
  }, []);

  const fetchMailDetail = useCallback(async (accountId: number, messageUid: number, folder: string = 'INBOX') => {
    const cacheKey = `${accountId}:${messageUid}`;

    // Cache hit: render instantly, skip IPC
    const cached = bodyCache.current.get(cacheKey);
    if (cached) {
      setCurrentMail(cached);
      setMailLoadingState('success');
      setMailError(null);
      return;
    }

    setMailLoadingState('loading');
    setMailError(null);
    setCurrentMail(null);

    try {
      const response = await window.electronAPI.invoke('mail:fetchFull', accountId, messageUid, folder);
      const result = response as ApiResponse<RendererMailDetail>;
      if (result.success && result.data) {
        // Write to cache before setting state
        bodyCache.current.set(cacheKey, result.data);
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

  /** Remove a specific entry from body cache (call when deleting an email) */
  const clearBodyCacheEntry = useCallback((accountId: number, uid: number) => {
    bodyCache.current.delete(`${accountId}:${uid}`);
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
    clearBodyCacheEntry,
  };
}
```

- [ ] **Step 3: Update `handleDeleteEmail` in App.tsx to clear body cache**

In `src/renderer/App.tsx`, destructure `clearBodyCacheEntry` from `useMail()`:

```typescript
const {
  isSyncing,
  syncMails,
  mailList,
  setMailList,
  currentMail,
  fetchMailDetail,
  mailLoadingState,
  mailError,
  clearCurrentMail,
  clearBodyCacheEntry,
} = useMail();
```

Then update `handleDeleteEmail`:

```typescript
const handleDeleteEmail = (emailId: string) => {
  const target = mailList.find(e => e.id === emailId);
  if (target) clearBodyCacheEntry(target.accountId, target.uid);
  setMailList(prev => prev.filter(e => e.id !== emailId));
  if (selectedEmail?.id === emailId) {
    setSelectedEmail(null);
    clearCurrentMail();
  }
  setSelectedIds(prev => prev.filter(id => id !== emailId));
};
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useMail.ts src/renderer/App.tsx
git commit -m "feat: add session body cache in useMail — cache hit skips IPC on re-open"
```

---

## Task 5: MailDetail — State Isolation + Layout Fix + Copy Fix + SenderAvatar

**Files:**
- Modify: `src/renderer/components/MailDetail.tsx`

- [ ] **Step 1: Add state-reset effect keyed on email identity**

In `src/renderer/components/MailDetail.tsx`, import `useEffect` (it's not currently imported — add it):

```typescript
import React, { useState, useRef, useCallback, useEffect } from 'react';
```

Also add the `SenderAvatar` import:

```typescript
import { SenderAvatar } from './SenderAvatar';
```

Then, inside the `MailDetail` component, after the existing state declarations (around line 53), add:

```typescript
// Reset all transient state whenever the viewed email changes
useEffect(() => {
  setIsStarred(false);
  setShowAIPanel(false);
  setAiResult(null);
  setAiLoadingLocal(false);
  setAiFunction(null);
  setCopied(false);
  setCapturing(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [email?.accountId, email?.uid]);
```

- [ ] **Step 2: Fix `handleCopy` to copy full body text**

Replace the existing `handleCopy` function:

```typescript
const handleCopy = () => {
  if (!email) return;
  const text = isDetail(email)
    ? (email.bodyText || email.snippet || email.subject)
    : (email.snippet || email.subject);
  navigator.clipboard.writeText(text);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

- [ ] **Step 3: Fix Email Header avatar — replace hardcoded blue circle with SenderAvatar**

Find the Email Header section (around line 428) and replace the existing avatar `<div>`:

```tsx
{/* Before: */}
<div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0" style={{ backgroundColor: '#0071e3' }}>
  {(email.fromName || email.from).charAt(0).toUpperCase()}
</div>

{/* After: */}
<SenderAvatar name={email.fromName || email.from} size={28} />
```

- [ ] **Step 4: Move AI Panel inside the scroll container and restructure layout**

This is the biggest change in this task. Replace the entire `return` block JSX (from line 229 to end) with the restructured version where `showAIPanel` renders **inside** the scrollable body div:

```tsx
  return (
    <div className="flex-1 h-screen flex flex-col relative w-full min-w-0" style={{ backgroundColor: '#1F2124' }}>

      {/* ── Compact Icon-Only Toolbar ── */}
      <div
        className="h-10 px-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid #3a3a3d' }}
      >
        {/* Left group */}
        <div className="flex items-center gap-1">
          <button
            onClick={onReply}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title={t('reply')}
            style={{ color: '#636366' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = '#282A2E'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {Icons.Reply}
            </span>
          </button>
          <button
            onClick={onForward}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title={t('forward')}
            style={{ color: '#636366' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = '#282A2E'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {Icons.Forward}
            </span>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title={t('delete')}
            style={{ color: '#636366' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff6b6b'; e.currentTarget.style.backgroundColor = 'rgba(255,107,107,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {Icons.Delete}
            </span>
          </button>
        </div>

        {/* Right group */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleCaptureScreenshot}
            disabled={capturing}
            className="p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-40"
            title="截图分享"
            style={{ color: '#636366' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = '#282A2E'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span className="w-[18px] h-[18px] animate-spin" style={{ color: 'currentColor', display: capturing ? 'flex' : 'none' }}>
              {Icons.LoadingSpinner}
            </span>
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: capturing ? 'none' : 'flex' }}>
              {Icons.Share}
            </span>
          </button>

          <button
            onClick={() => setIsStarred(!isStarred)}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title={isStarred ? '取消星标' : '添加星标'}
            style={{ color: isStarred ? '#ff9f0a' : '#636366', backgroundColor: 'transparent' }}
            onMouseEnter={e => { if (!isStarred) { e.currentTarget.style.color = '#ff9f0a'; e.currentTarget.style.backgroundColor = 'rgba(255,159,10,0.08)'; } }}
            onMouseLeave={e => { if (!isStarred) { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {isStarred ? Icons.Starred : Icons.Star}
            </span>
          </button>

          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title="复制正文"
            style={{ color: copied ? '#4ade80' : '#636366', backgroundColor: 'transparent' }}
            onMouseEnter={e => { if (!copied) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = '#282A2E'; } }}
            onMouseLeave={e => { if (!copied) { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: copied ? 'none' : 'flex' }}>
              {Icons.Copy}
            </span>
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: copied ? 'flex' : 'none' }}>
              {Icons.Check}
            </span>
          </button>

          <button
            onClick={() => setShowAIPanel(!showAIPanel)}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title="AI 助手"
            style={{
              backgroundColor: showAIPanel ? 'rgba(0,113,227,0.15)' : 'transparent',
              color: showAIPanel ? '#0071e3' : '#636366',
            }}
            onMouseEnter={e => { if (!showAIPanel) { e.currentTarget.style.backgroundColor = 'rgba(0,113,227,0.08)'; e.currentTarget.style.color = '#0071e3'; } }}
            onMouseLeave={e => { if (!showAIPanel) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#636366'; } }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {Icons.Sparkle}
            </span>
          </button>
        </div>
      </div>

      {/* ── Email Header (subject + sender) ── */}
      <div className="px-4 pt-3 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid #3a3a3d' }}>
        <h1 className="text-[14px] font-semibold text-white leading-tight mb-2" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"', letterSpacing: '-0.01em' }}>{email.subject}</h1>
        <div className="flex items-center gap-2">
          <SenderAvatar name={email.fromName || email.from} size={28} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-white truncate" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>{email.fromName || email.from}</span>
              <span className="text-[11px] flex-shrink-0" style={{ color: '#48484a' }}>{formatRelativeTime(email.date)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Single Scroll Container: AI Panel + Thread + Body ── */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3a3a3d transparent' }}>

        {/* AI Panel — inside scroll, expands without disrupting layout */}
        {showAIPanel && (
          <div className="mb-4 rounded-xl" style={{ backgroundColor: '#282A2E', padding: '12px 16px' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5" style={{ color: '#0071e3', display: 'flex' }}>
                  {Icons.Sparkle}
                </span>
                <span className="text-[12px] font-medium text-white">{t('aiAssistant')}</span>
                <span className="text-[10px]" style={{ color: '#48484a' }}>{aiTargetLanguage}</span>
              </div>
              <button
                onClick={() => setShowAIPanel(false)}
                className="p-1 cursor-pointer transition-colors"
                style={{ color: '#636366' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#636366'; }}
              >
                <span className="w-3.5 h-3.5" style={{ color: 'currentColor', display: 'flex' }}>
                  {Icons.Close}
                </span>
              </button>
            </div>

            <div className="flex gap-1.5">
              {([
                { fn: 'translate' as AIFunction, icon: Icons.Translate, label: t('translate') },
                { fn: 'summarize' as AIFunction, icon: Icons.Summarize, label: t('summarize') },
                { fn: 'reply' as AIFunction, icon: Icons.SendIcon, label: t('reply') },
              ] as { fn: AIFunction; icon: React.ReactNode; label: string }[]).map(({ fn, icon, label }) => (
                <button
                  key={fn}
                  onClick={() => handleAIFunction(fn)}
                  disabled={aiLoading || aiApiLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-white transition-colors cursor-pointer disabled:opacity-40"
                  style={{ backgroundColor: '#3a3a3d' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#48484a')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#3a3a3d')}
                >
                  <span className="w-3.5 h-3.5" style={{ color: 'currentColor', display: 'flex' }}>
                    {icon as React.ReactElement}
                  </span>
                  {label}
                </button>
              ))}
            </div>

            {(aiLoading || aiApiLoading) && (
              <div className="flex items-center gap-2 mt-2" style={{ color: '#636366' }}>
                <span className="w-3.5 h-3.5 animate-spin" style={{ color: 'currentColor', display: 'flex' }}>
                  {Icons.LoadingSpinner}
                </span>
                <span className="text-[11px]">{t('aiProcessing')}</span>
              </div>
            )}

            {aiResult && (
              <div className="mt-2 rounded-xl p-3" style={{ backgroundColor: '#1F2124' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px]" style={{ color: '#0071e3' }}>{t(aiFunction === 'translate' ? 'translationResult' : aiFunction === 'summarize' ? 'summary' : 'replySuggestion')}</span>
                  <div className="flex items-center gap-2">
                    {aiFunction === 'reply' && (
                      <button onClick={handleUseAsReply} className="text-[10px] px-2 py-1 rounded-md text-white cursor-pointer transition-colors" style={{ backgroundColor: '#0071e3' }}>{t('useThisReply')}</button>
                    )}
                    <button
                      onClick={handleCopyResult}
                      className="text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                      style={{ color: '#636366' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#636366'; }}
                    >
                      <span className="w-3 h-3" style={{ color: 'currentColor', display: 'flex' }}>
                        {Icons.Copy}
                      </span>
                      {t('copy')}
                    </button>
                  </div>
                </div>
                <pre className="text-[12px] whitespace-pre-wrap leading-relaxed" style={{ color: '#D1D1D6', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>{aiResult}</pre>
              </div>
            )}
          </div>
        )}

        {/* ── Email Body ── */}
        <div className="rounded-xl p-4 text-[13px] leading-relaxed min-h-[100px]" style={{ backgroundColor: '#282A2E', color: '#D1D1D6', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
          {isBodyLoading ? (
            <div className="flex items-center justify-center gap-2 py-8" style={{ color: '#636366' }}>
              <span className="w-4 h-4 animate-spin" style={{ color: 'currentColor', display: 'flex' }}>
                {Icons.LoadingSpinner}
              </span>
              <span className="text-[12px]">正在加载正文...</span>
            </div>
          ) : bodyHtml ? (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(bodyHtml, {
                  ALLOWED_TAGS: ['p','br','b','i','u','strong','em','a','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote','span','div','table','thead','tbody','tr','th','td','img','hr','pre','code'],
                  ALLOWED_ATTR: ['href','src','alt','title','style','class','target'],
                  ALLOW_DATA_ATTR: false,
                }),
              }}
            />
          ) : bodyText ? (
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{bodyText}</pre>
          ) : isBodyError ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px]" style={{ backgroundColor: 'rgba(255,159,10,0.1)', color: '#ff9f0a' }}>
                ⚠️ 无法加载正文（{mailError || '连接失败'}）
                {onRetry && (
                  <button onClick={onRetry} className="ml-auto text-[11px] px-2 py-0.5 rounded-md cursor-pointer" style={{ backgroundColor: '#3a3a3d', color: '#a1a1a6' }}>重试</button>
                )}
              </div>
              {email.snippet && <pre style={{ whiteSpace: 'pre-wrap', color: '#D1D1D6', margin: 0 }}>{email.snippet}</pre>}
            </div>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', color: '#D1D1D6', margin: 0 }}>{email.snippet || '（无内容）'}</pre>
          )}
        </div>
      </div>
    </div>
  );
```

Note: `bodyRef` now points to the scroll container, which is correct for screenshot capture (captures the full scrollable content).

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/MailDetail.tsx
git commit -m "fix: state isolation on email switch, AI panel inside scroll, copy full body text, unified avatar"
```

---

## Task 6: Thread View — App.tsx Helper + MailDetail ThreadMessage UI

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/MailDetail.tsx`

### Part A: App.tsx — thread sibling state + helper

- [ ] **Step 1: Add `threadSiblings` state and `findThreadSiblings` helper in App.tsx**

After the existing `const [lastClickedId, ...]` declaration (around line 126), add:

```typescript
const [threadSiblings, setThreadSiblings] = useState<RendererMailSummary[]>([]);
```

After the `lookbackToMs` function (before the `App` function declaration), add the `findThreadSiblings` helper at module level (outside the component):

```typescript
/** Find all emails in the same thread as `target`, sorted oldest-first.
 *  Uses In-Reply-To chains. Same-account only to avoid cross-account false matches. */
function findThreadSiblings(
  target: RendererMailSummary,
  allMails: RendererMailSummary[]
): RendererMailSummary[] {
  if (!target.messageId && !target.inReplyTo) return [];

  // Build a lookup by messageId (same account)
  const byMsgId = new Map<string, RendererMailSummary>();
  for (const m of allMails) {
    if (m.accountId === target.accountId && m.messageId) {
      byMsgId.set(m.messageId, m);
    }
  }

  // Walk up the inReplyTo chain to collect all ancestor message-IDs
  const threadMsgIds = new Set<string>();
  function collectChain(mail: RendererMailSummary, depth = 0): void {
    if (depth > 50) return; // cycle guard
    if (mail.messageId) threadMsgIds.add(mail.messageId);
    if (mail.inReplyTo) {
      threadMsgIds.add(mail.inReplyTo); // include even if not loaded
      const parent = byMsgId.get(mail.inReplyTo);
      if (parent && !threadMsgIds.has(parent.messageId ?? '')) {
        collectChain(parent, depth + 1);
      }
    }
  }
  collectChain(target);

  // Any mail in the same account that shares a message-ID or replies to one in the chain
  return allMails.filter(m =>
    m.id !== target.id &&
    m.accountId === target.accountId &&
    (
      (m.messageId && threadMsgIds.has(m.messageId)) ||
      (m.inReplyTo && threadMsgIds.has(m.inReplyTo))
    )
  ).sort((a, b) => a.date.getTime() - b.date.getTime());
}
```

- [ ] **Step 2: Call `findThreadSiblings` in `handleViewEmail`**

Update `handleViewEmail` in App.tsx:

```typescript
const handleViewEmail = (email: RendererMailSummary) => {
  setSelectedEmail(email);
  fetchMailDetail(email.accountId, email.uid, email.folder);
  setThreadSiblings(findThreadSiblings(email, mailList));
  if (isMobile) setMobileView('detail');
};
```

- [ ] **Step 3: Pass `threadSiblings` to `MailDetail`**

In the `<MailDetail ...>` JSX in App.tsx, add the prop:

```tsx
<MailDetail
  t={t}
  email={currentMail ?? selectedEmail}
  onReply={() => setShowCompose(true)}
  onForward={() => setShowCompose(true)}
  onDelete={() => { if (selectedEmail) handleDeleteEmail(selectedEmail.id); }}
  onBack={handleBackToList}
  onShare={handleShare}
  aiTargetLanguage={aiTargetLanguage}
  onReplyWithSuggestion={handleReplyWithSuggestion}
  mailLoadingState={mailLoadingState}
  mailError={mailError}
  onRetry={() => selectedEmail && fetchMailDetail(selectedEmail.accountId, selectedEmail.uid, selectedEmail.folder)}
  threadSiblings={threadSiblings}
/>
```

### Part B: MailDetail.tsx — add `threadSiblings` prop + `ThreadMessage` component

- [ ] **Step 4: Add `threadSiblings` to `MailDetailProps`**

```typescript
interface MailDetailProps {
  t: (key: string) => string;
  email: MailEmail | null;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  onShare?: (blob: Blob, filename: string) => void;
  aiTargetLanguage: string;
  onReplyWithSuggestion: (content: string) => void;
  mailLoadingState?: MailLoadingState;
  mailError?: string | null;
  onRetry?: () => void;
  threadSiblings?: RendererMailSummary[];
}
```

- [ ] **Step 5: Add `ThreadMessage` component at the bottom of MailDetail.tsx**

Add after the existing `formatRelativeTime` function at the bottom of the file:

```tsx
interface ThreadMessageProps {
  email: RendererMailSummary;
}

function ThreadMessage({ email }: ThreadMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<RendererMailDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded && !detail && !loading) {
      setLoading(true);
      try {
        const res = await window.electronAPI.invoke(
          'mail:fetchFull',
          email.accountId,
          email.uid,
          email.folder
        ) as { success: boolean; data?: RendererMailDetail };
        if (res.success && res.data) setDetail(res.data);
      } catch (err) {
        console.error('[ThreadMessage] fetchFull failed:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const bodyHtml = detail?.bodyHtml;
  const bodyText = detail?.bodyText;

  return (
    <div className="mb-2 rounded-xl overflow-hidden" style={{ backgroundColor: '#282A2E' }}>
      {/* Header row — always visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
        style={{ color: '#D1D1D6' }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#3a3a3d'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <SenderAvatar name={email.fromName || email.from} size={22} />
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <span className="text-[12px] font-medium truncate">{email.fromName || email.from}</span>
          {email.to && (
            <span className="text-[11px] truncate" style={{ color: '#636366' }}>
              → {email.to.split(',')[0]}
            </span>
          )}
        </div>
        <span className="text-[11px] flex-shrink-0" style={{ color: '#636366' }}>
          {formatRelativeTime(email.date)}
        </span>
        <span className="text-[10px] flex-shrink-0 ml-1" style={{ color: '#636366' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Body — only when expanded */}
      {expanded && (
        <div
          className="px-3 pb-3 text-[12px] leading-relaxed"
          style={{ borderTop: '1px solid #3a3a3d', color: '#D1D1D6', paddingTop: 8 }}
        >
          {loading ? (
            <div className="flex items-center gap-2 py-3" style={{ color: '#636366' }}>
              <span className="w-3.5 h-3.5 animate-spin" style={{ display: 'flex' }}>
                {Icons.LoadingSpinner}
              </span>
              <span>加载中...</span>
            </div>
          ) : bodyHtml ? (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(bodyHtml, {
                  ALLOWED_TAGS: ['p','br','b','i','u','strong','em','a','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote','span','div','table','thead','tbody','tr','th','td','img','hr','pre','code'],
                  ALLOWED_ATTR: ['href','src','alt','title','style','class','target'],
                  ALLOW_DATA_ATTR: false,
                }),
              }}
            />
          ) : bodyText ? (
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{bodyText}</pre>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{email.snippet || '（无内容）'}</pre>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Render thread siblings in the scroll container**

In the `MailDetail` component return JSX, inside the scroll container div (before the "Email Body" section), add:

```tsx
{/* ── Thread: historical messages (collapsed) above current ── */}
{threadSiblings && threadSiblings.length > 0 && (
  <div className="mb-3">
    {threadSiblings.map(sibling => (
      <ThreadMessage key={`${sibling.accountId}:${sibling.uid}`} email={sibling} />
    ))}
  </div>
)}
```

Place this between the closing `}` of the AI panel block and the opening of the Email Body div.

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/MailDetail.tsx
git commit -m "feat: IMAP-header thread view — historical messages collapsed above current email"
```

---

## Task 7: MailList — Replace AvatarCell with SenderAvatar

**Files:**
- Modify: `src/renderer/components/MailList.tsx`

- [ ] **Step 1: Add SenderAvatar import and remove old avatar logic**

At the top of `src/renderer/components/MailList.tsx`, add the import:

```typescript
import { SenderAvatar } from './SenderAvatar';
```

Then locate the existing avatar-related code in MailList.tsx:
- The `GLOBE_DOMAINS` set
- The `BLOCKED_FAVICON_PATTERNS` array  
- The `isBlockedFavicon` function
- The `isGlobeFavicon` function
- The `getAvatarColor` function
- The `AvatarCell` component (or equivalent)

Delete all of these — they are fully replaced by `SenderAvatar`.

- [ ] **Step 2: Find every avatar render in MailList and replace with SenderAvatar**

In the email list row render, find where the avatar is rendered (look for something like `<AvatarCell>`, or a `<div>` with avatar logic calling `getAvatarColor`). Replace it with:

```tsx
<SenderAvatar name={email.fromName || email.from} size={32} className="flex-shrink-0" />
```

The exact size (32px) matches the current avatar size in MailList. Adjust if different.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors. If `getAvatarColor` was also used in MailList for category colors (not avatars), keep those usages and only delete the function if it's solely for avatars.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/MailList.tsx
git commit -m "refactor: replace custom AvatarCell with shared SenderAvatar in MailList"
```

---

## Task 8: ComposeDialog — Wire Real AI Calls

**Files:**
- Modify: `src/renderer/components/ComposeDialog.tsx`

- [ ] **Step 1: Replace mock `handlePolish` with real IPC call**

Find `handlePolish` in `ComposeDialog.tsx` and replace it entirely:

```typescript
const handlePolish = async () => {
  if (!body.trim()) return;
  setAiLoading(true);
  setError(null);
  try {
    const res = await window.electronAPI.invoke('ai:polish', body, 'formal') as {
      success: boolean; content?: string; error?: string;
    };
    if (res.success && res.content) {
      setBody(res.content);
    } else {
      setError(res.error || '润色失败，请检查 AI 配置');
    }
  } catch (err) {
    setError((err as Error).message || '润色请求异常');
  } finally {
    setAiLoading(false);
  }
};
```

- [ ] **Step 2: Replace mock `handleTranslate` with real IPC call**

Find `handleTranslate` in `ComposeDialog.tsx` and replace it entirely:

```typescript
const handleTranslate = async (targetLang: string) => {
  if (!body.trim()) return;
  setAiLoading(true);
  setError(null);
  setShowLangMenu(false);

  const langMap: Record<string, string> = {
    '中文': 'Chinese',
    'English': 'English',
    '日本語': 'Japanese',
    '한국어': 'Korean',
    'Español': 'Spanish',
    'Français': 'French',
    'Deutsch': 'German',
    'Русский': 'Russian',
  };
  const apiLang = langMap[targetLang] || targetLang;

  try {
    const res = await window.electronAPI.invoke('ai:translate', body, apiLang) as {
      success: boolean; content?: string; error?: string;
    };
    if (res.success && res.content) {
      setBody(res.content);
    } else {
      setError(res.error || '翻译失败，请检查 AI 配置');
    }
  } catch (err) {
    setError((err as Error).message || '翻译请求异常');
  } finally {
    setAiLoading(false);
  }
};
```

- [ ] **Step 3: Remove unused imports**

Remove `Check` from the lucide-react import if it's unused (the mock code may have used it). Keep `Sparkles`, `Loader2`, `X`, `Globe`.

- [ ] **Step 4: Remove unused `aiResult` state** 

The `aiResult` state was only used by the old mock to store translated text before writing to body. Since the new implementation writes directly to `body`, remove the `aiResult` state:

Remove: `const [aiResult, setAiResult] = useState<string | null>(null);`

Also remove all `setAiResult(...)` calls (there should be none after the replacement above).

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ComposeDialog.tsx
git commit -m "fix: wire compose AI polish/translate to real IPC instead of mock setTimeout"
```

---

## Task 9: App.tsx — Fix `runBatchAnalysis` AI Classification

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Replace `runBatchAnalysis` with the corrected implementation**

Find the `runBatchAnalysis` `useCallback` in App.tsx (around line 272) and replace it entirely:

```typescript
const runBatchAnalysis = useCallback(async () => {
  if (isAiClassifying) return;
  if (mailList.length === 0) return;

  setIsAiClassifying(true);

  try {
    const aiConfig = await window.electronAPI.invoke('ai:getConfig') as {
      success: boolean; data?: { hasApiKey: boolean };
    };
    if (!aiConfig.success || !aiConfig.data?.hasApiKey) {
      setToasts(prev => [...prev, {
        id: Date.now().toString(), type: 'error',
        message: '请先在设置中配置 AI API Key',
      }]);
      return;
    }

    // Apply lookback filter — only classify unread mail within the time window
    const lookbackMs = lookbackToMs(aiLookback);
    const lookbackDate = Date.now() - lookbackMs;
    const eligible = mailList.filter(m => m.date.getTime() > lookbackDate && !m.isRead);

    if (eligible.length === 0) {
      const rangeLabel = aiLookback === '3d' ? '3 天' : aiLookback === '7d' ? '7 天' : '1 个月';
      setToasts(prev => [...prev, {
        id: Date.now().toString(), type: 'info',
        message: `没有在 ${rangeLabel}内需要分析的未读邮件`,
      }]);
      return;
    }

    // Respect scan mode batch size
    const maxBatch = aiScanMode === 'deep' ? 10 : 50;
    const toProcess = eligible.slice(0, maxBatch);

    setToasts(prev => [...prev, {
      id: Date.now().toString(), type: 'info',
      message: `正在分析 ${toProcess.length} 封邮件 (${aiScanMode === 'deep' ? '深度' : '轻度'}扫描)...`,
    }]);

    // Build payload matching ai:classifyBatch IPC contract
    const emailPayload = toProcess.map(m => ({
      id: m.id,
      subject: m.subject,
      from: m.from,
      from_name: m.fromName,
      has_attachment: m.hasAttachments,
      snippet: m.snippet,
    }));

    const response = await window.electronAPI.invoke('ai:classifyBatch', {
      emails: emailPayload,
      scanMode: aiScanMode,
    }) as {
      success: boolean;
      results?: Array<{ id: string; category: string }>;
      error?: string;
    };

    if (response.success && response.results && response.results.length > 0) {
      // Write classification results back into mailList
      const categoryMap = new Map(response.results.map(r => [r.id, r.category]));
      setMailList(prev =>
        prev.map(m => categoryMap.has(m.id) ? { ...m, category: categoryMap.get(m.id) } : m)
      );
      setToasts(prev => [...prev, {
        id: Date.now().toString(), type: 'success',
        message: `AI 分析完成：${response.results!.length} 封邮件已分类`,
      }]);
    } else {
      setToasts(prev => [...prev, {
        id: Date.now().toString(), type: 'error',
        message: response.error || 'AI 分析失败，请检查 API Key 和网络',
      }]);
    }
  } catch (err) {
    console.error('[runBatchAnalysis]', err);
    setToasts(prev => [...prev, {
      id: Date.now().toString(), type: 'error',
      message: 'AI 分析异常，请查看控制台',
    }]);
  } finally {
    if (aiLockTimer.current) clearTimeout(aiLockTimer.current);
    aiLockTimer.current = setTimeout(() => {
      setIsAiClassifying(false);
      aiLockTimer.current = null;
    }, 1000);
  }
}, [isAiClassifying, mailList, aiLookback, aiScanMode]);
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "fix: runBatchAnalysis uses ai:classifyBatch and writes category back to mailList"
```

---

## Task 10: Final Build Verification

- [ ] **Step 1: Full clean build**

```bash
cd "D:\下载\编程\APARK" && npm run build
```

Expected: Build completes with zero TypeScript errors and zero Vite warnings about missing imports.

- [ ] **Step 2: Check key imports are clean**

```bash
grep -r "AvatarCell\|getAvatarColor\|isGlobeFavicon\|isBlockedFavicon\|GLOBE_DOMAINS\|BLOCKED_FAVICON_PATTERNS" src/renderer/
```

Expected: no matches (all old avatar logic removed).

```bash
grep -r "ai:summarize" src/renderer/App.tsx
```

Expected: no match (old wrong batch classification removed).

```bash
grep -r "setTimeout.*1500" src/renderer/components/ComposeDialog.tsx
```

Expected: no match (mock AI removed).

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: complete 7-issue minimail fix — build verified"
```

---

## Post-Implementation Manual Test Checklist

After running `npm run dev`, verify each fix with a real account:

| # | Test | Expected |
|---|------|----------|
| 1 | Open email A → open email B → re-open email A | Email A body renders instantly (no loading spinner) |
| 2 | Open a reply chain (search for Re: subject) | Thread messages appear collapsed above the current email |
| 3 | Click AI 助手 → Translate | AI panel expands within the scroll area; email body still scrollable below |
| 4 | Translate email A, then click email B in the list | Email B detail has no AI panel, no translation result |
| 5 | Check avatar in list vs in detail view | Same initials, same color for same sender |
| 6 | Click Copy on an email with body | Paste elsewhere — should be full body text, not just snippet |
| 7 | Click Screenshot | Toast appears: "长截图已复制，直接粘贴发送即可" |
| 8 | Open Compose → type body → click 润色 (with AI configured) | Body text replaced with polished version |
| 9 | Run AI 分类 from Sidebar | After completion, click a category folder — emails with that category appear |
