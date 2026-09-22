import log from 'electron-log';
import {
  getSecureSetting,
  getSetting,
  setSecureSetting,
  setSetting,
} from '../database';
import {
  classifyMailWithJev,
  compactThreadWithJev,
  DEFAULT_JEV_SETTINGS,
  FetchJevClient,
  type EmailClassifyInput,
  type JevMailClassification,
  type JevSettings,
  type JevThreadCompactionResult,
  type JevThreadMailInput,
} from '../../shared/email-ai/jev';

const SETTING_KEY_ENABLED = 'jev_enabled';
const SETTING_KEY_API_KEY = 'jev_api_key';
const SETTING_KEY_BASE_URL = 'jev_base_url';
const SETTING_KEY_MODEL = 'jev_model';
const SETTING_KEY_CONFIDENCE = 'jev_confidence_threshold';
const SETTING_KEY_PRESERVE_RECENT = 'jev_preserve_recent_mails';

/**
 * Loads current Jev settings from normal and secure settings tables.
 */
export function getJevSettings(): JevSettings {
  const enabledStr = getSetting(SETTING_KEY_ENABLED);
  const apiKey = getSecureSetting(SETTING_KEY_API_KEY) || '';
  const baseUrl = getSetting(SETTING_KEY_BASE_URL) || DEFAULT_JEV_SETTINGS.baseUrl;
  const model = getSetting(SETTING_KEY_MODEL) || DEFAULT_JEV_SETTINGS.model;
  const confidenceStr = getSetting(SETTING_KEY_CONFIDENCE);
  const preserveRecentStr = getSetting(SETTING_KEY_PRESERVE_RECENT);

  return {
    enabled: enabledStr === 'true',
    apiKey,
    baseUrl,
    model,
    confidenceThreshold: confidenceStr ? Number(confidenceStr) : DEFAULT_JEV_SETTINGS.confidenceThreshold,
    preserveRecentMails: preserveRecentStr ? Number(preserveRecentStr) : DEFAULT_JEV_SETTINGS.preserveRecentMails,
  };
}

/**
 * Saves Jev settings, storing the API key securely.
 */
export function saveJevSettings(settings: Partial<JevSettings>): void {
  if (settings.enabled !== undefined) {
    setSetting(SETTING_KEY_ENABLED, String(settings.enabled));
  }
  if (settings.apiKey !== undefined) {
    setSecureSetting(SETTING_KEY_API_KEY, settings.apiKey);
  }
  if (settings.baseUrl !== undefined) {
    setSetting(SETTING_KEY_BASE_URL, settings.baseUrl);
  }
  if (settings.model !== undefined) {
    setSetting(SETTING_KEY_MODEL, settings.model);
  }
  if (settings.confidenceThreshold !== undefined) {
    setSetting(SETTING_KEY_CONFIDENCE, String(settings.confidenceThreshold));
  }
  if (settings.preserveRecentMails !== undefined) {
    setSetting(SETTING_KEY_PRESERVE_RECENT, String(settings.preserveRecentMails));
  }
  log.info('[JevService] settings saved');
}

/**
 * Checks whether Jev is active and ready to use.
 */
export function isJevEnabled(): boolean {
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
  const settings: JevSettings = {
    ...current,
    ...overrides,
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
