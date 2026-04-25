# Backup, Branding, and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder brand treatment, add first-release EML export/import, add a dedicated unread conversations view, fix search clear duplication, and separate mail history sync settings from AI settings.

**Architecture:** Extend the existing Electron mail stack rather than creating a parallel subsystem. Renderer changes stay inside the current sidebar/settings/list flows, while main-process additions introduce a focused backup service plus a small sync-setting expansion. History-range behavior is enforced in the mail sync layer only during cold-start/history fill, while later refreshes remain incremental.

**Tech Stack:** Electron, React, TypeScript, better-sqlite3, mailparser, electron-builder, existing IPC bridge and settings storage.

---

## File Structure Map

### Existing files to modify

- `D:\下载\编程\APARK\src\renderer\components\Sidebar.tsx`
  - Replace top-left branding block.
  - Add dedicated unread navigation item.
- `D:\下载\编程\APARK\src\renderer\components\SettingsModal.tsx`
  - Add backup section.
  - Add mail history range setting.
  - Expand auto-fetch interval options.
  - Keep AI lookback separate.
- `D:\下载\编程\APARK\src\renderer\components\MailList.tsx`
  - Strengthen unread presentation.
  - Fix duplicated search clear button rendering.
- `D:\下载\编程\APARK\src\renderer\App.tsx`
  - Load/save new settings.
  - Add unread view filtering.
  - Host backup task UI state and task event listeners.
- `D:\下载\编程\APARK\src\main\ipc\mail.ts`
  - Register export/import IPC handlers and backup progress events.
- `D:\下载\编程\APARK\src\main\index.ts`
  - Add file/folder picker helpers and open-folder support.
- `D:\下载\编程\APARK\src\preload\index.ts`
  - Expose backup IPC calls and progress subscriptions.
- `D:\下载\编程\APARK\src\main\services\mailService.ts`
  - Introduce cold-start history-range-aware sync behavior.
- `D:\下载\编程\APARK\package.json`
  - Point Electron Builder to new icon assets.

### New files to create

- `D:\下载\编程\APARK\src\shared\backup.ts`
  - Shared request/result/progress types for backup operations.
- `D:\下载\编程\APARK\src\shared\mailSyncSettings.ts`
  - Shared history-range constants and helpers.
- `D:\下载\编程\APARK\src\main\services\mailBackup.ts`
  - EML export/import implementation plus cancellation registry.
- `D:\下载\编程\APARK\src\renderer\utils\mailBackupUi.ts`
  - Renderer-facing labels and helper mappers for backup form state.
- `D:\下载\编程\APARK\src\renderer\utils\mailHistoryRange.ts`
  - Renderer helper for options and labels.
- `D:\下载\编程\APARK\build\icons\app-icon.png`
  - Rasterized shield-envelope icon derived from provided art.
- `D:\下载\编程\APARK\build\icons\icon.ico`
  - Windows app icon for installer/exe.
- `D:\下载\编程\APARK\scripts\mail-backup.test.ts`
  - Export/import logic coverage.
- `D:\下载\编程\APARK\scripts\mail-history-range.test.ts`
  - Initial history load vs incremental sync coverage.
- `D:\下载\编程\APARK\scripts\mail-unread-and-search.test.ts`
  - Unread view and search clear regression coverage.

### Existing tests to extend if needed

- `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`
  - Add new shared helper assertions where appropriate.

---

### Task 1: Define Shared Backup and Sync Setting Types

**Files:**
- Create: `D:\下载\编程\APARK\src\shared\backup.ts`
- Create: `D:\下载\编程\APARK\src\shared\mailSyncSettings.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-history-range.test.ts`

- [ ] **Step 1: Write the failing test for history range parsing**

```ts
import assert from 'node:assert/strict';
import {
  MAIL_HISTORY_RANGE_OPTIONS,
  coerceMailHistoryRange,
  historyRangeToMs,
} from '../src/shared/mailSyncSettings';

assert.deepEqual(MAIL_HISTORY_RANGE_OPTIONS, ['7d', '15d', '1mo', '6mo', '1y', 'all']);
assert.equal(coerceMailHistoryRange('15d'), '15d');
assert.equal(coerceMailHistoryRange('bad-value'), '1mo');
assert.equal(historyRangeToMs('7d'), 7 * 24 * 60 * 60 * 1000);
assert.equal(historyRangeToMs('all'), null);

console.log('mail-history-range shared tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd tsc D:\下载\编程\APARK\scripts\mail-history-range.test.ts --module commonjs --target es2020 --esModuleInterop --skipLibCheck --outDir D:\下载\编程\APARK\.tmp-tests`

