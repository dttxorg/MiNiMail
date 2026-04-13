import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Paperclip, Search, X } from 'lucide-react';
import { RendererMailSummary } from '../hooks/useMail';
import { getConversationCounterparty, isLocalSenderMail } from '../utils/mailConversations';
import { SenderAvatar } from './SenderAvatar';

const CATEGORY_BADGES: Record<string, { label: string; emoji: string; bg: string }> = {
  '工作/业务类': { label: '工作', emoji: '💼', bg: 'rgba(0,113,227,0.18)' },
  '账单/财务类': { label: '账单', emoji: '💳', bg: 'rgba(255,159,10,0.18)' },
  '广告/营销类': { label: '广告', emoji: '📣', bg: 'rgba(191,90,242,0.18)' },
  '安全/风险类': { label: '风险', emoji: '🔒', bg: 'rgba(255,55,95,0.18)' },
  '通知类': { label: '通知', emoji: '🔔', bg: 'rgba(100,210,255,0.18)' },
};

interface MailListProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  emails: RendererMailSummary[];
  selectedEmailId: string | null;
  onSelectEmail: (email: RendererMailSummary, event?: React.MouseEvent) => void;
  onViewEmail: (email: RendererMailSummary) => void;
  onToggleSelect: (email: RendererMailSummary) => void;
  selectedIds: string[];
  onSelectAll: () => void;
  isAllSelected: boolean;
  onContextMenu: (emailId: string, x: number, y: number) => void;
  isLoading: boolean;
  listTitle?: string;
  accountEmails?: string[];
}

type TimeGroup = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older';

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

  return date.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
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

function getTimeGroupLabel(t: (key: string) => string, group: TimeGroup): string {
  switch (group) {
    case 'today': return t('today');
    case 'yesterday': return t('yesterday');
    case 'thisWeek': return t('thisWeek');
    case 'thisMonth': return t('thisMonth');
    case 'older': return t('older');
  }
}

