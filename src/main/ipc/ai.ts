import { ipcMain } from 'electron';
import log from 'electron-log';
import { getAIConfig, saveAIConfig, translateText, summarizeText, suggestReply, polishText } from '../services/ai';

export function registerAIHandlers(): void {
  log.info('Registering AI IPC handlers');

  // Get AI config
  ipcMain.handle('ai:getConfig', async () => {
    try {
      const config = getAIConfig();
      // Don't expose the actual API key, just return whether it's set
      return {
        success: true,
        data: {
          baseUrl: config.baseUrl,
          model: config.model,
          hasApiKey: !!config.apiKey,
        },
      };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to get AI config:', error);
      return { success: false, error: error.message };
    }
  });

  // Save AI config
  ipcMain.handle('ai:saveConfig', async (_event, config: { baseUrl?: string; apiKey?: string; model?: string }) => {
    try {
      saveAIConfig(config);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to save AI config:', error);
      return { success: false, error: error.message };
    }
  });

  // Translate text
  ipcMain.handle('ai:translate', async (_event, text: string, targetLang: string) => {
    try {
      const result = await translateText(text, targetLang);
      return result;
    } catch (err) {
      const error = err as Error;
      log.error('Translation failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Summarize text
  ipcMain.handle('ai:summarize', async (_event, text: string) => {
    try {
      const result = await summarizeText(text);
      return result;
    } catch (err) {
      const error = err as Error;
      log.error('Summarization failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Suggest reply
  ipcMain.handle('ai:suggestReply', async (_event, emailContent: string) => {
    try {
      const result = await suggestReply(emailContent);
      return result;
    } catch (err) {
      const error = err as Error;
      log.error('Reply suggestion failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Polish text
  ipcMain.handle('ai:polish', async (_event, text: string, style: 'formal' | 'friendly' | 'shorter' | 'longer') => {
    try {
      const result = await polishText(text, style);
      return result;
    } catch (err) {
      const error = err as Error;
      log.error('Text polishing failed:', error);
      return { success: false, error: error.message };
    }
  });

  log.info('AI IPC handlers registered');
}
