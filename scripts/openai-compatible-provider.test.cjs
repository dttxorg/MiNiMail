const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function resolveLocalTsModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;

  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function loadTsModule(filePath, overrides = {}, moduleCache = new Map()) {
  const resolvedPath = path.resolve(filePath);
  if (moduleCache.has(resolvedPath)) {
    return moduleCache.get(resolvedPath).exports;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const moduleShim = { exports: {} };
  moduleCache.set(resolvedPath, moduleShim);
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(overrides, specifier)) {
      return overrides[specifier];
    }
    const localModule = resolveLocalTsModule(resolvedPath, specifier);
    if (localModule) {
      return loadTsModule(localModule, overrides, moduleCache);
    }
    return require(specifier);
  };

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled.outputText);
  fn(moduleShim.exports, localRequire, moduleShim, resolvedPath, path.dirname(resolvedPath));
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

function loadAiService(config = {}) {
  const dbValues = {
    ai_base_url: config.baseUrl || 'https://api.siliconflow.cn/v1',
    ai_model: config.model || 'Pro/zai-org/GLM-4.7',
    ai_privacy_mode: 'cloud_raw',
  };
  const secureValues = {
    ai_api_key: config.apiKey || 'test-api-key',
  };
  const logs = [];
  const logStub = {
    info: (...args) => logs.push(['info', ...args]),
    warn: (...args) => logs.push(['warn', ...args]),
    error: (...args) => logs.push(['error', ...args]),
  };

  const aiModule = loadTsModule(path.join(process.cwd(), 'src', 'main', 'services', 'ai.ts'), {
    '../database': {
      getSetting: (key) => dbValues[key] || '',
      setSetting: (key, value) => { dbValues[key] = value; },
      deleteSetting: (key) => { delete dbValues[key]; },
      getSecureSetting: (key) => secureValues[key] || null,
      setSecureSetting: (key, value) => { secureValues[key] = value; },
      deleteSecureSetting: (key) => { delete secureValues[key]; },
    },
    '../../database': {
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
    '../crypto': {
      isEncryptionAvailable: () => true,
    },
    'electron-log': { __esModule: true, default: logStub, ...logStub },
    '../../shared/email-ai': createEmailAiStub(),
  });

  return { aiModule, dbValues, secureValues, logs };
}

function loadProviderPresets() {
  return loadTsModule(path.join(process.cwd(), 'src', 'shared', 'openaiCompatibleProviderPresets.ts'));
}

function createFetchResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

async function captureCall(baseUrl, request = {}) {
  const { aiModule } = loadAiService({ baseUrl, model: 'Pro/zai-org/GLM-4.7', apiKey: 'secret-compatible-key' });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return createFetchResponse({
      choices: [{ message: { content: 'ok' } }],
    });
  };

  const response = await aiModule.callAI({
    prompt: 'hello',
    ...request,
  });

  assert.strictEqual(response.success, true, 'expected callAI to succeed');
  assert.strictEqual(calls.length, 1, 'expected one fetch call');
  return calls[0];
}

