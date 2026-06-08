# MiNiMail Bug 报告（深度审查 2026-06-08）

> 审查范围：`src/main/**`（27 文件）、`src/preload/**`（2 文件）、`src/renderer/**`（约 40 文件 / 4082 行 App.tsx 重点过）、`src/shared/**`（约 30 文件 / AI 全部）
> 审查方法：源代码静态分析 + 关键单元测试（`scripts/scheduled-send-*.test.ts`、`electron-sandbox-security.test.cjs`、`compose-*.test.ts`）退出码 0 通过 + 完整 renderer typecheck + 实际 `vite build`（1.41s 通过，1082KB chunk）+ 主进程 `tsc -b` 干净
> 严重度：**P0 影响生产行为/数据** / **P1 类型安全或代码债** / **P2 死代码或优化**

## TL;DR

| 严重度 | 数量 | 摘要 |
| ---- | ---- | ---- |
| **P0** | 3 | (1) 5 秒撤回发送存在 race condition，邮件可能已发出 (2) `deliveryState: 'missed'` 在 5 处类型定义遗漏 (3) `useAccounts.ts` 重复声明 `Window.electronAPI` 全局类型，覆盖了 preload 的完整类型 |
| **P1** | 8 | console.log 残留、as 强转隐藏类型、path traversal 通过 symlink、unbounded attachment copy、cancelled taskId race、clear() race、fetchMailAttachment 无 size cap、regex 净化 HTML |
| **P2** | 12+ | 死代码 10+ 处、`setTimeout` 未存 timer ID 10+ 处、appLanguage 硬编码、bundle 1082KB 未拆分、错误日志用户不可见 |

---

## P0 — 严重（生产行为/数据正确性受影响）

### BUG-01：5 秒撤回发送的 race condition — 邮件可能已经发出去

**文件**：`src/renderer/App.tsx:2816-2900`、`App.tsx:3045-3049`

**问题**：5 秒倒计时（普通发送的 `SEND_UNDO_DELAY_MS = 5000`）结束后，**真正的 `mail:send` 已经在 await SMTP 返回**，这时用户点"撤回"会看到 UI 状态从 "scheduled/sending" 变 "cancelled"，但**邮件实际上已经发出去了**。

**根因**（line 2862-2900 关键代码）：
```ts
const runScheduledSend = async () => {
  scheduledSendTimersRef.current.delete(localSendId);
  if (!activeScheduledSendsRef.current.has(localSendId)) return;

  const sendingMail: RendererMailSummary = { ...optimisticMail, deliveryState: 'sending', ... };
  updateLocalSendMail(sendingMail);
  try { await cacheLocalMail(sendingMail); } catch { /* ignore */ }

  let result: { success: boolean; message: string; messageId?: string };
  try {
    result = await window.electronAPI.invoke('mail:send', ...);  // ← SMTP 调用
  } catch (err) { ... }

  if (!result.success) {
    // 写 failedMail
  } else {
    // 写 deliveredMail — 邮件已经发出
  }
  // ...
  activeScheduledSendsRef.current.delete(localSendId);
};

const cancelScheduledSend = async () => {
  const pendingTimer = scheduledSendTimersRef.current.get(localSendId);
  if (pendingTimer) {
    if (timer) clearTimeout(timer);
    clearTimeout(pendingTimer);  // ← 关键 bug: timer 已 fire，clearTimeout 无效
  }
  scheduledSendTimersRef.current.delete(localSendId);
  if (!activeScheduledSendsRef.current.has(localSendId)) return;
  activeScheduledSendsRef.current.delete(localSendId);
  // ... 把状态改 cancelled，写 cacheLocalMail（await）
};
```

**竞态时间线**：
1. T+5000ms：timer fire，同步执行 `runScheduledSend` 到 `await cacheLocalMail(sendingMail)`（line 2873），让出 microtask
2. T+5000ms+ε：用户点 toast action → `cancelScheduledSend` 同步跑，line 2822 `clearTimeout` 无效（timer 已 fire），line 2826 删 active，**await `cacheLocalMail(cancelledMail)`**（line 2850）让出
3. microtask 切换：`runScheduledSend` 在 line 2890 调 `mail:send` 真正发邮件
4. SMTP 返回后，line 2930-2938 写 `deliveredMail` 进 cache（覆盖 cancelledMail）
5. 用户看到 UI 显示 `cancelled`，但**邮件已发出**

**问题诊断**：
- 5 秒倒计时发送**没走** `mail:scheduleSend` + `mail:sendScheduledNow` IPC，所以**没经过**主进程的 `tryMarkJobSending` 状态锁
- 主进程无法阻止已经发出的邮件
- Renderer 端 `activeScheduledSendsRef` 是软信号，无 atomic guard

