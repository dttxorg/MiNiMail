import log from 'electron-log';
import {
  classifyMailWithJev,
  classifyGitHubWithJev,
  compactThreadWithJev,
  DEFAULT_JEV_SETTINGS,
  FetchJevClient,
  type EmailClassifyInput,
  type JevMailClassification,
  type JevPublicSettings,
  type JevSettings,
  type JevThreadCompactionResult,
  type JevThreadMailInput,
  type GitHubMailTriageInput,
  type JevGitHubClassification,
} from '../../shared/email-ai/jev/index';

const SETTING_KEY_ENABLED = 'jev_enabled';
const SETTING_KEY_API_KEY = 'jev_api_key';
const SETTING_KEY_BASE_URL = 'jev_base_url';
const SETTING_KEY_MODEL = 'jev_model';
const SETTING_KEY_CONFIDENCE = 'jev_confidence_threshold';
const SETTING_KEY_PRESERVE_RECENT = 'jev_preserve_recent_mails';
export interface JevDatabaseAdapter {
  getSetting: (key: string) => string | null;
  setSetting: (key: string, value: string) => void;
  getSecureSetting: (key: string) => string | null;
  setSecureSetting: (key: string, value: string) => void;
}

let testDbAdapter: JevDatabaseAdapter | null = null;

export function configureJevDatabaseForTests(adapter: JevDatabaseAdapter | null): void {
  testDbAdapter = adapter;
}

function getDb(): JevDatabaseAdapter {
  if (testDbAdapter) return testDbAdapter;
  // Lazy require so tests running in pure Node do not dlopen Electron-ABI sqlite3
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../database');
}

function sanitizeBaseUrl(url?: string): string {
  if (!url || typeof url !== 'string') return DEFAULT_JEV_SETTINGS.baseUrl;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const isHttps = parsed.protocol === 'https:';
    const isLocalhost = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (isHttps || isLocalhost) {
      return trimmed.replace(/\/+$/, '');
    }
  } catch {
    // fallback
  }
  return DEFAULT_JEV_SETTINGS.baseUrl;
}

function sanitizeConfidence(val: unknown): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num)) return DEFAULT_JEV_SETTINGS.confidenceThreshold;
  return Math.max(0.5, Math.min(0.99, num));
}

function sanitizePreserveRecent(val: unknown): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num)) return DEFAULT_JEV_SETTINGS.preserveRecentMails;
  return Math.max(1, Math.min(20, Math.round(num)));
}

/**
 * Loads current Jev settings from normal and secure settings tables.
 */
export function getJevSettings(): JevSettings {
  const db = getDb();
  const enabledStr = db.getSetting(SETTING_KEY_ENABLED);
  const apiKey = db.getSecureSetting(SETTING_KEY_API_KEY) || '';
  const baseUrl = sanitizeBaseUrl(db.getSetting(SETTING_KEY_BASE_URL) || DEFAULT_JEV_SETTINGS.baseUrl);
  const model = (db.getSetting(SETTING_KEY_MODEL) || DEFAULT_JEV_SETTINGS.model).trim();
  const confidenceStr = db.getSetting(SETTING_KEY_CONFIDENCE);
  const preserveRecentStr = db.getSetting(SETTING_KEY_PRESERVE_RECENT);

  return {
    enabled: enabledStr === 'true',
    apiKey,
    baseUrl,
    model,
    confidenceThreshold: confidenceStr ? sanitizeConfidence(confidenceStr) : DEFAULT_JEV_SETTINGS.confidenceThreshold,
    preserveRecentMails: preserveRecentStr ? sanitizePreserveRecent(preserveRecentStr) : DEFAULT_JEV_SETTINGS.preserveRecentMails,
  };
}

/**
 * Returns sanitized Jev settings for renderer without leaking the plain API key.
 */
export function getJevPublicSettings(): JevPublicSettings {
  const s = getJevSettings();
  return {
    enabled: s.enabled,
    hasApiKey: Boolean(s.apiKey.trim()),
    baseUrl: s.baseUrl,
    model: s.model,
    confidenceThreshold: s.confidenceThreshold,
    preserveRecentMails: s.preserveRecentMails,
  };
}

/**
 * Saves Jev settings, storing the API key securely.
 * Leaves existing API key unchanged if apiKey is empty or undefined.
 */