async function testEndpointNormalization() {
  const cases = [
    ['https://api.siliconflow.cn/v1', 'https://api.siliconflow.cn/v1/chat/completions'],
    ['https://api.siliconflow.cn/v1/', 'https://api.siliconflow.cn/v1/chat/completions'],
    ['https://api.siliconflow.cn/v1/chat/completions', 'https://api.siliconflow.cn/v1/chat/completions'],
    ['https://generativelanguage.googleapis.com/v1beta/openai/', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
    ['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
    ['https://integrate.api.nvidia.com/v1', 'https://integrate.api.nvidia.com/v1/chat/completions'],
    ['https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1/chat/completions'],
    ['https://api.deepseek.com', 'https://api.deepseek.com/chat/completions'],
    ['https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'],
    ['http://localhost:11434/v1', 'http://localhost:11434/v1/chat/completions'],
    ['http://localhost:1234/v1', 'http://localhost:1234/v1/chat/completions'],
    ['http://localhost:8000/v1', 'http://localhost:8000/v1/chat/completions'],
  ];
  const { aiModule } = loadAiService();

  for (const [input, expected] of cases) {
    assert.strictEqual(aiModule.normalizeOpenAICompatibleEndpoint(input), expected, `expected normalized endpoint for ${input}`);
  }
}

function testProviderPresetCatalog() {
  const {
    OPENAI_COMPATIBLE_PROVIDER_PRESETS,
    findOpenAICompatiblePresetByBaseUrl,
  } = loadProviderPresets();
  const presetsById = new Map(OPENAI_COMPATIBLE_PROVIDER_PRESETS.map((preset) => [preset.id, preset]));
  const expectedPresets = [
    ['openai', 'https://api.openai.com/v1', 'gpt-4o-mini'],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/', 'gemini-2.5-flash'],
    ['siliconflow', 'https://api.siliconflow.cn/v1', 'Pro/zai-org/GLM-4.7'],
    ['deepseek', 'https://api.deepseek.com', 'deepseek-chat'],
    ['qwen-dashscope', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'qwen-plus'],
    ['moonshot-kimi', 'https://api.moonshot.ai/v1', 'kimi-latest'],
    ['openrouter', 'https://openrouter.ai/api/v1', 'openai/gpt-4o-mini'],
    ['nvidia-nim', 'https://integrate.api.nvidia.com/v1', 'meta/llama-3.1-70b-instruct'],
    ['minimax', 'https://api.minimax.io/v1', 'MiniMax-M2.7'],
    ['ollama', 'http://localhost:11434/v1', 'llama3.1'],
    ['lm-studio', 'http://localhost:1234/v1', 'local-model'],
    ['vllm', 'http://localhost:8000/v1', 'local-model'],
    ['custom', '', ''],
  ];

  for (const [id, baseUrl, defaultModel] of expectedPresets) {
    assert(presetsById.has(id), `expected ${id} preset`);
    assert.strictEqual(presetsById.get(id).baseUrl, baseUrl, `expected ${id} baseUrl`);
    assert.strictEqual(presetsById.get(id).defaultModel, defaultModel, `expected ${id} default model`);
  }

  assert.strictEqual(presetsById.get('siliconflow').alternativeModel, 'Qwen/Qwen3.6-35B-A3B');
  assert.strictEqual(findOpenAICompatiblePresetByBaseUrl('https://api.siliconflow.cn/v1').id, 'siliconflow');
  assert.strictEqual(findOpenAICompatiblePresetByBaseUrl('https://example.test/v1').id, 'custom');
}

function testProviderPresetEndpointNormalization() {
  const { aiModule } = loadAiService();
  const { OPENAI_COMPATIBLE_PROVIDER_PRESETS } = loadProviderPresets();
  const endpoints = Object.fromEntries(
    OPENAI_COMPATIBLE_PROVIDER_PRESETS
      .filter((preset) => !preset.isCustom)
      .map((preset) => [preset.id, aiModule.normalizeOpenAICompatibleEndpoint(preset.baseUrl)]),
  );

  assert.strictEqual(endpoints.gemini, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.strictEqual(endpoints.siliconflow, 'https://api.siliconflow.cn/v1/chat/completions');
  assert.strictEqual(endpoints['nvidia-nim'], 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.strictEqual(endpoints.openrouter, 'https://openrouter.ai/api/v1/chat/completions');
  assert.strictEqual(endpoints.deepseek, 'https://api.deepseek.com/chat/completions');
  assert.strictEqual(endpoints['qwen-dashscope'], 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
  assert.strictEqual(endpoints.ollama, 'http://localhost:11434/v1/chat/completions');
  assert.strictEqual(endpoints['lm-studio'], 'http://localhost:1234/v1/chat/completions');
  assert.strictEqual(endpoints.vllm, 'http://localhost:8000/v1/chat/completions');
}

function testConfigSaveReadPreservesBaseUrlPathname() {
  const { aiModule } = loadAiService();
  aiModule.saveAIConfig({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
  });

  const config = aiModule.getAIConfig();
  assert.strictEqual(
    config.baseUrl,
    'https://generativelanguage.googleapis.com/v1beta/openai/',
    'Gemini baseUrl must preserve /v1beta/openai/ pathname',
  );
}

function testGeminiPresetAndManualBaseUrlKeepPathname() {
  const { findOpenAICompatiblePresetByBaseUrl } = loadProviderPresets();
  const preset = findOpenAICompatiblePresetByBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai/');
  assert.strictEqual(preset.id, 'gemini');
  assert.strictEqual(preset.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai/');

  const { aiModule } = loadAiService();
  aiModule.saveAIConfig({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/' });
  const snapshot = aiModule.getAIConfigSnapshot();
  assert.strictEqual(snapshot.profiles.primary.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai/');
}

function testModelNamesWithSlashCanBeSaved() {
  const { aiModule } = loadAiService();
  aiModule.saveAIConfig({ model: 'Pro/zai-org/GLM-4.7' });
  assert.strictEqual(aiModule.getAIConfig().model, 'Pro/zai-org/GLM-4.7');

  aiModule.saveAIConfig({ model: 'openai/gpt-4o-mini' });
  assert.strictEqual(aiModule.getAIConfig().model, 'openai/gpt-4o-mini');
}

async function testRequestBodyUsesCompatibleFieldsOnly() {
  const call = await captureCall('https://api.siliconflow.cn/v1', {
    system: 'system message',
  });
  const body = JSON.parse(call.options.body);

  assert.strictEqual(call.url, 'https://api.siliconflow.cn/v1/chat/completions');
  assert.strictEqual(call.options.method, 'POST');
  assert.strictEqual(call.options.headers['Content-Type'], 'application/json');
  assert.strictEqual(call.options.headers.Authorization, 'Bearer secret-compatible-key');
  assert.strictEqual(body.model, 'Pro/zai-org/GLM-4.7', 'model with slash must remain unchanged in JSON body');
  assert(!String(call.url).includes('Pro/zai-org/GLM-4.7'), 'model must not be included in URL');
  assert.deepStrictEqual(body.messages, [
    { role: 'system', content: 'system message' },
    { role: 'user', content: 'hello' },
  ]);

  const forbiddenFields = [
    'reasoning_effort',
    'enable_thinking',
    'thinking',
    'max_completion_tokens',
    'response_format',
    'tools',
    'tool_choice',
    'parallel_tool_calls',
    'store',
    'metadata',
    'stream',
  ];
  for (const field of forbiddenFields) {
    assert(!(field in body), `compatible request body must not contain ${field}`);
  }
  for (const [key, value] of Object.entries(body)) {
    assert(value !== null && value !== undefined, `compatible request body must not contain null/undefined field ${key}`);
  }
}

async function testRequestBodyKeepsProvidedTemperatureAndMaxTokens() {
  const call = await captureCall('http://localhost:11434/v1', {
    temperature: 0.2,
    maxTokens: 123,
  });
  const body = JSON.parse(call.options.body);

  assert.strictEqual(call.url, 'http://localhost:11434/v1/chat/completions');
  assert.strictEqual(body.temperature, 0.2);
  assert.strictEqual(body.max_tokens, 123);
}

function testResponseParserVariants() {
  const { aiModule } = loadAiService();

  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({ choices: [{ message: { content: 'message content' } }] }),
    'message content',
    'expected choices[0].message.content parser',
  );
  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({ choices: [{ text: 'legacy text' }] }),
    'legacy text',
    'expected choices[0].text parser',
  );
  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({
      choices: [{
        message: {
          content: [
            { type: 'text', text: 'hello ' },
            { type: 'image_url', text: 'ignored' },
            { type: 'text', text: { value: 'world' } },
          ],
        },
      }],
    }),
    'hello world',
    'expected content array text parser',
  );
  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({
      choices: [{ message: { content: { text: { value: 'object content' } } } }],
    }),
    'object content',
    'expected object content parser',
  );
  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({
      choices: [{ delta: { content: 'delta content' } }],
    }),
    'delta content',
    'expected delta content parser',
  );
  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({
      choices: [{ message: { content: '', reasoning_content: 'reasoning fallback' } }],
    }),
    '',
    'reasoning_content must not be used as visible answer fallback',
  );
  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({
      choices: [{ message: { content: 'final answer', reasoning_content: 'hidden reasoning' } }],
    }),
    'final answer',
    'content must win over reasoning_content',
  );
  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({ content: { text: 'top-level content' } }),
    'top-level content',
    'expected top-level content fallback parser',
  );
}

async function testSiliconFlowReasoningResponseStructure() {
  const { aiModule, logs } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3.6-35B-A3B',
    apiKey: 'secret-compatible-key',
  });
  const payload = {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: '',
        reasoning_content: 'safe reasoning fallback from provider',
      },
      finish_reason: 'stop',
    }],
  };
  global.fetch = async () => createFetchResponse(payload);

  const response = await aiModule.callAI({ prompt: 'hello' });
  assert.strictEqual(response.success, false, 'SiliconFlow reasoning-only response should fail cleanly');
  assert.strictEqual(response.error, 'Provider returned reasoning content without final answer.');
  assert(!String(response.content || '').includes('safe reasoning fallback'), 'reasoning must not be returned as visible content');
  assert(!JSON.stringify(logs).includes('secret-compatible-key'), 'logs must not leak API key');
}

