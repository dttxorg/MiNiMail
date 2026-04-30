import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  BellDot,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Circle,
  Inbox,
  Megaphone,
  Mail,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
  UsersRound,
  WalletCards,
  Workflow,
} from 'lucide-react';
import { normalizeAppLanguage, type AppLanguage } from '../utils/aiLanguages';
import { GITHUB_SMART_FOLDER_IDS } from '../utils/mailRoutingAdapter';
import type { GitHubSmartFolder } from '../../shared/email-ai';
import { getGitHubFolderPriorityHint, getGitHubPriorityBadgeInfo } from '../utils/githubPriorityUi';
import type { GenericPriorityFolderId } from '../utils/mailRoutingAdapter';
import { buildIconButtonStyle, buildPanelStyle, buildSidebarItemStyle, uiColor, uiRadius } from '../utils/uiDesignTokens';
import minimailLogo from '../assets/minimail-logo.png';

type SidebarLabelLanguage = AppLanguage;
const USER_VISIBLE_PRIORITY_FOLDER_IDS = ['Priority/Needs Reply'] as const;

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
  } | 'all' | null;
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
  githubNotificationsEnabled?: boolean;
  githubConversationCount?: number;
  githubFolderCounts?: Record<GitHubSmartFolder, number>;
  priorityFolderCounts?: Record<GenericPriorityFolderId, number>;
  appLanguage: AppLanguage;
  isMacOS?: boolean;
}

const FOLDERS = [
  { id: 'inbox', labelKey: 'inbox' },
  { id: 'trash', labelKey: 'trash' },
  { id: 'spam', labelKey: 'spam' },
] as const;

const CATEGORY_DEFS = [
  { id: '工作/业务类', iconKey: 'Work', labels: { zh: '工作/业务', en: 'Work / Business', ja: '仕事 / 業務', ko: '업무 / 비즈니스', es: 'Trabajo / Negocio', fr: 'Travail / Affaires', de: 'Arbeit / Geschäft', ru: 'Работа / Бизнес' } },
  { id: '账单/财务类', iconKey: 'Finance', labels: { zh: '账单/财务', en: 'Billing / Finance', ja: '請求 / 財務', ko: '청구 / 재무', es: 'Facturación / Finanzas', fr: 'Facturation / Finance', de: 'Rechnung / Finanzen', ru: 'Счета / Финансы' } },
  { id: '社交/个人类', iconKey: 'Social', labels: { zh: '社交/个人', en: 'Social / Personal', ja: 'ソーシャル / 個人', ko: '소셜 / 개인', es: 'Social / Personal', fr: 'Social / Personnel', de: 'Sozial / Persönlich', ru: 'Социальное / Личное' } },
  { id: '广告/营销类', iconKey: 'Ads', labels: { zh: '广告/营销', en: 'Ads / Marketing', ja: '広告 / マーケティング', ko: '광고 / 마케팅', es: 'Anuncios / Marketing', fr: 'Publicité / Marketing', de: 'Werbung / Marketing', ru: 'Реклама / Маркетинг' } },
  { id: '安全/风险类', iconKey: 'Security', labels: { zh: '安全/风险', en: 'Security / Risk', ja: 'セキュリティ / リスク', ko: '보안 / 위험', es: 'Seguridad / Riesgo', fr: 'Sécurité / Risque', de: 'Sicherheit / Risiko', ru: 'Безопасность / Риск' } },
  { id: '通知类', iconKey: 'Notification', labels: { zh: '通知', en: 'Notifications', ja: '通知', ko: '알림', es: 'Notificaciones', fr: 'Notifications', de: 'Benachrichtigungen', ru: 'Уведомления' } },
] as const;

