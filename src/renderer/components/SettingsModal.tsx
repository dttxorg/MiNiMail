import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  CalendarDays,
  Download,
  FolderOpen,
  Globe,
  Info,
  Key,
  Mail,
  Plus,
  Radar,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import { normalizeAppLanguage, type AppLanguage } from '../utils/aiLanguages';
import {
  getAutoFetchIntervalOptions,
  getMailCacheRangeOptions,
  getMailHistoryRangeOptions,
} from '../utils/mailHistoryRange';
import type { MailCacheRange, MailHistoryRange } from '../../shared/mailSyncSettings';
import type { MailBackupReadState } from '../../shared/backup';
import type { AiPrivacyMode } from '../../shared/email-ai';
import {
  findOpenAICompatiblePresetByBaseUrl,
  normalizeOpenAICompatibleChatEndpoint,
  normalizeOpenAICompatibleModelsEndpoint,
  OPENAI_COMPATIBLE_PROVIDER_PRESETS,
  type OpenAICompatibleProviderPresetId,
} from '../../shared/openaiCompatibleProviderPresets';
import {
  canStartBackupImport,
  canStartBackupExport,
  formatBackupProgress,
  getBackupReadStateOptions,
  summarizeBackupResult,
  type BackupExportScope,
  type BackupUiState,
} from '../utils/mailBackupUi';
import {
  COMPOSE_SIGNATURES_SETTING_KEY,
  serializeComposeSignatureSettings,
  updateComposeSignatureForAccount,
  type ComposeSignatureSettings,
} from '../../shared/compose/signatures';
import {
  deleteComposeQuickPhrase,
  upsertComposeQuickPhrase,
  type ComposeQuickPhraseSettings,
} from '../../shared/compose/quickPhrases';

interface SettingsModalProps {
  t: (key: string) => string;
  isOpen: boolean;
  onClose: () => void;
  appLanguage: AppLanguage;
  onAppLanguageChange: (lang: AppLanguage) => void;
  aiTargetLanguage: string;
  onAiTargetLanguageChange: (lang: string) => void;
  onAddAccount: () => void;
  accounts: Array<{
    id: number;
    email: string;
    name: string;
    avatar?: string;
  }>;
  onDeleteAccount: (accountId: number) => void;
  currentAccountId: number;
  aiAutoSort: boolean;
  onAiAutoSortChange: (v: boolean) => void;
  aiScanMode: 'smart' | 'light' | 'deep';
  onAiScanModeChange: (v: 'smart' | 'light' | 'deep') => void;
  aiLookback: '3d' | '7d' | '1mo' | '6mo' | 'all';
  onAiLookbackChange: (v: '3d' | '7d' | '1mo' | '6mo' | 'all') => void;
  aiPrivacyMode: AiPrivacyMode;
  onAiPrivacyModeChange: (v: AiPrivacyMode) => void;
  mailHistoryRange: MailHistoryRange;
  onMailHistoryRangeChange: (v: MailHistoryRange) => void;
  mailCacheRange: MailCacheRange;
  onMailCacheRangeChange: (v: MailCacheRange) => void;
  autoFetchInterval: number;
  onAutoFetchIntervalChange: (minutes: number) => void;
  githubNotificationsViewEnabled: boolean;
  onGithubNotificationsViewEnabledChange: (enabled: boolean) => void;
  composeSignatureSettings: ComposeSignatureSettings;
  onComposeSignatureSettingsChange: (settings: ComposeSignatureSettings) => void;
  composeQuickPhraseSettings: ComposeQuickPhraseSettings;
  onComposeQuickPhraseSettingsChange: (settings: ComposeQuickPhraseSettings) => Promise<void> | void;
  backupState: BackupUiState;
  backupAccounts: Array<{
    id: number;
    email: string;
    name: string;
  }>;
  backupFolders: Array<{
    name: string;
    path: string;
    delimiter: string;
    flags: string[];
  }>;
  onBackupAccountChange: (accountId: number) => void;
  onBackupScopeChange: (scope: BackupExportScope) => void;
  onBackupFolderToggle: (folderPath: string) => void;
  onBackupReadStateChange: (readState: MailBackupReadState) => void;
  onBackupStartDateChange: (value: string) => void;
  onBackupEndDateChange: (value: string) => void;
  onBackupPickDestination: () => void;
  onBackupPickImportSources: () => void;
  onBackupImportTargetFolderChange: (folderPath: string) => void;
  onStartBackupExport: () => void;
  onStartBackupImport: () => void;
  onCancelBackupExport: () => void;
  onOpenBackupFolder: () => void;
}

type NavId = 'accounts' | 'backup' | 'writing' | 'ai' | 'aiProvider' | 'about';
type AIConfigProfileId = 'primary' | 'secondary';