async function testReasoningContentIsNeverVisible() {
  const { aiModule } = loadAiService({ apiKey: 'secret-compatible-key' });

  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({
      choices: [{
        message: {
          content: [
            { type: 'text', text: 'visible ' },
            { type: 'reasoning', text: 'hidden thought' },
          ],
          reasoning_content: 'hidden reasoning',
        },
      }],
    }),
    'visible ',
    'content array should return only text parts',
  );

  assert.strictEqual(
    aiModule.parseOpenAICompatibleResponse({
      choices: [{ delta: { reasoning_content: 'hidden streamed reasoning' } }],
    }),
    '',
    'delta.reasoning_content must not be visible',
  );

  global.fetch = async () => createFetchResponse({
    choices: [{ message: { reasoning_content: 'hidden reasoning only' } }],
  });
  const response = await aiModule.callAI({ prompt: 'hello' });
  assert.strictEqual(response.success, false);
  assert.strictEqual(response.error, 'Provider returned reasoning content without final answer.');
  assert(!String(response.content || '').includes('hidden reasoning only'), 'reasoning-only response must not leak as content');
}

function testResponseStructureSummaryIsSafe() {
  const { aiModule } = loadAiService();
  const summary = aiModule.summarizeOpenAICompatibleResponseStructure({
    choices: [{
      message: {
        content: [
          { type: 'text', text: 'x'.repeat(150) },
        ],
      },
      delta: {},
      finish_reason: 'stop',
    }],
    output: null,
    data: null,
    result: null,
    message: null,
    content: null,
  });

  assert.deepStrictEqual(summary.topLevelKeys, ['choices', 'output', 'data', 'result', 'message', 'content']);
  assert.strictEqual(summary.hasChoices, true);
  assert.strictEqual(summary.choicesLength, 1);
  assert.deepStrictEqual(summary.firstChoiceKeys, ['message', 'delta', 'finish_reason']);
  assert.deepStrictEqual(summary.firstMessageKeys, ['content']);
  assert.strictEqual(summary.firstMessageContentType, 'array');
  assert.strictEqual(summary.firstMessageContentTextPreview.length, 100);
  assert.strictEqual(summary.hasFirstDelta, true);
  assert.strictEqual(summary.firstFinishReason, 'stop');
  assert.strictEqual(summary.hasOutput, true);
  assert.strictEqual(summary.hasData, true);
  assert.strictEqual(summary.hasResult, true);
  assert.strictEqual(summary.hasMessage, true);
  assert.strictEqual(summary.hasContent, true);
}

