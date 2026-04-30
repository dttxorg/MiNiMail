const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
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
  const tombstones = [];

  function toStoredRow(params) {
    return {
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
      draft_payload: params.draftPayload ?? null,
      local_draft_id: params.localDraftId ?? null,
      local_send_id: params.localSendId ?? null,
      category: params.category ?? null,
      is_scanned: params.isScanned ?? 0,
      scan_result: params.scanResult ?? null,
      delivery_state: params.deliveryState ?? null,
      delivery_error: params.deliveryError ?? null,
    };
  }

  function rowToCacheSelection(row) {
    if (!row) return undefined;
    return {
      id: row.id,
      uid: row.uid,
      snippet: row.snippet,
      message_id: row.message_id,
      in_reply_to: row.in_reply_to,
      references_header: row.references_header,
      body_html: row.body_html,
      body_text: row.body_text,
      draft_payload: row.draft_payload,
      local_draft_id: row.local_draft_id,
      local_send_id: row.local_send_id,
      category: row.category,
      is_scanned: row.is_scanned,
      scan_result: row.scan_result,
      delivery_state: row.delivery_state,
      delivery_error: row.delivery_error,
    };
  }

  return class FakeDatabase {
    pragma() {}
    exec() {}
    close() {}
    transaction(fn) {
      return (...args) => fn(...args);
    }

    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      return {
        all: (...args) => {
          if (normalized.includes('SELECT id, message_id, local_draft_id')) {
            return rows.map((row) => ({
              id: row.id,
              message_id: row.message_id,
              local_draft_id: row.local_draft_id,
            }));
          }

          if (normalized.includes('FROM mail_cache WHERE account_id = ? AND folder = ?')) {
            const [accountId, folder] = args;
            return rows
              .filter((row) => row.account_id === accountId && row.folder === folder)
              .sort((left, right) => right.uid - left.uid);
          }

          return [];
        },

        get: (...args) => {
          if (normalized.includes('FROM mail_draft_tombstones') && normalized.includes('WHERE local_draft_id = ?')) {
            const [localDraftId] = args;
            return tombstones.find((entry) => entry.local_draft_id === localDraftId) ? { 1: 1 } : undefined;
          }

          if (normalized.includes('FROM mail_draft_tombstones') && normalized.includes('WHERE account_id = ? AND folder = ? AND uid = ?')) {
            const [accountId, folder, uid] = args;
            return tombstones.find(
              (entry) => entry.account_id === accountId && entry.folder === folder && entry.uid === uid,
            )
              ? { 1: 1 }
              : undefined;
          }

          if (normalized.includes('FROM mail_draft_tombstones') && normalized.includes('WHERE account_id = ? AND folder = ? AND message_id = ?')) {
            const [accountId, folder, messageId] = args;
            return tombstones.find(
              (entry) => entry.account_id === accountId && entry.folder === folder && entry.message_id === messageId,
            )
              ? { 1: 1 }
              : undefined;
          }

          if (normalized.includes('WHERE account_id = ? AND folder = ? AND uid = ?')) {
            const [accountId, folder, uid] = args;
            const row = rows.find((entry) => entry.account_id === accountId && entry.folder === folder && entry.uid === uid);

            if (normalized.startsWith('SELECT body_html, body_text')) {
              return row ? { body_html: row.body_html, body_text: row.body_text } : undefined;
            }

            return rowToCacheSelection(row);
          }

          if (normalized.includes('WHERE account_id = ? AND folder = ? AND message_id = ?')) {
            const [accountId, folder, messageId] = args;
            const matches = rows
              .filter((entry) => entry.account_id === accountId && entry.folder === folder && entry.message_id === messageId)
              .sort((left, right) => {
                const leftHasBody = left.body_html || left.body_text ? 0 : 1;
                const rightHasBody = right.body_html || right.body_text ? 0 : 1;
                if (leftHasBody !== rightHasBody) return leftHasBody - rightHasBody;
                return String(right.cached_at).localeCompare(String(left.cached_at));
              });
            return rowToCacheSelection(matches[0]);
          }

          return undefined;
        },

        run: (...args) => {
          if (normalized.startsWith('INSERT INTO mail_draft_tombstones')) {
            const [params] = args;
            tombstones.push({
              account_id: params.accountId ?? null,
              folder: params.folder ?? null,
              uid: params.uid ?? null,
              message_id: params.messageId ?? null,
              local_draft_id: params.localDraftId ?? null,
              deleted_at: params.deletedAt,
            });
            return { changes: 1 };
          }

          if (normalized.startsWith('INSERT OR REPLACE INTO mail_cache')) {
            const [params] = args;
            const nextRow = toStoredRow(params);
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

          if (normalized.startsWith('DELETE FROM mail_cache WHERE account_id = ? AND folder = ? AND message_id = ?')) {
            const [accountId, folder, messageId, uid] = args;
            let changes = 0;
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              const row = rows[index];
              if (
                row.account_id === accountId &&
                row.folder === folder &&
                row.message_id === messageId &&
                (uid === undefined || row.uid !== uid) &&
                row.local_draft_id == null
              ) {
                rows.splice(index, 1);
                changes += 1;
              }
            }
            return { changes };
          }

          if (normalized.startsWith('DELETE FROM mail_cache WHERE account_id = ? AND folder = ? AND uid = ?')) {
            const [accountId, folder, uid] = args;
            let changes = 0;
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              const row = rows[index];
              if (row.account_id === accountId && row.folder === folder && row.uid === uid) {
                rows.splice(index, 1);
                changes += 1;
              }
            }
            return { changes };
          }

          if (normalized.startsWith('DELETE FROM mail_cache WHERE local_draft_id = ?')) {
            const [localDraftId] = args;
            let changes = 0;
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              if (rows[index].local_draft_id === localDraftId) {
                rows.splice(index, 1);
                changes += 1;
              }
            }
            return { changes };
          }

          if (normalized.startsWith('DELETE FROM mail_cache WHERE id = ?')) {
            const [id] = args;
            let changes = 0;
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              if (rows[index].id === id) {
                rows.splice(index, 1);
                changes += 1;
              }
            }
            return { changes };
          }

          if (normalized.startsWith('UPDATE mail_cache SET local_draft_id = ? WHERE id = ?')) {
            const [localDraftId, id] = args;
            const row = rows.find((entry) => entry.id === id);
            if (row) row.local_draft_id = localDraftId;
            return { changes: row ? 1 : 0 };
          }

          return { changes: 0 };
        },
      };
    }
  };
}

