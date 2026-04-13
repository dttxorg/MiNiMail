import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeAppLanguage } from '../utils/aiLanguages';
import { Icons } from './Icons';

interface SidebarProps {
  t: (key: string) => string;
  selectedFolder: string;
  onSelectFolder: (folderId: string) => void;
  onCompose: () => void;
  onSettings: () => void;
  currentAccount: {
    id: number;
    email: string;
    name: string;
    avatar?: string;
  } | 'all';
  accounts: Array<{
    id: number;
    email: string;
    name: string;
    avatar?: string;
  }>;
  onSwitchAccount: (accountId: number) => void;
  onAddAccount: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isAiClassifying?: boolean;
  onAnalysisDone?: () => void;
  folderUnreadCounts?: Record<string, number>;
  unreadConversationCount?: number;
}

const FOLDERS = [
  { id: 'inbox', icon: 'Inbox', labelKey: 'inbox' },
  { id: 'trash', icon: 'Trash', labelKey: 'trash' },
  { id: 'spam', icon: 'Spam', labelKey: 'spam' },
] as const;

const CATEGORY_DEFS = [
  { id: '工作/业务类', iconKey: 'Work', labels: { zh: '工作/业务', en: 'Work / Business', ja: '仕事 / 業務', ko: '업무 / 비즈니스', es: 'Trabajo / Negocio', fr: 'Travail / Activité', de: 'Arbeit / Geschäft', ru: 'Работа / Бизнес' } },
  { id: '账单/财务类', iconKey: 'Finance', labels: { zh: '账单/财务', en: 'Billing / Finance', ja: '請求 / 財務', ko: '청구 / 재무', es: 'Facturas / Finanzas', fr: 'Facturation / Finance', de: 'Abrechnung / Finanzen', ru: 'Счета / Финансы' } },
  { id: '社交/个人类', iconKey: 'Social', labels: { zh: '社交/个人', en: 'Social / Personal', ja: '交流 / 個人', ko: '소셜 / 개인', es: 'Social / Personal', fr: 'Social / Personnel', de: 'Soziales / Privat', ru: 'Личное / Общение' } },
  { id: '广告/营销类', iconKey: 'Ads', labels: { zh: '广告/营销', en: 'Ads / Marketing', ja: '広告 / マーケティング', ko: '광고 / 마케팅', es: 'Anuncios / Marketing', fr: 'Publicité / Marketing', de: 'Werbung / Marketing', ru: 'Реклама / Маркетинг' } },
  { id: '安全/风险类', iconKey: 'Security', labels: { zh: '安全/风险', en: 'Security / Risk', ja: '安全 / リスク', ko: '보안 / 위험', es: 'Seguridad / Riesgo', fr: 'Sécurité / Risque', de: 'Sicherheit / Risiko', ru: 'Безопасность / Риск' } },
  { id: '通知类', iconKey: 'Notification', labels: { zh: '通知', en: 'Notifications', ja: '通知', ko: '알림', es: 'Notificaciones', fr: 'Notifications', de: 'Benachrichtigungen', ru: 'Уведомления' } },
] as const;

