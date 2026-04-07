import { ipcMain, BrowserWindow, shell } from 'electron';
import log from 'electron-log';
import { getAuthUrl, getTokenFromCode, isOAuthConfigured, getStoredCredentials, refreshAccessToken } from '../services/oauth';

let authWindow: BrowserWindow | null = null;

export function registerOAuthHandlers(): void {
  log.info('Registering OAuth IPC handlers');

  // Check if OAuth is configured
  ipcMain.handle('oauth:isConfigured', async () => {
    return isOAuthConfigured();
  });

  // Get OAuth configuration status
  ipcMain.handle('oauth:getStatus', async () => {
    const credentials = getStoredCredentials();
    return {
      configured: isOAuthConfigured(),
      authenticated: Boolean(credentials?.access_token || credentials?.refresh_token),
    };
  });

  // Start OAuth flow
  ipcMain.handle('oauth:startFlow', async (event) => {
    if (!isOAuthConfigured()) {
      return { success: false, message: 'OAuth not configured. Please set Client ID and Secret in Settings.' };
    }

    try {
      const authUrl = getAuthUrl();
      log.info('Opening OAuth auth window');

      // Open external browser for OAuth
      await shell.openExternal(authUrl);

      return { success: true, message: 'Please authorize in your browser.' };
    } catch (err) {
      const error = err as Error;
      log.error('OAuth flow error:', error);
      return { success: false, message: error.message };
    }
  });

  // Handle OAuth callback (not typically used with shell.openExternal)
  ipcMain.handle('oauth:handleCallback', async (_event, code: string) => {
    return await getTokenFromCode(code);
  });

  // Refresh access token
  ipcMain.handle('oauth:refreshToken', async () => {
    return await refreshAccessToken();
  });

  log.info('OAuth IPC handlers registered');
}