const logStub = { info() {}, warn() {}, error() {} };
const mailSyncSettings = loadTsModule(path.join(process.cwd(), 'src', 'shared', 'mailSyncSettings.ts'));
const mailDraftIdentity = loadTsModule(path.join(process.cwd(), 'src', 'shared', 'mailDraftIdentity.ts'));
const mailCacheQuery = loadTsModule(path.join(process.cwd(), 'src', 'shared', 'mailCacheQuery.ts'));
const mailFolders = loadTsModule(path.join(process.cwd(), 'src', 'shared', 'mailFolders.ts'));
const mailService = loadTsModule(path.join(process.cwd(), 'src', 'main', 'services', 'mailService.ts'), {
  electron: {
    Notification: class Notification { on() {} show() {} },
    BrowserWindow: { getAllWindows: () => [] },
    app: {
      getPath: () => process.cwd(),
      once: () => undefined,
    },
  },
  'electron-log': {
    __esModule: true,
    default: logStub,
    ...logStub,
  },
  './mail': {
    fetchMailList: async () => [],
    fetchMailDetail: async () => null,
    getMailFolders: async () => [],
  },
  '../database': {
    getAccountById: () => ({ email: 'sender@example.com' }),
    getAccountCredentials: () => null,
    getSetting: (key) => (key === 'mail_cache_range' ? 'all' : null),
    setSetting: () => undefined,
  },
  './mailNotification': {
    buildLocalizedMailNotificationContent: () => ({ title: '', body: '' }),
    buildMailNotificationKey: () => 'mail-key',
    shouldNotifyMail: () => false,
  },
  '../brand': {
    getMailNotificationIconPath: () => '',
  },
  '../../shared/mailSyncSettings': mailSyncSettings,
  '../../shared/mailDraftIdentity': mailDraftIdentity,
  '../../shared/mailCacheQuery': mailCacheQuery,
  '../../shared/mailFolders': mailFolders,
  'better-sqlite3': createFakeBetterSqlite3(),
});