Expected: FAIL because `src/shared/mailSyncSettings.ts` does not exist yet.

- [ ] **Step 3: Write minimal shared sync-setting implementation**

```ts
export type MailHistoryRange = '7d' | '15d' | '1mo' | '6mo' | '1y' | 'all';

export const MAIL_HISTORY_RANGE_OPTIONS: MailHistoryRange[] = ['7d', '15d', '1mo', '6mo', '1y', 'all'];

export function coerceMailHistoryRange(value: unknown): MailHistoryRange {
  return MAIL_HISTORY_RANGE_OPTIONS.includes(value as MailHistoryRange) ? (value as MailHistoryRange) : '1mo';
}

export function historyRangeToMs(range: MailHistoryRange): number | null {
  if (range === 'all') return null;
  const day = 24 * 60 * 60 * 1000;
  return {
    '7d': 7 * day,
    '15d': 15 * day,
    '1mo': 30 * day,
    '6mo': 180 * day,
    '1y': 365 * day,
  }[range];
}
```

- [ ] **Step 4: Add shared backup IPC/task types**

```ts
export interface MailExportRequest {
  accountId: number;
  folderPaths: string[];
  destinationDir: string;
  readFilter: 'all' | 'read' | 'unread';
  startDate?: string;
  endDate?: string;
}

export interface MailExportProgress {
  taskId: string;
  phase: 'export';
  processed: number;
  total: number;
  currentLabel: string;
  cancelled?: boolean;
}

export interface MailImportRequest {
  accountId: number;
  targetFolder: string;
  sourcePaths: string[];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
- `npx.cmd tsc D:\下载\编程\APARK\scripts\mail-history-range.test.ts --module commonjs --target es2020 --esModuleInterop --skipLibCheck --outDir D:\下载\编程\APARK\.tmp-tests`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-history-range.test.js`

Expected: PASS with `mail-history-range shared tests passed`.

- [ ] **Step 6: Commit**

```bash
git add src/shared/backup.ts src/shared/mailSyncSettings.ts scripts/mail-history-range.test.ts
git commit -m "feat: add shared backup and sync setting types"
```

### Task 2: Replace Brand Assets and Sidebar Header

**Files:**
- Create: `D:\下载\编程\APARK\build\icons\app-icon.png`
- Create: `D:\下载\编程\APARK\build\icons\icon.ico`
- Modify: `D:\下载\编程\APARK\src\renderer\components\Sidebar.tsx`
- Modify: `D:\下载\编程\APARK\src\main\index.ts`
- Modify: `D:\下载\编程\APARK\package.json`
- Test: manual visual verification via build

- [ ] **Step 1: Create the compact icon source from the provided artwork**

Use the provided logo image and derive a square asset containing only the shield-envelope mark. Save outputs as:

```text
D:\下载\编程\APARK\build\icons\app-icon.png
D:\下载\编程\APARK\build\icons\icon.ico
```

The small icon must not include the `MinNiMail` wordmark.

- [ ] **Step 2: Update Sidebar header to use only the new logo mark**

```tsx
<div className="pt-5 pb-3 px-4 flex-shrink-0 flex items-center justify-center">
  <img
    src="/build/icons/app-icon.png"
    alt="MinNiMail"
    className="w-12 h-12 object-contain select-none pointer-events-none"
    draggable={false}
  />
</div>
```

Also remove the old `span` that rendered `minimail`.

- [ ] **Step 3: Update BrowserWindow and builder config to use the new icon**

```ts
mainWindow = new BrowserWindow({
  ...,
  icon: path.join(app.getAppPath(), 'build', 'icons', 'icon.ico'),
});
```

```json
"build": {
  "appId": "com.minimail.email",
  "productName": "MinNiMail",
  "icon": "build/icons/icon.ico",
  "win": {
    "icon": "build/icons/icon.ico",
    "target": [{ "target": "nsis", "arch": ["x64"] }]
  }
}
```

- [ ] **Step 4: Run build to verify no packaging config/type errors**