function getUi(appLanguage: string) {
  if (appLanguage === 'ja') {
    return {
      primaryView: '会話',
      unread: '未読',
      refresh: '更新',
      minimize: '最小化',
      maximize: '最大化',
      restore: '元に戻す',
      close: '閉じる',
      aiCategories: 'AI 自動分類',
      archive: 'アーカイブ',
      runAnalysis: '今すぐ分析',
      analyzing: '分析中...',
      globalView: '全体ビュー',
      viewAllAccountsMail: 'すべてのアカウントのメールを表示',
    };
  }

  if (appLanguage === 'en') {
    return {
      primaryView: 'Conversations',
      unread: 'Unread',
      refresh: 'Refresh',
      minimize: 'Minimize',
      maximize: 'Maximize',
      restore: 'Restore',
      close: 'Close',
      aiCategories: 'AI Categories',
      archive: 'Archive',
      runAnalysis: 'Run Analysis',
      analyzing: 'Analyzing...',
      globalView: 'Global View',
      viewAllAccountsMail: 'View mail from all accounts',
    };
  }

  if (appLanguage === 'ko') {
    return {
      primaryView: '대화',
      unread: '읽지 않음',
      refresh: '새로고침',
      minimize: '최소화',
      maximize: '최대화',
      restore: '복원',
      close: '닫기',
      aiCategories: 'AI 분류',
      archive: '보관함',
      runAnalysis: '지금 분석',
      analyzing: '분석 중...',
      globalView: '전체 보기',
      viewAllAccountsMail: '모든 계정의 메일 보기',
    };
  }

  if (appLanguage === 'es') {
    return {
      primaryView: 'Conversaciones',
      unread: 'No leídos',
      refresh: 'Actualizar',
      minimize: 'Minimizar',
      maximize: 'Maximizar',
      restore: 'Restaurar',
      close: 'Cerrar',
      aiCategories: 'Categorías IA',
      archive: 'Archivo',
      runAnalysis: 'Analizar ahora',
      analyzing: 'Analizando...',
      globalView: 'Vista global',
      viewAllAccountsMail: 'Ver correos de todas las cuentas',
    };
  }

  if (appLanguage === 'fr') {
    return {
      primaryView: 'Conversations',
      unread: 'Non lus',
      refresh: 'Actualiser',
      minimize: 'Réduire',
      maximize: 'Agrandir',
      restore: 'Restaurer',
      close: 'Fermer',
      aiCategories: 'Catégories IA',
      archive: 'Archives',
      runAnalysis: 'Lancer l’analyse',
      analyzing: 'Analyse en cours...',
      globalView: 'Vue globale',
      viewAllAccountsMail: 'Voir les mails de tous les comptes',
    };
  }

  if (appLanguage === 'de') {
    return {
      primaryView: 'Gespräche',
      unread: 'Ungelesen',
      refresh: 'Aktualisieren',
      minimize: 'Minimieren',
      maximize: 'Maximieren',
      restore: 'Wiederherstellen',
      close: 'Schließen',
      aiCategories: 'KI-Kategorien',
      archive: 'Archiv',
      runAnalysis: 'Jetzt analysieren',
      analyzing: 'Analysiere...',
      globalView: 'Gesamtansicht',
      viewAllAccountsMail: 'Mails aller Konten anzeigen',
    };
  }

  if (appLanguage === 'ru') {
    return {
      primaryView: 'Диалоги',
      unread: 'Непрочитанные',
      refresh: 'Обновить',
      minimize: 'Свернуть',
      maximize: 'Развернуть',
      restore: 'Восстановить',
      close: 'Закрыть',
      aiCategories: 'Категории ИИ',
      archive: 'Архив',
      runAnalysis: 'Запустить анализ',
      analyzing: 'Идёт анализ...',
      globalView: 'Общий вид',
      viewAllAccountsMail: 'Показать почту всех аккаунтов',
    };
  }

  return {
    primaryView: '会话',
    unread: '未读',
    refresh: '刷新',
    minimize: '最小化',
    maximize: '最大化',
    restore: '还原',
    close: '关闭',
    aiCategories: 'AI 智能分类',
    archive: '归档',
    runAnalysis: '立即分析',
    analyzing: '分析中...',
    globalView: '全局视图',
    viewAllAccountsMail: '查看所有账号邮件',
  };
}

