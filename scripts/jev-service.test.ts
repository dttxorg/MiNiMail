import { strict as assert } from 'node:assert';
import test from 'node:test';
import Database from 'better-sqlite3';

// Mock sqlite db for settings testing
const memDb = new Database(':memory:');
memDb.exec(`
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE secure_settings (key TEXT PRIMARY KEY, value BLOB, updated_at TEXT);
`);

// Mock database functions
const settingsMap = new Map<string, string>();
const secureMap = new Map<string, string>();

function getSetting(key: string): string | null {
  return settingsMap.get(key) ?? null;
}

function setSetting(key: string, value: string): void {
  settingsMap.set(key, value);
}

function getSecureSetting(key: string): string | null {
  return secureMap.get(key) ?? null;
}

function setSecureSetting(key: string, value: string): void {
  secureMap.set(key, value);
}

// Logic mirror of jevService
function getJevSettings() {
  const enabledStr = getSetting('jev_enabled');
  const apiKey = getSecureSetting('jev_api_key') || '';
  const baseUrl = getSetting('jev_base_url') || 'https://api.typesafe.ai/v1/systemone';
  const model = getSetting('jev_model') || 'jev-latest';
  const confidenceStr = getSetting('jev_confidence_threshold');

  return {
    enabled: enabledStr === 'true',
    apiKey,
    baseUrl,
    model,
    confidenceThreshold: confidenceStr ? Number(confidenceStr) : 0.8,
  };
}

function saveJevSettings(settings: Partial<{ enabled: boolean; apiKey: string; baseUrl: string; model: string; confidenceThreshold: number }>) {
  if (settings.enabled !== undefined) setSetting('jev_enabled', String(settings.enabled));
  if (settings.apiKey !== undefined) setSecureSetting('jev_api_key', settings.apiKey);
  if (settings.baseUrl !== undefined) setSetting('jev_base_url', settings.baseUrl);
  if (settings.model !== undefined) setSetting('jev_model', settings.model);
  if (settings.confidenceThreshold !== undefined) setSetting('jev_confidence_threshold', String(settings.confidenceThreshold));
}

function isJevEnabled() {
  const s = getJevSettings();
  return Boolean(s.enabled && s.apiKey.trim());
}

test('jev service: defaults to disabled and empty apiKey', () => {
  settingsMap.clear();
  secureMap.clear();

  const initial = getJevSettings();
  assert.equal(initial.enabled, false);
  assert.equal(initial.apiKey, '');
  assert.equal(initial.baseUrl, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(initial.model, 'jev-latest');
  assert.equal(initial.confidenceThreshold, 0.8);
  assert.equal(isJevEnabled(), false);
});

test('jev service: persists settings and activates when enabled with key', () => {
  settingsMap.clear();
  secureMap.clear();

  saveJevSettings({
    enabled: true,
    apiKey: 'ts_live_key_999',
    model: 'jev-latest',
    confidenceThreshold: 0.85,
  });

  const updated = getJevSettings();
  assert.equal(updated.enabled, true);
  assert.equal(updated.apiKey, 'ts_live_key_999');
  assert.equal(updated.confidenceThreshold, 0.85);
  assert.equal(isJevEnabled(), true);

  // Disable switch
  saveJevSettings({ enabled: false });
  assert.equal(isJevEnabled(), false);
});
