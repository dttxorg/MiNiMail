const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadTsModule(relativePath) {
  const filename = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(require, module, module.exports);
  return module.exports;
}

function testDraftIdentityResolverIsStrict() {
  const identity = loadTsModule('src/shared/mailDraftIdentity.ts');

  assert(identity.resolveLocalDraftId({ localDraftId: 'draft-alpha_1-2' }) === 'draft-alpha_1-2', 'Expected stable local draft id to win');
  assert(identity.resolveLocalDraftId({ id: '12:draft-alpha' }) === 'draft-alpha', 'Expected UI composite id to resolve only for local draft ids');
  assert(identity.resolveLocalDraftId({ messageId: '<draft-alpha@minimail>' }) === 'draft-alpha', 'Expected local draft message id to resolve');
  assert(identity.resolveLocalDraftId({ id: 'server:message:with:colon' }) === null, 'Expected server-like ids with colons not to resolve as local drafts');
  assert(identity.resolveLocalDraftId({ messageId: '<real:message@example.com>' }) === null, 'Expected real message ids with colons not to resolve as local drafts');
  assert(identity.resolveLocalDraftId({ id: '12:not-a-draft' }) === null, 'Expected non-draft composite ids not to resolve');
}

function testMailCacheSchemaUsesStableDraftKey() {
  const mailService = fs.readFileSync(path.join(process.cwd(), 'src/main/services/mailService.ts'), 'utf8');

  assert(mailService.includes('ALTER TABLE mail_cache ADD COLUMN local_draft_id TEXT'), 'Expected mail cache migration to add local_draft_id');
  assert(mailService.includes('CREATE INDEX IF NOT EXISTS idx_mail_cache_local_draft_id'), 'Expected local draft ids to be indexed for exact deletion');
  assert(mailService.includes('backfillLocalDraftIds'), 'Expected safe migration to backfill legacy local draft rows');
  assert(mailService.includes('local_draft_id = ?'), 'Expected deletion to use exact local_draft_id matching');
  assert(mailService.includes("delivery_state IS NULL OR delivery_state = 'cancelled'"), 'Expected local draft loading to exclude sent/sending/failed records with stale draft payloads');
  assert(mailService.includes('CREATE TABLE IF NOT EXISTS mail_draft_tombstones'), 'Expected draft tombstones to block server draft resurrection');
  assert(mailService.includes('mail_draft_tombstones tombstone'), 'Expected local draft loading to exclude tombstoned drafts');
  assert(mailService.includes('function isDraftTombstoned'), 'Expected draft cache writes to check tombstones before accepting Drafts sync rows');
  assert(mailService.includes('export function deleteCachedDraft'), 'Expected a structured draft deletion API');
  assert(!mailService.includes('id LIKE ?'), 'Expected deletion to stop using broad id LIKE matching');
  assert(!mailService.includes('%:${draftKey}'), 'Expected deletion to stop constructing wildcard draft ids');
}

function testRendererDeletesByStableDraftKey() {
  const app = fs.readFileSync(path.join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
  const compose = fs.readFileSync(path.join(process.cwd(), 'src/renderer/components/ComposeDialog.tsx'), 'utf8');
  const ipc = fs.readFileSync(path.join(process.cwd(), 'src/main/ipc/mail.ts'), 'utf8');
  const preload = fs.readFileSync(path.join(process.cwd(), 'src/preload/index.ts'), 'utf8');

  assert(ipc.includes("ipcMain.handle('mail:deleteCachedDraft'"), 'Expected IPC to expose structured draft deletion');
  assert(preload.includes("'mail:deleteCachedDraft'"), 'Expected preload to allow structured cached draft deletion IPC');
  assert(app.includes("window.electronAPI.invoke('mail:deleteCachedDraft'"), 'Expected renderer to use structured draft deletion');
  assert(compose.includes('sourceDraft:'), 'Expected ComposeDialog to pass selected draft identity when sending');
  assert(!app.includes("window.electronAPI.invoke('mail:deleteCachedById', draftId),"), 'Expected compose draft deletion not to use UI composite id as the primary deletion key');
}

function run() {
  testDraftIdentityResolverIsStrict();
  testMailCacheSchemaUsesStableDraftKey();
  testRendererDeletesByStableDraftKey();
  console.log('mail draft cache identity tests passed');
}

run();
