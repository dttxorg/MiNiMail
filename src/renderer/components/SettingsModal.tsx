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

type NavId = 'accounts' | 'backup' | 'ai' | 'about';
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
  status?: number;
  models?: string[];
  error?: string;
};

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

function getApiProfileText(appLanguage: AppLanguage) {
  const texts = {
    zh: { active: '当前使用', use: '设为当前', profileA: '配置 A', profileB: '配置 B', keySaved: '已保存 Key', keyEmpty: '未保存 Key' },
    en: { active: 'Active', use: 'Use this', profileA: 'Profile A', profileB: 'Profile B', keySaved: 'Key saved', keyEmpty: 'No key' },
    ja: { active: '使用中', use: '使用する', profileA: '設定 A', profileB: '設定 B', keySaved: 'キー保存済み', keyEmpty: 'キーなし' },
    ko: { active: '사용 중', use: '사용', profileA: '구성 A', profileB: '구성 B', keySaved: '키 저장됨', keyEmpty: '키 없음' },
    es: { active: 'Activa', use: 'Usar', profileA: 'Perfil A', profileB: 'Perfil B', keySaved: 'Clave guardada', keyEmpty: 'Sin clave' },
    fr: { active: 'Actif', use: 'Utiliser', profileA: 'Profil A', profileB: 'Profil B', keySaved: 'Clé enregistrée', keyEmpty: 'Aucune clé' },
    de: { active: 'Aktiv', use: 'Verwenden', profileA: 'Profil A', profileB: 'Profil B', keySaved: 'Key gespeichert', keyEmpty: 'Kein Key' },
    ru: { active: 'Активно', use: 'Использовать', profileA: 'Профиль A', profileB: 'Профиль B', keySaved: 'Ключ сохранён', keyEmpty: 'Нет ключа' },
  };
  return texts[appLanguage] ?? texts.en;
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
      nav: { accounts: '账号', ai: 'AI 智能', about: '关于' },
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
      nav: { accounts: 'Accounts', ai: 'AI', about: 'About' },
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
      nav: { accounts: 'アカウント', ai: 'AI', about: 'このアプリについて' },
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
      nav: { accounts: '계정', ai: 'AI', about: '정보' },
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
      nav: { accounts: 'Cuentas', ai: 'IA', about: 'Acerca de' },
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
      nav: { accounts: 'Comptes', ai: 'IA', about: 'À propos' },
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
      nav: { accounts: 'Konten', ai: 'KI', about: 'Über' },
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
      nav: { accounts: 'Аккаунты', ai: 'ИИ', about: 'О программе' },
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
    nav: Record<'accounts' | 'ai' | 'about', string>;
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
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<AIProviderConnectionTestResult | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelListResult, setModelListResult] = useState<AIProviderModelListResult | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  const normalizedLanguage = normalizeAppLanguage(appLanguage);
  const ui = useMemo(() => getSettingsText(normalizedLanguage), [normalizedLanguage]);
  const apiProfileUi = useMemo(() => getApiProfileText(normalizedLanguage), [normalizedLanguage]);
  const apiProfileList = useMemo(() => Object.values(apiProfiles), [apiProfiles]);
  const selectedApiProfileForm = apiProfiles[selectedApiProfile] ?? apiProfileList[0] ?? EMPTY_AI_CONFIG_PROFILES.primary;
  const selectedProviderPreset = getOpenAICompatiblePresetById(selectedApiProfileForm.providerPresetId);
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
  }, [selectedApiProfile]);

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
    } catch (error) {
      setModelListResult({
        success: false,
        provider: { id: selectedProviderPreset.id, label: selectedProviderPreset.label },
        error: (error as Error).message,
      });
    } finally {
      setIsFetchingModels(false);
    }
  }

  async function handleTestConnection() {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    setApiSaveError(null);
    try {
      const response = await window.electronAPI.invoke('ai:testConnection', {
        profileId: selectedApiProfile,
        providerId: selectedProviderPreset.id,
        providerLabel: selectedProviderPreset.label,
        baseUrl: selectedApiProfileForm.baseUrl,
        apiKey: selectedApiProfileForm.apiKey.trim() || undefined,
        model: selectedApiProfileForm.model,
      }) as AIProviderConnectionTestResult;
      setConnectionTestResult(response);
    } catch (error) {
      setConnectionTestResult({
        success: false,
        provider: { id: selectedProviderPreset.id, label: selectedProviderPreset.label },
        error: (error as Error).message,
      });
    } finally {
      setIsTestingConnection(false);
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
      setApiSaveError((error as Error).message);
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
      setApiSaveError((error as Error).message);
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
      setApiSaveError((error as Error).message);
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

  const navItems: Array<{ id: NavId; label: string; group: 'personal' | 'app' | 'system'; icon: React.ReactNode }> = [
    { id: 'accounts', label: ui.nav.accounts, group: 'personal', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'backup', label: ui.backupNav, group: 'personal', icon: <Download className="w-3.5 h-3.5" /> },
    { id: 'ai', label: ui.nav.ai, group: 'app', icon: <Sparkles className="w-3.5 h-3.5" /> },
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
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group"
                    style={{ backgroundColor: '#161618' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1e1e20'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#161618'; }}
                  >
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
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
                ))}
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
          {activeNav === 'ai' && (
            <div className="px-6 py-5">
              <div className="mx-auto w-full max-w-[560px]">
              <div className="mb-4">
                <p className="text-[13px] font-semibold text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"', letterSpacing: '-0.01em' }}>
                  {ui.aiTitle}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: '#48484a' }}>{ui.aiDescription}</p>
              </div>

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
                      {(modelListResult.endpointHost || modelListResult.endpointPath) && (
                        <div style={{ color: '#8e8e93' }}>
                          {modelListResult.endpointHost || 'unknown-host'} {modelListResult.endpointPath || ''}
                          {modelListResult.status !== undefined ? ` · HTTP ${modelListResult.status}` : ''}
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
                        <div>{modelListResult.error || 'Failed to fetch models'}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: '#0d0d0f' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px]" style={{ color: '#8e8e93' }}>Chat Completions endpoint</span>
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
                      {connectionTestResult.parsedPreview && (
                        <div style={{ color: '#c7c7cc' }}>Preview: {connectionTestResult.parsedPreview}</div>
                      )}
                      {connectionTestResult.error && (
                        <div>{connectionTestResult.error}</div>
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
