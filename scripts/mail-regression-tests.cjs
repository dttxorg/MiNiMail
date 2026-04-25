const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadTsModule(filePath, overrides = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const moduleShim = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(overrides, specifier)) {
      return overrides[specifier];
    }
    return require(specifier);
  };

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled.outputText);
  fn(moduleShim.exports, localRequire, moduleShim, filePath, path.dirname(filePath));
  return moduleShim.exports;
}

function createFakeBetterSqlite3() {
  const rows = [];

  function sortRowsDescByUid(items) {
    return [...items].sort((left, right) => right.uid - left.uid);
  }

  function applyDateCutoff(items, cutoffIso) {
    const cutoff = new Date(cutoffIso).getTime();
    return items.filter((row) => new Date(row.date).getTime() < cutoff);
  }

  return class FakeDatabase {
    pragma() {}

    exec() {}

    close() {}

    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      return {
        all: (...args) => {
          if (normalized.includes('SELECT uid FROM mail_cache WHERE account_id = ? AND folder = ?')) {
            const [accountId, folder] = args;
            return rows
              .filter((row) => row.account_id === accountId && row.folder === folder)
              .map((row) => ({ uid: row.uid }));
          }

          if (normalized.includes('FROM mail_cache WHERE account_id = ? AND folder = ?')) {
            const [accountId, folder, limit] = args;
            const matching = sortRowsDescByUid(
              rows.filter((row) => row.account_id === accountId && row.folder === folder),
            );
            return typeof limit === 'number' ? matching.slice(0, limit) : matching;
          }

          return [];
        },

        get: (...args) => {
          if (normalized.includes('SELECT snippet, message_id, in_reply_to, references_header, body_html, body_text, category')) {
            const [accountId, folder, uid] = args;
            const row = rows.find((entry) => entry.account_id === accountId && entry.folder === folder && entry.uid === uid);
            if (!row) return undefined;
            return {
              snippet: row.snippet,
              message_id: row.message_id,
              in_reply_to: row.in_reply_to,
              references_header: row.references_header,
              body_html: row.body_html,
              body_text: row.body_text,
              category: row.category,
            };
          }

          if (normalized.includes('SELECT body_html, body_text FROM mail_cache WHERE account_id = ? AND folder = ? AND uid = ?')) {
            const [accountId, folder, uid] = args;
            const row = rows.find((entry) => entry.account_id === accountId && entry.folder === folder && entry.uid === uid);
            if (!row) return undefined;
            return {
              body_html: row.body_html,
              body_text: row.body_text,
            };
          }

          return undefined;
        },

        run: (...args) => {
          if (normalized.startsWith('INSERT OR REPLACE INTO mail_cache')) {
            const [params] = args;
            const nextRow = {
              id: params.id,
              uid: params.uid,
              from: params.from,
              from_name: params.fromName,
              to: params.to,
              subject: params.subject,
              date: params.date,
              snippet: params.snippet,
              has_attachments: params.hasAttachments,
              is_read: params.isRead,
              is_starred: params.isStarred,
              folder: params.folder,
              account_id: params.accountId,
              cached_at: params.cachedAt,
              message_id: params.messageId ?? null,
              in_reply_to: params.inReplyTo ?? null,
              references_header: params.references ?? null,
              body_html: params.bodyHtml ?? null,
              body_text: params.bodyText ?? null,
              category: params.category ?? null,
            };
            const existingIndex = rows.findIndex(
              (row) =>
                row.id === nextRow.id ||
                (row.account_id === nextRow.account_id && row.folder === nextRow.folder && row.uid === nextRow.uid),
            );
            if (existingIndex >= 0) {
              rows.splice(existingIndex, 1, nextRow);
            } else {
              rows.push(nextRow);
            }
            return { changes: 1 };
          }

          if (normalized.includes('DELETE FROM mail_cache WHERE account_id = ? AND folder = ? AND datetime(date) < datetime(?)')) {
            const [accountId, folder, cutoffIso] = args;
            const doomed = applyDateCutoff(
              rows.filter((row) => row.account_id === accountId && row.folder === folder),
              cutoffIso,
            );
            for (const row of doomed) {
              const index = rows.indexOf(row);
              if (index >= 0) rows.splice(index, 1);
            }
            return { changes: doomed.length };
          }

          if (normalized.includes('DELETE FROM mail_cache WHERE account_id = ? AND datetime(date) < datetime(?)')) {
            const [accountId, cutoffIso] = args;
            const doomed = applyDateCutoff(
              rows.filter((row) => row.account_id === accountId),
              cutoffIso,
            );
            for (const row of doomed) {
              const index = rows.indexOf(row);
              if (index >= 0) rows.splice(index, 1);
            }
            return { changes: doomed.length };
          }

          if (normalized.includes('DELETE FROM mail_cache WHERE datetime(date) < datetime(?)')) {
            const [cutoffIso] = args;
            const doomed = applyDateCutoff(rows, cutoffIso);
            for (const row of doomed) {
              const index = rows.indexOf(row);
              if (index >= 0) rows.splice(index, 1);
            }
            return { changes: doomed.length };
          }

          if (normalized.includes('DELETE FROM mail_cache WHERE id = ?')) {
            const [id] = args;
            const before = rows.length;
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              if (rows[index].id === id) rows.splice(index, 1);
            }
            return { changes: before - rows.length };
          }

          return { changes: 0 };
        },
      };
    }
  };
}

