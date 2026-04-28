import log from 'electron-log';
import {
  deleteSecureSetting,
  deleteSetting,
  getSecureSetting,
  getSetting,
  setSecureSetting,
  setSetting,
} from '../../database';
import { isEncryptionAvailable } from '../crypto';
import {
  DEFAULT_CONFIG,
  type AIConfig,
  type AIConfigProfile,
  type AIConfigProfileId,
  type AIConfigSaveInput,
  type AIConfigSnapshot,
} from './types';

export function normalizeAIConfigProfileId(value: string | null): AIConfigProfileId {
  return value === 'secondary' ? 'secondary' : 'primary';
}

function getAIProfileSettingKey(profileId: AIConfigProfileId, field: keyof AIConfig): string {
  if (profileId === 'primary') {
    if (field === 'baseUrl') return 'ai_base_url';
    if (field === 'apiKey') return 'ai_api_key';
    return 'ai_model';
  }
  if (field === 'baseUrl') return 'ai_secondary_base_url';
  if (field === 'apiKey') return 'ai_secondary_api_key';
  return 'ai_secondary_model';
}

function getAIProfileApiKeyKey(profileId: AIConfigProfileId): string {
  return getAIProfileSettingKey(profileId, 'apiKey');
}

function migrateLegacyAIApiKey(profileId: AIConfigProfileId): string | null {
  const key = getAIProfileApiKeyKey(profileId);
  const legacyApiKey = getSetting(key);
  if (!legacyApiKey) return null;

  if (!isEncryptionAvailable()) {
    log.warn('Legacy AI API key could not be migrated because secure storage is unavailable', { profileId });
    return legacyApiKey;
  }

  setSecureSetting(key, legacyApiKey);
  deleteSetting(key);
  log.info('Migrated legacy AI API key to secure storage', { profileId });
  return legacyApiKey;
}

function getAIProfileApiKey(profileId: AIConfigProfileId): string {
  const key = getAIProfileApiKeyKey(profileId);
  const secureApiKey = getSecureSetting(key);
  if (secureApiKey) return secureApiKey;
  return migrateLegacyAIApiKey(profileId) || '';
}

export function initializeAISecretStorage(): void {
  for (const profileId of ['primary', 'secondary'] as const) {
    try {
      migrateLegacyAIApiKey(profileId);
    } catch (error) {
      log.error('Failed to initialize AI secret storage', {
        profileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function getAIConfigForProfile(profileId: AIConfigProfileId): AIConfigProfile {
  const baseUrl = getSetting(getAIProfileSettingKey(profileId, 'baseUrl'));
  const apiKey = getAIProfileApiKey(profileId);
  const model = getSetting(getAIProfileSettingKey(profileId, 'model'));
  return {
    id: profileId,
    label: profileId === 'primary' ? 'Profile A' : 'Profile B',
    baseUrl: baseUrl || DEFAULT_CONFIG.baseUrl,
    apiKey: apiKey || '',
    model: model || DEFAULT_CONFIG.model,
  };
}

export function getAIConfigSnapshot(): AIConfigSnapshot {
  const activeProfileId = normalizeAIConfigProfileId(getSetting('ai_active_profile'));
  return {
    activeProfileId,
    profiles: {
      primary: getAIConfigForProfile('primary'),
      secondary: getAIConfigForProfile('secondary'),
    },
  };
}

export function getAIConfig(): AIConfig {
  const snapshot = getAIConfigSnapshot();
  const activeProfile = snapshot.profiles[snapshot.activeProfileId];
  return {
    baseUrl: activeProfile.baseUrl,
    apiKey: activeProfile.apiKey,
    model: activeProfile.model,
  };
}

export function saveAIConfig(config: AIConfigSaveInput): void {
  const profileId = config.profileId ?? normalizeAIConfigProfileId(getSetting('ai_active_profile'));
  const apiKeyKey = getAIProfileApiKeyKey(profileId);

  if (config.apiKey !== undefined) {
    const trimmedApiKey = config.apiKey.trim();
    if (trimmedApiKey) {
      try {
        setSecureSetting(apiKeyKey, trimmedApiKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to save AI API key securely. ${message}`);
      }
    } else {
      deleteSecureSetting(apiKeyKey);
      deleteSetting(apiKeyKey);
    }
  }

  if (config.baseUrl !== undefined) setSetting(getAIProfileSettingKey(profileId, 'baseUrl'), config.baseUrl);
  if (config.model !== undefined) setSetting(getAIProfileSettingKey(profileId, 'model'), config.model);
  if (config.activeProfileId !== undefined) setSetting('ai_active_profile', config.activeProfileId);
  log.info('AI config saved', { profileId, activeProfileId: config.activeProfileId });
}