async function testUsageIsOptional() {
  const { aiModule } = loadAiService({ baseUrl: 'https://api.siliconflow.cn/v1' });
  global.fetch = async () => createFetchResponse({
    choices: [{ message: { content: 'content without usage' } }],
  });

  const response = await aiModule.callAI({ prompt: 'hello' });
  assert.strictEqual(response.success, true, 'usage missing should not fail');
  assert.strictEqual(response.content, 'content without usage');
}

async function testProviderErrorDoesNotLeakApiKey() {
  const apiKey = 'secret-compatible-key';
  const { aiModule, logs } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    apiKey,
  });
  global.fetch = async () => createFetchResponse({
    error: {
      message: `bad key ${apiKey}`,
      type: 'invalid_api_key',
    },
  }, 401);

  const response = await aiModule.callAI({ prompt: 'hello' });
  assert.strictEqual(response.success, false, 'provider error should fail cleanly');
  assert(!String(response.error).includes(apiKey), 'response error must not leak API key');
  assert(String(response.error).includes('invalid_api_key'), 'response error should retain provider error type');
  assert(String(response.error).includes('401'), 'response error should retain status code');
  assert(!JSON.stringify(logs).includes(apiKey), 'logs must not leak API key');
}

async function testGeminiMissingBasePath404Hint() {
  const apiKey = 'secret-compatible-key';
  const { aiModule, logs } = loadAiService({
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
    apiKey,
  });
  global.fetch = async () => createFetchResponse({
    error: {
      message: 'Not Found',
      type: 'not_found',
    },
  }, 404);

  const response = await aiModule.callAI({ prompt: 'hello' });
  assert.strictEqual(response.success, false);
  assert(String(response.error).includes('Gemini Base URL may be missing /v1beta/openai'));
  assert(!String(response.error).includes(apiKey), 'response error must not leak API key');
  assert(!JSON.stringify(logs).includes(apiKey), 'logs must not leak API key');
  assert(JSON.stringify(logs).includes('/chat/completions'), 'logs should include normalized host/path diagnostics');
}

