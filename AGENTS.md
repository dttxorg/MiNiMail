# MiNiMail Agent 工作指南

本文档记录当前仓库的项目知识，供后续 Codex/agent 进入本项目时快速建立上下文。请优先遵守用户的最新指令；若本文档与用户指令冲突，以用户指令为准。

## 项目概览

- 项目名称：MiNiMail。
- 当前版本：`0.1.2`。
- 产品定位：AI 原生桌面邮件客户端，强调本地优先缓存、隐私感知 AI、邮件阅读/写信效率。
- 当前状态：release candidate，适合测试、演示和早期反馈，暂不建议用于关键生产邮件流程。
- 当前平台：已支持 macOS 桌面端，并继续维护 Windows 桌面端体验。
- 核心能力：
  - IMAP 收信、SMTP 发信、OAuth/密码账号。
  - 本地 SQLite 邮件缓存、正文缓存、附件元数据缓存。
  - AI 摘要、翻译、回复建议、关键信息提取、邮件分类和 GitHub 通知优先级。
  - 富文本写信、草稿、附件、已发送邮件恢复、5 秒撤回发送。
  - 每账号签名、快捷短语、邮件模板。
  - 本地定时发送、待发送管理、到点自动发送、失败/错过任务处理。
  - 多语言 UI 和多语言 README。

## 技术栈

- Electron `41.x`。
- React `19.x` + TypeScript `6.x`。
- Vite `8.x` 构建 renderer。
- Tailwind CSS `3.x` + 局部内联样式/design token。
- better-sqlite3 本地数据库。
- imapflow 收信，nodemailer 发信。
- Quill `2.x` 富文本编辑器。
- DOMPurify / 自定义 sanitizer 处理 HTML 安全。
- i18next / react-i18next 做界面国际化。
- electron-log 记录主进程日志。

## 常用命令

- 开发：`npm run dev`
- 生产构建：`npm run build`
- 发布回归：`npm run test:release`
- macOS 目录包：`npm run package:mac`
- macOS 安装包：`npm run dist:mac`
- 格式空白检查：`git diff --check`
- 单个 TypeScript 脚本测试通常使用：

```bash
TS_LOADER='data:text/javascript,import { register } from "node:module";import { pathToFileURL } from "node:url";register("./scripts/ts-extension-loader.mjs", pathToFileURL("./"));'
node --import "$TS_LOADER" scripts/<test-file>.test.ts
```

## 目录地图

- `src/main/`：Electron 主进程。
  - `index.ts`：应用启动、窗口、菜单、托盘、IPC 注册、定时发送启动恢复。
  - `database.ts`：主数据库，账号、凭据、普通 settings、secure settings。
  - `databasePath.ts`：数据库路径解析。
  - `ipc/`：IPC handler 注册，renderer 通过 preload allowlist 调用。
  - `services/`：IMAP、SMTP、邮件缓存、OAuth、AI、备份、附件缓存、定时发送等主进程服务。
- `src/preload/`：Electron preload。
  - `index.ts` 暴露 `window.electronAPI`。
  - 所有 renderer 可调用 IPC 必须在 allowlist 中显式列出。
- `src/renderer/`：React renderer。
  - `App.tsx`：主状态、文件夹/邮件选择、设置、写信、定时发送列表、toast、同步流程。
  - `components/`：Sidebar、MailList、MailDetail、ComposeDialog、SettingsModal、ScheduledSendDetail 等。
  - `hooks/`：账号和邮件数据 hook。
  - `utils/`：邮件正文、缓存刷新、分类、草稿、设置、会话聚合等纯/半纯逻辑。
  - `i18n.ts`：中英文等 UI 文案资源。
- `src/shared/`：主进程和 renderer 共用的纯逻辑。
  - `compose/`：签名、快捷短语、邮件模板、定时发送时间/倒计时 helper。
  - `email-ai/`：AI prompt、扫描、分类、脱敏、GitHub 通知分析、HTML 翻译保留标记等。
  - `mailFolders.ts`、`mailCacheQuery.ts`、`mailSyncSettings.ts` 等邮件共享逻辑。