const { saveLocalMailToCache, getCachedBody, loadCachedMails, loadCachedLocalDrafts, deleteCachedDraft } = mailService;

function baseMail(overrides = {}) {
  return {
    id: 'mail-id',
    uid: 1,
    from: 'sender@example.com',
    fromName: 'Sender',
    to: 'receiver@example.com',
    subject: 'Fwd: Project update',
    date: '2026-04-25T10:00:00.000Z',
    snippet: 'Forwarded message preview',
    hasAttachments: false,
    isRead: true,
    isStarred: false,
    folder: 'Sent',
    accountId: 1,
    cachedAt: '2026-04-25T10:00:00.000Z',
    messageId: '<smtp-forward-1@example.com>',
    ...overrides,
  };
}

function testSentSyncCopiesLocalComposeBodyByMessageId() {
  saveLocalMailToCache(baseMail({
    id: '1:<local-forward@minimail>',
    uid: 1700000000000,
    bodyText: 'Hello\n\n---------- Forwarded message ----------\nOriginal body',
    bodyHtml: '<p>Hello</p><img src="https://tracker.example/pixel.png"><blockquote>Original body</blockquote>',
  }));

  saveLocalMailToCache(baseMail({
    id: '1:server-sent-uid-42',
    uid: 42,
    snippet: 'Forwarded message preview from server',
  }));

  const cachedBody = getCachedBody(1, 42, 'Sent');
  assert.strictEqual(cachedBody.bodyText.includes('Forwarded message'), true);
  assert.strictEqual(cachedBody.bodyHtml.includes('tracker.example'), true);
}

function testSentBodyTextFallbackIsPersistedWhenHtmlMissing() {
  saveLocalMailToCache(baseMail({
    id: '1:server-text-only',
    uid: 43,
    messageId: '<text-only@example.com>',
    bodyText: 'Plain sent body survives without HTML',
  }));

  assert.deepStrictEqual(getCachedBody(1, 43, 'Sent'), {
    bodyHtml: undefined,
    bodyText: 'Plain sent body survives without HTML',
  });
}

function testForwardSentRowDoesNotReuseOriginalMailIdPattern() {
  const app = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');
  assert(app.includes('const localMessageId = `<local-${Date.now()}-${Math.random().toString(36).slice(2)}@minimail>`;'));
  assert(app.includes('const localMailId = `${options.accountId}:${localMessageId}`;'));
  assert(!app.includes('id: source.id'));
}

function testSentDeliveryDoesNotKeepDraftIdentity() {
  const app = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');
  assert(app.includes('localDraftKey: undefined,'));
  assert(app.includes('bodyText: options.bodyText,'));
  assert(app.includes('bodyHtml: options.bodyHtml,'));
}

function testSentServerRowDoesNotBecomeDraftAfterBodyCarryOver() {
  const [serverSent] = loadCachedMails(1, 'Sent').filter((mail) => mail.uid === 42);
  assert(serverSent, 'Expected server sent row to be cached');
  assert.strictEqual(serverSent.localDraftKey, undefined);
}

function testSentServerRowMergesLocalOptimisticCopyByMessageId() {
  const matches = loadCachedMails(1, 'Sent').filter((mail) => mail.messageId === '<smtp-forward-1@example.com>');
  assert.strictEqual(matches.length, 1, 'server Sent sync should merge the optimistic local sent copy');
  assert.strictEqual(matches[0].uid, 42);
}

function testOptimisticSentDeliveryStatePersistsThroughCache() {
  saveLocalMailToCache(baseMail({
    id: '1:<local-sending@minimail>',
    uid: 1700000001000,
    messageId: '<local-sending@minimail>',
    localSendId: '1:send:test-local-sending',
    deliveryState: 'sending',
    deliveryError: undefined,
    bodyText: 'Queued local sent body',
    bodyHtml: '<p>Queued local sent body</p>',
  }));

  const [cached] = loadCachedMails(1, 'Sent').filter((mail) => mail.id === '1:<local-sending@minimail>');
  assert(cached, 'queued local sent record should reload from cache');
  assert.strictEqual(cached.deliveryState, 'sending');
  assert.strictEqual(cached.localSendId, '1:send:test-local-sending');
  assert.strictEqual(getCachedBody(1, 1700000001000, 'Sent')?.bodyText, 'Queued local sent body');
}