**复现路径**：
1. 配好 SMTP 账号，发送测试邮件到自己的另一个邮箱
2. 邮件进入 5 秒倒计时阶段
3. 在 4.9 秒时点击 toast 的"撤回"按钮
4. 验证：对方邮箱**仍然收到邮件**（即使 UI 显示 cancelled）

**修复方案**（推荐顺序）：
1. **5 秒倒计时也走 scheduled IPC**：把 5 秒 timer 在 renderer 端用 `mail:scheduleSend` 代替（scheduledAt 立刻）→ 这样主进程会经过 `tryMarkJobSending` 状态锁。但**仍然有 race**（用户点撤回 vs SMTP 已发），需要主进程在 `mail:send` 之前再做一次 final 状态检查。
2. **Renderer 用 cancellation token**：用 `AbortController`，`runScheduledSend` 起步 `if (controller.signal.aborted) return;`，`cancelScheduledSend` 立即 `controller.abort()`，然后所有后续 await 检查信号。
3. **顺序化**：把 SMTP 发送完成前不允许修改状态——例如把 `deliveryState` 改成 `sending` 的同时，**禁用撤回按钮**，5 秒倒计时结束立刻发请求，发完再开 UI。

**严重度**：P0 — 直接破坏"撤回"承诺，用户可能误以为邮件没发但实际已发。

---

### BUG-02：`deliveryState: 'missed'` 在 5 处类型定义遗漏，破坏类型安全

**文件**：
- `src/main/services/mail.ts:30` `MailSummary.deliveryState`
- `src/main/services/mailService.ts:49` `MailSummaryStored.deliveryState`
- `src/main/services/mailService.ts:798, 853, 1335` 数据库行读取的 `as` 强转
- `src/renderer/utils/mailConversations.ts:23` `ConversationMail.deliveryState`
- `src/main/ipc/mail.ts:1092` `mail:cacheLocal` IPC schema

**问题**：主进程 `ScheduledSendJobStatus`（`scheduledSendService.ts:6`）含 6 个状态（`scheduled | sending | sent | cancelled | failed | missed`），DB schema 的 CHECK 约束也接受 `missed`。但其他 5 处类型只写了 5 个状态。

**直接后果**：
1. **TS 报错**（App.tsx:1621-1622）：`RendererMailSummary.deliveryState` 含 `missed`，但 `findSenderConversationMails` 参数 `ConversationMail.deliveryState` 不含 `missed` → 编译失败。
2. **运行时类型谎报**（mailService.ts:798 等）：`row.delivery_state as 'scheduled' | ... | 'cancelled'` 当 DB 中是 `missed` 时，TS 假装它不是，逻辑分支判断全部走错。
3. **IPC schema 不安全**（mail.ts:1092）：preload 只校验 channel 名不校验 payload，renderer 端用 `as` 绕过类型能传 `missed` 进来，主进程写库成功，下次读取时再次静默丢失 `missed` 类型信息。
4. **副作用**（mailService.ts:588 `keepDraftPayload`）：missed 邮件保存时会清空 `draft_payload`——**用户重发 missed 任务时可能丢失草稿正文**。
5. **副作用**（mailListViewModel.ts:62-64 `isDraftMailForDisplay`）：missed 邮件会被当成普通邮件显示，**在 inbox / conversation 视图里被错误归类**。

**修复方案**：
1. 新建 `src/shared/mailDeliveryState.ts` 导出统一联合类型：
   ```ts
   export type MailDeliveryState =
     | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'missed';
   ```
2. 5 处都 `import { MailDeliveryState }` 替代字面量联合
3. 删除 3 处 `as` 强转，让 TS 强制 narrow

**严重度**：P0 — 影响 production 行为（missed 邮件 draft payload 丢失、conversation 视图错误归类），同时阻塞严格 typecheck。

---

### BUG-03：`useAccounts.ts` 重复声明 `Window.electronAPI` 全局类型，覆盖了 preload 完整类型

**文件**：`src/renderer/hooks/useAccounts.ts:115-130`

**问题**：
```ts
// Extend window.electronAPI with invoke method
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getUserDataPath: () => Promise<string>;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      onMessage: (callback: (message: string) => void) => void;
      onMailSync: (callback: (mail: unknown) => void) => void;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      isMaximized: () => Promise<boolean>;
    };
  }
}
```

`src/preload/electronAPI.d.ts` 已经声明了 `Window.electronAPI`，且**类型更完整**（含 `onBackupProgress`、`onScheduledSendUpdated`、`onMailStagedSyncProgress`、`openAttachment`、`downloadAttachment` 等）。