- `scripts/`：大量回归测试和发布检查脚本，`scripts/test-release.cjs` 是发布前聚合入口。
- `docs/`：多语言 README、截图资产、历史设计/spec/plan 文档。
- `dist/`、`release8/`、`node_modules/`、`.tmp-tests/`：构建产物、安装包、依赖或测试临时目录，通常不要手动编辑或提交。

## 数据库与本地缓存

- `database.ts` 管理主应用数据库：
  - `accounts`
  - `credentials`
  - `settings`
  - `secure_settings`
- 凭据通过 Electron safeStorage 加密后存入 `credentials`；不要在 renderer 或日志中暴露密码/OAuth token。
- 邮件缓存由 `src/main/services/mailService.ts` 管理，默认在用户数据目录的 `mail_cache.db`。
- `mail_cache` 重点字段包括：
  - 邮件基本信息：`id`、`uid`、`from`、`to`、`subject`、`date`、`folder`、`account_id`。
  - 正文缓存：`body_html`、`body_text`。
  - 草稿/发送：`draft_payload`、`local_draft_id`、`local_send_id`、`delivery_state`、`delivery_error`。
  - AI 分类：`category`、`is_scanned`、`scan_result`。
- 定时发送由 `src/main/services/scheduledSendService.ts` 管理，表为 `scheduled_send_jobs`：
  - `id`、`local_send_id`、`account_id`、`from_email`
  - `to_json`、`cc_json`、`bcc_json`
  - `subject`、`body_text`、`body_html`、`editable_body`
  - `outgoing_attachments_json`、`draft_payload_json`
  - `sent_folder_path`、`scheduled_at`
  - `status`: `scheduled` / `sending` / `sent` / `cancelled` / `failed` / `missed`
  - `failure_reason`、`last_attempt_at`、`sent_message_id`
- 表结构初始化使用 `CREATE TABLE IF NOT EXISTS` 和幂等 `ALTER TABLE`，当前未引入独立 migration 框架。

## IPC 与安全边界

- renderer 不直接访问文件系统、数据库、IMAP/SMTP 或 Node API。
- 所有 renderer -> main 通信走 `window.electronAPI.invoke(channel, ...)`。
- 新增 IPC channel 时必须同步：
  - main handler，例如 `src/main/ipc/*.ts`。
  - preload allowlist：`src/preload/index.ts`。
  - 类型声明：`src/preload/electronAPI.d.ts`（若接口变化）。
  - 对应 IPC allowlist/source guard 测试。
- `preload/index.ts` 会对未列入 allowlist 的 channel 抛出 `Invalid IPC channel`。
- 外部链接只允许 `http:`、`https:`、`mailto:`；文件打开路径走受信路径逻辑。

## 写信与发送功能要点

- `ComposeDialog.tsx` 使用 Quill 富文本编辑器。
- Quill 支持字体、字号、颜色、加粗、斜体、下划线、列表、对齐、链接、图片。
- 发送前需要将编辑器 HTML 清理为安全 HTML，并生成纯文本备用正文。
- 立即发送仍保留 5 秒撤回：
  - `App.tsx` 中 `SEND_UNDO_DELAY_MS = 5000`。
  - toast 文案会实时倒计时。
- SMTP 发信在 `src/main/services/smtp.ts`：
  - OAuth 账号发送前会尝试刷新即将过期或缺失的 token。
  - 支持 HTML 正文和附件。
- 附件：
  - 选中新附件走 outgoing attachment token/cache。
  - 转发原邮件附件可能引用原邮件缓存。
  - 不要在日志中打印附件名、附件内容或本地路径。
- Sent/联系人聚合：
  - 成功发送后应写入本地缓存，使 Sent 视图和联系人聚合正文能看到已发送内容。
  - 涉及发送缓存时注意 `local_send_id`、`delivery_state`、`body_html/body_text`。

## 签名、快捷短语、邮件模板

- 每账号签名：
  - 共享 helper：`src/shared/compose/signatures.ts`
  - settings key：`compose_signatures_v1`
  - 内部 marker：`[[MINIMAIL_SIGNATURE_START]]` / `[[MINIMAIL_SIGNATURE_END]]`
  - 发送和保存 scheduled payload 前必须清理 marker，不能暴露到用户可见正文。