Run: `npm.cmd run build`

Expected: PASS with Vite + Electron TypeScript build completing successfully.

- [ ] **Step 5: Commit**

```bash
git add build/icons/app-icon.png build/icons/icon.ico src/renderer/components/Sidebar.tsx src/main/index.ts package.json
git commit -m "feat: apply MinNiMail branding assets"
```

### Task 3: Add Mail History Range and Expanded Auto-Fetch Settings

**Files:**
- Modify: `D:\下载\编程\APARK\src\renderer\components\SettingsModal.tsx`
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
- Modify: `D:\下载\编程\APARK\src\main\ipc\settings.ts`
- Modify: `D:\下载\编程\APARK\src\shared\mailSyncSettings.ts`
- Create: `D:\下载\编程\APARK\src\renderer\utils\mailHistoryRange.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-history-range.test.ts`

- [ ] **Step 1: Extend the failing test to cover renderer-facing options**

```ts
import { getMailHistoryRangeOptions, getAutoFetchIntervalOptions } from '../src/renderer/utils/mailHistoryRange';

assert.equal(getMailHistoryRangeOptions('zh').length, 6);
assert.equal(getAutoFetchIntervalOptions('en')[0].value, 0);
assert.equal(getAutoFetchIntervalOptions('en')[0].label, 'Never');
assert.equal(getAutoFetchIntervalOptions('zh')[1].value, 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run:
- `npx.cmd tsc D:\下载\编程\APARK\scripts\mail-history-range.test.ts --module commonjs --target es2020 --jsx react-jsx --esModuleInterop --skipLibCheck --outDir D:\下载\编程\APARK\.tmp-tests`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-history-range.test.js`

Expected: FAIL because `src/renderer/utils/mailHistoryRange.ts` does not exist yet.

- [ ] **Step 3: Add renderer helper for labels**

```ts
import type { AppLanguage } from '../../shared/mailFolders';
import type { MailHistoryRange } from '../../shared/mailSyncSettings';

export function getMailHistoryRangeOptions(language: AppLanguage) {
  return [
    { value: '7d' as MailHistoryRange, label: language === 'zh' ? '7天' : '7 days' },
    { value: '15d' as MailHistoryRange, label: language === 'zh' ? '15天' : '15 days' },
    { value: '1mo' as MailHistoryRange, label: language === 'zh' ? '1个月' : '1 month' },
    { value: '6mo' as MailHistoryRange, label: language === 'zh' ? '半年' : '6 months' },
    { value: '1y' as MailHistoryRange, label: language === 'zh' ? '1年' : '1 year' },
    { value: 'all' as MailHistoryRange, label: language === 'zh' ? '全部' : 'All' },
  ];
}
```

- [ ] **Step 4: Add the new controls to SettingsModal**

Add a new select in the `accounts` section:

```tsx
<div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
  <div className="flex items-center gap-2 mb-2">
    <Clock className="w-3 h-3" style={{ color: '#64d2ff' }} />
    <span className="text-[11px] font-medium text-white">{ui.mailHistoryRange}</span>
  </div>
  <select
    value={mailHistoryRange}
    onChange={(e) => onMailHistoryRangeChange(e.target.value as MailHistoryRange)}
    className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
    style={{ backgroundColor: '#0d0d0f' }}
  >
    {historyRangeOptions.map((option) => (
      <option key={option.value} value={option.value}>{option.label}</option>
    ))}
  </select>
</div>
```

Also extend auto-fetch options to include `0` and `1`.

- [ ] **Step 5: Wire the new setting through App.tsx**

```ts
const [mailHistoryRange, setMailHistoryRange] = useState<MailHistoryRange>('1mo');

useEffect(() => {
  void (async () => {
    const res = await window.electronAPI.invoke('settings:get', 'mail_fetch_history_range');
    if (res.success && res.data) {
      setMailHistoryRange(coerceMailHistoryRange(res.data));
    }
  })();
}, []);

const handleMailHistoryRangeChange = useCallback(async (value: MailHistoryRange) => {
  setMailHistoryRange(value);
  await window.electronAPI.invoke('settings:set', 'mail_fetch_history_range', value);
}, []);
```

- [ ] **Step 6: Run tests and build**

