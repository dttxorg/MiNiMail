# Body Cache And AI Conversation Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add staged body prefetch constrained by history/cache ranges, and split AI classification conversations by contact plus category while keeping the main view contact-grouped.

**Architecture:** Extend the existing staged history sync model with a second background body-cache queue that only operates on already-loaded summary mails and respects the minimum of history range and cache range. Keep the main conversation key unchanged, and introduce a separate classified conversation key used only in AI category views so the same sender can appear as multiple categorized conversations.

**Tech Stack:** TypeScript, Electron main/renderer IPC, React hooks, existing SQLite mail cache, existing regression test scripts

---

## File Structure

- Modify: `D:\下载\编程\APARK\src\shared\mailSyncSettings.ts`
  - Add body-cache stage utilities and effective range helpers.
- Modify: `D:\下载\编程\APARK\src\main\services\mailService.ts`
  - Persist body-cache metadata, expose cache-aware helpers, and keep body-cache operations safe.
- Modify: `D:\下载\编程\APARK\src\main\ipc\mail.ts`
  - Add or adjust IPC helpers for staged body caching if needed.
- Modify: `D:\下载\编程\APARK\src\renderer\hooks\useMail.ts`
  - Add staged body prefetch queue logic, priority handling, and reuse of cached bodies.
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
  - Wire staged body prefetch triggers to current view/conversation and preserve current manual detail priority.
- Modify: `D:\下载\编程\APARK\src\renderer\utils\mailConversations.ts`
  - Add classified conversation key generation and AI-view grouping helpers.
- Modify: `D:\下载\编程\APARK\src\renderer\components\MailList.tsx`
  - Use contact-plus-category grouping in AI category views only.
- Modify: `D:\下载\编程\APARK\src\renderer\components\MailDetail.tsx`
  - Ensure AI category view conversation detail only shows mails from the same classified conversation.
- Modify: `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`
  - Add shared helpers and regression coverage for staged body caching.
- Create: `D:\下载\编程\APARK\scripts\mail-ai-conversation-split.test.ts`
  - Focused tests for AI-category conversation grouping behavior.

### Task 1: Add Shared Range Helpers For Body Cache

**Files:**
- Modify: `D:\下载\编程\APARK\src\shared\mailSyncSettings.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`

- [ ] **Step 1: Write the failing test**

Add assertions that body-cache stages are clipped by the minimum of history range and cache range:

```js
assert.deepStrictEqual(buildBodyCacheStages('7d', 'all'), ['3d', '7d']);
assert.deepStrictEqual(buildBodyCacheStages('all', '7d'), ['3d', '7d']);
assert.deepStrictEqual(buildBodyCacheStages('6mo', '1mo'), ['3d', '7d', '15d', '1mo']);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\mail-regression-tests.cjs`
Expected: FAIL with `buildBodyCacheStages is not a function` or equivalent assertion failure.

- [ ] **Step 3: Write minimal implementation**

Add:

```ts
export const BODY_CACHE_STAGE_ORDER: MailHistoryRange[] = ['3d', '7d', '15d', '1mo', '6mo', '1y', 'all'];

export function clampBodyCacheRangeToHistoryRange(
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
): MailHistoryRange {
  return clampHistoryRangeToCacheRange(historyRange, cacheRange);
}

export function buildBodyCacheStages(
  historyRange: MailHistoryRange,
  cacheRange: MailCacheRange,
): MailHistoryRange[] {
  const effective = clampBodyCacheRangeToHistoryRange(historyRange, cacheRange);
  return buildHistoryStages(effective).filter((stage) => BODY_CACHE_STAGE_ORDER.includes(stage));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\mail-regression-tests.cjs`
Expected: PASS for the new body-cache stage assertions.

- [ ] **Step 5: Commit**

```bash
git add D:\下载\编程\APARK\src\shared\mailSyncSettings.ts D:\下载\编程\APARK\scripts\mail-regression-tests.cjs
git commit -m "feat: add body cache stage helpers"
```

