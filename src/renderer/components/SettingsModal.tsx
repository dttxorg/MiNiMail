import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  CalendarDays,
  Globe,
  Info,
  Key,
  Plus,
  Radar,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import { normalizeAppLanguage, type AppLanguage } from '../utils/aiLanguages';
import {
  getAutoFetchIntervalOptions,
  getMailHistoryRangeOptions,
} from '../utils/mailHistoryRange';
import type { MailHistoryRange } from '../../shared/mailSyncSettings';

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
  aiScanMode: 'light' | 'deep';
  onAiScanModeChange: (v: 'light' | 'deep') => void;
  aiLookback: '3d' | '7d' | '1mo';
  onAiLookbackChange: (v: '3d' | '7d' | '1mo') => void;
  mailHistoryRange: MailHistoryRange;
  onMailHistoryRangeChange: (v: MailHistoryRange) => void;
  autoFetchInterval: number;
  onAutoFetchIntervalChange: (minutes: number) => void;
}

type NavId = 'accounts' | 'ai' | 'about';

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
        light: { label: '轻量扫描', sub: '标题 + 发件人 / 每批 50 封' },
        deep: { label: '深度扫描', sub: '清洗后正文前 800 字 / 每批 10 封' },
      },
      lookback: { '3d': '3 天', '7d': '7 天', '1mo': '1 个月' },
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
        light: { label: 'Light Scan', sub: 'Subject + sender / 50 emails per batch' },
        deep: { label: 'Deep Scan', sub: 'First 800 chars of cleaned body / 10 emails per batch' },
      },
      lookback: { '3d': '3 days', '7d': '7 days', '1mo': '1 month' },
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
        light: { label: '軽量スキャン', sub: '件名 + 差出人 / 1 バッチ 50 件' },
        deep: { label: '詳細スキャン', sub: '洗浄済み本文の先頭 800 文字 / 1 バッチ 10 件' },
      },
      lookback: { '3d': '3日', '7d': '7日', '1mo': '1か月' },
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
        light: { label: '가벼운 스캔', sub: '제목 + 발신자 / 배치당 50개' },
        deep: { label: '심층 스캔', sub: '정리된 본문 앞 800자 / 배치당 10개' },
      },
      lookback: { '3d': '3일', '7d': '7일', '1mo': '1개월' },
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
        light: { label: 'Escaneo ligero', sub: 'Asunto + remitente / 50 correos por lote' },
        deep: { label: 'Escaneo profundo', sub: 'Primeros 800 caracteres del cuerpo limpio / 10 correos por lote' },
      },
      lookback: { '3d': '3 días', '7d': '7 días', '1mo': '1 mes' },
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
        light: { label: 'Analyse légère', sub: 'Objet + expéditeur / 50 mails par lot' },
        deep: { label: 'Analyse approfondie', sub: '800 premiers caractères du corps nettoyé / 10 mails par lot' },
      },
      lookback: { '3d': '3 jours', '7d': '7 jours', '1mo': '1 mois' },
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
        light: { label: 'Leichter Scan', sub: 'Betreff + Absender / 50 Mails pro Durchgang' },
        deep: { label: 'Tiefer Scan', sub: 'Erste 800 Zeichen des bereinigten Inhalts / 10 Mails pro Durchgang' },
      },
      lookback: { '3d': '3 Tage', '7d': '7 Tage', '1mo': '1 Monat' },
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
        light: { label: 'Лёгкое сканирование', sub: 'Тема + отправитель / 50 писем за пакет' },
        deep: { label: 'Глубокое сканирование', sub: 'Первые 800 символов очищенного текста / 10 писем за пакет' },
      },
      lookback: { '3d': '3 дня', '7d': '7 дней', '1mo': '1 месяц' },
      appLanguages,
    },
  };

  const baseText = (texts as Record<string, typeof texts.en>)[appLanguage] ?? texts.en;

  return {
    ...baseText,
    mailHistoryRange:
      appLanguage === 'zh' ? '邮件历史范围'
      : appLanguage === 'ja' ? 'メール履歴範囲'
      : appLanguage === 'ko' ? '메일 기록 범위'
      : appLanguage === 'es' ? 'Rango del historial de correo'
      : appLanguage === 'fr' ? 'Période de l’historique'
      : appLanguage === 'de' ? 'Mail-Verlaufsbereich'
      : appLanguage === 'ru' ? 'Диапазон истории почты'
      : 'Mail Fetch History Range',
  } as {
    groups: Record<'personal' | 'app' | 'system', string>;
    nav: Record<'accounts' | 'ai' | 'about', string>;
    systemLanguage: string;
    connectedAccounts: string;
    current: string;
    autoFetchInterval: string;
    mailHistoryRange: string;
    autoFetchHint: string;
    aiTitle: string;
    aiDescription: string;
    apiConfig: string;
    aiReplyLanguage: string;
    autoClassify: string;
    scanDepth: string;
    lookbackRange: string;
    save: string;
    saveAiSettings: string;
    about: string;
    appName: string;
    version: string;
    buildDate: string;
    appDescription: string;
    scanMode: Record<'light' | 'deep', { label: string; sub: string }>;
    lookback: Record<'3d' | '7d' | '1mo', string>;
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
  mailHistoryRange,
  onMailHistoryRangeChange,
  autoFetchInterval,
  onAutoFetchIntervalChange,
}: SettingsModalProps) {
  const [activeNav, setActiveNav] = useState<NavId>('accounts');
  const [saved, setSaved] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');

  const normalizedLanguage = normalizeAppLanguage(appLanguage);
  const ui = useMemo(() => getSettingsText(normalizedLanguage), [normalizedLanguage]);
  const historyRangeOptions = useMemo(() => getMailHistoryRangeOptions(normalizedLanguage), [normalizedLanguage]);
  const autoFetchOptions = useMemo(() => getAutoFetchIntervalOptions(normalizedLanguage), [normalizedLanguage]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveNav('accounts');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const cfg = await window.electronAPI.invoke('ai:getConfig') as {
          success: boolean;
          data?: { baseUrl: string; model: string; hasApiKey: boolean };
        };

        if (cfg.success && cfg.data) {
          setApiUrl(cfg.data.baseUrl || '');
          setModel(cfg.data.model || '');
        }
      } catch {
        // Keep current inputs when config fetch fails.
      }
    })();
  }, [isOpen]);

  async function handleSaveApi() {
    try {
      await window.electronAPI.invoke('ai:saveConfig', { baseUrl: apiUrl, apiKey, model });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Keep silent until explicit error UI is added.
    }
  }

  async function handleSaveAISettings() {
    try {
      await window.electronAPI.invoke('ai:saveSettings', {
        autoSort: aiAutoSort,
        scanMode: aiScanMode,
        lookback: aiLookback,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Keep silent until explicit error UI is added.
    }
  }

  const navItems: Array<{ id: NavId; label: string; group: 'personal' | 'app' | 'system'; icon: React.ReactNode }> = [
    { id: 'accounts', label: ui.nav.accounts, group: 'personal', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'ai', label: ui.nav.ai, group: 'app', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'about', label: ui.nav.about, group: 'system', icon: <Info className="w-3.5 h-3.5" /> },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} width="w-[800px]" height="h-[600px]">
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
          className="w-56 flex-shrink-0 overflow-y-scroll border-r border-zinc-800/80 px-2 py-3"
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

        <div className="flex-1 overflow-y-scroll" style={{ backgroundColor: '#0d0d0f', height: '100%' }} id="settings-scroll">
          {activeNav === 'accounts' && (
            <div className="min-h-full px-6 py-5">
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

              <div className="mb-3">
                <p className="text-[13px] font-semibold text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"', letterSpacing: '-0.01em' }}>
                  {ui.connectedAccounts}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: '#48484a' }}>{accounts.length}</p>
              </div>

              <div className="space-y-1 mb-3">
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
                      {accounts.length > 1 && (
                        <button onClick={() => onDeleteAccount(account.id)} className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 transition-colors cursor-pointer">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
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
          {activeNav === 'ai' && (
            <div className="min-h-full px-6 py-5">
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
                  <span className="text-[10px] ml-auto" style={{ color: '#48484a' }}>OpenAI / OpenRouter / Groq</span>
                </div>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                    style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  />
                  <input
                    type="password"
                    placeholder="API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                    style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  />
                  <input
                    type="text"
                    placeholder="Model (gpt-4o-mini)"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] text-white placeholder:text-zinc-600 focus:outline-none"
                    style={{ backgroundColor: '#0d0d0f', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  />
                </div>
                <button
                  onClick={handleSaveApi}
                  className="w-full mt-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors cursor-pointer"
                  style={{ backgroundColor: '#0071e3', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0077ed'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0071e3'; }}
                >
                  {ui.save}
                </button>
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
                <div className="grid grid-cols-2 gap-1.5">
                  {(['light', 'deep'] as const).map((mode) => {
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
                  {(['3d', '7d', '1mo'] as const).map((value) => (
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
            <div className="min-h-full px-6 py-5">
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
