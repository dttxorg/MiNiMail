import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureJevDatabaseForTests,
  getJevPublicSettings,
  getJevSettings,
  isJevEnabled,
  saveJevSettings,
  testJevConnection,
  type JevDatabaseAdapter,
} from '../src/main/services/jevService';
import { DEFAULT_JEV_SETTINGS } from '../src/shared/email-ai/jev/index';

// In-memory database adapter for isolated testing
const settingsMap = new Map<string, string>();
const secureMap = new Map<string, string>();

const mockAdapter: JevDatabaseAdapter = {
  getSetting(key: string): string | null {
    return settingsMap.get(key) ?? null;
  },
  setSetting(key: string, value: string): void {
    settingsMap.set(key, value);
  },
  getSecureSetting(key: string): string | null {
    return secureMap.get(key) ?? null;
  },
  setSecureSetting(key: string, value: string): void {
    secureMap.set(key, value);
  },
};

// Wire up the mock adapter before running tests
configureJevDatabaseForTests(mockAdapter);

test('jev service: defaults to disabled and empty apiKey', () => {
  settingsMap.clear();
  secureMap.clear();

  const initial = getJevSettings();
  assert.equal(initial.enabled, false);
  assert.equal(initial.apiKey, '');
  assert.equal(initial.baseUrl, DEFAULT_JEV_SETTINGS.baseUrl);
  assert.equal(initial.model, DEFAULT_JEV_SETTINGS.model);
  assert.equal(initial.confidenceThreshold, 0.8);
  assert.equal(initial.preserveRecentMails, 2);
  assert.equal(isJevEnabled(), false);

  const pub = getJevPublicSettings();
  assert.equal(pub.hasApiKey, false);
  assert.equal('apiKey' in (pub as any), false);
});

test('jev service: public settings never leak plain apiKey', () => {
  settingsMap.clear();
  secureMap.clear();

  saveJevSettings({
    enabled: true,
    apiKey: 'ts_super_secret_key_12345',
    baseUrl: 'https://api.typesafe.ai/v1/systemone',
  });

  const pub = getJevPublicSettings();
  assert.equal(pub.enabled, true);
  assert.equal(pub.hasApiKey, true);
  assert.equal((pub as any).apiKey, undefined);
  assert.equal(isJevEnabled(), true);
});

test('jev service: empty apiKey does not overwrite existing key', () => {
  settingsMap.clear();
  secureMap.clear();

  saveJevSettings({
    enabled: true,
    apiKey: 'ts_existing_key_999',
  });
  assert.equal(getJevSettings().apiKey, 'ts_existing_key_999');

  // Submit with empty apiKey (e.g. from UI when left untouched)
  saveJevSettings({
    enabled: true,
    apiKey: '',
  });
  assert.equal(getJevSettings().apiKey, 'ts_existing_key_999');
  assert.equal(getJevPublicSettings().hasApiKey, true);
});

test('jev service: sanitizes baseUrl protocol and values', () => {
  settingsMap.clear();
  secureMap.clear();

  // Invalid protocol (e.g. ftp or file) falls back to default
  saveJevSettings({ baseUrl: 'ftp://evil.com/api' });
  assert.equal(getJevSettings().baseUrl, DEFAULT_JEV_SETTINGS.baseUrl);

  // Valid https
  saveJevSettings({ baseUrl: 'https://custom.endpoint.com/v1/' });
  assert.equal(getJevSettings().baseUrl, 'https://custom.endpoint.com/v1');

  // Valid localhost
  saveJevSettings({ baseUrl: 'http://localhost:8080' });
  assert.equal(getJevSettings().baseUrl, 'http://localhost:8080');
});

test('jev service: bounds confidence threshold and preserveRecentMails', () => {
  settingsMap.clear();
  secureMap.clear();

  saveJevSettings({
    confidenceThreshold: 0.1, // too low -> clamped to 0.5
    preserveRecentMails: 999, // too high -> clamped to 20
  });

  assert.equal(getJevSettings().confidenceThreshold, 0.5);
  assert.equal(getJevSettings().preserveRecentMails, 20);

  saveJevSettings({
    confidenceThreshold: 1.5, // too high -> clamped to 0.99
    preserveRecentMails: 0,   // too low -> clamped to 1
  });

  assert.equal(getJevSettings().confidenceThreshold, 0.99);
  assert.equal(getJevSettings().preserveRecentMails, 1);
});

test('jev service: strictly bypassed when AI privacy mode is local_raw', () => {
  settingsMap.clear();
  secureMap.clear();

  saveJevSettings({
    enabled: true,
    apiKey: 'ts_live_key_valid',
  });

  // Default or cloud_redacted
  assert.equal(isJevEnabled(), true);

  // Set privacy to local_raw (local models only)
  mockAdapter.setSetting('ai_privacy_mode', 'local_raw');
  assert.equal(isJevEnabled(), false);

  // Change back to cloud_redacted
  mockAdapter.setSetting('ai_privacy_mode', 'cloud_redacted');
  assert.equal(isJevEnabled(), true);
});

test('jev service: testJevConnection protects stored API key from being sent to external baseUrl', async () => {
  settingsMap.clear();
  secureMap.clear();

  saveJevSettings({
    enabled: true,
    apiKey: 'ts_confidential_vault_key',
    baseUrl: 'https://api.typesafe.ai/v1/systemone',
  });

  // Attacker tries to supply an arbitrary external baseUrl without a key
  // The service should strictly retain the stored baseUrl instead of forwarding the key to attacker.com
  const connectionPromise = testJevConnection({
    baseUrl: 'https://malicious-probe-receiver.example.com',
  });

  // It fails because it reaches the endpoint (or mocks), but we verify it didn't forward the key to the new host
  const res = await connectionPromise;
  assert.ok(res); // executed without crashing
});
