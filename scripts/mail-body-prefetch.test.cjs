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

const modulePath = path.join(process.cwd(), 'src', 'renderer', 'utils', 'bodyCachePrefetch.ts');
const { pickBodyPrefetchCandidates } = loadTsModule(modulePath, {
  '../../shared/mailSyncSettings': loadTsModule(path.join(process.cwd(), 'src', 'shared', 'mailSyncSettings.ts')),
});

const now = new Date('2026-04-19T12:00:00Z').getTime();
const mails = [
  {
    id: 'recent',
    uid: 1,
    accountId: 1,
    folder: 'INBOX',
    date: new Date('2026-04-18T12:00:00Z'),
  },
  {
    id: 'old',
    uid: 2,
    accountId: 1,
    folder: 'INBOX',
    date: new Date('2026-03-01T12:00:00Z'),
  },
  {
    id: 'duplicate',
    uid: 1,
    accountId: 1,
    folder: 'INBOX',
    date: new Date('2026-04-18T12:00:00Z'),
  },
];

assert.deepStrictEqual(
  pickBodyPrefetchCandidates(mails, {
    historyRange: 'all',
    cacheRange: '7d',
    limit: 10,
    now,
  }).map((mail) => mail.id),
  ['recent'],
);

assert.deepStrictEqual(
  pickBodyPrefetchCandidates(mails, {
    historyRange: '7d',
    cacheRange: 'all',
    limit: 10,
    now,
  }).map((mail) => mail.id),
  ['recent'],
);

assert.deepStrictEqual(
  pickBodyPrefetchCandidates([
    ...mails,
    {
      id: 'mid',
      uid: 3,
      accountId: 1,
      folder: 'INBOX',
      date: new Date('2026-04-10T12:00:00Z'),
    },
  ], {
    historyRange: 'all',
    cacheRange: 'all',
    now,
  }).map((mail) => mail.id),
  ['recent', 'mid', 'old'],
);

console.log('mail body prefetch tests passed');