function getUi(appLanguage: string) {
  if (appLanguage === 'ko') {
    return {
      primaryView: '대화',
      composeTitle: '메일 쓰기',
      composeSubtitle: '새 메일 초안',
      unread: '읽지 않음',
      refresh: '새로고침',
      minimize: '최소화',
      maximize: '최대화',
      restore: '복원',
      close: '닫기',
      aiCategories: 'AI 스마트 분류',
      archive: '보관',
      github: 'GitHub',
      runAnalysis: '지금 분석',
      analyzing: '분석 중...',
      globalView: '전체 계정',
      viewAllAccountsMail: '모든 계정의 메일 보기',
    };
  }

  if (appLanguage === 'es') {
    return {
      primaryView: 'Conversaciones',
      composeTitle: 'Redactar',
      composeSubtitle: 'Nuevo borrador',
      unread: 'No leídos',
      refresh: 'Actualizar',
      minimize: 'Minimizar',
      maximize: 'Maximizar',
      restore: 'Restaurar',
      close: 'Cerrar',
      aiCategories: 'Clasificación inteligente',
      archive: 'Archivo',
      github: 'GitHub',
      runAnalysis: 'Analizar ahora',
      analyzing: 'Analizando...',
      globalView: 'Todas las cuentas',
      viewAllAccountsMail: 'Ver correo de todas las cuentas',
    };
  }

  if (appLanguage === 'fr') {
    return {
      primaryView: 'Conversations',
      composeTitle: 'Nouveau mail',
      composeSubtitle: 'Nouveau brouillon',
      unread: 'Non lus',
      refresh: 'Actualiser',
      minimize: 'Réduire',
      maximize: 'Agrandir',
      restore: 'Restaurer',
      close: 'Fermer',
      aiCategories: 'Classement intelligent IA',
      archive: 'Archive',
      github: 'GitHub',
      runAnalysis: 'Analyser maintenant',
      analyzing: 'Analyse...',
      globalView: 'Tous les comptes',
      viewAllAccountsMail: 'Voir les mails de tous les comptes',
    };
  }

  if (appLanguage === 'de') {
    return {
      primaryView: 'Konversationen',
      composeTitle: 'Schreiben',
      composeSubtitle: 'Neuer Entwurf',
      unread: 'Ungelesen',
      refresh: 'Aktualisieren',
      minimize: 'Minimieren',
      maximize: 'Maximieren',
      restore: 'Wiederherstellen',
      close: 'Schließen',
      aiCategories: 'KI-Smart-Kategorien',
      archive: 'Archiv',
      github: 'GitHub',
      runAnalysis: 'Jetzt analysieren',
      analyzing: 'Analyse läuft...',
      globalView: 'Alle Konten',
      viewAllAccountsMail: 'E-Mails aller Konten anzeigen',
    };
  }

  if (appLanguage === 'ru') {
    return {
      primaryView: 'Беседы',
      composeTitle: 'Написать',
      composeSubtitle: 'Новый черновик',
      unread: 'Непрочитанные',
      refresh: 'Обновить',
      minimize: 'Свернуть',
      maximize: 'Развернуть',
      restore: 'Восстановить',
      close: 'Закрыть',
      aiCategories: 'Умная классификация ИИ',
      archive: 'Архив',
      github: 'GitHub',
      runAnalysis: 'Анализировать',
      analyzing: 'Анализ...',
      globalView: 'Все аккаунты',
      viewAllAccountsMail: 'Показать почту всех аккаунтов',
    };
  }

  if (appLanguage === 'ja') {
    return {
      primaryView: '会話',
      composeTitle: 'メール作成',
      composeSubtitle: '新規下書き',
      unread: '未読',
      refresh: '更新',
      minimize: '最小化',
      maximize: '最大化',
      restore: '元に戻す',
      close: '閉じる',
      aiCategories: 'AI スマート分類',
      archive: 'アーカイブ',
      github: 'GitHub',
      runAnalysis: '今すぐ分析',
      analyzing: '分析中...',
      globalView: '全アカウント',
      viewAllAccountsMail: 'すべてのアカウントのメールを表示',
    };
  }

  if (appLanguage === 'en') {
    return {
      primaryView: 'Conversations',
      composeTitle: 'Compose',
      composeSubtitle: 'New draft',
      unread: 'Unread',
      refresh: 'Refresh',
      minimize: 'Minimize',
      maximize: 'Maximize',
      restore: 'Restore',
      close: 'Close',
      aiCategories: 'AI Categories',
      archive: 'Archive',
      github: 'GitHub',
      runAnalysis: 'Run Analysis',
      analyzing: 'Analyzing...',
      globalView: 'Global View',
      viewAllAccountsMail: 'View mail from all accounts',
    };
  }

  return {
    primaryView: '会话',
    composeTitle: '写邮件',
    composeSubtitle: '新建邮件草稿',
    unread: '未读',
    refresh: '刷新',
    minimize: '最小化',
    maximize: '最大化',
    restore: '还原',
    close: '关闭',
    aiCategories: 'AI 智能分类',
    archive: '归档',
    github: 'GitHub',
    runAnalysis: '立即分析',
    analyzing: '分析中...',
    globalView: '全局视图',
    viewAllAccountsMail: '查看所有账户邮件',
  };
}