**直接后果**：
- `useAccounts.ts` 的 `declare global` 会**覆盖**（合并时取较窄的类型）`electronAPI.d.ts` 的声明
- 在 `useAccounts.ts` 导入作用域内，`window.electronAPI.onBackupProgress` 等**报 TS2339: Property does not exist**（这就是 typecheck 25+ 错误中那 3 个 Property 不存在错误的根本原因）
- `App.tsx` 引用了 `useAccounts`，所以同样的错误冒泡到 App.tsx

**修复方案**：
- 删除 `useAccounts.ts:115-130` 的 `declare global` 块
- 让 `electronAPI.d.ts` 作为唯一定义（并确保它被 `tsconfig.json` 的 `include` 覆盖——目前 `include: ["src/renderer"]` 没显式包含 preload 目录，**需要在 tsconfig.json 加 `"types": ["./src/preload/electronAPI"]` 或把 electronAPI.d.ts 移到 renderer 目录**）

**严重度**：P0 — 这是 BUG-02 之外导致 typecheck 25+ 错误的另一个根因，且修复后立刻让 3 个 `Property does not exist` 错误消失。

---

## P1 — 中等（类型安全 / 代码债 / 边界）

### BUG-04：主进程 4 处 `console.log` debug 残留

**文件**：`src/main/services/mail.ts:337, 383, 395, 433`

```ts
console.log('[mail.createClient] ENTER accountId=', accountId);
console.log('[mail.createClient] connecting to', `${account.imap_host}:${account.imap_port}`, account.auth_type);
console.log('[mail.createClient] connected OK');
console.log('[mail.fetchMailList] ENTER accountId=', accountId, 'folder=', folder);
```

**问题**：
- `main/index.ts:369` 的 `console-message` 监听只 catch `level >= 2`（error），所以 `console.log`（level 0）会**泄漏到 stdout/stderr**
- AGENTS.md 218-229 明确"严禁在日志/输出中写真实敏感数据"。这些 `console.log` 暴露 **IMAP host/port**——企业自建邮件场景敏感
- 看起来是 dev 残留

**修复**：删除或改为 `log.info/debug`（已 import `electron-log`）

---

### BUG-05：unbounded `fs.copyFile` — `outgoingAttachmentCache.ts:76`

**文件**：`src/main/services/outgoingAttachmentCache.ts:66-92`

**问题**：
```ts
const stat = await fs.promises.stat(filePath);
if (!stat.isFile()) throw new Error('Attachment path is not a file');
// ... 
await fs.promises.copyFile(filePath, localCachePath);  // ← 无 size 限制
```

`copyFile` 之前**没有 size 限制**。上下文里 `mail:selectOutgoingAttachments`（mail.ts:1031）有 `MAX_OUTGOING_ATTACHMENT_BYTES = 25MB` 限制，但**函数本身没内建 size 限**。如果 standalone 调用或被未来的 caller 复用，**会复制任意大文件**——磁盘爆满、内存拷贝开销。

**修复**：
```ts
if (stat.size > MAX_ATTACHMENT_BYTES) {
  throw new Error('Attachment is too large');
}
```

---

### BUG-06：`mailBackupTasks` cancelled taskId 在 task 复用时残留

**文件**：`src/main/services/mailBackupTasks.ts`

**问题**：
```ts
const cancelledTaskIds = new Set<string>();

export function cancelMailBackupTask(taskId: string): boolean {
  if (!taskId) return false;
  cancelledTaskIds.add(taskId);  // ← add，但谁负责 remove？
  return true;
}

export async function runMailBackupTaskWithCleanup<T>(taskId, operation) {
  try { return await operation(); }
  finally {
    if (taskId) cancelledTaskIds.delete(taskId);  // ← only this path
  }
}
```

**问题诊断**：
- `cancelMailBackupTask` 单独调用（不在 `runMailBackupTaskWithCleanup` 内）会**永久留在 set**里
- 即使在正常路径下：`operation()` 内部 loop 检查 `isMailBackupTaskCancelled`（`mailBackup.ts:355, 606`）提前 return——**但 `return` 时 finally 还没执行**。如果用户用**相同 taskId 立即启动新任务**，新任务的 loop 在 finally 删除旧 cancel 标志之前会看到 `isMailBackupTaskCancelled === true`，**新任务被错误取消**

**复现路径**（理论）：
1. 启动 export task，taskId="abc"
2. 用户在 export 过程中点 cancel → `cancelMailBackupTask("abc")` → cancelledTaskIds.add("abc")
3. 立刻启动新 task 用同一 taskId "abc"
4. 新 task 进入 loop，第一次 `isMailBackupTaskCancelled("abc")` 返回 true
5. finally 还没执行（因为旧 task 还在 finally 等待），新 task 被错误取消

