import log from 'electron-log';
import {
  deleteSecureSetting,
  getSecureSetting,
  getSetting,
  setSecureSetting,
  setSetting,
} from '../../database';
import {
  findOpenAICompatiblePresetByBaseUrl,
  type OpenAICompatibleProviderPresetId,
} from '../../../shared/openaiCompatibleProviderPresets';
import {
  DEFAULT_CONFIG,
  type AIConfig,
  type AIConfigProfileId,
  type AIProviderProfile,
  type AIProviderProfileSnapshot,
  type SaveProviderProfileInput,
} from './types';

const PROVIDER_PROFILES_SETTING_KEY = 'ai_provider_profiles';
const DEFAULT_PROVIDER_SETTING_KEY = 'ai_default_provider_id';

type StoredAIProviderProfile = {
  id: string;
  providerPresetId: OpenAICompatibleProviderPresetId;
  label: string;
  baseUrl: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function oldProfileSettingKey(profileId: AIConfigProfileId, field: keyof AIConfig): string {
  if (profileId === 'primary') {
    if (field === 'baseUrl') return 'ai_base_url';
    if (field === 'apiKey') return 'ai_api_key';
    return 'ai_model';
  }
  if (field === 'baseUrl') return 'ai_secondary_base_url';
  if (field === 'apiKey') return 'ai_secondary_api_key';
  return 'ai_secondary_model';
}

function providerApiKeyKey(profileId: string): string {
  return `ai_provider_api_key_${profileId}`;
}

function assertValidProviderProfileId(profileId: string): void {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(profileId)) {
    throw new Error('Invalid AI provider profile id.');
  }
}

function isLegacyProfileId(profileId: string): profileId is AIConfigProfileId {
  return profileId === 'primary' || profileId === 'secondary';
}

function getLegacyProfileApiKey(profileId: AIConfigProfileId): string {
  return getSecureSetting(oldProfileSettingKey(profileId, 'apiKey')) || getSetting(oldProfileSettingKey(profileId, 'apiKey')) || '';
}

function getProviderProfileApiKey(profileId: string): string {
  const providerKey = getSecureSetting(providerApiKeyKey(profileId));
  if (providerKey) return providerKey;
  return isLegacyProfileId(profileId) ? getLegacyProfileApiKey(profileId) : '';
}

function hasProviderProfileApiKey(profileId: string): boolean {
  return Boolean(getProviderProfileApiKey(profileId));
}

