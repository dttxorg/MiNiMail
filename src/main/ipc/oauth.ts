// src/main/ipc/oauth.ts
import { ipcMain } from 'electron';
import log from 'electron-log';
import { startOAuthFlow, OAuthStartParams, refreshTokenForAccount } from '../services/oauth';
import { getSetting, setSetting } from '../database';

export function registerOAuthHandlers(): void {
  log.info('Registering OAuth IPC handlers');

  /**
   * oauth:startFlow
   * Initiates the PKCE + loopback OAuth flow for Gmail / Outlook / Yahoo.
   * The IPC handler returns a Promise — Electron keeps it pending until the user
   * finishes in the browser (or the 5-minute timeout fires).
   *
   * Params: { provider: 'gmail'|'outlook'|'yahoo', clientId: string, clientSecret?: string }
   * Returns: { success, data: OAuthFlowResult } | { success: false, error: string }
   */
  ipcMain.handle('oauth:startFlow', async (_event, params: OAuthStartParams) => {
    try {
      const result = await startOAuthFlow(params);

      // Persist client credentials so refreshTokenForAccount can use them later
      setSetting(`${params.provider}_client_id`, params.clientId.trim());
      if (params.clientSecret?.trim()) {
        setSetting(`${params.provider}_client_secret`, params.clientSecret.trim());
      }

      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
      log.error('[oauth:startFlow]', error.message);
      return { success: false, error: error.message };
    }
  });

  /**
   * oauth:refreshToken
   * Silently refresh the access token for an already-stored account.
   */
  ipcMain.handle('oauth:refreshToken', async (_event, accountId: number) => {
    const ok = await refreshTokenForAccount(accountId);
    return { success: ok };
  });

  /**
   * oauth:getClientConfig
   * Returns the saved client_id / client_secret for a provider so the
   * AddAccountDialog can pre-populate the fields.
   */
  ipcMain.handle('oauth:getClientConfig', async (_event, provider: string) => {
    const clientId     = getSetting(`${provider}_client_id`)     ?? '';
    const clientSecret = getSetting(`${provider}_client_secret`) ?? '';
    return { success: true, data: { clientId, clientSecret } };
  });

  log.info('OAuth IPC handlers registered');
}
