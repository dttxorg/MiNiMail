# Staged History Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make first-time/history mail sync load recent mail first, then progressively expand by configured history range, while enforcing cache-range retention as the highest-priority limit.

**Architecture:** Keep existing `syncMails()` as the incremental refresh path, and add a staged-history path in the main process that runs `7d -> 15d -> 1mo -> 6mo -> 1y -> all` depending on the configured history range. The renderer will subscribe to lightweight stage progress, reload cached mail after each completed stage, and never auto-refresh when the user changes range settings.

**Tech Stack:** TypeScript, Electron IPC, React, SQLite cache, existing IMAP sync service in `src/main/services/mailService.ts`

---

### Task 1: Add shared staged-range helpers

**Files:**
- Modify: `D:\下载\编程\APARK\src\shared\mailSyncSettings.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-history-range.test.ts`

- [ ] **Step 1: Write the failing tests for staged history expansion**

Add assertions to `D:\下载\编程\APARK\scripts\mail-history-range.test.ts` for:

```ts
assert.deepStrictEqual(buildHistoryStages('7d'), ['7d']);
assert.deepStrictEqual(buildHistoryStages('15d'), ['7d', '15d']);
assert.deepStrictEqual(buildHistoryStages('1mo'), ['7d', '15d', '1mo']);
assert.deepStrictEqual(buildHistoryStages('6mo'), ['7d', '15d', '1mo', '6mo']);
assert.deepStrictEqual(buildHistoryStages('1y'), ['7d', '15d', '1mo', '6mo', '1y']);
assert.deepStrictEqual(buildHistoryStages('all'), ['7d', '15d', '1mo', '6mo', '1y', 'all']);
```

- [ ] **Step 2: Run the range test to verify failure**

Run: `node .\.tmp-tests\scripts\mail-history-range.test.js`  
Expected: FAIL because `buildHistoryStages` does not exist yet.

- [ ] **Step 3: Implement shared history stage helpers**

In `D:\下载\编程\APARK\src\shared\mailSyncSettings.ts`, add:

```ts
const HISTORY_STAGE_ORDER = ['7d', '15d', '1mo', '6mo', '1y', 'all'] as const;

export function buildHistoryStages(range: MailHistoryRange): MailHistoryRange[] {
  const index = HISTORY_STAGE_ORDER.indexOf(range);
  if (index === -1) return ['1mo'];
  return HISTORY_STAGE_ORDER.slice(0, index + 1) as MailHistoryRange[];
}
```

Also add:

```ts
export function clampHistoryRangeToCacheRange(
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
): MailHistoryRange {
  if (cacheRange === 'all') return historyRange;
  if (cacheRange === '3d') return '7d';
  if (cacheRange === '7d') return ['7d'].includes(historyRange) ? historyRange : '7d';
  if (cacheRange === '1mo') return ['7d', '15d', '1mo'].includes(historyRange) ? historyRange : '1mo';
  if (cacheRange === '6mo') return historyRange === 'all' || historyRange === '1y' ? '6mo' : historyRange;
  return historyRange;
}
```

- [ ] **Step 4: Run the range test again**

Run: `node .\.tmp-tests\scripts\mail-history-range.test.js`  
Expected: PASS for new stage mapping assertions.

- [ ] **Step 5: Commit**

```bash
git add D:/下载/编程/APARK/src/shared/mailSyncSettings.ts D:/下载/编程/APARK/scripts/mail-history-range.test.ts
git commit -m "feat: add staged history range helpers"
```

### Task 2: Implement staged sync in the main process

**Files:**
- Modify: `D:\下载\编程\APARK\src\main\services\mailService.ts`
- Modify: `D:\下载\编程\APARK\src\main\ipc\mail.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`

- [ ] **Step 1: Write a failing staged-sync behavior test scaffold**

Add a focused test case in `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs` or a new helper block that asserts:

```js
assert.deepStrictEqual(
  buildHistoryStages('all'),
  ['7d', '15d', '1mo', '6mo', '1y', 'all']
);
```

And add a small fake staged-progress reducer test:

```js
const progress = [];
recordStage(progress, { stageRange: '7d', loaded: 12 });
recordStage(progress, { stageRange: '15d', loaded: 20 });
assert.deepStrictEqual(progress.map((item) => item.stageRange), ['7d', '15d']);
```

- [ ] **Step 2: Run the regression test to verify the new staged hooks are missing**

Run: `node .\scripts\mail-regression-tests.cjs`  
Expected: FAIL because staged helpers/progress recorder are not wired.