function testSentRecordWithDraftPayloadDoesNotReloadAsDraft() {
  saveLocalMailToCache(baseMail({
    id: '1:<local-sent-with-old-draft-payload@minimail>',
    uid: 1700000002000,
    messageId: '<sent-with-old-draft-payload@example.com>',
    localSendId: '1:send:test-sent-with-old-draft-payload',
    deliveryState: 'sent',
    draftPayload: JSON.stringify({
      draftKey: 'draft-should-not-revive',
      recipients: [{ email: 'receiver@example.com', label: 'Receiver' }],
      body: 'This was already sent and must not reappear as a draft',
    }),
    bodyText: 'This was already sent and must not reappear as a draft',
  }));

  const drafts = loadCachedLocalDrafts(1);
  assert.strictEqual(
    drafts.some((draft) => draft.localDraftKey === 'draft-should-not-revive' || draft.messageId === '<sent-with-old-draft-payload@example.com>'),
    false,
    'sent/succeeded records with stale draftPayload must not reload as local drafts',
  );
}

function testDeletedServerDraftDoesNotReturnFromDraftsSync() {
  saveLocalMailToCache(baseMail({
    id: '1:draft-server-7',
    uid: 7,
    folder: 'Drafts',
    messageId: '<server-draft-7@example.com>',
    localDraftKey: 'draft-server-7',
    draftPayload: JSON.stringify({
      draftKey: 'draft-server-7',
      recipients: [{ email: 'receiver@example.com', label: 'Receiver' }],
      body: 'Server draft should be deleted after send',
    }),
    bodyText: 'Server draft should be deleted after send',
  }));

  deleteCachedDraft({
    accountId: 1,
    folder: 'Drafts',
    uid: 7,
    id: '1:draft-server-7',
    messageId: '<server-draft-7@example.com>',
    localDraftKey: 'draft-server-7',
  });

  saveLocalMailToCache(baseMail({
    id: '1:draft-server-7-returned',
    uid: 7,
    folder: 'Drafts',
    messageId: '<server-draft-7@example.com>',
    localDraftKey: undefined,
    draftPayload: undefined,
    bodyText: 'Server returned the already deleted draft',
  }));

  const draftRows = loadCachedMails(1, 'Drafts');
  assert.strictEqual(
    draftRows.some((mail) => mail.uid === 7 || mail.messageId === '<server-draft-7@example.com>'),
    false,
    'server Drafts sync must not resurrect a locally deleted draft',
  );
}

function testSendUsesResolvedSentFolderBeforeLocalCache() {
  const app = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');
  const handleSendStart = app.indexOf('const handleSendMail = async');
  const sentFolderIndex = app.indexOf("const sentFolderPath = getResolvedFolderPath(options.accountId, 'sent');", handleSendStart);
  const cacheIndex = app.indexOf("window.electronAPI.invoke('mail:cacheLocal'", handleSendStart);
  assert(
    sentFolderIndex >= 0,
    'send flow must resolve the Sent folder before caching local sent mail',
  );
  assert(
    sentFolderIndex < cacheIndex,
    'Sent folder resolution should happen before local sent cache write',
  );
  assert(
    !app.slice(handleSendStart, cacheIndex).includes("await resolveFolderPathForAction(options.accountId, 'sent')"),
    'initial sent cache path should not await async folder lookup before closing compose',
  );
}

function testSendRefreshesSentWithAsyncResolvedFolderPath() {
  const source = extractHandleSendMailSource();
  const successIndex = source.indexOf('if (!result.success)');
  const asyncResolveIndex = source.indexOf("const sentSyncFolderPath = await resolveFolderPathForAction(options.accountId, 'sent');", successIndex);
  const syncIndex = source.indexOf('await syncMails(options.accountId, sentSyncFolderPath,', successIndex);
  assert(
    asyncResolveIndex >= 0,
    'send success flow must asynchronously resolve the actual Sent folder path before refreshing Sent',
  );
  assert(
    syncIndex > asyncResolveIndex,
    'Sent refresh after send must use the async resolved folder path, not the optimistic literal sent fallback',
  );
  assert(
    !source.slice(successIndex).includes('await syncMails(options.accountId, sentFolderPath,'),
    'Sent refresh after send must not reuse the initial synchronous sentFolderPath',
  );
}

