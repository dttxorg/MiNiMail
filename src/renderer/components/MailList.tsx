import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Paperclip, Search, SlidersHorizontal, X } from 'lucide-react';
import { RendererMailSummary } from '../hooks/useMail';
import { getConversationCounterparty, isLocalSenderMail, resolveConversationCategory } from '../utils/mailConversations';
import { filterMailListByTab, type MailListFilterTab } from '../utils/mailListFilters';
import { filterMailsBySearchQuery, getMailSearchMatchPreview } from '../utils/mailSearch';
import { getSearchTrailingActions } from '../utils/searchActions';
import { formatMailListDate } from '../utils/mailDateDisplay';
import { buildMailRowStyle, uiColor, uiRadius } from '../utils/uiDesignTokens';
import { SenderAvatar } from './SenderAvatar';
import type { AppLanguage } from '../../shared/mailFolders';
import type { GitHubPriorityBadgeInfo } from '../utils/githubPriorityUi';

const CATEGORY_BADGES: Record<string, { label: string; emoji: string; bg: string }> = {
  '工作/业务类': { label: '工作', emoji: '💼', bg: 'rgba(0,113,227,0.18)' },
  '账单/财务类': { label: '账单', emoji: '💳', bg: 'rgba(255,159,10,0.18)' },
  '广告/营销类': { label: '广告', emoji: '📣', bg: 'rgba(191,90,242,0.18)' },
  '安全/风险类': { label: '风险', emoji: '🔒', bg: 'rgba(255,55,95,0.18)' },
  '通知类': { label: '通知', emoji: '🔔', bg: 'rgba(100,210,255,0.18)' },
};

interface MailListProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  appLanguage: AppLanguage;
  emails: RendererMailSummary[];
  categorySourceEmails?: RendererMailSummary[];
  selectedEmailId: string | null;
  onSelectEmail: (email: RendererMailSummary, event?: React.MouseEvent) => void;
  onViewEmail: (email: RendererMailSummary) => void;
  onToggleSelect: (email: RendererMailSummary) => void;
  selectedIds: string[];
  onSelectAll: () => void;
  isAllSelected: boolean;
  isLoading: boolean;
  listTitle?: string;
  accountEmails?: string[];
  stagedHistoryLabel?: string | null;
  emptyMessage?: string;
  githubPriorityById?: Record<string, GitHubPriorityBadgeInfo | undefined>;
  sortOrder?: 'newest' | 'oldest';
}

type TimeGroup = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older';
type FilterTabDef = { id: MailListFilterTab; label: string };

