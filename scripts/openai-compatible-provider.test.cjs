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
    ai_api_key: Object.prototype.hasOwnProperty.call(config, 'apiKey') ? config.apiKey : 'test-api-key',
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
    text: async () => JSON.stringify(payload),
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

function testModelEndpointNormalization() {
  const { aiModule } = loadAiService();
  const cases = [
    ['https://api.siliconflow.cn/v1', 'https://api.siliconflow.cn/v1/models'],
    ['https://api.siliconflow.cn/v1/chat/completions', 'https://api.siliconflow.cn/v1/models'],
    ['https://generativelanguage.googleapis.com/v1beta/openai/', 'https://generativelanguage.googleapis.com/v1beta/openai/models'],
    ['http://localhost:1234/v1', 'http://localhost:1234/v1/models'],
  ];

  for (const [input, expected] of cases) {
    assert.strictEqual(
      aiModule.normalizeOpenAICompatibleModelListEndpoint(input),
      expected,
      `expected ${input} to normalize to models endpoint`,
    );
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
  const {
    OPENAI_COMPATIBLE_PROVIDER_PRESETS,
    normalizeOpenAICompatibleChatEndpoint,
  } = loadProviderPresets();
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
  assert.strictEqual(
    normalizeOpenAICompatibleChatEndpoint('https://generativelanguage.googleapis.com/v1beta/openai/'),
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    'renderer endpoint preview must preserve Gemini /v1beta/openai path',
  );
  assert.strictEqual(
    normalizeOpenAICompatibleChatEndpoint('https://api.siliconflow.cn/v1/chat/completions'),
    'https://api.siliconflow.cn/v1/chat/completions',
    'renderer endpoint preview must not duplicate full chat completions endpoint',
  );
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

async function testConnectionUsesMinimalPromptAndSanitizedResult() {
  const apiKey = 'secret-compatible-key';
  const { aiModule, logs } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Pro/zai-org/GLM-4.7',
    apiKey,
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return createFetchResponse({
      choices: [{ message: { content: 'OK' } }],
    });
  };

  const response = await aiModule.testOpenAICompatibleConnection({
    profileId: 'primary',
    providerId: 'siliconflow',
    providerLabel: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Pro/zai-org/GLM-4.7',
  });

  assert.strictEqual(response.success, true);
  assert.strictEqual(response.endpointHost, 'api.siliconflow.cn');
  assert.strictEqual(response.endpointPath, '/v1/chat/completions');
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.parsedPreview, 'OK');
  assert.strictEqual(calls.length, 1);
  const body = JSON.parse(calls[0].options.body);
  assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'Reply with OK.' }]);
  assert.strictEqual(body.model, 'Pro/zai-org/GLM-4.7');
  assert.strictEqual(body.temperature, 0);
  assert.strictEqual(body.max_tokens, 512);
  for (const field of ['reasoning_effort', 'enable_thinking', 'thinking', 'response_format', 'tools', 'max_completion_tokens']) {
    assert(!(field in body), `test connection request body must not contain ${field}`);
  }
  assert(!JSON.stringify(logs).includes(apiKey), 'test connection logs must not leak API key');
  assert(!JSON.stringify(response).includes(apiKey), 'test connection response must not leak API key');
}

async function testConnectionProviderErrorDoesNotLeakApiKey() {
  const apiKey = 'secret-compatible-key';
  const { aiModule, logs } = loadAiService({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
    apiKey,
  });
  global.fetch = async () => createFetchResponse({
    error: {
      message: `bad key ${apiKey}`,
      type: 'invalid_api_key',
    },
  }, 401);

  const response = await aiModule.testOpenAICompatibleConnection({
    profileId: 'primary',
    providerId: 'gemini',
    providerLabel: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
  });

  assert.strictEqual(response.success, false);
  assert.strictEqual(response.endpointHost, 'generativelanguage.googleapis.com');
  assert.strictEqual(response.endpointPath, '/v1beta/openai/chat/completions');
  assert.strictEqual(response.status, 401);
  assert(String(response.error).includes('[REDACTED_API_KEY]'), 'test connection error should redact API key');
  assert(!JSON.stringify(response).includes(apiKey), 'test connection result must not leak API key');
  assert(!JSON.stringify(logs).includes(apiKey), 'test connection logs must not leak API key');
}

