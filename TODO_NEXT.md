# minimail — 现状审计 & 明日任务交接

## 全局状态定义位置（最重要）

| 状态 | 定义文件 | 行号 |
|------|----------|------|
| `accounts: Account[]` | `src/renderer/App.tsx` | L29 — `useState([...])` |
| `emails: MockEmail[]` | `src/renderer/App.tsx` | L54 — `useState([...])` |
| `selectedIds: string[]` | `src/renderer/App.tsx` | L65 |
| `toasts: ToastData[]` | `src/renderer/App.tsx` | L76 |
| `isRefreshing: boolean` | `src/renderer/App.tsx` | L69 |

**所有业务状态集中在 `src/renderer/App.tsx` 一个文件内**，没有 Redux/Zustand/Context。

---

## 已完成（逻辑层面）

### 1. 批量选择 `selectedIds`
- **文件**: `src/renderer/App.tsx` L65, L97–128
- **逻辑**: `handleSelectEmail(email, event)` 支持 Ctrl/Shift 多选；`handleSelectAll` 全选/取消
- **Props**: 传入 `MailList` → `selectedIds`, `onSelectAll`, `isAllSelected`

### 2. 自动同步 `setInterval`
- **文件**: `src/renderer/App.tsx` L119–134
- **逻辑**: `useEffect` + `setInterval(60000)` 每 60 秒追加 1 封新邮件到 `emails`
- **新增邮件池**: `SYNC_NEW_EMAILS` 常量（L6–38），含 3 种模板

### 3. 手动刷新 `fetchMails`
- **文件**: `src/renderer/App.tsx` L94–106
- **逻辑**: 1 秒 Promise 延迟 → 追加而非覆盖 → 更新 `emails`

### 4. Toast 通知组件
- **文件**: `src/renderer/components/Toast.tsx`（新建）
- **逻辑**: `addNewEmailToState` 时同步 push toast；5 秒自动消失；点击跳转邮件

### 5. 排序始终倒序
- **文件**: 涉及所有用到 `sort` 的地方，统一 `(a, b) => b.date - a.date`
- 新邮件 `date: new Date()` 落在 `today` 组，分组标题实时更新

### 6. AddAccountDialog 已有严格校验
- **文件**: `src/renderer/components/AddAccountDialog.tsx`
- **验证项**: 邮箱正则、端口范围 1–65535、IMAP/SMTP 非空

### 7. 窗口控制按钮图标替换
- **文件**: `src/renderer/components/Sidebar.tsx` L83–101
- Heart / Bot / X，悬停放大动画

---

## 未解决 / 明日首要任务

### 🔴 Task A: 刷新按钮在 EXE 中不可见

**症状**: `RotateCw` 按钮在源代码正常但打包后 EXE 中看不见。

**排查方向**:
1. `Sidebar.tsx` 中 `onRefresh` prop 传入路径确认：`App.tsx` → `<Sidebar onRefresh={handleRefresh} />`
2. 检查 `isRefreshing` 是否有条件渲染遮挡（目前无，代码确认干净）
3. 启动 `npm run dev` 确认开发模式下按钮可见
4. 如果 dev 正常 → 问题在打包流程，重新执行 `npm run dist:dir`

**验证命令**:
```bash
npm run dev
# 观察 Logo 右侧是否出现旋转图标
```

### 🟡 Task B: AddAccountModal 添加后 Sidebar 实时更新

**现状**: `handleSaveAttempt` 在 `App.tsx` L233 中调用 `setAccounts(prev => [...prev, newAccount])`。
**潜在问题**: `currentAccount` 在 `accounts[0]` 初始化，如果第一个账号被删除会异常。

**验证**:
1. 打开设置 → 添加账号 → 填写信息提交
2. 观察 Sidebar 账号下拉菜单是否实时出现新账号
3. 确认 `accounts` state 确实 push 成功

### 🟡 Task C: Toast 通知弹出验证

**验证**: 需要等 60 秒自动同步触发，或手动点刷新按钮。

---

## 文件关键索引

```
src/renderer/App.tsx          ← 所有全局状态 (accounts, emails, selectedIds, toasts, isRefreshing)
src/renderer/components/Sidebar.tsx        ← Logo + 窗口控制按钮 + 刷新按钮
src/renderer/components/MailList.tsx       ← 邮件列表 + Checkbox + 右键菜单
src/renderer/components/MailDetail.tsx     ← 邮件详情 + AI 面板
src/renderer/components/ComposeDialog.tsx   ← 写信弹窗
src/renderer/components/AddAccountDialog.tsx ← 添加账号弹窗（含校验）
src/renderer/components/Toast.tsx           ← Toast 通知组件（新建）
src/renderer/data/mockData.ts  ← 静态种子数据
src/renderer/i18n.ts          ← 8 语言翻译
src/renderer/styles/global.css ← CSS（含 animate-slide-in）
src/main/index.ts              ← Electron 主进程（窗口创建、IPC）
src/preload/index.ts           ← 上下文桥接
```

---

## 明日启动命令

```bash
# 开发模式（验证 UI）
npm run dev

# 重新打包 EXE
npm run dist:dir

# EXE 路径
release/win-unpacked/minimail.exe
```