### Task 2: Persist And Prune Body Cache Metadata Safely

**Files:**
- Modify: `D:\下载\编程\APARK\src\main\services\mailService.ts`
- Test: `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`

- [ ] **Step 1: Write the failing test**

Add coverage that saving a fetched body records body data, and pruning body cache for a tight range removes stale body content without breaking summary loading.

```js
saveLocalMailToCache({
  id: 'body-stale',
  uid: 5001,
  from: 'sender@example.com',
  fromName: 'Sender',
  to: 'receiver@example.com',
  subject: 'Old body',
  date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
  snippet: 'old',
  hasAttachments: false,
  isRead: false,
  isStarred: false,
  folder: 'INBOX',
  accountId: 77,
  cachedAt: new Date().toISOString(),
  bodyText: 'stale body',
});

pruneCachedMailStore('7d', 77, 'INBOX');
assert.strictEqual(getCachedBody(77, 5001, 'INBOX'), null);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\mail-regression-tests.cjs`
Expected: FAIL because old body data is still present or pruning behavior is incomplete.

- [ ] **Step 3: Write minimal implementation**

Update `mail_cache` migration and helpers so body metadata is explicit and body-pruning can remove stale bodies safely:

```ts
const migrations = [
  'ALTER TABLE mail_cache ADD COLUMN body_cached_at TEXT',
  'ALTER TABLE mail_cache ADD COLUMN body_cache_stage TEXT',
];
```

When upserting with body content, set:

```ts
bodyCachedAt: mail.bodyHtml || mail.bodyText ? new Date().toISOString() : existing?.body_cached_at ?? null,
bodyCacheStage: mail.bodyCacheStage ?? existing?.body_cache_stage ?? null,
```

When pruning beyond cache window, clear body columns for matching stale rows before or instead of removing summaries:

```ts
UPDATE mail_cache
SET body_html = NULL, body_text = NULL, body_cached_at = NULL, body_cache_stage = NULL
WHERE account_id = ? AND folder = ? AND datetime(date) < datetime(?)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\mail-regression-tests.cjs`
Expected: PASS and stale bodies are no longer returned from cache.

- [ ] **Step 5: Commit**

```bash
git add D:\下载\编程\APARK\src\main\services\mailService.ts D:\下载\编程\APARK\scripts\mail-regression-tests.cjs
git commit -m "feat: persist and prune body cache metadata"
```

### Task 3: Implement Staged Body Prefetch Queue In Renderer

**Files:**
- Modify: `D:\下载\编程\APARK\src\renderer\hooks\useMail.ts`
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
- Test: `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`

- [ ] **Step 1: Write the failing test**

Add a test that staged body prefetch only targets mails inside the effective body-cache range and prefers current visible mails first.

```js
const eligible = pickBodyPrefetchCandidates(
  [
    { uid: 1, date: new Date(), bodyText: undefined },
    { uid: 2, date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), bodyText: undefined },
  ],
  { historyRange: 'all', cacheRange: '7d' }
);

assert.deepStrictEqual(eligible.map((mail) => mail.uid), [1]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\mail-regression-tests.cjs`
Expected: FAIL because candidate selection helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

In `useMail.ts`, add pure helpers plus a queue:

```ts
export function pickBodyPrefetchCandidates(
  mails: RendererMailSummary[],
  options: { historyRange: MailHistoryRange; cacheRange: MailCacheRange; now?: number },
): RendererMailSummary[] {
  const stages = buildBodyCacheStages(options.historyRange, options.cacheRange);
  const maxRange = stages.at(-1) ?? '3d';
  const cutoff = mailHistoryRangeToMs(maxRange);
  return mails.filter((mail) => {
    if (mail.bodyHtml || mail.bodyText) return false;
    if (cutoff == null) return true;
    return mail.date.getTime() >= (options.now ?? Date.now()) - cutoff;
  });
}
```