async function testConnectionGemini429JsonErrorBodyIsParsedAndRedacted() {
  const apiKey = 'secret-gemini-key';
  const { aiModule, logs } = loadAiService({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash-lite',
    apiKey,
  });
  global.fetch = async () => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({
      error: {
        code: 429,
        message: `Quota exceeded for API key ${apiKey}`,
        status: 'RESOURCE_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [
              {
                quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
                quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
              },
            ],
          },
        ],
      },
    }),
  });

  const response = await aiModule.testOpenAICompatibleConnection({
    profileId: 'primary',
    providerId: 'gemini',
    providerLabel: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash-lite',
  });

  assert.strictEqual(response.success, false);
  assert.strictEqual(response.status, 429);
  assert(String(response.error).includes('Quota exceeded'), 'Gemini 429 message should be visible');
  assert(String(response.error).includes('status: RESOURCE_EXHAUSTED'), 'Gemini 429 status should be visible');
  assert(String(response.error).includes('code: 429'), 'Gemini 429 code should be visible');
  assert(String(response.error).includes('HTTP 429'), 'HTTP status should be visible');
  assert(String(response.error).includes('QuotaFailure'), 'Gemini 429 details should be summarized');
  assert(String(response.error).includes('[REDACTED_API_KEY]'), 'Gemini 429 error should redact API key');
  assert(!JSON.stringify(response).includes(apiKey), 'test connection result must not leak API key');
  assert(!JSON.stringify(logs).includes(apiKey), 'test connection logs must not leak API key');
}

async function testConnectionPlainTextErrorBodyIsRedactedAndTruncated() {
  const apiKey = 'secret-compatible-key';
  const { aiModule, logs } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Pro/zai-org/GLM-4.7',
    apiKey,
  });
  const longErrorText = `bad key ${apiKey} ${'x'.repeat(400)}`;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => longErrorText,
  });

  const response = await aiModule.testOpenAICompatibleConnection({
    profileId: 'primary',
    providerId: 'siliconflow',
    providerLabel: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Pro/zai-org/GLM-4.7',
  });

  assert.strictEqual(response.success, false);
  assert.strictEqual(response.status, 500);
  assert(String(response.error).includes('[REDACTED_API_KEY]'), 'plain text error should redact API key');
  assert(String(response.error).includes('HTTP 500'), 'HTTP status should be visible');
  assert(!String(response.error).includes('x'.repeat(301)), 'plain text error body should be truncated');
  assert(!JSON.stringify(response).includes(apiKey), 'test connection result must not leak API key');
  assert(!JSON.stringify(logs).includes(apiKey), 'test connection logs must not leak API key');
}

function testFriendlyProviderErrorMessages() {
  const { aiModule } = loadAiService();
  const cases = [
    [401, 'API key or provider permission may be invalid.'],
    [403, 'API key or provider permission may be invalid.'],
    [404, 'Endpoint or model may be incorrect.'],
    [429, 'Quota exceeded or rate limited by provider.'],
    [500, 'Provider upstream temporary error.'],
    [502, 'Provider upstream temporary error.'],
    [503, 'Provider upstream temporary error.'],
  ];

  for (const [status, expected] of cases) {
    assert.strictEqual(
      aiModule.getProviderFriendlyMessage({ status, operation: 'testConnection' }),
      expected,
      `expected friendly message for HTTP ${status}`,
    );
  }
  assert.strictEqual(
    aiModule.getProviderFriendlyMessage({ error: 'fetch failed', operation: 'fetchModels' }),
    'Network error. Check your connection or provider availability.',
  );
  assert.strictEqual(
    aiModule.getProviderFriendlyMessage({ error: 'fetch failed', operation: 'fetchModels', localProvider: true }),
    'Ollama / LM Studio / vLLM local server may not be running.',
  );
}