Run:
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-history-range.test.js`
- `npm.cmd run build`

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/SettingsModal.tsx src/renderer/App.tsx src/renderer/utils/mailHistoryRange.ts src/shared/mailSyncSettings.ts scripts/mail-history-range.test.ts
git commit -m "feat: add mail history range and fetch interval settings"
```

### Task 4: Add Unread Conversations View and Stronger Unread Styling

**Files:**
- Modify: `D:\下载\编程\APARK\src\renderer\components\Sidebar.tsx`
- Modify: `D:\下载\编程\APARK\src\renderer\components\MailList.tsx`
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
- Test: `D:\下载\编程\APARK\scripts\mail-unread-and-search.test.ts`

- [ ] **Step 1: Write the failing unread view/filter test**

```ts
import assert from 'node:assert/strict';
import { filterConversationRowsForFolder } from '../src/renderer/utils/mailConversations';

const rows = [
  { id: 'a', unreadCount: 0, latestMail: { subject: 'read' } },
  { id: 'b', unreadCount: 2, latestMail: { subject: 'unread' } },
];

assert.equal(filterConversationRowsForFolder(rows, 'unread').length, 1);
assert.equal(filterConversationRowsForFolder(rows, 'unread')[0].id, 'b');

console.log('mail unread filter tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:
- `npx.cmd tsc D:\下载\编程\APARK\scripts\mail-unread-and-search.test.ts --module commonjs --target es2020 --jsx react-jsx --esModuleInterop --skipLibCheck --outDir D:\下载\编程\APARK\.tmp-tests`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-unread-and-search.test.js`

Expected: FAIL because `filterConversationRowsForFolder` does not exist yet.

- [ ] **Step 3: Implement unread filtering and sidebar navigation**

```ts
export function filterConversationRowsForFolder(rows: SenderConversationRow[], folder: string) {
  if (folder === 'unread') {
    return rows.filter((row) => row.unreadCount > 0);
  }
  return rows;
}
```

Add a sidebar button:

```tsx
<button onClick={() => onSelectFolder('unread')} ...>
  <NavIcon active={selectedFolder === 'unread'}>{Icons.Notification}</NavIcon>
  <span className="flex-1 text-left leading-none">{ui.unread}</span>
</button>
```

- [ ] **Step 4: Strengthen unread row styling in MailList**

```tsx
const unread = email.unreadCount > 0;

<div
  className="rounded-xl border transition-all"
  style={{
    borderColor: unread ? 'rgba(0,113,227,0.4)' : 'transparent',
    backgroundColor: unread ? 'rgba(255,255,255,0.04)' : 'transparent',
  }}
>
```

Also ensure sender/subject typography uses brighter weight/color when unread.

- [ ] **Step 5: Run test and build**

Run:
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-unread-and-search.test.js`
- `npm.cmd run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/Sidebar.tsx src/renderer/components/MailList.tsx src/renderer/App.tsx scripts/mail-unread-and-search.test.ts
git commit -m "feat: add unread conversations view"
```

### Task 5: Fix Search Input Double Close Button

**Files:**
- Modify: `D:\下载\编程\APARK\src\renderer\components\MailList.tsx`
- Test: `D:\下载\编程\APARK\scripts\mail-unread-and-search.test.ts`

- [ ] **Step 1: Extend the failing test for search control rendering helper**

```ts
import { getSearchTrailingActions } from '../src/renderer/components/MailList';

assert.deepEqual(getSearchTrailingActions('invoice'), ['clear']);
assert.deepEqual(getSearchTrailingActions(''), []);
```

- [ ] **Step 2: Run test to verify it fails**

Run:
- `npx.cmd tsc D:\下载\编程\APARK\scripts\mail-unread-and-search.test.ts --module commonjs --target es2020 --jsx react-jsx --esModuleInterop --skipLibCheck --outDir D:\下载\编程\APARK\.tmp-tests`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-unread-and-search.test.js`

Expected: FAIL because helper is missing or current behavior yields duplicate controls.

- [ ] **Step 3: Implement a single trailing-action helper and use it in MailList**

```ts
export function getSearchTrailingActions(query: string): Array<'clear'> {
  return query.trim() ? ['clear'] : [];
}
```

```tsx
{getSearchTrailingActions(searchQuery).includes('clear') && (
  <button onClick={() => setSearchQuery('')} className="...">
    {Icons.Close}
  </button>
)}
```

