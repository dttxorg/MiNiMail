import { ipcMain } from 'electron';
import log from 'electron-log';
import {
  deleteModelProfile,
  deleteAIProviderProfile,
  getAIConfig,
  getAIConfigSnapshot,
  getAIProviderProfileSnapshot,
  getProviderAccountsWithModels,
  fetchOpenAICompatibleModels,
  saveAIConfig,
  saveModelProfile,
  saveProviderAccount,
  saveAIProviderProfile,
  setDefaultModelProfile,
  setDefaultAIProviderProfile,
  testOpenAICompatibleConnection,
  getAISettings,
  saveAISettings,
  translateTextInput,
  translateTextSegments,
  summarizeText,
  suggestReply,
  suggestEmailActions,
  suggestQuickReplies,
  extractKeyInfo,
  polishText,
  batchClassifyMails,
  type ScanMode,
  type LookbackRange,
  type AISettings,
  type AIEmailSource,
  type AIProviderTestConnectionRequest,
  type AIProviderModelListRequest,
  type SaveModelProfileInput,
  type SaveProviderAccountInput,
  type SaveProviderProfileInput,
} from '../services/ai';
import {
  buildContactWiki,
  clearContactBehaviorData,
  exportContactBehaviorSummary,
  getContactBehaviorSettings,
  getContactKnowledgeSettings,
  getContactWiki,
  listContactBehaviorInsights,
  listContactKnowledgeStats,
  recordContactMailInteraction,
  reindexContactKnowledge,
  saveContactBehaviorSettings,
  saveContactWikiFeedback,
  saveContactKnowledgeSettings,
  suggestContactReply,
  type BuildContactWikiRequest,
  type ContactBehaviorSettings,
  type ContactMailInteractionRequest,
  type ContactWikiFeedbackRequest,
  type ContactReplySuggestionRequest,
  type ContactKnowledgeSettings,
  type ReindexContactKnowledgeRequest,
} from '../services/contactKnowledgeService';

function sanitizeAIProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
}