- [ ] **Step 3: Add staged sync types and progress emitter**

In `D:\下载\编程\APARK\src\main\services\mailService.ts`, add:

```ts
export interface StagedSyncProgress {
  accountId: number;
  folder: string;
  stageRange: MailHistoryRange;
  loadedCount: number;
  stageIndex: number;
  totalStages: number;
  done: boolean;
}
```

Then add a module-level listener registry:

```ts
type StagedSyncListener = (progress: StagedSyncProgress) => void;
const stagedSyncListeners = new Set<StagedSyncListener>();

export function subscribeStagedSyncProgress(listener: StagedSyncListener): () => void {
  stagedSyncListeners.add(listener);
  return () => stagedSyncListeners.delete(listener);
}

function emitStagedSyncProgress(progress: StagedSyncProgress): void {
  for (const listener of stagedSyncListeners) listener(progress);
}
```

- [ ] **Step 4: Implement staged history sync path**

In `D:\下载\编程\APARK\src\main\services\mailService.ts`, add:

```ts
async function syncMailsStaged(
  accountId: number,
  folder: string,
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
  options?: { notify?: boolean; folderKind?: 'inbox' | 'other' },
): Promise<SyncResult> {
  const stages = buildHistoryStages(clampHistoryRangeToCacheRange(historyRange, cacheRange));
  let lastResult: SyncResult = { newMails: [], totalCached: 0, errors: [] };

  for (let index = 0; index < stages.length; index += 1) {
    const stageRange = stages[index];
    lastResult = await syncMails(accountId, folder, {
      ...options,
      historyRange: stageRange,
      forceHistoryRange: true,
      notify: index === 0 ? options?.notify : false,
    });

    pruneCachedMailStore(cacheRange, accountId, folder);

    emitStagedSyncProgress({
      accountId,
      folder,
      stageRange,
      loadedCount: lastResult.totalCached,
      stageIndex: index,
      totalStages: stages.length,
      done: index === stages.length - 1,
    });
  }

  return lastResult;
}
```

Then update the public `syncMails()` entry to keep incremental behavior unchanged, and only use `syncMailsStaged()` when:

```ts
const cachedCount = getCachedUids(accountId, folder).size;
const shouldStage = options?.forceHistoryRange === true && cachedCount <= 0;
```

Keep the old fast incremental path for normal refresh.

- [ ] **Step 5: Expose staged progress through IPC**

In `D:\下载\编程\APARK\src\main\ipc\mail.ts`, register:

```ts
import { BrowserWindow } from 'electron';
import { subscribeStagedSyncProgress } from '../services/mailService';
```

Inside `registerMailHandlers()`:

```ts
subscribeStagedSyncProgress((progress) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:stagedSyncProgress', progress);
  }
});
```

Ensure the existing `mail:sync` handler accepts:

```ts
options?: {
  notify?: boolean;
  folderKind?: 'inbox' | 'other';
  historyRange?: MailHistoryRange;
  forceHistoryRange?: boolean;
}
```

- [ ] **Step 6: Run regression and build**

Run:

```bash
node .\scripts\mail-regression-tests.cjs
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add D:/下载/编程/APARK/src/main/services/mailService.ts D:/下载/编程/APARK/src/main/ipc/mail.ts D:/下载/编程/APARK/scripts/mail-regression-tests.cjs
git commit -m "feat: add staged history sync service"
```

### Task 3: Wire staged sync into renderer refresh flow

**Files:**
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
- Modify: `D:\下载\编程\APARK\src\renderer\hooks\useMail.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-view-sync.test.ts`

- [ ] **Step 1: Write a failing renderer sync policy test**

In `D:\下载\编程\APARK\scripts\mail-view-sync.test.ts`, add a small pure helper test:

```ts
assert.equal(
  shouldUseStagedHistorySync({ cachedCount: 0, forceHistoryRange: true }),
  true,
);
assert.equal(
  shouldUseStagedHistorySync({ cachedCount: 12, forceHistoryRange: false }),
  false,
);
```

- [ ] **Step 2: Run the test to verify failure**

Run: `node .\.tmp-tests\scripts\mail-view-sync.test.js`  
Expected: FAIL because helper is missing.

- [ ] **Step 3: Add renderer-side staged sync state**

In `D:\下载\编程\APARK\src\renderer\App.tsx`, add:

```ts
type StagedHistoryUiState = {
  active: boolean;
  stageRange: MailHistoryRange | null;
  stageIndex: number;
  totalStages: number;
  accountId: number | null;
  folder: string | null;
};
```