function testSafeProviderDiagnosticsWhitelist() {
  const { aiModule } = loadAiService();
  const apiKey = ['sk', 'thisShouldNeverAppearInDiagnostics1234567890'].join('-');
  const diagnostics = aiModule.buildSafeProviderDiagnostics({
    appVersion: '1.0.0',
    platform: 'darwin',
    provider: { id: 'custom', label: 'Custom OpenAI Compatible' },
    endpointHost: 'api.example.com',
    endpointPath: '/v1/chat/completions',
    model: 'openai/gpt-4o-mini',
    operation: 'testConnection',
    status: 401,
    errorSummary: `Authorization: Bearer ${apiKey} failed`,
    responseStructureSummary: { topLevelKeys: ['error'] },
    timestamp: '2026-04-29T00:00:00.000Z',
    prompt: 'Reply with OK.',
    emailBody: 'private email body',
    emailSubject: 'private subject',
    contacts: ['person@example.com'],
    attachmentNames: ['invoice.pdf'],
  });
  const serialized = JSON.stringify(diagnostics);

  assert(serialized.includes('api.example.com'), 'safe diagnostics should include endpoint host');
  assert(serialized.includes('/v1/chat/completions'), 'safe diagnostics should include endpoint path');
  assert(!serialized.includes(apiKey), 'safe diagnostics must not include API key');
  assert(!serialized.includes(`Authorization: Bearer ${apiKey}`), 'safe diagnostics must not include Authorization header');
  assert(!serialized.includes('Reply with OK.'), 'safe diagnostics must not include prompt');
  assert(!serialized.includes('private email body'), 'safe diagnostics must not include email body');
  assert(!serialized.includes('private subject'), 'safe diagnostics must not include email subject');
  assert(!serialized.includes('person@example.com'), 'safe diagnostics must not include contacts');
  assert(!serialized.includes('invoice.pdf'), 'safe diagnostics must not include attachment names');
}

async function testConnectionReasoningOnlyResponseFailsCleanly() {
  const { aiModule } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3.6-35B-A3B',
    apiKey: 'secret-compatible-key',
  });
  global.fetch = async () => createFetchResponse({
    choices: [{ message: { reasoning_content: 'hidden reasoning only' } }],
  });

  const response = await aiModule.testOpenAICompatibleConnection({
    profileId: 'primary',
    providerId: 'siliconflow',
    providerLabel: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3.6-35B-A3B',
  });

  assert.strictEqual(response.success, false);
  assert.strictEqual(response.error, 'Provider returned reasoning content without final answer.');
  assert(!JSON.stringify(response).includes('hidden reasoning only'), 'reasoning content must not be returned to renderer');
}

function testModelListParserVariants() {
  const { aiModule } = loadAiService();

  assert.deepStrictEqual(
    aiModule.parseOpenAICompatibleModelList({
      data: [
        { id: 'Pro/zai-org/GLM-4.7' },
        { id: 'openai/gpt-4o-mini' },
      ],
    }),
    ['Pro/zai-org/GLM-4.7', 'openai/gpt-4o-mini'],
    'expected OpenAI-style data objects to parse',
  );

  assert.deepStrictEqual(
    aiModule.parseOpenAICompatibleModelList({ data: ['model-a', 'vendor/model:b.1'] }),
    ['model-a', 'vendor/model:b.1'],
    'expected string model arrays to parse',
  );

  assert.deepStrictEqual(
    aiModule.parseOpenAICompatibleModelList({
      models: [
        { id: 'local/model:latest' },
        { id: 'local/model:latest' },
        { name: 'fallback-name' },
      ],
    }),
    ['local/model:latest', 'fallback-name'],
    'expected models objects to parse and deduplicate',
  );
}

