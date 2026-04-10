import React, { useState, useRef } from 'react';
import { Search, Star, Paperclip, Check, X } from 'lucide-react';
import { RendererMailSummary } from '../hooks/useMail';
import { SenderAvatar } from './SenderAvatar';

const CATEGORY_BADGES: Record<string, { label: string; emoji: string; bg: string }> = {
  '工作/业务类': { label: '工作', emoji: '💼', bg: 'rgba(0,113,227,0.18)' },
  '账单/财务类': { label: '账单', emoji: '💰', bg: 'rgba(255,159,10,0.18)' },
  '广告/营销类': { label: '广告', emoji: '📢', bg: 'rgba(191,90,242,0.18)' },
  '安全/风险类': { label: '风险', emoji: '🔒', bg: 'rgba(255,55,95,0.18)' },
  '通知类':      { label: '通知', emoji: '🔔', bg: 'rgba(100,210,255,0.18)' },
};

interface MailListProps {
  t: (key: string) => string;
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
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

type TimeGroup = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older';

function getTimeGroup(date: Date): TimeGroup {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const d = date.getTime();
  if (d >= todayStart.getTime()) return 'today';
  if (d >= yesterdayStart.getTime()) return 'yesterday';
  if (d >= weekStart.getTime()) return 'thisWeek';
  if (d >= monthStart.getTime()) return 'thisMonth';
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
  onViewEmail,
  onToggleSelect,
  selectedIds,
  onSelectAll,
  isAllSelected,
  onContextMenu,
  isLoading,
  listTitle = '',
}: MailListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredEmails = emails;

  const searchedEmails = searchQuery.trim()
    ? filteredEmails.filter(e =>
        e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.fromName || e.from).toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.snippet.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredEmails;

  const sortedEmails = [...searchedEmails].sort((a, b) => b.date.getTime() - a.date.getTime());

  type ListItem = { type: 'header'; group: TimeGroup; label: string } | { type: 'email'; email: RendererMailSummary };

  const listItems: ListItem[] = [];
  let currentGroup: TimeGroup | null = null;
  for (const email of sortedEmails) {
    const group = getTimeGroup(email.date);
    if (group !== currentGroup) {
      listItems.push({ type: 'header', group, label: getTimeGroupLabel(t, group) });
      currentGroup = group;
    }
    listItems.push({ type: 'email', email });
  }

  const hasSelection = selectedIds.length > 0;

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
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: '#282A2E', width: 320, flexShrink: 0 }}
    >
      {/* Header: Dynamic Search */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        {searchOpen ? (
          /* Expanded search */
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ backgroundColor: '#3a3a3d' }}
          >
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
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="cursor-pointer"
              >
                <X className="w-3.5 h-3.5" style={{ color: '#636366' }} />
              </button>
            )}
            <button onClick={closeSearch} className="cursor-pointer ml-1">
              <X className="w-4 h-4" style={{ color: '#636366' }} />
            </button>
          </div>
        ) : (
          /* Collapsed: show icon trigger */
          <div className="flex justify-end">
            <button
              onClick={openSearch}
              className="p-2 rounded-lg transition-colors cursor-pointer"
              style={{ color: '#636366' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#3a3a3d'; e.currentTarget.style.color = '#a1a1a6'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#636366'; }}
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Batch toolbar — only when items are selected */}
      {hasSelection && (
        <div
          className="flex items-center px-4 py-2 gap-3 flex-shrink-0"
          style={{ backgroundColor: '#1F2124', borderBottom: '1px solid #3a3a3d' }}
        >
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
            {selectedIds.length} 项已选中
          </span>
          <button
            onClick={() => {}}
            className="ml-auto text-xs px-3 py-1 rounded-md cursor-pointer transition-colors"
            style={{ backgroundColor: '#3a3a3d', color: '#a1a1a6' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#48484a'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#3a3a3d'; }}
          >
            批量操作 ▾
          </button>
        </div>
      )}

      {/* Email List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonItem key={i} />
            ))}
          </div>
        ) : sortedEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: '#48484a' }}>
            <span className="text-2xl mb-2">📭</span>
            <p style={{ fontSize: 12, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>{t('noEmails')}</p>
          </div>
        ) : (
          listItems.map((item, index) => {
            if (item.type === 'header') {
              return (
                <div
                  key={`header-${item.group}-${index}`}
                  className="px-4 pt-4 pb-1.5 text-xs font-medium uppercase tracking-widest"
                  style={{
                    color: '#48484a',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                  }}
                >
                  {item.label}
                </div>
              );
            }
            const email = item.email;
            const isSelected = selectedIds.includes(email.id);
            const isActive = selectedEmailId === email.id;

            return (
              <div
                key={email.id}
                onClick={(e) => onSelectEmail(email, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu(email.id, e.clientX, e.clientY);
                }}
                className="px-4 py-2 transition-colors flex items-center gap-3 relative"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={e => {
                  if (!isSelected && !isActive) e.currentTarget.style.backgroundColor = '#1F2124';
                  else if (isSelected && !isActive) e.currentTarget.style.backgroundColor = 'rgba(0,113,227,0.08)';
                  else if (!isSelected && isActive) e.currentTarget.style.backgroundColor = '#1F2124';
                }}
                onMouseLeave={e => {
                  if (!isSelected && !isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  else if (isSelected && !isActive) e.currentTarget.style.backgroundColor = 'rgba(0,113,227,0.05)';
                  else if (!isSelected && isActive) e.currentTarget.style.backgroundColor = '#282A2E';
                }}
              >
                {/* Hover-only checkball — absolutely positioned over avatar */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(email);
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 transition-opacity duration-150 cursor-pointer z-10"
                  style={{ backgroundColor: isSelected ? '#0071e3' : 'rgba(255,255,255,0.12)' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = isSelected ? '1' : '0'; }}
                  id={`cb-${email.id}`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>

                {/* Avatar: sender initials */}
                <div className="flex-shrink-0 ml-5">
                  <SenderAvatar name={email.fromName || email.from} size={32} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                        fontSize: 13,
                        color: isActive ? '#f5f5f7' : email.isRead ? '#636366' : '#a1a1a6',
                        fontWeight: email.isRead ? '400' : '600',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {email.fromName || email.from.split('@')[0]}
                    </span>
                    <span className="flex-shrink-0" style={{ fontSize: 10, color: '#48484a', lineHeight: 1 }}>
                      {formatRelativeTime(email.date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="truncate flex-1"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                        fontSize: 12,
                        color: isActive ? '#c1c1c6' : email.isRead ? '#48484a' : '#7a7a7e',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {email.subject}
                    </span>
                    {email.hasAttachments && (
                      <Paperclip className="w-3 h-3 flex-shrink-0" style={{ color: '#48484a' }} />
                    )}
                    {email.isStarred && (
                      <Star className="w-3 h-3 flex-shrink-0" style={{ color: '#ff9f0a', fill: '#ff9f0a' }} />
                    )}
                    {email.category && CATEGORY_BADGES[email.category] && (
                      <span
                        className="text-xs px-1 py-0.5 rounded"
                        style={{
                          backgroundColor: CATEGORY_BADGES[email.category].bg,
                          color: '#8a8a8e',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
                        }}
                      >
                        {CATEGORY_BADGES[email.category].emoji}
                      </span>
                    )}
                  </div>
                  <p
                    className="truncate mt-0.5"
                    style={{
                      fontSize: 11,
                      color: '#3a3a3c',
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