const MAIL_LIST_UI: Record<AppLanguage, {
  searchPlaceholder: string;
  searchOptions: string;
  clearSearch: string;
  tabs: Record<MailListFilterTab, string>;
  groups: Record<TimeGroup, string>;
}> = {
  zh: {
    searchPlaceholder: '搜索邮件 / 发件人 / 主题 / 正文',
    searchOptions: '搜索选项',
    clearSearch: '清除搜索',
    tabs: { all: '全部', unread: '未读', read: '已读', attachments: '附件' },
    groups: { today: '今天', yesterday: '昨天', thisWeek: '本周', thisMonth: '本月', older: '更早' },
  },
  en: {
    searchPlaceholder: 'Search mail / sender / subject / body',
    searchOptions: 'Search options',
    clearSearch: 'Clear search',
    tabs: { all: 'All', unread: 'Unread', read: 'Read', attachments: 'Attachments' },
    groups: { today: 'Today', yesterday: 'Yesterday', thisWeek: 'This Week', thisMonth: 'This Month', older: 'Older' },
  },
  ja: {
    searchPlaceholder: 'メール / 差出人 / 件名 / 本文を検索',
    searchOptions: '検索オプション',
    clearSearch: '検索をクリア',
    tabs: { all: 'すべて', unread: '未読', read: '既読', attachments: '添付' },
    groups: { today: '今日', yesterday: '昨日', thisWeek: '今週', thisMonth: '今月', older: '以前' },
  },
  ko: {
    searchPlaceholder: '메일 / 보낸사람 / 제목 / 본문 검색',
    searchOptions: '검색 옵션',
    clearSearch: '검색 지우기',
    tabs: { all: '전체', unread: '읽지 않음', read: '읽음', attachments: '첨부' },
    groups: { today: '오늘', yesterday: '어제', thisWeek: '이번 주', thisMonth: '이번 달', older: '이전' },
  },
  es: {
    searchPlaceholder: 'Buscar correo / remitente / asunto / cuerpo',
    searchOptions: 'Opciones de búsqueda',
    clearSearch: 'Borrar búsqueda',
    tabs: { all: 'Todos', unread: 'No leídos', read: 'Leídos', attachments: 'Adjuntos' },
    groups: { today: 'Hoy', yesterday: 'Ayer', thisWeek: 'Esta semana', thisMonth: 'Este mes', older: 'Anteriores' },
  },
  fr: {
    searchPlaceholder: 'Rechercher mail / expéditeur / objet / contenu',
    searchOptions: 'Options de recherche',
    clearSearch: 'Effacer la recherche',
    tabs: { all: 'Tous', unread: 'Non lus', read: 'Lus', attachments: 'Pièces jointes' },
    groups: { today: 'Aujourd’hui', yesterday: 'Hier', thisWeek: 'Cette semaine', thisMonth: 'Ce mois-ci', older: 'Plus anciens' },
  },
  de: {
    searchPlaceholder: 'Mail / Absender / Betreff / Inhalt suchen',
    searchOptions: 'Suchoptionen',
    clearSearch: 'Suche löschen',
    tabs: { all: 'Alle', unread: 'Ungelesen', read: 'Gelesen', attachments: 'Anhänge' },
    groups: { today: 'Heute', yesterday: 'Gestern', thisWeek: 'Diese Woche', thisMonth: 'Diesen Monat', older: 'Älter' },
  },
  ru: {
    searchPlaceholder: 'Поиск письма / отправителя / темы / текста',
    searchOptions: 'Параметры поиска',
    clearSearch: 'Очистить поиск',
    tabs: { all: 'Все', unread: 'Непрочитанные', read: 'Прочитанные', attachments: 'Вложения' },
    groups: { today: 'Сегодня', yesterday: 'Вчера', thisWeek: 'На этой неделе', thisMonth: 'В этом месяце', older: 'Ранее' },
  },
};

function renderHighlightedText(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return text;
  }

  const normalizedText = text.toLowerCase();
  const matchStart = normalizedText.indexOf(normalizedQuery);
  if (matchStart === -1) {
    return text;
  }

  const matchEnd = matchStart + normalizedQuery.length;

  return (
    <>
      {text.slice(0, matchStart)}
      <span
        style={{
          backgroundColor: 'rgba(124,58,237,0.28)',
          color: '#F5F3FF',
          borderRadius: 6,
          padding: '0 2px',
        }}
      >
        {text.slice(matchStart, matchEnd)}
      </span>
      {text.slice(matchEnd)}
    </>
  );
}

function formatRelativeTime(
  date: Date,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('justNow');
  if (diffMins < 60) return t('minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('daysAgo', { count: diffDays });

  return formatMailListDate(date, locale, now);
}

function getTimeGroup(date: Date): TimeGroup {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const value = date.getTime();

  if (value >= todayStart.getTime()) return 'today';
  if (value >= yesterdayStart.getTime()) return 'yesterday';
  if (value >= weekStart.getTime()) return 'thisWeek';
  if (value >= monthStart.getTime()) return 'thisMonth';
  return 'older';
}

function getTimeGroupLabel(appLanguage: AppLanguage, group: TimeGroup): string {
  return (MAIL_LIST_UI[appLanguage] ?? MAIL_LIST_UI.en).groups[group];
}

function getScheduledStatusLabel(status: RendererMailSummary['deliveryState'], appLanguage: AppLanguage): string | null {
  if (!status || !['scheduled', 'missed', 'failed', 'cancelled'].includes(status)) return null;
  if (appLanguage === 'zh') {
    if (status === 'scheduled') return '待发送';
    if (status === 'missed') return '已错过';
    if (status === 'failed') return '失败';
    return '已取消';
  }
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'missed') return 'Missed';
  if (status === 'failed') return 'Failed';
  return 'Cancelled';
}

