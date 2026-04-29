import {
  getSecureSetting,
  getSetting,
  setSecureSetting,
  setSetting,
} from '../../database';
import {
  OPENAI_COMPATIBLE_PROVIDER_PRESETS,
  type OpenAICompatibleProviderPresetId,
} from '../../../shared/openaiCompatibleProviderPresets';
import type {
  AIProviderAccount,
  AIProviderAccountSnapshot,
  SaveProviderAccountInput,
} from './types';

export const PROVIDER_ACCOUNTS_SETTING_KEY = 'ai_provider_accounts';

export type StoredAIProviderAccount = {
  providerAccountId: string;
  providerPresetId: OpenAICompatibleProviderPresetId;
  label: string;
  baseUrl: string;
  isLocal: boolean;
  createdAt: string;
  updatedAt: string;
};

export function providerAccountApiKeyKey(providerAccountId: string): string {
  return `ai_provider_account_api_key_${providerAccountId}`;
}

function getOpenAICompatiblePresetById(providerPresetId: OpenAICompatibleProviderPresetId) {
  return OPENAI_COMPATIBLE_PROVIDER_PRESETS.find((preset) => preset.id === providerPresetId)
    || OPENAI_COMPATIBLE_PROVIDER_PRESETS[OPENAI_COMPATIBLE_PROVIDER_PRESETS.length - 1];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function assertValidProviderAccountId(providerAccountId: string): void {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(providerAccountId)) {
    throw new Error('Invalid AI provider account id.');
  }
}

export function getProviderAccountApiKey(providerAccountId: string): string {
  assertValidProviderAccountId(providerAccountId);
  return getSecureSetting(providerAccountApiKeyKey(providerAccountId)) || '';
}

export function hasProviderAccountApiKey(providerAccountId: string): boolean {
  return Boolean(getProviderAccountApiKey(providerAccountId));
}

export function saveProviderAccountApiKey(providerAccountId: string, apiKey?: string): void {
  assertValidProviderAccountId(providerAccountId);
  const trimmed = apiKey?.trim();
  if (!trimmed) return;
  setSecureSetting(providerAccountApiKeyKey(providerAccountId), trimmed);
}

export function parseStoredProviderAccounts(raw: string | null): StoredAIProviderAccount[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const accounts = parsed
      .filter((item): item is Partial<StoredAIProviderAccount> => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const account = item as Partial<StoredAIProviderAccount>;
        return Boolean(
          account.providerAccountId &&
          account.providerPresetId &&
          account.label &&
          typeof account.baseUrl === 'string',
        );
      })
      .map((account) => ({
        providerAccountId: account.providerAccountId || '',
        providerPresetId: account.providerPresetId || 'custom',
        label: account.label || 'AI Provider',
        baseUrl: account.baseUrl || '',
        isLocal: Boolean(account.isLocal),
        createdAt: account.createdAt || nowIso(),
        updatedAt: account.updatedAt || account.createdAt || nowIso(),
      }));
    return accounts;
  } catch {
    return null;
  }
}

export function getStoredProviderAccounts(): StoredAIProviderAccount[] {
  return parseStoredProviderAccounts(getSetting(PROVIDER_ACCOUNTS_SETTING_KEY)) || [];
}

export function persistProviderAccounts(accounts: StoredAIProviderAccount[]): void {
  setSetting(PROVIDER_ACCOUNTS_SETTING_KEY, JSON.stringify(accounts));
}

export function toPublicProviderAccount(account: StoredAIProviderAccount): AIProviderAccount {
  const preset = getOpenAICompatiblePresetById(account.providerPresetId);
  return {
    ...account,
    isLocal: Boolean(account.isLocal || preset.isLocal),
    hasApiKey: hasProviderAccountApiKey(account.providerAccountId),
  };
}

export function getAIProviderAccountSnapshot(): AIProviderAccountSnapshot {
  return {
    accounts: getStoredProviderAccounts().map(toPublicProviderAccount),
  };
}

export function getProviderAccountById(providerAccountId: string): StoredAIProviderAccount | null {
  assertValidProviderAccountId(providerAccountId);
  return getStoredProviderAccounts().find((account) => account.providerAccountId === providerAccountId) || null;
}

export function saveProviderAccount(input: SaveProviderAccountInput): AIProviderAccount {
  const providerAccountId = input.providerAccountId || `account_${Date.now().toString(36)}`;
  assertValidProviderAccountId(providerAccountId);
  const accounts = getStoredProviderAccounts();
  const existing = accounts.find((account) => account.providerAccountId === providerAccountId);
  const preset = getOpenAICompatiblePresetById(input.providerPresetId);
  const timestamp = nowIso();
  const nextAccount: StoredAIProviderAccount = {
    providerAccountId,
    providerPresetId: input.providerPresetId,
    label: input.label.trim() || existing?.label || preset.label || 'AI Provider',
    baseUrl: input.baseUrl,
    isLocal: Boolean(input.isLocal || preset.isLocal),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  const nextAccounts = existing
    ? accounts.map((account) => account.providerAccountId === providerAccountId ? nextAccount : account)
    : [...accounts, nextAccount];
  persistProviderAccounts(nextAccounts);
  saveProviderAccountApiKey(providerAccountId, input.apiKey);
  return toPublicProviderAccount(nextAccount);
}