- 快捷短语：
  - helper：`src/shared/compose/quickPhrases.ts`
  - settings key：`compose_quick_phrases_v1`
- 邮件模板：
  - helper：`src/shared/compose/templates.ts`
  - settings key：`compose_templates_v1`
  - 模板结构支持 `id`、`name`、`subject`、`bodyText`、可选 `bodyHtml`、`tags`、`updatedAt`。
  - Settings -> Writing 的模板正文使用 Quill，保存时保留纯文本和安全 HTML。
  - Compose 套用模板时，模板正文应插入到签名前；已有 subject 不应被静默覆盖；回复/转发时模板正文只进用户正文区域，不进入引用原文。

## 定时发送

- 时间 helper：`src/shared/compose/scheduleSend.ts`。
  - `10m`：当前时间 + 10 分钟。
  - `this_evening`：本地 18:00，若已过则明天 18:00。
  - `tomorrow_morning`：明天 09:00。
  - 自定义时间必须是未来时间。
- 主进程 service：`src/main/services/scheduledSendService.ts`。
- IPC 在 `src/main/ipc/mail.ts`：
  - `mail:scheduleSend`
  - `mail:listScheduledSends`
  - `mail:cancelScheduledSend`
  - `mail:getScheduledSend`
  - `mail:markMissedScheduledSends`
  - `mail:sendScheduledNow`
  - `mail:retryScheduledSend`
- App 启动时会恢复 scheduled jobs：
  - 已过期任务标记为 `missed`，不应静默乱发。
  - due scheduled 任务由 scheduler 处理。
- 防重复发送依赖数据库状态锁：`tryMarkJobSending` 只允许合法状态进入 `sending`。
- 成功后标记 `sent` 并写入 Sent 本地缓存；失败后标记 `failed`，保留安全错误摘要。
- 本地定时发送的重要产品边界：
  - MiNiMail 需要保持运行。
  - App 关闭或电脑睡眠不能保证准点发送。
  - missed/failed 任务应让用户显式重试或取消。

## AI 与隐私

- AI 共享逻辑在 `src/shared/email-ai/`。
- AI provider/main service 在 `src/main/services/ai/`。
- 支持 OpenAI 兼容接口和本地大模型配置。
- GitHub 通知有专项分析和优先级分类。
- 处理 AI 输入时优先使用脱敏工具：
  - `redactSensitiveEntities`
  - `redactGithubMailEntities`
  - `restoreSensitiveEntities`
- 不要把邮件正文、联系人、附件、API key、OAuth token、Authorization header 发送到日志或测试输出。
- HTML 邮件渲染前要经过 sanitizer；远程图片和 tracking pixel 默认拦截。

## UI 与国际化约定

- 主要 UI 在 `src/renderer/components/`。
- 关键页面：
  - `Sidebar.tsx`
  - `MailList.tsx`
  - `MailDetail.tsx`
  - `ComposeDialog.tsx`
  - `SettingsModal.tsx`
  - `ScheduledSendDetail.tsx`
- 新增用户可见文案时优先更新 `src/renderer/i18n.ts`。
- 已有语言类型在 `src/shared/mailFolders.ts` 中：`zh`、`en`、`ja`、`ko`、`es`、`fr`、`de`、`ru`。
- README 多语言文档位于 `docs/README.*.md`；根 `README.md` 是中文主文档。
- 前端设计应保持桌面邮件客户端风格：信息密度适中、操作稳定、避免营销页式布局。

## 测试策略