function recordStage(progress, nextStage) {
  progress.push(nextStage);
  return progress;
}

function createMailIpcModule(overrides = {}) {
  const subscribeState = {
    listener: null,
    unsubscribeCalls: 0,
  };
  const handles = new Map();
  const appState = {
    beforeQuitListener: null,
  };
  const sendCalls = [];

  const module = loadTsModule(path.join(process.cwd(), 'src', 'main', 'ipc', 'mail.ts'), {
    electron: {
      BrowserWindow: {
        getAllWindows: () => (overrides.windows ?? [
          {
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              send: (_channel, payload) => sendCalls.push(payload.stageRange),
            },
          },
          {
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              send: () => {
                throw new Error('window send failed');
              },
            },
          },
        ]),
      },
      ipcMain: {
        handle: (channel, handler) => handles.set(channel, handler),
      },
      app: {
        once: (event, listener) => {
          if (event === 'before-quit') appState.beforeQuitListener = listener;
        },
        removeListener: (event, listener) => {
          if (event === 'before-quit' && appState.beforeQuitListener === listener) {
            appState.beforeQuitListener = null;
          }
        },
      },
    },
    'electron-log': {
      __esModule: true,
      default: logStub,
      ...logStub,
    },
    '../services/mail': {
      fetchMailList: async () => [],
      fetchMailDetail: async () => null,
      getMailFolders: async () => [],
      setMessageFlags: async () => undefined,
      setMessageStarred: async () => undefined,
      setMessageRead: async () => undefined,
      deleteMessage: async () => undefined,
      moveMessage: async () => undefined,
    },
    '../services/mailService': {
      syncMails: async () => ({ newMails: [], totalCached: 0, errors: [] }),
      subscribeStagedSyncProgress: (listener) => {
        subscribeState.listener = listener;
        return () => {
          subscribeState.unsubscribeCalls += 1;
          subscribeState.listener = null;
        };
      },
      fetchFullMessage: async () => null,
      getFolders: async () => [],
      loadCachedMails: () => [],
      pruneCachedMailStore: () => 0,
      getCachedBody: () => null,
      updateCachedMailCategory: () => undefined,
      updateCachedMailRead: () => undefined,
      updateCachedMailStar: () => undefined,
      saveLocalMailToCache: () => undefined,
      deleteCachedMailById: () => undefined,
    },
    '../services/mailBackup': {
      cancelMailBackupTask: () => true,
      exportMailsToEml: async () => ({}),
      importMailsFromEml: async () => ({}),
    },
    '../services/smtp': {
      sendMail: async () => undefined,
      testSmtpConnection: async () => ({ success: true }),
    },
    '../database': {
      getAccountById: () => null,
    },
  });

  return { module, subscribeState, appState, handles, sendCalls };
}

function createMailHistoryRangeModule(syncSettingsModule) {
  return loadTsModule(path.join(process.cwd(), 'src', 'renderer', 'utils', 'mailHistoryRange.ts'), {
    '../../shared/mailSyncSettings': syncSettingsModule,
  });
}

