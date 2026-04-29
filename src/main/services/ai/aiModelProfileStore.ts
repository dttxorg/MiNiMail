import { getSetting, setSetting } from '../../database';
import {
  OPENAI_COMPATIBLE_PROVIDER_PRESETS,
} from '../../../shared/openaiCompatibleProviderPresets';
import {
  getAIProviderConfigById,
  getAIProviderProfileSnapshot,
} from './aiProviderProfileStore';
import {
  assertValidProviderAccountId,
  getProviderAccountApiKey,
  getProviderAccountById,
  getStoredProviderAccounts,
  nowIso,
  parseStoredProviderAccounts,
  persistProviderAccounts,
  PROVIDER_ACCOUNTS_SETTING_KEY,
  saveProviderAccountApiKey,
  type StoredAIProviderAccount,
} from './aiProviderAccountStore';
import type {
  AIConfig,
  AIModelProfile,
  AIModelProfileSnapshot,
  AIProviderAccountsWithModelsSnapshot,
  AIProviderProfile,
  SaveModelProfileInput,
} from './types';

export const MODEL_PROFILES_SETTING_KEY = 'ai_model_profiles';
export const DEFAULT_MODEL_PROFILE_SETTING_KEY = 'ai_default_model_profile_id';

type StoredAIModelProfile = {
  modelProfileId: string;
  providerAccountId: string;
  label: string;
  model: string;
  isDefault?: boolean;
  taskType?: 'summary' | 'reply' | 'classification';
  createdAt: string;
  updatedAt: string;
};

function assertValidModelProfileId(modelProfileId: string): void {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(modelProfileId)) {
    throw new Error('Invalid AI model profile id.');
  }
}

function createModelProfileId(): string {
  return `model_${Date.now().toString(36)}`;
}

function getOpenAICompatiblePresetById(providerPresetId: AIProviderProfile['providerPresetId']) {
  return OPENAI_COMPATIBLE_PROVIDER_PRESETS.find((preset) => preset.id === providerPresetId)
    || OPENAI_COMPATIBLE_PROVIDER_PRESETS[OPENAI_COMPATIBLE_PROVIDER_PRESETS.length - 1];
}

function providerAccountIdFromProviderProfileId(profileId: string): string {
  return `account_${profileId}`;
}

function modelProfileIdFromProviderProfileId(profileId: string): string {
  return `model_${profileId}`;
}

function parseStoredModelProfiles(raw: string | null): StoredAIModelProfile[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const profiles = parsed
      .filter((item): item is Partial<StoredAIModelProfile> => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const profile = item as Partial<StoredAIModelProfile>;
        return Boolean(profile.modelProfileId && profile.providerAccountId && typeof profile.model === 'string');
      })
      .map((profile) => ({
        modelProfileId: profile.modelProfileId || '',
        providerAccountId: profile.providerAccountId || '',
        label: profile.label || profile.model || 'AI Model',
        model: profile.model || '',
        ...(profile.taskType ? { taskType: profile.taskType } : {}),
        createdAt: profile.createdAt || nowIso(),
        updatedAt: profile.updatedAt || profile.createdAt || nowIso(),
      }));
    return profiles;
  } catch {
    return null;
  }
}

function getStoredModelProfiles(): StoredAIModelProfile[] {
  return parseStoredModelProfiles(getSetting(MODEL_PROFILES_SETTING_KEY)) || [];
}

function persistModelProfiles(profiles: StoredAIModelProfile[]): void {
  setSetting(MODEL_PROFILES_SETTING_KEY, JSON.stringify(profiles));
}

function setDefaultModelProfileSetting(modelProfileId: string): void {
  assertValidModelProfileId(modelProfileId);
  setSetting(DEFAULT_MODEL_PROFILE_SETTING_KEY, modelProfileId);
}