- 发布级回归入口：`npm run test:release`。
- 该命令会先跑 production build，再跑大量脚本测试。
- 重要测试文件示例：
  - 写信：`scripts/compose-rich-text.test.ts`、`scripts/compose-signatures.test.ts`、`scripts/compose-quick-phrases.test.ts`、`scripts/compose-templates.test.ts`
  - 定时发送：`scripts/scheduled-send-service.test.ts`、`scripts/scheduled-send-ipc.test.ts`、`scripts/scheduled-send-compose.test.ts`、`scripts/scheduled-send-ui.test.ts`、`scripts/scheduled-send-auto.test.ts`
  - 邮件缓存/正文/附件：`scripts/mail-body-prefetch.test.cjs`、`scripts/mail-cache-sql-window.test.cjs`、`scripts/mail-attachments-regression.test.cjs`
  - AI/脱敏/分类：`scripts/ai-prompts.test.ts`、`scripts/github-priority-classifier.test.ts`、`scripts/email-redaction.test.ts`
  - 安全：`scripts/electron-sandbox-security.test.cjs`
- 改动行为时应优先添加/更新对应 `scripts/*.test.*`，再接入 `scripts/test-release.cjs`。
- 提交前至少运行：
  - 与改动相关的单项测试。
  - `npm run test:release`（发布关键变更）。
  - `git diff --check`。

## 日志与敏感信息规则

严禁在日志、测试输出、提交信息或文档样例中写入真实敏感数据：

- 邮件正文、邮件主题、收件人/发件人/联系人真实信息。
- 签名正文、模板正文、快捷短语正文。
- 附件名、附件路径、附件内容。
- API key、OAuth token、refresh token、Authorization header、密码。

允许输出的安全摘要：

- job id、accountId、状态、时间戳。
- 错误类型和经过 sanitize/truncate 的错误摘要。
- 计数、布尔状态、文件夹类型、测试 fixture 的假数据。

## Git 与发布注意事项

- 默认分支：`main`。
- 当前仓库近期有 `v0.1.2` release，macOS 安装包输出目录为 `release8/`。
- 不要提交：
  - `node_modules/`
  - `dist/`
  - `release8/`
  - `.tmp-tests/`
  - 本地日志、数据库、截图/视频/安装包、`.env`、本地配置。
- package 脚本中 macOS 打包使用 `npm run dist:mac`，不是随意拼 `npm run dist --mac`。
- 提交前用 `git status --short` 和 `git diff --cached --name-only` 确认 staging 边界。
- 如果工作区已有用户改动，不要 revert；先读懂并只在必要文件上叠加修改。

## 常见开发落点

- 新增/改 IPC：`src/main/ipc/*` + `src/preload/index.ts` + `src/preload/electronAPI.d.ts` + IPC/source guard 测试。
- 新增 settings：`src/main/database.ts` settings 表存取 + `App.tsx` 状态加载/保存 + `SettingsModal.tsx` UI + shared parser/serializer。
- 改 Compose：先读 `src/renderer/components/ComposeDialog.tsx`、`src/renderer/utils/composeDraft.ts`、`src/shared/compose/*`。
- 改定时发送：先读 `src/main/services/scheduledSendService.ts`、`src/main/ipc/mail.ts`、`src/shared/compose/scheduleSend.ts`、`src/renderer/components/ScheduledSendDetail.tsx`。
- 改邮件列表/详情：先读 `src/renderer/App.tsx`、`src/renderer/hooks/useMail.ts`、`src/renderer/components/MailList.tsx`、`src/renderer/components/MailDetail.tsx`、`src/main/services/mailService.ts`。
- 改 AI/分类：先读 `src/shared/email-ai/` 和 `src/main/services/ai/`，注意脱敏和隐私边界。

## 已知边界和风险

- 本地定时发送依赖 App 运行；系统睡眠或 App 关闭会影响准点发送。
- SQLite schema 目前用幂等 SQL 管理，没有独立 migration 框架；改 schema 要保持向后兼容。
- Quill/HTML 邮件必须持续做 sanitize，避免脚本、事件属性、危险 URL。
- 发送成功但 IMAP/Sent 同步失败时，本地 Sent 缓存仍要保持用户可见性。
- 多账号场景下要始终传递并校验 `accountId`。
- 回复/转发的用户正文、签名和引用原文位置很敏感；不要把模板/快捷短语/签名插进 quoted original。
- preload allowlist 漏更新会导致 renderer 出现 `Invalid IPC channel`。
- 测试 fixture 可以使用假数据，但不要引入真实邮箱、真实正文或真实 token。