function getScheduledStatusStyle(status: RendererMailSummary['deliveryState']) {
  if (status === 'scheduled') {
    return { color: '#C4B5FD', backgroundColor: 'rgba(124,58,237,0.16)', borderColor: 'rgba(196,181,253,0.24)' };
  }
  if (status === 'missed') {
    return { color: '#FBBF24', backgroundColor: 'rgba(245,158,11,0.14)', borderColor: 'rgba(251,191,36,0.24)' };
  }
  if (status === 'failed') {
    return { color: '#FCA5A5', backgroundColor: 'rgba(239,68,68,0.14)', borderColor: 'rgba(252,165,165,0.24)' };
  }
  return { color: '#CBD5E1', backgroundColor: 'rgba(148,163,184,0.12)', borderColor: 'rgba(203,213,225,0.18)' };
}

function SkeletonItem() {
  return (
    <div className="px-3 py-2.5 animate-pulse flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ backgroundColor: '#3a3a3d' }} />
      <div className="flex-1 space-y-1">
        <div className="flex justify-between">
          <div className="h-2.5 w-20 rounded" style={{ backgroundColor: '#3a3a3d' }} />
          <div className="h-2.5 w-10 rounded" style={{ backgroundColor: '#3a3a3d' }} />
        </div>
        <div className="h-2 w-full rounded" style={{ backgroundColor: '#3a3a3d' }} />
      </div>
    </div>
  );
}

