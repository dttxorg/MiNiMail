import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testAIIPCExposesContactKnowledgeHandlers() {
  const ipc = read('src/main/ipc/ai.ts');
  for (const channel of [
    'ai:getContactKnowledgeSettings',
    'ai:saveContactKnowledgeSettings',
    'ai:buildContactWiki',
    'ai:getContactWiki',
    'ai:reindexContactKnowledge',
    'ai:listContactKnowledgeStats',
    'ai:saveContactWikiFeedback',
    'ai:contactReplySuggestion',
    'ai:getContactBehaviorSettings',
    'ai:saveContactBehaviorSettings',
    'ai:recordContactMailInteraction',
    'ai:listContactBehaviorInsights',
    'ai:exportContactBehaviorSummary',
    'ai:clearContactBehaviorData',
  ]) {
    assert(ipc.includes(`ipcMain.handle('${channel}'`), `Expected ${channel} handler`);
  }
  assert(ipc.includes('sanitizeAIProviderError(err)'), 'Expected contact knowledge IPC errors to be sanitized');
}

function testPreloadAllowlistContainsContactKnowledgeChannels() {
  const preload = read('src/preload/index.ts');
  for (const channel of [
    'ai:getContactKnowledgeSettings',
    'ai:saveContactKnowledgeSettings',
    'ai:buildContactWiki',
    'ai:getContactWiki',
    'ai:reindexContactKnowledge',
    'ai:listContactKnowledgeStats',
    'ai:saveContactWikiFeedback',
    'ai:contactReplySuggestion',
    'ai:getContactBehaviorSettings',
    'ai:saveContactBehaviorSettings',
    'ai:recordContactMailInteraction',
    'ai:listContactBehaviorInsights',
    'ai:exportContactBehaviorSummary',
    'ai:clearContactBehaviorData',
  ]) {
    assert(preload.includes(`'${channel}'`), `Expected preload allowlist to include ${channel}`);
  }
  assert(preload.includes('throw new Error(`Invalid IPC channel: ${channel}`)'), 'Expected unknown IPC channels to remain blocked');
  const types = read('src/preload/electronAPI.d.ts');
  assert(types.includes('ContactKnowledgeIpcChannel'), 'Expected contact knowledge IPC type declarations');
  assert(types.includes("'ai:recordContactMailInteraction'"), 'Expected behavior IPC channel type declaration');
}

function testRendererUsesContactWikiBeforeReplyFallback() {
  const detail = read('src/renderer/components/MailDetail.tsx');
  assert(detail.includes('Contact Wiki'), 'Expected MailDetail to render the contact wiki panel');
  assert(detail.includes('suggestContactReplyDetailed({'), 'Expected AI reply to use contact wiki reply suggestions');
  assert(detail.includes('saveContactWikiFeedback'), 'Expected MailDetail to support local feedback capture');
  assert(detail.includes('activeProjects'), 'Expected MailDetail to render structured wiki fields');
  assert(detail.includes('recordContactMailInteraction'), 'Expected MailDetail to record opt-in low-sensitivity behavior events');
  assert(detail.includes('contactWiki.valueForUser'), 'Expected MailDetail to render user-centered wiki value fields');
  assert(detail.includes('targetLang: normalizeAiLanguage(aiTargetLanguage)'), 'Expected wiki builds to follow the app AI language setting');
  assert(detail.indexOf('const loadContactWiki') > detail.indexOf('export function MailDetail'), 'Expected contact wiki loading to live at the contact view level');
  assert(detail.includes('suggestReplyDetailed(aiPayload, normalizedLanguage)'), 'Expected single-mail reply fallback to remain');
}

function testSettingsExposeEmbeddingModelSetup() {
  const settings = read('src/renderer/components/SettingsModal.tsx');
  const presets = read('src/shared/openaiCompatibleProviderPresets.ts');
  const modelStore = read('src/main/services/ai/aiModelProfileStore.ts');
  assert(settings.includes('联系人 Wiki Embedding 模型'), 'Expected Settings AI page to expose Contact Wiki embedding model setup');
  assert(settings.includes('联系人行为学习'), 'Expected Settings AI page to expose behavior learning opt-in');
  assert(settings.includes('不记录正文、完整 URL、附件路径或邮箱地址'), 'Expected Settings to disclose behavior learning privacy boundaries');
  assert(settings.includes('handleSaveEmbeddingModelProfile'), 'Expected Settings to save a dedicated embedding model profile');
  assert(settings.includes("taskType: 'embedding'"), 'Expected Settings embedding setup to mark the model profile task type');
  assert(settings.includes('selectedProviderAccountPreset.defaultEmbeddingModel'), 'Expected Settings to suggest provider-specific embedding models');
  assert(presets.includes('defaultEmbeddingModel'), 'Expected provider presets to include default embedding model recommendations');
  assert(modelStore.includes('profile.taskType === input.taskType'), 'Expected model store to keep only one profile for each task type');
  assert(modelStore.includes('inferEmbeddingModel'), 'Expected model store to infer an embedding model from the current provider when no embedding profile exists');
  assert(modelStore.includes("taskType === 'embedding'"), 'Expected embedding task config to have a dedicated fallback path');
}

function run() {
  testAIIPCExposesContactKnowledgeHandlers();
  testPreloadAllowlistContainsContactKnowledgeChannels();
  testRendererUsesContactWikiBeforeReplyFallback();
  testSettingsExposeEmbeddingModelSetup();
  console.log('contact knowledge IPC tests passed');
}

run();
