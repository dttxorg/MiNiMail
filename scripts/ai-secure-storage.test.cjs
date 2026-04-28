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

function createEmailAiStub() {
  return {
    buildDeepScanPreview: () => '',
    buildActionSuggestionsPrompt: () => ({ system: 'actions', prompt: 'actions' }),
    buildKeyInfoPrompt: () => ({ system: 'keyinfo', prompt: 'keyinfo' }),
    buildQuickRepliesPrompt: () => ({ system: 'quick', prompt: 'quick' }),
    buildReplyPrompt: () => ({ system: 'reply', prompt: 'reply' }),
    buildSummarizePrompt: () => ({ system: 'summary', prompt: 'summary' }),
    buildTranslatePrompt: () => ({ system: 'translate', prompt: 'translate' }),
    resolveIntelligentScanMode: () => 'light',
    redactGithubMailEntities: ({ plainText = '', subject = '' }) => ({
      redactedText: plainText || subject,
      redactionMap: [],
      entities: [],
      preservedGithubSemantics: {},
    }),
    redactSensitiveEntities: (value) => ({ redactedText: value, redactionMap: [] }),
    runScanPipeline: async () => ({}),
    restoreSensitiveEntities: (value) => value,
  };
}

function createFakeBetterSqlite3() {
  const settings = new Map();
  const secureSettings = new Map();

  return class FakeDatabase {
    pragma() {}

    exec() {}

    close() {}

    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      return {
        get: (...args) => {
          if (normalized === 'SELECT value FROM settings WHERE key = ?') {
            const key = args[0];
            return settings.has(key) ? { value: settings.get(key) } : undefined;
          }
          if (normalized === 'SELECT value FROM secure_settings WHERE key = ?') {
            const key = args[0];
            return secureSettings.has(key) ? { value: secureSettings.get(key) } : undefined;
          }
          return undefined;
        },

        run: (...args) => {
          if (normalized === 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)') {
            const [key, value] = args;
            settings.set(key, value);
            return { changes: 1 };
          }
          if (normalized === 'DELETE FROM settings WHERE key = ?') {
            const [key] = args;
            const existed = settings.delete(key);
            return { changes: existed ? 1 : 0 };
          }
          if (normalized.includes('INSERT OR REPLACE INTO secure_settings')) {
            const [key, value] = args;
            secureSettings.set(key, value);
            return { changes: 1 };
          }
          if (normalized === 'DELETE FROM secure_settings WHERE key = ?') {
            const [key] = args;
            const existed = secureSettings.delete(key);
            return { changes: existed ? 1 : 0 };
          }
          throw new Error(`Unsupported SQL in fake better-sqlite3: ${normalized}`);
        },
      };
    }
  };
}

