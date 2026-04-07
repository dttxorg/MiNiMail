import { OAuth2Client } from 'google-auth-library';
import log from 'electron-log';

const GOOGLE_REDIRECT_URI = 'http://localhost:19737/oauth/callback';

const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

let oauth2Client: OAuth2Client | null = null;

// Lazy import to avoid database access at module load time
function getDatabase() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const db = require('../database');
  return db;
}

function getOAuthConfig(): { clientId: string; clientSecret: string } {
  const db = getDatabase();
  return {
    clientId: db.getSetting('google_client_id') || '',
    clientSecret: db.getSetting('google_client_secret') || '',
  };
}

export function getOAuth2Client(): OAuth2Client {
  const { clientId, clientSecret } = getOAuthConfig();
  if (!oauth2Client) {
    oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      GOOGLE_REDIRECT_URI
    );
  }
  return oauth2Client;
}

export function getAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function getTokenFromCode(code: string): Promise<{ success: boolean; message: string; tokens?: unknown }> {
  try {
    const db = getDatabase();
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Store tokens in database
    if (tokens.access_token) {
      db.setSetting('google_access_token', tokens.access_token);
    }
    if (tokens.refresh_token) {
      db.setSetting('google_refresh_token', tokens.refresh_token);
    }
    if (tokens.expiry_date) {
      db.setSetting('google_token_expiry', String(tokens.expiry_date));
    }

    log.info('Google OAuth tokens obtained successfully');
    return { success: true, message: 'OAuth认证成功', tokens };
  } catch (err) {
    const error = err as Error;
    log.error('Failed to get OAuth token:', error);
    return { success: false, message: error.message };
  }
}

export function getStoredCredentials(): { access_token?: string; refresh_token?: string; expiry_date?: number } | null {
  const db = getDatabase();
  const access_token = db.getSetting('google_access_token');
  const refresh_token = db.getSetting('google_refresh_token');
  const expiry_date = db.getSetting('google_token_expiry');

  if (!access_token && !refresh_token) {
    return null;
  }

  return {
    access_token: access_token || undefined,
    refresh_token: refresh_token || undefined,
    expiry_date: expiry_date ? parseInt(expiry_date) : undefined,
  };
}

export async function refreshAccessToken(): Promise<{ success: boolean; message: string }> {
  try {
    const db = getDatabase();
    const client = getOAuth2Client();
    const credentials = getStoredCredentials();

    if (!credentials?.refresh_token) {
      return { success: false, message: 'No refresh token available' };
    }

    client.setCredentials({
      refresh_token: credentials.refresh_token,
    });

    const { credentials: newTokens } = await client.refreshAccessToken();

    if (newTokens.access_token) {
      db.setSetting('google_access_token', newTokens.access_token);
    }
    if (newTokens.expiry_date) {
      db.setSetting('google_token_expiry', String(newTokens.expiry_date));
    }

    log.info('Access token refreshed successfully');
    return { success: true, message: 'Token refreshed' };
  } catch (err) {
    const error = err as Error;
    log.error('Failed to refresh access token:', error);
    return { success: false, message: error.message };
  }
}

export function isOAuthConfigured(): boolean {
  const { clientId, clientSecret } = getOAuthConfig();
  return Boolean(clientId && clientSecret);
}

export function clearOAuthTokens(): void {
  const db = getDatabase();
  db.setSetting('google_access_token', '');
  db.setSetting('google_refresh_token', '');
  db.setSetting('google_token_expiry', '');
  oauth2Client = null;
}