function NavIcon({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className="w-8 h-5 flex justify-center items-center flex-shrink-0" style={{ color: active ? '#f5f5f7' : '#a1a1a6' }}>
      {children}
    </span>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 72 72" className="w-11 h-11" aria-hidden="true">
      <path
        d="M16 23.5h40A5.5 5.5 0 0 1 61.5 29v14.2A8.8 8.8 0 0 1 52.7 52H19.3A8.8 8.8 0 0 1 10.5 43.2V29A5.5 5.5 0 0 1 16 23.5Z"
        fill="none"
        stroke="#0d738d"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="M18 27.5L36 40l18-12.5"
        fill="none"
        stroke="#0d738d"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 33.5v-6M50 33.5v-6"
        fill="none"
        stroke="#0d738d"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M26 20.5C29.2 16.6 32.6 14.5 36 14.5s6.8 2.1 10 6"
        fill="none"
        stroke="#0d738d"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M36 21c7.7 0 14 6.3 14 14v5.5c0 7.7-6.3 14-14 14s-14-6.3-14-14V35c0-7.7 6.3-14 14-14Z"
        fill="#0d738d"
        opacity="0.18"
      />
      <path
        d="M36 27.2a6.8 6.8 0 0 0-6.8 6.8v4.1h13.6V34A6.8 6.8 0 0 0 36 27.2Zm0 2.8a4 4 0 0 1 4 4v2.1h-8V34a4 4 0 0 1 4-4Z"
        fill="#0d738d"
      />
      <path
        d="M36 38.4a3.2 3.2 0 0 0-1.4 6.1v4h2.8v-4a3.2 3.2 0 0 0-1.4-6.1Z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function Sidebar({
  t,
  selectedFolder,
  onSelectFolder,
  onCompose,
  onSettings,
  currentAccount,
  accounts,
  onSwitchAccount,
  onAddAccount,
  onRefresh,
  isRefreshing,
  isAiClassifying = false,
  onAnalysisDone,
  folderUnreadCounts = {},
  unreadConversationCount = 0,
}: SidebarProps) {
  const { i18n } = useTranslation();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [isAiCollapsed, setIsAiCollapsed] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const isAllAccounts = currentAccount === 'all';
  const appLanguage = normalizeAppLanguage(i18n.language);
  const ui = useMemo(() => getUi(appLanguage), [appLanguage]);

  useEffect(() => {
    let active = true;
    void window.electronAPI.isMaximized().then((value) => {
      if (active) setIsWindowMaximized(value);
    });
    const unsubscribe = window.electronAPI.onMaximizeChange(setIsWindowMaximized);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="h-full flex flex-col [-webkit-app-region:drag]" style={{ backgroundColor: '#1F2124', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
      <div className="pt-5 pb-3 px-4 flex-shrink-0 flex items-center justify-center">
        <LogoMark />
      </div>

      <div className="flex flex-row justify-center items-center gap-2 py-3 px-4 flex-shrink-0">
        <button onClick={onCompose} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer [-webkit-app-region:no-drag]" title={t('compose')} style={{ color: '#a1a1a6' }}><span className="w-4 h-4 flex">{Icons.Compose}</span></button>
        <button onClick={onRefresh} disabled={isRefreshing} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer disabled:opacity-40 [-webkit-app-region:no-drag]" title={ui.refresh} style={{ color: '#a1a1a6' }}><span className={`w-4 h-4 flex ${isRefreshing ? 'animate-spin' : ''}`}>{isRefreshing ? Icons.LoadingSpinner : Icons.Refresh}</span></button>
        <button onClick={() => window.electronAPI.minimizeWindow()} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer [-webkit-app-region:no-drag]" title={ui.minimize} style={{ color: '#a1a1a6' }}><span className="w-4 h-4 flex">{Icons.MinimizeWindow}</span></button>
        <button onClick={() => window.electronAPI.maximizeWindow()} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer [-webkit-app-region:no-drag]" title={isWindowMaximized ? ui.restore : ui.maximize} style={{ color: '#a1a1a6' }}><span className="w-4 h-4 flex">{isWindowMaximized ? Icons.FullscreenExit : Icons.Fullscreen}</span></button>
        <button onClick={() => window.electronAPI.closeWindow()} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer [-webkit-app-region:no-drag]" title={ui.close} style={{ color: '#a1a1a6' }}><span className="w-4 h-4 flex">{Icons.Close}</span></button>
      </div>

      <nav className="flex-1 px-3 py-1 overflow-y-auto">
        <div className="space-y-0.5">
          {FOLDERS.map((folder) => {
            const selected = selectedFolder === folder.id;
            const Icon = Icons[folder.icon as keyof typeof Icons];
            const unreadCount = folder.id === 'inbox' ? (folderUnreadCounts.inbox || 0) : 0;
            return (
              <button
                key={folder.id}
                onClick={() => onSelectFolder(folder.id)}
                className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]"
                style={{ color: selected ? '#f5f5f7' : '#a1a1a6', backgroundColor: selected ? '#2a2a2d' : 'transparent', fontWeight: 500, borderRadius: 6, padding: '4px 8px 4px 0', fontSize: 12 }}
              >
                <NavIcon active={selected}><span className="w-4 h-4 flex">{Icon}</span></NavIcon>
                <span className="flex-1 text-left leading-none">{folder.id === 'inbox' ? ui.primaryView : t(folder.labelKey)}</span>
                {unreadCount > 0 && <span style={{ fontSize: 10, color: '#71717a', lineHeight: 1 }}>{unreadCount}</span>}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onSelectFolder('unread')}
          className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]"
          style={{
            color: selectedFolder === 'unread' ? '#f5f5f7' : '#a1a1a6',
            backgroundColor: selectedFolder === 'unread' ? '#2a2a2d' : 'transparent',
            fontWeight: 500,
            borderRadius: 6,
            padding: '4px 8px 4px 0',
            fontSize: 12,
          }}
        >
          <NavIcon active={selectedFolder === 'unread'}><span className="w-4 h-4 flex">{Icons.Inbox}</span></NavIcon>
          <span className="flex-1 text-left leading-none">{ui.unread}</span>
          {unreadConversationCount > 0 && <span style={{ fontSize: 10, color: '#71717a', lineHeight: 1 }}>{unreadConversationCount}</span>}
        </button>

        <button
          onClick={() => onSelectFolder('starred')}
          className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]"
          style={{
            color: selectedFolder === 'starred' ? '#f5f5f7' : '#a1a1a6',
            backgroundColor: selectedFolder === 'starred' ? '#2a2a2d' : 'transparent',
            fontWeight: 500,
            borderRadius: 6,
            padding: '4px 8px 4px 0',
            fontSize: 12,
          }}
        >
          <NavIcon active={selectedFolder === 'starred'}><span className="w-4 h-4 flex">{Icons.Starred}</span></NavIcon>
          <span className="flex-1 text-left leading-none">{t('starred')}</span>
        </button>

        <button
          onClick={() => onSelectFolder('archive')}
          className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]"
          style={{
            color: selectedFolder === 'archive' ? '#f5f5f7' : '#a1a1a6',
            backgroundColor: selectedFolder === 'archive' ? '#2a2a2d' : 'transparent',
            fontWeight: 500,
            borderRadius: 6,
            padding: '4px 8px 4px 0',
            fontSize: 12,
          }}
        >
          <NavIcon active={selectedFolder === 'archive'}><span className="w-4 h-4 flex">{Icons.Archive}</span></NavIcon>
          <span className="flex-1 text-left leading-none">{ui.archive}</span>
        </button>

        <button
          onClick={() => setIsAiCollapsed((prev) => !prev)}
          className="w-full flex items-center cursor-pointer [-webkit-app-region:no-drag]"
          style={{ color: '#a1a1a6', backgroundColor: 'transparent', fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '4px 8px 4px 0' }}
        >
          <NavIcon><span className="w-4 h-4 flex">{Icons.AutoClassify}</span></NavIcon>
          <span className="flex-1 text-left leading-none">{ui.aiCategories}</span>
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 transition-transform duration-200" style={{ color: '#71717a', transform: isAiCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
            {Icons.ChevronRight}
          </span>
        </button>

        {!isAiCollapsed && (
          <div className="space-y-0.5">
            {CATEGORY_DEFS.map((category) => {
              const selected = selectedFolder === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => onSelectFolder(category.id)}
                  className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]"
                  style={{ color: selected ? '#f5f5f7' : '#a1a1a6', backgroundColor: selected ? '#2a2a2d' : 'transparent', fontWeight: 500, borderRadius: 6, padding: '4px 8px 4px 0', fontSize: 12 }}
                >
                  <NavIcon active={selected}><span className="w-4 h-4 flex">{Icons[category.iconKey as keyof typeof Icons]}</span></NavIcon>
                  <span className="flex-1 text-left leading-none">{category.labels[appLanguage as keyof typeof category.labels] || category.labels.en}</span>
                </button>
              );
            })}

            {onAnalysisDone && (
              <button
                onClick={onAnalysisDone}
                disabled={isAiClassifying}
                className="w-full flex items-center cursor-pointer disabled:opacity-40 [-webkit-app-region:no-drag]"
                style={{ color: '#a1a1a6', backgroundColor: 'transparent', fontWeight: 500, borderRadius: 6, padding: '4px 8px 4px 0', fontSize: 12 }}
              >
                <NavIcon><span className={`w-4 h-4 flex ${isAiClassifying ? 'animate-spin' : ''}`}>{isAiClassifying ? Icons.LoadingSpinner : Icons.AutoClassify}</span></NavIcon>
                <span className="flex-1 text-left leading-none">{isAiClassifying ? ui.analyzing : ui.runAnalysis}</span>
              </button>
            )}
          </div>
        )}

        <button onClick={onSettings} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={{ color: '#a1a1a6', backgroundColor: 'transparent', fontWeight: 500, borderRadius: 6, padding: '4px 8px 4px 0', fontSize: 12 }}>
          <NavIcon><span className="w-4 h-4 flex">{Icons.Settings}</span></NavIcon>
          <span className="flex-1 text-left leading-none">{t('settings')}</span>
        </button>
      </nav>

      <div className="w-full mt-auto" style={{ borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
        <div className="relative w-full">
          <button onClick={() => setShowAccountMenu((prev) => !prev)} className="flex flex-row items-center justify-center gap-2 w-full py-4 cursor-pointer [-webkit-app-region:no-drag]" style={{ color: '#a1a1a6', backgroundColor: 'transparent' }}>
            <span className="w-5 h-5 flex" style={{ color: '#71717a' }}>{Icons.Users}</span>
            <div className="min-w-0 text-left">
              <p className="text-white text-xs font-medium truncate">{isAllAccounts ? t('allAccounts') : (currentAccount && 'name' in currentAccount ? currentAccount.name : '')}</p>
              <p className="text-[#71717a] text-[11px] truncate">{isAllAccounts ? ui.globalView : (currentAccount && 'email' in currentAccount ? currentAccount.email : '')}</p>
            </div>
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0" style={{ color: '#71717a' }}>{Icons.ChevronRight}</span>
          </button>

          {showAccountMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden" style={{ backgroundColor: '#272729', borderRadius: 12, boxShadow: 'rgba(0,0,0,0.4) 0 8px 32px 0px' }}>
              <button onClick={() => { onSwitchAccount(-1); setShowAccountMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 cursor-pointer [-webkit-app-region:no-drag]" style={{ borderBottom: '0.5px solid #38383a' }}>
                <span className="w-5 h-5 flex" style={{ color: '#a1a1a6' }}>{Icons.Users}</span>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-white text-sm">{t('allAccounts')}</p>
                  <p className="text-[#71717a] text-xs">{ui.viewAllAccountsMail}</p>
                </div>
                {isAllAccounts && <span className="w-4 h-4 flex" style={{ color: '#0071e3' }}>{Icons.Check}</span>}
              </button>

              {accounts.map((account) => (
                <button key={account.id} onClick={() => { onSwitchAccount(account.id); setShowAccountMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 cursor-pointer [-webkit-app-region:no-drag]">
                  {account.avatar ? <img src={account.avatar} alt={account.name} className="w-6 h-6 rounded-full flex-shrink-0" /> : <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ backgroundColor: '#0071e3' }}>{account.name.charAt(0)}</div>}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white text-sm truncate">{account.name}</p>
                    <p className="text-[#71717a] text-xs truncate">{account.email}</p>
                  </div>
                  {!isAllAccounts && currentAccount !== 'all' && currentAccount.id === account.id && <span className="w-4 h-4 flex" style={{ color: '#0071e3' }}>{Icons.Check}</span>}
                </button>
              ))}

              <div className="p-2" style={{ borderTop: '0.5px solid #38383a' }}>
                <button onClick={() => { setShowAccountMenu(false); onAddAccount(); }} className="w-full flex items-center justify-center gap-2 py-2 text-white text-sm cursor-pointer [-webkit-app-region:no-drag]" style={{ backgroundColor: '#0071e3', borderRadius: 8 }}>
                  <span className="w-4 h-4 flex">{Icons.Plus}</span>
                  {t('addAccount')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