function safeSetProviderApiKey(profileId: string, apiKey: string): void {
  if (!apiKey) return;
  try {
    setSecureSetting(providerApiKeyKey(profileId), apiKey);
  } catch (error) {
    log.warn('Failed to copy AI provider API key into provider profile secure storage', {
      profileId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseStoredProfiles(raw: string | null): StoredAIProviderProfile[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const profiles = parsed
      .filter((item): item is StoredAIProviderProfile => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const profile = item as Partial<StoredAIProviderProfile>;
        return Boolean(profile.id && profile.label && typeof profile.baseUrl === 'string' && typeof profile.model === 'string');
      })
      .map((profile) => ({
        id: profile.id,
        providerPresetId: profile.providerPresetId || findOpenAICompatiblePresetByBaseUrl(profile.baseUrl).id,
        label: profile.label,
        baseUrl: profile.baseUrl,
        model: profile.model,
        createdAt: profile.createdAt || nowIso(),
        updatedAt: profile.updatedAt || profile.createdAt || nowIso(),
      }));
    return profiles.length > 0 ? profiles : null;
  } catch {
    return null;
  }
}

function serializeStoredProfiles(profiles: StoredAIProviderProfile[]): string {
  return JSON.stringify(profiles);
}

function buildLegacyProviderProfile(profileId: AIConfigProfileId): StoredAIProviderProfile | null {
  const rawBaseUrl = getSetting(oldProfileSettingKey(profileId, 'baseUrl'));
  const rawModel = getSetting(oldProfileSettingKey(profileId, 'model'));
  const apiKey = getLegacyProfileApiKey(profileId);
  const activeProfileId = getSetting('ai_active_profile');
  const shouldCreate =
    profileId === 'primary' ||
    Boolean(rawBaseUrl || rawModel || apiKey || activeProfileId === profileId);

  if (!shouldCreate) return null;

  const baseUrl = rawBaseUrl || DEFAULT_CONFIG.baseUrl;
  const model = rawModel || DEFAULT_CONFIG.model;
  const timestamp = nowIso();
  return {
    id: profileId,
    providerPresetId: findOpenAICompatiblePresetByBaseUrl(baseUrl).id,
    label: profileId === 'primary' ? 'Profile A' : 'Profile B',
    baseUrl,
    model,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function getFallbackDefaultProviderId(profiles: StoredAIProviderProfile[]): string {
  const legacyActive = getSetting('ai_active_profile');
  if (legacyActive && profiles.some((profile) => profile.id === legacyActive)) return legacyActive;
  return profiles[0]?.id || 'primary';
}

function persistProviderProfiles(profiles: StoredAIProviderProfile[]): void {
  setSetting(PROVIDER_PROFILES_SETTING_KEY, serializeStoredProfiles(profiles));
}

function ensureStoredProviderProfiles(): StoredAIProviderProfile[] {
  const existing = parseStoredProfiles(getSetting(PROVIDER_PROFILES_SETTING_KEY));
  if (existing) return existing;

  const profiles = (['primary', 'secondary'] as const)
    .map((profileId) => buildLegacyProviderProfile(profileId))
    .filter((profile): profile is StoredAIProviderProfile => Boolean(profile));

  const migratedProfiles = profiles.length > 0 ? profiles : [{
    id: 'primary',
    providerPresetId: findOpenAICompatiblePresetByBaseUrl(DEFAULT_CONFIG.baseUrl).id,
    label: 'Profile A',
    baseUrl: DEFAULT_CONFIG.baseUrl,
    model: DEFAULT_CONFIG.model,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }];

  persistProviderProfiles(migratedProfiles);
  setSetting(DEFAULT_PROVIDER_SETTING_KEY, getFallbackDefaultProviderId(migratedProfiles));

  for (const profile of migratedProfiles) {
    if (isLegacyProfileId(profile.id)) {
      safeSetProviderApiKey(profile.id, getLegacyProfileApiKey(profile.id));
    }
  }

  log.info('Migrated legacy AI profiles into provider profile metadata', {
    count: migratedProfiles.length,
  });
  return migratedProfiles;
}

function toPublicProviderProfile(profile: StoredAIProviderProfile, defaultProviderId: string): AIProviderProfile {
  return {
    ...profile,
    hasApiKey: hasProviderProfileApiKey(profile.id),
    isDefault: profile.id === defaultProviderId,
  };
}

export function getAIProviderProfileSnapshot(): AIProviderProfileSnapshot {
  const profiles = ensureStoredProviderProfiles();
  const defaultProviderId = getSetting(DEFAULT_PROVIDER_SETTING_KEY) || getFallbackDefaultProviderId(profiles);
  const effectiveDefaultProviderId = profiles.some((profile) => profile.id === defaultProviderId)
    ? defaultProviderId
    : getFallbackDefaultProviderId(profiles);

  return {
    defaultProviderId: effectiveDefaultProviderId,
    profiles: profiles.map((profile) => toPublicProviderProfile(profile, effectiveDefaultProviderId)),
  };
}

export function getDefaultAIProviderConfig(): AIConfig | null {
  const profiles = ensureStoredProviderProfiles();
  const defaultProviderId = getSetting(DEFAULT_PROVIDER_SETTING_KEY);
  const profile = defaultProviderId ? profiles.find((item) => item.id === defaultProviderId) : null;
  if (!profile) return null;
  return {
    baseUrl: profile.baseUrl,
    apiKey: getProviderProfileApiKey(profile.id),
    model: profile.model,
  };
}

export function getAIProviderConfigById(profileId: string): AIConfig | null {
  assertValidProviderProfileId(profileId);
  const profile = ensureStoredProviderProfiles().find((item) => item.id === profileId);
  if (!profile) return null;
  return {
    baseUrl: profile.baseUrl,
    apiKey: getProviderProfileApiKey(profile.id),
    model: profile.model,
  };
}

export function getFirstAvailableAIProviderConfig(): AIConfig | null {
  const profile = ensureStoredProviderProfiles().find((item) => item.baseUrl && item.model);
  if (!profile) return null;
  return {
    baseUrl: profile.baseUrl,
    apiKey: getProviderProfileApiKey(profile.id),
    model: profile.model,
  };
}

export function saveAIProviderProfile(input: SaveProviderProfileInput): AIProviderProfile {
  const profiles = ensureStoredProviderProfiles();
  const timestamp = nowIso();
  const id = input.id || `provider_${Date.now().toString(36)}`;
  assertValidProviderProfileId(id);
  const existing = profiles.find((profile) => profile.id === id);
  const nextProfile: StoredAIProviderProfile = {
    id,
    providerPresetId: input.providerPresetId,
    label: input.label.trim() || existing?.label || 'AI Provider',
    baseUrl: input.baseUrl,
    model: input.model,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  const nextProfiles = existing
    ? profiles.map((profile) => profile.id === id ? nextProfile : profile)
    : [...profiles, nextProfile];
  persistProviderProfiles(nextProfiles);

  if (input.apiKey !== undefined && input.apiKey.trim()) {
    setSecureSetting(providerApiKeyKey(id), input.apiKey.trim());
    if (isLegacyProfileId(id)) {
      setSecureSetting(oldProfileSettingKey(id, 'apiKey'), input.apiKey.trim());
    }
  }
  if (isLegacyProfileId(id)) {
    setSetting(oldProfileSettingKey(id, 'baseUrl'), nextProfile.baseUrl);
    setSetting(oldProfileSettingKey(id, 'model'), nextProfile.model);
  }
  if (input.isDefault) {
    setDefaultAIProviderProfile(id);
  }

  const defaultProviderId = getSetting(DEFAULT_PROVIDER_SETTING_KEY) || getFallbackDefaultProviderId(nextProfiles);
  return toPublicProviderProfile(nextProfile, defaultProviderId);
}

export function setDefaultAIProviderProfile(profileId: string): void {
  assertValidProviderProfileId(profileId);
  const profiles = ensureStoredProviderProfiles();
  if (!profiles.some((profile) => profile.id === profileId)) {
    throw new Error('AI provider profile not found.');
  }
  setSetting(DEFAULT_PROVIDER_SETTING_KEY, profileId);
  if (isLegacyProfileId(profileId)) {
    setSetting('ai_active_profile', profileId);
  }
}

export function deleteAIProviderProfile(profileId: string): AIProviderProfileSnapshot {
  assertValidProviderProfileId(profileId);
  if (isLegacyProfileId(profileId)) {
    throw new Error('Built-in legacy profiles cannot be deleted in this version.');
  }

  const profiles = ensureStoredProviderProfiles();
  const target = profiles.find((profile) => profile.id === profileId);
  if (!target) {
    throw new Error('AI provider profile not found.');
  }
  if (profiles.length <= 1) {
    throw new Error('At least one AI provider profile is required.');
  }

  const remainingProfiles = profiles.filter((profile) => profile.id !== profileId);
  persistProviderProfiles(remainingProfiles);
  deleteSecureSetting(providerApiKeyKey(profileId));

  const currentDefaultProviderId = getSetting(DEFAULT_PROVIDER_SETTING_KEY);
  if (currentDefaultProviderId === profileId) {
    const fallbackProviderId = remainingProfiles[0].id;
    setSetting(DEFAULT_PROVIDER_SETTING_KEY, fallbackProviderId);
    if (isLegacyProfileId(fallbackProviderId)) {
      setSetting('ai_active_profile', fallbackProviderId);
    }
  }

  return getAIProviderProfileSnapshot();
}

export function syncLegacyAIConfigToProviderProfile(profileId: AIConfigProfileId, config: Partial<AIConfig>): void {
  const profiles = ensureStoredProviderProfiles();
  const existing = profiles.find((profile) => profile.id === profileId);
  const timestamp = nowIso();
  const baseUrl = config.baseUrl ?? existing?.baseUrl ?? getSetting(oldProfileSettingKey(profileId, 'baseUrl')) ?? DEFAULT_CONFIG.baseUrl;
  const model = config.model ?? existing?.model ?? getSetting(oldProfileSettingKey(profileId, 'model')) ?? DEFAULT_CONFIG.model;
  const nextProfile: StoredAIProviderProfile = {
    id: profileId,
    providerPresetId: findOpenAICompatiblePresetByBaseUrl(baseUrl).id,
    label: existing?.label || (profileId === 'primary' ? 'Profile A' : 'Profile B'),
    baseUrl,
    model,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  const nextProfiles = existing
    ? profiles.map((profile) => profile.id === profileId ? nextProfile : profile)
    : [...profiles, nextProfile];
  persistProviderProfiles(nextProfiles);

  if (config.apiKey !== undefined && config.apiKey.trim()) {
    setSecureSetting(providerApiKeyKey(profileId), config.apiKey.trim());
  }
}