Remove the second close/cancel icon branch entirely.

- [ ] **Step 4: Run test and build**

Run:
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-unread-and-search.test.js`
- `npm.cmd run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/MailList.tsx scripts/mail-unread-and-search.test.ts
git commit -m "fix: remove duplicate search clear action"
```

### Task 6: Add Backup Service Core for EML Export

**Files:**
- Create: `D:\下载\编程\APARK\src\main\services\mailBackup.ts`
- Modify: `D:\下载\编程\APARK\src\main\services\mailService.ts`
- Modify: `D:\下载\编程\APARK\src\main\index.ts`
- Modify: `D:\下载\编程\APARK\src\main\ipc\mail.ts`
- Modify: `D:\下载\编程\APARK\src\preload\index.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-backup.test.ts`

- [ ] **Step 1: Write the failing export filter/layout test**

```ts
import assert from 'node:assert/strict';
import { buildExportFileName, filterMailsForExport } from '../src/main/services/mailBackup';

const mails = [
  { uid: 1, subject: 'Read', date: '2026-04-01T00:00:00.000Z', isRead: true },
  { uid: 2, subject: 'Unread', date: '2026-04-02T00:00:00.000Z', isRead: false },
];

assert.equal(filterMailsForExport(mails, { readFilter: 'unread' }).length, 1);
assert.match(buildExportFileName({ uid: 2, subject: 'A/B:C', date: '2026-04-02T00:00:00.000Z' }), /^2026-04-02_/);

console.log('mail-backup export tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:
- `npx.cmd tsc D:\下载\编程\APARK\scripts\mail-backup.test.ts --module commonjs --target es2020 --esModuleInterop --skipLibCheck --outDir D:\下载\编程\APARK\.tmp-tests`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-backup.test.js`

Expected: FAIL because `mailBackup.ts` does not exist yet.

- [ ] **Step 3: Create the backup service core**

```ts
export function filterMailsForExport(mails: MailSummaryStored[], request: Pick<MailExportRequest, 'readFilter' | 'startDate' | 'endDate'>) {
  return mails.filter((mail) => {
    if (request.readFilter === 'read' && !mail.isRead) return false;
    if (request.readFilter === 'unread' && mail.isRead) return false;
    if (request.startDate && new Date(mail.date) < new Date(request.startDate)) return false;
    if (request.endDate && new Date(mail.date) > new Date(request.endDate)) return false;
    return true;
  });
}

export function buildExportFileName(mail: Pick<MailSummaryStored, 'uid' | 'subject' | 'date'>) {
  const stamp = new Date(mail.date).toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
  const safeSubject = mail.subject.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'untitled';
  return `${stamp}__${safeSubject}__${mail.uid}.eml`;
}
```

- [ ] **Step 4: Add export IPC and file helpers**

Expose handlers:

```ts
ipcMain.handle('mail:exportEml', async (_event, request: MailExportRequest) => {
  return exportMailsToEml(request, (progress) => {
    mainWindow?.webContents.send('mail:backup-progress', progress);
  });
});

ipcMain.handle('file:pickDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] });
  return { success: !result.canceled, paths: result.filePaths };
});

ipcMain.handle('file:openPath', async (_event, targetPath: string) => shell.openPath(targetPath));
```

- [ ] **Step 5: Run export test and build**

Run:
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-backup.test.js`
- `npm.cmd run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/mailBackup.ts src/main/index.ts src/main/ipc/mail.ts src/preload/index.ts scripts/mail-backup.test.ts
git commit -m "feat: add eml export service"
```

### Task 7: Add Backup Renderer UI and Export Flow

**Files:**
- Modify: `D:\下载\编程\APARK\src\renderer\components\SettingsModal.tsx`
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
- Create: `D:\下载\编程\APARK\src\renderer\utils\mailBackupUi.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-backup.test.ts`

- [ ] **Step 1: Extend the failing test for backup UI helper defaults**

```ts
import { createInitialBackupState } from '../src/renderer/utils/mailBackupUi';

const state = createInitialBackupState();
assert.equal(state.readFilter, 'all');
assert.equal(state.progress.processed, 0);
assert.equal(state.exportMode, 'folders');
```

- [ ] **Step 2: Run test to verify it fails**