const mailFoldersPath = path.join(process.cwd(), 'src', 'shared', 'mailFolders.ts');
const {
  folderKindFromPath,
  folderMatches,
  getAiLanguageFromAppLanguage,
} = loadTsModule(mailFoldersPath);

const mailSyncSettingsPath = path.join(process.cwd(), 'src', 'shared', 'mailSyncSettings.ts');
const mailSyncSettings = loadTsModule(mailSyncSettingsPath);
const { buildHistoryStages } = mailSyncSettings;
const { buildBodyCacheStages } = mailSyncSettings;
const { formatStagedHistoryLabel } = createMailHistoryRangeModule(mailSyncSettings);

const mailServicePath = path.join(process.cwd(), 'src', 'main', 'services', 'mailService.ts');
const fetchMailListCalls = [];
let fetchMailListImpl = async (accountId, folder, options = {}) => {
  fetchMailListCalls.push({ accountId, folder, options });
  const uid = fetchMailListCalls.length;
  return [{
    id: `mail-${uid}`,
    uid,
    from: 'sender@example.com',
    fromName: 'Sender',
    to: 'receiver@example.com',
    subject: `Mail ${uid}`,
    date: new Date().toISOString(),
    flags: [],
    snippet: `Snippet ${uid}`,
    hasAttachments: false,
    isRead: false,
    isStarred: false,
    messageId: `<mail-${uid}@example.com>`,
    inReplyTo: undefined,
  }];
};
let fetchMailDetailImpl = async () => {
  throw new Error('not implemented');
};
const logStub = { info() {}, warn() {}, error() {} };
const mailService = loadTsModule(mailServicePath, {
  electron: {
    Notification: class Notification {
      on() {}
      show() {}
    },
    BrowserWindow: {
      getAllWindows: () => [],
    },
    app: {
      getPath: () => process.cwd(),
    },
  },
  'electron-log': {
    __esModule: true,
    default: logStub,
    ...logStub,
  },
  './mail': {
    fetchMailList: async (...args) => fetchMailListImpl(...args),
    fetchMailDetail: async (...args) => fetchMailDetailImpl(...args),
    getMailFolders: async () => [],
  },
  '../database': {
    getAccountById: () => ({ email: 'sender@example.com' }),
    getAccountCredentials: () => null,
    getSetting: (key) => {
      if (key === 'mail_cache_range') return 'all';
      if (key === 'app_language') return 'en';
      return null;
    },
  },
  './mailNotification': {
    buildLocalizedMailNotificationContent: () => ({ title: '', body: '' }),
    buildMailNotificationKey: () => 'mail-key',
    shouldNotifyMail: () => false,
  },
  '../../shared/mailSyncSettings': mailSyncSettings,
  'better-sqlite3': createFakeBetterSqlite3(),
});

const {
  fetchFullMessage,
  getCachedBody,
  loadCachedMails,
  saveLocalMailToCache,
  subscribeStagedSyncProgress,
  syncMails,
} = mailService;

assert.strictEqual(folderKindFromPath('INBOX'), 'inbox');
assert.strictEqual(folderKindFromPath('Sent Items'), 'sent');
assert.strictEqual(folderKindFromPath('Drafts'), 'drafts');
assert.strictEqual(folderKindFromPath('Deleted Items'), 'trash');
assert.strictEqual(folderKindFromPath('Junk'), 'spam');
assert.strictEqual(folderKindFromPath('Archive'), 'archive');
assert.strictEqual(folderKindFromPath('[Gmail]/All Mail'), 'archive');

assert.strictEqual(folderMatches('Sent Items', 'sent'), true);
assert.strictEqual(folderMatches('Deleted Items', 'trash'), true);
assert.strictEqual(folderMatches('INBOX', 'sent'), false);

assert.strictEqual(getAiLanguageFromAppLanguage('zh'), 'Chinese');
assert.strictEqual(getAiLanguageFromAppLanguage('ja'), 'Japanese');
assert.strictEqual(getAiLanguageFromAppLanguage('en'), 'English');

assert.deepStrictEqual(
  buildHistoryStages('all'),
  ['7d', '15d', '1mo', '6mo', '1y', 'all'],
);
assert.deepStrictEqual(buildBodyCacheStages('7d', 'all'), ['3d', '7d']);
assert.deepStrictEqual(buildBodyCacheStages('all', '7d'), ['3d', '7d']);
assert.deepStrictEqual(buildBodyCacheStages('6mo', '1mo'), ['3d', '7d', '15d', '1mo']);