**修复**：
- `cancelMailBackupTask` 不需要修改（add 是正确的）
- `runMailBackupTaskWithCleanup` 在 operation **开始前**就 delete（保证新 task 不会看到旧 cancel）：
  ```ts
  export async function runMailBackupTaskWithCleanup<T>(taskId, operation) {
    if (taskId) cancelledTaskIds.delete(taskId);  // ← 加在开头
    try { return await operation(); }
    finally { if (taskId) cancelledTaskIds.delete(taskId); }
  }
  ```

---

### BUG-07：`SharedMailBodyStore.clear()` 不取消 in-flight promise

**文件**：`src/renderer/utils/mailBodyLoader.ts:77-82, 127-129`

**问题**：
```ts
clear(identity) {
  const key = buildMailBodyCacheKey(identity);
  this.forget(key);
  this.inFlight.delete(key);  // ← 只从 Map 删
}

async load(api, identity) {
  // ...
  const task = (async () => { /* ... await invoke('mail:loadCachedBody') / 'mail:fetchFull' ... return this.remember(key, ...) */ })()
    .finally(() => { this.inFlight.delete(key); });
  this.inFlight.set(key, task);
  return task;
}
```

`clear()` 从 `inFlight` Map 删除 entry，但**Promise 本身不能 cancel**。Promise 完成时仍会调 `this.remember(key, ...)`，把结果写回 memory。

**后果**：
- 用户点邮件 A → load 启动
- 快速切到邮件 B → clear(A)
- A 的 fetchFull 在 await 后完成 → **写回 memory（A 旧数据可能被 stale 化）**
- 再次点 A → `memory.has(A)` 返回 true → 返回**过期数据**（实际 IMAP 上 A 可能已被服务端 move/delete 改变）

**修复**：
- 用 `AbortController` + signal
- 或在 `remember` 调用前检查 `this.memory.has(key) === false`（**只有重新加载**才 set memory）
- 或在 `remember` 里 check `this.forget(key)` 已 done → 不再写

**严重度**：P1 — race window 小，但用户快速切换场景下会看到 stale body

---

### BUG-08：`fetchMailAttachmentContent` 无 size 上限

**文件**：`src/main/services/mail.ts:629-747`

**问题**：
- `fetchMailAttachmentContent` 接收 target attachment 元数据，调用 `client.download(uid, partId)`，**直接把 stream 读到内存**（`streamToBuffer`）
- 附件大小**没有上限检查**。如果服务端返回 2GB 邮件，**内存爆掉**
- 发送附件路径（`mail.ts:1031`）有 25MB 限制，但**下载路径没有**

**修复**：
- 在 `client.download` 后立即 `stat` 或 `content-length` 检查
- 超过 25MB 抛错转 `ATTACHMENT_DOWNLOAD_FAILED_MESSAGE`

---

### BUG-09：`stripUnsafeHtml` 用 regex 净化 HTML — 已知不可靠

**文件**：`src/renderer/utils/composeDraft.ts:116-129`

**问题**：
```ts
function stripUnsafeHtml(value: string): string {
  return String(value || '')
    .replace(/\[\[MINIMAIL_SIGNATURE_START\]\][\s\S]*?\[\[MINIMAIL_SIGNATURE_END\]\]/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    // ... 其他 regex
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '')
    .replace(/\s+(href|src)\s*=\s*javascript:[^\s>]+/gi, '');
}
```

**问题**：
- HTML regex 净化**已知不安全**（HTML5 spec 允许 `<scrip<!--comment-->t>` 这类绕过）
- 这个函数用于净化 `extractQuotedOriginalHtmlFragment`（line 181-187，引用邮件原文 HTML）
- 主显示路径**用了 DOMPurify**（`mailHtmlSanitizer.ts`、`sanitizeComposeEditableHtml` 内部也走 DOMPurify），但**这个 regex 净化先于 DOMPurify**
- 如果 regex 漏掉（如 `<scrip<!-- -->t>alert(1)</script>`），DOMPurify 应该能 catch
- **但**：如果 regex 把合法 HTML 误删（如 `<button onclick="...">` 整体被误删但保留 onclick 文本），会导致用户邮件显示破损

**实际安全等级**：DOMPurify 在主显示路径覆盖了安全，**regex 是冗余 + 不可靠**。建议删除 regex 净化，让 DOMPurify 做唯一净化点。

**修复**：
- 删除 `stripUnsafeHtml` 整个函数
- `sanitizeComposeEditableHtml` 继续依赖 `DOMPurify.sanitize`

---

### BUG-10：renderer 端 25+ typecheck 错误（除 P0 两个外的剩余）