function SkeletonItem() {
  return (
    <div className="px-4 py-3 animate-pulse flex items-center gap-3">
      <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ backgroundColor: '#3a3a3d' }} />
      <div className="flex-1 space-y-1.5">
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
  emails,
  selectedEmailId,
  onSelectEmail,
  onToggleSelect,
  selectedIds,
  onSelectAll,
  isAllSelected,
  onContextMenu,
  isLoading,
  accountEmails = [],
}: MailListProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language || undefined;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const searchedEmails = searchQuery.trim()
    ? emails.filter((email) =>
      email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (email.fromName || email.from).toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.snippet.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : emails;

  const sortedEmails = [...searchedEmails].sort((a, b) => b.date.getTime() - a.date.getTime());
  const hasSelection = selectedIds.length > 0;

  const listItems: Array<{ type: 'header'; group: TimeGroup; label: string } | { type: 'email'; email: RendererMailSummary }> = [];
  let currentGroup: TimeGroup | null = null;
  for (const email of sortedEmails) {
    const group = getTimeGroup(email.date);
    if (group !== currentGroup) {
      listItems.push({ type: 'header', group, label: getTimeGroupLabel(t, group) });
      currentGroup = group;
    }
    listItems.push({ type: 'email', email });
  }

  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
    searchRef.current?.blur();
  }

  return (
    <div className="h-full min-h-0 flex flex-col" style={{ backgroundColor: '#282A2E', width: 320, flexShrink: 0 }}>
      <div className="px-3 pt-3 pb-2 flex-shrink-0 [-webkit-app-region:drag]">
        {searchOpen ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl [-webkit-app-region:no-drag]" style={{ backgroundColor: '#3a3a3d' }}>
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#636366' }} />
            <input
              ref={searchRef}
              type="text"
              placeholder={t('searchEmails')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 text-sm text-white bg-transparent placeholder:text-[#636366] focus:outline-none"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
              onBlur={closeSearch}
            />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (searchQuery) {
                  setSearchQuery('');
                  setTimeout(() => searchRef.current?.focus(), 0);
                  return;
                }
                closeSearch();
              }}
              className="cursor-pointer ml-1"
              aria-label={searchQuery ? 'Clear search' : 'Close search'}
              title={searchQuery ? 'Clear search' : 'Close search'}
            >
              <X className="w-4 h-4" style={{ color: '#636366' }} />
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              onClick={openSearch}
              className="p-2 rounded-lg transition-colors cursor-pointer [-webkit-app-region:no-drag]"
              style={{ color: '#636366' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#3a3a3d'; e.currentTarget.style.color = '#a1a1a6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#636366'; }}
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {hasSelection && (
        <div className="flex items-center px-4 py-2 gap-3 flex-shrink-0" style={{ backgroundColor: '#1F2124', borderBottom: '1px solid #3a3a3d' }}>
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
          <span className="text-xs" style={{ color: '#a1a1a6' }}>
            {selectedIds.length} {t('selected')}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && sortedEmails.length === 0 ? (
          <div>
            {Array.from({ length: 6 }).map((_, index) => <SkeletonItem key={index} />)}
          </div>
        ) : sortedEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: '#48484a' }}>
            <span className="text-2xl mb-2">📥</span>
            <p style={{ fontSize: 12, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>{t('noEmails')}</p>
          </div>
        ) : (
          listItems.map((item, index) => {
            if (item.type === 'header') {
              return (
                <div
                  key={`header-${item.group}-${index}`}
                  className="px-4 pt-4 pb-1.5 text-xs font-medium uppercase tracking-widest"
                  style={{ color: '#48484a', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}
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

            return (
              <div
                key={email.id}
                onClick={(e) => onSelectEmail(email, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu(email.id, e.clientX, e.clientY);
                }}
                className="px-4 py-2 transition-colors flex items-center gap-3 relative"
                style={{
                  backgroundColor: isUnread && !isActive && !isSelected ? 'rgba(0,113,227,0.08)' : 'transparent',
                  boxShadow: isUnread && !isActive && !isSelected ? 'inset 2px 0 0 rgba(0,113,227,0.85)' : undefined,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected && !isActive) e.currentTarget.style.backgroundColor = isUnread ? 'rgba(0,113,227,0.14)' : '#1F2124';
                  else if (isSelected && !isActive) e.currentTarget.style.backgroundColor = 'rgba(0,113,227,0.08)';
                  else if (!isSelected && isActive) e.currentTarget.style.backgroundColor = '#1F2124';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected && !isActive) e.currentTarget.style.backgroundColor = isUnread ? 'rgba(0,113,227,0.08)' : 'transparent';
                  else if (isSelected && !isActive) e.currentTarget.style.backgroundColor = 'rgba(0,113,227,0.05)';
                  else if (!isSelected && isActive) e.currentTarget.style.backgroundColor = '#282A2E';
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
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 transition-opacity duration-150 cursor-pointer z-10"
                  style={{ backgroundColor: isSelected ? '#0071e3' : 'rgba(255,255,255,0.12)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = isSelected ? '1' : '0'; }}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>

                <div className="flex-shrink-0 ml-5">
                  <SenderAvatar email={avatarEmail} name={avatarName} size={32} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                        fontSize: 13,
                        color: isActive ? '#f5f5f7' : isUnread ? '#f5f5f7' : '#636366',
                        fontWeight: isUnread ? '700' : '400',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {displayName}
                    </span>
                    <span className="flex-shrink-0" style={{ fontSize: 10, color: '#48484a', lineHeight: 1 }}>
                      {formatRelativeTime(email.date, t, locale || '')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="truncate flex-1"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                        fontSize: 12,
                        color: isActive ? '#c1c1c6' : isUnread ? '#d4d4d8' : '#48484a',
                        fontWeight: isUnread ? '600' : '400',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {email.subject}
                    </span>
                    {email.hasAttachments && (
                      <Paperclip className="w-3 h-3 flex-shrink-0" style={{ color: '#48484a' }} />
                    )}
                    {email.category && CATEGORY_BADGES[email.category] && (
                      <span
                        className="text-xs px-1 py-0.5 rounded"
                        style={{
                          backgroundColor: CATEGORY_BADGES[email.category].bg,
                          color: '#8a8a8e',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                        }}
                        title={CATEGORY_BADGES[email.category].label}
                      >
                        {CATEGORY_BADGES[email.category].emoji}
                      </span>
                    )}
                  </div>
                  <p
                    className="truncate mt-0.5"
                    style={{
                      fontSize: 11,
                      color: isUnread ? '#9ca3af' : '#3a3a3c',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {email.snippet}
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