assert.strictEqual(typeof subscribeStagedSyncProgress, 'function');

async function testStagedSyncProgress() {
  fetchMailListCalls.length = 0;
  fetchMailListImpl = async (accountId, folder, options = {}) => {
    fetchMailListCalls.push({ accountId, folder, options });
    const uid = fetchMailListCalls.length;
    return [{
      id: `mail-${uid}`,
      uid,
      from: 'sender@example.com',
      fromName: 'Sender',
      to: 'receiver@example.com',
      subject: `Mail ${uid}`,
      date: new Date().toISOString(),
      flags: [],
      snippet: `Snippet ${uid}`,
      hasAttachments: false,
      isRead: false,
      isStarred: false,
      messageId: `<mail-${uid}@example.com>`,
      inReplyTo: undefined,
    }];
  };
  const progress = [];
  const unsubscribe = subscribeStagedSyncProgress((nextStage) => {
    recordStage(progress, nextStage);
  });

  await syncMails(42, 'INBOX', {
    notify: false,
    historyRange: 'all',
    forceHistoryRange: true,
  });

  unsubscribe();

  assert.deepStrictEqual(
    [...new Set(progress.map((item) => item.stageRange))],
    ['7d', '15d', '1mo', '6mo', '1y', 'all'],
  );
  assert.strictEqual(progress.at(-1).done, true);
  assert.strictEqual(fetchMailListCalls.length, 6);
}

async function testListenerIsolation() {
  fetchMailListCalls.length = 0;
  fetchMailListImpl = async (accountId, folder, options = {}) => {
    fetchMailListCalls.push({ accountId, folder, options });
    const uid = fetchMailListCalls.length;
    return [{
      id: `mail-${uid}`,
      uid,
      from: 'sender@example.com',
      fromName: 'Sender',
      to: 'receiver@example.com',
      subject: `Mail ${uid}`,
      date: new Date().toISOString(),
      flags: [],
      snippet: `Snippet ${uid}`,
      hasAttachments: false,
      isRead: false,
      isStarred: false,
      messageId: `<mail-${uid}@example.com>`,
      inReplyTo: undefined,
    }];
  };
  const progress = [];
  const unsubscribeBad = subscribeStagedSyncProgress(() => {
    throw new Error('listener failure');
  });
  const unsubscribeGood = subscribeStagedSyncProgress((nextStage) => {
    recordStage(progress, nextStage);
  });

  await syncMails(43, 'Archive', {
    notify: false,
    historyRange: '15d',
    forceHistoryRange: true,
  });

  unsubscribeBad();
  unsubscribeGood();

  assert.deepStrictEqual([...new Set(progress.map((item) => item.stageRange))], ['7d', '15d']);
}

async function testPagedHistorySyncFlushesCacheBeforeStageCompletes() {
  fetchMailListCalls.length = 0;
  saveLocalMailToCache({
    id: 'reset-1',
    uid: 1,
    from: 'reset@example.com',
    fromName: 'Reset',
    to: 'receiver@example.com',
    subject: 'reset',
    date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    snippet: 'reset',
    hasAttachments: false,
    isRead: false,
    isStarred: false,
    folder: 'INBOX',
    accountId: 99,
    cachedAt: new Date().toISOString(),
  });

  let secondPageSawCachedRows = 0;
  fetchMailListImpl = async (accountId, folder, options = {}) => {
    fetchMailListCalls.push({ accountId, folder, options });
    if (fetchMailListCalls.length === 1) {
      return Array.from({ length: 200 }, (_value, index) => ({
        id: `paged-${index + 1}`,
        uid: index + 1,
        from: 'sender@example.com',
        fromName: 'Sender',
        to: 'receiver@example.com',
        subject: `Paged ${index + 1}`,
        date: new Date().toISOString(),
        flags: [],
        snippet: `Snippet ${index + 1}`,
        hasAttachments: false,
        isRead: false,
        isStarred: false,
        messageId: `<paged-${index + 1}@example.com>`,
        inReplyTo: undefined,
      }));
    }

    secondPageSawCachedRows = loadCachedMails(accountId, folder, '7d').length;
    return [];
  };

  await syncMails(99, 'INBOX', {
    notify: false,
    historyRange: '7d',
    forceHistoryRange: true,
  });

  assert.ok(secondPageSawCachedRows > 0, 'expected first page to be cached before next page request');
}

