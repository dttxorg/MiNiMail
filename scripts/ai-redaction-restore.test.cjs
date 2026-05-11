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
    if (specifier === '../contactKnowledge') {
      return loadTsModule(path.join(process.cwd(), 'src', 'shared', 'contactKnowledge.ts'), overrides);
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
  const aiContextModule = loadTsModule(path.join(process.cwd(), 'src', 'shared', 'email-ai', 'aiContext.ts'));

  const dbValues = {
    ai_base_url: 'https://example.test/v1',
    ai_model: 'test-model',
    ai_privacy_mode: 'cloud_redacted',
  };
  const secureValues = {
    ai_api_key: 'test-key',
  };

  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              what: 'Please follow up with [PERSON_1] at [EMAIL_1].',
              impact: '[PERSON_1] needs a response.',
              action: 'Reply to [EMAIL_1].',
              keyFacts: ['Contact: [PERSON_1]', 'Email: [EMAIL_1]'],
              urgency: 'today',
            }),
          },
        },
      ],
    }),
  };
  };

  const aiService = loadTsModule(path.join(process.cwd(), 'src', 'main', 'services', 'ai.ts'), {
    './ai/index': {
      callAI: async () => {
        fetchCalls += 1;
        return {
          success: true,
          content: JSON.stringify({
            what: 'Please follow up with [PERSON_1] at [EMAIL_1].',
            impact: '[PERSON_1] needs a response.',
            action: 'Reply to [EMAIL_1].',
            keyFacts: ['Contact: [PERSON_1]', 'Email: [EMAIL_1]'],
            urgency: 'today',
          }),
        };
      },
      getAIConfig: () => ({ baseUrl: 'https://example.test/v1', apiKey: 'test-key', model: 'test-model' }),
      getAIConfigSnapshot: () => ({}),
      initializeAISecretStorage: () => {},
    },
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
      deriveEmailAIContext: aiContextModule.deriveEmailAIContext,
      redactGithubMailEntities: ({ plainText }) => ({ redactedText: plainText, redactionMap: [], entities: [], preservedGithubSemantics: {} }),
      redactSensitiveEntities: redactionModule.redactSensitiveEntities,
      restoreSensitiveEntities: redactionModule.restoreSensitiveEntities,
    },
  });

  const response = await aiService.summarizeText('Hi Alice Brown,\nPlease follow up with alice@example.com.', 'English');
  assert.strictEqual(response.success, true, 'Expected summarizeText success');
  assert(response.content.includes('Alice Brown'), 'Expected summary content placeholders to be restored');
  assert(response.content.includes('alice@example.com'), 'Expected summary content email placeholder to be restored');
  assert(response.metadata.summary.what.includes('Alice Brown'), 'Expected summary metadata placeholders to be restored');
  assert(response.metadata.summary.keyFacts.some((item) => item.includes('alice@example.com')), 'Expected summary metadata arrays to be restored');

  const callsBeforeNoReply = fetchCalls;
  const noReply = await aiService.suggestReply({
    subject: 'Newsletter',
    from: 'noreply@example.com',
    from_name: 'No Reply',
    headers: { 'list-unsubscribe': '<https://example.test/unsubscribe>' },
    snippet: 'Latest updates',
    body_text: 'Latest updates',
  }, 'English');
  assert.strictEqual(noReply.success, true, 'Expected no-reply response success');
  assert.strictEqual(noReply.metadata.replyNeeded, false, 'Expected no-reply metadata');
  assert.strictEqual(fetchCalls, callsBeforeNoReply, 'Expected no LLM call when replyNeeded=false');

  console.log('ai redaction restore tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