async function testFetchModelsUsesNormalizedEndpointAndBearerAuth() {
  const apiKey = 'secret-compatible-key';
  const { aiModule, logs } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    apiKey,
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return createFetchResponse({
      data: [
        { id: 'Pro/zai-org/GLM-4.7' },
        { id: 'Qwen/Qwen3.6-35B-A3B' },
      ],
    });
  };

  const response = await aiModule.fetchOpenAICompatibleModels({
    profileId: 'primary',
    providerId: 'siliconflow',
    providerLabel: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
  });

  assert.strictEqual(response.success, true);
  assert.strictEqual(response.endpointHost, 'api.siliconflow.cn');
  assert.strictEqual(response.endpointPath, '/v1/models');
  assert.deepStrictEqual(response.models, ['Pro/zai-org/GLM-4.7', 'Qwen/Qwen3.6-35B-A3B']);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://api.siliconflow.cn/v1/models');
  assert.strictEqual(calls[0].options.method, 'GET');
  assert.strictEqual(calls[0].options.headers.Authorization, `Bearer ${apiKey}`);
  assert(!JSON.stringify(logs).includes(apiKey), 'model list logs must not leak API key');
}

async function testFetchModelsKeepsGeminiBasePath() {
  const { aiModule } = loadAiService({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: 'secret-gemini-key',
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return createFetchResponse({ data: ['gemini-2.5-flash', 'gemini-3-flash-preview'] });
  };

  const response = await aiModule.fetchOpenAICompatibleModels({
    profileId: 'primary',
    providerId: 'gemini',
    providerLabel: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });

  assert.strictEqual(response.success, true);
  assert.strictEqual(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/models');
  assert.strictEqual(response.endpointPath, '/v1beta/openai/models');
  assert.deepStrictEqual(response.models, ['gemini-2.5-flash', 'gemini-3-flash-preview']);
}

async function testFetchModelsAllowsLocalProviderWithoutApiKey() {
  const { aiModule } = loadAiService({
    baseUrl: 'http://localhost:1234/v1',
    apiKey: '',
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return createFetchResponse({ data: [{ id: 'local/model:latest' }] });
  };

  const response = await aiModule.fetchOpenAICompatibleModels({
    profileId: 'primary',
    providerId: 'lm-studio',
    providerLabel: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    localProvider: true,
  });

  assert.strictEqual(response.success, true);
  assert.strictEqual(calls[0].url, 'http://localhost:1234/v1/models');
  assert(!('Authorization' in calls[0].options.headers), 'local model list request should allow no Authorization header');
  assert.deepStrictEqual(response.models, ['local/model:latest']);
}

async function testFetchModelsRequiresApiKeyForRemoteProvider() {
  const { aiModule } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
  });
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return createFetchResponse({ data: [] });
  };

  const response = await aiModule.fetchOpenAICompatibleModels({
    profileId: 'primary',
    providerId: 'siliconflow',
    providerLabel: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
  });

  assert.strictEqual(response.success, false);
  assert.strictEqual(fetchCalled, false);
  assert(String(response.error).includes('API key not configured'));
}

async function testFetchModelsProviderErrorIsRedacted() {
  const apiKey = 'secret-compatible-key';
  const { aiModule, logs } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey,
  });
  global.fetch = async () => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({
      error: {
        message: `Quota exceeded for ${apiKey}`,
        code: 'rate_limit_exceeded',
        status: 'RESOURCE_EXHAUSTED',
      },
    }),
  });

  const response = await aiModule.fetchOpenAICompatibleModels({
    profileId: 'primary',
    providerId: 'siliconflow',
    providerLabel: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
  });

  assert.strictEqual(response.success, false);
  assert.strictEqual(response.status, 429);
  assert(String(response.error).includes('[REDACTED_API_KEY]'), 'model list error should redact API key');
  assert(String(response.error).includes('status: RESOURCE_EXHAUSTED'), 'model list error should include provider status');
  assert(String(response.error).includes('code: rate_limit_exceeded'), 'model list error should include provider code');
  assert(!JSON.stringify(response).includes(apiKey), 'model list response must not leak API key');
  assert(!JSON.stringify(logs).includes(apiKey), 'model list logs must not leak API key');
}

