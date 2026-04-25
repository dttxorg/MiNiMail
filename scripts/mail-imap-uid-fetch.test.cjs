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

const calls = [];

class FakeImapFlow {
  async connect() {}

  async logout() {}

  async getMailboxLock(folder) {
    calls.push({ method: 'getMailboxLock', folder });
    return { release() {} };
  }

  async search(query, options) {
    calls.push({ method: 'search', query, options });
    return [9003, 9002, 9001];
  }

  async status(folder, options) {
    calls.push({ method: 'status', folder, options });
    return { messages: 3 };
  }

  async *fetch(query, queryOptions, fetchOptions) {
    calls.push({ method: 'fetch', query, queryOptions, fetchOptions });
    yield {
      uid: 9003,
      flags: new Set(['\\Seen']),
      envelope: {
        from: [{ name: 'Sender', address: 'sender@example.com' }],
        to: [{ address: 'receiver@example.com' }],
        subject: 'Incremental mail',
        date: new Date('2026-04-25T12:00:00.000Z'),
        messageId: '<incremental@example.com>',
      },
    };
  }
}

const logStub = { info() {}, warn() {}, error() {} };

const mail = loadTsModule(path.join(process.cwd(), 'src', 'main', 'services', 'mail.ts'), {
  imapflow: { ImapFlow: FakeImapFlow },
  mailparser: { simpleParser: async () => ({}) },
  'electron-log': {
    __esModule: true,
    default: logStub,
    ...logStub,
  },
  '../database': {
    getAccountById: () => ({
      id: 1,
      username: 'receiver@example.com',
      imap_host: 'imap.example.com',
      imap_port: 993,
      use_tls: 1,
      auth_type: 'password',
    }),
    getAccountCredentials: () => ({ password: 'test-password' }),
  },
});

async function testHistorySinceUsesUidFetchMode() {
  calls.length = 0;
  const result = await mail.fetchMailList(1, 'INBOX', {
    limit: 2,
    offset: 0,
    historySince: new Date('2026-04-25T00:00:00.000Z'),
  });

  const searchCall = calls.find((call) => call.method === 'search');
  const fetchCall = calls.find((call) => call.method === 'fetch');

  assert.deepStrictEqual(searchCall.options, { uid: true }, 'history search must return UIDs');
  assert.deepStrictEqual(fetchCall.query, [9003, 9002], 'history fetch should use the searched UID window');
  assert.deepStrictEqual(fetchCall.fetchOptions, { uid: true }, 'history fetch must treat numeric query as UIDs');
  assert.strictEqual(result[0].uid, 9003);
}

async function testInitialSequenceFetchDoesNotUseUidMode() {
  calls.length = 0;
  await mail.fetchMailList(1, 'INBOX', {
    limit: 2,
    offset: 0,
    historySince: null,
  });

  const fetchCall = calls.find((call) => call.method === 'fetch');
  assert.strictEqual(fetchCall.query, '2:3');
  assert.strictEqual(fetchCall.fetchOptions?.uid, undefined, 'initial sequence fetch should keep sequence mode');
}

(async () => {
  await testHistorySinceUsesUidFetchMode();
  await testInitialSequenceFetchDoesNotUseUidMode();
  console.log('mail imap uid fetch tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