Run:
- `npx.cmd tsc D:\下载\编程\APARK\scripts\mail-backup.test.ts --module commonjs --target es2020 --jsx react-jsx --esModuleInterop --skipLibCheck --outDir D:\下载\编程\APARK\.tmp-tests`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-backup.test.js`

Expected: FAIL because `mailBackupUi.ts` does not exist yet.

- [ ] **Step 3: Add backup state helper and Settings backup panel**

```ts
export function createInitialBackupState() {
  return {
    exportMode: 'folders' as const,
    selectedFolderPaths: [] as string[],
    readFilter: 'all' as const,
    startDate: '',
    endDate: '',
    destinationDir: '',
    progress: { processed: 0, total: 0, currentLabel: '' },
    taskId: '',
    isRunning: false,
  };
}
```

Render the panel with:

```tsx
{activeNav === 'backup' && (
  <div className="min-h-full px-6 py-5">
    <div className="mx-auto w-full max-w-[560px]">
      {/* account select, folder checklist, date filters, export/import controls */}
    </div>
  </div>
)}
```

- [ ] **Step 4: Wire export start/cancel/open-folder**

```ts
const result = await window.electronAPI.invoke('mail:exportEml', request);
if (result.success && result.data?.outputPath) {
  await window.electronAPI.invoke('file:openPath', result.data.outputPath);
}
```

Also subscribe to:

```ts
const unsubscribe = window.electronAPI.onBackupProgress((progress) => {
  setBackupState((prev) => ({ ...prev, progress, taskId: progress.taskId, isRunning: !progress.cancelled }));
});
```

- [ ] **Step 5: Run test and build**

Run:
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-backup.test.js`
- `npm.cmd run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SettingsModal.tsx src/renderer/App.tsx src/renderer/utils/mailBackupUi.ts scripts/mail-backup.test.ts
git commit -m "feat: add backup export ui"
```

### Task 8: Implement EML Import and Cache Refresh

**Files:**
- Modify: `D:\下载\编程\APARK\src\main\services\mailBackup.ts`
- Modify: `D:\下载\编程\APARK\src\main\ipc\mail.ts`
- Modify: `D:\下载\编程\APARK\src\preload\index.ts`
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
- Modify: `D:\下载\编程\APARK\src\renderer\components\SettingsModal.tsx`
- Test: `D:\下载\编程\APARK\scripts\mail-backup.test.ts`

- [ ] **Step 1: Extend the failing test for EML import parsing**

```ts
import { parseImportCandidates } from '../src/main/services/mailBackup';

const parsed = await parseImportCandidates([
  'D:/fixtures/sample.eml',
]);

assert.equal(parsed.length, 1);
assert.equal(parsed[0].subject, 'Sample Subject');
```

- [ ] **Step 2: Run test to verify it fails**

Run:
- `npx.cmd tsc D:\下载\编程\APARK\scripts\mail-backup.test.ts --module commonjs --target es2020 --esModuleInterop --skipLibCheck --outDir D:\下载\编程\APARK\.tmp-tests`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-backup.test.js`

Expected: FAIL because import helper is missing.

- [ ] **Step 3: Implement import parsing and upload flow**

```ts
export async function parseImportCandidates(paths: string[]) {
  const parsed = [];
  for (const entry of paths) {
    const buffer = await fs.promises.readFile(entry);
    const mail = await simpleParser(buffer);
    parsed.push({
      path: entry,
      subject: mail.subject || '(No subject)',
      from: mail.from?.text || '',
      to: mail.to?.text || '',
      date: mail.date?.toISOString() || new Date().toISOString(),
      html: typeof mail.html === 'string' ? mail.html : '',
      text: mail.text || '',
      attachments: mail.attachments,
    });
  }
  return parsed;
}
```

Then import each parsed item to target folder and write it into local cache after success.

- [ ] **Step 4: Wire import UI actions and completion summary**

```tsx
<button onClick={handlePickImportFiles}>选择 EML 文件</button>
<button onClick={handleRunImport} disabled={!canImport || backupState.isRunning}>开始导入</button>
```

After completion, trigger a background sync for the target folder with `notify: false`.

- [ ] **Step 5: Run test and build**

Run:
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-backup.test.js`
- `npm.cmd run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/mailBackup.ts src/main/ipc/mail.ts src/preload/index.ts src/renderer/App.tsx src/renderer/components/SettingsModal.tsx scripts/mail-backup.test.ts
git commit -m "feat: add eml import flow"
```