export function registerAIHandlers(): void {
  log.info('Registering AI IPC handlers');

  // Get AI API config
  ipcMain.handle('ai:getConfig', async () => {
    try {
      const snapshot = getAIConfigSnapshot();
      const config = getAIConfig();
      return {
        success: true,
        data: {
          baseUrl: config.baseUrl,
          model: config.model,
          hasApiKey: !!config.apiKey,
          activeProfileId: snapshot.activeProfileId,
          profiles: {
            primary: {
              baseUrl: snapshot.profiles.primary.baseUrl,
              model: snapshot.profiles.primary.model,
              hasApiKey: !!snapshot.profiles.primary.apiKey,
            },
            secondary: {
              baseUrl: snapshot.profiles.secondary.baseUrl,
              model: snapshot.profiles.secondary.model,
              hasApiKey: !!snapshot.profiles.secondary.apiKey,
            },
          },
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Save AI API config
  ipcMain.handle('ai:saveConfig', async (_event, config: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    profileId?: 'primary' | 'secondary';
    activeProfileId?: 'primary' | 'secondary';
  }) => {
    try {
      saveAIConfig(config);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('ai:testConnection', async (_event, request: AIProviderTestConnectionRequest) => {
    try {
      return await testOpenAICompatibleConnection(request);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('ai:fetchModels', async (_event, request: AIProviderModelListRequest) => {
    try {
      return await fetchOpenAICompatibleModels(request);
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:getProviderProfiles', async () => {
    try {
      return { success: true, data: getAIProviderProfileSnapshot() };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:saveProviderProfile', async (_event, input: SaveProviderProfileInput) => {
    try {
      const profile = saveAIProviderProfile(input);
      return { success: true, data: { profile, snapshot: getAIProviderProfileSnapshot() } };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:deleteProviderProfile', async (_event, profileId: string) => {
    try {
      return { success: true, data: deleteAIProviderProfile(profileId) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:setDefaultProvider', async (_event, profileId: string) => {
    try {
      setDefaultAIProviderProfile(profileId);
      return { success: true, data: getAIProviderProfileSnapshot() };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:getProviderAccountsWithModels', async () => {
    try {
      return { success: true, data: getProviderAccountsWithModels() };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:saveProviderAccount', async (_event, input: SaveProviderAccountInput) => {
    try {
      const account = saveProviderAccount(input);
      return { success: true, data: { account, snapshot: getProviderAccountsWithModels() } };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:saveModelProfile', async (_event, input: SaveModelProfileInput) => {
    try {
      const profile = saveModelProfile(input);
      return { success: true, data: { profile, snapshot: getProviderAccountsWithModels() } };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:deleteModelProfile', async (_event, modelProfileId: string) => {
    try {
      deleteModelProfile(modelProfileId);
      return { success: true, data: getProviderAccountsWithModels() };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:setDefaultModelProfile', async (_event, modelProfileId: string) => {
    try {
      setDefaultModelProfile(modelProfileId);
      return { success: true, data: getProviderAccountsWithModels() };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  // Get AI behavior settings (scan mode, lookback, auto sort)
  ipcMain.handle('ai:getSettings', async () => {
    try {
      const settings = getAISettings();
      return { success: true, data: settings };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Save AI behavior settings
  ipcMain.handle('ai:saveSettings', async (_event, settings: Partial<AISettings>) => {
    try {
      saveAISettings(settings);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('ai:getContactKnowledgeSettings', async () => {
    try {
      return { success: true, data: getContactKnowledgeSettings() };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:saveContactKnowledgeSettings', async (_event, settings: Partial<ContactKnowledgeSettings>) => {
    try {
      return { success: true, data: saveContactKnowledgeSettings(settings) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:buildContactWiki', async (_event, request: BuildContactWikiRequest) => {
    try {
      return { success: true, data: await buildContactWiki(request) };
    } catch (err) {
      log.warn('[ai:buildContactWiki]', sanitizeAIProviderError(err));
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:getContactWiki', async (_event, request: { accountId: number; contactEmail: string }) => {
    try {
      return { success: true, data: getContactWiki(request) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:reindexContactKnowledge', async (_event, request: ReindexContactKnowledgeRequest) => {
    try {
      const result = await reindexContactKnowledge(request);
      return {
        success: true,
        data: {
          sourceMailCount: result.mails.length,
          chunkCount: result.embedded.length,
        },
      };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:listContactKnowledgeStats', async (_event, request: { accountId: number }) => {
    try {
      return { success: true, data: listContactKnowledgeStats(request) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:saveContactWikiFeedback', async (_event, request: ContactWikiFeedbackRequest) => {
    try {
      return { success: true, data: saveContactWikiFeedback(request) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:contactReplySuggestion', async (_event, request: ContactReplySuggestionRequest) => {
    try {
      return await suggestContactReply(request);
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:getContactBehaviorSettings', async () => {
    try {
      return { success: true, data: getContactBehaviorSettings() };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:saveContactBehaviorSettings', async (_event, settings: Partial<ContactBehaviorSettings>) => {
    try {
      return { success: true, data: saveContactBehaviorSettings(settings) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:recordContactMailInteraction', async (_event, request: ContactMailInteractionRequest) => {
    try {
      return { success: true, data: recordContactMailInteraction(request) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:listContactBehaviorInsights', async (_event, request: { accountId: number; contactEmail?: string; contactEmailHash?: string }) => {
    try {
      return { success: true, data: listContactBehaviorInsights(request) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:exportContactBehaviorSummary', async (_event, request: { accountId: number; contactEmail?: string; contactEmailHash?: string }) => {
    try {
      return { success: true, data: exportContactBehaviorSummary(request) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  ipcMain.handle('ai:clearContactBehaviorData', async (_event, request: { accountId?: number; contactEmail?: string; contactEmailHash?: string }) => {
    try {
      return { success: true, data: clearContactBehaviorData(request || {}) };
    } catch (err) {
      return { success: false, error: sanitizeAIProviderError(err) };
    }
  });

  // Translate text
  ipcMain.handle('ai:translate', async (_event, text: string | AIEmailSource, targetLang: string) => {
    try {
      return await translateTextInput(text, targetLang);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('ai:translateSegments', async (_event, segments: string[], targetLang: string) => {
    try {
      return await translateTextSegments(segments, targetLang);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Summarize text
  ipcMain.handle('ai:summarize', async (_event, text: string | AIEmailSource, targetLang?: string) => {
    try {
      return await summarizeText(text, targetLang);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Suggest reply
  ipcMain.handle('ai:suggestReply', async (_event, emailContent: string | AIEmailSource, targetLang?: string) => {
    try {
      return await suggestReply(emailContent, targetLang);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('ai:suggestActions', async (_event, emailContent: string | AIEmailSource, targetLang?: string) => {
    try {
      return await suggestEmailActions(emailContent, targetLang);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('ai:suggestQuickReplies', async (_event, emailContent: string | AIEmailSource, targetLang?: string) => {
    try {
      return await suggestQuickReplies(emailContent, targetLang);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('ai:extractKeyInfo', async (_event, emailContent: string | AIEmailSource, targetLang?: string) => {
    try {
      return await extractKeyInfo(emailContent, targetLang);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Polish text
  ipcMain.handle(
    'ai:polish',
    async (
      _event,
      text: string,
      style: 'formal' | 'friendly' | 'shorter' | 'longer' | 'proofread' | 'simplify' | 'bullet_points',
      targetLang?: string,
    ) => {
    try {
        return await polishText(text, style, targetLang);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // Batch classify emails — accepts scanMode in payload
  ipcMain.handle('ai:classifyBatch', async (_event, payload: {
    emails: Array<{ id: string; subject: string; from: string; from_name: string; has_attachment: boolean; headers?: Record<string, string | string[] | undefined>; body_html?: string; body_text?: string; snippet: string }>;
    scanMode: ScanMode;
  }) => {
    try {
      const { emails, scanMode = 'light' } = payload;
      const result = await batchClassifyMails(emails, scanMode);
      return result;
    } catch (err) {
      log.error('[ai:classifyBatch]', err);
      return { success: false, error: (err as Error).message };
    }
  });

  log.info('AI IPC handlers registered');
}