function testSendDeletesDraftIdentitySeparatelyFromSentIdentity() {
  const app = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');
  assert(app.includes('const draftIdentity = options.draftKey;'));
  assert(app.includes('sourceDraftTokens'), 'send flow should track selected server draft identity separately');
  assert(app.includes("window.electronAPI.invoke('mail:deleteCachedDraft'"), 'send flow should use structured draft deletion');
  assert(
    app.indexOf("window.electronAPI.invoke('mail:deleteCachedDraft'") <
      app.indexOf("console.error('[mail:sync after send]', err);"),
    'draft cache deletion should happen before the background Sent sync path finishes',
  );
}

function extractHandleSendMailSource() {
  const app = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');
  const start = app.indexOf('const handleSendMail = async');
  const end = app.indexOf('const handleSaveAttempt', start);
  assert(start >= 0 && end > start, 'handleSendMail source should be discoverable');
  return app.slice(start, end);
}

function testSendQueuesLocalSentBeforeSmtp() {
  const source = extractHandleSendMailSource();
  const cacheIndex = source.indexOf("window.electronAPI.invoke('mail:cacheLocal'");
  const sendIndex = source.indexOf("window.electronAPI.invoke('mail:send'");
  const timerIndex = source.indexOf('timer = setTimeout');
  assert(cacheIndex >= 0, 'send flow should cache local optimistic sent mail');
  assert(sendIndex >= 0, 'send flow should still call SMTP send');
  assert(cacheIndex < sendIndex, 'local sent cache must be written before SMTP send starts');
  assert(timerIndex > cacheIndex, 'send flow should start undo timer after caching scheduled sent mail');
  assert(source.includes("deliveryState: 'scheduled'"));
  assert(source.includes("localDraftKey: undefined,"));
}

function testSmtpSendRunsInBackgroundAfterLocalCache() {
  const source = extractHandleSendMailSource();
  const backgroundIndex = source.indexOf('const runScheduledSend = async');
  const timerIndex = source.indexOf('timer = setTimeout');
  const sendIndex = source.indexOf("window.electronAPI.invoke('mail:send'");
  const returnIndex = source.lastIndexOf('return { success: true');
  assert(backgroundIndex >= 0 && sendIndex > backgroundIndex, 'SMTP send should run in the scheduled background task');
  assert(timerIndex > sendIndex, 'undo timer should be armed after the scheduled SMTP task is defined');
  assert(returnIndex > timerIndex, 'handleSendMail should return success after queuing the delayed send path');
}

function testFailedSmtpKeepsFailedSentBodyCached() {
  const source = extractHandleSendMailSource();
  assert(source.includes("deliveryState: 'failed'"));
  assert(source.includes('deliveryError: failureMessage'));
  assert(source.includes('bodyText: options.bodyText'));
  assert(source.includes('bodyHtml: options.bodyHtml'));
}

function testRemoteImagesStillFlowThroughMailBodySanitizer() {
  const mailDetail = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'components', 'MailDetail.tsx'), 'utf8');
  assert(mailDetail.includes('sanitizeMailHtml(bodyHtml, {'));
  assert(mailDetail.includes('allowRemoteImages,'));
}

testSentSyncCopiesLocalComposeBodyByMessageId();
testSentBodyTextFallbackIsPersistedWhenHtmlMissing();
testForwardSentRowDoesNotReuseOriginalMailIdPattern();
testSentDeliveryDoesNotKeepDraftIdentity();
testSentServerRowDoesNotBecomeDraftAfterBodyCarryOver();
testSentServerRowMergesLocalOptimisticCopyByMessageId();
testOptimisticSentDeliveryStatePersistsThroughCache();
testSentRecordWithDraftPayloadDoesNotReloadAsDraft();
testDeletedServerDraftDoesNotReturnFromDraftsSync();
testSendUsesResolvedSentFolderBeforeLocalCache();
testSendRefreshesSentWithAsyncResolvedFolderPath();
testSendDeletesDraftIdentitySeparatelyFromSentIdentity();
testSendQueuesLocalSentBeforeSmtp();
testSmtpSendRunsInBackgroundAfterLocalCache();
testFailedSmtpKeepsFailedSentBodyCached();
testRemoteImagesStillFlowThroughMailBodySanitizer();

console.log('mail sent forward cache regression tests passed');