export function MailList({
  t,
  appLanguage,
  emails,
  categorySourceEmails,
  selectedEmailId,
  onSelectEmail,
  onToggleSelect,
  selectedIds,
  onSelectAll,
  isAllSelected,
  isLoading,
  accountEmails = [],
  stagedHistoryLabel = null,
  emptyMessage,
  githubPriorityById = {},
  sortOrder = 'newest',
}: MailListProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language || undefined;
  const listUi = MAIL_LIST_UI[appLanguage] ?? MAIL_LIST_UI.en;
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<MailListFilterTab>('all');
  const trailingSearchActions = getSearchTrailingActions(searchQuery);
  const legacyFilterTabs = [
    { id: 'all', label: '全部' },
    { id: 'unread', label: '未读' },
    { id: 'read', label: '已读' },
    { id: 'attachments', label: '有附件' },
    { id: 'mentions', label: '@我' },
  ];

  const filterTabs: FilterTabDef[] = [
    { id: 'all', label: '全部' },
    { id: 'unread', label: '未读' },
    { id: 'read', label: '已读' },
    { id: 'attachments', label: '附件' },
  ];
  void filterTabs; // legacy hard-coded tabs; localizedFilterTabs is the active source
  void legacyFilterTabs;

  const localizedFilterTabs: FilterTabDef[] = [
    { id: 'all', label: listUi.tabs.all },
    { id: 'unread', label: listUi.tabs.unread },
    { id: 'read', label: listUi.tabs.read },
    { id: 'attachments', label: listUi.tabs.attachments },
  ];

  const filteredEmails = filterMailListByTab(emails, activeTab, accountEmails);
  const searchedEmails = filterMailsBySearchQuery(filteredEmails, searchQuery);

  const sortedEmails = [...searchedEmails].sort((a, b) => (
    sortOrder === 'oldest'
      ? a.date.getTime() - b.date.getTime()
      : b.date.getTime() - a.date.getTime()
  ));
  const categoryMails = categorySourceEmails ?? emails;
  const hasSelection = selectedIds.length > 0;

  const listItems: Array<{ type: 'header'; group: TimeGroup; label: string } | { type: 'email'; email: RendererMailSummary }> = [];
  let currentGroup: TimeGroup | null = null;
  for (const email of sortedEmails) {
    const group = getTimeGroup(email.date);
    if (group !== currentGroup) {
      listItems.push({ type: 'header', group, label: getTimeGroupLabel(appLanguage, group) });
      currentGroup = group;
    }
    listItems.push({ type: 'email', email });
  }

  return (
    <div className="h-full min-h-0 flex flex-col min-w-0" style={{ backgroundColor: '#0A1220', flexShrink: 0, borderLeft: `1px solid ${uiColor.borderSubtle}`, borderRight: `1px solid ${uiColor.borderSubtle}` }}>
      <div className="px-4 pt-4 pb-2 flex-shrink-0 space-y-3 [-webkit-app-region:drag]">
        <div className="flex items-center gap-2 px-4 py-2.5 [-webkit-app-region:no-drag]" style={{ backgroundColor: '#111827', border: `1px solid ${uiColor.borderSubtle}`, borderRadius: uiRadius.lg }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: uiColor.textSubtle }} />
          <input
            ref={searchRef}
            type="text"
            placeholder={listUi.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-sm text-white bg-transparent placeholder:text-[#636366] focus:outline-none"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
          />
          <button
            type="button"
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
            title={listUi.searchOptions}
            style={{ color: uiColor.textSubtle, backgroundColor: 'rgba(255,255,255,0.04)' }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
          {trailingSearchActions.map((action) => (
            <button
              key={action}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSearchQuery('');
                setTimeout(() => searchRef.current?.focus(), 0);
              }}
              className="cursor-pointer ml-1"
              aria-label={listUi.clearSearch}
              title={listUi.clearSearch}
            >
              <X className="w-4 h-4" style={{ color: uiColor.textSubtle }} />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 [-webkit-app-region:no-drag]">
          {localizedFilterTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer"
                style={{
                  borderRadius: uiRadius.md,
                  color: active ? '#C4B5FD' : uiColor.textMuted,
                  backgroundColor: active ? 'rgba(124,58,237,0.18)' : 'transparent',
                  border: active ? '1px solid rgba(124,58,237,0.38)' : '1px solid transparent',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {hasSelection && (
        <div className="flex items-center px-4 py-2.5 gap-3 flex-shrink-0" style={{ backgroundColor: '#23252A', borderBottom: `1px solid ${uiColor.borderSubtle}` }}>
          <button
            onClick={onSelectAll}
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all cursor-pointer"
            style={{
              backgroundColor: isAllSelected ? '#0071e3' : 'transparent',
              border: isAllSelected ? 'none' : '1.5px solid #636366',
            }}
          >
            {isAllSelected && <Check className="w-3 h-3 text-white" />}
          </button>
          <span className="text-xs" style={{ color: uiColor.textMuted }}>
            {selectedIds.length} {t('selected')}
          </span>
        </div>
      )}

      {stagedHistoryLabel && (
        <div
          className="px-4 py-2.5 text-[11px] flex-shrink-0"
          style={{
            color: uiColor.textMuted,
            borderBottom: `1px solid ${uiColor.borderSubtle}`,
            backgroundColor: 'rgba(0,113,227,0.06)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
          }}
        >
          {stagedHistoryLabel}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {isLoading && sortedEmails.length === 0 ? (
          <div>
            {Array.from({ length: 6 }).map((_, index) => <SkeletonItem key={index} />)}
          </div>
        ) : sortedEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: '#48484a' }}>
            <span className="text-2xl mb-2">📥</span>
            <p style={{ fontSize: 12, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>{emptyMessage || t('noEmails')}</p>
          </div>
        ) : (
          listItems.map((item, index) => {
            if (item.type === 'header') {
              return (
                <div
                  key={`header-${item.group}-${index}`}
                  className="px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: uiColor.textSubtle, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
                >
                  {item.label}
                </div>
              );
            }

            const email = item.email;
            const isSelected = selectedIds.includes(email.id);
            const isActive = selectedEmailId === email.id;
            const isUnread = !email.isRead;
            const counterparty = getConversationCounterparty(email, accountEmails);
            const isOutgoingRepresentative = isLocalSenderMail(email, accountEmails);
            const displayName = isOutgoingRepresentative
              ? counterparty.split('@')[0]
              : (email.fromName || email.from.split('@')[0]);
            const avatarEmail = isOutgoingRepresentative ? counterparty : email.from;
            const avatarName = isOutgoingRepresentative ? displayName : (email.fromName || email.from);
            const resolvedCategory = resolveConversationCategory(email, categoryMails, accountEmails);
            const githubPriority = githubPriorityById[email.id];
            const searchMatch = searchQuery.trim() ? getMailSearchMatchPreview(email, searchQuery) : null;
            const previewText = searchMatch?.text || email.snippet;
            const isScheduledMail = email.folder === 'scheduled';
            const scheduledStatusLabel = isScheduledMail ? getScheduledStatusLabel(email.deliveryState, appLanguage) : null;
            const scheduledStatusStyle = getScheduledStatusStyle(email.deliveryState);
            const rowDateLabel = isScheduledMail
              ? formatMailListDate(email.date, locale || '', new Date())
              : formatRelativeTime(email.date, t, locale || '');

              return (
                <div
                  key={email.id}
                  onClick={(e) => {
                    onSelectEmail(email, e);
                  }}
                  className="mb-1.5 px-3 py-2.5 transition-colors flex items-center gap-2.5 relative cursor-pointer"
                  style={buildMailRowStyle(isActive || isSelected, isUnread && !isSelected)}
                onMouseEnter={(e) => {
                  if (!isSelected && !isActive) e.currentTarget.style.backgroundColor = isUnread ? 'rgba(124,58,237,0.14)' : uiColor.hover;
                  else if (isSelected && !isActive) e.currentTarget.style.backgroundColor = uiColor.selectedStrong;
                  else if (!isSelected && isActive) e.currentTarget.style.backgroundColor = uiColor.hover;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected && !isActive) e.currentTarget.style.backgroundColor = isUnread ? 'rgba(124,58,237,0.08)' : 'transparent';
                  else if (isSelected && !isActive) e.currentTarget.style.backgroundColor = uiColor.selectedStrong;
                  else if (!isSelected && isActive) e.currentTarget.style.backgroundColor = uiColor.selected;
                }}
              >
                {email.isStarred && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                    style={{ backgroundColor: '#ff9f0a', boxShadow: '0 0 8px rgba(255,159,10,0.35)' }}
                  />
                )}

                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(email);
                  }}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 transition-opacity duration-150 cursor-pointer z-10"
                  style={{ backgroundColor: isSelected ? uiColor.accent : 'rgba(255,255,255,0.12)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = isSelected ? '1' : '0'; }}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>

                <div className="flex-shrink-0 ml-3.5">
                  <SenderAvatar email={avatarEmail} name={avatarName} size={30} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                        fontSize: 12.5,
                        color: isActive ? '#F8FAFC' : isUnread ? '#F8FAFC' : '#CBD5E1',
                        fontWeight: isUnread ? '700' : '400',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {displayName}
                    </span>
                    <span className="flex-shrink-0" style={{ fontSize: 11, color: uiColor.textSubtle, lineHeight: 1 }}>
                      {rowDateLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="truncate flex-1"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                        fontSize: 11.5,
                        color: isActive ? '#EDE9FE' : isUnread ? '#EDE9FE' : '#B8C2D6',
                        fontWeight: isUnread ? '600' : '400',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {email.subject}
                    </span>
                    {scheduledStatusLabel && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          color: scheduledStatusStyle.color,
                          backgroundColor: scheduledStatusStyle.backgroundColor,
                          border: `1px solid ${scheduledStatusStyle.borderColor}`,
                          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                          lineHeight: 1,
                        }}
                      >
                        {scheduledStatusLabel}
                      </span>
                    )}
                    {email.hasAttachments && (
                      <Paperclip className="w-3 h-3 flex-shrink-0" style={{ color: uiColor.textSubtle }} />
                    )}
                    {githubPriority && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          backgroundColor: githubPriority.backgroundColor,
                          color: githubPriority.color,
                          border: `1px solid ${githubPriority.borderColor}`,
                          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                          lineHeight: 1,
                        }}
                        title={githubPriority.tooltip}
                      >
                        {githubPriority.shortLabel}
                      </span>
                    )}
                    {resolvedCategory && CATEGORY_BADGES[resolvedCategory] && (
                      <span
                        className="text-xs px-1 py-0.5 rounded"
                        style={{
                          backgroundColor: CATEGORY_BADGES[resolvedCategory].bg,
                          color: '#8a8a8e',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                        }}
                        title={CATEGORY_BADGES[resolvedCategory].label}
                      >
                        {CATEGORY_BADGES[resolvedCategory].emoji}
                      </span>
                    )}
                  </div>
                  <p
                    className="truncate mt-0.5"
                    style={{
                      fontSize: 10.5,
                      color: isUnread ? '#A8B3C7' : '#7F8EA3',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {renderHighlightedText(previewText, searchQuery)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
