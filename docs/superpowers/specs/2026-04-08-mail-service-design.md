# 邮件服务重构设计文档

**日期**: 2026-04-08
**状态**: 已批准，等待实施

---

## 1. 背景与目标

APARK 邮件客户端目前运行在"模拟器模式"：所有邮件数据都是内存中的假数据，重启即丢，刷新只是随机追加模拟邮件。本阶段目标：

1. 实现账号配置的持久化存储（使用 SQLite + safeStorage 加密）
2. 建立独立的 Mail Service 层，解耦模拟逻辑
3. 接入操作系统原生通知（替代 UI Toast）
4. 代码瘦身，App.tsx 抽离纯逻辑到 utils

---

## 2. 安全设计：凭证加密存储

### 2.1 加密策略

使用 Electron `safeStorage` API，利用 OS 原生密钥管理（Windows: DPAPI）：
- `safeStorage.isEncryptionAvailable()` 检查是否可用
- 不可用时（极少情况，如无管理员权限），**拒绝存储密码**，返回明确错误

### 2.2 数据库改动

**credentials 表字段变更**（类型从 TEXT 改为 BLOB）：

| 字段 | 原类型 | 新类型 |
|------|--------|--------|
| password | TEXT | BLOB |
| oauth_token | TEXT | BLOB |
| oauth_refresh_token | TEXT | BLOB |

新增模块 `src/main/services/crypto.ts`：

```typescript
import { safeStorage } from 'electron';

export function encryptCredential(plain: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  return safeStorage.encryptString(plain);
}

export function decryptCredential(encrypted: Buffer): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  return safeStorage.decryptString(encrypted);
}
```

### 2.3 数据库读写改动

**写操作**（`src/main/database.ts`）：
- `createAccount()` — 密码写入前调用 `encryptCredential()`
- `updateAccount()` — 密码更新前调用 `encryptCredential()`

**读操作**（`src/main/database.ts`）：
- `getAccountCredentials()` — 读取后调用 `decryptCredential()`，返回明文供 IMAP/SMTP 连接使用

### 2.4 UI 层策略

- IPC `accounts:get` 永不返回解密后的密码
- 设置页面账号列表：密码字段显示 `••••••••`
- 无"显示密码"、"复制密码"按钮
- 解密仅发生在 main process 内部（IMAP/SMTP 连接时）

---

## 3. Mail Service 层设计

### 3.1 新建文件

`src/main/services/mailService.ts`

### 3.2 核心接口

```typescript
export interface MailSummary {
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

export interface MailService {
  syncMails(accountId: number, folder?: string): Promise<MailSummary[]>;
  fetchFullMessage(accountId: number, messageUid: number, folder: string): Promise<MailDetail>;
  getFolders(accountId: number): Promise<FolderInfo[]>;
}
```

### 3.3 混合存储策略

- **SQLite 存储邮件摘要**：发件人、收件人、主题、日期、已读/星标状态、snippet
- **正文按需拉取**：点击邮件时从 IMAP 服务器获取正文，15 秒超时
- **增量同步**：`syncMails()` 比较本地 UID 与 IMAP UID，只返回新增邮件

### 3.4 数据流

```
刷新按钮 → mailService.syncMails(accountId)
         → 检查 SQLite 本地缓存
         → 连接 IMAP 获取最新 UID 列表
         → 对比差量，只取新增邮件
         → 存入 SQLite
         → 返回新增邮件摘要
         → 若有新邮件 → 触发 Native Notification
```

### 3.5 邮件正文加载流程（UI 侧）

```
点击邮件 → 检查本地缓存是否有正文
         ├── 有 → 直接显示
         └── 无 → 显示骨架屏 + "正在从服务器获取内容..."
                → 调用 mailService.fetchFullMessage()
                ├── 15 秒内成功 → 淡入正文
                └── 超时 → 骨架屏切换为错误状态
                         → "获取内容超时，请检查网络后重试"
                         → 显示"点击重试"按钮
```

---

## 4. 原生通知设计

### 4.1 触发时机

- `syncMails()` 发现新邮件时（自动轮询或手动刷新）
- 每批次只通知最新的一封（避免轰炸）

### 4.2 通知内容

使用 Electron `Notification` API：

```typescript
new Notification({
  title: mail.fromName || mail.from,      // 发件人
  body: mail.snippet || mail.subject,     // 正文摘要
  silent: false,
})
```

### 4.3 点击行为

点击通知 →聚焦应用窗口 + 选中新邮件

---

## 5. App.tsx 重构

### 5.1 移除内容

- 删除 `SYNC_NEW_EMAILS` 常量池
- 删除 `setInterval` 自动生成随机邮件的 useEffect
- 删除 `fetchMails()` 回调中的随机邮件逻辑
- 将 accounts 从 `useState` 初始化硬编码改为从 IPC 加载

### 5.2 保留内容（迁移到 mailService）

- `handleRefresh()` → 调用 `mailService.syncMails()`
- `addNewEmailToState()` → 改为通过 IPC 从 main process 接收新邮件

### 5.3 抽取到 utils 的纯函数

`src/utils/emailUtils.ts`：

```typescript
export function sortEmailsByDate(emails: MockEmail[]): MockEmail[]
export function groupEmailsByDate(emails: MockEmail[]): Map<string, MockEmail[]>
export function filterEmailsByFolder(emails: MockEmail[], folder: string): MockEmail[]
export function filterEmailsByAccount(emails: MockEmail[], accountId: number): MockEmail[]
export function searchEmails(emails: MockEmail[], query: string): MockEmail[]
```

---

## 6. 实施顺序

### Phase 1: 安全层
1. 创建 `src/main/services/crypto.ts`
2. 修改 `src/main/database.ts` — credentials 读写加解密
3. 验证：重启后账号配置仍在，加密有效

### Phase 2: MailService
4. 创建 `src/main/services/mailService.ts`
5. 实现 `syncMails()` 增量同步逻辑
6. 实现 `fetchFullMessage()` 带超时逻辑
7. 修改 `src/main/ipc/mail.ts` 调用 mailService

### Phase 3: App.tsx 重构
8. App.tsx 接入 IPC 加载账号
9. 替换刷新逻辑为 mailService 调用
10. 抽取纯函数到 `src/utils/emailUtils.ts`

### Phase 4: 原生通知 + Loading 状态
11. 在 mailService sync 时触发 Notification
12. MailDetail 组件加骨架屏 + 超时错误状态
13. Gmail OAuth 引导（明天）

---

## 7. Gmail OAuth 优先引导（明天实现）

当用户选择 Gmail provider 时：
- 跳过密码输入框
- 弹出 Google OAuth 授权页面
- 回调后存储 oauth_token / oauth_refresh_token
- 标注待明天详细设计
