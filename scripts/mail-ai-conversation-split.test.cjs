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

const modulePath = path.join(process.cwd(), 'src', 'renderer', 'utils', 'mailConversations.ts');
const {
  buildClassifiedConversationKey,
  buildClassifiedConversationRows,
  findClassifiedConversationMails,
} = loadTsModule(modulePath, {
  './emailContent': {
    extractReadableEmailText: () => '',
  },
});

function makeMail(overrides = {}) {
  return {
    id: overrides.id ?? `mail-${Math.random()}`,
    uid: overrides.uid ?? Math.floor(Math.random() * 100000),
    from: overrides.from ?? 'news@apple.com',
    fromName: overrides.fromName ?? 'Apple',
    to: overrides.to ?? 'me@example.com',
    subject: overrides.subject ?? 'Default subject',
    date: overrides.date ?? new Date(),
    snippet: overrides.snippet ?? '',
    hasAttachments: false,
    isRead: false,
    isStarred: false,
    folder: overrides.folder ?? 'INBOX',
    accountId: overrides.accountId ?? 1,
    category: overrides.category,
  };
}

const accountEmails = ['me@example.com'];
const notificationMail = makeMail({
  id: 'apple-notification',
  uid: 1,
  category: '通知类',
  subject: 'Apple sign-in alert',
  date: new Date('2026-04-19T10:00:00Z'),
});
const marketingMail = makeMail({
  id: 'apple-marketing',
  uid: 2,
  category: '广告/营销类',
  subject: 'New Apple offers',
  date: new Date('2026-04-19T12:00:00Z'),
});
const unclassifiedMail = makeMail({
  id: 'apple-unclassified',
  uid: 3,
  category: undefined,
  subject: 'General Apple update',
  date: new Date('2026-04-19T13:00:00Z'),
});

assert.strictEqual(buildClassifiedConversationKey(notificationMail, accountEmails), '1:news@apple.com::通知类');
assert.strictEqual(buildClassifiedConversationKey(marketingMail, accountEmails), '1:news@apple.com::广告/营销类');
assert.strictEqual(buildClassifiedConversationKey(unclassifiedMail, accountEmails), null);

const rows = buildClassifiedConversationRows(
  [notificationMail, marketingMail, unclassifiedMail],
  accountEmails,
);

assert.strictEqual(rows.length, 2);
assert.deepStrictEqual(rows.map((mail) => mail.category).sort(), ['广告/营销类', '通知类']);

const notificationThread = findClassifiedConversationMails(
  notificationMail,
  [notificationMail, marketingMail, unclassifiedMail],
  accountEmails,
);

assert.strictEqual(notificationThread.length, 0);

const notificationFollowup = makeMail({
  id: 'apple-notification-2',
  uid: 4,
  category: '通知类',
  subject: 'Apple security notice',
  date: new Date('2026-04-19T14:00:00Z'),
});

const expandedThread = findClassifiedConversationMails(
  notificationMail,
  [notificationMail, notificationFollowup, marketingMail],
  accountEmails,
);

assert.deepStrictEqual(expandedThread.map((mail) => mail.id), ['apple-notification-2']);

console.log('mail ai conversation split tests passed');