**文件**：`src/renderer/App.tsx` 等

**错误列表**（`npx tsc -p tsconfig.json --noEmit` 报）：

| 错误 | 行 | 类型 | 根因 |
| ---- | -- | ---- | ---- |
| `TS6305` Output file 'dist/main/shared/*.d.ts' has not been built | 9 处 | build 顺序 | shared 模块需要先 `npm run build:core` |
| `TS6133` is declared but its value is never read | 10 处 | dead code | 见 BUG-14 |
| `TS7006` Parameter implicitly has an 'any' type | 3 处 | 缺类型 | App.tsx:205, 1225, 1357 |
| `TS2345` type X is not assignable to Y | 6 处 | 类型不匹配 | `App.tsx:929, 2312` (ActiveAccountSelection), `:1459` (string→AIMailCategory), `:1621-1622` (BUG-02) |

**当前不会阻塞 build**（renderer 走 vite + tsc-bypass），但**未来加 CI 就会爆**。

**修复**：与 BUG-02/03 + BUG-14 一起处理。

---

### BUG-11：`mailBackup.ts:631` 重复读文件

**文件**：`src/main/services/mailBackup.ts:495, 631`

**问题**：
- `parseImportCandidates`（line 490-523）已经 `await fs.readFile(filePath)` 读 EML
- `importMailsFromEmlInternal`（line 631）又 `await fs.readFile(candidate.path)` 读**同一文件**
- **浪费 IO + 内存**——大 EML 文件会被读两遍

**修复**：让 `parseImportCandidates` 把 raw buffer 也返回：
```ts
export async function parseImportCandidates(sourcePaths: string[]): Promise<{ parsed: ParsedImportCandidate[]; rawBuffers: Map<string, Buffer> }>
```
或 `importMailsFromEmlInternal` 用 parsed 的 `bodyText/bodyHtml` 重新组装 EML（更省内存但有格式损失）。

---

### BUG-12：`mailBackup.ts:441-452` `collectImportFilePaths` 跟随 symlink

**文件**：`src/main/services/mailBackup.ts:441-452`

**问题**：
```ts
async function collectImportFilePaths(entryPath: string): Promise<string[]> {
  const stat = await fs.stat(entryPath);  // ← 跟随 symlink
  if (stat.isFile()) { ... }
  if (!stat.isDirectory()) return [];
  const children = await fs.readdir(entryPath, { withFileTypes: true });
  // ... 递归
}
```

- `fs.stat` 跟随 symlink
- `fs.readFile` 也跟随
- 如果用户从"打开 EML"对话框选择了 `evil.eml → /etc/passwd` 这样的 symlink，**会把系统文件当 EML parse** 然后**通过 IMAP append 发送到自己的邮件服务器**
- 攻击场景：恶意邮件附件诱导用户放一个 symlink 到敏感文件，用户点导入 → 敏感文件被读取并通过 SMTP 上传到 IMAP 服务器（攻击者的服务器）

**修复**：
```ts
const stat = await fs.lstat(entryPath);  // 不跟随
if (stat.isSymbolicLink()) {
  log.warn('[mailBackup] skipping symlink', { path: entryPath });
  return [];
}
```

---

## P2 — 死代码 / 优化 / 风格

### BUG-13：renderer 端 40+ 处 `console.error` 用户不可见

**文件**：全项目（App.tsx 最多）

**问题**：
- `main/index.ts:369` `console-message` 监听只 catch `level >= 2` (error)，把 renderer console 错误转发到主进程 `electron-log`
- 但**生产环境** renderer DevTools 默认关闭，用户**看不到**这些错误
- 主进程 `log.error` 写到 `~/Library/Logs/MiNiMail/main.log`——用户也不会查
- AI 失败、网络错误、缓存失败等场景**静默**——用户看到的是 UI 没反应

**修复**：
- 把 renderer 错误**同步显示为 toast**（已经有 `setToasts`，但 `console.error` 不调 setToasts）
- 或加全局 `window.onerror` / `unhandledrejection` 监听器，自动 toast

---

### BUG-14：8+ 处 unused import / function / state（typecheck TS6133）

**文件**：
- `src/renderer/App.tsx:61` `isStandardFolder` imported, never read
- `src/renderer/App.tsx:70` `mailCacheRangeToMs` imported, never read
- `src/renderer/App.tsx:71` `mailHistoryRangeToMs` imported, never read
- `src/renderer/App.tsx:94` `GITHUB_SMART_FOLDER_IDS` imported, never read
- `src/renderer/App.tsx:224-230` `filterDraftsForSelectedFolder` defined, never called
- `src/renderer/App.tsx:1487` `scopedThreadMailUniverse` destructured, never read
- `src/renderer/App.tsx:1958, 1975, 2026, 2045` `handleDeleteSelected` / `handleMarkReadSelected` / `handleToggleStarSelected` / `handleArchiveSelected` defined, never wired to UI
- `src/renderer/components/ComposeDialog.tsx:438` `_onSaveDraft` 显式 unused（下划线前缀，但 noUnusedParameters 仍会警告）