async function testProviderTemporaryError503Hint() {
  const { aiModule } = loadAiService({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
  });
  global.fetch = async () => createFetchResponse({
    error: {
      message: 'backend unavailable',
      type: 'unavailable',
    },
  }, 503);

  const response = await aiModule.callAI({ prompt: 'hello' });
  assert.strictEqual(response.success, false);
  assert(String(response.error).includes('Provider upstream temporary error / service unavailable'));
  assert(!String(response.error).includes('missing /v1beta/openai'), '503 must not be reported as a Gemini base path error');
}

async function run() {
  await testEndpointNormalization();
  testProviderPresetCatalog();
  testProviderPresetEndpointNormalization();
  testConfigSaveReadPreservesBaseUrlPathname();
  testGeminiPresetAndManualBaseUrlKeepPathname();
  testModelNamesWithSlashCanBeSaved();
  await testRequestBodyUsesCompatibleFieldsOnly();
  await testRequestBodyKeepsProvidedTemperatureAndMaxTokens();
  testResponseParserVariants();
  await testSiliconFlowReasoningResponseStructure();
  await testReasoningContentIsNeverVisible();
  testResponseStructureSummaryIsSafe();
  await testUsageIsOptional();
  await testProviderErrorDoesNotLeakApiKey();
  await testGeminiMissingBasePath404Hint();
  await testProviderTemporaryError503Hint();
  console.log('openai compatible provider tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