function getSidebarLabelLanguage(appLanguage: string): SidebarLabelLanguage {
  return normalizeAppLanguage(appLanguage);
}

function getGitHubFolderLabel(folderId: GitHubSmartFolder, appLanguage: string): string {
  const labels: Record<GitHubSmartFolder, Record<SidebarLabelLanguage, string>> = {
    'GitHub/Needs Action': { zh: '待处理', en: 'Needs Action', ja: '対応が必要', ko: '처리 필요', es: 'Requiere acción', fr: 'Action requise', de: 'Aktion erforderlich', ru: 'Требует действия' },
    'GitHub/Review Requests': { zh: '评审请求', en: 'Review Requests', ja: 'レビュー依頼', ko: '리뷰 요청', es: 'Solicitudes de revisión', fr: 'Demandes de revue', de: 'Review-Anfragen', ru: 'Запросы ревью' },
    'GitHub/Assigned to Me': { zh: '分配给我', en: 'Assigned to Me', ja: '自分に割り当て', ko: '나에게 할당됨', es: 'Asignado a mí', fr: 'Assigné à moi', de: 'Mir zugewiesen', ru: 'Назначено мне' },
    'GitHub/Mentions': { zh: '提及', en: 'Mentions', ja: 'メンション', ko: '멘션', es: 'Menciones', fr: 'Mentions', de: 'Erwähnungen', ru: 'Упоминания' },
    'GitHub/CI and Failures': { zh: 'CI 与失败', en: 'CI and Failures', ja: 'CI / 失敗', ko: 'CI / 실패', es: 'CI y fallos', fr: 'CI et échecs', de: 'CI und Fehler', ru: 'CI и сбои' },
    'GitHub/Security': { zh: '安全', en: 'Security', ja: 'セキュリティ', ko: '보안', es: 'Seguridad', fr: 'Sécurité', de: 'Sicherheit', ru: 'Безопасность' },
    'GitHub/Low Priority': { zh: '低优先级', en: 'Low Priority', ja: '低優先度', ko: '낮은 우선순위', es: 'Baja prioridad', fr: 'Faible priorité', de: 'Niedrige Priorität', ru: 'Низкий приоритет' },
    'GitHub/Archived Updates': { zh: '归档更新', en: 'Archived Updates', ja: 'アーカイブ更新', ko: '보관된 업데이트', es: 'Actualizaciones archivadas', fr: 'Mises à jour archivées', de: 'Archivierte Updates', ru: 'Архивные обновления' },
  };

  return labels[folderId][getSidebarLabelLanguage(appLanguage)];
}