async function testFetchModelsLocalOfflineFriendlyMessage() {
  const { aiModule } = loadAiService({
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    apiKey: '',
  });
  global.fetch = async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:1234');
  };

  const response = await aiModule.fetchOpenAICompatibleModels({
    profileId: 'primary',
    providerId: 'lm-studio',
    providerLabel: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    localProvider: true,
  });

  assert.strictEqual(response.success, false);
  assert.strictEqual(response.model, 'local-model');
  assert.strictEqual(response.operation, 'fetchModels');
  assert(String(response.friendlyMessage).includes('local server may not be running'));
  assert(String(response.errorSummary).includes('ECONNREFUSED'), 'network error summary should be visible');
}

async function testFetchModelsFailureKeepsCurrentModel() {
  const { aiModule } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Pro/zai-org/GLM-4.7',
    apiKey: 'secret-compatible-key',
  });
  global.fetch = async () => createFetchResponse({
    error: { message: 'not found' },
  }, 404);

  const response = await aiModule.fetchOpenAICompatibleModels({
    profileId: 'primary',
    providerId: 'siliconflow',
    providerLabel: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Pro/zai-org/GLM-4.7',
  });

  assert.strictEqual(response.success, false);
  assert.strictEqual(response.model, 'Pro/zai-org/GLM-4.7');
  assert.strictEqual(response.status, 404);
  assert.strictEqual(response.friendlyMessage, 'Endpoint or model may be incorrect.');
}

function testProviderProfilesMigrateLegacyPrimaryAsDefault() {
  const apiKey = 'secret-primary-provider-key';
  const { aiModule, dbValues, secureValues } = loadAiService({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
    apiKey,
  });

  const snapshot = aiModule.getAIProviderProfileSnapshot();
  const primary = snapshot.profiles.find((profile) => profile.id === 'primary');

  assert.strictEqual(snapshot.defaultProviderId, 'primary');
  assert(primary, 'legacy primary should migrate into provider profiles');
  assert.strictEqual(primary.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai/');
  assert.strictEqual(primary.model, 'gemini-2.5-flash');
  assert.strictEqual(primary.providerPresetId, 'gemini');
  assert.strictEqual(primary.hasApiKey, true);
  assert.strictEqual(primary.isDefault, true);
  assert(!JSON.stringify(snapshot).includes(apiKey), 'provider profile snapshot must not include raw API key');
  assert(!String(dbValues.ai_provider_profiles).includes(apiKey), 'provider metadata must not include raw API key');
  assert.strictEqual(secureValues.ai_api_key, apiKey, 'legacy secure key should be retained');
  assert.strictEqual(secureValues.ai_provider_api_key_primary, apiKey, 'provider secure key should be copied');
  assert.deepStrictEqual(aiModule.getAIConfig(), {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey,
    model: 'gemini-2.5-flash',
  });
}

function testProviderProfilesMigrateLegacySecondaryAndActiveDefault() {
  const { aiModule, dbValues, secureValues } = loadAiService({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'secret-primary-key',
  });
  dbValues.ai_active_profile = 'secondary';
  dbValues.ai_secondary_base_url = 'https://api.siliconflow.cn/v1';
  dbValues.ai_secondary_model = 'Pro/zai-org/GLM-4.7';
  secureValues.ai_secondary_api_key = 'secret-secondary-key';

  const snapshot = aiModule.getAIProviderProfileSnapshot();
  const secondary = snapshot.profiles.find((profile) => profile.id === 'secondary');

  assert.strictEqual(snapshot.defaultProviderId, 'secondary');
  assert(secondary, 'legacy secondary should migrate into provider profiles');
  assert.strictEqual(secondary.baseUrl, 'https://api.siliconflow.cn/v1');
  assert.strictEqual(secondary.model, 'Pro/zai-org/GLM-4.7');
  assert.strictEqual(secondary.providerPresetId, 'siliconflow');
  assert.strictEqual(secondary.hasApiKey, true);
  assert.strictEqual(secondary.isDefault, true);
  assert.strictEqual(secureValues.ai_secondary_api_key, 'secret-secondary-key', 'legacy secondary secure key should be retained');
  assert.strictEqual(secureValues.ai_provider_api_key_secondary, 'secret-secondary-key', 'secondary provider secure key should be copied');
  assert.deepStrictEqual(aiModule.getAIConfig(), {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: 'secret-secondary-key',
    model: 'Pro/zai-org/GLM-4.7',
  });
}

function testProviderProfileMigrationIsIdempotent() {
  const { aiModule, dbValues } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Pro/zai-org/GLM-4.7',
    apiKey: 'secret-compatible-key',
  });

  const first = aiModule.getAIProviderProfileSnapshot();
  const storedOnce = dbValues.ai_provider_profiles;
  const second = aiModule.getAIProviderProfileSnapshot();

  assert.strictEqual(first.profiles.length, second.profiles.length);
  assert.strictEqual(dbValues.ai_provider_profiles, storedOnce, 'provider profile migration should not rewrite existing profiles');
}