function getFallbackDefaultModelProfileId(profiles: StoredAIModelProfile[]): string {
  const currentDefault = getSetting(DEFAULT_MODEL_PROFILE_SETTING_KEY);
  if (currentDefault && profiles.some((profile) => profile.modelProfileId === currentDefault)) {
    return currentDefault;
  }
  return profiles[0]?.modelProfileId || '';
}

function providerProfileToAccount(profile: AIProviderProfile): StoredAIProviderAccount {
  const preset = getOpenAICompatiblePresetById(profile.providerPresetId);
  const timestamp = nowIso();
  return {
    providerAccountId: providerAccountIdFromProviderProfileId(profile.id),
    providerPresetId: profile.providerPresetId,
    label: profile.label || preset.label || 'AI Provider',
    baseUrl: profile.baseUrl,
    isLocal: Boolean(preset.isLocal),
    createdAt: profile.createdAt || timestamp,
    updatedAt: profile.updatedAt || profile.createdAt || timestamp,
  };
}

function providerProfileToModelProfile(profile: AIProviderProfile): StoredAIModelProfile {
  const preset = getOpenAICompatiblePresetById(profile.providerPresetId);
  const timestamp = nowIso();
  const labelPrefix = profile.label || preset.label || 'AI Provider';
  return {
    modelProfileId: modelProfileIdFromProviderProfileId(profile.id),
    providerAccountId: providerAccountIdFromProviderProfileId(profile.id),
    label: profile.model ? `${labelPrefix} · ${profile.model}` : labelPrefix,
    model: profile.model,
    createdAt: profile.createdAt || timestamp,
    updatedAt: profile.updatedAt || profile.createdAt || timestamp,
  };
}

function migrateProviderProfilesToAccountsAndModels(): void {
  const existingAccounts = parseStoredProviderAccounts(getSetting(PROVIDER_ACCOUNTS_SETTING_KEY));
  const existingModels = parseStoredModelProfiles(getSetting(MODEL_PROFILES_SETTING_KEY));
  if (existingAccounts && existingModels) return;

  const providerSnapshot = getAIProviderProfileSnapshot();
  const accounts = existingAccounts ? [...existingAccounts] : [];
  const models = existingModels ? [...existingModels] : [];
  let accountsChanged = !existingAccounts;
  let modelsChanged = !existingModels;

  for (const profile of providerSnapshot.profiles) {
    const providerAccountId = providerAccountIdFromProviderProfileId(profile.id);
    const nextAccount = providerProfileToAccount(profile);
    const existingAccountIndex = accounts.findIndex((account) => account.providerAccountId === providerAccountId);
    if (existingAccountIndex >= 0) {
      const existingAccount = accounts[existingAccountIndex];
      if (
        existingAccount.providerPresetId !== nextAccount.providerPresetId
        || existingAccount.label !== nextAccount.label
        || existingAccount.baseUrl !== nextAccount.baseUrl
        || existingAccount.isLocal !== nextAccount.isLocal
      ) {
        accounts[existingAccountIndex] = {
          ...existingAccount,
          providerPresetId: nextAccount.providerPresetId,
          label: nextAccount.label,
          baseUrl: nextAccount.baseUrl,
          isLocal: nextAccount.isLocal,
          updatedAt: nextAccount.updatedAt,
        };
        accountsChanged = true;
      }
    } else {
      accounts.push(nextAccount);
      accountsChanged = true;
    }

    const modelProfileId = modelProfileIdFromProviderProfileId(profile.id);
    const nextModel = providerProfileToModelProfile(profile);
    const existingModelIndex = models.findIndex((model) => model.modelProfileId === modelProfileId);
    if (existingModelIndex >= 0) {
      const existingModel = models[existingModelIndex];
      if (
        existingModel.providerAccountId !== nextModel.providerAccountId
        || existingModel.label !== nextModel.label
        || existingModel.model !== nextModel.model
      ) {
        models[existingModelIndex] = {
          ...existingModel,
          providerAccountId: nextModel.providerAccountId,
          label: nextModel.label,
          model: nextModel.model,
          updatedAt: nextModel.updatedAt,
        };
        modelsChanged = true;
      }
    } else {
      models.push(nextModel);
      modelsChanged = true;
    }

    const config = getAIProviderConfigById(profile.id);
    saveProviderAccountApiKey(providerAccountId, config?.apiKey);
  }

  if (accountsChanged) {
    persistProviderAccounts(accounts);
  }

  if (modelsChanged) {
    persistModelProfiles(models);
  }

  const defaultModelProfileId =
    modelProfileIdFromProviderProfileId(providerSnapshot.defaultProviderId || providerSnapshot.profiles[0]?.id || '');
  const currentDefaultModelProfileId = getSetting(DEFAULT_MODEL_PROFILE_SETTING_KEY);
  const currentDefaultIsValid = Boolean(
    currentDefaultModelProfileId
    && models.some((profile) => profile.modelProfileId === currentDefaultModelProfileId),
  );
  const effectiveDefaultModelProfileId = models.some((profile) => profile.modelProfileId === defaultModelProfileId)
    ? defaultModelProfileId
    : getFallbackDefaultModelProfileId(models);
  if (!currentDefaultIsValid && effectiveDefaultModelProfileId) {
    setSetting(DEFAULT_MODEL_PROFILE_SETTING_KEY, effectiveDefaultModelProfileId);
  }
}