function createEnvironment(encryptionAvailable) {
  const root = path.join(process.cwd(), '.tmp-tests', 'ai-secure-storage', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(root, { recursive: true });

  const electronMock = {
    app: {
      getPath(name) {
        if (name !== 'userData') throw new Error(`Unexpected getPath(${name})`);
        return root;
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => encryptionAvailable,
      encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
      decryptString: (encrypted) => {
        const text = Buffer.isBuffer(encrypted) ? encrypted.toString('utf8') : Buffer.from(encrypted).toString('utf8');
        return text.startsWith('enc:') ? text.slice(4) : text;
      },
    },
  };

  const logStub = { info() {}, warn() {}, error() {} };
  const logModule = { __esModule: true, default: logStub, ...logStub };

  const cryptoModule = loadTsModule(path.join(process.cwd(), 'src', 'main', 'services', 'crypto.ts'), {
    electron: electronMock,
    'electron-log': logModule,
  });
  const databasePathModule = loadTsModule(path.join(process.cwd(), 'src', 'main', 'databasePath.ts'));

  const databaseModule = loadTsModule(path.join(process.cwd(), 'src', 'main', 'database.ts'), {
    electron: electronMock,
    'electron-log': logModule,
    './services/crypto': cryptoModule,
    './databasePath': databasePathModule,
    'better-sqlite3': createFakeBetterSqlite3(),
  });

  const aiModule = loadTsModule(path.join(process.cwd(), 'src', 'main', 'services', 'ai.ts'), {
    '../database': databaseModule,
    './crypto': cryptoModule,
    'electron-log': logModule,
    '../../shared/email-ai': createEmailAiStub(),
  });

  databaseModule.initDatabase();

  return { root, databaseModule, aiModule };
}

function readSecureSettingRow(databaseModule, key) {
  return databaseModule.getDatabase().prepare('SELECT value FROM secure_settings WHERE key = ?').get(key);
}

function cleanup(environment) {
  try {
    environment.databaseModule.closeDatabase();
  } finally {
    fs.rmSync(environment.root, { recursive: true, force: true });
  }
}

function testSavingAiKeyUsesSecureSettingsOnly() {
  const environment = createEnvironment(true);
  try {
    environment.aiModule.saveAIConfig({
      profileId: 'primary',
      baseUrl: 'https://example.test/v1',
      apiKey: 'secure-key-primary',
      model: 'gpt-test',
    });

    assert.strictEqual(environment.databaseModule.getSetting('ai_api_key'), null, 'settings table should not retain plaintext ai_api_key');
    assert.strictEqual(environment.aiModule.getAIConfig().apiKey, 'secure-key-primary', 'AI config should still read the saved key');

    const secureRow = readSecureSettingRow(environment.databaseModule, 'ai_api_key');
    assert(secureRow && Buffer.isBuffer(secureRow.value), 'secure_settings should persist encrypted API key bytes');
    assert.notStrictEqual(String(secureRow.value), 'secure-key-primary', 'secure_settings should not store plaintext API key');
  } finally {
    cleanup(environment);
  }
}

function testLegacyPlaintextKeyMigratesToSecureStorage() {
  const environment = createEnvironment(true);
  try {
    environment.databaseModule.setSetting('ai_api_key', 'legacy-plaintext-key');

    environment.aiModule.initializeAISecretStorage();

    assert.strictEqual(environment.databaseModule.getSetting('ai_api_key'), null, 'legacy plaintext ai_api_key should be removed after migration');
    assert.strictEqual(environment.aiModule.getAIConfig().apiKey, 'legacy-plaintext-key', 'migrated key should remain readable through AI config');

    const secureRow = readSecureSettingRow(environment.databaseModule, 'ai_api_key');
    assert(secureRow && Buffer.isBuffer(secureRow.value), 'migrated key should be written into secure_settings');
  } finally {
    cleanup(environment);
  }
}

function testSafeStorageUnavailableFailsClearlyWithoutPlaintextFallback() {
  const environment = createEnvironment(false);
  try {
    let thrown = null;
    try {
      environment.aiModule.saveAIConfig({
        profileId: 'primary',
        apiKey: 'should-not-save',
      });
    } catch (error) {
      thrown = error;
    }

    assert(thrown instanceof Error, 'saving AI key without safeStorage should throw');
    assert(
      thrown.message.includes('Failed to save AI API key securely'),
      'save failure should clearly mention secure AI API key storage',
    );
    assert.strictEqual(environment.databaseModule.getSetting('ai_api_key'), null, 'plaintext settings fallback must not be used');
    assert.strictEqual(readSecureSettingRow(environment.databaseModule, 'ai_api_key'), undefined, 'secure_settings should stay empty when safeStorage is unavailable');
  } finally {
    cleanup(environment);
  }
}

function run() {
  testSavingAiKeyUsesSecureSettingsOnly();
  testLegacyPlaintextKeyMigratesToSecureStorage();
  testSafeStorageUnavailableFailsClearlyWithoutPlaintextFallback();
  console.log('ai secure storage tests passed');
}

run();
