const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
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

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(start >= 0, `Missing section start: ${startNeedle}`);
  assert(end > start, `Missing section end: ${endNeedle}`);
  return source.slice(start, end);
}

function testCachedMailListQueryPushesWindowToSql() {
  const mailService = read('src/main/services/mailService.ts');
  const queryModule = read('src/shared/mailCacheQuery.ts');
  const getCachedMailsSection = sliceBetween(
    mailService,
    'function getCachedMails',
    'function getLatestCachedMailTimestamp',
  );
  const loadCachedMailsSection = sliceBetween(
    mailService,
    'export function loadCachedMails',
    'export function loadCachedMailRecords',
  );

  assert(getCachedMailsSection.includes('buildCachedMailListQuery'), 'Expected cached mail list reads to use the SQL query builder');
  assert(queryModule.includes('historyCutoffIso'), 'Expected cached mail query to accept a SQL history cutoff');
  assert(queryModule.includes('datetime(date) >= datetime(?)'), 'Expected history cutoff to be pushed into SQL');
  assert(queryModule.includes('LIMIT ?'), 'Expected cached mail query to push limit into SQL');
  assert(queryModule.includes('OFFSET ?'), 'Expected cached mail query to push offset into SQL');
  assert(queryModule.includes('ORDER BY uid DESC'), 'Expected cached mail query to preserve existing UID-desc ordering');
  assert(!getCachedMailsSection.includes('body_html') && !getCachedMailsSection.includes('body_text'), 'Expected list cache query not to load full bodies');

  assert(!loadCachedMailsSection.includes('.filter((mail)'), 'Expected loadCachedMails not to full-materialize then JS-filter by history range');
  assert(loadCachedMailsSection.includes('historyCutoffIso'), 'Expected loadCachedMails to pass cutoff into getCachedMails');
}

function testCachedMailListQueryBehavior() {
  const { buildCachedMailListQuery } = loadTsModule('src/shared/mailCacheQuery.ts');

  const defaultQuery = buildCachedMailListQuery({ accountId: 1, folder: 'INBOX' });
  assert(JSON.stringify(defaultQuery.params) === JSON.stringify([1, 'INBOX']), 'Expected default query params to target only account/folder');
  assert(!defaultQuery.sql.includes('datetime(date) >= datetime(?)'), 'Expected no history cutoff when range is all/default');
  assert(!defaultQuery.sql.includes('LIMIT ?'), 'Expected no implicit list truncation without a limit');

  const cutoffQuery = buildCachedMailListQuery({
    accountId: 1,
    folder: 'INBOX',
    historyCutoffIso: '2026-04-01T00:00:00.000Z',
  });
  assert(
    JSON.stringify(cutoffQuery.params) === JSON.stringify([1, 'INBOX', '2026-04-01T00:00:00.000Z']),
    'Expected history cutoff to be bound after account/folder params',
  );

  const pagedQuery = buildCachedMailListQuery({
    accountId: 1,
    folder: 'INBOX',
    historyCutoffIso: '2026-04-01T00:00:00.000Z',
    limit: 25,
    offset: 50,
  });
  assert(
    JSON.stringify(pagedQuery.params) === JSON.stringify([1, 'INBOX', '2026-04-01T00:00:00.000Z', 25, 50]),
    'Expected limit and offset to be bound after the cutoff params',
  );
  assert(pagedQuery.sql.indexOf('WHERE account_id = ? AND folder = ? AND datetime(date) >= datetime(?)') >= 0, 'Expected WHERE order to preserve account/folder/cutoff filtering');
  assert(pagedQuery.sql.indexOf('ORDER BY uid DESC') < pagedQuery.sql.indexOf('LIMIT ?'), 'Expected pagination to apply after stable ordering');
}

function testSchemaHasDateIndexForHistoryWindow() {
  const mailService = read('src/main/services/mailService.ts');
  assert(
    mailService.includes('CREATE INDEX IF NOT EXISTS idx_mail_cache_account_folder_date'),
    'Expected mail cache schema to index account/folder/date for history-window queries',
  );
}

function run() {
  testCachedMailListQueryPushesWindowToSql();
  testCachedMailListQueryBehavior();
  testSchemaHasDateIndexForHistoryWindow();
  console.log('mail cache SQL window tests passed');
}

run();