function ensureStoredModelProfiles(): StoredAIModelProfile[] {
  migrateProviderProfilesToAccountsAndModels();
  return getStoredModelProfiles();
}

function ensureStoredProviderAccounts(): StoredAIProviderAccount[] {
  migrateProviderProfilesToAccountsAndModels();
  return getStoredProviderAccounts();
}

function toPublicModelProfile(profile: StoredAIModelProfile, defaultModelProfileId: string): AIModelProfile {
  return {
    ...profile,
    isDefault: profile.modelProfileId === defaultModelProfileId,
  };
}

export function getAIModelProfileSnapshot(): AIModelProfileSnapshot {
  const profiles = ensureStoredModelProfiles();
  const defaultModelProfileId = getFallbackDefaultModelProfileId(profiles);
  return {
    defaultModelProfileId,
    profiles: profiles.map((profile) => toPublicModelProfile(profile, defaultModelProfileId)),
  };
}

export function getAIProviderAccountSnapshot(): import('./types').AIProviderAccountSnapshot {
  return {
    accounts: ensureStoredProviderAccounts().map((account) => ({
      ...account,
      hasApiKey: Boolean(getProviderAccountApiKey(account.providerAccountId)),
    })),
  };
}

export function getProviderAccountsWithModels(): AIProviderAccountsWithModelsSnapshot {
  const accounts = ensureStoredProviderAccounts();
  const profiles = ensureStoredModelProfiles();
  const defaultModelProfileId = getFallbackDefaultModelProfileId(profiles);
  return {
    defaultModelProfileId,
    accounts: accounts.map((account) => ({
      ...account,
      hasApiKey: Boolean(getProviderAccountApiKey(account.providerAccountId)),
      modelProfiles: profiles
        .filter((profile) => profile.providerAccountId === account.providerAccountId)
        .map((profile) => toPublicModelProfile(profile, defaultModelProfileId)),
    })),
  };
}

