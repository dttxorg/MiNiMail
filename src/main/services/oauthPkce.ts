// src/main/services/oauthPkce.ts
//
// Core OAuth 2.0 PKCE engine with ephemeral loopback HTTP server.
//
// Security properties:
//  - PKCE (S256) prevents auth-code interception attacks
//  - Token exchange happens entirely in the main process (renderer never sees secrets)
//  - Loopback server binds to 127.0.0.1 on a random OS-assigned port (no port conflicts)
//  - State parameter prevents CSRF
//  - Server auto-closes on success, error, or 5-minute timeout

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createHash, randomBytes } from 'crypto';
import { AddressInfo } from 'net';
import { shell } from 'electron';
import log from 'electron-log';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Unix timestamp (ms) when accessToken expires */
  expiresAt: number;
  /** Email extracted from id_token JWT, if present */
  email?: string;
}

export interface ProviderOAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret?: string;
  /** Additional query params appended to the authorization URL */
  extraAuthParams?: Record<string, string>;
  /**
   * How to authenticate to the token endpoint:
   *   'body'  — send client_id + client_secret as POST body params (default)
   *   'basic' — send as HTTP Basic Authorization header (required by Yahoo)
   */
  tokenAuth?: 'body' | 'basic';
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
  return randomBytes(16).toString('hex');
}

// ─── Success / error page served to the system browser ───────────────────────

function callbackPage(ok: boolean, title: string, body: string): string {
  const color = ok ? '#22c55e' : '#ef4444';
  const icon  = ok ? '✅' : '❌';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style='font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",Arial,sans-serif;text-align:center;padding:60px 40px;
             background:#18181b;color:#e4e4e7;margin:0'>
  <div style="font-size:52px;margin-bottom:18px">${icon}</div>
  <h2 style="margin:0 0 12px;color:${color};font-size:22px">${title}</h2>
  <p style="color:#a1a1aa;margin:0;font-size:14px">${body}</p>
  <script>setTimeout(()=>window.close?.(),2500)</script>
</body></html>`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Runs the full OAuth 2.0 Authorization Code + PKCE flow:
 *  1. Starts an ephemeral HTTP server on a random loopback port
 *  2. Builds the authorization URL with PKCE params
 *  3. Opens the user's default system browser
 *  4. Waits for the callback (up to 5 minutes)
 *  5. Exchanges the code for tokens entirely in the main process
 *  6. Returns the tokens and closes the server
 */
export async function runOAuthFlow(config: ProviderOAuthConfig): Promise<OAuthTokens> {
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state         = generateState();

  // Start server first so we know the port before building the auth URL
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  const port        = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  log.info(`[oauthPkce] Loopback server on 127.0.0.1:${port}`);

  const authParams = new URLSearchParams({
    client_id:             config.clientId,
    redirect_uri:          redirectUri,
    response_type:         'code',
    scope:                 config.scopes.join(' '),
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
    ...(config.extraAuthParams ?? {}),
  });

  const authUrl = `${config.authUrl}?${authParams.toString()}`;

  return new Promise<OAuthTokens>((resolve, reject) => {
    let settled = false;

    function finish(fn: () => void): void {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        // Give the browser time to receive the response before closing
        setTimeout(() => server.close(), 500);
        fn();
      }
    }

    // 5-minute guard — prevent the IPC from hanging forever
    const timer = setTimeout(() => {
      log.warn('[oauthPkce] OAuth flow timed out after 5 minutes');
      finish(() => reject(new Error('OAuth 授权超时（5 分钟），请重试')));
    }, 5 * 60 * 1000);

    server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

      // Ignore favicon / other browser pre-fetches
      if (url.pathname !== '/callback') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage(true, '等待授权中…', '请在已打开的浏览器标签页中完成授权。'));
        return;
      }

      const code          = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const oauthError    = url.searchParams.get('error');

      if (oauthError) {
        const desc = url.searchParams.get('error_description') || oauthError;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage(false, '授权被拒绝', `原因：${desc}。请关闭此页面并重试。`));
        finish(() => reject(new Error(`OAuth cancelled: ${desc}`)));
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage(false, '无效请求', '请关闭此页面并重试。'));
        finish(() => reject(new Error('Invalid OAuth callback: state mismatch or missing code')));
        return;
      }

      // Send success page immediately so the browser shows feedback right away
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(callbackPage(true, '授权成功 ✓', '正在完成登录，请返回 minimail…'));

      try {
        const tokens = await exchangeCodeForTokens(config, code, codeVerifier, redirectUri);
        log.info(`[oauthPkce] Token exchange OK — email: ${tokens.email ?? '(unknown)'}`);
        finish(() => resolve(tokens));
      } catch (err) {
        finish(() => reject(err));
      }
    });

    server.on('error', (err) => {
      finish(() => reject(err));
    });

    // Open the system browser — never triggers Google's embedded-browser block
    shell.openExternal(authUrl).catch((err: Error) => {
      finish(() => reject(new Error(`无法打开系统浏览器：${err.message}`)));
    });

    log.info('[oauthPkce] System browser opened');
  });
}

// ─── Token exchange ───────────────────────────────────────────────────────────

async function exchangeCodeForTokens(
  config:       ProviderOAuthConfig,
  code:         string,
  codeVerifier: string,
  redirectUri:  string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     config.clientId,
    code_verifier: codeVerifier,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (config.tokenAuth === 'basic' && config.clientSecret) {
    // Yahoo requires HTTP Basic auth at the token endpoint
    const b64 = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${b64}`;
  } else if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }

  const response = await fetch(config.tokenUrl, {
    method:  'POST',
    headers,
    body:    body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json() as {
    access_token:  string;
    refresh_token?: string;
    expires_in?:   number;
    id_token?:     string;
  };

  if (!data.access_token) {
    throw new Error('Token endpoint returned no access_token');
  }

  // Extract email from id_token JWT payload (Google & Microsoft include this)
  let email: string | undefined;
  if (data.id_token) {
    try {
      const parts = data.id_token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
        email = payload.email as string | undefined;
      }
    } catch {
      // JWT parse failure is non-fatal — email stays undefined
    }
  }

  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + ((data.expires_in ?? 3600) * 1000),
    email,
  };
}
