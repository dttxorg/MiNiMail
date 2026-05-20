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
  const aiContextModule = loadTsModule(path.join(process.cwd(), 'src', 'shared', 'email-ai', 'aiContext.ts'));
  const loadAiService = ({ callAI, privacyMode = 'cloud_redacted', redactionMode = 'passthrough' }) => loadTsModule(path.join(process.cwd(), 'src', 'main', 'services', 'ai.ts'), {
    './ai/index': {
      callAI,
      getAIConfig: () => ({ baseUrl: 'https://example.test/v1', apiKey: 'test-key', model: 'test-model' }),
      getAIConfigSnapshot: () => ({}),
      initializeAISecretStorage: () => {},
    },
    '../database': {
      getSetting: (key) => key === 'ai_privacy_mode' ? privacyMode : '',
      setSetting: () => {},
      deleteSetting: () => {},
    },
    './crypto': {
      isEncryptionAvailable: () => true,
    },
    'electron-log': { info() {}, warn() {}, error() {} },
    '../../shared/email-ai': {
      deriveEmailAIContext: aiContextModule.deriveEmailAIContext,
      buildDeepScanPreview: () => '',
      runScanPipeline: () => ({
        kind: 'generic',
        light_scan: {},
        smart_folder: null,
      }),
      resolveIntelligentScanMode: (_routing, scanMode) => scanMode === 'deep' ? 'deep' : 'light',
      redactGithubMailEntities: ({ plainText }) => ({ redactedText: plainText, redactionMap: [], entities: [], preservedGithubSemantics: {} }),
      redactSensitiveEntities: (value) => redactionMode === 'mask-email'
        ? {
            redactedText: String(value).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_1]'),
            redactionMap: [{ type: 'email', placeholder: '[EMAIL_1]', original: 'noreply@example.com' }],
          }
        : { redactedText: value, redactionMap: [] },
      restoreSensitiveEntities: (value) => String(value).replace(/\[EMAIL_1\]/g, 'noreply@example.com'),
      buildActionSuggestionsPrompt: () => ({ system: 'actions', prompt: 'actions' }),
      buildQuickRepliesPrompt: () => ({ system: 'quick', prompt: 'quick' }),
      buildReplyPrompt: () => ({ system: 'reply', prompt: 'reply' }),
      buildSummarizePrompt: () => ({ system: 'summary', prompt: 'summary' }),
      buildTranslatePrompt: () => ({ system: 'translate', prompt: 'translate' }),
      buildKeyInfoPrompt: () => ({ system: 'key', prompt: 'key' }),
    },
  });

  let llmCalls = 0;
  const aiService = loadAiService({
    callAI: async () => {
      llmCalls += 1;
      return { success: true, content: '[]' };
    },
  });

  const response = await aiService.batchClassifyMails([
    {
      id: 'm1',
      subject: 'Save 80%',
      from: 'news@send.projects-software.com',
      from_name: 'FRANZIS',
      has_attachment: false,
      headers: { 'list-unsubscribe': '<https://example.test/unsubscribe>' },
      snippet: 'Discount offer',
    },
    {
      id: 'm2',
      subject: 'Account alert',
      from: 'noreply@example.com',
      from_name: 'No Reply',
      has_attachment: false,
      snippet: 'Your account was updated.',
    },
  ], 'light');

  assert.strictEqual(response.success, true, 'Expected classification success');
  assert.strictEqual(llmCalls, 0, 'Expected local pre-classification to skip LLM');
  assert.strictEqual(response.results.length, 2, 'Expected both local-rule results');
  assert(response.results.every((item) => item.source === 'local_rule'), 'Expected local_rule source');
  assert(response.results.every((item) => item.replyNeeded === false), 'Expected no-reply metadata for local rules');
  assert.strictEqual(response.results.find((item) => item.id === 'm1').senderType, 'marketing', 'Expected ESP sender as marketing');
  assert.strictEqual(response.results.find((item) => item.id === 'm2').senderType, 'system_notification', 'Expected noreply sender as system notification');

  llmCalls = 0;
  const classifyWithFallback = loadAiService({
    privacyMode: 'off',
    callAI: async () => {
      llmCalls += 1;
      return {
        success: true,
        content: JSON.stringify([{ id: 'm3', category: '工作/业务类', senderType: 'work_contact', replyNeeded: true, confidence: 0.77 }]),
      };
    },
  });
  const contentOnlyMarketing = await classifyWithFallback.batchClassifyMails([
    {
      id: 'm3',
      subject: 'Client discount terms',
      from: 'alice@example.com',
      from_name: 'Alice',
      has_attachment: false,
      snippet: 'Can you confirm the discount terms for the proposal?',
    },
  ], 'light');
  assert.strictEqual(contentOnlyMarketing.success, true, 'Expected classification success for content-only marketing words');
  assert.strictEqual(llmCalls, 1, 'Expected content-only discount wording to use LLM fallback instead of local marketing rule');
  assert.strictEqual(contentOnlyMarketing.results.find((item) => item.id === 'm3').source, 'llm', 'Expected LLM source for content-only discount wording');
  assert.strictEqual(contentOnlyMarketing.results.find((item) => item.id === 'm3').senderType, 'work_contact', 'Expected LLM sender type to be preserved');

  llmCalls = 0;
  const redactedReplyService = loadAiService({
    redactionMode: 'mask-email',
    callAI: async () => {
      llmCalls += 1;
      return { success: true, content: '{"replyNeeded":true,"candidates":[{"style":"best","body":"Thanks"}]}' };
    },
  });
  const noReply = await redactedReplyService.suggestReply({
    subject: 'Account notice',
    from: 'noreply@example.com',
    from_name: 'No Reply',
    snippet: 'This is an automated notice.',
    body_text: 'This is an automated notice.',
  }, 'English');
  assert.strictEqual(noReply.success, true, 'Expected no-reply response to succeed');
  assert.strictEqual(llmCalls, 0, 'Expected cloud-redacted noreply context to be decided before LLM');
  assert.strictEqual(noReply.metadata.replyNeeded, false, 'Expected noreply metadata to be false');
  assert.strictEqual(noReply.metadata.overlays.replyNeeded, false, 'Expected noreply overlay metadata to stay consistent');

  llmCalls = 0;
  const replyService = loadAiService({
    privacyMode: 'off',
    callAI: async () => {
      llmCalls += 1;
      return { success: true, content: '{"replyNeeded":true,"candidates":[{"style":"best","body":"I will check and get back to you."}]}' };
    },
  });
  const unknownReply = await replyService.suggestReply({
    subject: 'Question',
    from: 'person@example.com',
    from_name: 'Person',
    snippet: 'Can you check this when you have a moment?',
    body_text: 'Can you check this when you have a moment?',
  }, 'English');
  assert.strictEqual(llmCalls, 1, 'Expected unknown non-bulk request to reach reply LLM');
  assert.strictEqual(unknownReply.metadata.replyNeeded, true, 'Expected reply metadata to remain true');

  const quickReplyObjectService = loadAiService({
    privacyMode: 'off',
    callAI: async () => ({
      success: true,
      content: JSON.stringify([
        { intent: 'acknowledge', text: 'I will check this.' },
        { intent: 'defer', reply: 'I will get back to you tomorrow.' },
        { intent: 'clarify', body: 'Can you share one more detail?' },
      ]),
    }),
  });
  const quickReplies = await quickReplyObjectService.suggestQuickReplies({
    subject: 'Question',
    from: 'person@example.com',
    from_name: 'Person',
    snippet: 'Can you check this when you have a moment?',
    body_text: 'Can you check this when you have a moment?',
  }, 'English');
  assert(!quickReplies.content.includes('[object Object]'), 'Expected object-shaped quick replies not to render as [object Object]');
  assert.deepStrictEqual(
    quickReplies.metadata.quickReplies,
    ['I will check this.', 'I will get back to you tomorrow.', 'Can you share one more detail?'],
    'Expected object-shaped quick replies to normalize into strings',
  );

  const malformedActionService = loadAiService({
    privacyMode: 'off',
    callAI: async () => ({ success: true, content: '{"actions": "not-an-array"' }),
  });
  const actions = await malformedActionService.suggestEmailActions({
    subject: 'Question',
    from: 'person@example.com',
    from_name: 'Person',
    snippet: 'Can you check this when you have a moment?',
    body_text: 'Can you check this when you have a moment?',
  }, 'English');
  assert.strictEqual(actions.success, true, 'Expected malformed action JSON to succeed with fallback');
  assert(!actions.content.includes('not-an-array'), 'Expected malformed action JSON not to be displayed');
  assert.strictEqual(actions.metadata.parseStatus, 'fallback', 'Expected parse fallback metadata');

  console.log('ai classification context tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