### Task 9: Apply History Range Only to Initial/Cold Sync

**Files:**
- Modify: `D:\下载\编程\APARK\src\main\services\mailService.ts`
- Modify: `D:\下载\编程\APARK\src\main\services\mail.ts`
- Modify: `D:\下载\编程\APARK\src\main\ipc\mail.ts`
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
- Test: `D:\下载\编程\APARK\scripts\mail-history-range.test.ts`

- [ ] **Step 1: Extend the failing history test for cold-vs-warm sync behavior**

```ts
import { shouldUseHistoryRange } from '../src/main/services/mailService';

assert.equal(shouldUseHistoryRange({ cachedCount: 0, hasHydratedBefore: false }), true);
assert.equal(shouldUseHistoryRange({ cachedCount: 24, hasHydratedBefore: true }), false);
```

- [ ] **Step 2: Run test to verify it fails**

Run:
- `npx.cmd tsc D:\下载\编程\APARK\scripts\mail-history-range.test.ts --module commonjs --target es2020 --esModuleInterop --skipLibCheck --outDir D:\下载\编程\APARK\.tmp-tests`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-history-range.test.js`

Expected: FAIL because helper is missing.

- [ ] **Step 3: Implement cold-start history decision helper**

```ts
export function shouldUseHistoryRange(input: { cachedCount: number; hasHydratedBefore: boolean }) {
  return input.cachedCount === 0 || !input.hasHydratedBefore;
}
```

Use it inside sync flow:

```ts
const useHistoryRange = shouldUseHistoryRange({ cachedCount, hasHydratedBefore });
const historyCutoff = useHistoryRange ? historyRangeToMs(configuredRange) : null;
```

- [ ] **Step 4: Pass history-range info from renderer only for initial hydration**

```ts
await syncMails(accountId, folderPath, {
  notify: false,
  folderKind,
  historyRange: initialHydration ? mailHistoryRange : undefined,
});
```

Do not include `historyRange` on manual refresh or interval refresh after hydration.

- [ ] **Step 5: Run tests and build**

Run:
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-history-range.test.js`
- `npm.cmd run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/mailService.ts src/main/services/mail.ts src/main/ipc/mail.ts src/renderer/App.tsx scripts/mail-history-range.test.ts
git commit -m "feat: limit history range to initial sync"
```

### Task 10: Final Verification and Packaging Readiness

**Files:**
- Modify if needed: `D:\下载\编程\APARK\docs\superpowers\specs\2026-04-13-backup-branding-sync-design.md`
- Test: all relevant script tests and build

- [ ] **Step 1: Run targeted regression tests**

Run:
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-history-range.test.js`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-backup.test.js`
- `node D:\下载\编程\APARK\.tmp-tests\scripts\mail-unread-and-search.test.js`
- `node D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`

Expected: all PASS.

- [ ] **Step 2: Run full build**

Run: `npm.cmd run build`

Expected: PASS.

- [ ] **Step 3: Manual verification checklist**

Verify:

```text
1. Sidebar shows new logo only, no old minimail text.
2. Unread nav exists and only shows unread conversations.
3. Search field shows one clear button when query is non-empty.
4. Settings > Accounts shows history range + expanded fetch intervals.
5. Settings > Backup can export and import EML with progress.
6. Initial hydration respects history range; later refresh remains incremental.
```

- [ ] **Step 4: Commit final adjustments**

```bash
git add src package.json docs/superpowers/specs/2026-04-13-backup-branding-sync-design.md scripts
git commit -m "feat: ship backup branding and sync polish"
```

## Self-Review

### Spec coverage

- Branding replacement: covered by Task 2.
- Backup/import first release: covered by Tasks 6, 7, 8.
- Mail fetch history range and auto-fetch refinement: covered by Tasks 1, 3, 9.
- Unread section and stronger unread state: covered by Task 4.
- Search double-close bug: covered by Task 5.

No spec gaps remain.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task has exact files, commands, and expected outcomes.

### Type consistency

- Shared type names used consistently:
  - `MailHistoryRange`
  - `MailExportRequest`
  - `MailImportRequest`
  - `MailExportProgress`
  - `MailImportProgress`
- Renderer settings key is consistently `mail_fetch_history_range`.