**问题诊断**：
- `tsconfig.json` 开了 `noUnusedLocals: true` + `noUnusedParameters: true` —— 这些**会阻塞 typecheck**（虽然 Vite build 不跑 tsc）
- 4 个未挂 UI 的 handler 实现完整——**可能是规划中的"批量操作"工具栏**，**要么接上要么删**

**修复**：
- 删除 dead imports / dead functions
- `handleDeleteSelected/handleMarkReadSelected/handleToggleStarSelected/handleArchiveSelected` 这 4 个：要么在 MailList 顶部加批量操作 toolbar 接上，要么删

---

### BUG-15：`SettingsModal.tsx` 10+ 处 `setTimeout(() => setSaved(false), 2000)` 未存 timer ID

**文件**：`src/renderer/components/SettingsModal.tsx:2654, 2745, 2770, 2806, 2864, 2913, 2940, 2974, 3016, 3043, 3066`

**问题**：
- 11 处相同模式：
  ```ts
  setTimeout(() => setSaved(false), 2000);
  ```
- timer ID 没保存
- 组件 unmount 后 setTimeout 仍会触发 → 在 unmounted 组件上 setState → React 19 警告
- 用户快速切 tab 时多个 timer 同时跑，最后一个赢

**修复**：抽一个 hook：
```ts
function useSavedIndicator(duration = 2000) {
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!saved) return;
    timerRef.current = window.setTimeout(() => setSaved(false), duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [saved, duration]);
  return [saved, setSaved] as const;
}
```

---

### BUG-16：`ComposeDialog.tsx:209` `appLanguage` 硬编码 `'en'`

**文件**：`src/renderer/components/ComposeDialog.tsx:199-306`

**问题**：
```ts
function labelWithFallback(
  t: ComposeTranslator,
  key: string,
  _appLanguage: AppLanguage,  // ← unused
  _fallbacks: Record<AppLanguage, string>,
): string {
  return t(key);  // ← 只用 i18n，多语言 fallback 完全 dead
}
```

`labelWithFallback` 函数**只用 i18n 翻译**，传入的 `appLanguage` 和 `fallbacks` 参数**完全没用**。`addAttachmentLabel`、`removeAttachmentLabel` 等 10+ 标签**全靠 i18n**，如果 i18n key 缺失，**fallback 不会生效**。

**修复**：
```ts
function labelWithFallback(
  t: ComposeTranslator,
  key: string,
  fallbacks: Record<AppLanguage, string>,
  appLanguage: AppLanguage,
): string {
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return fallbacks[appLanguage] || fallbacks.en || '';
}
```

---

### BUG-17：生产构建 bundle 1082KB 未拆分

**文件**：`vite.config.ts`、`build:vite` 产物

**问题**：
```
dist/renderer/assets/index-BfDKZhOU.js  1,082.86 kB │ gzip: 335.73 kB
```

- 整个 renderer 端打成一个 chunk
- 启动慢（gzip 后仍 335KB），冷启动明显
- 关键原因：`quill`、`mailparser`、`imapflow`（虽然 imapflow 是主进程）、`dompurify`、AI 相关都应该按需引入

**修复**：
- 在 `vite.config.ts` 加 `build.rollupOptions.output.manualChunks`：
  ```ts
  manualChunks: {
    'quill': ['quill'],
    'sanitizer': ['dompurify'],
    'ai': [/shared\/email-ai/],
  }
  ```
- 或用 dynamic import 推迟非关键模块

---

### BUG-18：邮件详情不显示 `attachments.contentId` / `cid`（已查过但未在 UI 用）

**文件**：`src/main/services/mail.ts:580-589`

```ts
return {
  filename: att.filename || 'attachment',
  contentType: att.contentType || 'application/octet-stream',
  size: att.size,
  contentId,
  disposition,
  inline: disposition === 'inline' || Boolean(extra.related),
  cid,
  partId: extra.partId ?? bodyStructureAttachment?.partId,
  attachmentId: extra.attachmentId,
};
```

**问题**：inline 附件的 `cid` 被解析了，但 `MailDetail.tsx` 渲染 inline image 时**只用了 `src=data:` 或 `src=attachmentId`**，没用 `cid: src` 拼接。**收到的邮件里 `<img src="cid:abc">` 不会显示 inline 图片**。