export function saveJevSettings(settings: Partial<JevSettings>): void {
  const db = getDb();
  if (settings.enabled !== undefined) {
    db.setSetting(SETTING_KEY_ENABLED, String(settings.enabled));
  }
  if (settings.apiKey !== undefined && settings.apiKey.trim() !== '') {
    db.setSecureSetting(SETTING_KEY_API_KEY, settings.apiKey.trim());
  }
  if (settings.baseUrl !== undefined) {
    db.setSetting(SETTING_KEY_BASE_URL, sanitizeBaseUrl(settings.baseUrl));
  }
  if (settings.model !== undefined && settings.model.trim() !== '') {
    db.setSetting(SETTING_KEY_MODEL, settings.model.trim());
  }
  if (settings.confidenceThreshold !== undefined) {
    db.setSetting(SETTING_KEY_CONFIDENCE, String(sanitizeConfidence(settings.confidenceThreshold)));
  }
  if (settings.preserveRecentMails !== undefined) {
    db.setSetting(SETTING_KEY_PRESERVE_RECENT, String(sanitizePreserveRecent(settings.preserveRecentMails)));
  }
  log.info('[JevService] settings saved');
}

/**
 * Checks whether Jev is active and ready to use.
 * Bypasses Jev when AI privacy mode is set to local-only ('local_raw').
 */
export function isJevEnabled(): boolean {
  const db = getDb();
  const privacyMode = db.getSetting('ai_privacy_mode');
  if (privacyMode === 'local_raw') {
    return false;
  }
  const s = getJevSettings();
  return Boolean(s.enabled && s.apiKey.trim());
}

/**
 * Tests connection to TypeSafe Jev endpoint.
 */
export async function testJevConnection(
  overrides?: Partial<JevSettings>,
): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
  const current = getJevSettings();
  let apiKey = current.apiKey;
  let baseUrl = current.baseUrl;

  if (overrides?.apiKey && overrides.apiKey.trim()) {
    apiKey = overrides.apiKey.trim();
    if (overrides.baseUrl) {
      baseUrl = sanitizeBaseUrl(overrides.baseUrl);
    }
  } else {
    // Security guard: reusing saved API key strictly preserves configured baseUrl
    baseUrl = current.baseUrl;
  }

  const settings: JevSettings = {
    ...current,
    ...overrides,
    apiKey,
    baseUrl,
  };
  if (!settings.apiKey.trim()) {
    return { success: false, error: 'API Key is empty' };
  }

  const client = new FetchJevClient({
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
  });

  const start = Date.now();
  try {
    const resp = await client.ask(
      { ping: 'health_check' },
      {
        check: {
          type: 'noul',
          instructions: 'System ping for health verification. Is this system operational?',
        },
      },
    );
    const latencyMs = Date.now() - start;
    if (resp.answers && 'check' in resp.answers) {
      return { success: true, latencyMs };
    }
    return { success: false, error: 'Unexpected response envelope from Jev endpoint' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Classifies an email via Jev if enabled, returning null otherwise.
 */
export async function classifyEmailViaJev(
  input: EmailClassifyInput,
): Promise<JevMailClassification | null> {
  if (!isJevEnabled()) return null;
  const s = getJevSettings();
  const client = new FetchJevClient(s);

  try {
    return await classifyMailWithJev(client, input, {
      confidenceThreshold: s.confidenceThreshold,
    });
  } catch (err) {
    log.warn('[JevService] email classification failed, falling back to legacy:', err);
    return null;
  }
}

/**
 * Compacts and prunes an email thread via Jev if enabled, returning null otherwise.
 */
export async function compactThreadViaJev(
  threadId: string,
  mails: JevThreadMailInput[],
): Promise<JevThreadCompactionResult | null> {
  if (!isJevEnabled()) return null;
  const s = getJevSettings();
  const client = new FetchJevClient(s);

  try {
    return await compactThreadWithJev(client, threadId, mails, {
      keepThreshold: 0.5,
      preserveRecentMails: s.preserveRecentMails,
    });
  } catch (err) {
    log.warn('[JevService] thread compaction failed, falling back to legacy:', err);
    return null;
  }
}

/**
 * Classifies a GitHub notification via Jev if enabled, returning null otherwise.
 */
export async function classifyGitHubMailViaJev(
  input: GitHubMailTriageInput,
): Promise<JevGitHubClassification | null> {
  if (!isJevEnabled()) return null;
  const s = getJevSettings();
  const client = new FetchJevClient(s);

  try {
    return await classifyGitHubWithJev(client, input, {
      confidenceThreshold: s.confidenceThreshold,
    });
  } catch (err) {
    log.warn('[JevService] GitHub mail classification failed, falling back to legacy:', err);
    return null;
  }
}