Then in the hook:

```ts
const bodyPrefetchInFlight = useRef(new Set<string>()).current;

const preloadMailBodies = useCallback(async (mails: RendererMailSummary[], limit = 5) => {
  const queue = mails.slice(0, limit);
  for (const mail of queue) {
    const key = `${mail.accountId}:${mail.folder}:${mail.uid}`;
    if (bodyFetchedSet.has(key) || bodyPreloadingSet.has(key) || bodyPrefetchInFlight.has(key)) continue;
    bodyPrefetchInFlight.add(key);
    try {
      const cached = await window.electronAPI.invoke('mail:loadCachedBody', mail.accountId, mail.uid, mail.folder);
      if (cached?.success && (cached.data?.bodyHtml || cached.data?.bodyText)) {
        bodyFetchedSet.add(key);
        continue;
      }
      await window.electronAPI.invoke('mail:fetchFull', mail.accountId, mail.uid, mail.folder);
      bodyFetchedSet.add(key);
    } catch {
      // swallow background prefetch failure
    } finally {
      bodyPrefetchInFlight.delete(key);
    }
  }
}, []);
```

In `App.tsx`, build the candidate list from visible mails/conversation mails using `pickBodyPrefetchCandidates`, and trigger prefetch only after list hydration settles.

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\mail-regression-tests.cjs`
Expected: PASS, and no unrelated test regressions.

- [ ] **Step 5: Commit**

```bash
git add D:\下载\编程\APARK\src\renderer\hooks\useMail.ts D:\下载\编程\APARK\src\renderer\App.tsx D:\下载\编程\APARK\scripts\mail-regression-tests.cjs
git commit -m "feat: add staged body prefetch queue"
```

### Task 4: Split AI Category Conversations By Contact Plus Category

**Files:**
- Modify: `D:\下载\编程\APARK\src\renderer\utils\mailConversations.ts`
- Modify: `D:\下载\编程\APARK\src\renderer\components\MailList.tsx`
- Create: `D:\下载\编程\APARK\scripts\mail-ai-conversation-split.test.ts`

- [ ] **Step 1: Write the failing test**

Create a focused test proving two Apple mails with different categories become two conversations in AI view, while unclassified mail is excluded.

```js
const grouped = groupAiCategoryConversations([
  makeMail({ from: 'news@apple.com', category: 'notifications', subject: 'Login alert' }),
  makeMail({ from: 'news@apple.com', category: 'ads_marketing', subject: 'New iPhone' }),
  makeMail({ from: 'news@apple.com', category: undefined, subject: 'Unclassified' }),
], ['me@example.com']);

assert.strictEqual(grouped.length, 2);
assert.deepStrictEqual(grouped.map((item) => item.category).sort(), ['ads_marketing', 'notifications']);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\mail-ai-conversation-split.test.js`
Expected: FAIL because grouping helpers do not exist or still collapse by contact only.

- [ ] **Step 3: Write minimal implementation**

In `mailConversations.ts`, add:

```ts
export function buildClassifiedConversationKey(
  mail: RendererMailSummary,
  accountEmails: string[],
): string | null {
  const contactKey = buildSenderConversationKey(mail, accountEmails);
  if (!contactKey || !mail.category) return null;
  return `${contactKey}::${mail.category}`;
}
```

And:

```ts
export function findClassifiedConversationMails(
  selectedMail: RendererMailSummary,
  allMails: RendererMailSummary[],
  accountEmails: string[],
): RendererMailSummary[] {
  const key = buildClassifiedConversationKey(selectedMail, accountEmails);
  if (!key) return [];
  return allMails.filter((mail) => buildClassifiedConversationKey(mail, accountEmails) === key);
}
```

Update `MailList.tsx` so AI category folder views use `buildClassifiedConversationKey` instead of the normal contact grouping key.

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\mail-ai-conversation-split.test.js`
Expected: PASS, and unclassified mails are absent from AI-category grouping.