**复现路径**：发送一封带内嵌图片的邮件，接收方看到 `<cid>` placeholder 文字而不是图片。

**修复**：
- 在 `MailDetail` 渲染前，把 `<img src="cid:xxx">` 的 src 替换为 `cid:xxx` 对应的 attachment `data:` URL
- 或在 sanitizeEmailHtml 时做 cid → data: 的替换

---

### BUG-19：未在 UI 接的批量操作 handler

**文件**：`src/renderer/App.tsx:1958, 1975, 2026, 2045`

```ts
const handleDeleteSelected = async (targetIdsInput?: string[]) => { /* 完整实现 */ };
const handleMarkReadSelected = async (read: boolean, targetIdsInput?: string[]) => { /* 完整实现 */ };
const handleToggleStarSelected = async (targetIdsInput?: string[]) => { /* 完整实现 */ };
const handleArchiveSelected = async (targetIdsInput?: string[]) => { /* 完整实现 */ };
```

**问题**：4 个 handler 实现完整（100+ 行），但**未挂到 MailList UI**——`MailList` 没有"选中后操作"toolbar，**用户不知道怎么用**。

**修复**：要么接上 UI（MailList 顶部加 multi-select toolbar），要么删。

---

### BUG-20：renderer 错误未被 IPC 记录到主进程日志

**文件**：`src/main/index.ts:369-373`

```ts
window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
  if (level >= 2) {
    log.error(`Renderer console [${level}] ${sourceId}:${line} ${message}`);
  }
});
```

**问题**：
- Electron 新版 API 是 `console-message` 传 event 对象，不是 5 个参数 —— 在某些 Electron 版本上 `level, message, line, sourceId` 都是 undefined
- renderer 错误**没被记录到主进程 log**
- 用户报告 bug 时**没有 stack trace 可查**

**修复**：
- 升级到新 API：`webContents.on('console-message', (event) => { log.error(event.message, event); })`
- 加 `process.on('uncaughtException')` 在 renderer 端 → 通过 IPC 转发到主进程

---

### BUG-21：`App.tsx:205` 隐式 any 回调参数

**文件**：`src/renderer/App.tsx:205, 1225, 1357`

**问题**：
```ts
// line 205
onChange={(attachment) => ...}  // attachment 隐式 any

// line 1225
window.electronAPI.onScheduledSendUpdated((payload) => { ... })  // payload 隐式 any

// line 1357
window.electronAPI.onMailStagedSyncProgress((progress) => { ... })  // progress 隐式 any
```

**修复**：
- 显式标注类型：
  ```ts
  onChange={(attachment: RendererMailAttachment) => ...}
  onScheduledSendUpdated((payload: ScheduledSendUpdateEvent) => ...)
  onMailStagedSyncProgress((progress: MailStagedSyncProgress) => ...)
  ```

---

### BUG-22：`App.tsx:1459` `string` → `AIMailCategory` 联合类型 narrowing 失败

**文件**：`src/renderer/App.tsx:1459`

**问题**：
```ts
const isAiCategoryView = useMemo(() => AI_CATEGORY_IDS.includes(selectedFolder), [selectedFolder]);
```

`AI_CATEGORY_IDS.includes(selectedFolder)` 返回 `boolean`，但 `selectedFolder: string` 应该是 `AIMailCategory` 才能让 TS 满意。

**修复**：在 `mailRoutingAdapter.ts` 把 `AI_CATEGORY_IDS` 类型化为 `readonly AIMailCategory[]`，调用方 `selectedFolder: AIMailCategory`（如果可能）。

---

### BUG-23：`App.tsx:929, 2312` `setCurrentAccount` 类型不匹配

**文件**：`src/renderer/App.tsx:327-332, 929, 2312`

**问题**：
```ts
// App.tsx:327
interface CurrentAccount {
  id: number;
  email: string;
  name: string;  // ← 必需
  avatar?: string;
}
// App.tsx:689
const [currentAccount, setCurrentAccount] = useState<CurrentAccount | 'all' | null>('all');

// App.tsx:929
setCurrentAccount((prev) => resolveActiveAccountAfterAccountsRefresh(accountList, prev));
// ↑ 期望 (prev) => CurrentAccount | 'all' | null
// ↑ 但 resolveActiveAccountAfterAccountsRefresh 返回 ActiveAccountSelection
// ↑ ActiveAccountSelection = AccountSelection | 'all' | null
// ↑ AccountSelection.name: string | undefined  ← 与 CurrentAccount.name: string 不兼容
```

**修复**：让 `CurrentAccount.name` 改为可选 `name?: string`，与 `AccountSelection` 对齐。

---

## 修复优先级建议

