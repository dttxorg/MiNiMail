import { getSyncFoldersForView } from '../src/renderer/utils/mailSyncPlanner';
import { MailCacheRefreshQueue } from '../src/renderer/utils/mailCacheRefreshQueue';
import { SharedMailBodyStore } from '../src/renderer/utils/mailBodyLoader';
import { pickBodyPrefetchCandidates } from '../src/renderer/utils/bodyCachePrefetch';
import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function testSyncFoldersAreNarrowed() {
  assert(JSON.stringify(getSyncFoldersForView('inbox')) === JSON.stringify(['inbox']), 'inbox 视图只应同步 inbox');
  assert(JSON.stringify(getSyncFoldersForView('starred')) === JSON.stringify(['inbox']), 'starred 视图不应再同步 sent/drafts');
  assert(JSON.stringify(getSyncFoldersForView('github')) === JSON.stringify(['inbox']), 'github 视图不应再同步 sent/drafts');
  assert(JSON.stringify(getSyncFoldersForView('unread')) === JSON.stringify(['inbox']), 'unread 视图应收紧到 inbox');
  assert(JSON.stringify(getSyncFoldersForView('sent')) === JSON.stringify(['sent']), 'sent 视图只应同步 sent');
  assert(JSON.stringify(getSyncFoldersForView('drafts')) === JSON.stringify(['drafts']), 'drafts 视图只应同步 drafts');
}

async function testSharedMailBodyStoreDedupesInflightAndCachesResult() {
  const store = new SharedMailBodyStore(2);
  let cachedBodyCalls = 0;
  let fetchFullCalls = 0;

  const api = {
    async invoke(channel: string) {
      if (channel === 'mail:loadCachedBody') {
        cachedBodyCalls += 1;
        return { success: false };
      }
      if (channel === 'mail:fetchFull') {
        fetchFullCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          success: true,
          data: {
            id: 'mail-1',
            uid: 1,
            from: 'a@example.com',
            fromName: 'A',
            to: 'b@example.com',
            subject: 'test',
            date: new Date(),
            snippet: 'snippet',
            hasAttachments: false,
            isRead: false,
            isStarred: false,
            folder: 'INBOX',
            accountId: 1,
            attachments: [],
            headers: {},
            bodyHtml: '<p>body</p>',
            bodyText: 'body',
          },
        };
      }
      throw new Error(`unexpected channel ${channel}`);
    },
  };

  const [first, second] = await Promise.all([
    store.load(api, { accountId: 1, uid: 1, folder: 'INBOX' }),
    store.load(api, { accountId: 1, uid: 1, folder: 'INBOX' }),
  ]);

  assert(fetchFullCalls === 1, '并发正文请求应共享同一个 fetchFull');
  assert(cachedBodyCalls === 1, '并发正文请求应共享同一个 loadCachedBody');
  assert(first.bodyText === 'body' && second.bodyText === 'body', '共享正文结果应返回相同正文');

  const third = await store.load(api, { accountId: 1, uid: 1, folder: 'INBOX' });
  assert(fetchFullCalls === 1, '命中内存缓存后不应再次 fetchFull');
  assert(third.source === 'memory', '二次读取应命中内存缓存');
}

async function testSharedMailBodyStoreEvictsOldEntries() {
  const store = new SharedMailBodyStore(2);
  let fetchFullCalls = 0;
  const api = {
    async invoke(channel: string, accountId: number, uid: number) {
      if (channel === 'mail:loadCachedBody') {
        return { success: false };
      }
      if (channel === 'mail:fetchFull') {
        fetchFullCalls += 1;
        return {
          success: true,
          data: {
            id: `mail-${uid}`,
            uid,
            from: 'a@example.com',
            fromName: 'A',
            to: 'b@example.com',
            subject: `test-${uid}`,
            date: new Date(),
            snippet: 'snippet',
            hasAttachments: false,
            isRead: false,
            isStarred: false,
            folder: 'INBOX',
            accountId,
            attachments: [],
            headers: {},
            bodyText: `body-${uid}`,
          },
        };
      }
      throw new Error(`unexpected channel ${channel}`);
    },
  };

  await store.load(api, { accountId: 1, uid: 1, folder: 'INBOX' });
  await store.load(api, { accountId: 1, uid: 2, folder: 'INBOX' });
  await store.load(api, { accountId: 1, uid: 3, folder: 'INBOX' });
  await store.load(api, { accountId: 1, uid: 1, folder: 'INBOX' });

  assert(fetchFullCalls === 4, '超出上限后，最旧正文缓存应被淘汰并重新抓取');
}

