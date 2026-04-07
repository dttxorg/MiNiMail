import React, { useState } from 'react';
import { Search, Star, Paperclip, Check, Loader2 } from 'lucide-react';
import { MockEmail } from '../data/mockData';

interface MailListProps {
  t: (key: string) => string;
  emails: MockEmail[];
  selectedEmailId: string | null;
  onSelectEmail: (email: MockEmail, event?: React.MouseEvent) => void;
  activeTab: 'primary' | 'social' | 'promotions';
  onTabChange: (tab: 'primary' | 'social' | 'promotions') => void;
  selectedIds: string[];
  onSelectAll: () => void;
  isAllSelected: boolean;
  onContextMenu: (emailId: string, x: number, y: number) => void;
  isLoading: boolean;
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

function getAvatarColor(name: string): string {
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-pink-500',
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

function SkeletonItem() {
  return (
    <div className="p-4 border-b border-zinc-800 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-zinc-800 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex justify-between">
            <div className="h-3 w-24 bg-zinc-800 rounded" />
            <div className="h-3 w-12 bg-zinc-800 rounded" />
          </div>
          <div className="h-3 w-full bg-zinc-800 rounded" />
          <div className="h-3 w-3/4 bg-zinc-800 rounded" />
        </div>
      </div>
    </div>
  );
}

export function MailList({
  t,
  emails,
  selectedEmailId,
  onSelectEmail,
  activeTab,
  onTabChange,
  selectedIds,
  onSelectAll,
  isAllSelected,
  onContextMenu,
  isLoading,
}: MailListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEmails = emails.filter((email) => {
    if (activeTab === 'primary') return email.category === 'primary' || !email.category;
    if (activeTab === 'social') return email.category === 'social';
    if (activeTab === 'promotions') return email.category === 'promotions';
    return true;
  });

  // Sort descending (newest first) and group by time
  const sortedEmails = [...filteredEmails].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Build list with time group headers interspersed
  type ListItem = { type: 'header'; group: TimeGroup; label: string } | { type: 'email'; email: MockEmail };

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

  // AI classification placeholder - for future auto-categorization
  const classifyEmail = (email: MockEmail): 'primary' | 'social' | 'promotions' => {
    return 'primary';
  };

  return (
    <div className="w-96 h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col">
      {/* Header: Search + Tabs - drag region */}
      <div className="h-14 flex flex-col justify-center px-3 flex-shrink-0 [-webkit-app-region:drag]">
        <div className="relative [-webkit-app-region:no-drag]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder={t('searchEmails')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 [-webkit-app-region:no-drag]">
        {(['primary', 'social', 'promotions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab
                ? 'text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t(tab)}
            {tab === 'primary' && emails.filter((e) => !e.isRead).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                {emails.filter((e) => !e.isRead).length}
              </span>
            )}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* Select All Row */}
      <div className="flex items-center px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 gap-2">
        <button
          onClick={onSelectAll}
          className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
            isAllSelected
              ? 'bg-blue-600 border-blue-600'
              : 'border-zinc-600 hover:border-zinc-400'
          }`}
        >
          {isAllSelected && <Check className="w-3.5 h-3.5 text-white" />}
        </button>
        <span className="text-xs text-zinc-500">
          {isAllSelected ? t('selectAll') : `${t('selectAll')} (${sortedEmails.length})`}
        </span>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonItem key={i} />
            ))}
          </div>
        ) : sortedEmails.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
              <span className="text-3xl">📭</span>
            </div>
            <p className="text-sm">{t('noEmails')}</p>
          </div>
        )}
        {listItems.map((item, index) => {
          if (item.type === 'header') {
            return (
              <div
                key={`header-${item.group}-${index}`}
                className="px-4 py-2 bg-zinc-950 text-zinc-500 text-xs font-semibold uppercase tracking-wider"
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
              className={`p-4 border-b border-zinc-800 cursor-pointer transition-colors flex items-start gap-2 ${
                isSelected
                  ? 'bg-blue-600/20 border-l-2 border-l-blue-500'
                  : isActive
                  ? 'bg-zinc-800'
                  : 'hover:bg-zinc-800/50'
              }`}
            >
              {/* Checkbox */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEmail(email, { ctrlKey: true } as React.MouseEvent);
                }}
                className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  isSelected
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-zinc-600 hover:border-zinc-400'
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
              </button>

              {/* Avatar */}
              <div className="flex-shrink-0">
                {email.from.avatar ? (
                  <img
                    src={email.from.avatar}
                    alt={email.from.name}
                    className="w-10 h-10 rounded-full bg-zinc-700"
                  />
                ) : (
                  <div
                    className={`w-10 h-10 rounded-full ${getAvatarColor(
                      email.from.name
                    )} flex items-center justify-center text-white text-sm font-semibold`}
                  >
                    {email.from.name.charAt(0)}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-sm ${
                        email.isRead ? 'text-zinc-400' : 'text-zinc-100 font-semibold'
                      } truncate`}
                    >
                      {email.from.name}
                    </span>
                    {email.isStarred && (
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                    )}
                  </div>
                  <span className="text-xs text-zinc-500 flex-shrink-0 ml-2">
                    {formatRelativeTime(email.date)}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-sm ${
                      email.isRead ? 'text-zinc-500' : 'text-zinc-300'
                    } truncate flex-1`}
                  >
                    {email.subject}
                  </span>
                  {email.hasAttachments && (
                    <Paperclip className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                  )}
                </div>

                <p className="text-xs text-zinc-500 truncate">{email.snippet}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
