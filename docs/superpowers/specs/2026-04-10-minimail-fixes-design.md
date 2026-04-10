# minimail — 7 核心问题修复设计文档

**日期**: 2026-04-10  
**范围**: 本地缓存、会话流、AI 面板布局、状态隔离、统一头像、复制/截图、AI 业务完善

---

## 1. 邮件正文本地缓存 (Local Body Cache)

### 问题
`fetchMailDetail` 每次点击邮件都经由 IPC → IMAP 重新拉取，无缓存。

### 方案
在 `useMail.ts` 中新增 `bodyCache` (`useRef<Map<string, RendererMailDetail>>`），key 为 `"${accountId}:${uid}"`。

**命中路径**：
```
handleViewEmail → fetchMailDetail(accountId, uid, folder)
  → 检查 bodyCache.current.get(key)
  → 命中：直接 setCurrentMail(cached)，state 设为 'success'，零 IPC
  → 未命中：走现有 IPC → IMAP → setCurrentMail → 写入 bodyCache
```

**边界条件**：
- 删除邮件时同步从 bodyCache 移除对应 key
- cache 容量无上限（桌面应用内存充足，会话内数量有限）
- 不需要持久化（列表已有 SQLite 缓存）

**改动文件**: `src/renderer/hooks/useMail.ts`

---

## 2. 会话流聚合 — IMAP 头精确归组 (Thread View)

### 方案
基于 RFC 2822 `Message-ID`、`In-Reply-To`、`References` 三个 header 字段精确建立 thread chain。

### 2a. 数据库 Schema 变更

在 `mail_cache` 表新增三列（已有表做 ALTER TABLE 迁移）：

```sql
ALTER TABLE mail_cache ADD COLUMN message_id TEXT;
ALTER TABLE mail_cache ADD COLUMN in_reply_to TEXT;
ALTER TABLE mail_cache ADD COLUMN references_header TEXT;
```

**改动文件**: `src/main/database.ts`（在 `initMailCacheDb()` 中加迁移逻辑）

### 2b. IMAP 拉取层

`mailService.ts` 在 `syncMails()` 中对每封邮件提取 headers：

```ts
// 从 imapflow fetchOne 的 envelope + headers 拿到：
message_id       = envelope.messageId        // "<xxx@domain>"
in_reply_to      = headers.get('in-reply-to')
references_header = headers.get('references')
```

同步写入 `mail_cache`。`fetchMailList` 也需要返回这三个字段。

**改动文件**: `src/main/services/mailService.ts`, `src/main/services/mail.ts`

### 2c. RendererMailSummary 扩展

```ts
export interface RendererMailSummary {
  // ... existing fields ...
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}
```

**改动文件**: `src/renderer/hooks/useMail.ts`

### 2d. 客户端 Thread 聚合算法

在 App.tsx 或新增 `useThreads` hook 中，对 `mailList` 构建 thread map：

```
buildThreadMap(mailList: RendererMailSummary[]): Map<string, string[]>
  - key = "root message-id" (thread root)
  - value = 按时间排序的 message-id 列表
```

算法（Union-Find 或简单图遍历）：
1. 每封邮件初始化自己为 root
2. 若有 `inReplyTo`，将其合并到被回复邮件所在的 thread
3. `references` 字段包含整个 thread 链，取第一个 ID 作为 root

### 2e. MailDetail 会话流 UI

当 `email` 有 thread 兄弟邮件时（从 threadMap 查询），在详情页渲染：

```
MailDetail
  ├── Toolbar
  ├── Email Header (当前邮件)
  └── ScrollableBody
      ├── [历史邮件 1 — 折叠态：发件人 → 收件人 摘要行，可展开]
      ├── [历史邮件 2 — 折叠态]
      └── [当前邮件 — 展开态，完整正文]
```

**折叠态**（默认，非最新邮件）：
- 一行：`Avatar | 发件人 → 收件人 | 时间 | 展开按钮 ▼`
- 点击展开：加载该邮件正文（利用 bodyCache，有缓存则免 IPC）

**展开态**（最新邮件默认展开）：
- 完整邮件正文

**组件**: 新增 `ThreadMessage` 子组件，在 `MailDetail.tsx` 内部

**改动文件**: `src/renderer/components/MailDetail.tsx`, `src/renderer/App.tsx`

---

## 3. AI 面板布局修复 (AI Panel Layout)

### 问题
AI Panel `<div>` 夹在 flex 列的中部，展开时挤压 `flex-1 overflow-y-auto` 的 body 区域。

### 方案
将 AI Panel 移入滚动区域顶部。调整 MailDetail 布局：

```
<div flex-col h-screen>
  <Toolbar flex-shrink-0 />
  <EmailHeader flex-shrink-0 />
  <div flex-1 overflow-y-auto>   ← 唯一滚动容器
    {showAIPanel && <AIPanel />}  ← AI 面板在滚动区内顶部
    <EmailBody />                  ← 紧跟其后
  </div>
</div>
```

效果：AI 面板与邮件正文在同一滚动轴，展开/收起不影响容器高度分配。

**改动文件**: `src/renderer/components/MailDetail.tsx`

---

## 4. 组件状态与邮件 ID 强绑定 (State Isolation)

### 问题
`MailDetail` 内 `isStarred`、`showAIPanel`、`aiResult`、`aiLoading`、`aiFunction`、`copied`、`capturing` 均为组件 local state，切换邮件时不重置。

### 方案
在 `MailDetail` 内增加 reset effect：

```ts
useEffect(() => {
  setIsStarred(false);
  setShowAIPanel(false);
  setAiResult(null);
  setAiLoadingLocal(false);
  setAiFunction(null);
  setCopied(false);
  setCapturing(false);
}, [email?.id]);  // email.id = "${accountId}:${uid}"
```

`email?.id` 在 `RendererMailSummary` 中已存在，格式为唯一标识符，切换邮件时必然变化。

**改动文件**: `src/renderer/components/MailDetail.tsx`

---

## 5. 统一头像 Fallback — SenderAvatar 组件

### 问题
- `MailDetail` 写死蓝色圆 + 首字母
- `MailList` 的 `AvatarCell` 会先尝试 Google favicon（有时显示地球图）
- 两处样式/逻辑不一致

### 方案
新增 `SenderAvatar` 共享组件，放在 `src/renderer/components/SenderAvatar.tsx`：

```tsx
interface SenderAvatarProps {
  name: string;     // 显示名（用于取缩写和颜色）
  email?: string;   // 可选，用于 hash（后备使用 name）
  size?: number;    // px，默认 28
}
```

**逻辑**：
1. 取显示名首字母（最多 2 个，如 "John Smith" → "JS"，"张三" → "张三"前两字）
2. 基于名称做确定性 hash → 8 色调色板中选色（与现有 MailList 逻辑一致）
3. **完全不请求 favicon**（移除所有 Google favicon 逻辑）
4. 圆形背景 + 白色文字

**使用**：
- `MailList` 的 `AvatarCell` 替换为 `<SenderAvatar>`
- `MailDetail` 的邮件头像替换为 `<SenderAvatar>`
- `ThreadMessage` 也使用 `<SenderAvatar>`

**改动文件**: 新增 `src/renderer/components/SenderAvatar.tsx`，修改 `MailList.tsx`、`MailDetail.tsx`

---

## 6. 复制与截图分享功能完善

### 6a. 复制完整正文

当前：`navigator.clipboard.writeText(email.snippet || email.subject)`

修改为：
```ts
const handleCopy = () => {
  const text = isDetail(email)
    ? (email.bodyText || email.snippet || email.subject)
    : (email.snippet || email.subject);
  navigator.clipboard.writeText(text);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

### 6b. 截图写入剪贴板

现有 `handleCaptureScreenshot` 已实现 `toPng` + `ClipboardItem` 写入逻辑，逻辑正确。
需确认：截图区域 `bodyRef` 指向正确的 DOM 节点（在布局调整后重新验证挂载位置）。

反馈：截图完成后显示 Toast（App.tsx 的 `handleShare` 已实现 Toast），确保 `onShare` 回调被正确触发。

**改动文件**: `src/renderer/components/MailDetail.tsx`

---

## 7. 补全 AI 业务逻辑

### 7a. ComposeDialog — 润色与翻译接真实 API

**当前**：两个函数都是 `setTimeout` mock，无实际 AI 调用。

**修改**：

```ts
// 润色
const handlePolish = async () => {
  setAiLoading(true);
  const res = await window.electronAPI.invoke('ai:polish', body, 'formal') 
    as { success: boolean; content?: string; error?: string };
  if (res.success && res.content) setBody(res.content);
  else setError(res.error || '润色失败');
  setAiLoading(false);
};

// 翻译
const handleTranslate = async (targetLang: string) => {
  setAiLoading(true);
  const langMap = { '中文': 'Chinese', 'English': 'English', ... };
  const res = await window.electronAPI.invoke('ai:translate', body, langMap[targetLang] || targetLang)
    as { success: boolean; content?: string; error?: string };
  if (res.success && res.content) setBody(res.content);
  else setError(res.error || '翻译失败');
  setAiLoading(false);
};
```

**改动文件**: `src/renderer/components/ComposeDialog.tsx`

### 7b. App.tsx — 修复批量分类 runBatchAnalysis

**当前问题**：
1. 使用 `ai:summarize` 而非 `ai:classifyBatch`
2. 分类结果从未写回 `mailList[].category`

**修改**：

```ts
const runBatchAnalysis = useCallback(async () => {
  // ... 前置检查不变 ...
  
  // 构建正确的 payload
  const emailPayload = toProcess.map(m => ({
    id: m.id,
    from: m.from,
    fromName: m.fromName,
    subject: m.subject,
    snippet: m.snippet,
  }));

  const response = await window.electronAPI.invoke('ai:classifyBatch', {
    emails: emailPayload,
    scanMode: aiScanMode,
  }) as { success: boolean; results?: { id: string; category: string }[]; error?: string };

  if (response.success && response.results) {
    // 将分类结果写回 mailList
    const categoryMap = new Map(response.results.map(r => [r.id, r.category]));
    setMailList(prev => prev.map(m =>
      categoryMap.has(m.id) ? { ...m, category: categoryMap.get(m.id) } : m
    ));
    setToasts(prev => [...prev, { 
      id: Date.now().toString(), type: 'success', 
      message: `AI 分析完成：${response.results!.length} 封邮件已分类` 
    }]);
  }
}, [...]);
```

**改动文件**: `src/renderer/App.tsx`

---

## 改动文件总览

| 文件 | 改动性质 | 涉及问题 |
|------|----------|----------|
| `src/main/database.ts` | ALTER TABLE 迁移 | #2 |
| `src/main/services/mail.ts` | 提取 message_id/in_reply_to/references | #2 |
| `src/main/services/mailService.ts` | 写入新 header 字段到缓存 | #2 |
| `src/main/ipc/mail.ts` | 透传新字段 | #2 |
| `src/renderer/hooks/useMail.ts` | 类型扩展 + bodyCache | #1, #2 |
| `src/renderer/components/SenderAvatar.tsx` | 新建 | #5 |
| `src/renderer/components/MailDetail.tsx` | 布局、状态隔离、头像、复制、会话流 | #2, #3, #4, #5, #6 |
| `src/renderer/components/MailList.tsx` | 替换 AvatarCell → SenderAvatar | #5 |
| `src/renderer/components/ComposeDialog.tsx` | AI 真实调用 | #7a |
| `src/renderer/App.tsx` | runBatchAnalysis 修复、threadMap 构建 | #7b, #2 |

---

## 不在本次范围内

- 持久化正文缓存到 SQLite（session 内存缓存已足够）
- 跨账号 thread 合并（同账号内 thread 已足够）
- SMTP 发送流程（ComposeDialog 的 onSend 已有实现）