async function testSharedMailBodyStoreSkipsOversizedMemoryEntries() {
  const store = new SharedMailBodyStore(10, 1024 * 1024, 100);
  let fetchFullCalls = 0;
  const api = {
    async invoke(channel: string, accountId: number, uid: number) {
      if (channel === 'mail:loadCachedBody') {
        return { success: false };
      }
      if (channel === 'mail:fetchFull') {
        fetchFullCalls += 1;
        return {
          success: true,
          data: {
            id: `mail-${uid}`,
            uid,
            from: 'a@example.com',
            fromName: 'A',
            to: 'b@example.com',
            subject: `test-${uid}`,
            date: new Date(),
            snippet: 'snippet',
            hasAttachments: false,
            isRead: false,
            isStarred: false,
            folder: 'INBOX',
            accountId,
            attachments: [],
            headers: {},
            bodyHtml: '<div>' + 'x'.repeat(200) + '</div>',
            bodyText: 'large',
          },
        };
      }
      throw new Error(`unexpected channel ${channel}`);
    },
  };

  await store.load(api, { accountId: 1, uid: 9, folder: 'INBOX' });
  assert(!store.has({ accountId: 1, uid: 9, folder: 'INBOX' }), '瓒呭ぇ姝ｆ枃涓嶅簲闀挎湡椹荤暀鍦?renderer 鍐呭瓨');
  await store.load(api, { accountId: 1, uid: 9, folder: 'INBOX' });
  assert(fetchFullCalls === 2, '瓒呭ぇ姝ｆ枃搴斾粎渚濊禆鏈湴/IMAP 鍔犺浇锛屼笉鍛戒腑鍐呭瓨');
}

async function testMailCacheRefreshQueueDedupesSameKey() {
  const queue = new MailCacheRefreshQueue(0);
  let callCount = 0;

  await Promise.all([
    queue.schedule('1:INBOX', async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }),
    queue.schedule('1:INBOX', async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }),
  ]);

  assert(callCount === 1, '同一个 folder 的缓存刷新应被队列去重');

  await queue.schedule('1:INBOX', async () => {
    callCount += 1;
  });

  assert(callCount === 2, '上一轮完成后，同一个 key 应允许下一次刷新');
  queue.dispose();
}

async function testBodyPrefetchCandidatesRespectLimit() {
  const now = Date.now();
  const mails = Array.from({ length: 20 }, (_, index) => ({
    id: `mail-${index}`,
    uid: index + 1,
    accountId: 1,
    folder: 'INBOX',
    date: new Date(now - index * 60 * 1000),
  }));

  const picked = pickBodyPrefetchCandidates(mails, {
    historyRange: '1mo',
    cacheRange: '1mo',
    limit: 5,
    now,
  });

  assert(picked.length === 5, '正文预取候选必须遵守 limit，避免刷新时把整页邮件正文全部排队');
  assert(picked[0].id === 'mail-0' && picked[4].id === 'mail-4', '正文预取候选应优先选择最新邮件');
}