export function saveModelProfile(input: SaveModelProfileInput): AIModelProfile {
  assertValidProviderAccountId(input.providerAccountId);
  const account = ensureStoredProviderAccounts().find((item) => item.providerAccountId === input.providerAccountId)
    || getProviderAccountById(input.providerAccountId);
  if (!account) {
    throw new Error('AI provider account not found.');
  }

  const modelProfileId = input.modelProfileId || createModelProfileId();
  assertValidModelProfileId(modelProfileId);
  const profiles = ensureStoredModelProfiles();
  const existing = profiles.find((profile) => profile.modelProfileId === modelProfileId);
  const timestamp = nowIso();
  const trimmedModel = input.model.trim();
  const nextProfile: StoredAIModelProfile = {
    modelProfileId,
    providerAccountId: input.providerAccountId,
    label: input.label.trim() || existing?.label || trimmedModel || 'AI Model',
    model: trimmedModel,
    ...(input.taskType ? { taskType: input.taskType } : existing?.taskType ? { taskType: existing.taskType } : {}),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  const nextProfiles = existing
    ? profiles.map((profile) => profile.modelProfileId === modelProfileId ? nextProfile : profile)
    : [...profiles, nextProfile];
  persistModelProfiles(nextProfiles);
  if (input.isDefault) {
    setDefaultModelProfileSetting(modelProfileId);
  }
  return toPublicModelProfile(nextProfile, getFallbackDefaultModelProfileId(nextProfiles));
}

export function setDefaultModelProfile(modelProfileId: string): AIModelProfileSnapshot {
  assertValidModelProfileId(modelProfileId);
  const profiles = ensureStoredModelProfiles();
  if (!profiles.some((profile) => profile.modelProfileId === modelProfileId)) {
    throw new Error('AI model profile not found.');
  }
  setDefaultModelProfileSetting(modelProfileId);
  return getAIModelProfileSnapshot();
}

export function deleteModelProfile(modelProfileId: string): AIModelProfileSnapshot {
  assertValidModelProfileId(modelProfileId);
  const profiles = ensureStoredModelProfiles();
  const target = profiles.find((profile) => profile.modelProfileId === modelProfileId);
  if (!target) {
    throw new Error('AI model profile not found.');
  }
  if (profiles.length <= 1) {
    throw new Error('At least one AI model profile is required.');
  }

  const remainingProfiles = profiles.filter((profile) => profile.modelProfileId !== modelProfileId);
  persistModelProfiles(remainingProfiles);

  const currentDefaultModelProfileId = getSetting(DEFAULT_MODEL_PROFILE_SETTING_KEY);
  if (currentDefaultModelProfileId === modelProfileId) {
    const fallback = remainingProfiles.find((profile) => profile.providerAccountId === target.providerAccountId)
      || remainingProfiles[0];
    if (fallback) {
      setDefaultModelProfileSetting(fallback.modelProfileId);
    }
  }

  return getAIModelProfileSnapshot();
}

export function getDefaultAIModelProfileConfig(): AIConfig | null {
  const profiles = ensureStoredModelProfiles();
  const defaultModelProfileId = getFallbackDefaultModelProfileId(profiles);
  const defaultProfile = profiles.find((profile) => profile.modelProfileId === defaultModelProfileId);
  if (!defaultProfile) return null;
  return getAIModelProfileConfigById(defaultProfile.modelProfileId);
}

export function getFirstAvailableAIModelProfileConfig(): AIConfig | null {
  const profiles = ensureStoredModelProfiles();
  for (const profile of profiles) {
    const config = getAIModelProfileConfigById(profile.modelProfileId);
    if (config?.baseUrl && config.model) return config;
  }
  return null;
}

export function getAIModelProfileConfigById(modelProfileId: string): AIConfig | null {
  assertValidModelProfileId(modelProfileId);
  const profiles = ensureStoredModelProfiles();
  const profile = profiles.find((item) => item.modelProfileId === modelProfileId);
  if (!profile) return null;
  assertValidProviderAccountId(profile.providerAccountId);
  const account = ensureStoredProviderAccounts().find((item) => item.providerAccountId === profile.providerAccountId)
    || getProviderAccountById(profile.providerAccountId);
  if (!account) return null;
  const apiKey = getProviderAccountApiKey(account.providerAccountId);
  const preset = getOpenAICompatiblePresetById(account.providerPresetId);
  const isLocalProvider = Boolean(account.isLocal || preset.isLocal);
  if (!account.baseUrl || !profile.model || (!isLocalProvider && !apiKey)) {
    return null;
  }
  return {
    baseUrl: account.baseUrl,
    apiKey,
    model: profile.model,
  };
}