function getPriorityFolderLabel(folderId: GenericPriorityFolderId, appLanguage: string): string {
  const labels: Record<GenericPriorityFolderId, Record<SidebarLabelLanguage, string>> = {
    'Priority/High': { zh: '高优先级', en: 'High', ja: '高優先度', ko: '높은 우선순위', es: 'Alta prioridad', fr: 'Priorité élevée', de: 'Hohe Priorität', ru: 'Высокий приоритет' },
    'Priority/Needs Reply': { zh: '需回复', en: 'Needs Reply', ja: '返信が必要', ko: '답장 필요', es: 'Requiere respuesta', fr: 'Réponse requise', de: 'Antwort erforderlich', ru: 'Нужен ответ' },
    'Priority/Risk': { zh: '风险', en: 'Risk', ja: 'リスク', ko: '위험', es: 'Riesgo', fr: 'Risque', de: 'Risiko', ru: 'Риск' },
    'Priority/Low': { zh: '低优先级', en: 'Low', ja: '低優先度', ko: '낮은 우선순위', es: 'Baja prioridad', fr: 'Faible priorité', de: 'Niedrige Priorität', ru: 'Низкий приоритет' },
  };

  return labels[folderId][getSidebarLabelLanguage(appLanguage)];
}
function NavIcon({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className="w-8 h-5 flex justify-center items-center flex-shrink-0" style={{ color: active ? uiColor.text : uiColor.textMuted }}>
      {children}
    </span>
  );
}

function LogoMark() {
  return (
    <img
      src={minimailLogo}
      alt="MiNiMail"
      className="w-11 h-11 object-contain flex-shrink-0"
      draggable={false}
      aria-hidden="true"
    />
  );
}

