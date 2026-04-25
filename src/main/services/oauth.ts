// src/main/services/oauth.ts
//
// Provider registry + high-level OAuth flow orchestration.
// Wraps oauthPkce.ts (PKCE engine) and owns:
// - Provider configuration (endpoints, scopes, IMAP/SMTP presets)
// - startOAuthFlow() — full authorization flow called from IPC
// - refreshTokenForAccount() — silent token refresh before IMAP connections

import log from 'electron-log';
import { runOAuthFlow, OAuthTokens, ProviderOAuthConfig } from './oauthPkce';
import {
  getAccountById,
  getAccountCredentials,
  updateAccountCredentials,
  getSetting,
} from '../database';

// ─── Provider types ───────────────────────────────────────────────────────────

export type OAuthProvider = 'gmail' | 'outlook' | 'yahoo';

interface FullProviderConfig extends ProviderOAuthConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

// ─── Provider Configuration Registry ─────────────────────────────────────────

function buildProviderConfig(
  provider: OAuthProvider,
  clientId: string,
  clientSecret?: string,
): FullProviderConfig {
  switch (provider) {

  case 'gmail':
    return {
      // Google: Desktop App type in Cloud Console, no secret required for PKCE
      // but Google still issues one for "Desktop app" clients — pass it when available.
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://mail.google.com/', 'openid', 'email', 'profile'],
      clientId,
      clientSecret,
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
    };

  case 'outlook':
    return {
      // Microsoft: "Mobile and desktop applications" in Azure App Registrations.
      // Personal accounts use the "common" tenant.
      // Client secret is optional for public native clients (PKCE is sufficient).
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: [
        'https://outlook.office.com/IMAP.AccessAsUser.All',
        'https://outlook.office.com/SMTP.Send',
        'offline_access',
        'openid',
        'email',
        'profile',
      ],
      clientId,
      clientSecret, // leave undefined for public native clients
      extraAuthParams: { prompt: 'select_account' },
      imapHost: 'outlook.office365.com',
      imapPort: 993,
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
    };

  case 'yahoo':
    return {
      // Yahoo: "Installed Application" on developer.yahoo.com.
      // Token endpoint requires HTTP Basic auth (client_id:client_secret).
      authUrl: 'https://api.login.yahoo.com/oauth2/request_auth',
      tokenUrl: 'https://api.login.yahoo.com/oauth2/get_token',
      scopes: ['mail-w'],
      clientId,
      clientSecret,
      tokenAuth: 'basic', // Yahoo requires Basic auth at token endpoint
      imapHost: 'imap.mail.yahoo.com',
      imapPort: 993,
      smtpHost: 'smtp.mail.yahoo.com',
      smtpPort: 465,
    };
  }
}

// ─── Refresh Mutex (per-account) ─────────────────────────────────────────────
// Prevents concurrent refresh requests for the same account.
// When a refresh is in-flight, other callers wait and reuse the same Promise.
const refreshLocks = new Map<number, Promise<boolean>>();

// ─── Public API ───────────────────────────────────────────────────────────────

export interface OAuthStartParams {
  provider: OAuthProvider;
  clientId: string;
  clientSecret?: string;
}

export interface OAuthFlowResult extends OAuthTokens {
  provider: OAuthProvider;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

/**
 * Runs the full OAuth 2.0 + PKCE flow for the given provider.
 * Returns tokens + IMAP/SMTP presets so the renderer can create the account.
 */
export async function startOAuthFlow(params: OAuthStartParams): Promise<OAuthFlowResult> {
  const { provider, clientId, clientSecret } = params;

  if (!clientId.trim()) throw new Error('Client ID 不能为空');

  log.info(`[oauth] Starting ${provider} OAuth flow`);

  const config = buildProviderConfig(provider, clientId.trim(), clientSecret?.trim() || undefined);
  const tokens = await runOAuthFlow(config);

  log.info(`[oauth] ${provider} OAuth complete — email: ${tokens.email ?? '(unknown)'}`);

  return {
    ...tokens,
    provider,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
  };
}

/**
 * Silently refreshes an OAuth access token for the given account.
 * Reads the client credentials from Settings (saved on first successful login).
 * Called automatically from mail.ts::createClient when the token is about to expire.
 *
 * MUTEX: Concurrent calls for the same account will wait for the in-flight
 * refresh to complete and reuse its result, preventing duplicate network requests.
 */
export async function refreshTokenForAccount(accountId: number): Promise<boolean> {
  // Check for in-flight refresh — reuse the Promise if one exists
  const existingLock = refreshLocks.get(accountId);
  if (existingLock) {
    log.info(`[oauth] Waiting for in-flight refresh for account ${accountId}`);
    return existingLock;
  }

  // Create the refresh Promise - it will NOT start executing until we await it
  // We register the lock BEFORE the IIFE starts so any return path will clean up
  let resolveLock: (value: boolean) => void;
  const refreshPromise = new Promise<boolean>((resolve) => {
    resolveLock = resolve;
  });

  // Register the lock immediately so concurrent callers can reuse it
  refreshLocks.set(accountId, refreshPromise);

  // Now execute the actual refresh logic
  (async () => {
    try {
      const account = getAccountById(accountId);
      if (!account || account.auth_type !== 'oauth') {
        resolveLock!(false);
        return;
      }

      const creds = getAccountCredentials(accountId);
      if (!creds?.oauth_refresh_token) {
        log.warn(`[oauth] No refresh token for account ${accountId}`);
        resolveLock!(false);
        return;
      }

      const provider = account.provider as OAuthProvider;
      const clientId = getSetting(`${provider}_client_id`) ?? '';
      const clientSecret = getSetting(`${provider}_client_secret`) ?? undefined;

      if (!clientId) {
        log.warn(`[oauth] No client_id in settings for provider "${provider}" (account ${accountId})`);
        resolveLock!(false);
        return;
      }

      const config = buildProviderConfig(provider, clientId, clientSecret);

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.oauth_refresh_token,
        client_id: clientId,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      if (config.tokenAuth === 'basic' && clientSecret) {
        const b64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${b64}`;
      } else if (clientSecret) {
        body.set('client_secret', clientSecret);
      }

      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers,
        body: body.toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        log.error(`[oauth] Refresh failed (${response.status}): ${text.slice(0, 200)}`);
        resolveLock!(false);
        return;
      }

      const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      if (!data.access_token) {
        resolveLock!(false);
        return;
      }

      updateAccountCredentials(accountId, {
        oauth_token: data.access_token,
        oauth_expiry: Date.now() + ((data.expires_in ?? 3600) * 1000),
        ...(data.refresh_token ? { oauth_refresh_token: data.refresh_token } : {}),
      });

      log.info(`[oauth] Token refreshed for account ${accountId}`);
      resolveLock!(true);
    } catch (err) {
      log.error(`[oauth] Refresh error for account ${accountId}:`, err);
      resolveLock!(false);
    } finally {
      // Always clean up the lock after completion
      refreshLocks.delete(accountId);
    }
  })();

  return refreshPromise;
}