Create state:

```ts
const [stagedHistorySync, setStagedHistorySync] = useState<StagedHistoryUiState>({
  active: false,
  stageRange: null,
  stageIndex: 0,
  totalStages: 0,
  accountId: null,
  folder: null,
});
```

- [ ] **Step 4: Subscribe to staged progress events**

In `App.tsx`, add an effect:

```ts
useEffect(() => {
  const unsubscribe = window.electronAPI.onMailStagedSyncProgress?.((progress) => {
    setStagedHistorySync({
      active: !progress.done,
      stageRange: progress.stageRange,
      stageIndex: progress.stageIndex,
      totalStages: progress.totalStages,
      accountId: progress.accountId,
      folder: progress.folder,
    });

    void reloadCurrentViewForHistoryRange(mailFetchHistoryRange);
  });

  return () => unsubscribe?.();
}, [mailFetchHistoryRange, reloadCurrentViewForHistoryRange]);
```

If preload typing is missing, extend it in the same task in preload files before build.

- [ ] **Step 5: Route manual refresh through staged history only when needed**

In `App.tsx`, change `fetchMails()` so that manual refresh can pass `forceHistoryRange: true` when the current account/folder has no cache, but normal automatic refresh remains incremental:

```ts
const shouldForceHistoryForView = async (accountId: number, folder: string): Promise<boolean> => {
  const cachedResp = await window.electronAPI.invoke('mail:loadCached', accountId, folder, mailFetchHistoryRange);
  return !(cachedResp.success && cachedResp.data && cachedResp.data.length > 0);
};
```

Then in `handleRefresh()` use:

```ts
const forceHistoryRange = await shouldForceHistoryForView(...);
await syncMails(..., { historyRange: mailFetchHistoryRange, forceHistoryRange });
```

Do not re-enable automatic refresh on range-setting changes.

- [ ] **Step 6: Add the pure helper and make the test pass**

Create or add in `App.tsx`-adjacent utility:

```ts
export function shouldUseStagedHistorySync(args: { cachedCount: number; forceHistoryRange: boolean }): boolean {
  return args.forceHistoryRange && args.cachedCount <= 0;
}
```

- [ ] **Step 7: Run renderer sync test and build**

Run:

```bash
node .\.tmp-tests\scripts\mail-view-sync.test.js
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add D:/下载/编程/APARK/src/renderer/App.tsx D:/下载/编程/APARK/src/renderer/hooks/useMail.ts D:/下载/编程/APARK/scripts/mail-view-sync.test.ts
git commit -m "feat: wire staged history sync into renderer"
```

### Task 4: Add staged history UI feedback in the list pane

**Files:**
- Modify: `D:\下载\编程\APARK\src\renderer\components\MailList.tsx`
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
- Test: `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`

- [ ] **Step 1: Add a failing UI string expectation**

In `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`, add a simple formatting test:

```js
assert.equal(formatStagedHistoryLabel('7d', 'zh'), '正在同步最近 7 天邮件');
assert.equal(formatStagedHistoryLabel('1mo', 'en'), 'Expanding sync to 1 month');
```

- [ ] **Step 2: Run the test to verify failure**

Run: `node .\scripts\mail-regression-tests.cjs`  
Expected: FAIL because formatter does not exist.

- [ ] **Step 3: Add a small staged-history status banner**

In `D:\下载\编程\APARK\src\renderer\components\MailList.tsx`, add props:

```ts
stagedHistoryLabel?: string | null;
```

Render under the search bar:

```tsx
{stagedHistoryLabel && (
  <div className="px-4 py-2 text-[11px]" style={{ color: '#a1a1a6', borderBottom: '1px solid #3a3a3d' }}>
    {stagedHistoryLabel}
  </div>
)}
```

- [ ] **Step 4: Add label formatter in App**

In `App.tsx`, add:

```ts
function formatStagedHistoryLabel(range: MailHistoryRange, appLanguage: AppLanguage): string {
  const labels: Record<MailHistoryRange, Record<AppLanguage, string>> = {
    '7d': { zh: '正在同步最近 7 天邮件', en: 'Syncing the last 7 days', ja: '直近7日を同期中', ko: '최근 7일 메일 동기화 중', es: 'Sincronizando los últimos 7 días', fr: 'Synchronisation des 7 derniers jours', de: 'Synchronisiere die letzten 7 Tage', ru: 'Синхронизация писем за 7 дней' },
    '15d': { zh: '正在扩展到 15 天', en: 'Expanding sync to 15 days', ja: '15日まで拡張中', ko: '15일까지 확장 중', es: 'Ampliando a 15 días', fr: 'Extension à 15 jours', de: 'Erweitere auf 15 Tage', ru: 'Расширение до 15 дней' },
    '1mo': { zh: '正在扩展到 1 个月', en: 'Expanding sync to 1 month', ja: '1か月まで拡張中', ko: '1개월까지 확장 중', es: 'Ampliando a 1 mes', fr: 'Extension à 1 mois', de: 'Erweitere auf 1 Monat', ru: 'Расширение до 1 месяца' },
    '6mo': { zh: '正在扩展到半年', en: 'Expanding sync to 6 months', ja: '半年まで拡張中', ko: '6개월까지 확장 중', es: 'Ampliando a 6 meses', fr: 'Extension à 6 mois', de: 'Erweitere auf 6 Monate', ru: 'Расширение до 6 месяцев' },
    '1y': { zh: '正在扩展到 1 年', en: 'Expanding sync to 1 year', ja: '1年まで拡張中', ko: '1년까지 확장 중', es: 'Ampliando a 1 año', fr: 'Extension à 1 an', de: 'Erweitere auf 1 Jahr', ru: 'Расширение до 1 года' },
    'all': { zh: '正在同步全部历史邮件', en: 'Syncing all mail history', ja: '全履歴を同期中', ko: '전체 메일 기록 동기화 중', es: 'Sincronizando todo el historial', fr: 'Synchronisation de tout l’historique', de: 'Synchronisiere den gesamten Verlauf', ru: 'Синхронизация всей истории' },
  };
  return labels[range][appLanguage] ?? labels[range].en;
}
```

Pass it into `MailList`.

- [ ] **Step 5: Run regression and build**

Run:

```bash
node .\scripts\mail-regression-tests.cjs
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add D:/下载/编程/APARK/src/renderer/components/MailList.tsx D:/下载/编程/APARK/src/renderer/App.tsx D:/下载/编程/APARK/scripts/mail-regression-tests.cjs
git commit -m "feat: show staged history sync progress in mail list"
```

### Task 5: Enforce cache-range priority after every stage

**Files:**
- Modify: `D:\下载\编程\APARK\src\main\services\mailService.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-history-range.test.ts`

- [ ] **Step 1: Add a failing cache-priority test**

In `D:\下载\编程\APARK\scripts\mail-history-range.test.ts`, add:

```ts
assert.equal(clampHistoryRangeToCacheRange('all', '7d'), '7d');
assert.equal(clampHistoryRangeToCacheRange('6mo', '1mo'), '1mo');
assert.equal(clampHistoryRangeToCacheRange('15d', '6mo'), '15d');
```

- [ ] **Step 2: Run the test**

Run: `node .\.tmp-tests\scripts\mail-history-range.test.js`  
Expected: PASS only after Task 1 helper is complete.

- [ ] **Step 3: Apply cache prune after each stage and after final stage**

In `mailService.ts`, after every staged `syncMails()` call:

```ts
pruneCachedMailStore(cacheRange, accountId, folder);
```

Also keep the existing startup/load-time prune path intact.

- [ ] **Step 4: Verify with build**

Run:

```bash
node .\.tmp-tests\scripts\mail-history-range.test.js
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add D:/下载/编程/APARK/src/main/services/mailService.ts D:/下载/编程/APARK/scripts/mail-history-range.test.ts
git commit -m "fix: enforce cache range priority during staged sync"
```

### Task 6: Final verification

**Files:**
- Verify only

- [ ] **Step 1: Run the full targeted verification set**

Run:

```bash
node .\scripts\mail-regression-tests.cjs
node .\.tmp-tests\scripts\mail-history-range.test.js
node .\.tmp-tests\scripts\mail-view-sync.test.js
npm.cmd run build
```

Expected: all PASS.

- [ ] **Step 2: Manual validation checklist**

Verify in the packaged app:

1. New Gmail account first load shows recent mail first.
2. `15d` only stages `7d -> 15d`.
3. `all` stages through all buckets.
4. Cache range `7d` prevents older mail from staying cached even if history is `all`.
5. Changing history/cache range does not auto-refresh immediately.
6. Manual refresh after a range change respects the new range.

- [ ] **Step 3: Commit verification-only follow-ups if needed**

```bash
git add -A
git commit -m "test: verify staged history sync flow"
```
