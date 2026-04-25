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

async function run() {
  const redactionModule = loadTsModule(path.join(process.cwd(), 'src', 'shared', 'email-ai', 'redactSensitiveEntities.ts'), {
    './types': loadTsModule(path.join(process.cwd(), 'src', 'shared', 'email-ai', 'types.ts')),
  });

  const dbValues = {
    ai_base_url: 'https://example.test/v1',
    ai_model: 'test-model',
    ai_privacy_mode: 'cloud_redacted',
  };
  const secureValues = {
    ai_api_key: 'test-key',
  };

  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: 'Please follow up with [PERSON_1] at [EMAIL_1].',
          },
        },
      ],
    }),
  });

  const aiService = loadTsModule(path.join(process.cwd(), 'src', 'main', 'services', 'ai.ts'), {
    '../database': {
      getSetting: (key) => dbValues[key] || '',
      setSetting: (key, value) => { dbValues[key] = value; },
      deleteSetting: (key) => { delete dbValues[key]; },
      getSecureSetting: (key) => secureValues[key] || null,
      setSecureSetting: (key, value) => { secureValues[key] = value; },
      deleteSecureSetting: (key) => { delete secureValues[key]; },
    },
    './crypto': {
      isEncryptionAvailable: () => true,
    },
    'electron-log': { info() {}, warn() {}, error() {} },
    '../../shared/email-ai': {
      buildEmailAiSnapshot: () => ({
        summaryView: { latestReply: '', context: '', bullets: [], links: [], attachments: [] },
        actionView: { latestReply: '', actions: [], deadlines: [], amounts: [], links: [] },
        replyView: { latestReply: '', quotedHistory: '', sender: null, recipients: [], references: [], suggestedOpening: '' },
        parsed: { plainText: '' },
      }),
      buildReplyPrompt: () => ({ system: 'reply', prompt: 'reply prompt' }),
      buildSummarizePrompt: () => ({ system: 'summarize', prompt: 'summarize prompt' }),
      buildTranslatePrompt: () => ({ system: 'translate', prompt: 'translate prompt' }),
      redactGithubMailEntities: ({ plainText }) => ({ redactedText: plainText, redactionMap: [], entities: [], preservedGithubSemantics: {} }),
      redactSensitiveEntities: redactionModule.redactSensitiveEntities,
      restoreSensitiveEntities: redactionModule.restoreSensitiveEntities,
    },
  });

  const response = await aiService.summarizeText('Hi Alice Brown,\nPlease follow up with alice@example.com.', 'English');
  assert.strictEqual(response.success, true, 'Expected summarizeText success');
  assert.strictEqual(
    response.content,
    'Please follow up with Alice Brown at alice@example.com.',
    'Expected placeholders to be restored after cloud response'
  );

  console.log('ai redaction restore tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
