import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertCircle,
  Star,
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Check,
  Heart,
  Bot,
  X,
  RotateCw,
} from 'lucide-react';
import { mockFolders } from '../data/mockData';

interface SidebarProps {
  t: (key: string) => string;
  selectedFolder: string;
  onSelectFolder: (folderId: string) => void;
  onCompose: () => void;
  onSettings: () => void;
  currentAccount: {
    email: string;
    name: string;
    avatar?: string;
  };
  accounts: Array<{
    id: number;
    email: string;
    name: string;
    avatar?: string;
  }>;
  onSwitchAccount: (accountId: number) => void;
  onAddAccount: () => void;
  inboxExpanded: boolean;
  onToggleInbox: () => void;
  accountFilter: number | null;
  onAccountFilter: (accountId: number | null) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  inbox: <Inbox className="w-5 h-5" />,
  send: <Send className="w-5 h-5" />,
  file: <FileText className="w-5 h-5" />,
  trash: <Trash2 className="w-5 h-5" />,
  spam: <AlertCircle className="w-5 h-5" />,
};

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
  inboxExpanded,
  onToggleInbox,
  accountFilter,
  onAccountFilter,
  onRefresh,
  isRefreshing,
}: SidebarProps) {
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const totalUnread = 5;

  return (
    <div className="w-64 h-screen bg-zinc-950 flex flex-col">
      {/* Header - drag region */}
      <div className="h-14 px-4 flex items-center justify-between flex-shrink-0 [-webkit-app-region:drag]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-zinc-100 font-bold text-lg">minimail</span>
        </div>
        <div className="flex items-center gap-3 [-webkit-app-region:no-drag]">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-zinc-500 hover:text-zinc-100 transition-all"
          >
            <RotateCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="text-zinc-500 hover:text-zinc-100 hover:scale-110 transition-all"
          >
            <Heart size={16} />
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="text-zinc-500 hover:text-zinc-100 hover:scale-110 transition-all"
          >
            <Bot size={16} />
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="text-zinc-500 hover:text-zinc-100 hover:scale-110 transition-all"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Compose Button */}
      <div className="p-3">
        <button
          onClick={onCompose}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t('compose')}
        </button>
      </div>

      {/* Folder Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        <div className="space-y-1">
          {/* Inbox as accordion */}
          <div>
            <button
              onClick={() => {
                if (selectedFolder !== 'inbox') {
                  onSelectFolder('inbox');
                }
                onToggleInbox();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                selectedFolder === 'inbox'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={selectedFolder === 'inbox' ? 'text-blue-500' : ''}>
                  <Inbox className="w-5 h-5" />
                </span>
                <span className="font-medium">
                  {`${t('inbox')} (${totalUnread})`}
                </span>
              </div>
              {inboxExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            {/* Account sub-items - only shown when expanded */}
            {inboxExpanded && (
              <div className="ml-4 mt-1 space-y-0.5">
                {/* All accounts item */}
                <button
                  onClick={() => onAccountFilter(null)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    accountFilter === null
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center">
                    <span className="text-xs text-zinc-300">全</span>
                  </div>
                  <span className="text-xs font-medium">{t('allAccounts')}</span>
                  {accountFilter === null && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                </button>

                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => onAccountFilter(account.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      accountFilter === account.id
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                    }`}
                  >
                    {account.avatar ? (
                      <img
                        src={account.avatar}
                        alt={account.name}
                        className="w-5 h-5 rounded-full bg-zinc-700"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                        {account.name.charAt(0)}
                      </div>
                    )}
                    <span className="text-xs truncate">{account.email}</span>
                    {accountFilter === account.id && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Other folders */}
          {mockFolders.filter(f => f.id !== 'inbox').map((folder) => (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                selectedFolder === folder.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={selectedFolder === folder.id ? 'text-blue-500' : ''}>
                  {iconMap[folder.icon]}
                </span>
                <span className="font-medium">
                  {t(folder.name)}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Starred Section */}
        <div className="mt-6">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors">
            <Star className="w-5 h-5" />
            <span className="font-medium">{t('starred')}</span>
          </button>
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="p-3 flex-shrink-0">
        <button
          onClick={onSettings}
          className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors mb-3"
        >
          <Settings className="w-5 h-5" />
          <span className="font-medium">{t('settings')}</span>
        </button>

        {/* Account Section */}
        <div className="relative">
          <button
            onClick={() => setShowAccountMenu(!showAccountMenu)}
            className="w-full flex items-center gap-3 px-3 py-2 bg-zinc-900 rounded-lg transition-colors"
          >
            {currentAccount.avatar ? (
              <img
                src={currentAccount.avatar}
                alt="avatar"
                className="w-8 h-8 rounded-full bg-zinc-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                {currentAccount.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-zinc-200 text-sm font-medium truncate">
                {currentAccount.name}
              </p>
              <p className="text-zinc-500 text-xs truncate">{currentAccount.email}</p>
            </div>
            {showAccountMenu ? (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            )}
          </button>

          {/* Account Dropdown */}
          {showAccountMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden shadow-xl">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => {
                    onSwitchAccount(account.id);
                    setShowAccountMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700 transition-colors"
                >
                  {account.avatar ? (
                    <img
                      src={account.avatar}
                      alt="avatar"
                      className="w-6 h-6 rounded-full bg-zinc-600"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                      {account.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-zinc-200 text-sm truncate">{account.name}</p>
                    <p className="text-zinc-500 text-xs truncate">{account.email}</p>
                  </div>
                  {account.email === currentAccount.email && (
                    <Check className="w-4 h-4 text-blue-500" />
                  )}
                </button>
              ))}
              <div className="border-t border-zinc-700 p-2">
                <button
                  onClick={() => {
                    setShowAccountMenu(false);
                    onAddAccount();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 text-blue-500 hover:text-blue-400 text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
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