async function testCachedBodyRespectsFolderScope() {
  saveLocalMailToCache({
    id: 'inbox-1',
    uid: 900,
    from: 'sender@example.com',
    fromName: 'Sender',
    to: 'receiver@example.com',
    subject: 'Inbox copy',
    date: new Date().toISOString(),
    snippet: 'Inbox snippet',
    hasAttachments: false,
    isRead: false,
    isStarred: false,
    folder: 'INBOX',
    accountId: 7,
    cachedAt: new Date().toISOString(),
    bodyText: 'inbox body',
  });
  saveLocalMailToCache({
    id: 'archive-1',
    uid: 900,
    from: 'sender@example.com',
    fromName: 'Sender',
    to: 'receiver@example.com',
    subject: 'Archive copy',
    date: new Date().toISOString(),
    snippet: 'Archive snippet',
    hasAttachments: false,
    isRead: false,
    isStarred: false,
    folder: 'Archive',
    accountId: 7,
    cachedAt: new Date().toISOString(),
    bodyText: 'archive body',
  });

  assert.deepStrictEqual(getCachedBody(7, 900, 'Archive'), { bodyHtml: undefined, bodyText: 'archive body' });
  assert.deepStrictEqual(getCachedBody(7, 900, 'INBOX'), { bodyHtml: undefined, bodyText: 'inbox body' });
}

async function testFetchFullPreservesExistingSnippet() {
  saveLocalMailToCache({
    id: 'snippet-1',
    uid: 901,
    from: 'sender@example.com',
    fromName: 'Sender',
    to: 'receiver@example.com',
    subject: 'Snippet subject',
    date: new Date().toISOString(),
    snippet: 'Keep this preview',
    hasAttachments: false,
    isRead: false,
    isStarred: false,
    folder: 'INBOX',
    accountId: 8,
    cachedAt: new Date().toISOString(),
  });

  fetchMailDetailImpl = async () => ({
    id: 'snippet-1',
    uid: 901,
    from: 'sender@example.com',
    fromName: 'Sender',
    to: 'receiver@example.com',
    subject: 'Snippet subject',
    date: new Date().toISOString(),
    bodyHtml: '<p>Full body</p>',
    bodyText: 'Full body',
    flags: [],
    attachments: [],
  });

  await fetchFullMessage(8, 901, 'INBOX');

  const [cachedMail] = loadCachedMails(8, 'INBOX');
  assert.strictEqual(cachedMail.snippet, 'Keep this preview');
}

function testMailIpcForwarderTeardownAndWindowIsolation() {
  const { module, subscribeState, appState, sendCalls } = createMailIpcModule();
  module.registerMailHandlers();

  assert.strictEqual(typeof subscribeState.listener, 'function');
  assert.strictEqual(typeof appState.beforeQuitListener, 'function');

  subscribeState.listener({
    accountId: 1,
    folder: 'INBOX',
    stageRange: '7d',
    loadedCount: 1,
    stageIndex: 0,
    totalStages: 1,
    done: true,
  });

  assert.deepStrictEqual(sendCalls, ['7d']);

  appState.beforeQuitListener();
  assert.strictEqual(subscribeState.unsubscribeCalls, 1);
  assert.strictEqual(subscribeState.listener, null);
}

function testStagedHistoryLabels() {
  assert.strictEqual(formatStagedHistoryLabel('7d', 'zh'), '正在同步最近 7 天 邮件');
  assert.strictEqual(formatStagedHistoryLabel('1mo', 'en'), 'Expanding sync to 1 month');
}

Promise.resolve()
  .then(() => testStagedSyncProgress())
  .then(() => testListenerIsolation())
  .then(() => testPagedHistorySyncFlushesCacheBeforeStageCompletes())
  .then(() => testCachedBodyRespectsFolderScope())
  .then(() => testFetchFullPreservesExistingSnippet())
  .then(() => testMailIpcForwarderTeardownAndWindowIsolation())
  .then(() => testStagedHistoryLabels())
  .then(() => {
    console.log('mail regression tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