- [ ] **Step 5: Commit**

```bash
git add D:\下载\编程\APARK\src\renderer\utils\mailConversations.ts D:\下载\编程\APARK\src\renderer\components\MailList.tsx D:\下载\编程\APARK\scripts\mail-ai-conversation-split.test.ts
git commit -m "feat: split ai category conversations by contact and category"
```

### Task 5: Scope AI Category Detail View To Classified Conversations

**Files:**
- Modify: `D:\下载\编程\APARK\src\renderer\App.tsx`
- Modify: `D:\下载\编程\APARK\src\renderer\components\MailDetail.tsx`
- Test: `D:\下载\编程\APARK\scripts\mail-ai-conversation-split.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the new test to assert that AI view detail selection only includes mails from the same classified conversation.

```js
const detailMails = findClassifiedConversationMails(selectedNotificationMail, allMails, ['me@example.com']);
assert.ok(detailMails.every((mail) => mail.category === 'notifications'));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\mail-ai-conversation-split.test.js`
Expected: FAIL because AI detail view still mixes categories from the same contact.

- [ ] **Step 3: Write minimal implementation**

In `App.tsx`, where conversation messages are built, branch on AI category views:

```ts
const conversationMessages = useMemo(() => {
  if (!selectedMailForThread) return [];
  const siblings = isAiCategoryFolder(selectedFolder)
    ? findClassifiedConversationMails(selectedMailForThread, threadMailUniverse, conversationAccountEmails)
    : findSenderConversationMails(selectedMailForThread, threadMailUniverse, conversationAccountEmails);

  return [selectedMailForThread, ...siblings]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .filter((mail, index, arr) => arr.findIndex((candidate) => candidate.id === mail.id) === index);
}, [...]);
```

`MailDetail.tsx` should continue rendering the provided `conversationMessages`, without pulling in extra same-sender mails on its own.

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\mail-ai-conversation-split.test.js`
Expected: PASS and only same-category mails appear in AI detail view.

- [ ] **Step 5: Commit**

```bash
git add D:\下载\编程\APARK\src\renderer\App.tsx D:\下载\编程\APARK\src\renderer\components\MailDetail.tsx D:\下载\编程\APARK\scripts\mail-ai-conversation-split.test.ts
git commit -m "feat: scope ai detail view to classified conversations"
```

### Task 6: Final Regression And Build Verification

**Files:**
- Modify: `D:\下载\编程\APARK\scripts\mail-regression-tests.cjs`
- Test: `D:\下载\编程\APARK\scripts\mail-ai-conversation-split.test.ts`

- [ ] **Step 1: Run focused regressions**

Run:

```bash
node .\scripts\mail-regression-tests.cjs
node .\scripts\mail-ai-conversation-split.test.js
```

Expected: both PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm.cmd run build
```

Expected: renderer and main build both succeed.

- [ ] **Step 3: Sanity-check spec coverage**

Confirm these behaviors are now true:

```text
- body prefetch range is clipped by min(historyRange, cacheRange)
- background body cache does not widen server history range
- main conversation view still groups by contact only
- AI category view groups by contact + category
- unclassified mail is absent from AI category view
```

- [ ] **Step 4: Commit**

```bash
git add D:\下载\编程\APARK\src\shared\mailSyncSettings.ts D:\下载\编程\APARK\src\main\services\mailService.ts D:\下载\编程\APARK\src\renderer\hooks\useMail.ts D:\下载\编程\APARK\src\renderer\App.tsx D:\下载\编程\APARK\src\renderer\utils\mailConversations.ts D:\下载\编程\APARK\src\renderer\components\MailList.tsx D:\下载\编程\APARK\src\renderer\components\MailDetail.tsx D:\下载\编程\APARK\scripts\mail-regression-tests.cjs D:\下载\编程\APARK\scripts\mail-ai-conversation-split.test.ts
git commit -m "feat: add body prefetch and split ai category conversations"
```