function ComposeHeroIcon() {
  return (
    <span
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{
        backgroundColor: 'rgba(13,18,33,0.32)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      <Plus className="w-4 h-4" strokeWidth={2.2} />
    </span>
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
  githubNotificationsEnabled = false,
  githubConversationCount = 0,
  githubFolderCounts,
  priorityFolderCounts,
  appLanguage: appLanguageSetting,
  isMacOS = false,
}: SidebarProps) {
  const { i18n } = useTranslation();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [isAiCollapsed, setIsAiCollapsed] = useState(false);
  const isAllAccounts = currentAccount === 'all';
  const hasNoAccounts = currentAccount === null && accounts.length === 0;
  const appLanguage = normalizeAppLanguage(appLanguageSetting || i18n.language);
  const labelLanguage = getSidebarLabelLanguage(appLanguage);
  const ui = useMemo(() => getUi(appLanguage), [appLanguage]);

  const visiblePriorityFolders = useMemo(
    () => USER_VISIBLE_PRIORITY_FOLDER_IDS.filter((folderId) => (priorityFolderCounts?.[folderId] || 0) > 0 || selectedFolder === folderId),
    [priorityFolderCounts, selectedFolder]
  );
  const visibleGitHubFolders = useMemo(
    () => GITHUB_SMART_FOLDER_IDS.filter((folderId) => (githubFolderCounts?.[folderId] || 0) > 0 || selectedFolder === folderId),
    [githubFolderCounts, selectedFolder]
  );

  const navIcons: Record<string, React.ReactNode> = useMemo(() => ({
    inbox: <Inbox className="w-4 h-4" strokeWidth={1.8} />,
    unread: <Mail className="w-4 h-4" strokeWidth={1.8} />,
    trash: <Trash2 className="w-4 h-4" strokeWidth={1.8} />,
    spam: <ShieldAlert className="w-4 h-4" strokeWidth={1.8} />,
    starred: <Star className="w-4 h-4" strokeWidth={1.8} />,
    archive: <Archive className="w-4 h-4" strokeWidth={1.8} />,
    ai: <Sparkles className="w-4 h-4" strokeWidth={1.8} />,
    work: <BriefcaseBusiness className="w-4 h-4" strokeWidth={1.8} />,
    finance: <WalletCards className="w-4 h-4" strokeWidth={1.8} />,
    social: <UsersRound className="w-4 h-4" strokeWidth={1.8} />,
    ads: <Megaphone className="w-4 h-4" strokeWidth={1.8} />,
    security: <ShieldCheck className="w-4 h-4" strokeWidth={1.8} />,
    notification: <BellDot className="w-4 h-4" strokeWidth={1.8} />,
    github: <Workflow className="w-4 h-4" strokeWidth={1.8} />,
    settings: <Settings2 className="w-4 h-4" strokeWidth={1.8} />,
    users: <Users className="w-4 h-4" strokeWidth={1.8} />,
  }), []);

  const categoryIconMap: Record<string, React.ReactNode> = {
    Work: navIcons.work,
    Finance: navIcons.finance,
    Social: navIcons.social,
    Ads: navIcons.ads,
    Security: navIcons.security,
    Notification: navIcons.notification,
  };

  return (
    <div className="h-full flex flex-col [-webkit-app-region:drag]" style={{ backgroundColor: uiColor.shell, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
      <div
        className="pt-4 pb-3 px-4 flex-shrink-0 space-y-4"
        style={isMacOS ? { paddingTop: 36 } : undefined}
      >
        <div className="flex items-center justify-between [-webkit-app-region:no-drag]">
          <div className="flex items-center gap-3 min-w-0">
            <LogoMark />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-white truncate tracking-[-0.03em]">MiNiMail</div>
              <div className="text-[11px]" style={{ color: uiColor.textSubtle }}>Mail workspace</div>
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="w-10 h-10 flex items-center justify-center cursor-pointer disabled:opacity-40 rounded-2xl [-webkit-app-region:no-drag]"
            title={ui.refresh}
            style={{
              ...buildIconButtonStyle(),
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} strokeWidth={1.8} />
          </button>
        </div>

        <div className="[-webkit-app-region:no-drag]">
          <button
            onClick={onCompose}
            className="w-full px-4 py-3 cursor-pointer text-left"
            title={ui.composeTitle}
            style={{
              color: uiColor.text,
              borderRadius: 18,
              background: 'linear-gradient(135deg, rgba(124,58,237,0.94), rgba(99,102,241,0.92))',
              border: '1px solid rgba(196,181,253,0.24)',
              boxShadow: '0 14px 28px rgba(76,29,149,0.22)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <ComposeHeroIcon />
                <div className="min-w-0 text-left">
                  <div className="text-[14px] font-semibold text-white leading-none">{ui.composeTitle}</div>
                  <div className="text-[10px] mt-1" style={{ color: 'rgba(245,243,255,0.78)' }}>{ui.composeSubtitle}</div>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        <div className="space-y-1.5">
          <button onClick={() => onSelectFolder('inbox')} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(selectedFolder === 'inbox')}>
            <NavIcon active={selectedFolder === 'inbox'}>{navIcons.inbox}</NavIcon>
            <span className="flex-1 text-left leading-none">{ui.primaryView}</span>
            {(folderUnreadCounts.inbox || 0) > 0 && <span style={{ fontSize: 11, color: uiColor.textSubtle, lineHeight: 1 }}>{folderUnreadCounts.inbox}</span>}
          </button>

          <button onClick={() => onSelectFolder('starred')} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(selectedFolder === 'starred')}>
            <NavIcon active={selectedFolder === 'starred'}>{navIcons.starred}</NavIcon>
            <span className="flex-1 text-left leading-none">{t('starred')}</span>
          </button>

          <button onClick={() => onSelectFolder('archive')} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(selectedFolder === 'archive')}>
            <NavIcon active={selectedFolder === 'archive'}>{navIcons.archive}</NavIcon>
            <span className="flex-1 text-left leading-none">{ui.archive}</span>
          </button>

          <div className="space-y-1">
            <button onClick={() => setIsAiCollapsed((prev) => !prev)} className="w-full flex items-center cursor-pointer [-webkit-app-region:no-drag]" style={{ ...buildSidebarItemStyle(false), fontWeight: 600 }}>
              <NavIcon>{navIcons.ai}</NavIcon>
              <span className="flex-1 text-left leading-none">{ui.aiCategories}</span>
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 transition-transform duration-200" style={{ color: uiColor.textSubtle, transform: isAiCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
                <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
              </span>
            </button>

            {!isAiCollapsed && (
              <div className="space-y-1 pt-0.5">
                {onAnalysisDone && (
                  <button onClick={onAnalysisDone} disabled={isAiClassifying} className="w-full flex items-center cursor-pointer disabled:opacity-40 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(false)}>
                    <NavIcon>{isAiClassifying ? <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.8} /> : navIcons.ai}</NavIcon>
                    <span className="flex-1 text-left leading-none">{isAiClassifying ? ui.analyzing : ui.runAnalysis}</span>
                  </button>
                )}

                {CATEGORY_DEFS.map((category) => {
                  const selected = selectedFolder === category.id;
                  return (
                    <button key={category.id} onClick={() => onSelectFolder(category.id)} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(selected)}>
                      <NavIcon active={selected}>{categoryIconMap[category.iconKey]}</NavIcon>
                      <span className="flex-1 text-left leading-none">{category.labels[labelLanguage]}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {visiblePriorityFolders.length > 0 && (
            <div className="space-y-1 pt-0.5">
              {visiblePriorityFolders.map((folderId) => {
                const selected = selectedFolder === folderId;
                const count = priorityFolderCounts?.[folderId] || 0;
                const priorityTone = { bg: 'rgba(245,158,11,0.16)', color: '#FCD34D' };
                return (
                  <button key={folderId} onClick={() => onSelectFolder(folderId)} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(selected, true)}>
                    <NavIcon active={selected}>
                      <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: priorityTone.bg, color: priorityTone.color }}>
                        <Circle className="w-2.5 h-2.5" strokeWidth={2.4} fill="currentColor" />
                      </span>
                    </NavIcon>
                    <span className="flex-1 text-left leading-none">{getPriorityFolderLabel(folderId, appLanguage)}</span>
                    {count > 0 && <span style={{ fontSize: 11, color: uiColor.textSubtle, lineHeight: 1 }}>{count}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {githubNotificationsEnabled && (
            <div className="space-y-1">
              <button onClick={() => onSelectFolder('github')} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(selectedFolder === 'github')}>
                <NavIcon active={selectedFolder === 'github'}>{navIcons.github}</NavIcon>
                <span className="flex-1 text-left leading-none">{ui.github}</span>
                {githubConversationCount > 0 && <span style={{ fontSize: 11, color: uiColor.textSubtle, lineHeight: 1 }}>{githubConversationCount}</span>}
              </button>

              {visibleGitHubFolders.length > 0 && (
                <div className="space-y-1 pt-0.5">
                  {visibleGitHubFolders.map((folderId) => {
                    const selected = selectedFolder === folderId;
                    const count = githubFolderCounts?.[folderId] || 0;
                    const priorityHint = getGitHubFolderPriorityHint(folderId);
                    const priorityBadge = priorityHint ? getGitHubPriorityBadgeInfo(priorityHint, appLanguage) : null;
                    return (
                      <button key={folderId} onClick={() => onSelectFolder(folderId)} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(selected, true)}>
                        <NavIcon active={selected}>{navIcons.github}</NavIcon>
                        <span className="flex-1 text-left leading-none">{getGitHubFolderLabel(folderId, appLanguage)}</span>
                        {priorityBadge && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded"
                            title={priorityBadge.tooltip}
                            style={{
                              color: priorityBadge.color,
                              backgroundColor: priorityBadge.backgroundColor,
                              border: `1px solid ${priorityBadge.borderColor}`,
                              lineHeight: 1,
                            }}
                          >
                            {priorityBadge.shortLabel}
                          </span>
                        )}
                        {count > 0 && <span style={{ fontSize: 11, color: uiColor.textSubtle, lineHeight: 1 }}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            {FOLDERS.filter((folder) => folder.id !== 'inbox').map((folder) => {
              const selected = selectedFolder === folder.id;
              const iconNode = folder.id === 'trash' ? navIcons.trash : navIcons.spam;
              return (
                <button key={folder.id} onClick={() => onSelectFolder(folder.id)} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(selected)}>
                  <NavIcon active={selected}>{iconNode}</NavIcon>
                  <span className="flex-1 text-left leading-none">{t(folder.labelKey)}</span>
                </button>
              );
            })}
          </div>

          <button onClick={onSettings} className="w-full flex items-center cursor-pointer transition-all duration-150 [-webkit-app-region:no-drag]" style={buildSidebarItemStyle(false)}>
            <NavIcon>{navIcons.settings}</NavIcon>
            <span className="flex-1 text-left leading-none">{t('settings')}</span>
          </button>
        </div>
      </nav>

      <div className="w-full mt-auto" style={{ borderTop: `1px solid ${uiColor.borderSubtle}` }}>
        <div className="relative w-full">
          <button
            onClick={() => setShowAccountMenu((prev) => !prev)}
            className="m-3 flex flex-row items-center justify-between gap-3 w-[calc(100%-24px)] px-4 py-3 cursor-pointer rounded-2xl [-webkit-app-region:no-drag]"
            style={{ ...buildPanelStyle(), color: uiColor.textMuted }}
          >
            <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ color: '#C4B5FD', backgroundColor: 'rgba(124,58,237,0.22)' }}>{navIcons.users}</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white text-xs font-medium truncate">{hasNoAccounts ? 'No account connected' : isAllAccounts ? t('allAccounts') : (currentAccount && 'name' in currentAccount ? currentAccount.name : '')}</p>
              <p className="text-[11px] truncate" style={{ color: uiColor.textSubtle }}>{hasNoAccounts ? '请添加邮箱账号' : isAllAccounts ? ui.globalView : (currentAccount && 'email' in currentAccount ? currentAccount.email : '')}</p>
            </div>
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0" style={{ color: uiColor.textSubtle }}>
              <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
            </span>
          </button>

          {showAccountMenu && (
            <div className="absolute bottom-full left-3 right-3 mb-3 overflow-hidden" style={{ backgroundColor: uiColor.panel, borderRadius: uiRadius.lg, border: `1px solid ${uiColor.border}`, boxShadow: 'rgba(0,0,0,0.45) 0 18px 42px 0px' }}>
              <button onClick={() => { onSwitchAccount(-1); setShowAccountMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer [-webkit-app-region:no-drag]" style={{ borderBottom: `1px solid ${uiColor.borderSubtle}` }}>
                <span className="w-5 h-5 flex" style={{ color: uiColor.textMuted }}>{navIcons.users}</span>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-white text-sm">{t('allAccounts')}</p>
                  <p className="text-xs" style={{ color: uiColor.textSubtle }}>{ui.viewAllAccountsMail}</p>
                </div>
                {isAllAccounts && <span className="w-4 h-4 flex" style={{ color: uiColor.accent }}><Check className="w-4 h-4" strokeWidth={2} /></span>}
              </button>

              {accounts.length === 0 && (
                <div className="px-4 py-3 text-xs" style={{ color: uiColor.textSubtle }}>
                  No account connected / 请添加邮箱账号
                </div>
              )}

              {accounts.map((account) => (
                <button key={account.id} onClick={() => { onSwitchAccount(account.id); setShowAccountMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer [-webkit-app-region:no-drag]">
                  {account.avatar ? (
                    <img src={account.avatar} alt={account.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ backgroundColor: uiColor.accent }}>
                      {account.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white text-sm truncate">{account.name}</p>
                    <p className="text-xs truncate" style={{ color: uiColor.textSubtle }}>{account.email}</p>
                  </div>
                  {!isAllAccounts && currentAccount !== 'all' && currentAccount !== null && currentAccount.id === account.id && <span className="w-4 h-4 flex" style={{ color: uiColor.accent }}><Check className="w-4 h-4" strokeWidth={2} /></span>}
                </button>
              ))}

              <div className="p-3" style={{ borderTop: `1px solid ${uiColor.borderSubtle}` }}>
                <button onClick={() => { setShowAccountMenu(false); onAddAccount(); }} className="w-full flex items-center justify-center gap-2 py-2.5 text-white text-sm font-medium cursor-pointer [-webkit-app-region:no-drag]" style={{ backgroundColor: uiColor.accent, borderRadius: uiRadius.md }}>
                  <span className="w-4 h-4 flex"><Plus className="w-4 h-4" strokeWidth={2} /></span>
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