type AIConfigProfileForm = {
  id: string;
  providerPresetId: OpenAICompatibleProviderPresetId;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  hasApiKey?: boolean;
  isDefault?: boolean;
  isDraft?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type AIProviderConnectionTestResult = {
  success: boolean;
  provider?: {
    id?: string;
    label?: string;
  };
  endpointHost?: string;
  endpointPath?: string;
  model?: string;
  status?: number;
  operation?: 'testConnection' | 'fetchModels' | 'callAI';
  timestamp?: string;
  friendlyMessage?: string;
  errorSummary?: string;
  responseStructureSummary?: unknown;
  requestBodyKeys?: string[];
  parsedPreview?: string;
  error?: string;
};

type AIProviderModelListResult = {
  success: boolean;
  provider?: {
    id?: string;
    label?: string;
  };
  endpointHost?: string;
  endpointPath?: string;
  model?: string;
  status?: number;
  operation?: 'testConnection' | 'fetchModels' | 'callAI';
  timestamp?: string;
  friendlyMessage?: string;
  errorSummary?: string;
  requestBodyKeys?: string[];
  models?: string[];
  error?: string;
};

type AIProviderOperationResult = AIProviderConnectionTestResult | AIProviderModelListResult;

type ProviderReadiness = {
  code: 'ready' | 'needsApiKey' | 'needsModel' | 'needsLocalServer' | 'rateLimited' | 'providerError' | 'untested';
  label: string;
  color: string;
  detail: string;
};

type AIProviderText = ReturnType<typeof getAIProviderText>;

type AIProviderProfileSnapshot = {
  defaultProviderId: string;
  profiles: Array<{
    id: string;
    providerPresetId: OpenAICompatibleProviderPresetId;
    label: string;
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
};

type AIModelProfileSnapshotForm = {
  modelProfileId: string;
  providerAccountId: string;
  label: string;
  model: string;
  isDefault: boolean;
  taskType?: 'summary' | 'reply' | 'classification';
  createdAt: string;
  updatedAt: string;
};

type AIProviderAccountWithModelsSnapshot = {
  defaultModelProfileId: string;
  accounts: Array<{
    providerAccountId: string;
    providerPresetId: OpenAICompatibleProviderPresetId;
    label: string;
    baseUrl: string;
    hasApiKey: boolean;
    isLocal: boolean;
    createdAt: string;
    updatedAt: string;
    modelProfiles: AIModelProfileSnapshotForm[];
  }>;
};

type NewProviderAccountForm = {
  providerPresetId: OpenAICompatibleProviderPresetId;
  label: string;
  baseUrl: string;
  apiKey: string;
};

const EMPTY_AI_CONFIG_PROFILES: Record<string, AIConfigProfileForm> = {
  primary: { id: 'primary', providerPresetId: 'custom', label: 'Profile A', baseUrl: '', apiKey: '', model: '', hasApiKey: false, isDefault: true },
  secondary: { id: 'secondary', providerPresetId: 'custom', label: 'Profile B', baseUrl: '', apiKey: '', model: '', hasApiKey: false, isDefault: false },
};

function getOpenAICompatiblePresetById(id: OpenAICompatibleProviderPresetId) {
  return OPENAI_COMPATIBLE_PROVIDER_PRESETS.find((preset) => preset.id === id) ?? OPENAI_COMPATIBLE_PROVIDER_PRESETS[0];
}

function isLegacyAIProviderProfile(id: string) {
  return id === 'primary' || id === 'secondary';
}

function profileSnapshotToForm(profile: AIProviderProfileSnapshot['profiles'][number]): AIConfigProfileForm {
  return {
    id: profile.id,
    providerPresetId: profile.providerPresetId,
    label: profile.label,
    baseUrl: profile.baseUrl,
    apiKey: '',
    model: profile.model,
    hasApiKey: profile.hasApiKey,
    isDefault: profile.isDefault,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function providerProfilesToRecord(profiles: AIConfigProfileForm[]): Record<string, AIConfigProfileForm> {
  return profiles.reduce<Record<string, AIConfigProfileForm>>((acc, profile) => {
    acc[profile.id] = profile;
    return acc;
  }, {});
}

function redactDiagnosticsText(value: string): string {
  return value
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/AIza[0-9A-Za-z_-]{16,}/g, '[REDACTED_API_KEY]')
    .replace(/gh[pousr]_[0-9A-Za-z_]{12,}/g, '[REDACTED_TOKEN]');
}

function truncateDiagnostics(value: string, maxLength = 300): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function getProviderReadiness(
  profile: AIConfigProfileForm,
  diagnostics: AIProviderOperationResult | undefined,
  text: AIProviderText = getAIProviderText('en'),
): ProviderReadiness {
  const preset = getOpenAICompatiblePresetById(profile.providerPresetId);
  const isLocal = Boolean(preset.isLocal);
  const hasKey = Boolean(profile.hasApiKey || profile.apiKey.trim() || isLocal);

  if (!profile.model.trim()) {
    return { code: 'needsModel', label: text.status.needsModel, color: '#ff9f0a', detail: text.details.modelMissing };
  }
  if (!hasKey) {
    return { code: 'needsApiKey', label: text.status.needsApiKey, color: '#ff9f0a', detail: text.details.noKeySaved };
  }
  if (!diagnostics) {
    return { code: 'untested', label: text.status.untested, color: '#8e8e93', detail: text.details.noRecentTest };
  }
  if (diagnostics.success) {
    const statusText = diagnostics.status !== undefined ? `HTTP ${diagnostics.status}` : 'OK';
    return { code: 'ready', label: text.status.ready, color: '#30d158', detail: statusText };
  }
  if (diagnostics.status === 429) {
    return { code: 'rateLimited', label: text.status.rateLimited, color: '#ff9f0a', detail: diagnostics.errorSummary || diagnostics.error || 'HTTP 429' };
  }
  if (!diagnostics.status && isLocal) {
    return { code: 'needsLocalServer', label: text.status.needsLocalServer, color: '#ff9f0a', detail: text.localProviderMayNotRunning };
  }
  return {
    code: 'providerError',
    label: text.status.providerError,
    color: '#ff6b6b',
    detail: diagnostics.errorSummary || diagnostics.error || diagnostics.friendlyMessage || text.status.providerError,
  };
}

function getBrowserArch(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('arm64') || userAgent.includes('aarch64')) return 'arm64';
  if (userAgent.includes('x86_64') || userAgent.includes('x64') || userAgent.includes('wow64')) return 'x64';
  return 'unknown';
}

function buildSafeDiagnosticsPayload(params: {
  appVersion?: string;
  profile: AIConfigProfileForm;
  presetLabel: string;
  presetIsLocal: boolean;
  isDefault: boolean;
  result: AIProviderOperationResult;
}) {
  const { result } = params;
  const readiness = getProviderReadiness(params.profile, result);
  return {
    app: {
      name: 'MiNiMail',
      version: params.appVersion ? redactDiagnosticsText(params.appVersion) : undefined,
      platform: navigator.platform ? redactDiagnosticsText(navigator.platform) : 'unknown',
      arch: getBrowserArch(),
    },
    provider: {
      id: result.provider?.id ? redactDiagnosticsText(result.provider.id) : redactDiagnosticsText(params.profile.id),
      label: result.provider?.label ? redactDiagnosticsText(result.provider.label) : redactDiagnosticsText(params.presetLabel),
      presetId: redactDiagnosticsText(params.profile.providerPresetId),
      isDefault: params.isDefault,
      hasApiKey: Boolean(params.profile.hasApiKey || params.profile.apiKey.trim()),
      isLocal: params.presetIsLocal,
    },
    request: {
      operation: result.operation,
      endpointHost: result.endpointHost ? redactDiagnosticsText(result.endpointHost) : undefined,
      endpointPath: result.endpointPath ? redactDiagnosticsText(result.endpointPath) : undefined,
      model: result.model ? redactDiagnosticsText(result.model) : undefined,
      bodyKeys: Array.isArray(result.requestBodyKeys)
        ? result.requestBodyKeys.map((key) => redactDiagnosticsText(key))
        : [],
    },
    result: {
      ok: result.success,
      httpStatus: result.status,
      readiness: readiness.label,
      friendlyMessage: result.friendlyMessage ? redactDiagnosticsText(result.friendlyMessage) : undefined,
      errorSummary: result.errorSummary
        ? truncateDiagnostics(redactDiagnosticsText(result.errorSummary))
        : result.error
          ? truncateDiagnostics(redactDiagnosticsText(result.error))
          : undefined,
      modelCount: 'models' in result && Array.isArray(result.models) ? result.models.length : undefined,
      preview: 'parsedPreview' in result && result.parsedPreview
        ? truncateDiagnostics(redactDiagnosticsText(result.parsedPreview), 160)
        : undefined,
      responseStructureSummary: 'responseStructureSummary' in result ? result.responseStructureSummary : undefined,
    },
    timestamp: result.timestamp ? redactDiagnosticsText(result.timestamp) : new Date().toISOString(),
  };
}

function formatDiagnosticsMarkdown(payload: unknown): string {
  return ['```json', JSON.stringify(payload, null, 2), '```'].join('\n');
}

function getApiProfileText(appLanguage: AppLanguage) {
  const texts = {
    zh: { active: '当前使用', use: '设为当前', profileA: '配置 A', profileB: '配置 B', keySaved: '已保存 Key', keyEmpty: '未保存 Key' },
    en: { active: 'Active', use: 'Use this', profileA: 'Profile A', profileB: 'Profile B', keySaved: 'Key saved', keyEmpty: 'No key' },
    ja: { active: '使用中', use: '使用する', profileA: '設定 A', profileB: '設定 B', keySaved: 'キー保存済み', keyEmpty: 'キーなし' },
    ko: { active: '사용 중', use: '사용', profileA: '구성 A', profileB: '구성 B', keySaved: '키 저장됨', keyEmpty: '키 없음' },
    es: { active: 'Activa', use: 'Usar', profileA: 'Perfil A', profileB: 'Perfil B', keySaved: 'Clave guardada', keyEmpty: 'Sin clave' },
    fr: { active: 'Actif', use: 'Utiliser', profileA: 'Profil A', profileB: 'Profil B', keySaved: 'Clé enregistrée', keyEmpty: 'Aucune clé' },
    de: { active: 'Aktiv', use: 'Verwenden', profileA: 'Profil A', profileB: 'Profil B', keySaved: 'Schlüssel gespeichert', keyEmpty: 'Kein Schlüssel' },
    ru: { active: 'Активно', use: 'Использовать', profileA: 'Профиль A', profileB: 'Профиль B', keySaved: 'Ключ сохранён', keyEmpty: 'Нет ключа' },
  };
  return texts[appLanguage] ?? texts.en;
}

function getAIProviderText(appLanguage: AppLanguage) {
  const texts = {
    zh: {
      title: '模型/API',
      description: '管理供应商账号，并在每个账号下添加多个模型。',
      currentDefaultModel: '当前默认模型',
      noDefaultModel: '还没有默认模型配置。',
      providerAccounts: '供应商账号',
      addAccount: '添加账号',
      cancel: '取消',
      providerPreset: '供应商',
      accountLabel: '账号名称',
      baseUrl: '基础 URL',
      noBaseUrl: '未配置基础 URL',
      apiKey: 'API 密钥',
      optionalLocalKey: '本地服务可不填',
      pasteApiKey: '粘贴 API 密钥',
      saveProviderAccount: '保存供应商账号',
      saving: '保存中...',
      noProviderAccounts: '暂无供应商账号。',
      defaultBadge: '默认',
      modelSingular: '个模型',
      modelPlural: '个模型',
      fetchModels: '获取模型',
      fetchingModels: '获取中...',
      localProviderHint: '本地服务需要保持运行。',
      notConfigured: '未配置',
      manualAddModel: '手动添加模型',
      addModel: '添加模型',
      add: '添加',
      alreadyAdded: '已添加',
      fetchedModels: '获取到的模型',
      searchModels: '搜索模型',
      noModelsReturned: '未返回模型。',
      modelsUnderProvider: '此账号下的模型',
      noModelProfiles: '此账号下还没有模型配置。',
      setDefault: '设为默认',
      settingDefault: '设置中...',
      deleteModel: '删除模型',
      deleting: '删除中...',
      testSelectedModel: '测试选中模型',
      testDefaultModel: '测试默认模型',
      testing: '测试中...',
      connectionOk: '连接正常',
      connectionFailed: '连接失败',
      modelsFetched: '模型已获取',
      fetchModelsFailed: '获取模型失败',
      selectProviderAccount: '请选择一个供应商账号。',
      diagnosticsCopied: '诊断信息已复制',
      diagnosticsCopyFailed: '复制诊断信息失败',
      saveAccountFailed: '保存供应商账号失败',
      modelRequired: '请填写模型 ID。',
      duplicateModel: '该模型已添加到当前供应商账号。',
      addModelFailed: '添加模型失败',
      setDefaultFailed: '设置默认模型失败',
      deleteModelFailed: '删除模型失败',
      loadProviderAccountsFailed: '加载供应商账号失败',
      deleteLastModelBlocked: '至少需要保留一个模型配置。',
      localProviderMayNotRunning: '本地服务可能未启动。',
      status: {
        ready: '可用',
        needsApiKey: '需要 API 密钥',
        needsModel: '需要模型',
        needsLocalServer: '需要本地服务',
        rateLimited: '限流/额度不足',
        providerError: '供应商错误',
        untested: '未测试',
      },
      details: {
        modelMissing: '缺少模型',
        noKeySaved: '未保存 Key',
        noRecentTest: '暂无最近测试',
      },
      friendly: {
        apiKey: 'API 密钥或权限可能有问题。',
        notFound: 'Endpoint 或模型可能不正确。',
        rateLimited: '额度不足或请求被限流。',
        upstream: '供应商上游服务异常。',
        network: '网络异常或服务不可用。',
      },
    },
    en: {
      title: 'Models & API',
      description: 'Manage provider accounts and add multiple models under each account.',
      currentDefaultModel: 'Current default model',
      noDefaultModel: 'No default model profile is configured yet.',
      providerAccounts: 'Provider accounts',
      addAccount: 'Add account',
      cancel: 'Cancel',
      providerPreset: 'Provider',
      accountLabel: 'Account label',
      baseUrl: 'Base URL',
      noBaseUrl: 'No Base URL',
      apiKey: 'API key',
      optionalLocalKey: 'Optional for local providers',
      pasteApiKey: 'Paste API key',
      saveProviderAccount: 'Save provider account',
      saving: 'Saving...',
      noProviderAccounts: 'No provider accounts yet.',
      defaultBadge: 'Default',
      modelSingular: 'model',
      modelPlural: 'models',
      fetchModels: 'Fetch models',
      fetchingModels: 'Fetching...',
      localProviderHint: 'The local server must be running.',
      notConfigured: 'Not configured',
      manualAddModel: 'Manual add model',
      addModel: 'Add model',
      add: 'Add',
      alreadyAdded: 'Already added',
      fetchedModels: 'Fetched models',
      searchModels: 'Search models',
      noModelsReturned: 'No models returned.',
      modelsUnderProvider: 'Models under this provider',
      noModelProfiles: 'No model profiles under this account yet.',
      setDefault: 'Set default',
      settingDefault: 'Setting...',
      deleteModel: 'Delete model',
      deleting: 'Deleting...',
      testSelectedModel: 'Test selected model',
      testDefaultModel: 'Test default model',
      testing: 'Testing...',
      connectionOk: 'Connection OK',
      connectionFailed: 'Connection failed',
      modelsFetched: 'Models fetched',
      fetchModelsFailed: 'Fetch models failed',
      selectProviderAccount: 'Select a provider account.',
      diagnosticsCopied: 'Diagnostics copied',
      diagnosticsCopyFailed: 'Failed to copy diagnostics',
      saveAccountFailed: 'Failed to save provider account',
      modelRequired: 'Model id is required.',
      duplicateModel: 'This model is already added under the selected provider account.',
      addModelFailed: 'Failed to add model',
      setDefaultFailed: 'Failed to set default model',
      deleteModelFailed: 'Failed to delete model',
      loadProviderAccountsFailed: 'Failed to load provider accounts',
      deleteLastModelBlocked: 'At least one AI model profile is required.',
      localProviderMayNotRunning: 'Local server may not be running.',
      status: {
        ready: 'Ready',
        needsApiKey: 'Needs API key',
        needsModel: 'Needs model',
        needsLocalServer: 'Needs local server',
        rateLimited: 'Rate limited',
        providerError: 'Provider error',
        untested: 'Untested',
      },
      details: {
        modelMissing: 'Model missing',
        noKeySaved: 'No key saved',
        noRecentTest: 'No recent test',
      },
      friendly: {
        apiKey: 'API key or permission issue.',
        notFound: 'Endpoint or model may be incorrect.',
        rateLimited: 'Quota or rate limit reached.',
        upstream: 'Provider upstream error.',
        network: 'Network issue or service unavailable.',
      },
    },
    ja: {
      title: 'モデル/API',
      description: 'プロバイダーアカウントを管理し、各アカウントに複数のモデルを追加できます。',
      currentDefaultModel: '現在の既定モデル',
      noDefaultModel: '既定のモデル設定はまだありません。',
      providerAccounts: 'プロバイダーアカウント',
      addAccount: 'アカウント追加',
      cancel: 'キャンセル',
      providerPreset: 'プロバイダー',
      accountLabel: 'アカウント名',
      baseUrl: 'ベース URL',
      noBaseUrl: 'ベース URL 未設定',
      apiKey: 'API キー',
      optionalLocalKey: 'ローカルでは任意',
      pasteApiKey: 'API キーを貼り付け',
      saveProviderAccount: 'プロバイダーアカウントを保存',
      saving: '保存中...',
      noProviderAccounts: 'プロバイダーアカウントはありません。',
      defaultBadge: '既定',
      modelSingular: 'モデル',
      modelPlural: 'モデル',
      fetchModels: 'モデル取得',
      fetchingModels: '取得中...',
      localProviderHint: 'ローカルサーバーを起動しておく必要があります。',
      notConfigured: '未設定',
      manualAddModel: 'モデルを手動追加',
      addModel: 'モデル追加',
      add: '追加',
      alreadyAdded: '追加済み',
      fetchedModels: '取得したモデル',
      searchModels: 'モデルを検索',
      noModelsReturned: 'モデルが返されませんでした。',
      modelsUnderProvider: 'このアカウントのモデル',
      noModelProfiles: 'このアカウントにはモデル設定がありません。',
      setDefault: '既定に設定',
      settingDefault: '設定中...',
      deleteModel: 'モデル削除',
      deleting: '削除中...',
      testSelectedModel: '選択モデルをテスト',
      testDefaultModel: '既定モデルをテスト',
      testing: 'テスト中...',
      connectionOk: '接続正常',
      connectionFailed: '接続失敗',
      modelsFetched: 'モデル取得済み',
      fetchModelsFailed: 'モデル取得失敗',
      selectProviderAccount: 'プロバイダーアカウントを選択してください。',
      diagnosticsCopied: '診断情報をコピーしました',
      diagnosticsCopyFailed: '診断情報のコピーに失敗しました',
      saveAccountFailed: 'プロバイダーアカウントの保存に失敗しました',
      modelRequired: 'モデル ID が必要です。',
      duplicateModel: 'このモデルは選択中のアカウントに追加済みです。',
      addModelFailed: 'モデル追加に失敗しました',
      setDefaultFailed: '既定モデルの設定に失敗しました',
      deleteModelFailed: 'モデル削除に失敗しました',
      loadProviderAccountsFailed: 'プロバイダーアカウントの読み込みに失敗しました',
      deleteLastModelBlocked: '少なくとも 1 つのモデル設定が必要です。',
      localProviderMayNotRunning: 'ローカルサーバーが起動していない可能性があります。',
      status: { ready: '利用可能', needsApiKey: 'API キーが必要', needsModel: 'モデルが必要', needsLocalServer: 'ローカルサービスが必要', rateLimited: '制限中', providerError: 'プロバイダーエラー', untested: '未テスト' },
      details: { modelMissing: 'モデル未設定', noKeySaved: 'キー未保存', noRecentTest: '最近のテストなし' },
      friendly: { apiKey: 'API キーまたは権限に問題があります。', notFound: 'Endpoint またはモデルが誤っている可能性があります。', rateLimited: 'クォータ不足またはレート制限です。', upstream: 'プロバイダー側の障害です。', network: 'ネットワークまたはサービスの問題です。' },
    },
    ko: {
      title: '모델/API',
      description: '공급자 계정을 관리하고 각 계정 아래에 여러 모델을 추가합니다.',
      currentDefaultModel: '현재 기본 모델',
      noDefaultModel: '기본 모델 구성이 아직 없습니다.',
      providerAccounts: '공급자 계정',
      addAccount: '계정 추가',
      cancel: '취소',
      providerPreset: '공급자',
      accountLabel: '계정 이름',
      baseUrl: '기본 URL',
      noBaseUrl: '기본 URL 없음',
      apiKey: 'API 키',
      optionalLocalKey: '로컬 공급자는 선택 사항',
      pasteApiKey: 'API 키 붙여넣기',
      saveProviderAccount: '공급자 계정 저장',
      saving: '저장 중...',
      noProviderAccounts: '공급자 계정이 없습니다.',
      defaultBadge: '기본',
      modelSingular: '모델',
      modelPlural: '모델',
      fetchModels: '모델 가져오기',
      fetchingModels: '가져오는 중...',
      localProviderHint: '로컬 서버가 실행 중이어야 합니다.',
      notConfigured: '설정 안 됨',
      manualAddModel: '모델 수동 추가',
      addModel: '모델 추가',
      add: '추가',
      alreadyAdded: '이미 추가됨',
      fetchedModels: '가져온 모델',
      searchModels: '모델 검색',
      noModelsReturned: '반환된 모델이 없습니다.',
      modelsUnderProvider: '이 계정의 모델',
      noModelProfiles: '이 계정에는 모델 구성이 없습니다.',
      setDefault: '기본으로 설정',
      settingDefault: '설정 중...',
      deleteModel: '모델 삭제',
      deleting: '삭제 중...',
      testSelectedModel: '선택 모델 테스트',
      testDefaultModel: '기본 모델 테스트',
      testing: '테스트 중...',
      connectionOk: '연결 정상',
      connectionFailed: '연결 실패',
      modelsFetched: '모델 가져옴',
      fetchModelsFailed: '모델 가져오기 실패',
      selectProviderAccount: '공급자 계정을 선택하세요.',
      diagnosticsCopied: '진단 정보가 복사됨',
      diagnosticsCopyFailed: '진단 정보 복사 실패',
      saveAccountFailed: '공급자 계정 저장 실패',
      modelRequired: '모델 ID가 필요합니다.',
      duplicateModel: '이 모델은 선택한 공급자 계정에 이미 추가되어 있습니다.',
      addModelFailed: '모델 추가 실패',
      setDefaultFailed: '기본 모델 설정 실패',
      deleteModelFailed: '모델 삭제 실패',
      loadProviderAccountsFailed: '공급자 계정 로드 실패',
      deleteLastModelBlocked: '최소 하나의 모델 구성이 필요합니다.',
      localProviderMayNotRunning: '로컬 서버가 실행 중이 아닐 수 있습니다.',
      status: { ready: '사용 가능', needsApiKey: 'API 키 필요', needsModel: '모델 필요', needsLocalServer: '로컬 서버 필요', rateLimited: '제한됨', providerError: '공급자 오류', untested: '미테스트' },
      details: { modelMissing: '모델 없음', noKeySaved: '키 저장 안 됨', noRecentTest: '최근 테스트 없음' },
      friendly: { apiKey: 'API 키 또는 권한 문제입니다.', notFound: 'Endpoint 또는 모델이 잘못되었을 수 있습니다.', rateLimited: '할당량 또는 속도 제한입니다.', upstream: '공급자 상위 서비스 오류입니다.', network: '네트워크 또는 서비스 문제입니다.' },
    },
    es: {
      title: 'Modelos/API',
      description: 'Gestiona cuentas de proveedor y añade varios modelos en cada cuenta.',
      currentDefaultModel: 'Modelo predeterminado actual',
      noDefaultModel: 'Aún no hay un modelo predeterminado configurado.',
      providerAccounts: 'Cuentas de proveedor',
      addAccount: 'Añadir cuenta',
      cancel: 'Cancelar',
      providerPreset: 'Proveedor',
      accountLabel: 'Nombre de cuenta',
      baseUrl: 'URL base',
      noBaseUrl: 'Sin URL base',
      apiKey: 'Clave API',
      optionalLocalKey: 'Opcional para proveedores locales',
      pasteApiKey: 'Pegar clave API',
      saveProviderAccount: 'Guardar cuenta de proveedor',
      saving: 'Guardando...',
      noProviderAccounts: 'No hay cuentas de proveedor.',
      defaultBadge: 'Predeterminado',
      modelSingular: 'modelo',
      modelPlural: 'modelos',
      fetchModels: 'Obtener modelos',
      fetchingModels: 'Obteniendo...',
      localProviderHint: 'El servidor local debe estar en ejecución.',
      notConfigured: 'Sin configurar',
      manualAddModel: 'Añadir modelo manualmente',
      addModel: 'Añadir modelo',
      add: 'Añadir',
      alreadyAdded: 'Ya añadido',
      fetchedModels: 'Modelos obtenidos',
      searchModels: 'Buscar modelos',
      noModelsReturned: 'No se devolvieron modelos.',
      modelsUnderProvider: 'Modelos de esta cuenta',
      noModelProfiles: 'Esta cuenta aún no tiene modelos configurados.',
      setDefault: 'Definir predeterminado',
      settingDefault: 'Definiendo...',
      deleteModel: 'Eliminar modelo',
      deleting: 'Eliminando...',
      testSelectedModel: 'Probar modelo seleccionado',
      testDefaultModel: 'Probar modelo predeterminado',
      testing: 'Probando...',
      connectionOk: 'Conexión correcta',
      connectionFailed: 'Conexión fallida',
      modelsFetched: 'Modelos obtenidos',
      fetchModelsFailed: 'Error al obtener modelos',
      selectProviderAccount: 'Selecciona una cuenta de proveedor.',
      diagnosticsCopied: 'Diagnóstico copiado',
      diagnosticsCopyFailed: 'No se pudo copiar el diagnóstico',
      saveAccountFailed: 'No se pudo guardar la cuenta de proveedor',
      modelRequired: 'Se requiere el ID del modelo.',
      duplicateModel: 'Este modelo ya está añadido a la cuenta seleccionada.',
      addModelFailed: 'No se pudo añadir el modelo',
      setDefaultFailed: 'No se pudo definir el modelo predeterminado',
      deleteModelFailed: 'No se pudo eliminar el modelo',
      loadProviderAccountsFailed: 'No se pudieron cargar las cuentas de proveedor',
      deleteLastModelBlocked: 'Debe quedar al menos una configuración de modelo.',
      localProviderMayNotRunning: 'Es posible que el servidor local no esté en ejecución.',
      status: { ready: 'Listo', needsApiKey: 'Necesita clave API', needsModel: 'Necesita modelo', needsLocalServer: 'Necesita servidor local', rateLimited: 'Limitado', providerError: 'Error del proveedor', untested: 'Sin probar' },
      details: { modelMissing: 'Falta el modelo', noKeySaved: 'Clave no guardada', noRecentTest: 'Sin prueba reciente' },
      friendly: { apiKey: 'Problema de clave API o permisos.', notFound: 'Endpoint o modelo posiblemente incorrecto.', rateLimited: 'Cuota o límite alcanzado.', upstream: 'Error del proveedor.', network: 'Problema de red o servicio no disponible.' },
    },
    fr: {
      title: 'Modèles/API',
      description: 'Gérez les comptes fournisseurs et ajoutez plusieurs modèles sous chaque compte.',
      currentDefaultModel: 'Modèle par défaut actuel',
      noDefaultModel: 'Aucun modèle par défaut n’est encore configuré.',
      providerAccounts: 'Comptes fournisseur',
      addAccount: 'Ajouter un compte',
      cancel: 'Annuler',
      providerPreset: 'Fournisseur',
      accountLabel: 'Nom du compte',
      baseUrl: 'URL de base',
      noBaseUrl: 'Aucune URL de base',
      apiKey: 'Clé API',
      optionalLocalKey: 'Optionnelle pour les fournisseurs locaux',
      pasteApiKey: 'Coller la clé API',
      saveProviderAccount: 'Enregistrer le compte fournisseur',
      saving: 'Enregistrement...',
      noProviderAccounts: 'Aucun compte fournisseur.',
      defaultBadge: 'Par défaut',
      modelSingular: 'modèle',
      modelPlural: 'modèles',
      fetchModels: 'Charger les modèles',
      fetchingModels: 'Chargement...',
      localProviderHint: 'Le serveur local doit être lancé.',
      notConfigured: 'Non configuré',
      manualAddModel: 'Ajouter un modèle manuellement',
      addModel: 'Ajouter un modèle',
      add: 'Ajouter',
      alreadyAdded: 'Déjà ajouté',
      fetchedModels: 'Modèles chargés',
      searchModels: 'Rechercher des modèles',
      noModelsReturned: 'Aucun modèle retourné.',
      modelsUnderProvider: 'Modèles de ce compte',
      noModelProfiles: 'Aucun modèle configuré pour ce compte.',
      setDefault: 'Définir par défaut',
      settingDefault: 'Définition...',
      deleteModel: 'Supprimer le modèle',
      deleting: 'Suppression...',
      testSelectedModel: 'Tester le modèle sélectionné',
      testDefaultModel: 'Tester le modèle par défaut',
      testing: 'Test...',
      connectionOk: 'Connexion réussie',
      connectionFailed: 'Connexion échouée',
      modelsFetched: 'Modèles chargés',
      fetchModelsFailed: 'Échec du chargement',
      selectProviderAccount: 'Sélectionnez un compte fournisseur.',
      diagnosticsCopied: 'Diagnostic copié',
      diagnosticsCopyFailed: 'Échec de la copie du diagnostic',
      saveAccountFailed: 'Échec de l’enregistrement du compte fournisseur',
      modelRequired: 'L’ID du modèle est requis.',
      duplicateModel: 'Ce modèle est déjà ajouté à ce compte.',
      addModelFailed: 'Échec de l’ajout du modèle',
      setDefaultFailed: 'Échec de la définition par défaut',
      deleteModelFailed: 'Échec de la suppression du modèle',
      loadProviderAccountsFailed: 'Échec du chargement des comptes fournisseur',
      deleteLastModelBlocked: 'Au moins une configuration de modèle est requise.',
      localProviderMayNotRunning: 'Le serveur local n’est peut-être pas lancé.',
      status: { ready: 'Prêt', needsApiKey: 'Clé API requise', needsModel: 'Modèle requis', needsLocalServer: 'Serveur local requis', rateLimited: 'Limité', providerError: 'Erreur fournisseur', untested: 'Non testé' },
      details: { modelMissing: 'Modèle manquant', noKeySaved: 'Clé non enregistrée', noRecentTest: 'Aucun test récent' },
      friendly: { apiKey: 'Problème de clé API ou de permissions.', notFound: 'Endpoint ou modèle possiblement incorrect.', rateLimited: 'Quota ou limite atteint.', upstream: 'Erreur du fournisseur.', network: 'Problème réseau ou service indisponible.' },
    },
    de: {
      title: 'Modelle/API',
      description: 'Anbieterkonten verwalten und mehrere Modelle pro Konto hinzufügen.',
      currentDefaultModel: 'Aktuelles Standardmodell',
      noDefaultModel: 'Noch kein Standardmodell konfiguriert.',
      providerAccounts: 'Anbieterkonten',
      addAccount: 'Konto hinzufügen',
      cancel: 'Abbrechen',
      providerPreset: 'Anbieter',
      accountLabel: 'Kontoname',
      baseUrl: 'Basis-URL',
      noBaseUrl: 'Keine Basis-URL',
      apiKey: 'API-Schlüssel',
      optionalLocalKey: 'Für lokale Anbieter optional',
      pasteApiKey: 'API-Schlüssel einfügen',
      saveProviderAccount: 'Anbieterkonto speichern',
      saving: 'Speichern...',
      noProviderAccounts: 'Keine Anbieterkonten vorhanden.',
      defaultBadge: 'Standard',
      modelSingular: 'Modell',
      modelPlural: 'Modelle',
      fetchModels: 'Modelle abrufen',
      fetchingModels: 'Abrufen...',
      localProviderHint: 'Der lokale Server muss laufen.',
      notConfigured: 'Nicht konfiguriert',
      manualAddModel: 'Modell manuell hinzufügen',
      addModel: 'Modell hinzufügen',
      add: 'Hinzufügen',
      alreadyAdded: 'Bereits hinzugefügt',
      fetchedModels: 'Abgerufene Modelle',
      searchModels: 'Modelle suchen',
      noModelsReturned: 'Keine Modelle zurückgegeben.',
      modelsUnderProvider: 'Modelle dieses Kontos',
      noModelProfiles: 'Für dieses Konto sind noch keine Modelle konfiguriert.',
      setDefault: 'Als Standard setzen',
      settingDefault: 'Wird gesetzt...',
      deleteModel: 'Modell löschen',
      deleting: 'Löschen...',
      testSelectedModel: 'Ausgewähltes Modell testen',
      testDefaultModel: 'Standardmodell testen',
      testing: 'Test läuft...',
      connectionOk: 'Verbindung OK',
      connectionFailed: 'Verbindung fehlgeschlagen',
      modelsFetched: 'Modelle abgerufen',
      fetchModelsFailed: 'Modelle abrufen fehlgeschlagen',
      selectProviderAccount: 'Wählen Sie ein Anbieterkonto aus.',
      diagnosticsCopied: 'Diagnose kopiert',
      diagnosticsCopyFailed: 'Diagnose konnte nicht kopiert werden',
      saveAccountFailed: 'Anbieterkonto konnte nicht gespeichert werden',
      modelRequired: 'Modell-ID ist erforderlich.',
      duplicateModel: 'Dieses Modell wurde diesem Konto bereits hinzugefügt.',
      addModelFailed: 'Modell konnte nicht hinzugefügt werden',
      setDefaultFailed: 'Standardmodell konnte nicht gesetzt werden',
      deleteModelFailed: 'Modell konnte nicht gelöscht werden',
      loadProviderAccountsFailed: 'Anbieterkonten konnten nicht geladen werden',
      deleteLastModelBlocked: 'Mindestens eine Modellkonfiguration ist erforderlich.',
      localProviderMayNotRunning: 'Der lokale Server läuft möglicherweise nicht.',
      status: { ready: 'Bereit', needsApiKey: 'API-Schlüssel nötig', needsModel: 'Modell nötig', needsLocalServer: 'Lokaler Server nötig', rateLimited: 'Begrenzt', providerError: 'Anbieterfehler', untested: 'Ungetestet' },
      details: { modelMissing: 'Modell fehlt', noKeySaved: 'Schlüssel nicht gespeichert', noRecentTest: 'Kein aktueller Test' },
      friendly: { apiKey: 'Problem mit API-Schlüssel oder Berechtigung.', notFound: 'Endpoint oder Modell könnte falsch sein.', rateLimited: 'Kontingent oder Limit erreicht.', upstream: 'Fehler beim Anbieter.', network: 'Netzwerkproblem oder Dienst nicht verfügbar.' },
    },
    ru: {
      title: 'Модели/API',
      description: 'Управляйте аккаунтами провайдеров и добавляйте несколько моделей в каждый аккаунт.',
      currentDefaultModel: 'Текущая модель по умолчанию',
      noDefaultModel: 'Модель по умолчанию ещё не настроена.',
      providerAccounts: 'Аккаунты провайдеров',
      addAccount: 'Добавить аккаунт',
      cancel: 'Отмена',
      providerPreset: 'Провайдер',
      accountLabel: 'Название аккаунта',
      baseUrl: 'Базовый URL',
      noBaseUrl: 'Базовый URL не задан',
      apiKey: 'API-ключ',
      optionalLocalKey: 'Необязательно для локальных провайдеров',
      pasteApiKey: 'Вставьте API-ключ',
      saveProviderAccount: 'Сохранить аккаунт провайдера',
      saving: 'Сохранение...',
      noProviderAccounts: 'Аккаунтов провайдеров пока нет.',
      defaultBadge: 'По умолчанию',
      modelSingular: 'модель',
      modelPlural: 'моделей',
      fetchModels: 'Получить модели',
      fetchingModels: 'Получение...',
      localProviderHint: 'Локальный сервер должен быть запущен.',
      notConfigured: 'Не настроено',
      manualAddModel: 'Добавить модель вручную',
      addModel: 'Добавить модель',
      add: 'Добавить',
      alreadyAdded: 'Уже добавлено',
      fetchedModels: 'Полученные модели',
      searchModels: 'Поиск моделей',
      noModelsReturned: 'Модели не возвращены.',
      modelsUnderProvider: 'Модели этого аккаунта',
      noModelProfiles: 'В этом аккаунте ещё нет моделей.',
      setDefault: 'Сделать основной',
      settingDefault: 'Настройка...',
      deleteModel: 'Удалить модель',
      deleting: 'Удаление...',
      testSelectedModel: 'Проверить выбранную модель',
      testDefaultModel: 'Проверить модель по умолчанию',
      testing: 'Проверка...',
      connectionOk: 'Подключение OK',
      connectionFailed: 'Ошибка подключения',
      modelsFetched: 'Модели получены',
      fetchModelsFailed: 'Не удалось получить модели',
      selectProviderAccount: 'Выберите аккаунт провайдера.',
      diagnosticsCopied: 'Диагностика скопирована',
      diagnosticsCopyFailed: 'Не удалось скопировать диагностику',
      saveAccountFailed: 'Не удалось сохранить аккаунт провайдера',
      modelRequired: 'Нужен ID модели.',
      duplicateModel: 'Эта модель уже добавлена в выбранный аккаунт.',
      addModelFailed: 'Не удалось добавить модель',
      setDefaultFailed: 'Не удалось выбрать модель по умолчанию',
      deleteModelFailed: 'Не удалось удалить модель',
      loadProviderAccountsFailed: 'Не удалось загрузить аккаунты провайдеров',
      deleteLastModelBlocked: 'Нужна хотя бы одна конфигурация модели.',
      localProviderMayNotRunning: 'Локальный сервер может быть не запущен.',
      status: { ready: 'Готово', needsApiKey: 'Нужен API-ключ', needsModel: 'Нужна модель', needsLocalServer: 'Нужен локальный сервер', rateLimited: 'Лимит', providerError: 'Ошибка провайдера', untested: 'Не проверено' },
      details: { modelMissing: 'Модель не задана', noKeySaved: 'Ключ не сохранён', noRecentTest: 'Нет недавней проверки' },
      friendly: { apiKey: 'Проблема с API-ключом или правами.', notFound: 'Endpoint или модель могут быть неверными.', rateLimited: 'Достигнут лимит или квота.', upstream: 'Ошибка на стороне провайдера.', network: 'Проблема сети или сервис недоступен.' },
    },
  };
  return texts[appLanguage] ?? texts.en;
}

function getLocalizedProviderResultMessage(
  result: AIProviderOperationResult,
  text: AIProviderText,
  isLocalProvider: boolean,
): string | undefined {
  if (result.success) {
    return result.operation === 'fetchModels' ? text.modelsFetched : text.connectionOk;
  }
  if (result.status === 401 || result.status === 403) return text.friendly.apiKey;
  if (result.status === 404) return text.friendly.notFound;
  if (result.status === 429) return text.friendly.rateLimited;
  if (result.status === 500 || result.status === 502 || result.status === 503) return text.friendly.upstream;
  if (!result.status && isLocalProvider) return text.localProviderMayNotRunning;
  if (!result.status) return text.friendly.network;
  return result.friendlyMessage ? redactDiagnosticsText(result.friendlyMessage) : undefined;
}

function localizeAIProviderError(message: string | undefined, text: AIProviderText): string | undefined {
  if (!message) return undefined;
  if (/at least one AI model profile is required/i.test(message)) return text.deleteLastModelBlocked;
  if (/already exists/i.test(message)) return text.duplicateModel;
  if (/model id is required/i.test(message)) return text.modelRequired;
  return redactDiagnosticsText(message);
}

function getSettingsText(appLanguage: AppLanguage) {
  const appLanguages = {
    zh: '简体中文',
    en: 'English',
    ja: '日本語',
    ko: '한국어',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ru: 'Русский',
  };

  const texts = {
    zh: {
      groups: { personal: '个人', app: '应用', system: '系统' },
      nav: { accounts: '账号', writing: '写信', ai: 'AI 智能', about: '关于' },
      systemLanguage: '界面语言',
      connectedAccounts: '已连接账号',
      current: '当前',
      autoFetchInterval: '邮件自动拉取间隔',
      autoFetchHint: '关闭后仅在手动刷新时同步邮件',
      aiTitle: 'AI 智能',
      aiDescription: '使用 AI 进行分类、翻译、总结和回信建议',
      apiConfig: 'API 配置',
      aiReplyLanguage: 'AI 输出语言',
      autoClassify: '自动分类',
      scanDepth: '扫描深度',
      lookbackRange: '回看范围',
      save: '保存',
      saveAiSettings: '保存 AI 设置',
      about: '关于',
      appName: '应用名称',
      version: '版本',
      buildDate: '构建时间',
      appDescription: 'MiniMail 是一个基于 Electron、React 和 TypeScript 的轻量邮件客户端。',
      scanMode: {
        smart: { label: '智能扫描', sub: '先轻量评分，低置信度自动深度扫描' },
        light: { label: '轻量扫描', sub: '仅标题 + 发件人 / 每批 50 封' },
        deep: { label: '深度扫描', sub: '清洗后正文前 800 字 / 每批 10 封' },
      },
      lookback: { '3d': '3 天', '7d': '7 天', '1mo': '1 个月', '6mo': '半年', all: '全部' },
      appLanguages,
    },
    en: {
      groups: { personal: 'Personal', app: 'App', system: 'System' },
      nav: { accounts: 'Accounts', writing: 'Writing', ai: 'AI', about: 'About' },
      systemLanguage: 'Interface Language',
      connectedAccounts: 'Connected Accounts',
      current: 'Current',
      autoFetchInterval: 'Mail Auto Fetch Interval',
      autoFetchHint: 'When turned off, mail sync runs only on manual refresh',
      aiTitle: 'AI',
      aiDescription: 'Use AI for categorization, translation, summaries, and reply suggestions',
      apiConfig: 'API Configuration',
      aiReplyLanguage: 'AI Output Language',
      autoClassify: 'Auto Categorize',
      scanDepth: 'Scan Depth',
      lookbackRange: 'Lookback Range',
      save: 'Save',
      saveAiSettings: 'Save AI Settings',
      about: 'About',
      appName: 'App Name',
      version: 'Version',
      buildDate: 'Build Date',
      appDescription: 'MiniMail is a lightweight email client built with Electron, React, and TypeScript.',
      scanMode: {
        smart: { label: 'Smart Scan', sub: 'Light scoring first, auto deep scan for low confidence' },
        light: { label: 'Light Scan', sub: 'Subject + sender only / 50 emails per batch' },
        deep: { label: 'Deep Scan', sub: 'First 800 chars of cleaned body / 10 emails per batch' },
      },
      lookback: { '3d': '3 days', '7d': '7 days', '1mo': '1 month', '6mo': '6 months', all: 'All' },
      appLanguages,
    },
    ja: {
      groups: { personal: '個人', app: 'アプリ', system: 'システム' },
      nav: { accounts: 'アカウント', writing: 'Writing', ai: 'AI', about: 'このアプリについて' },
      systemLanguage: '表示言語',
      connectedAccounts: '接続済みアカウント',
      current: '現在',
      autoFetchInterval: 'メール自動取得間隔',
      autoFetchHint: 'オフの場合は手動更新時のみ同期します',
      aiTitle: 'AI',
      aiDescription: 'AI で分類・翻訳・要約・返信提案を行います',
      apiConfig: 'API 設定',
      aiReplyLanguage: 'AI 出力言語',
      autoClassify: '自動分類',
      scanDepth: 'スキャン深度',
      lookbackRange: '対象期間',
      save: '保存',
      saveAiSettings: 'AI 設定を保存',
      about: 'このアプリについて',
      appName: 'アプリ名',
      version: 'バージョン',
      buildDate: 'ビルド日時',
      appDescription: 'MiniMail は Electron、React、TypeScript で構築された軽量メールクライアントです。',
      scanMode: {
        smart: { label: 'スマートスキャン', sub: '軽量評価後、低信頼度は詳細スキャン' },
        light: { label: '軽量スキャン', sub: '件名 + 差出人のみ / 1 バッチ 50 件' },
        deep: { label: '詳細スキャン', sub: '洗浄済み本文の先頭 800 文字 / 1 バッチ 10 件' },
      },
      lookback: { '3d': '3日', '7d': '7日', '1mo': '1か月', '6mo': '半年', all: 'すべて' },
      appLanguages,
    },
    ko: {
      groups: { personal: '개인', app: '앱', system: '시스템' },
      nav: { accounts: '계정', writing: 'Writing', ai: 'AI', about: '정보' },
      systemLanguage: '인터페이스 언어',
      connectedAccounts: '연결된 계정',
      current: '현재',
      autoFetchInterval: '메일 자동 가져오기 간격',
      autoFetchHint: '끄면 수동 새로고침 때만 메일을 동기화합니다',
      aiTitle: 'AI',
      aiDescription: 'AI로 분류, 번역, 요약, 답장 제안을 제공합니다',
      apiConfig: 'API 설정',
      aiReplyLanguage: 'AI 출력 언어',
      autoClassify: '자동 분류',
      scanDepth: '스캔 깊이',
      lookbackRange: '조회 범위',
      save: '저장',
      saveAiSettings: 'AI 설정 저장',
      about: '정보',
      appName: '앱 이름',
      version: '버전',
      buildDate: '빌드 날짜',
      appDescription: 'MiniMail은 Electron, React, TypeScript로 만든 가벼운 메일 클라이언트입니다.',
      scanMode: {
        smart: { label: '스마트 스캔', sub: '가벼운 평가 후 낮은 신뢰도는 심층 스캔' },
        light: { label: '가벼운 스캔', sub: '제목 + 발신자만 / 배치당 50개' },
        deep: { label: '심층 스캔', sub: '정리된 본문 앞 800자 / 배치당 10개' },
      },
      lookback: { '3d': '3일', '7d': '7일', '1mo': '1개월', '6mo': '반년', all: '전체' },
      appLanguages,
    },
    es: {
      groups: { personal: 'Personal', app: 'Aplicación', system: 'Sistema' },
      nav: { accounts: 'Cuentas', writing: 'Writing', ai: 'IA', about: 'Acerca de' },
      systemLanguage: 'Idioma de la interfaz',
      connectedAccounts: 'Cuentas conectadas',
      current: 'Actual',
      autoFetchInterval: 'Intervalo de actualización automática',
      autoFetchHint: 'Si está desactivado, el correo solo se sincroniza al actualizar manualmente',
      aiTitle: 'IA',
      aiDescription: 'Usa IA para clasificar, traducir, resumir y sugerir respuestas',
      apiConfig: 'Configuración de API',
      aiReplyLanguage: 'Idioma de salida de IA',
      autoClassify: 'Clasificación automática',
      scanDepth: 'Profundidad de escaneo',
      lookbackRange: 'Rango de búsqueda',
      save: 'Guardar',
      saveAiSettings: 'Guardar ajustes de IA',
      about: 'Acerca de',
      appName: 'Nombre de la app',
      version: 'Versión',
      buildDate: 'Fecha de compilación',
      appDescription: 'MiniMail es un cliente de correo ligero creado con Electron, React y TypeScript.',
      scanMode: {
        smart: { label: 'Escaneo inteligente', sub: 'Puntuación ligera y profundo si hay baja confianza' },
        light: { label: 'Escaneo ligero', sub: 'Solo asunto + remitente / 50 correos por lote' },
        deep: { label: 'Escaneo profundo', sub: 'Primeros 800 caracteres del cuerpo limpio / 10 correos por lote' },
      },
      lookback: { '3d': '3 días', '7d': '7 días', '1mo': '1 mes', '6mo': '6 meses', all: 'Todo' },
      appLanguages,
    },
    fr: {
      groups: { personal: 'Personnel', app: 'Application', system: 'Système' },
      nav: { accounts: 'Comptes', writing: 'Writing', ai: 'IA', about: 'À propos' },
      systemLanguage: 'Langue de l’interface',
      connectedAccounts: 'Comptes connectés',
      current: 'Actuel',
      autoFetchInterval: 'Intervalle de relève automatique',
      autoFetchHint: 'Désactivé = synchronisation uniquement lors d’un rafraîchissement manuel',
      aiTitle: 'IA',
      aiDescription: 'Utiliser l’IA pour classer, traduire, résumer et proposer des réponses',
      apiConfig: 'Configuration API',
      aiReplyLanguage: 'Langue de sortie IA',
      autoClassify: 'Classement automatique',
      scanDepth: 'Profondeur d’analyse',
      lookbackRange: 'Période analysée',
      save: 'Enregistrer',
      saveAiSettings: 'Enregistrer les réglages IA',
      about: 'À propos',
      appName: 'Nom de l’application',
      version: 'Version',
      buildDate: 'Date de build',
      appDescription: 'MiniMail est un client mail léger construit avec Electron, React et TypeScript.',
      scanMode: {
        smart: { label: 'Analyse intelligente', sub: 'Score léger puis approfondie si confiance faible' },
        light: { label: 'Analyse légère', sub: 'Objet + expéditeur seulement / 50 mails par lot' },
        deep: { label: 'Analyse approfondie', sub: '800 premiers caractères du corps nettoyé / 10 mails par lot' },
      },
      lookback: { '3d': '3 jours', '7d': '7 jours', '1mo': '1 mois', '6mo': '6 mois', all: 'Tout' },
      appLanguages,
    },
    de: {
      groups: { personal: 'Persönlich', app: 'App', system: 'System' },
      nav: { accounts: 'Konten', writing: 'Writing', ai: 'KI', about: 'Über' },
      systemLanguage: 'Oberflächensprache',
      connectedAccounts: 'Verbundene Konten',
      current: 'Aktuell',
      autoFetchInterval: 'Automatisches Abrufintervall',
      autoFetchHint: 'Wenn ausgeschaltet, werden Mails nur manuell synchronisiert',
      aiTitle: 'KI',
      aiDescription: 'KI für Kategorisierung, Übersetzung, Zusammenfassung und Antwortvorschläge',
      apiConfig: 'API-Konfiguration',
      aiReplyLanguage: 'KI-Ausgabesprache',
      autoClassify: 'Automatisch kategorisieren',
      scanDepth: 'Scan-Tiefe',
      lookbackRange: 'Zeitraum',
      save: 'Speichern',
      saveAiSettings: 'KI-Einstellungen speichern',
      about: 'Über',
      appName: 'App-Name',
      version: 'Version',
      buildDate: 'Build-Datum',
      appDescription: 'MiniMail ist ein leichtgewichtiger Mail-Client auf Basis von Electron, React und TypeScript.',
      scanMode: {
        smart: { label: 'Intelligenter Scan', sub: 'Erst leichte Bewertung, bei niedriger Sicherheit tief' },
        light: { label: 'Leichter Scan', sub: 'Nur Betreff + Absender / 50 Mails pro Durchgang' },
        deep: { label: 'Tiefer Scan', sub: 'Erste 800 Zeichen des bereinigten Inhalts / 10 Mails pro Durchgang' },
      },
      lookback: { '3d': '3 Tage', '7d': '7 Tage', '1mo': '1 Monat', '6mo': '6 Monate', all: 'Alle' },
      appLanguages,
    },
    ru: {
      groups: { personal: 'Личное', app: 'Приложение', system: 'Система' },
      nav: { accounts: 'Аккаунты', writing: 'Writing', ai: 'ИИ', about: 'О программе' },
      systemLanguage: 'Язык интерфейса',
      connectedAccounts: 'Подключённые аккаунты',
      current: 'Текущий',
      autoFetchInterval: 'Интервал автопроверки почты',
      autoFetchHint: 'Если выключено, почта синхронизируется только вручную',
      aiTitle: 'ИИ',
      aiDescription: 'Используйте ИИ для классификации, перевода, сводок и ответов',
      apiConfig: 'Настройки API',
      aiReplyLanguage: 'Язык вывода ИИ',
      autoClassify: 'Автоклассификация',
      scanDepth: 'Глубина сканирования',
      lookbackRange: 'Период анализа',
      save: 'Сохранить',
      saveAiSettings: 'Сохранить настройки ИИ',
      about: 'О программе',
      appName: 'Название приложения',
      version: 'Версия',
      buildDate: 'Дата сборки',
      appDescription: 'MiniMail — лёгкий почтовый клиент на Electron, React и TypeScript.',
      scanMode: {
        smart: { label: 'Умное сканирование', sub: 'Сначала лёгкая оценка, затем глубокая при низкой уверенности' },
        light: { label: 'Лёгкое сканирование', sub: 'Только тема + отправитель / 50 писем за пакет' },
        deep: { label: 'Глубокое сканирование', sub: 'Первые 800 символов очищенного текста / 10 писем за пакет' },
      },
      lookback: { '3d': '3 дня', '7d': '7 дней', '1mo': '1 месяц', '6mo': '6 месяцев', all: 'Все' },
      appLanguages,
    },
  };

  const baseText = (texts as Record<string, typeof texts.en>)[appLanguage] ?? texts.en;
  const backupText = appLanguage === 'zh'
    ? {
      backupNav: '备份',
      backupTitle: '邮件备份',
      backupDescription: '导出当前缓存中的邮件为 EML 文件。导入功能将在后续任务中启用。',
      backupAccount: '账号',
      backupScope: '导出范围',
      backupFolders: '文件夹',
      backupDestination: '导出目录',
      backupFilters: '筛选条件',
      backupStart: '开始日期',
      backupEnd: '结束日期',
      backupPick: '选择文件夹',
      backupStartExport: '开始导出',
      backupCancel: '取消导出',
      backupOpenFolder: '打开文件夹',
      backupImportPlaceholder: 'EML 导入将在后续任务中启用。',
      backupScopeAccount: '整个账号',
      backupScopeFolders: '选中文件夹',
      backupNoFolders: '当前账号没有可用文件夹。',
      backupExportTitle: 'EML 导出',
      backupImportTitle: 'EML 导入',
    }
    : appLanguage === 'ja'
      ? {
        backupNav: 'バックアップ',
        backupTitle: 'メールバックアップ',
        backupDescription: '現在のキャッシュ済みメールを EML として書き出します。インポートは次の段階で有効化します。',
        backupAccount: 'アカウント',
        backupScope: 'エクスポート範囲',
        backupFolders: 'フォルダー',
        backupDestination: '出力先',
        backupFilters: 'フィルター',
        backupStart: '開始日',
        backupEnd: '終了日',
        backupPick: 'フォルダーを選択',
        backupStartExport: 'エクスポート開始',
        backupCancel: 'キャンセル',
        backupOpenFolder: 'フォルダーを開く',
        backupImportPlaceholder: 'EML インポートは次の段階で有効化します。',
        backupScopeAccount: 'アカウント全体',
        backupScopeFolders: '選択したフォルダー',
        backupNoFolders: 'このアカウントで利用できるフォルダーがありません。',
        backupExportTitle: 'EML エクスポート',
        backupImportTitle: 'EML インポート',
      }
      : appLanguage === 'ko'
        ? {
          backupNav: '백업',
          backupTitle: '메일 백업',
          backupDescription: '현재 캐시된 메일을 EML 파일로 내보냅니다. 가져오기는 다음 단계에서 활성화됩니다.',
          backupAccount: '계정',
          backupScope: '내보내기 범위',
          backupFolders: '폴더',
          backupDestination: '내보내기 위치',
          backupFilters: '필터',
          backupStart: '시작 날짜',
          backupEnd: '종료 날짜',
          backupPick: '폴더 선택',
          backupStartExport: '내보내기 시작',
          backupCancel: '취소',
          backupOpenFolder: '폴더 열기',
          backupImportPlaceholder: 'EML 가져오기는 다음 단계에서 활성화됩니다.',
          backupScopeAccount: '전체 계정',
          backupScopeFolders: '선택한 폴더',
          backupNoFolders: '이 계정에서 사용할 수 있는 폴더가 없습니다.',
          backupExportTitle: 'EML 내보내기',
          backupImportTitle: 'EML 가져오기',
        }
        : appLanguage === 'es'
          ? {
            backupNav: 'Copia',
            backupTitle: 'Copia de correo',
            backupDescription: 'Exporta el correo almacenado en caché a archivos EML. La importación se habilitará más adelante.',
            backupAccount: 'Cuenta',
            backupScope: 'Ámbito de exportación',
            backupFolders: 'Carpetas',
            backupDestination: 'Destino',
            backupFilters: 'Filtros',
            backupStart: 'Fecha inicial',
            backupEnd: 'Fecha final',
            backupPick: 'Elegir carpeta',
            backupStartExport: 'Iniciar exportación',
            backupCancel: 'Cancelar',
            backupOpenFolder: 'Abrir carpeta',
            backupImportPlaceholder: 'La importación EML se habilitará más adelante.',
            backupScopeAccount: 'Cuenta completa',
            backupScopeFolders: 'Carpetas seleccionadas',
            backupNoFolders: 'No hay carpetas disponibles para esta cuenta.',
            backupExportTitle: 'Exportación EML',
            backupImportTitle: 'Importación EML',
          }
          : appLanguage === 'fr'
            ? {
              backupNav: 'Sauvegarde',
              backupTitle: 'Sauvegarde mail',
              backupDescription: 'Exporte les mails du cache au format EML. L’import sera activé dans une prochaine étape.',
              backupAccount: 'Compte',
              backupScope: 'Portée de l’export',
              backupFolders: 'Dossiers',
              backupDestination: 'Destination',
              backupFilters: 'Filtres',
              backupStart: 'Date de début',
              backupEnd: 'Date de fin',
              backupPick: 'Choisir un dossier',
              backupStartExport: 'Démarrer l’export',
              backupCancel: 'Annuler',
              backupOpenFolder: 'Ouvrir le dossier',
              backupImportPlaceholder: 'L’import EML sera activé dans une prochaine étape.',
              backupScopeAccount: 'Compte complet',
              backupScopeFolders: 'Dossiers sélectionnés',
              backupNoFolders: 'Aucun dossier disponible pour ce compte.',
              backupExportTitle: 'Export EML',
              backupImportTitle: 'Import EML',
            }
            : appLanguage === 'de'
              ? {
                backupNav: 'Backup',
                backupTitle: 'Mail-Backup',
                backupDescription: 'Exportiert gecachte Mails als EML-Dateien. Der Import wird später aktiviert.',
                backupAccount: 'Konto',
                backupScope: 'Exportbereich',
                backupFolders: 'Ordner',
                backupDestination: 'Ziel',
                backupFilters: 'Filter',
                backupStart: 'Startdatum',
                backupEnd: 'Enddatum',
                backupPick: 'Ordner wählen',
                backupStartExport: 'Export starten',
                backupCancel: 'Abbrechen',
                backupOpenFolder: 'Ordner öffnen',
                backupImportPlaceholder: 'Der EML-Import wird später aktiviert.',
                backupScopeAccount: 'Gesamtes Konto',
                backupScopeFolders: 'Ausgewählte Ordner',
                backupNoFolders: 'Für dieses Konto sind keine Ordner verfügbar.',
                backupExportTitle: 'EML-Export',
                backupImportTitle: 'EML-Import',
              }
              : appLanguage === 'ru'
                ? {
                  backupNav: 'Резервная копия',
                  backupTitle: 'Резервная копия почты',
                  backupDescription: 'Экспортирует кэшированные письма в файлы EML. Импорт будет включён позже.',
                  backupAccount: 'Аккаунт',
                  backupScope: 'Область экспорта',
                  backupFolders: 'Папки',
                  backupDestination: 'Путь выгрузки',
                  backupFilters: 'Фильтры',
                  backupStart: 'Дата начала',
                  backupEnd: 'Дата окончания',
                  backupPick: 'Выбрать папку',
                  backupStartExport: 'Начать экспорт',
                  backupCancel: 'Отмена',
                  backupOpenFolder: 'Открыть папку',
                  backupImportPlaceholder: 'Импорт EML будет включён позже.',
                  backupScopeAccount: 'Весь аккаунт',
                  backupScopeFolders: 'Выбранные папки',
                  backupNoFolders: 'Для этого аккаунта нет доступных папок.',
                  backupExportTitle: 'Экспорт EML',
                  backupImportTitle: 'Импорт EML',
                }
                : {
                  backupNav: 'Backup',
                  backupTitle: 'Mail Backup',
                  backupDescription: 'Export cached mail to EML files. Import will be enabled in a later task.',
                  backupAccount: 'Account',
                  backupScope: 'Export Scope',
                  backupFolders: 'Folders',
                  backupDestination: 'Destination',
                  backupFilters: 'Filters',
                  backupStart: 'Start date',
                  backupEnd: 'End date',
                  backupPick: 'Choose folder',
                  backupStartExport: 'Start export',
                  backupCancel: 'Cancel export',
                  backupOpenFolder: 'Open folder',
                  backupImportPlaceholder: 'EML import will be enabled in a later task.',
                  backupImportPick: 'Choose EML files',
                  backupImportSources: 'Import sources',
                  backupImportTargetFolder: 'Target folder',
                  backupStartImport: 'Start import',
                  backupScopeAccount: 'Full account',
                  backupScopeFolders: 'Selected folders',
                  backupNoFolders: 'No folders available for this account.',
                  backupExportTitle: 'EML Export',
                  backupImportTitle: 'EML Import',
                };

  return {
    ...baseText,
    backupNav: appLanguage === 'zh' ? '备份' : 'Backup',
    backupTitle: appLanguage === 'zh' ? '邮件备份' : 'Mail Backup',
    backupDescription:
      appLanguage === 'zh'
        ? '导出当前缓存中的邮件为 EML 文件。导入功能将在后续任务中启用。'
        : 'Export cached mail to EML files. Import will be enabled in a later task.',
    backupAccount: appLanguage === 'zh' ? '账号' : 'Account',
    backupScope: appLanguage === 'zh' ? '导出范围' : 'Export Scope',
    backupFolders: appLanguage === 'zh' ? '文件夹' : 'Folders',
    backupDestination: appLanguage === 'zh' ? '导出目录' : 'Destination',
    backupFilters: appLanguage === 'zh' ? '筛选条件' : 'Filters',
    backupStart: appLanguage === 'zh' ? '开始日期' : 'Start date',
    backupEnd: appLanguage === 'zh' ? '结束日期' : 'End date',
    backupPick: appLanguage === 'zh' ? '选择文件夹' : 'Choose folder',
    backupStartExport: appLanguage === 'zh' ? '开始导出' : 'Start export',
    backupCancel: appLanguage === 'zh' ? '取消导出' : 'Cancel export',
    backupOpenFolder: appLanguage === 'zh' ? '打开文件夹' : 'Open folder',
    backupImportPlaceholder:
      appLanguage === 'zh'
        ? '选择 EML 文件或目录后，可导入到目标 IMAP 文件夹。'
        : appLanguage === 'ja'
          ? 'EML ファイルまたはフォルダを選択すると、対象の IMAP フォルダへ取り込めます。'
          : appLanguage === 'ko'
            ? 'EML 파일 또는 폴더를 선택한 뒤 대상 IMAP 폴더로 가져올 수 있습니다.'
            : appLanguage === 'es'
              ? 'Selecciona archivos o carpetas EML para importarlos a la carpeta IMAP de destino.'
              : appLanguage === 'fr'
                ? 'Sélectionnez des fichiers ou dossiers EML puis importez-les dans le dossier IMAP cible.'
                : appLanguage === 'de'
                  ? 'Wähle EML-Dateien oder Ordner aus und importiere sie in den Ziel-IMAP-Ordner.'
                  : appLanguage === 'ru'
                    ? 'Выберите EML-файлы или папки, затем импортируйте их в целевую папку IMAP.'
                    : 'Select EML files or folders, then import them into the target IMAP folder.',
    backupImportPick:
      appLanguage === 'zh'
        ? '选择 EML 文件'
        : appLanguage === 'ja'
          ? 'EML を選択'
          : appLanguage === 'ko'
            ? 'EML 선택'
            : appLanguage === 'es'
              ? 'Elegir EML'
              : appLanguage === 'fr'
                ? 'Choisir EML'
                : appLanguage === 'de'
                  ? 'EML auswählen'
                  : appLanguage === 'ru'
                    ? 'Выбрать EML'
                    : 'Choose EML files',
    backupImportSources:
      appLanguage === 'zh'
        ? '导入来源'
        : appLanguage === 'ja'
          ? '取込元'
          : appLanguage === 'ko'
            ? '가져오기 원본'
            : appLanguage === 'es'
              ? 'Origen de importación'
              : appLanguage === 'fr'
                ? 'Sources d’import'
                : appLanguage === 'de'
                  ? 'Importquelle'
                  : appLanguage === 'ru'
                    ? 'Источник импорта'
                    : 'Import sources',
    backupImportTargetFolder:
      appLanguage === 'zh'
        ? '目标文件夹'
        : appLanguage === 'ja'
          ? '取込先フォルダ'
          : appLanguage === 'ko'
            ? '대상 폴더'
            : appLanguage === 'es'
              ? 'Carpeta de destino'
              : appLanguage === 'fr'
                ? 'Dossier cible'
                : appLanguage === 'de'
                  ? 'Zielordner'
                  : appLanguage === 'ru'
                    ? 'Целевая папка'
                    : 'Target folder',
    backupStartImport:
      appLanguage === 'zh'
        ? '开始导入'
        : appLanguage === 'ja'
          ? 'インポート開始'
          : appLanguage === 'ko'
            ? '가져오기 시작'
            : appLanguage === 'es'
              ? 'Iniciar importación'
              : appLanguage === 'fr'
                ? 'Démarrer l’import'
                : appLanguage === 'de'
                  ? 'Import starten'
                  : appLanguage === 'ru'
                    ? 'Начать импорт'
                    : 'Start import',
    backupScopeAccount: appLanguage === 'zh' ? '整个账号' : 'Full account',
    backupScopeFolders: appLanguage === 'zh' ? '选中文件夹' : 'Selected folders',
    ...backupText,
    mailHistoryRange:
      appLanguage === 'zh' ? '邮件历史范围'
      : appLanguage === 'ja' ? 'メール履歴範囲'
      : appLanguage === 'ko' ? '메일 기록 범위'
      : appLanguage === 'es' ? 'Rango del historial de correo'
      : appLanguage === 'fr' ? 'Période de l’historique'
      : appLanguage === 'de' ? 'Mail-Verlaufsbereich'
      : appLanguage === 'ru' ? 'Диапазон истории почты'
      : 'Mail Fetch History Range',
    mailCacheRange:
      appLanguage === 'zh' ? '邮件缓存范围'
      : appLanguage === 'ja' ? 'メールキャッシュ範囲'
      : appLanguage === 'ko' ? '메일 캐시 범위'
      : appLanguage === 'es' ? 'Rango de caché de correo'
      : appLanguage === 'fr' ? 'Période du cache mail'
      : appLanguage === 'de' ? 'Mail-Cache-Bereich'
      : appLanguage === 'ru' ? 'Диапазон кэша почты'
      : 'Mail Cache Range',
    mailCacheHint:
      appLanguage === 'zh' ? '超出这个缓存范围的邮件会从本地缓存中清理。'
      : appLanguage === 'ja' ? 'この範囲を超えたメールはローカルキャッシュから整理されます。'
      : appLanguage === 'ko' ? '이 범위를 넘는 메일은 로컬 캐시에서 정리됩니다.'
      : appLanguage === 'es' ? 'Los correos fuera de este rango se limpiarán del caché local.'
      : appLanguage === 'fr' ? 'Les mails hors de cette période seront supprimés du cache local.'
      : appLanguage === 'de' ? 'Mails außerhalb dieses Bereichs werden aus dem lokalen Cache entfernt.'
      : appLanguage === 'ru' ? 'Письма вне этого диапазона будут очищены из локального кэша.'
      : 'Mails outside this range are cleaned from local cache.',
    githubNotificationsView:
      appLanguage === 'zh' ? 'GitHub 通知视图'
      : appLanguage === 'ja' ? 'GitHub 通知ビュー'
      : appLanguage === 'ko' ? 'GitHub 알림 보기'
      : appLanguage === 'es' ? 'Vista de notificaciones de GitHub'
      : appLanguage === 'fr' ? 'Vue des notifications GitHub'
      : appLanguage === 'de' ? 'GitHub-Benachrichtigungsansicht'
      : appLanguage === 'ru' ? 'Вид уведомлений GitHub'
      : 'GitHub Notifications View',
    githubNotificationsHint:
      appLanguage === 'zh' ? '启用后，侧栏会显示一个 GitHub 分栏，并将 GitHub 仓库通知聚合为独立会话视图。'
      : appLanguage === 'ja' ? '有効にすると、サイドバーに GitHub セクションが表示され、GitHub 通知会話をまとめて確認できます。'
      : appLanguage === 'ko' ? '켜면 사이드바에 GitHub 섹션이 나타나고 GitHub 저장소 알림 대화를 따로 볼 수 있습니다.'
      : appLanguage === 'es' ? 'Al activarlo, la barra lateral mostrará una sección de GitHub con conversaciones agrupadas.'
      : appLanguage === 'fr' ? 'Une fois activé, la barre latérale affiche une section GitHub avec les conversations regroupées.'
      : appLanguage === 'de' ? 'Wenn aktiviert, zeigt die Seitenleiste einen GitHub-Bereich mit gebündelten Benachrichtigungs-Konversationen.'
      : appLanguage === 'ru' ? 'После включения в боковой панели появится раздел GitHub с объединёнными цепочками уведомлений.'
      : 'When enabled, the sidebar shows a GitHub section with grouped repository notification conversations.',
    signatureTitle: appLanguage === 'zh' ? '默认签名' : 'Default signature',
    signatureHint: appLanguage === 'zh'
      ? '用于新邮件、回复和转发。签名会插入正文区域，不会进入引用原文。'
      : 'Used for new mail, replies, and forwards. It is inserted into your editable body, before quoted content.',
    signatureEnabled: appLanguage === 'zh' ? '启用签名' : 'Enable signature',
    signaturePlaceholder: appLanguage === 'zh' ? '输入此账号的默认签名' : 'Enter the default signature for this account',
    signatureSave: appLanguage === 'zh' ? '保存签名' : 'Save signature',
    signatureSaving: appLanguage === 'zh' ? '保存中...' : 'Saving...',
    signatureSaved: appLanguage === 'zh' ? '签名已保存' : 'Signature saved',
    signatureSaveFailed: appLanguage === 'zh' ? '签名保存失败' : 'Failed to save signature',
    quickPhraseTitle: appLanguage === 'zh' ? '快捷短语' : 'Quick phrases',
    quickPhraseHint: appLanguage === 'zh'
      ? '保存常用话术，在写邮件、回复或转发时快速插入到正文光标位置。'
      : 'Save reusable snippets and insert them into the compose body when writing, replying, or forwarding.',
    quickPhraseAdd: appLanguage === 'zh' ? '新增短语' : 'Add phrase',
    quickPhraseTitleLabel: appLanguage === 'zh' ? '标题' : 'Title',
    quickPhraseTextLabel: appLanguage === 'zh' ? '正文' : 'Text',
    quickPhraseTagsLabel: appLanguage === 'zh' ? '标签' : 'Tags',
    quickPhraseTitlePlaceholder: appLanguage === 'zh' ? '例如：跟进客户' : 'Example: Follow up',
    quickPhraseTextPlaceholder: appLanguage === 'zh' ? '输入常用话术' : 'Enter reusable text',
    quickPhraseTagsPlaceholder: appLanguage === 'zh' ? '逗号分隔，可选' : 'Comma-separated, optional',
    quickPhraseSave: appLanguage === 'zh' ? '保存快捷短语' : 'Save quick phrases',
    quickPhraseSaving: appLanguage === 'zh' ? '保存中...' : 'Saving...',
    quickPhraseSaved: appLanguage === 'zh' ? '快捷短语已保存' : 'Quick phrases saved',
    quickPhraseSaveFailed: appLanguage === 'zh' ? '快捷短语保存失败' : 'Failed to save quick phrases',
    quickPhraseDelete: appLanguage === 'zh' ? '删除' : 'Delete',
    aiPrivacyMode:
      appLanguage === 'zh' ? '云端隐私模式'
      : appLanguage === 'ja' ? 'クラウドプライバシーモード'
      : appLanguage === 'ko' ? '클라우드 개인정보 모드'
      : appLanguage === 'es' ? 'Modo de privacidad en la nube'
      : appLanguage === 'fr' ? 'Mode de confidentialité cloud'
      : appLanguage === 'de' ? 'Cloud-Datenschutzmodus'
      : appLanguage === 'ru' ? 'Режим приватности для облака'
      : 'Cloud Privacy Mode',
    aiPrivacyHint:
      appLanguage === 'zh' ? '仅影响发送到云端 AI 的内容。本地渲染和本地缓存不会因为此设置被改写。'
      : appLanguage === 'ja' ? 'クラウド AI に送る内容だけへ適用されます。ローカル表示やキャッシュは書き換えません。'
      : appLanguage === 'ko' ? '클라우드 AI 로 전송되는 내용에만 적용됩니다. 로컬 표시와 캐시는 바꾸지 않습니다.'
      : appLanguage === 'es' ? 'Solo afecta al contenido enviado al modelo en la nube. No modifica la vista ni la caché local.'
      : appLanguage === 'fr' ? 'Affecte uniquement le contenu envoyé au modèle cloud. L’affichage et le cache local restent intacts.'
      : appLanguage === 'de' ? 'Wirkt sich nur auf Inhalte aus, die an das Cloud-Modell gesendet werden. Lokale Anzeige und Cache bleiben unverändert.'
      : appLanguage === 'ru' ? 'Влияет только на содержимое, отправляемое в облачную модель. Локальное отображение и кэш не меняются.'
      : 'Only affects content sent to cloud AI. Local rendering and local cache stay unchanged.',
    aiPrivacyOptions: {
      local_raw:
        appLanguage === 'zh' ? '本地不脱敏'
        : appLanguage === 'ja' ? 'ローカルのみ（脱敏なし）'
        : appLanguage === 'ko' ? '로컬 전용(비식별화 없음)'
        : appLanguage === 'es' ? 'Solo local (sin redacción)'
        : appLanguage === 'fr' ? 'Local uniquement (sans masquage)'
        : appLanguage === 'de' ? 'Nur lokal (ohne Maskierung)'
        : appLanguage === 'ru' ? 'Только локально (без маскировки)'
        : 'Local only (no redaction)',
      cloud_raw:
        appLanguage === 'zh' ? '云端不脱敏'
        : appLanguage === 'ja' ? 'クラウド送信（脱敏なし）'
        : appLanguage === 'ko' ? '클라우드 전송(비식별화 없음)'
        : appLanguage === 'es' ? 'Nube sin redacción'
        : appLanguage === 'fr' ? 'Cloud sans masquage'
        : appLanguage === 'de' ? 'Cloud ohne Maskierung'
        : appLanguage === 'ru' ? 'Облако без маскировки'
        : 'Cloud without redaction',
      cloud_redacted:
        appLanguage === 'zh' ? '云端脱敏'
        : appLanguage === 'ja' ? 'クラウド送信（脱敏あり）'
        : appLanguage === 'ko' ? '클라우드 전송(비식별화 적용)'
        : appLanguage === 'es' ? 'Nube con redacción'
        : appLanguage === 'fr' ? 'Cloud avec masquage'
        : appLanguage === 'de' ? 'Cloud mit Maskierung'
        : appLanguage === 'ru' ? 'Облако с маскировкой'
        : 'Cloud with redaction',
    },
  } as {
    groups: Record<'personal' | 'app' | 'system', string>;
    nav: Record<'accounts' | 'writing' | 'ai' | 'about', string>;
    backupNav: string;
    backupTitle: string;
    backupDescription: string;
    backupAccount: string;
    backupScope: string;
    backupFolders: string;
    backupDestination: string;
    backupFilters: string;
    backupStart: string;
    backupEnd: string;
    backupPick: string;
    backupStartExport: string;
    backupCancel: string;
    backupOpenFolder: string;
    backupImportPlaceholder: string;
    backupImportPick: string;
    backupImportSources: string;
    backupImportTargetFolder: string;
    backupStartImport: string;
    backupScopeAccount: string;
    backupScopeFolders: string;
    backupNoFolders: string;
    backupExportTitle: string;
    backupImportTitle: string;
    systemLanguage: string;
    connectedAccounts: string;
    current: string;
    autoFetchInterval: string;
    mailHistoryRange: string;
    mailCacheRange: string;
    mailCacheHint: string;
    githubNotificationsView: string;
    githubNotificationsHint: string;
    signatureTitle: string;
    signatureHint: string;
    signatureEnabled: string;
    signaturePlaceholder: string;
    signatureSave: string;
    signatureSaving: string;
    signatureSaved: string;
    signatureSaveFailed: string;
    quickPhraseTitle: string;
    quickPhraseHint: string;
    quickPhraseAdd: string;
    quickPhraseTitleLabel: string;
    quickPhraseTextLabel: string;
    quickPhraseTagsLabel: string;
    quickPhraseTitlePlaceholder: string;
    quickPhraseTextPlaceholder: string;
    quickPhraseTagsPlaceholder: string;
    quickPhraseSave: string;
    quickPhraseSaving: string;
    quickPhraseSaved: string;
    quickPhraseSaveFailed: string;
    quickPhraseDelete: string;
    autoFetchHint: string;
    aiTitle: string;
    aiDescription: string;
    apiConfig: string;
    aiReplyLanguage: string;
    autoClassify: string;
    scanDepth: string;
    lookbackRange: string;
    aiPrivacyMode: string;
    aiPrivacyHint: string;
    aiPrivacyOptions: Record<AiPrivacyMode, string>;
    save: string;
    saveAiSettings: string;
    about: string;
    appName: string;
    version: string;
    buildDate: string;
    appDescription: string;
    scanMode: Record<'smart' | 'light' | 'deep', { label: string; sub: string }>;
    lookback: Record<'3d' | '7d' | '1mo' | '6mo' | 'all', string>;
    appLanguages: typeof appLanguages;
  };
}

function getAvatarColor(name: string): string {
  const colors = ['#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0071e3', '#bf5af2'];
  return colors[name.charCodeAt(0) % colors.length];
}

export function SettingsModal({
  t,
  isOpen,
  onClose,
  appLanguage,
  onAppLanguageChange,
  aiTargetLanguage,
  onAiTargetLanguageChange,
  onAddAccount,
  accounts,
  onDeleteAccount,
  currentAccountId,
  aiAutoSort,
  onAiAutoSortChange,
  aiScanMode,
  onAiScanModeChange,
  aiLookback,
  onAiLookbackChange,
  aiPrivacyMode,
  onAiPrivacyModeChange,
  mailHistoryRange,
  onMailHistoryRangeChange,
  mailCacheRange,
  onMailCacheRangeChange,
  autoFetchInterval,
  onAutoFetchIntervalChange,
  githubNotificationsViewEnabled,
  onGithubNotificationsViewEnabledChange,
  composeSignatureSettings,
  onComposeSignatureSettingsChange,
  composeQuickPhraseSettings,
  onComposeQuickPhraseSettingsChange,
  backupState,
  backupAccounts,
  backupFolders,
  onBackupAccountChange,
  onBackupScopeChange,
  onBackupFolderToggle,
  onBackupReadStateChange,
  onBackupStartDateChange,
  onBackupEndDateChange,
  onBackupPickDestination,
  onBackupPickImportSources,
  onBackupImportTargetFolderChange,
  onStartBackupExport,
  onStartBackupImport,
  onCancelBackupExport,
  onOpenBackupFolder,
}: SettingsModalProps) {
  const [activeNav, setActiveNav] = useState<NavId>('accounts');
  const [saved, setSaved] = useState(false);
  const [apiSaveError, setApiSaveError] = useState<string | null>(null);
  const [selectedApiProfile, setSelectedApiProfile] = useState<string>('primary');
  const [activeApiProfile, setActiveApiProfile] = useState<string>('primary');
  const [apiProfiles, setApiProfiles] = useState<Record<string, AIConfigProfileForm>>(EMPTY_AI_CONFIG_PROFILES);
  const [providerAccountsSnapshot, setProviderAccountsSnapshot] = useState<AIProviderAccountWithModelsSnapshot | null>(null);
  const [selectedProviderAccountId, setSelectedProviderAccountId] = useState<string>('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<AIProviderConnectionTestResult | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelListResult, setModelListResult] = useState<AIProviderModelListResult | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [providerDiagnostics, setProviderDiagnostics] = useState<Record<string, AIProviderOperationResult>>({});
  const [diagnosticsCopyStatus, setDiagnosticsCopyStatus] = useState<string | null>(null);
  const [isAddingProviderAccount, setIsAddingProviderAccount] = useState(false);
  const [newProviderAccountForm, setNewProviderAccountForm] = useState<NewProviderAccountForm>({
    providerPresetId: 'openai',
    label: 'OpenAI',
    baseUrl: getOpenAICompatiblePresetById('openai').baseUrl,
    apiKey: '',
  });
  const [isSavingProviderAccount, setIsSavingProviderAccount] = useState(false);
  const [manualModelId, setManualModelId] = useState('');
  const [isSavingModelProfile, setIsSavingModelProfile] = useState(false);
  const [isDeletingModelProfile, setIsDeletingModelProfile] = useState<string | null>(null);
  const [isSettingDefaultModelProfile, setIsSettingDefaultModelProfile] = useState<string | null>(null);
  const [signatureDrafts, setSignatureDrafts] = useState<Record<string, { enabled: boolean; text: string }>>({});
  const [savingSignatureAccountId, setSavingSignatureAccountId] = useState<number | null>(null);
  const [signatureSaveStatus, setSignatureSaveStatus] = useState<{ accountId: number; success: boolean } | null>(null);
  const [quickPhraseDrafts, setQuickPhraseDrafts] = useState<Array<{ id: string; title: string; text: string; tags: string }>>([]);
  const [savingQuickPhrases, setSavingQuickPhrases] = useState(false);
  const [quickPhraseSaveStatus, setQuickPhraseSaveStatus] = useState<'success' | 'error' | null>(null);

  const normalizedLanguage = normalizeAppLanguage(appLanguage);
  const ui = useMemo(() => getSettingsText(normalizedLanguage), [normalizedLanguage]);
  const apiProfileUi = useMemo(() => getApiProfileText(normalizedLanguage), [normalizedLanguage]);
  const aiProviderUi = useMemo(() => getAIProviderText(normalizedLanguage), [normalizedLanguage]);
  const modelsApiLabel = aiProviderUi.title;
  const apiProfileList = useMemo(() => Object.values(apiProfiles), [apiProfiles]);
  const selectedApiProfileForm = apiProfiles[selectedApiProfile] ?? apiProfileList[0] ?? EMPTY_AI_CONFIG_PROFILES.primary;
  const selectedProviderPreset = getOpenAICompatiblePresetById(selectedApiProfileForm.providerPresetId);
  const providerAccounts = providerAccountsSnapshot?.accounts ?? [];
  const defaultModelProfileId = providerAccountsSnapshot?.defaultModelProfileId || '';
  const defaultProviderAccount = providerAccounts.find((account) =>
    account.modelProfiles.some((modelProfile) => modelProfile.modelProfileId === defaultModelProfileId),
  );
  const defaultModelProfile = defaultProviderAccount?.modelProfiles.find((modelProfile) =>
    modelProfile.modelProfileId === defaultModelProfileId,
  );
  const selectedProviderAccount = providerAccounts.find((account) => account.providerAccountId === selectedProviderAccountId)
    ?? defaultProviderAccount
    ?? providerAccounts[0];
  const selectedProviderAccountPreset = getOpenAICompatiblePresetById(selectedProviderAccount?.providerPresetId ?? 'custom');
  const selectedProviderAccountModels = selectedProviderAccount?.modelProfiles ?? [];
  const selectedProviderAccountDefaultModel = selectedProviderAccountModels.find((modelProfile) => modelProfile.isDefault)
    ?? selectedProviderAccountModels[0];

  useEffect(() => {
    if (!isOpen) return;
    const drafts: Record<string, { enabled: boolean; text: string }> = {};
    for (const account of accounts) {
      const savedSignature = composeSignatureSettings.byAccountId[String(account.id)];
      drafts[String(account.id)] = {
        enabled: Boolean(savedSignature?.enabled),
        text: savedSignature?.text || '',
      };
    }
    setSignatureDrafts(drafts);
    setSignatureSaveStatus(null);
  }, [accounts, composeSignatureSettings, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setQuickPhraseDrafts(composeQuickPhraseSettings.phrases.map((phrase) => ({
      id: phrase.id,
      title: phrase.title,
      text: phrase.text,
      tags: phrase.tags.join(', '),
    })));
    setQuickPhraseSaveStatus(null);
  }, [composeQuickPhraseSettings, isOpen]);

  async function handleSaveComposeSignature(accountId: number) {
    const draft = signatureDrafts[String(accountId)] || { enabled: false, text: '' };
    const nextSettings = updateComposeSignatureForAccount(composeSignatureSettings, accountId, draft);
    setSavingSignatureAccountId(accountId);
    setSignatureSaveStatus(null);
    try {
      const response = await window.electronAPI.invoke(
        'settings:set',
        COMPOSE_SIGNATURES_SETTING_KEY,
        serializeComposeSignatureSettings(nextSettings),
      ) as { success?: boolean; error?: string } | undefined;
      if (response?.success === false) {
        throw new Error(response.error || ui.signatureSaveFailed);
      }
      onComposeSignatureSettingsChange(nextSettings);
      setSignatureSaveStatus({ accountId, success: true });
    } catch {
      setSignatureSaveStatus({ accountId, success: false });
    } finally {
      setSavingSignatureAccountId(null);
    }
  }

  function handleAddQuickPhraseDraft() {
    setQuickPhraseDrafts((current) => [
      ...current,
      { id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: '', text: '', tags: '' },
    ]);
    setQuickPhraseSaveStatus(null);
  }

  async function handleSaveQuickPhrases() {
    setSavingQuickPhrases(true);
    setQuickPhraseSaveStatus(null);
    try {
      let nextSettings: ComposeQuickPhraseSettings = { version: 1, phrases: [] };
      for (const draft of quickPhraseDrafts) {
        if (!draft.text.trim()) continue;
        const persistedId = draft.id.startsWith('draft-') ? undefined : draft.id;
        nextSettings = upsertComposeQuickPhrase(nextSettings, {
          id: persistedId,
          title: draft.title,
          text: draft.text,
          tags: draft.tags,
        });
      }
      await onComposeQuickPhraseSettingsChange(nextSettings);
      setQuickPhraseSaveStatus('success');
    } catch {
      setQuickPhraseSaveStatus('error');
    } finally {
      setSavingQuickPhrases(false);
    }
  }

  function handleDeleteQuickPhraseDraft(id: string) {
    setQuickPhraseDrafts((current) => current.filter((phrase) => phrase.id !== id));
    if (!id.startsWith('draft-')) {
      void Promise.resolve(onComposeQuickPhraseSettingsChange(deleteComposeQuickPhrase(composeQuickPhraseSettings, id)))
        .then(() => setQuickPhraseSaveStatus('success'))
        .catch(() => setQuickPhraseSaveStatus('error'));
    } else {
      setQuickPhraseSaveStatus(null);
    }
  }
  const chatEndpointPreview = useMemo(() => {
    try {
      return selectedApiProfileForm.baseUrl.trim()
        ? normalizeOpenAICompatibleChatEndpoint(selectedApiProfileForm.baseUrl)
        : '';
    } catch {
      return '';
    }
  }, [selectedApiProfileForm.baseUrl]);
  const modelsEndpointPreview = useMemo(() => {
    try {
      return selectedApiProfileForm.baseUrl.trim()
        ? normalizeOpenAICompatibleModelsEndpoint(selectedApiProfileForm.baseUrl)
        : '';
    } catch {
      return '';
    }
  }, [selectedApiProfileForm.baseUrl]);
  const visibleModelOptions = useMemo(() => {
    const query = modelSearchQuery.trim().toLowerCase();
    const models = modelListResult?.success ? modelListResult.models ?? [] : [];
    return models
      .filter((model) => !query || model.toLowerCase().includes(query))
      .slice(0, 100);
  }, [modelListResult, modelSearchQuery]);
  const modelMatchCount = useMemo(() => {
    const query = modelSearchQuery.trim().toLowerCase();
    const models = modelListResult?.success ? modelListResult.models ?? [] : [];
    return query ? models.filter((model) => model.toLowerCase().includes(query)).length : models.length;
  }, [modelListResult, modelSearchQuery]);
  const historyRangeOptions = useMemo(() => getMailHistoryRangeOptions(normalizedLanguage), [normalizedLanguage]);
  const cacheRangeOptions = useMemo(() => getMailCacheRangeOptions(normalizedLanguage), [normalizedLanguage]);
  const autoFetchOptions = useMemo(() => getAutoFetchIntervalOptions(normalizedLanguage), [normalizedLanguage]);
  const backupReadOptions = useMemo(() => getBackupReadStateOptions(normalizedLanguage), [normalizedLanguage]);
  const backupSummary = useMemo(() => summarizeBackupResult(backupState.lastResult, normalizedLanguage), [backupState.lastResult, normalizedLanguage]);
  const backupProgressPercent = backupState.progress.total > 0
    ? Math.min(100, Math.round((backupState.progress.processed / backupState.progress.total) * 100))
    : 0;

  function applyProviderProfileSnapshot(snapshot: AIProviderProfileSnapshot) {
    const profiles = snapshot.profiles.map(profileSnapshotToForm);
    const record = providerProfilesToRecord(profiles);
    setApiProfiles(record);
    setActiveApiProfile(snapshot.defaultProviderId);
    setSelectedApiProfile((current) => record[current] ? current : snapshot.defaultProviderId || profiles[0]?.id || 'primary');
  }

  function applyProviderAccountsWithModelsSnapshot(snapshot: AIProviderAccountWithModelsSnapshot) {
    setProviderAccountsSnapshot(snapshot);
    setSelectedProviderAccountId((current) => {
      if (snapshot.accounts.some((account) => account.providerAccountId === current)) return current;
      const defaultAccount = snapshot.accounts.find((account) =>
        account.modelProfiles.some((modelProfile) => modelProfile.modelProfileId === snapshot.defaultModelProfileId),
      );
      return defaultAccount?.providerAccountId || snapshot.accounts[0]?.providerAccountId || '';
    });
  }

  async function refreshProviderAccountsWithModels(preferredAccountId?: string) {
    const response = await window.electronAPI.invoke('ai:getProviderAccountsWithModels') as {
      success: boolean;
      data?: AIProviderAccountWithModelsSnapshot;
      error?: string;
    };
    if (!response.success || !response.data) {
      throw new Error(localizeAIProviderError(response.error, aiProviderUi) || aiProviderUi.loadProviderAccountsFailed);
    }
    applyProviderAccountsWithModelsSnapshot(response.data);
    if (preferredAccountId && response.data.accounts.some((account) => account.providerAccountId === preferredAccountId)) {
      setSelectedProviderAccountId(preferredAccountId);
    }
  }

  function legacyProfileIdFromProviderAccountId(providerAccountId: string): string {
    return providerAccountId.startsWith('account_')
      ? providerAccountId.slice('account_'.length)
      : providerAccountId;
  }

  function accountModelToProfileForm(
    account: NonNullable<typeof selectedProviderAccount>,
    modelProfile?: AIModelProfileSnapshotForm,
  ): AIConfigProfileForm {
    return {
      id: legacyProfileIdFromProviderAccountId(account.providerAccountId),
      providerPresetId: account.providerPresetId,
      label: account.label,
      baseUrl: account.baseUrl,
      apiKey: '',
      model: modelProfile?.model || '',
      hasApiKey: account.hasApiKey,
      isDefault: modelProfile?.modelProfileId === defaultModelProfileId,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  useEffect(() => {
    if (!isOpen) return;
    setActiveNav('accounts');
    setApiSaveError(null);
    setConnectionTestResult(null);
    setModelListResult(null);
    setModelSearchQuery('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const providerProfilesResponse = await window.electronAPI.invoke('ai:getProviderProfiles') as {
          success: boolean;
          data?: AIProviderProfileSnapshot;
        };
        if (providerProfilesResponse.success && providerProfilesResponse.data) {
          applyProviderProfileSnapshot(providerProfilesResponse.data);
          const accountsWithModelsResponse = await window.electronAPI.invoke('ai:getProviderAccountsWithModels') as {
            success: boolean;
            data?: AIProviderAccountWithModelsSnapshot;
          };
          if (accountsWithModelsResponse.success && accountsWithModelsResponse.data) {
            applyProviderAccountsWithModelsSnapshot(accountsWithModelsResponse.data);
          }
          return;
        }

        const cfg = await window.electronAPI.invoke('ai:getConfig') as {
          success: boolean;
          data?: {
            baseUrl: string;
            model: string;
            hasApiKey: boolean;
            activeProfileId?: AIConfigProfileId;
            profiles?: Record<AIConfigProfileId, {
              baseUrl: string;
              model: string;
              hasApiKey: boolean;
            }>;
          };
        };

        if (cfg.success && cfg.data) {
          const activeProfileId = cfg.data.activeProfileId ?? 'primary';
          setActiveApiProfile(activeProfileId);
          setSelectedApiProfile(activeProfileId);
          setApiProfiles({
            primary: {
              id: 'primary',
              baseUrl: cfg.data.profiles?.primary?.baseUrl || cfg.data.baseUrl || '',
              label: 'Profile A',
              providerPresetId: findOpenAICompatiblePresetByBaseUrl(cfg.data.profiles?.primary?.baseUrl || cfg.data.baseUrl || '').id,
              apiKey: '',
              model: cfg.data.profiles?.primary?.model || cfg.data.model || '',
              hasApiKey: cfg.data.profiles?.primary?.hasApiKey ?? cfg.data.hasApiKey,
              isDefault: activeProfileId === 'primary',
            },
            secondary: {
              id: 'secondary',
              baseUrl: cfg.data.profiles?.secondary?.baseUrl || '',
              label: 'Profile B',
              providerPresetId: findOpenAICompatiblePresetByBaseUrl(cfg.data.profiles?.secondary?.baseUrl || '').id,
              apiKey: '',
              model: cfg.data.profiles?.secondary?.model || '',
              hasApiKey: cfg.data.profiles?.secondary?.hasApiKey ?? false,
              isDefault: activeProfileId === 'secondary',
            },
          });
        }
      } catch {
        // Keep current inputs when config fetch fails.
      }
    })();
  }, [isOpen]);

  useEffect(() => {
    setConnectionTestResult(null);
    setModelListResult(null);
    setModelSearchQuery('');
    setDiagnosticsCopyStatus(null);
  }, [selectedApiProfile]);

  useEffect(() => {
    setConnectionTestResult(null);
    setModelListResult(null);
    setModelSearchQuery('');
    setManualModelId('');
    setDiagnosticsCopyStatus(null);
    setApiSaveError(null);
  }, [selectedProviderAccountId]);

  function updateSelectedApiProfile(patch: Partial<AIConfigProfileForm>) {
    setConnectionTestResult(null);
    setModelListResult(null);
    setModelSearchQuery('');
    setApiProfiles((prev) => ({
      ...prev,
      [selectedApiProfile]: {
        ...selectedApiProfileForm,
        ...prev[selectedApiProfile],
        ...patch,
      },
    }));
  }

  async function handleFetchModels() {
    setIsFetchingModels(true);
    setModelListResult(null);
    setModelSearchQuery('');
    setApiSaveError(null);
    setDiagnosticsCopyStatus(null);
    try {
      const response = await window.electronAPI.invoke('ai:fetchModels', {
        profileId: selectedApiProfile,
        providerId: selectedProviderPreset.id,
        providerLabel: selectedProviderPreset.label,
        baseUrl: selectedApiProfileForm.baseUrl,
        apiKey: selectedApiProfileForm.apiKey.trim() || undefined,
        model: selectedApiProfileForm.model,
        localProvider: Boolean(selectedProviderPreset.isLocal),
      }) as AIProviderModelListResult;
      setModelListResult(response);
      setProviderDiagnostics((prev) => ({ ...prev, [selectedApiProfile]: response }));
    } catch (error) {
      const response: AIProviderModelListResult = {
        success: false,
        provider: { id: selectedProviderPreset.id, label: selectedProviderPreset.label },
        model: selectedApiProfileForm.model,
        operation: 'fetchModels',
        timestamp: new Date().toISOString(),
        friendlyMessage: selectedProviderPreset.isLocal
          ? 'Ollama / LM Studio / vLLM local server may not be running.'
          : 'Network error. Check your connection or provider availability.',
        errorSummary: truncateDiagnostics(redactDiagnosticsText((error as Error).message)),
        requestBodyKeys: [],
        error: (error as Error).message,
      };
      setModelListResult(response);
      setProviderDiagnostics((prev) => ({ ...prev, [selectedApiProfile]: response }));
    } finally {
      setIsFetchingModels(false);
    }
  }

  async function handleTestConnection() {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    setApiSaveError(null);
    setDiagnosticsCopyStatus(null);
    try {
      const response = await window.electronAPI.invoke('ai:testConnection', {
        profileId: selectedApiProfile,
        providerId: selectedProviderPreset.id,
        providerLabel: selectedProviderPreset.label,
        baseUrl: selectedApiProfileForm.baseUrl,
        apiKey: selectedApiProfileForm.apiKey.trim() || undefined,
        model: selectedApiProfileForm.model,
        localProvider: Boolean(selectedProviderPreset.isLocal),
      }) as AIProviderConnectionTestResult;
      setConnectionTestResult(response);
      setProviderDiagnostics((prev) => ({ ...prev, [selectedApiProfile]: response }));
    } catch (error) {
      const response: AIProviderConnectionTestResult = {
        success: false,
        provider: { id: selectedProviderPreset.id, label: selectedProviderPreset.label },
        model: selectedApiProfileForm.model,
        operation: 'testConnection',
        timestamp: new Date().toISOString(),
        friendlyMessage: selectedProviderPreset.isLocal
          ? 'Ollama / LM Studio / vLLM local server may not be running.'
          : 'Network error. Check your connection or provider availability.',
        errorSummary: truncateDiagnostics(redactDiagnosticsText((error as Error).message)),
        requestBodyKeys: ['model', 'messages', 'temperature', 'max_tokens'],
        error: (error as Error).message,
      };
      setConnectionTestResult(response);
      setProviderDiagnostics((prev) => ({ ...prev, [selectedApiProfile]: response }));
    } finally {
      setIsTestingConnection(false);
    }
  }

  async function handleFetchModelsForProviderAccount(
    account: NonNullable<typeof selectedProviderAccount>,
    modelProfile?: AIModelProfileSnapshotForm,
  ) {
    setIsFetchingModels(true);
    setModelListResult(null);
    setModelSearchQuery('');
    setApiSaveError(null);
    setDiagnosticsCopyStatus(null);
    const preset = getOpenAICompatiblePresetById(account.providerPresetId);
    const profileId = legacyProfileIdFromProviderAccountId(account.providerAccountId);
    try {
      const response = await window.electronAPI.invoke('ai:fetchModels', {
        profileId,
        providerAccountId: account.providerAccountId,
        providerId: preset.id,
        providerLabel: preset.label,
        baseUrl: account.baseUrl,
        model: modelProfile?.model || '',
        localProvider: Boolean(account.isLocal || preset.isLocal),
      }) as AIProviderModelListResult;
      setModelListResult(response);
      setProviderDiagnostics((prev) => ({ ...prev, [profileId]: response }));
    } catch (error) {
      const response: AIProviderModelListResult = {
        success: false,
        provider: { id: preset.id, label: preset.label },
        model: modelProfile?.model || '',
        operation: 'fetchModels',
        timestamp: new Date().toISOString(),
        friendlyMessage: account.isLocal || preset.isLocal
          ? 'Ollama / LM Studio / vLLM local server may not be running.'
          : 'Network error. Check your connection or provider availability.',
        errorSummary: truncateDiagnostics(redactDiagnosticsText((error as Error).message)),
        requestBodyKeys: [],
        error: (error as Error).message,
      };
      setModelListResult(response);
      setProviderDiagnostics((prev) => ({ ...prev, [profileId]: response }));
    } finally {
      setIsFetchingModels(false);
    }
  }

  async function handleTestProviderAccountModel(
    account: NonNullable<typeof selectedProviderAccount>,
    modelProfile?: AIModelProfileSnapshotForm,
  ) {
    if (!modelProfile?.model) return;
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    setApiSaveError(null);
    setDiagnosticsCopyStatus(null);
    const preset = getOpenAICompatiblePresetById(account.providerPresetId);
    const profileId = legacyProfileIdFromProviderAccountId(account.providerAccountId);
    try {
      const response = await window.electronAPI.invoke('ai:testConnection', {
        profileId,
        providerAccountId: account.providerAccountId,
        providerId: preset.id,
        providerLabel: preset.label,
        baseUrl: account.baseUrl,
        model: modelProfile.model,
        localProvider: Boolean(account.isLocal || preset.isLocal),
      }) as AIProviderConnectionTestResult;
      setConnectionTestResult(response);
      setProviderDiagnostics((prev) => ({ ...prev, [profileId]: response }));
    } catch (error) {
      const response: AIProviderConnectionTestResult = {
        success: false,
        provider: { id: preset.id, label: preset.label },
        model: modelProfile.model,
        operation: 'testConnection',
        timestamp: new Date().toISOString(),
        friendlyMessage: account.isLocal || preset.isLocal
          ? 'Ollama / LM Studio / vLLM local server may not be running.'
          : 'Network error. Check your connection or provider availability.',
        errorSummary: truncateDiagnostics(redactDiagnosticsText((error as Error).message)),
        requestBodyKeys: ['model', 'messages', 'temperature', 'max_tokens'],
        error: (error as Error).message,
      };
      setConnectionTestResult(response);
      setProviderDiagnostics((prev) => ({ ...prev, [profileId]: response }));
    } finally {
      setIsTestingConnection(false);
    }
  }

  async function handleCopyDiagnostics(result: AIProviderOperationResult) {
    try {
      const appVersion = await window.electronAPI.getVersion().catch(() => undefined);
      const payload = buildSafeDiagnosticsPayload({
        appVersion,
        profile: selectedApiProfileForm,
        presetLabel: selectedProviderPreset.label,
        presetIsLocal: Boolean(selectedProviderPreset.isLocal),
        isDefault: activeApiProfile === selectedApiProfile,
        result,
      });
      await navigator.clipboard.writeText(formatDiagnosticsMarkdown(payload));
      setDiagnosticsCopyStatus(aiProviderUi.diagnosticsCopied);
      window.setTimeout(() => setDiagnosticsCopyStatus(null), 2400);
    } catch (error) {
      setDiagnosticsCopyStatus(aiProviderUi.diagnosticsCopyFailed);
    }
  }

  function handleProviderPresetChange(presetId: OpenAICompatibleProviderPresetId) {
    const nextPreset = getOpenAICompatiblePresetById(presetId);
    const previousPreset = getOpenAICompatiblePresetById(selectedApiProfileForm.providerPresetId);
    const currentModel = selectedApiProfileForm.model.trim();
    const shouldUsePresetModel =
      !currentModel ||
      Boolean(previousPreset.defaultModel && currentModel === previousPreset.defaultModel);

    updateSelectedApiProfile({
      providerPresetId: nextPreset.id,
      ...(nextPreset.isCustom ? {} : { baseUrl: nextPreset.baseUrl }),
      ...(!nextPreset.isCustom && shouldUsePresetModel ? { model: nextPreset.defaultModel } : {}),
    });
  }

  function handleBaseUrlChange(baseUrl: string) {
    updateSelectedApiProfile({
      baseUrl,
      providerPresetId: findOpenAICompatiblePresetByBaseUrl(baseUrl).id,
    });
  }

  function handleAddProviderProfile() {
    const id = `provider_${Date.now().toString(36)}`;
    const draft: AIConfigProfileForm = {
      id,
      providerPresetId: 'custom',
      label: 'New Provider',
      baseUrl: '',
      apiKey: '',
      model: '',
      hasApiKey: false,
      isDefault: false,
      isDraft: true,
    };
    setApiProfiles((prev) => ({ ...prev, [id]: draft }));
    setSelectedApiProfile(id);
    setConnectionTestResult(null);
    setModelListResult(null);
    setModelSearchQuery('');
  }

  async function refreshProviderProfiles(preferredProfileId?: string) {
    const response = await window.electronAPI.invoke('ai:getProviderProfiles') as {
      success: boolean;
      data?: AIProviderProfileSnapshot;
      error?: string;
    };
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load AI provider profiles');
    }
    applyProviderProfileSnapshot(response.data);
    if (preferredProfileId && response.data.profiles.some((profile) => profile.id === preferredProfileId)) {
      setSelectedApiProfile(preferredProfileId);
    }
  }

  async function handleSaveApi() {
    try {
      setApiSaveError(null);
      const payload = {
        id: selectedApiProfileForm.id,
        providerPresetId: selectedApiProfileForm.providerPresetId,
        label: selectedApiProfileForm.label,
        baseUrl: selectedApiProfileForm.baseUrl,
        model: selectedApiProfileForm.model,
        isDefault: selectedApiProfileForm.id === activeApiProfile,
        ...(selectedApiProfileForm.apiKey.trim() ? { apiKey: selectedApiProfileForm.apiKey } : {}),
      };
      const response = await window.electronAPI.invoke('ai:saveProviderProfile', payload) as {
        success: boolean;
        data?: { snapshot?: AIProviderProfileSnapshot };
        error?: string;
      };
      if (!response.success) {
        setApiSaveError(response.error || 'Failed to save AI config');
        return;
      }
      if (response.data?.snapshot) {
        applyProviderProfileSnapshot(response.data.snapshot);
        setSelectedApiProfile(selectedApiProfileForm.id);
      } else {
        await refreshProviderProfiles(selectedApiProfileForm.id);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setApiSaveError(localizeAIProviderError((error as Error).message, aiProviderUi) || aiProviderUi.saveAccountFailed);
    }
  }

  async function handleActivateApiProfile(profileId: string) {
    try {
      setApiSaveError(null);
      const response = await window.electronAPI.invoke('ai:setDefaultProvider', profileId) as {
        success: boolean;
        data?: AIProviderProfileSnapshot;
        error?: string;
      };
      if (!response.success) {
        setApiSaveError(response.error || 'Failed to switch AI profile');
        return;
      }
      if (response.data) {
        applyProviderProfileSnapshot(response.data);
      } else {
        await refreshProviderProfiles(profileId);
      }
      setSelectedApiProfile(profileId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setApiSaveError(localizeAIProviderError((error as Error).message, aiProviderUi) || aiProviderUi.addModelFailed);
    }
  }

  async function handleDeleteProviderProfile(profileId: string) {
    if (isLegacyAIProviderProfile(profileId)) return;

    const profile = apiProfiles[profileId];
    if (profile?.isDraft) {
      const nextProfiles = { ...apiProfiles };
      delete nextProfiles[profileId];
      setApiProfiles(nextProfiles);
      const fallbackId = activeApiProfile in nextProfiles ? activeApiProfile : Object.keys(nextProfiles)[0] || 'primary';
      setSelectedApiProfile(fallbackId);
      return;
    }

    try {
      setApiSaveError(null);
      const response = await window.electronAPI.invoke('ai:deleteProviderProfile', profileId) as {
        success: boolean;
        data?: AIProviderProfileSnapshot;
        error?: string;
      };
      if (!response.success) {
        setApiSaveError(response.error || 'Failed to delete AI provider');
        return;
      }
      if (response.data) {
        applyProviderProfileSnapshot(response.data);
      } else {
        await refreshProviderProfiles();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setApiSaveError(localizeAIProviderError((error as Error).message, aiProviderUi) || aiProviderUi.setDefaultFailed);
    }
  }

  function handleNewProviderAccountPresetChange(presetId: OpenAICompatibleProviderPresetId) {
    const preset = getOpenAICompatiblePresetById(presetId);
    setNewProviderAccountForm((current) => ({
      ...current,
      providerPresetId: preset.id,
      label: current.label.trim() && current.label !== getOpenAICompatiblePresetById(current.providerPresetId).label
        ? current.label
        : preset.label,
      baseUrl: preset.isCustom ? current.baseUrl : preset.baseUrl,
    }));
  }

  async function handleSaveProviderAccount() {
    const preset = getOpenAICompatiblePresetById(newProviderAccountForm.providerPresetId);
    setIsSavingProviderAccount(true);
    setApiSaveError(null);
    try {
      const response = await window.electronAPI.invoke('ai:saveProviderAccount', {
        providerPresetId: newProviderAccountForm.providerPresetId,
        label: newProviderAccountForm.label.trim() || preset.label,
        baseUrl: newProviderAccountForm.baseUrl.trim(),
        apiKey: newProviderAccountForm.apiKey.trim() || undefined,
        isLocal: Boolean(preset.isLocal),
      }) as {
        success: boolean;
        data?: {
          account?: { providerAccountId: string };
          snapshot?: AIProviderAccountWithModelsSnapshot;
        };
        error?: string;
      };
      if (!response.success) {
        setApiSaveError(localizeAIProviderError(response.error, aiProviderUi) || aiProviderUi.saveAccountFailed);
        return;
      }

      if (response.data?.snapshot) {
        applyProviderAccountsWithModelsSnapshot(response.data.snapshot);
      } else {
        await refreshProviderAccountsWithModels(response.data?.account?.providerAccountId);
      }
      if (response.data?.account?.providerAccountId) {
        setSelectedProviderAccountId(response.data.account.providerAccountId);
      }
      setNewProviderAccountForm({
        providerPresetId: 'openai',
        label: 'OpenAI',
        baseUrl: getOpenAICompatiblePresetById('openai').baseUrl,
        apiKey: '',
      });
      setIsAddingProviderAccount(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setApiSaveError(localizeAIProviderError((error as Error).message, aiProviderUi) || aiProviderUi.deleteModelFailed);
    } finally {
      setIsSavingProviderAccount(false);
    }
  }

  function modelExistsUnderSelectedAccount(model: string): boolean {
    const normalizedModel = model.trim();
    return Boolean(normalizedModel && selectedProviderAccountModels.some((profile) => profile.model === normalizedModel));
  }

  async function handleAddModelToSelectedAccount(model: string) {
    if (!selectedProviderAccount) return;
    const trimmedModel = model.trim();
    if (!trimmedModel) {
      setApiSaveError(aiProviderUi.modelRequired);
      return;
    }
    if (modelExistsUnderSelectedAccount(trimmedModel)) {
      setApiSaveError(aiProviderUi.duplicateModel);
      return;
    }

    setIsSavingModelProfile(true);
    setApiSaveError(null);
    try {
      const response = await window.electronAPI.invoke('ai:saveModelProfile', {
        providerAccountId: selectedProviderAccount.providerAccountId,
        label: trimmedModel,
        model: trimmedModel,
      }) as {
        success: boolean;
        data?: { snapshot?: AIProviderAccountWithModelsSnapshot };
        error?: string;
      };
      if (!response.success) {
        setApiSaveError(localizeAIProviderError(response.error, aiProviderUi) || aiProviderUi.addModelFailed);
        return;
      }
      if (response.data?.snapshot) {
        applyProviderAccountsWithModelsSnapshot(response.data.snapshot);
        setSelectedProviderAccountId(selectedProviderAccount.providerAccountId);
      } else {
        await refreshProviderAccountsWithModels(selectedProviderAccount.providerAccountId);
      }
      setManualModelId('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setApiSaveError((error as Error).message);
    } finally {
      setIsSavingModelProfile(false);
    }
  }

  async function handleSetDefaultModelProfile(modelProfileId: string) {
    setIsSettingDefaultModelProfile(modelProfileId);
    setApiSaveError(null);
    try {
      const response = await window.electronAPI.invoke('ai:setDefaultModelProfile', modelProfileId) as {
        success: boolean;
        data?: AIProviderAccountWithModelsSnapshot;
        error?: string;
      };
      if (!response.success) {
        setApiSaveError(localizeAIProviderError(response.error, aiProviderUi) || aiProviderUi.setDefaultFailed);
        return;
      }
      if (response.data) {
        applyProviderAccountsWithModelsSnapshot(response.data);
      } else {
        await refreshProviderAccountsWithModels(selectedProviderAccount?.providerAccountId);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setApiSaveError((error as Error).message);
    } finally {
      setIsSettingDefaultModelProfile(null);
    }
  }

  async function handleDeleteModelProfile(modelProfileId: string) {
    setIsDeletingModelProfile(modelProfileId);
    setApiSaveError(null);
    try {
      const response = await window.electronAPI.invoke('ai:deleteModelProfile', modelProfileId) as {
        success: boolean;
        data?: AIProviderAccountWithModelsSnapshot;
        error?: string;
      };
      if (!response.success) {
        setApiSaveError(localizeAIProviderError(response.error, aiProviderUi) || aiProviderUi.deleteModelFailed);
        return;
      }
      if (response.data) {
        applyProviderAccountsWithModelsSnapshot(response.data);
      } else {
        await refreshProviderAccountsWithModels(selectedProviderAccount?.providerAccountId);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setApiSaveError((error as Error).message);
    } finally {
      setIsDeletingModelProfile(null);
    }
  }

  async function handleSaveAISettings() {
    try {
      await window.electronAPI.invoke('ai:saveSettings', {
        autoSort: aiAutoSort,
        scanMode: aiScanMode,
        lookback: aiLookback,
        privacyMode: aiPrivacyMode,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Keep silent until explicit error UI is added.
    }
  }

  function renderAIProviderPage() {
    return (
      <div className="px-6 py-5">
        <div className="mx-auto w-full max-w-[620px]">
          <div className="mb-4">
            <p className="text-[13px] font-semibold text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"', letterSpacing: '-0.01em' }}>
              {modelsApiLabel}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: '#48484a' }}>
              {aiProviderUi.description}
            </p>
          </div>
          {apiSaveError && (
            <div className="mb-3 rounded-lg px-3 py-2 text-[11px]" style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff6b6b' }}>
              {apiSaveError}
            </div>
          )}

          <div className="rounded-xl px-3 py-3 mb-3" style={{ backgroundColor: '#161618' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles className="w-3 h-3" style={{ color: '#64d2ff' }} />
              <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                {aiProviderUi.currentDefaultModel}
              </span>
            </div>
            {defaultProviderAccount && defaultModelProfile ? (() => {
              const readiness = getProviderReadiness(
                accountModelToProfileForm(defaultProviderAccount, defaultModelProfile),
                providerDiagnostics[legacyProfileIdFromProviderAccountId(defaultProviderAccount.providerAccountId)],
                aiProviderUi,
              );
              const preset = getOpenAICompatiblePresetById(defaultProviderAccount.providerPresetId);
              return (
                <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: '#0d0d0f' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-white">{defaultProviderAccount.label}</div>
                      <div className="mt-1 truncate text-[10px]" style={{ color: '#8e8e93' }}>
                        {preset.label} · {defaultModelProfile.label}
                      </div>
                      <div className="mt-1 break-all text-[10px]" style={{ color: '#c7c7cc' }}>{defaultModelProfile.model}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                        <span style={{ color: readiness.color }}>{readiness.label}</span>
                        <span className="truncate" style={{ color: '#636366' }}>{truncateDiagnostics(readiness.detail, 96)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleTestProviderAccountModel(defaultProviderAccount, defaultModelProfile)}
                      disabled={isTestingConnection || !defaultModelProfile.model.trim()}
                      className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      {isTestingConnection
                        ? aiProviderUi.testing
                        : aiProviderUi.testDefaultModel}
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div className="rounded-lg px-2.5 py-2 text-[11px]" style={{ backgroundColor: '#0d0d0f', color: '#8e8e93' }}>
                {aiProviderUi.noDefaultModel}
              </div>
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3">
            <div className="rounded-xl px-3 py-3" style={{ backgroundColor: '#161618' }}>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                  {aiProviderUi.providerAccounts}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingProviderAccount((value) => !value);
                    setApiSaveError(null);
                  }}
                  className="rounded-md px-2 py-1 text-[10px] font-medium text-white cursor-pointer"
                  style={{ backgroundColor: '#1e1e20' }}
                >
                  {isAddingProviderAccount
                    ? aiProviderUi.cancel
                    : aiProviderUi.addAccount}
                </button>
              </div>
              {isAddingProviderAccount && (
                <div className="mb-2.5 rounded-lg px-2.5 py-2" style={{ backgroundColor: '#0d0d0f', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="grid gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px]" style={{ color: '#8e8e93' }}>{aiProviderUi.providerPreset}</span>
                      <select
                        value={newProviderAccountForm.providerPresetId}
                        onChange={(event) => handleNewProviderAccountPresetChange(event.target.value as OpenAICompatibleProviderPresetId)}
                        className="w-full rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none"
                        style={{ backgroundColor: '#161618' }}
                      >
                        {OPENAI_COMPATIBLE_PROVIDER_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px]" style={{ color: '#8e8e93' }}>{aiProviderUi.accountLabel}</span>
                      <input
                        type="text"
                        value={newProviderAccountForm.label}
                        onChange={(event) => setNewProviderAccountForm((current) => ({ ...current, label: event.target.value }))}
                        className="w-full rounded-md px-2 py-1.5 text-[11px] text-white placeholder-zinc-600 focus:outline-none"
                        style={{ backgroundColor: '#161618' }}
                        placeholder="SiliconFlow"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px]" style={{ color: '#8e8e93' }}>{aiProviderUi.baseUrl}</span>
                      <input
                        type="text"
                        value={newProviderAccountForm.baseUrl}
                        onChange={(event) => setNewProviderAccountForm((current) => ({ ...current, baseUrl: event.target.value }))}
                        className="w-full rounded-md px-2 py-1.5 text-[11px] text-white placeholder-zinc-600 focus:outline-none"
                        style={{ backgroundColor: '#161618' }}
                        placeholder="https://api.example.com/v1"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px]" style={{ color: '#8e8e93' }}>{aiProviderUi.apiKey}</span>
                      <input
                        type="password"
                        value={newProviderAccountForm.apiKey}
                        onChange={(event) => setNewProviderAccountForm((current) => ({ ...current, apiKey: event.target.value }))}
                        className="w-full rounded-md px-2 py-1.5 text-[11px] text-white placeholder-zinc-600 focus:outline-none"
                        style={{ backgroundColor: '#161618' }}
                        placeholder={getOpenAICompatiblePresetById(newProviderAccountForm.providerPresetId).isLocal ? aiProviderUi.optionalLocalKey : aiProviderUi.pasteApiKey}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSaveProviderAccount()}
                      disabled={isSavingProviderAccount || !newProviderAccountForm.baseUrl.trim()}
                      className="rounded-md px-2 py-1.5 text-[11px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                      style={{ backgroundColor: '#0071e3' }}
                    >
                      {isSavingProviderAccount
                        ? aiProviderUi.saving
                        : aiProviderUi.saveProviderAccount}
                    </button>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                {providerAccounts.length === 0 && (
                  <div className="rounded-lg px-2.5 py-2 text-[10px]" style={{ backgroundColor: '#0d0d0f', color: '#8e8e93' }}>
                    {aiProviderUi.noProviderAccounts}
                  </div>
                )}
                {providerAccounts.map((account) => {
                  const preset = getOpenAICompatiblePresetById(account.providerPresetId);
                  const isSelected = selectedProviderAccount?.providerAccountId === account.providerAccountId;
                  const ownsDefault = account.modelProfiles.some((modelProfile) => modelProfile.modelProfileId === defaultModelProfileId);
                  const summaryModel = account.modelProfiles.find((modelProfile) => modelProfile.isDefault) ?? account.modelProfiles[0];
                  const readiness = getProviderReadiness(
                    accountModelToProfileForm(account, summaryModel),
                    providerDiagnostics[legacyProfileIdFromProviderAccountId(account.providerAccountId)],
                    aiProviderUi,
                  );
                  return (
                    <button
                      key={account.providerAccountId}
                      type="button"
                      onClick={() => {
                        setSelectedProviderAccountId(account.providerAccountId);
                        setConnectionTestResult(null);
                        setModelListResult(null);
                        setModelSearchQuery('');
                      }}
                      className="block w-full rounded-lg px-2.5 py-2 text-left cursor-pointer"
                      style={{
                        backgroundColor: isSelected ? 'rgba(0,113,227,0.18)' : '#0d0d0f',
                        border: `1px solid ${isSelected ? 'rgba(0,113,227,0.58)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium text-white">{account.label || preset.label}</span>
                        {ownsDefault && <span className="shrink-0 text-[10px]" style={{ color: '#64d2ff' }}>{aiProviderUi.defaultBadge}</span>}
                      </div>
                      <div className="mt-1 truncate text-[10px]" style={{ color: '#8e8e93' }}>
                        {preset.label} · {account.hasApiKey ? apiProfileUi.keySaved : apiProfileUi.keyEmpty}
                      </div>
                      <div className="mt-1 truncate text-[10px]" style={{ color: '#636366' }}>{account.baseUrl || aiProviderUi.noBaseUrl}</div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                        <span style={{ color: readiness.color }}>{readiness.label}</span>
                        <span style={{ color: '#8e8e93' }}>
                          {account.modelProfiles.length} {account.modelProfiles.length === 1 ? aiProviderUi.modelSingular : aiProviderUi.modelPlural}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl px-3 py-3" style={{ backgroundColor: '#161618' }}>
              {selectedProviderAccount ? (
                <>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-white">{selectedProviderAccount.label}</div>
                      <div className="mt-1 text-[10px]" style={{ color: '#8e8e93' }}>
                        {selectedProviderAccountPreset.label} · {selectedProviderAccount.hasApiKey ? apiProfileUi.keySaved : apiProfileUi.keyEmpty}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleFetchModelsForProviderAccount(selectedProviderAccount, selectedProviderAccountDefaultModel)}
                      disabled={isFetchingModels || !selectedProviderAccount.baseUrl.trim()}
                      className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      {isFetchingModels ? aiProviderUi.fetchingModels : aiProviderUi.fetchModels}
                    </button>
                  </div>
                  <div className="rounded-lg px-2.5 py-2 mb-2" style={{ backgroundColor: '#0d0d0f' }}>
                    <div className="text-[10px] mb-1" style={{ color: '#8e8e93' }}>{aiProviderUi.baseUrl}</div>
                    <div className="break-all text-[10px]" style={{ color: '#c7c7cc' }}>
                      {selectedProviderAccount.baseUrl || aiProviderUi.notConfigured}
                    </div>
                    {selectedProviderAccount.isLocal && (
                      <div className="mt-1 text-[10px]" style={{ color: '#8e8e93' }}>{aiProviderUi.localProviderHint}</div>
                    )}
                  </div>
                  <div className="rounded-lg px-2.5 py-2 mb-2.5" style={{ backgroundColor: '#0d0d0f' }}>
                    <div className="text-[10px] font-medium mb-1.5" style={{ color: '#8e8e93' }}>
                      {aiProviderUi.manualAddModel}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={manualModelId}
                        onChange={(event) => {
                          setManualModelId(event.target.value);
                          setApiSaveError(null);
                        }}
                        className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-[11px] text-white placeholder-zinc-600 focus:outline-none"
                        style={{ backgroundColor: '#161618' }}
                        placeholder="Pro/zai-org/GLM-4.7"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddModelToSelectedAccount(manualModelId)}
                        disabled={isSavingModelProfile || !manualModelId.trim() || modelExistsUnderSelectedAccount(manualModelId)}
                        className="shrink-0 rounded-md px-2 py-1.5 text-[10px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                        style={{ backgroundColor: '#1e1e20' }}
                      >
                        {modelExistsUnderSelectedAccount(manualModelId) ? aiProviderUi.alreadyAdded : aiProviderUi.addModel}
                      </button>
                    </div>
                  </div>

                  {modelListResult?.success && (
                    <div className="rounded-lg px-2.5 py-2 mb-2.5" style={{ backgroundColor: '#0d0d0f' }}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-medium" style={{ color: '#8e8e93' }}>
                          {aiProviderUi.fetchedModels}
                        </span>
                        <span className="text-[10px]" style={{ color: '#636366' }}>
                          {visibleModelOptions.length} / {modelMatchCount}
                        </span>
                      </div>
                      {(modelListResult.models?.length ?? 0) > 0 ? (
                        <>
                          <input
                            type="text"
                            value={modelSearchQuery}
                            onChange={(event) => setModelSearchQuery(event.target.value)}
                            className="mb-1.5 w-full rounded-md px-2 py-1.5 text-[11px] text-white placeholder-zinc-600 focus:outline-none"
                            style={{ backgroundColor: '#161618' }}
                            placeholder={aiProviderUi.searchModels}
                          />
                          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                            {visibleModelOptions.map((model) => {
                              const alreadyAdded = modelExistsUnderSelectedAccount(model);
                              return (
                                <div
                                  key={model}
                                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
                                  style={{ backgroundColor: '#161618' }}
                                >
                                  <span className="min-w-0 flex-1 break-all text-[10px]" style={{ color: '#c7c7cc' }}>{model}</span>
                                  <button
                                    type="button"
                                    onClick={() => void handleAddModelToSelectedAccount(model)}
                                    disabled={alreadyAdded || isSavingModelProfile}
                                    className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                                    style={{ backgroundColor: alreadyAdded ? '#2a2a2d' : '#0071e3' }}
                                  >
                                    {alreadyAdded ? aiProviderUi.alreadyAdded : aiProviderUi.add}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="text-[10px]" style={{ color: '#8e8e93' }}>{aiProviderUi.noModelsReturned}</div>
                      )}
                    </div>
                  )}
                  <div className="mb-2.5">
                    <div className="text-[10px] font-medium mb-1.5" style={{ color: '#8e8e93' }}>
                      {aiProviderUi.modelsUnderProvider}
                    </div>
                    <div className="space-y-1.5">
                      {selectedProviderAccountModels.length === 0 && (
                        <div className="rounded-lg px-2.5 py-2 text-[10px]" style={{ backgroundColor: '#0d0d0f', color: '#8e8e93' }}>
                          {aiProviderUi.noModelProfiles}
                        </div>
                      )}
                      {selectedProviderAccountModels.map((modelProfile) => (
                        <div key={modelProfile.modelProfileId} className="rounded-lg px-2.5 py-2" style={{ backgroundColor: '#0d0d0f' }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-[11px] font-medium text-white">{modelProfile.label || modelProfile.model}</span>
                            {modelProfile.isDefault && <span className="shrink-0 text-[10px]" style={{ color: '#64d2ff' }}>{aiProviderUi.defaultBadge}</span>}
                          </div>
                          <div className="mt-1 break-all text-[10px]" style={{ color: '#c7c7cc' }}>{modelProfile.model}</div>
                          <div className="mt-2 flex items-center gap-1.5">
                            {!modelProfile.isDefault && (
                              <button
                                type="button"
                                onClick={() => void handleSetDefaultModelProfile(modelProfile.modelProfileId)}
                                disabled={isSettingDefaultModelProfile === modelProfile.modelProfileId}
                                className="rounded-md px-2 py-1 text-[10px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                                style={{ backgroundColor: '#1e1e20' }}
                              >
                                {isSettingDefaultModelProfile === modelProfile.modelProfileId ? aiProviderUi.settingDefault : aiProviderUi.setDefault}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDeleteModelProfile(modelProfile.modelProfileId)}
                              disabled={isDeletingModelProfile === modelProfile.modelProfileId}
                              className="rounded-md px-2 py-1 text-[10px] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
                              style={{ backgroundColor: 'rgba(255,69,58,0.12)', color: '#ff6b6b' }}
                            >
                              {isDeletingModelProfile === modelProfile.modelProfileId ? aiProviderUi.deleting : aiProviderUi.deleteModel}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleTestProviderAccountModel(selectedProviderAccount, selectedProviderAccountDefaultModel)}
                    disabled={isTestingConnection || !selectedProviderAccountDefaultModel?.model.trim()}
                    className="w-full rounded-lg py-1.5 text-[11px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                    style={{ backgroundColor: '#2a2a2d' }}
                  >
                    {isTestingConnection ? aiProviderUi.testing : aiProviderUi.testSelectedModel}
                  </button>

                  {(connectionTestResult || modelListResult) && (
                    <div className="mt-2 rounded-lg px-2.5 py-2 text-[10px] leading-relaxed" style={{ backgroundColor: '#0d0d0f', color: '#c7c7cc' }}>
                      {connectionTestResult && (
                        <div style={{ color: connectionTestResult.success ? '#30d158' : '#ff6b6b' }}>
                          {connectionTestResult.success ? aiProviderUi.connectionOk : aiProviderUi.connectionFailed}
                          {connectionTestResult.status !== undefined ? ` · HTTP ${connectionTestResult.status}` : ''}
                        </div>
                      )}
                      {modelListResult && (
                        <div style={{ color: modelListResult.success ? '#30d158' : '#ff6b6b' }}>
                          {modelListResult.success
                            ? `${aiProviderUi.modelsFetched}${modelListResult.models?.length ? ` · ${modelListResult.models.length}` : ''}`
                            : aiProviderUi.fetchModelsFailed}
                          {modelListResult.status !== undefined ? ` · HTTP ${modelListResult.status}` : ''}
                        </div>
                      )}
                      {(connectionTestResult?.endpointHost || modelListResult?.endpointHost) && (
                        <div style={{ color: '#8e8e93' }}>
                          {connectionTestResult?.endpointHost || modelListResult?.endpointHost}
                          {' '}
                          {connectionTestResult?.endpointPath || modelListResult?.endpointPath || ''}
                        </div>
                      )}
                      {(connectionTestResult || modelListResult) && (
                        <div style={{ color: '#8e8e93' }}>
                          {connectionTestResult
                            ? getLocalizedProviderResultMessage(connectionTestResult, aiProviderUi, Boolean(selectedProviderAccount.isLocal || selectedProviderAccountPreset.isLocal))
                            : modelListResult
                              ? getLocalizedProviderResultMessage(modelListResult, aiProviderUi, Boolean(selectedProviderAccount.isLocal || selectedProviderAccountPreset.isLocal))
                              : ''}
                        </div>
                      )}
                      {(connectionTestResult?.errorSummary || modelListResult?.errorSummary) && (
                        <div style={{ color: '#ff9f0a' }}>{connectionTestResult?.errorSummary || modelListResult?.errorSummary}</div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg px-2.5 py-2 text-[11px]" style={{ backgroundColor: '#0d0d0f', color: '#8e8e93' }}>
                  {aiProviderUi.selectProviderAccount}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: NavId; label: string; group: 'personal' | 'app' | 'system'; icon: React.ReactNode }> = [
    { id: 'accounts', label: ui.nav.accounts, group: 'personal', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'backup', label: ui.backupNav, group: 'personal', icon: <Download className="w-3.5 h-3.5" /> },
    { id: 'writing', label: ui.nav.writing, group: 'app', icon: <Mail className="w-3.5 h-3.5" /> },
    { id: 'ai', label: ui.nav.ai, group: 'app', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'aiProvider', label: modelsApiLabel, group: 'app', icon: <Key className="w-3.5 h-3.5" /> },
    { id: 'about', label: ui.nav.about, group: 'system', icon: <Info className="w-3.5 h-3.5" /> },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} width="w-[800px]" height="h-[600px]" closeOnBackdrop={false}>
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0">
        <span className="text-sm font-semibold text-white tracking-tight" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
          {t('settingsTitle')}
        </span>
        <button onClick={onClose} className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/8 transition-all cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        <nav
          className="w-56 min-h-0 flex-shrink-0 overflow-y-auto border-r border-zinc-800/80 px-2 py-3"
          style={{ backgroundColor: '#1F2124', height: '100%' }}
        >
          {(['personal', 'app', 'system'] as const).map((group) => (
            <div key={group} className="mt-3 first:mt-0">
              <div
                className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: '#3a3a3c', fontFamily: '-apple-system, BlinkMacSystemFont, \"SF Pro Display\", \"SF Pro Text\"' }}
              >
                {ui.groups[group]}
              </div>
              {navItems.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className="flex h-9 w-full items-center gap-2.5 px-3 text-[12px] transition-all cursor-pointer"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                    color: activeNav === item.id ? '#f5f5f7' : '#636366',
                    backgroundColor: activeNav === item.id ? '#1c1c1e' : 'transparent',
                    borderRadius: 6,
                    margin: '2px 0',
                  }}
                  onMouseEnter={(e) => { if (activeNav !== item.id) e.currentTarget.style.backgroundColor = '#18181a'; }}
                  onMouseLeave={(e) => { if (activeNav !== item.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <span style={{ color: activeNav === item.id ? '#0071e3' : '#48484a' }}>{item.icon}</span>
                  <span className="flex-1 text-left leading-none">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ backgroundColor: '#0d0d0f', height: '100%' }} id="settings-scroll">
          {activeNav === 'accounts' && (
            <div className="px-6 py-5">
              <div className="mx-auto w-full max-w-[560px]">
              <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-3 h-3" style={{ color: '#0071e3' }} />
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                    {ui.systemLanguage}
                  </span>
                </div>
                <select
                  value={appLanguage}
                  onChange={(e) => onAppLanguageChange(e.target.value as AppLanguage)}
                  className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                  style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                >
                  {Object.entries(ui.appLanguages).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-3 h-3" style={{ color: '#ff9f0a' }} />
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                    {ui.autoFetchInterval}
                  </span>
                </div>
                <select
                  value={String(autoFetchInterval)}
                  onChange={(e) => onAutoFetchIntervalChange(Number(e.target.value))}
                  className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                  style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                >
                  {autoFetchOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-[10px] mt-2" style={{ color: '#636366' }}>{ui.autoFetchHint}</p>
              </div>

              <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-3 h-3" style={{ color: '#64d2ff' }} />
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                    {ui.mailHistoryRange}
                  </span>
                </div>
                <select
                  value={mailHistoryRange}
                  onChange={(e) => onMailHistoryRangeChange(e.target.value as MailHistoryRange)}
                  className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                  style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                >
                  {historyRangeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="w-3 h-3" style={{ color: '#64d2ff' }} />
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                    {ui.mailCacheRange}
                  </span>
                </div>
                <select
                  value={mailCacheRange}
                  onChange={(e) => onMailCacheRangeChange(e.target.value as MailCacheRange)}
                  className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                  style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                >
                  {cacheRangeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-[10px] mt-2" style={{ color: '#636366' }}>{ui.mailCacheHint}</p>
              </div>

              <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                      {ui.githubNotificationsView}
                    </div>
                    <p className="text-[10px] mt-1 leading-4" style={{ color: '#636366' }}>
                      {ui.githubNotificationsHint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGithubNotificationsViewEnabledChange(!githubNotificationsViewEnabled)}
                    className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors cursor-pointer"
                    style={{ backgroundColor: githubNotificationsViewEnabled ? '#0071e3' : '#2c2c2e' }}
                    aria-pressed={githubNotificationsViewEnabled}
                  >
                    <span
                      className="absolute top-[2px] h-5 w-5 rounded-full bg-white transition-transform"
                      style={{ transform: githubNotificationsViewEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <p className="text-[13px] font-semibold text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"', letterSpacing: '-0.01em' }}>
                  {ui.connectedAccounts}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: '#48484a' }}>{accounts.length}</p>
              </div>

              <div className="space-y-1 mb-3">
                {accounts.length === 0 && (
                  <div
                    className="px-3 py-3 rounded-lg text-[12px] leading-relaxed"
                    style={{ backgroundColor: '#161618', color: '#8e8e93' }}
                  >
                    No account connected / 请添加邮箱账号
                  </div>
                )}
                {accounts.map((account) => {
                  const signatureDraft = signatureDrafts[String(account.id)] || { enabled: false, text: '' };
                  const isSavingSignature = savingSignatureAccountId === account.id;
                  const signatureStatus = signatureSaveStatus?.accountId === account.id ? signatureSaveStatus : null;
                  return (
                    <div
                      key={account.id}
                      className="rounded-lg transition-colors group"
                      style={{ backgroundColor: '#161618' }}
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        {account.avatar ? (
                          <img src={account.avatar} alt={account.name} className="w-8 h-8 rounded-full flex-shrink-0" />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-[11px] flex-shrink-0"
                            style={{ backgroundColor: getAvatarColor(account.name) }}
                          >
                            {account.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-white truncate" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>{account.name}</p>
                          <p className="text-[11px] truncate" style={{ color: '#48484a' }}>{account.email}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {account.id === currentAccountId && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded-md" style={{ backgroundColor: 'rgba(0,113,227,0.15)', color: '#0071e3' }}>
                              {ui.current}
                            </span>
                          )}
                          <button onClick={() => onDeleteAccount(account.id)} className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 transition-colors cursor-pointer">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="mx-3 mb-3 rounded-lg px-3 py-3" style={{ backgroundColor: '#0d0d0f', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-white">{ui.signatureTitle}</div>
                            <div className="mt-1 text-[10px] leading-relaxed" style={{ color: '#636366' }}>{ui.signatureHint}</div>
                          </div>
                          <label className="flex shrink-0 items-center gap-1.5 text-[10px] cursor-pointer" style={{ color: '#c7c7cc' }}>
                            <input
                              type="checkbox"
                              checked={signatureDraft.enabled}
                              onChange={(event) => {
                                setSignatureDrafts((current) => ({
                                  ...current,
                                  [String(account.id)]: {
                                    ...signatureDraft,
                                    enabled: event.target.checked,
                                  },
                                }));
                                setSignatureSaveStatus(null);
                              }}
                            />
                            {ui.signatureEnabled}
                          </label>
                        </div>
                        <textarea
                          value={signatureDraft.text}
                          onChange={(event) => {
                            setSignatureDrafts((current) => ({
                              ...current,
                              [String(account.id)]: {
                                ...signatureDraft,
                                text: event.target.value,
                              },
                            }));
                            setSignatureSaveStatus(null);
                          }}
                          rows={3}
                          className="w-full resize-y rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                          style={{ backgroundColor: '#161618' }}
                          placeholder={ui.signaturePlaceholder}
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="text-[10px]" style={{ color: signatureStatus?.success === false ? '#ff6b6b' : '#30d158' }}>
                            {signatureStatus ? (signatureStatus.success ? ui.signatureSaved : ui.signatureSaveFailed) : ''}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleSaveComposeSignature(account.id)}
                            disabled={isSavingSignature}
                            className="rounded-md px-2.5 py-1.5 text-[10px] font-medium text-white cursor-pointer disabled:opacity-50"
                            style={{ backgroundColor: '#1e1e20' }}
                          >
                            {isSavingSignature ? ui.signatureSaving : ui.signatureSave}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={onAddAccount}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium text-white transition-colors cursor-pointer"
                style={{ backgroundColor: '#0071e3', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0077ed'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0071e3'; }}
              >
                <Plus className="w-3 h-3" />
                {t('addAccount')}
              </button>
              </div>
            </div>
          )}
          {activeNav === 'writing' && (
            <div className="px-6 py-5">
              <div className="mx-auto w-full max-w-[560px]">
                <div className="mb-3 rounded-lg px-3 py-3" style={{ backgroundColor: '#161618', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-white">{ui.quickPhraseTitle}</div>
                      <div className="mt-1 text-[10px] leading-relaxed" style={{ color: '#636366' }}>{ui.quickPhraseHint}</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddQuickPhraseDraft}
                      className="shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-medium text-white cursor-pointer"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      {ui.quickPhraseAdd}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {quickPhraseDrafts.map((phrase) => (
                      <div key={phrase.id} className="rounded-lg p-2.5" style={{ backgroundColor: '#0d0d0f' }}>
                        <div className="grid gap-2 md:grid-cols-2">
                          <label className="min-w-0 text-[10px]" style={{ color: '#8e8e93' }}>
                            {ui.quickPhraseTitleLabel}
                            <input
                              value={phrase.title}
                              onChange={(event) => {
                                setQuickPhraseDrafts((current) => current.map((item) =>
                                  item.id === phrase.id ? { ...item, title: event.target.value } : item
                                ));
                                setQuickPhraseSaveStatus(null);
                              }}
                              placeholder={ui.quickPhraseTitlePlaceholder}
                              className="mt-1 w-full rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                              style={{ backgroundColor: '#161618' }}
                            />
                          </label>
                          <label className="min-w-0 text-[10px]" style={{ color: '#8e8e93' }}>
                            {ui.quickPhraseTagsLabel}
                            <input
                              value={phrase.tags}
                              onChange={(event) => {
                                setQuickPhraseDrafts((current) => current.map((item) =>
                                  item.id === phrase.id ? { ...item, tags: event.target.value } : item
                                ));
                                setQuickPhraseSaveStatus(null);
                              }}
                              placeholder={ui.quickPhraseTagsPlaceholder}
                              className="mt-1 w-full rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                              style={{ backgroundColor: '#161618' }}
                            />
                          </label>
                        </div>
                        <label className="mt-2 block text-[10px]" style={{ color: '#8e8e93' }}>
                          {ui.quickPhraseTextLabel}
                          <textarea
                            value={phrase.text}
                            onChange={(event) => {
                              setQuickPhraseDrafts((current) => current.map((item) =>
                                item.id === phrase.id ? { ...item, text: event.target.value } : item
                              ));
                              setQuickPhraseSaveStatus(null);
                            }}
                            rows={3}
                            placeholder={ui.quickPhraseTextPlaceholder}
                            className="mt-1 w-full resize-y rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                            style={{ backgroundColor: '#161618' }}
                          />
                        </label>
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleDeleteQuickPhraseDraft(phrase.id)}
                            className="rounded-md px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:text-red-300 cursor-pointer"
                          >
                            {ui.quickPhraseDelete}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-[10px]" style={{ color: quickPhraseSaveStatus === 'error' ? '#ff6b6b' : '#30d158' }}>
                      {quickPhraseSaveStatus === 'success'
                        ? ui.quickPhraseSaved
                        : quickPhraseSaveStatus === 'error'
                          ? ui.quickPhraseSaveFailed
                          : ''}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveQuickPhrases()}
                      disabled={savingQuickPhrases}
                      className="rounded-md px-2.5 py-1.5 text-[10px] font-medium text-white cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      {savingQuickPhrases ? ui.quickPhraseSaving : ui.quickPhraseSave}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeNav === 'backup' && (
            <div className="px-6 py-5">
              <div className="mx-auto w-full max-w-[560px]">
                <div className="mb-4">
                  <p className="text-[13px] font-semibold text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"', letterSpacing: '-0.01em' }}>
                    {ui.backupTitle}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#48484a' }}>{ui.backupDescription}</p>
                </div>

                <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-medium text-white mb-2">{ui.backupAccount}</div>
                      <select
                        value={backupState.selectedAccountId ?? ''}
                        onChange={(e) => onBackupAccountChange(Number(e.target.value))}
                        className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                        style={{ backgroundColor: '#0d0d0f' }}
                      >
                        <option value="" disabled>{ui.backupAccount}</option>
                        {backupAccounts.map((account) => (
                          <option key={account.id} value={account.id}>{account.name} ({account.email})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-[11px] font-medium text-white mb-2">{ui.backupScope}</div>
                      <div className="flex gap-1.5">
                        {([
                          { value: 'folders' as const, label: ui.backupScopeFolders },
                          { value: 'account' as const, label: ui.backupScopeAccount },
                        ]).map((option) => (
                          <button
                            key={option.value}
                            onClick={() => onBackupScopeChange(option.value)}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                            style={{
                              backgroundColor: backupState.exportScope === option.value ? '#1e1e20' : '#0d0d0f',
                              color: backupState.exportScope === option.value ? '#f5f5f7' : '#636366',
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                  <div className="text-[11px] font-medium text-white mb-2">{ui.backupFolders}</div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {backupFolders.map((folder) => {
                      const checked = backupState.selectedFolderPaths.includes(folder.path);
                      return (
                        <label key={folder.path} className="flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer" style={{ backgroundColor: '#0d0d0f' }}>
                          <input
                            type="checkbox"
                            checked={backupState.exportScope === 'account' ? true : checked}
                            disabled={backupState.exportScope === 'account'}
                            onChange={() => onBackupFolderToggle(folder.path)}
                          />
                          <span className="text-[11px] text-white">{folder.name || folder.path}</span>
                          <span className="text-[10px] ml-auto" style={{ color: '#636366' }}>{folder.path}</span>
                        </label>
                      );
                    })}
                    {backupFolders.length === 0 && (
                      <div className="text-[11px]" style={{ color: '#636366' }}>{ui.backupNoFolders}</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                  <div className="text-[11px] font-medium text-white mb-2">{ui.backupFilters}</div>
                  <div className="grid grid-cols-3 gap-3">
                    <select
                      value={backupState.readState}
                      onChange={(e) => onBackupReadStateChange(e.target.value as MailBackupReadState)}
                      className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                      style={{ backgroundColor: '#0d0d0f' }}
                    >
                      {backupReadOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={backupState.startDate}
                      onChange={(e) => onBackupStartDateChange(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                      style={{ backgroundColor: '#0d0d0f' }}
                      aria-label={ui.backupStart}
                    />
                    <input
                      type="date"
                      value={backupState.endDate}
                      onChange={(e) => onBackupEndDateChange(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                      style={{ backgroundColor: '#0d0d0f' }}
                      aria-label={ui.backupEnd}
                    />
                  </div>
                </div>

                <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                  <div className="text-[11px] font-medium text-white mb-2">{ui.backupDestination}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg px-2.5 py-2 text-[11px]" style={{ backgroundColor: '#0d0d0f', color: backupState.destinationPath ? '#f5f5f7' : '#636366' }}>
                      {backupState.destinationPath || ui.backupPick}
                    </div>
                    <button
                      onClick={onBackupPickDestination}
                      className="px-3 py-2 rounded-lg text-[11px] font-medium text-white cursor-pointer"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      <FolderOpen className="w-3 h-3 inline-block mr-1.5" />
                      {ui.backupPick}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl px-3 py-3 mb-4" style={{ backgroundColor: '#161618' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-medium text-white">{ui.backupExportTitle}</div>
                    {backupState.isRunning && (
                      <div className="text-[10px]" style={{ color: '#64d2ff' }}>
                        {backupState.progress.processed}/{backupState.progress.total}
                      </div>
                    )}
                  </div>
                  <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: '#0d0d0f' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${backupProgressPercent}%`, backgroundColor: '#0071e3' }}
                    />
                  </div>
                  <p className="text-[10px] mb-3" style={{ color: '#636366' }}>
                    {backupState.isRunning
                      ? formatBackupProgress(backupState.progress, normalizedLanguage)
                      : backupSummary || ui.backupDescription}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={onStartBackupExport}
                      disabled={backupState.isRunning || !canStartBackupExport(backupState)}
                      className="flex-1 py-2 rounded-lg text-[11px] font-medium text-white cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: '#0071e3' }}
                    >
                      {ui.backupStartExport}
                    </button>
                    <button
                      onClick={onCancelBackupExport}
                      disabled={!backupState.isRunning}
                      className="px-3 py-2 rounded-lg text-[11px] font-medium text-white cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      <Ban className="w-3 h-3 inline-block mr-1.5" />
                      {ui.backupCancel}
                    </button>
                    <button
                      onClick={onOpenBackupFolder}
                      disabled={!backupState.lastResult?.outputPath && !backupState.destinationPath}
                      className="px-3 py-2 rounded-lg text-[11px] font-medium text-white cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      <FolderOpen className="w-3 h-3 inline-block mr-1.5" />
                      {ui.backupOpenFolder}
                    </button>
                  </div>
                  {backupSummary && (
                    <p className="text-[11px] mt-3" style={{ color: backupState.lastResult?.success ? '#30d158' : '#ff9f0a' }}>
                      {backupSummary}
                    </p>
                  )}
                </div>

                <div className="rounded-xl px-3 py-3" style={{ backgroundColor: '#161618' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-3 h-3" style={{ color: '#636366' }} />
                    <span className="text-[11px] font-medium text-white">{ui.backupImportTitle}</span>
                  </div>
                  <p className="text-[11px] mb-3" style={{ color: '#636366' }}>{ui.backupImportPlaceholder}</p>
                  <div className="rounded-xl px-3 py-3 mb-3" style={{ backgroundColor: '#0d0d0f' }}>
                    <div className="text-[11px] font-medium text-white mb-2">{ui.backupImportSources}</div>
                    <div className="text-[11px] whitespace-pre-wrap break-all mb-2" style={{ color: backupState.importSourcePaths.length > 0 ? '#f5f5f7' : '#636366' }}>
                      {backupState.importSourcePaths.length > 0
                        ? backupState.importSourcePaths.join('\n')
                        : ui.backupImportPick}
                    </div>
                    <button
                      onClick={onBackupPickImportSources}
                      disabled={backupState.isRunning}
                      className="px-3 py-2 rounded-lg text-[11px] font-medium text-white cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      <Upload className="w-3 h-3 inline-block mr-1.5" />
                      {ui.backupImportPick}
                    </button>
                  </div>
                  <div className="rounded-xl px-3 py-3 mb-3" style={{ backgroundColor: '#0d0d0f' }}>
                    <div className="text-[11px] font-medium text-white mb-2">{ui.backupImportTargetFolder}</div>
                    <select
                      value={backupState.importTargetFolderPath}
                      onChange={(e) => onBackupImportTargetFolderChange(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                      style={{ backgroundColor: '#161618' }}
                    >
                      <option value="">{ui.backupNoFolders}</option>
                      {backupFolders.map((folder) => (
                        <option key={folder.path} value={folder.path}>{folder.name || folder.path}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={onStartBackupImport}
                      disabled={!canStartBackupImport(backupState)}
                      className="flex-1 py-2 rounded-lg text-[11px] font-medium text-white cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: '#30d158' }}
                    >
                      {ui.backupStartImport}
                    </button>
                    <button
                      onClick={onCancelBackupExport}
                      disabled={!backupState.isRunning}
                      className="px-3 py-2 rounded-lg text-[11px] font-medium text-white cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      <Ban className="w-3 h-3 inline-block mr-1.5" />
                      {ui.backupCancel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeNav === 'aiProvider' && renderAIProviderPage()}
          {activeNav === 'ai' && (
            <div className="px-6 py-5">
              <div className="mx-auto w-full max-w-[560px]">
              <div className="mb-4">
                <p className="text-[13px] font-semibold text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"', letterSpacing: '-0.01em' }}>
                  {ui.aiTitle}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: '#48484a' }}>{ui.aiDescription}</p>
              </div>

              {false && (
              <div className="rounded-xl px-3 py-3 mb-3" style={{ backgroundColor: '#161618' }}>
                <div className="flex items-center gap-2 mb-2.5">
                  <Key className="w-3 h-3" style={{ color: '#ff9f0a' }} />
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                    {ui.apiConfig}
                  </span>
                  <span className="text-[10px] ml-auto" style={{ color: '#48484a' }}>OpenAI Compatible</span>
                </div>
                <p className="mb-2 text-[10px] leading-relaxed" style={{ color: '#8e8e93' }}>
                  Most providers only require selecting a preset, entering an API key, and choosing a model. Custom endpoints are also supported.
                </p>
                <div className="mb-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium" style={{ color: '#8e8e93' }}>Provider profiles</span>
                    <button
                      type="button"
                      onClick={handleAddProviderProfile}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-white cursor-pointer"
                      style={{ backgroundColor: '#1e1e20' }}
                    >
                      <Plus className="w-3 h-3" />
                      Add provider
                    </button>
                  </div>
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                    {apiProfileList.map((profile) => {
                      const profileId = profile.id;
                      const preset = getOpenAICompatiblePresetById(profile.providerPresetId);
                      const isSelected = selectedApiProfile === profileId;
                      const isActive = activeApiProfile === profileId;
                      const canDelete = !profile.isDraft && !isLegacyAIProviderProfile(profileId) && apiProfileList.length > 1;
                      const readiness = getProviderReadiness(profile, providerDiagnostics[profileId]);
                      return (
                        <div
                          key={profileId}
                          onClick={() => setSelectedApiProfile(profileId)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedApiProfile(profileId);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className="w-full rounded-lg px-2.5 py-2 text-left text-[11px] cursor-pointer"
                          style={{
                            backgroundColor: isSelected ? 'rgba(0,113,227,0.18)' : '#0d0d0f',
                            border: `1px solid ${isSelected ? 'rgba(0,113,227,0.58)' : 'rgba(255,255,255,0.06)'}`,
                            color: '#f5f5f7',
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{profile.label || preset.label}</span>
                            <span className="flex shrink-0 items-center gap-1">
                              {profile.isDraft && <span style={{ color: '#ff9f0a' }}>Draft</span>}
                              {isActive && <span style={{ color: '#64d2ff' }}>Default</span>}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-[10px]" style={{ color: '#8e8e93' }}>
                            {preset.label} · {profile.model || 'Model'} · {profile.hasApiKey ? apiProfileUi.keySaved : apiProfileUi.keyEmpty}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                            <span style={{ color: readiness.color }}>{readiness.label}</span>
                            <span className="truncate" style={{ color: '#636366' }}>
                              {truncateDiagnostics(readiness.detail, 72)}
                            </span>
                          </div>
                          {isSelected && (
                            <div className="mt-2 flex gap-1.5">
                              {!isActive && !profile.isDraft && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleActivateApiProfile(profileId);
                                  }}
                                  className="rounded-md px-2 py-1 text-[10px]"
                                  style={{ backgroundColor: '#1e1e20', color: '#ffffff' }}
                                >
                                  Set default
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={!canDelete}
                                title={isLegacyAIProviderProfile(profileId) ? 'Legacy compatibility profiles cannot be deleted yet.' : undefined}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (canDelete) {
                                    void handleDeleteProviderProfile(profileId);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px]"
                                style={{
                                  backgroundColor: '#1e1e20',
                                  color: canDelete ? '#ff6b6b' : '#636366',
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {isLegacyAIProviderProfile(selectedApiProfile) && (
                    <div className="text-[10px] leading-relaxed" style={{ color: '#8e8e93' }}>
                      Primary and secondary profiles are kept for legacy compatibility and cannot be deleted yet.
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder="Provider label"
                    value={selectedApiProfileForm.label}
                    onChange={(e) => updateSelectedApiProfile({ label: e.target.value })}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                    style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  />
                  <select
                    value={selectedApiProfileForm.providerPresetId}
                    onChange={(e) => handleProviderPresetChange(e.target.value as OpenAICompatibleProviderPresetId)}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] text-white focus:outline-none"
                    style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  >
                    {OPENAI_COMPATIBLE_PROVIDER_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={selectedApiProfileForm.baseUrl}
                    onChange={(e) => handleBaseUrlChange(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                    style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  />
                  <input
                    type="password"
                    placeholder="API Key"
                    value={selectedApiProfileForm.apiKey}
                    onChange={(e) => updateSelectedApiProfile({ apiKey: e.target.value })}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                    style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  />
                  {selectedApiProfileForm.hasApiKey && !selectedApiProfileForm.apiKey && (
                    <div className="text-[10px] leading-relaxed" style={{ color: '#8e8e93' }}>
                      API key saved. Leave this empty to keep the existing key.
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Model (gpt-4o-mini)"
                    value={selectedApiProfileForm.model}
                    onChange={(e) => updateSelectedApiProfile({ model: e.target.value })}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                    style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  />
                </div>
                <div className="mt-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: '#0d0d0f' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px]" style={{ color: '#8e8e93' }}>Models endpoint</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => modelListResult && void handleCopyDiagnostics(modelListResult)}
                        disabled={!modelListResult}
                        className="px-2 py-1 rounded-md text-[10px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                        style={{ backgroundColor: '#1e1e20' }}
                      >
                        {modelListResult ? 'Copy diagnostics' : 'Run fetch first'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleFetchModels()}
                        disabled={isFetchingModels || !selectedApiProfileForm.baseUrl.trim()}
                        className="px-2 py-1 rounded-md text-[10px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                        style={{ backgroundColor: '#1e1e20' }}
                      >
                        {isFetchingModels ? 'Fetching...' : 'Fetch models'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 break-all text-[10px] leading-relaxed" style={{ color: modelsEndpointPreview ? '#c7c7cc' : '#636366' }}>
                    {modelsEndpointPreview || 'Enter a Base URL to preview the models endpoint.'}
                  </div>
                  {selectedProviderPreset.isLocal && (
                    <div className="mt-1 text-[10px] leading-relaxed" style={{ color: '#8e8e93' }}>
                      Local providers require the local server to be running.
                    </div>
                  )}
                  {modelListResult && (
                    <div className="mt-2 text-[10px] leading-relaxed" style={{ color: modelListResult.success ? '#c7c7cc' : '#ff6b6b' }}>
                      <div style={{ color: modelListResult.success ? '#30d158' : '#ff6b6b' }}>
                        {modelListResult.success ? 'Models fetched' : 'Fetch models failed'}
                      </div>
                      {(modelListResult.endpointHost || modelListResult.endpointPath) && (
                        <div style={{ color: '#8e8e93' }}>
                          {modelListResult.endpointHost || 'unknown-host'} {modelListResult.endpointPath || ''}
                          {modelListResult.status !== undefined ? ` · HTTP ${modelListResult.status}` : ''}
                        </div>
                      )}
                      {modelListResult.model && (
                        <div style={{ color: '#8e8e93' }}>Model: {modelListResult.model}</div>
                      )}
                      {modelListResult.friendlyMessage && (
                        <div style={{ color: modelListResult.success ? '#8e8e93' : '#ff9f0a' }}>
                          {modelListResult.friendlyMessage}
                        </div>
                      )}
                      {modelListResult.success ? (
                        <>
                          <div style={{ color: '#30d158' }}>
                            {modelListResult.models?.length ? `${modelListResult.models.length} models found` : 'No models returned'}
                          </div>
                          {(modelListResult.models?.length ?? 0) > 0 && (
                            <>
                              <input
                                type="search"
                                aria-label="Search models"
                                placeholder="Search models"
                                value={modelSearchQuery}
                                onChange={(e) => setModelSearchQuery(e.target.value)}
                                className="mt-2 w-full py-1.5 px-2.5 rounded-md text-[10px] text-white placeholder:text-zinc-600 focus:outline-none"
                                style={{ backgroundColor: '#161618' }}
                              />
                              <div className="mt-1 text-[10px]" style={{ color: '#8e8e93' }}>
                                Showing {visibleModelOptions.length} of {modelMatchCount} matches
                              </div>
                              <div className="mt-1 max-h-36 overflow-y-auto rounded-md" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                {visibleModelOptions.map((model) => (
                                  <button
                                    key={model}
                                    type="button"
                                    onClick={() => updateSelectedApiProfile({ model })}
                                    className="block w-full px-2 py-1.5 text-left text-[10px] text-white cursor-pointer hover:bg-zinc-800"
                                  >
                                    {model}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <div>{modelListResult.errorSummary || modelListResult.error || 'Failed to fetch models'}</div>
                      )}
                      {diagnosticsCopyStatus && (
                        <div style={{ color: '#8e8e93' }}>{diagnosticsCopyStatus}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: '#0d0d0f' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px]" style={{ color: '#8e8e93' }}>Chat Completions endpoint</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => connectionTestResult && void handleCopyDiagnostics(connectionTestResult)}
                        disabled={!connectionTestResult}
                        className="px-2 py-1 rounded-md text-[10px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                        style={{ backgroundColor: '#1e1e20' }}
                      >
                        {connectionTestResult ? 'Copy diagnostics' : 'Run test first'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTestConnection()}
                        disabled={isTestingConnection || !selectedApiProfileForm.baseUrl.trim() || !selectedApiProfileForm.model.trim()}
                        className="px-2 py-1 rounded-md text-[10px] font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-default"
                        style={{ backgroundColor: '#1e1e20' }}
                      >
                        {isTestingConnection ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 break-all text-[10px] leading-relaxed" style={{ color: chatEndpointPreview ? '#c7c7cc' : '#636366' }}>
                    {chatEndpointPreview || 'Enter a Base URL to preview the final endpoint.'}
                  </div>
                  {connectionTestResult && (
                    <div className="mt-2 text-[10px] leading-relaxed" style={{ color: connectionTestResult.success ? '#30d158' : '#ff6b6b' }}>
                      <div>{connectionTestResult.success ? 'Connection OK' : 'Connection failed'}</div>
                      {(connectionTestResult.endpointHost || connectionTestResult.endpointPath) && (
                        <div style={{ color: '#8e8e93' }}>
                          {connectionTestResult.endpointHost || 'unknown-host'} {connectionTestResult.endpointPath || ''}
                          {connectionTestResult.status !== undefined ? ` · HTTP ${connectionTestResult.status}` : ''}
                        </div>
                      )}
                      {connectionTestResult.model && (
                        <div style={{ color: '#8e8e93' }}>Model: {connectionTestResult.model}</div>
                      )}
                      {connectionTestResult.friendlyMessage && (
                        <div style={{ color: connectionTestResult.success ? '#8e8e93' : '#ff9f0a' }}>
                          {connectionTestResult.friendlyMessage}
                        </div>
                      )}
                      {connectionTestResult.parsedPreview && (
                        <div style={{ color: '#c7c7cc' }}>Preview: {connectionTestResult.parsedPreview}</div>
                      )}
                      {connectionTestResult.error && (
                        <div>{connectionTestResult.errorSummary || connectionTestResult.error}</div>
                      )}
                      {diagnosticsCopyStatus && (
                        <div style={{ color: '#8e8e93' }}>{diagnosticsCopyStatus}</div>
                      )}
                    </div>
                  )}
                </div>
                {selectedProviderPreset.note && (
                  <p className="mt-2 text-[10px] leading-relaxed" style={{ color: '#8e8e93' }}>
                    {selectedProviderPreset.note}
                  </p>
                )}
                {selectedProviderPreset.isLocal && (
                  <p className="mt-1 text-[10px] leading-relaxed" style={{ color: '#8e8e93' }}>
                    Ollama / LM Studio / vLLM require the local server to be running.
                  </p>
                )}
                {activeApiProfile !== selectedApiProfile && !selectedApiProfileForm.isDraft && (
                  <button
                    onClick={() => void handleActivateApiProfile(selectedApiProfile)}
                    className="w-full mt-2 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors cursor-pointer"
                    style={{ backgroundColor: '#2a2a2d', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  >
                    {apiProfileUi.use}
                  </button>
                )}
                <button
                  onClick={handleSaveApi}
                  className="w-full mt-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors cursor-pointer"
                  style={{ backgroundColor: '#0071e3', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0077ed'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0071e3'; }}
                >
                  {ui.save}
                </button>
                {apiSaveError && (
                  <p className="mt-2 text-[10px] leading-relaxed" style={{ color: '#ff6b6b' }}>
                    {apiSaveError}
                  </p>
                )}
              </div>
              )}

              <div className="flex items-center justify-between px-3 py-2.5 mb-3 rounded-xl" style={{ backgroundColor: '#161618' }}>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3" style={{ color: '#bf5af2' }} />
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                    {ui.autoClassify}
                  </span>
                </div>
                <button
                  onClick={() => onAiAutoSortChange(!aiAutoSort)}
                  className="relative rounded-full transition-colors cursor-pointer"
                  style={{ backgroundColor: aiAutoSort ? '#0071e3' : '#2a2a2d', height: '18px', width: '32px' }}
                >
                  <span className="absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-[left]" style={{ left: aiAutoSort ? '14px' : '2px' }} />
                </button>
              </div>

              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <Radar className="w-3 h-3" style={{ color: '#64d2ff' }} />
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                    {ui.scanDepth}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['smart', 'light', 'deep'] as const).map((mode) => {
                    const active = aiScanMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => onAiScanModeChange(mode)}
                        className="flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: active ? 'rgba(0,113,227,0.08)' : '#161618',
                          border: active ? '1px solid rgba(0,113,227,0.35)' : '1px solid transparent',
                          boxShadow: active ? '0 0 0 1px rgba(0,113,227,0.15) inset' : 'none',
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-3 h-3 rounded-full border flex items-center justify-center"
                            style={{
                              borderColor: active ? '#0071e3' : '#38383a',
                              backgroundColor: active ? '#0071e3' : 'transparent',
                            }}
                          >
                            {active && <Check className="w-2 h-2 text-white" />}
                          </div>
                          <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                            {ui.scanMode[mode].label}
                          </span>
                        </div>
                        <span className="text-[10px] pl-4 leading-tight" style={{ color: '#48484a' }}>
                          {ui.scanMode[mode].sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <Clock className="w-3 h-3" style={{ color: '#ff9f0a' }} />
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                    {ui.lookbackRange}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {(['3d', '7d', '1mo', '6mo', 'all'] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => onAiLookbackChange(value)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                      style={{
                        backgroundColor: aiLookback === value ? '#1e1e20' : '#161618',
                        color: aiLookback === value ? '#f5f5f7' : '#48484a',
                      }}
                    >
                      {ui.lookback[value]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl px-3 py-3 mb-3" style={{ backgroundColor: '#161618' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Ban className="w-3 h-3" style={{ color: '#ff9f0a' }} />
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                    {ui.aiPrivacyMode}
                  </span>
                </div>
                <select
                  value={aiPrivacyMode}
                  onChange={(e) => onAiPrivacyModeChange(e.target.value as AiPrivacyMode)}
                  className="w-full py-1.5 px-2.5 rounded-lg text-[12px] text-white focus:outline-none"
                  style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                >
                  {(Object.entries(ui.aiPrivacyOptions) as Array<[AiPrivacyMode, string]>).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <p className="text-[10px] mt-2" style={{ color: '#636366' }}>{ui.aiPrivacyHint}</p>
              </div>

              <button
                onClick={handleSaveAISettings}
                className="w-full py-2 rounded-xl text-[12px] font-medium text-white transition-colors cursor-pointer"
                style={{ backgroundColor: '#0071e3', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
              >
                {ui.saveAiSettings}
              </button>

              {saved && (
                <p className="text-center text-[11px] py-1.5" style={{ color: '#30d158' }}>
                  {t('settingsSaved')}
                </p>
              )}
              </div>
            </div>
          )}

          {activeNav === 'about' && (
            <div className="px-6 py-5">
              <div className="mx-auto w-full max-w-[560px]">
              <div className="mb-4">
                <p className="text-[13px] font-semibold text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"', letterSpacing: '-0.01em' }}>
                  {ui.about}
                </p>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#161618' }}>
                {[
                  { label: ui.appName, value: 'MiniMail' },
                  { label: ui.version, value: '1.0.0' },
                  { label: 'Electron', value: '41.1.1' },
                  { label: ui.buildDate, value: '2026-04' },
                ].map((row, index, rows) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between px-3 py-2"
                    style={{ borderBottom: index < rows.length - 1 ? '1px solid #1c1c1e' : 'none' }}
                  >
                    <span className="text-[11px]" style={{ color: '#636366' }}>{row.label}</span>
                    <span className="text-[11px] text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] mt-4 leading-relaxed" style={{ color: '#3a3a3c' }}>
                {ui.appDescription}
              </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        #settings-scroll::-webkit-scrollbar { width: 3px; }
        #settings-scroll::-webkit-scrollbar-track { background: transparent; }
        #settings-scroll::-webkit-scrollbar-thumb { background: #2a2a2d; border-radius: 2px; }
        #settings-scroll::-webkit-scrollbar-thumb:hover { background: #3a3a3d; }
      `}</style>
    </Modal>
  );
}
