import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './components/Sidebar';
import { MailList } from './components/MailList';
import { MailDetail } from './components/MailDetail';
import { ComposeDialog } from './components/ComposeDialog';
import { SettingsModal } from './components/SettingsModal';
import { AddAccountDialog, AddAccountDialogHandle } from './components/AddAccountDialog';
import { ToastContainer, ToastData } from './components/Toast';
import { mockEmails, MockEmail } from './data/mockData';
import type { CreateAccountInput } from './types';
import './i18n';

// ─── Random new email pool for sync simulation ───
const SYNC_NEW_EMAILS: Omit<MockEmail, 'accountId'>[] = [
  {
    id: `sync-${Date.now()}-1`,
    from: { name: '系统通知', email: 'system@notify.com', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=system' },
    to: ['me@example.com'],
    subject: '您的账号安全提醒',
    snippet: '我们检测到您的账号在新设备上登录，如非本人操作请立即修改密码...',
    body: '您的账号安全提醒...\n\n我们检测到您的账号在新设备上登录。',
    date: new Date(),
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    folder: 'inbox',
    category: 'primary',
  },
  {
    id: `sync-${Date.now()}-2`,
    from: { name: '服务器监控', email: 'monitor@cloud.com' },
    to: ['me@example.com'],
    subject: '【监控告警】CPU 使用率超过 80%',
    snippet: '服务器 web-01 的 CPU 使用率已达到 82%，请及时处理...',
    body: '服务器监控告警：CPU 使用率超过阈值。',
    date: new Date(),
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    folder: 'inbox',
    category: 'primary',
  },
  {
    id: `sync-${Date.now()}-3`,
    from: { name: 'GitHub', email: 'noreply@github.com', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=github2' },
    to: ['me@example.com'],
    subject: '[GitHub] 您的 PR #42 已被合并',
    snippet: '您的 Pull Request #42 已被合并到 main 分支，感谢您的贡献...',
    body: 'PR #42 merged into main.',
    date: new Date(),
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    folder: 'inbox',
    category: 'primary',
  },
];

function App() {
  const { t, i18n } = useTranslation();
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [selectedEmail, setSelectedEmail] = useState<MockEmail | null>(null);
  const [activeTab, setActiveTab] = useState<'primary' | 'social' | 'promotions'>('primary');
  const [showCompose, setShowCompose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);

  const [appLanguage, setAppLanguage] = useState<'zh' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'ru'>('zh');
  const [aiTargetLanguage, setAiTargetLanguage] = useState('中文');

  // ─── Accounts state (dynamic — not hardcoded) ───
  const [accounts, setAccounts] = useState([
    { id: 1, email: 'me@example.com', name: '我的邮箱', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me' },
    { id: 2, email: 'work@company.com', name: '工作邮箱', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=work' },
  ]);
  const [currentAccount, setCurrentAccount] = useState(accounts[0]);

  const [inboxExpanded, setInboxExpanded] = useState(false);
  const [accountFilter, setAccountFilter] = useState<number | null>(null);

  // ─── Emails state (dynamic — not hardcoded) ───
  const [emails, setEmails] = useState<MockEmail[]>(
    mockEmails.map(email => ({ ...email, accountId: email.from.email.includes('work') ? 2 : 1 }))
  );

  const addAccountDialogRef = useRef<AddAccountDialogHandle>(null);
  const [replySuggestion, setReplySuggestion] = useState<string | null>(null);

  // ─── Multi-select state ───
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  // ─── Refresh / Loading state ───
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── Context menu state ───
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; emailId: string } | null>(null);

  // ─── Toast state ───
  const [toasts, setToasts] = useState<ToastData[]>([]);

  // Keep a ref to current emails so interval callback always has fresh state
  const emailsRef = useRef(emails);
  useEffect(() => { emailsRef.current = emails; }, [emails]);

  // ─── Add a new email to global state + show toast ───
  const addNewEmailToState = useCallback((email: Omit<MockEmail, 'accountId'>, accountId: number) => {
    const newEmail: MockEmail = { ...email, accountId };
    setEmails(prev => [newEmail, ...prev]);
    setToasts(prev => [...prev, {
      id: `toast-${Date.now()}`,
      title: email.subject,
      snippet: email.snippet.slice(0, 20) + '...',
      avatar: email.from.avatar,
      senderInitial: email.from.name.charAt(0),
      emailId: email.id,
    }]);
  }, []);

  // ─── Manual refresh: fetchMails — appends 1 random new email to existing state ───
  const fetchMails = useCallback(async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const template = SYNC_NEW_EMAILS[Math.floor(Math.random() * SYNC_NEW_EMAILS.length)];
    const freshEmail: Omit<MockEmail, 'accountId'> = {
      ...template,
      id: `sync-${Date.now()}`,
      date: new Date(),
    };
    // Assign to a random existing account
    const targetAccountId = accounts[Math.floor(Math.random() * accounts.length)]?.id ?? 1;
    addNewEmailToState(freshEmail, targetAccountId);
  }, [accounts, addNewEmailToState]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setSelectedIds([]);
    try {
      await fetchMails();
    } finally {
      setIsRefreshing(false);
    }
  };

  // ─── Auto-sync: poll every 60 seconds in background ───
  useEffect(() => {
    const interval = setInterval(async () => {
      // Simulate background sync: add a new email silently
      const template = SYNC_NEW_EMAILS[Math.floor(Math.random() * SYNC_NEW_EMAILS.length)];
      const newEmail: Omit<MockEmail, 'accountId'> = {
        ...template,
        id: `sync-${Date.now()}`,
        date: new Date(),
      };
      const targetAccountId = accounts[Math.floor(Math.random() * accounts.length)]?.id ?? 1;
      addNewEmailToState(newEmail, targetAccountId);
    }, 60000);

    return () => clearInterval(interval);
  }, [accounts, addNewEmailToState]);

  // ─── Auto-dismiss toasts after 5 seconds ───
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts(prev => prev.slice(1));
    }, 5000);
    return () => clearTimeout(timer);
  }, [toasts]);

  // ─── Multi-select handlers ───
  const handleSelectEmail = (email: MockEmail, event?: React.MouseEvent) => {
    const isCtrl = event?.ctrlKey || event?.metaKey;
    const isShift = event?.shiftKey;

    if (isShift && lastClickedId) {
      const sorted = [...getFilteredEmails()].sort((a, b) => b.date.getTime() - a.date.getTime());
      const lastIdx = sorted.findIndex(e => e.id === lastClickedId);
      const currentIdx = sorted.findIndex(e => e.id === email.id);
      if (lastIdx !== -1 && currentIdx !== -1) {
        const [start, end] = [Math.min(lastIdx, currentIdx), Math.max(lastIdx, currentIdx)];
        const rangeIds = sorted.slice(start, end + 1).map(e => e.id);
        setSelectedIds(prev => Array.from(new Set([...prev, ...rangeIds])));
      }
    } else if (isCtrl) {
      setSelectedIds(prev =>
        prev.includes(email.id) ? prev.filter(id => id !== email.id) : [...prev, email.id]
      );
    } else {
      setSelectedIds([email.id]);
      setSelectedEmail(email);
    }
    setLastClickedId(email.id);
  };

  const handleSelectAll = () => {
    const sorted = [...getFilteredEmails()].sort((a, b) => b.date.getTime() - a.date.getTime());
    const allIds = sorted.map(e => e.id);
    if (selectedIds.length === allIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allIds);
    }
  };

  // ─── Bulk operations ───
  const handleDeleteSelected = () => {
    setEmails(prev => prev.filter(email => !selectedIds.includes(email.id)));
    if (selectedEmail && selectedIds.includes(selectedEmail.id)) setSelectedEmail(null);
    setSelectedIds([]);
    setContextMenu(null);
  };

  const handleMarkReadSelected = (read: boolean) => {
    setEmails(prev => prev.map(email =>
      selectedIds.includes(email.id) ? { ...email, isRead: read } : email
    ));
    setContextMenu(null);
  };

  const handleToggleStarSelected = () => {
    setEmails(prev => prev.map(email =>
      selectedIds.includes(email.id) ? { ...email, isStarred: !email.isStarred } : email
    ));
    setContextMenu(null);
  };

  // ─── Context menu ───
  const handleContextMenu = (emailId: string, x: number, y: number) => {
    setContextMenu({ x, y, emailId });
  };

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => closeContextMenu();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // ─── Helpers ───
  const getFilteredEmails = (): MockEmail[] => {
    if (selectedFolder === 'inbox') {
      if (accountFilter !== null) return emails.filter(e => e.accountId === accountFilter);
      return emails;
    }
    return emails.filter(e => e.folder === selectedFolder);
  };

  useEffect(() => { i18n.changeLanguage(appLanguage); }, [appLanguage, i18n]);

  const folderEmails = getFilteredEmails();

  const handleSwitchAccount = (accountId: number) => {
    const acc = accounts.find(a => a.id === accountId);
    if (acc) setCurrentAccount(acc);
  };

  const handleDeleteAccount = (accountId: number) => {
    setAccounts(prev => prev.filter(a => a.id !== accountId));
    if (currentAccount.id === accountId) {
      const remaining = accounts.filter(a => a.id !== accountId);
      if (remaining.length > 0) setCurrentAccount(remaining[0]);
    }
  };

  const handleDeleteEmail = (emailId: string) => {
    setEmails(prev => prev.filter(e => e.id !== emailId));
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
    setSelectedIds(prev => prev.filter(id => id !== emailId));
  };

  const handleReplyWithSuggestion = (content: string) => {
    setReplySuggestion(content);
    setShowCompose(true);
  };

  const handleCloseCompose = () => {
    setShowCompose(false);
    setReplySuggestion(null);
  };

  const handleSaveAttempt = async (input: CreateAccountInput) => {
    const newAccount = {
      id: Date.now(),
      email: input.email,
      name: input.display_name || input.email.split('@')[0],
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${input.email.split('@')[0]}`,
    };
    setAccounts(prev => [...prev, newAccount]);
    setShowAddAccount(false);
    return { success: true };
  };

  // Toast click: navigate to the new email
  const handleToastClick = (emailId: string) => {
    const email = emails.find(e => e.id === emailId);
    if (email) {
      setSelectedEmail(email);
      setSelectedIds([emailId]);
    }
    setToasts(prev => prev.filter(t => t.emailId !== emailId));
  };

  const handleToastDismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const sortedForSelectAll = [...folderEmails].sort((a, b) => b.date.getTime() - a.date.getTime());
  const allVisibleIds = sortedForSelectAll.map(e => e.id);
  const isAllSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.includes(id));

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200">
      <Sidebar
        t={t}
        selectedFolder={selectedFolder}
        onSelectFolder={(folderId) => {
          setSelectedFolder(folderId);
          setInboxExpanded(false);
          setAccountFilter(null);
          setSelectedIds([]);
        }}
        onCompose={() => setShowCompose(true)}
        onSettings={() => setShowSettings(true)}
        currentAccount={currentAccount}
        accounts={accounts}
        onSwitchAccount={handleSwitchAccount}
        onAddAccount={() => setShowAddAccount(true)}
        inboxExpanded={inboxExpanded}
        onToggleInbox={() => setInboxExpanded(prev => !prev)}
        accountFilter={accountFilter}
        onAccountFilter={(accountId) => {
          setAccountFilter(accountId);
          setSelectedFolder('inbox');
          setInboxExpanded(false);
          setSelectedIds([]);
        }}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      <MailList
        t={t}
        emails={folderEmails}
        selectedEmailId={selectedEmail?.id || null}
        onSelectEmail={handleSelectEmail}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedIds={selectedIds}
        onSelectAll={handleSelectAll}
        isAllSelected={isAllSelected}
        onContextMenu={handleContextMenu}
        isLoading={isRefreshing}
      />

      <MailDetail
        t={t}
        email={selectedEmail}
        onReply={() => setShowCompose(true)}
        onForward={() => setShowCompose(true)}
        onDelete={() => { if (selectedEmail) handleDeleteEmail(selectedEmail.id); }}
        aiTargetLanguage={aiTargetLanguage}
        onReplyWithSuggestion={handleReplyWithSuggestion}
      />

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="fixed top-0 left-64 right-0 z-40 bg-zinc-900/95 backdrop-blur border-b border-zinc-700 px-4 py-2 flex items-center gap-3">
          <span className="text-sm text-zinc-400">{selectedIds.length} {t('selected')}</span>
          <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm transition-colors">
            删除
          </button>
          <button onClick={() => handleMarkReadSelected(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
            标为已读
          </button>
          <button onClick={() => handleMarkReadSelected(false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
            标为未读
          </button>
          <button onClick={handleToggleStarSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
            切换星标
          </button>
          <button onClick={() => setSelectedIds([])} className="ml-auto text-zinc-500 hover:text-zinc-300 text-sm">
            取消选择
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { handleDeleteSelected(); setSelectedIds([contextMenu.emailId]); }}
            className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 flex items-center gap-2"
          >
            🗑️ 删除
          </button>
          <button
            onClick={() => handleMarkReadSelected(true)}
            className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 flex items-center gap-2"
          >
            ✓ 标为已读
          </button>
          <button
            onClick={() => handleMarkReadSelected(false)}
            className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 flex items-center gap-2"
          >
            ○ 标为未读
          </button>
          <div className="border-t border-zinc-700 mt-1 pt-1" />
          <button
            onClick={() => {
              const email = emails.find(e => e.id === contextMenu.emailId);
              if (email) { setSelectedEmail(email); setSelectedIds([contextMenu.emailId]); }
              closeContextMenu();
            }}
            className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 flex items-center gap-2"
          >
            📧 查看详情
          </button>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer
        toasts={toasts}
        onDismiss={handleToastDismiss}
        onClick={handleToastClick}
      />

      <ComposeDialog
        t={t}
        isOpen={showCompose}
        onClose={handleCloseCompose}
        accounts={accounts}
        selectedAccount={currentAccount}
        onSend={async () => ({ success: true, message: '发送成功' })}
        initialTo={selectedEmail ? selectedEmail.from.email : ''}
        initialSubject={selectedEmail ? `Re: ${selectedEmail.subject}` : ''}
        initialBody={replySuggestion || ''}
        aiTargetLanguage={aiTargetLanguage}
      />

      <SettingsModal
        t={t}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        appLanguage={appLanguage}
        onAppLanguageChange={setAppLanguage}
        aiTargetLanguage={aiTargetLanguage}
        onAiTargetLanguageChange={setAiTargetLanguage}
        onAddAccount={() => { setShowSettings(false); setShowAddAccount(true); }}
        accounts={accounts}
        onDeleteAccount={handleDeleteAccount}
        currentAccountId={currentAccount.id}
      />

      <AddAccountDialog
        ref={addAccountDialogRef}
        t={t}
        isOpen={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onSaveAttempt={handleSaveAttempt}
        onTest={async () => ({ success: true, message: 'Test passed' })}
      />
    </div>
  );
}

export default App;