async function testRefreshDoesNotQueueSecondFullSync() {
  const app = fs.readFileSync(path.join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
  const useMail = fs.readFileSync(path.join(process.cwd(), 'src/renderer/hooks/useMail.ts'), 'utf8');
  const mailService = fs.readFileSync(path.join(process.cwd(), 'src/main/services/mailService.ts'), 'utf8');

  assert(app.includes('refreshPending.current = false;\n      return;'), '刷新进行中再次点击应直接忽略，不能排第二次全量刷新');
  assert(!app.includes('await fetchMails({ manual: true });\n    }\n  };'), 'handleRefresh 不应在一次刷新结束后立即再执行 pending 刷新');
  assert(!useMail.includes('void scheduleCachedFolderRefresh(accountId, folder, options?.historyRange).catch'), '同步成功后不应再整文件夹 loadCached，避免重复大批量读缓存');
  assert(mailService.includes('HISTORY_SYNC_COMPLETE_PREFIX'), '主进程应记录历史同步完成标记，用于后续增量同步');
  assert(mailService.includes('!isHistorySyncComplete(accountId, folder, historyRange, cacheRange)'), '手动历史同步应只在未完成时走分段全量');
}

async function testRefreshAvoidsBulkBodyAndCompletedHistoryResync() {
  const mailService = fs.readFileSync(path.join(process.cwd(), 'src/main/services/mailService.ts'), 'utf8');
  const app = fs.readFileSync(path.join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
  assert(mailService.includes('getLatestCachedMailTimestamp'), '普通刷新应基于本地最新缓存邮件时间做增量拉取，而不是反复按历史范围全量扫描');
  assert(mailService.includes('INCREMENTAL_SYNC_SAFETY_MS'), '增量拉取应保留安全回看窗口，避免边界时间漏信');
  assert(mailService.includes('historySince: querySince'), 'IMAP 拉取应统一使用历史补拉或增量 since 条件');
  assert(app.includes('forceHistoryRange: options?.forceHistoryRange === true'), '手动刷新不应默认强制历史补拉，只有明确请求时才 forceHistoryRange');
  assert(mailService.includes('forceHistoryRange: false,'), '历史同步完成后，手动刷新也应该回到增量路径');
  assert(!mailService.includes('const aggregated: MailSummary[] = [];'), 'IMAP 分页同步不应该在内存中聚合所有远程邮件');
  assert(mailService.includes('new AbortController()'), '同步超时后应该中止底层分页循环，避免僵尸同步继续拉取');
  assert(mailService.includes('signal?.aborted'), 'IMAP 分页循环应该检查 abort 信号');
  const loadCachedMailsSection = mailService.slice(
    mailService.indexOf('function getCachedMails'),
    mailService.indexOf('function getCachedMailRecordsWithBodies'),
  );
  assert(!loadCachedMailsSection.includes('body_html') && !loadCachedMailsSection.includes('body_text'), '列表缓存读取不应该把 body_html/body_text 批量带入 renderer');
}

async function testMailCacheRangeDoesNotPruneListRows() {
  const mailService = fs.readFileSync(path.join(process.cwd(), 'src/main/services/mailService.ts'), 'utf8');
  const pruneSection = mailService.slice(
    mailService.indexOf('export function pruneCachedMailStore'),
    mailService.indexOf('function getConfiguredMailCacheRange'),
  );

  assert(pruneSection.includes('SET body_html = NULL, body_text = NULL'), '邮件缓存范围只能清理正文缓存，不能删除列表元数据');
  assert(!pruneSection.includes('DELETE FROM mail_cache'), '邮件缓存范围不应删除 mail_cache 行，否则会影响列表显示范围');
  assert(mailService.includes('const stages = buildHistoryStages(historyRange);'), '邮件历史范围应独立控制列表补拉范围，不能被正文缓存范围夹断');
  assert(mailService.includes('getLegacyHistorySyncCompleteKey'), '历史同步完成标记应兼容旧 key，避免升级后无意义全量补拉');
}

async function testHistoryRangeChangeReloadsAfterForcedSync() {
  const app = fs.readFileSync(path.join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
  const handlerStart = app.indexOf('const handleMailHistoryRangeChange');
  const handlerEnd = app.indexOf('const handleMailCacheRangeChange');
  const handlerSection = app.slice(handlerStart, handlerEnd);

  const firstReloadIndex = handlerSection.indexOf('await reloadCurrentViewForHistoryRange(range);');
  const syncIndex = handlerSection.indexOf('await syncMails(account.id, folderPath');
  const lastReloadIndex = handlerSection.lastIndexOf('await reloadCurrentViewForHistoryRange(range);');

  assert(firstReloadIndex !== -1, '历史范围切换时应先用新范围重载本地列表');
  assert(syncIndex !== -1, '历史范围切换时应触发一次明确的历史补拉');
  assert(lastReloadIndex > syncIndex, '历史补拉完成后必须再次重载缓存，否则 UI 可能仍停留在旧的一个月列表');
}

async function testLocalDraftsHydrateFromCache() {
  const app = fs.readFileSync(path.join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
  const preload = fs.readFileSync(path.join(process.cwd(), 'src/preload/index.ts'), 'utf8');
  const ipc = fs.readFileSync(path.join(process.cwd(), 'src/main/ipc/mail.ts'), 'utf8');
  const mailService = fs.readFileSync(path.join(process.cwd(), 'src/main/services/mailService.ts'), 'utf8');

  assert(mailService.includes('export function loadCachedLocalDrafts'), '本地草稿应有独立缓存加载入口，不能只依赖当前 renderer 状态');
  assert(mailService.includes('local_draft_id IS NOT NULL OR draft_payload IS NOT NULL'), '草稿缓存加载应识别稳定本地草稿主键和 draftPayload');
  assert(ipc.includes("ipcMain.handle('mail:loadLocalDrafts'"), '主进程应暴露本地草稿加载 IPC');
  assert(preload.includes("'mail:loadLocalDrafts'"), 'preload 白名单应允许本地草稿加载 IPC');
  assert(app.includes("window.electronAPI.invoke('mail:loadLocalDrafts')"), 'App 启动后应从本地缓存恢复草稿列表');
  assert(app.includes('buildComposeDraftOptionFromMail'), '恢复草稿时应复用 draftPayload，包括引用原文');
}

async function run() {
  await testSyncFoldersAreNarrowed();
  await testSharedMailBodyStoreDedupesInflightAndCachesResult();
  await testSharedMailBodyStoreEvictsOldEntries();
  await testSharedMailBodyStoreSkipsOversizedMemoryEntries();
  await testMailCacheRefreshQueueDedupesSameKey();
  await testBodyPrefetchCandidatesRespectLimit();
  await testRefreshDoesNotQueueSecondFullSync();
  await testRefreshAvoidsBulkBodyAndCompletedHistoryResync();
  await testMailCacheRangeDoesNotPruneListRows();
  await testHistoryRangeChangeReloadsAfterForcedSync();
  await testLocalDraftsHydrateFromCache();
  console.log('mail performance regression tests passed');
}

void run();