function testExistingProviderProfilesDoNotRepeatLegacyMigration() {
  const { aiModule, dbValues } = loadAiService({
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Pro/zai-org/GLM-4.7',
    apiKey: 'secret-compatible-key',
  });
  dbValues.ai_provider_profiles = JSON.stringify([
    {
      id: 'custom-existing',
      providerPresetId: 'custom',
      label: 'Existing Custom',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]);
  dbValues.ai_default_provider_id = 'custom-existing';

  const snapshot = aiModule.getAIProviderProfileSnapshot();
  assert.strictEqual(snapshot.profiles.length, 1, 'existing provider profile metadata should not be remigrated');
  assert.strictEqual(snapshot.profiles[0].id, 'custom-existing');
}

function testDefaultProviderSwitchControlsGetAIConfig() {
  const { aiModule, dbValues, secureValues } = loadAiService({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'secret-primary-key',
  });
  dbValues.ai_secondary_base_url = 'https://api.siliconflow.cn/v1';
  dbValues.ai_secondary_model = 'Pro/zai-org/GLM-4.7';
  secureValues.ai_secondary_api_key = 'secret-secondary-key';

  aiModule.getAIProviderProfileSnapshot();
  aiModule.setDefaultAIProviderProfile('secondary');
  assert.strictEqual(dbValues.ai_active_profile, 'secondary', 'legacy active profile should sync for secondary default');
  assert.deepStrictEqual(aiModule.getAIConfig(), {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: 'secret-secondary-key',
    model: 'Pro/zai-org/GLM-4.7',
  });

  aiModule.setDefaultAIProviderProfile('primary');
  assert.strictEqual(dbValues.ai_active_profile, 'primary', 'legacy active profile should sync for primary default');
  assert.deepStrictEqual(aiModule.getAIConfig(), {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'secret-primary-key',
    model: 'gpt-4o-mini',
  });
}

function testSaveProviderProfileAddsAndUpdatesMetadata() {
  const { aiModule, dbValues, secureValues } = loadAiService({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'secret-primary-key',
  });

  const added = aiModule.saveAIProviderProfile({
    id: 'custom_siliconflow',
    providerPresetId: 'siliconflow',
    label: 'Work SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Pro/zai-org/GLM-4.7',
    apiKey: 'secret-new-provider-key',
    isDefault: true,
  });
  assert.strictEqual(added.id, 'custom_siliconflow');
  assert.strictEqual(added.hasApiKey, true);
  assert.strictEqual(secureValues.ai_provider_api_key_custom_siliconflow, 'secret-new-provider-key');
  assert(!String(dbValues.ai_provider_profiles).includes('secret-new-provider-key'), 'provider metadata must not contain API key');
  assert.deepStrictEqual(aiModule.getAIConfig(), {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: 'secret-new-provider-key',
    model: 'Pro/zai-org/GLM-4.7',
  });

  aiModule.saveAIProviderProfile({
    id: 'custom_siliconflow',
    providerPresetId: 'siliconflow',
    label: 'Updated SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3.6-35B-A3B',
    apiKey: '',
  });
  assert.strictEqual(
    secureValues.ai_provider_api_key_custom_siliconflow,
    'secret-new-provider-key',
    'empty API key should not overwrite existing provider key',
  );
  const updated = aiModule.getAIProviderProfileSnapshot().profiles.find((profile) => profile.id === 'custom_siliconflow');
  assert(updated, 'updated provider should remain in snapshot');
  assert.strictEqual(updated.label, 'Updated SiliconFlow');
  assert.strictEqual(updated.model, 'Qwen/Qwen3.6-35B-A3B');
}

function testSaveLegacyProviderProfileKeepsOldSettingsInSync() {
  const { aiModule, dbValues, secureValues } = loadAiService({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'secret-primary-key',
  });

  aiModule.saveAIProviderProfile({
    id: 'secondary',
    providerPresetId: 'gemini',
    label: 'Profile B',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
    apiKey: 'secret-secondary-new-key',
    isDefault: true,
  });

  assert.strictEqual(dbValues.ai_secondary_base_url, 'https://generativelanguage.googleapis.com/v1beta/openai/');
  assert.strictEqual(dbValues.ai_secondary_model, 'gemini-2.5-flash');
  assert.strictEqual(dbValues.ai_active_profile, 'secondary');
  assert.strictEqual(secureValues.ai_secondary_api_key, 'secret-secondary-new-key');
  assert.strictEqual(secureValues.ai_provider_api_key_secondary, 'secret-secondary-new-key');
}

function testDeleteNonDefaultProviderRemovesOnlyProviderKey() {
  const { aiModule, dbValues, secureValues } = loadAiService({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'secret-primary-key',
  });
  aiModule.saveAIProviderProfile({
    id: 'custom_delete_me',
    providerPresetId: 'custom',
    label: 'Delete Me',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    apiKey: 'secret-delete-key',
  });

  aiModule.deleteAIProviderProfile('custom_delete_me');
  const snapshot = aiModule.getAIProviderProfileSnapshot();
  assert(!snapshot.profiles.some((profile) => profile.id === 'custom_delete_me'));
  assert.strictEqual(secureValues.ai_provider_api_key_custom_delete_me, undefined, 'provider secure key should be deleted');
  assert.strictEqual(secureValues.ai_api_key, 'secret-primary-key', 'legacy primary key should not be deleted');
  assert.strictEqual(dbValues.ai_default_provider_id, 'primary');
}

function testDeleteDefaultProviderFallsBack() {
  const { aiModule, dbValues, secureValues } = loadAiService({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'secret-primary-key',
  });
  aiModule.saveAIProviderProfile({
    id: 'custom_default_delete',
    providerPresetId: 'custom',
    label: 'Default Delete',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    apiKey: 'secret-delete-default-key',
    isDefault: true,
  });

  aiModule.deleteAIProviderProfile('custom_default_delete');
  assert.strictEqual(dbValues.ai_default_provider_id, 'primary', 'default should fall back after deleting default provider');
  assert.strictEqual(dbValues.ai_active_profile, 'primary', 'legacy active profile should sync when fallback is primary');
  assert.strictEqual(secureValues.ai_provider_api_key_custom_default_delete, undefined);
  assert.deepStrictEqual(aiModule.getAIConfig(), {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'secret-primary-key',
    model: 'gpt-4o-mini',
  });
}

function testDeleteProviderGuards() {
  const { aiModule, dbValues } = loadAiService({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'secret-primary-key',
  });

  assert.throws(
    () => aiModule.deleteAIProviderProfile('primary'),
    /legacy profiles cannot be deleted/i,
    'primary should not be deletable in Phase 4B',
  );
  assert.throws(
    () => aiModule.deleteAIProviderProfile('../bad'),
    /invalid AI provider profile id/i,
    'unsafe provider ids should be rejected',
  );

  dbValues.ai_provider_profiles = JSON.stringify([
    {
      id: 'custom_only',
      providerPresetId: 'custom',
      label: 'Only',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]);
  dbValues.ai_default_provider_id = 'custom_only';
  assert.throws(
    () => aiModule.deleteAIProviderProfile('custom_only'),
    /at least one AI provider profile is required/i,
    'last provider should not be deletable',
  );
}

function testMissingDefaultProviderFallsBackToLegacyActiveProfile() {
  const { aiModule, dbValues, secureValues } = loadAiService({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'secret-primary-key',
  });
  dbValues.ai_provider_profiles = JSON.stringify([
    {
      id: 'custom-existing',
      providerPresetId: 'custom',
      label: 'Existing Custom',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]);
  dbValues.ai_default_provider_id = 'missing-provider';
  dbValues.ai_active_profile = 'secondary';
  dbValues.ai_secondary_base_url = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  dbValues.ai_secondary_model = 'gemini-2.5-flash';
  secureValues.ai_secondary_api_key = 'secret-secondary-key';

  assert.deepStrictEqual(aiModule.getAIConfig(), {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: 'secret-secondary-key',
    model: 'gemini-2.5-flash',
  });
}

async function run() {
  await testEndpointNormalization();
  testModelEndpointNormalization();
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
  await testConnectionUsesMinimalPromptAndSanitizedResult();
  await testConnectionProviderErrorDoesNotLeakApiKey();
  await testConnectionGemini429JsonErrorBodyIsParsedAndRedacted();
  await testConnectionPlainTextErrorBodyIsRedactedAndTruncated();
  testFriendlyProviderErrorMessages();
  testSafeProviderDiagnosticsWhitelist();
  await testConnectionReasoningOnlyResponseFailsCleanly();
  testModelListParserVariants();
  await testFetchModelsUsesNormalizedEndpointAndBearerAuth();
  await testFetchModelsKeepsGeminiBasePath();
  await testFetchModelsAllowsLocalProviderWithoutApiKey();
  await testFetchModelsRequiresApiKeyForRemoteProvider();
  await testFetchModelsProviderErrorIsRedacted();
  await testFetchModelsLocalOfflineFriendlyMessage();
  await testFetchModelsFailureKeepsCurrentModel();
  testProviderProfilesMigrateLegacyPrimaryAsDefault();
  testProviderProfilesMigrateLegacySecondaryAndActiveDefault();
  testProviderProfileMigrationIsIdempotent();
  testExistingProviderProfilesDoNotRepeatLegacyMigration();
  testDefaultProviderSwitchControlsGetAIConfig();
  testSaveProviderProfileAddsAndUpdatesMetadata();
  testSaveLegacyProviderProfileKeepsOldSettingsInSync();
  testDeleteNonDefaultProviderRemovesOnlyProviderKey();
  testDeleteDefaultProviderFallsBack();
  testDeleteProviderGuards();
  testMissingDefaultProviderFallsBackToLegacyActiveProfile();
  console.log('openai compatible provider tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
