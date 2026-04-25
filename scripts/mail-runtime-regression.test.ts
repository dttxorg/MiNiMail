import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testPreloadAllowsComposeDraftDeletionIpc() {
  const preload = read('src/preload/index.ts');

  assert(
    preload.includes("'mail:deleteCachedById'"),
    'Expected preload validChannels to allow compose draft cache deletion IPC'
  );
}

function testFolderResolutionUsesFlagsAndLocalizedCandidates() {
  const folders = read('src/shared/mailFolders.ts');

  assert(
    folders.includes('function folderMatchesFlags'),
    'Expected mail folder resolution to use IMAP special-use flags when available'
  );
  assert(
    folders.includes('folderMatchesFlags(folder, selectedFolder)'),
    'Expected resolveFolderPath to prefer special-use flags before path-name fallback'
  );
  assert(
    folders.includes("'[Gmail]/Sent Mail'"),
    'Expected sent-folder candidates to include Gmail well-known paths'
  );
  assert(
    folders.includes("'[Gmail]/Drafts'"),
    'Expected draft-folder candidates to include Gmail well-known paths'
  );
  assert(
    folders.includes('\\u5df2\\u53d1\\u9001\\u90ae\\u4ef6') || folders.includes('已发送邮件'),
    'Expected sent-folder candidates to include localized names'
  );
  assert(
    folders.includes('\\u8349\\u7a3f') || folders.includes('草稿'),
    'Expected draft-folder candidates to include localized names'
  );
}

function testCachedDraftRecoveryKeepsStableDraftKey() {
  const app = read('src/renderer/App.tsx');

  assert(
    app.includes('function extractLocalDraftKeyFromMessageId'),
    'Expected App to derive local draft keys from draft message IDs'
  );
  assert(
    app.includes('mail.localDraftKey || extractLocalDraftKeyFromMessageId(mail.messageId) || getDraftKeyFromMailId(mail.id)'),
    'Expected cached draft recovery to reuse the original local draft key before falling back to UID'
  );
}

function testManualBodyFetchesAreDeduped() {
  const useMail = read('src/renderer/hooks/useMail.ts');
  const mailDetail = read('src/renderer/components/MailDetail.tsx');
  const mailBodyLoader = read('src/renderer/utils/mailBodyLoader.ts');

  assert(
    useMail.includes('sharedMailBodyStore.load(window.electronAPI'),
    'Expected useMail to route body loading through the shared mail body store'
  );
  assert(
    mailDetail.includes('loadMailBody(email.accountId, email.uid, email.folder)'),
    'Expected MailDetail conversation cards to reuse the shared body loader passed from useMail'
  );
  assert(
    mailBodyLoader.includes('private readonly inFlight = new Map<string, Promise<SharedMailBodyLoadResult>>();'),
    'Expected shared body loader to dedupe in-flight full body requests'
  );
  assert(
    mailBodyLoader.includes('const existing = this.inFlight.get(key);'),
    'Expected shared body loader to reuse existing in-flight requests'
  );
  assert(
    !mailDetail.includes("window.electronAPI.invoke('mail:fetchFull'"),
    'Expected MailDetail to stop issuing independent fetchFull requests'
  );
  assert(
    !useMail.includes("window.electronAPI.invoke('mail:fetchFull'"),
    'Expected useMail to stop issuing direct fetchFull requests outside the shared loader'
  );
}

function testAppUsesConsolidatedMailViewModelAndVisibleDiagnostics() {
  const app = read('src/renderer/App.tsx');

  assert(
    app.includes("import { buildMailListViewModel } from './utils/mailListViewModel';"),
    'Expected App to use a consolidated mail list view model helper'
  );
  assert(
    app.includes('const mailListViewModel = useMemo('),
    'Expected App to consolidate heavy list derivations into one memoized view model'
  );
  assert(
    app.includes('const visibleRoutingResults = useMemo('),
    'Expected App to narrow routing diagnostics to visible conversation messages'
  );
  assert(
    app.includes('routingResults: visibleRoutingResults,'),
    'Expected routing diagnostics to be built from visible routing results only'
  );
  assert(
    app.includes('const sortedFolderEmails = useMemo('),
    'Expected App to memoize sorted folder rows instead of re-sorting for each selection path'
  );
}

function testMailCacheDbUsesSharedConnectionInsteadOfHotPathRequire() {
  const mailService = read('src/main/services/mailService.ts');

  assert(
    mailService.includes("import Database from 'better-sqlite3';"),
    'Expected mailService to import better-sqlite3 at module scope'
  );
  assert(
    mailService.includes("import path from 'node:path';"),
    'Expected mailService to import path at module scope'
  );
  assert(
    mailService.includes("import { Notification, BrowserWindow, app } from 'electron';"),
    'Expected mailService to reuse Electron app import instead of requiring it inside getMailCacheDb'
  );
  assert(
    mailService.includes('let mailCacheDb: Database.Database | null = null;'),
    'Expected mailService to keep a shared mail cache connection'
  );
  assert(
    mailService.includes('if (!mailCacheDb) {'),
    'Expected getMailCacheDb to lazily initialize a shared cache connection'
  );
  assert(
    mailService.includes("app.once('before-quit', closeMailCacheDb);"),
    'Expected mailService to close the shared cache connection on app shutdown'
  );
  assert(
    !mailService.includes("const Database = require('better-sqlite3');"),
    'Expected mailService to stop requiring better-sqlite3 inside getMailCacheDb'
  );
  assert(
    !mailService.includes('db.close();'),
    'Expected hot-path cache helpers to stop closing the database handle on every call'
  );
}

function testAppUsesMemoizedLocalThreadCleanupAndAutoAnalysisIds() {
  const app = read('src/renderer/App.tsx');

  assert(
    app.includes("import { buildServerMailIdentitySet, filterOutPersistedLocalThreadMails } from './utils/localThreadMailState';"),
    'Expected App to use the shared local-thread cleanup helper'
  );
  assert(
    app.includes('const serverMailIdentitySet = useMemo('),
    'Expected App to memoize server mail identity keys before cleaning local thread mails'
  );
  assert(
    app.includes('filterOutPersistedLocalThreadMails(prev, serverMailIdentitySet)'),
    'Expected local thread cleanup effect to use the memoized identity set'
  );
  assert(
    app.includes('const autoAnalysisEligibleIds = useMemo('),
    'Expected App to memoize auto-analysis eligible ids instead of rescanning the full mail list in each effect'
  );
}

function run() {
  testPreloadAllowsComposeDraftDeletionIpc();
  testFolderResolutionUsesFlagsAndLocalizedCandidates();
  testCachedDraftRecoveryKeepsStableDraftKey();
  testManualBodyFetchesAreDeduped();
  testAppUsesConsolidatedMailViewModelAndVisibleDiagnostics();
  testMailCacheDbUsesSharedConnectionInsteadOfHotPathRequire();
  testAppUsesMemoizedLocalThreadCleanupAndAutoAnalysisIds();
  console.log('mail runtime regression tests passed');
}

run();