### 必须先修（P0）
1. **BUG-01 5 秒撤回 race**（用户体验严重）
2. **BUG-02 missed 状态类型统一**（影响生产数据）
3. **BUG-03 重复 declare global**（影响 typecheck 根因之一）

### 应该修（P1）
4. BUG-04 console.log 残留（4 行改动）
5. BUG-06 mailBackupTasks race（10 行改动）
6. BUG-07 SharedMailBodyStore.clear race（5 行改动）
7. BUG-12 mailBackup symlink 跟随（3 行改动）
8. BUG-14 删 dead code / 4 个 unused handler
9. BUG-15 setTimeout 统一抽 hook

### 优化（P2）
10. BUG-05 unbounded copyFile（防御性，加 size check）
11. BUG-08 fetchMailAttachment 无 size cap
12. BUG-11 mailBackup 重复读文件
13. BUG-13/20 renderer 错误日志可见
14. BUG-16 labelWithFallback 实际 fallback
15. BUG-17 bundle 拆分
16. BUG-18 inline cid 渲染
17. BUG-19 批量操作 UI（接上或删）
18. BUG-21/22/23 显式类型 / 类型对齐

## 验证手段

```bash
# 跑完整 typecheck
npx tsc -p tsconfig.json --noEmit        # 25+ 错误
npx tsc -b tsconfig.main.json --noEmit  # 干净

# 跑关键测试
node --import "data:text/javascript,import { register } from 'node:module';import { pathToFileURL } from 'node:url';register('./scripts/ts-extension-loader.mjs', pathToFileURL('./'));" \
  scripts/electron-sandbox-security.test.cjs   # passed
node --import "data:text/javascript,import { register } from 'node:module';import { pathToFileURL } from 'node:url';register('./scripts/ts-extension-loader.mjs', pathToFileURL('./'));" \
  scripts/scheduled-send-service.test.ts       # exit 0
node --import "data:text/javascript,import { register } from 'node:module';import { pathToFileURL } from 'node:url';register('./scripts/ts-extension-loader.mjs', pathToFileURL('./'));" \
  scripts/scheduled-send-ipc.test.ts          # exit 0
node --import "data:text/javascript,import { register } from 'node:module';import { pathToFileURL } from 'node:url';register('./scripts/ts-extension-loader.mjs', pathToFileURL('./'));" \
  scripts/compose-signatures.test.ts          # passed
node --import "data:text/javascript,import { register } from 'node:module';import { pathToFileURL } from 'node:url';register('./scripts/ts-extension-loader.mjs', pathToFileURL('./'));" \
  scripts/compose-templates.test.ts           # exit 0

# 跑 build
npm run build:core        # ✓ 通过
npm run build:vite        # ✓ 1.41s，但 bundle 1082KB
npm run build:electron    # 实际是 tsc -b，已在主进程 typecheck 中验证

# BUG-01 复现：5 秒倒计时 + 快速撤回 + 检查收件箱
# 实际：log.info '[mail] Email sent successfully' 与 UI cancelled 状态会同时出现
```

## 未在本次审查的代码区域

- `src/renderer/components/SettingsModal.tsx`（3000+ 行）—— 只看了 setTimeout pattern，没逐行审
- `src/renderer/components/MailDetail.tsx` —— 部分看过
- `src/renderer/components/AddAccountDialog.tsx` —— 关键 effect 看过
- `src/renderer/components/ComposeDialog.tsx` —— 看了 700+ 行，关键 sanitize 看了，但 1888 行全量未审
- `src/renderer/components/Sidebar.tsx`、`MailList.tsx`、`Icons.tsx`、`Modal.tsx`、`SenderAvatar.tsx` —— 未审
- `src/main/services/contactKnowledgeService.ts`（2615 行）—— 只看了部分，AI contact knowledge 逻辑可能还有 bug
- `src/main/services/oauth.ts`（256 行）—— 部分看过
- `src/shared/email-ai/*.ts`（约 20 文件）—— 大部分看了，scanPipeline、redactSensitiveEntities 详细看
- `src/main/services/ai/*.ts`（约 10 文件）—— providerManager 看了，其他（aiConfigStore、aiModelProfileStore、aiProviderAccountStore、aiProviderProfileStore、endpointNormalizer、modelListService、reasoningFilter、requestSanitizer、responseParser）只看了部分

未来如果继续深度审查，可以聚焦 SettingsModal 的写入流程、MailDetail 的 sanitize 路径、contactKnowledgeService 的 wiki 重建逻辑。

---

**审查者**：Mavis
**审查时间**：2026-06-08
**项目版本**：v0.1.2 (release candidate)
**审查方法**：静态分析 + 关键测试执行 + 完整 build 验证
