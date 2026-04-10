import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './components/Sidebar';
import { MailList } from './components/MailList';
import { MailDetail } from './components/MailDetail';
import { ComposeDialog } from './components/ComposeDialog';
import { SettingsModal } from './components/SettingsModal';
import { AddAccountDialog, AddAccountDialogHandle } from './components/AddAccountDialog';
import { ToastContainer, ToastData } from './components/Toast';
import type { CreateAccountInput } from './types';
import { useAccounts } from './hooks/useAccounts';
import { useMail, RendererMailSummary } from './hooks/useMail';
import './i18n';

type ScanMode = 'light' | 'deep';
type LookbackRange = '3d' | '7d' | '1mo';

interface CurrentAccount {
  id: number;
  email: string;
  name: string;
  avatar?: string;
}

function lookbackToMs(range: LookbackRange): number {
  if (range === '3d') return 3 * 24 * 60 * 60 * 1000;
  if (range === '7d') return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

/** Find all emails in the same thread as `target`, sorted oldest-first.
 *  Uses In-Reply-To chains. Same-account only to avoid cross-account false matches. */
function findThreadSiblings(
  target: RendererMailSummary,
  allMails: RendererMailSummary[]
): RendererMailSummary[] {
  if (!target.messageId && !target.inReplyTo) return [];

  // Build a lookup by messageId (same account only)
  const byMsgId = new Map<string, RendererMailSummary>();
  for (const m of allMails) {
    if (m.accountId === target.accountId && m.messageId) {
      byMsgId.set(m.messageId, m);
    }
  }

  // Walk up the inReplyTo chain to collect all ancestor message-IDs
  const threadMsgIds = new Set<string>();
  function collectChain(mail: RendererMailSummary, depth = 0): void {
    if (depth > 50) return; // cycle guard
    if (mail.messageId) threadMsgIds.add(mail.messageId);
    if (mail.inReplyTo) {
      threadMsgIds.add(mail.inReplyTo);
      const parent = byMsgId.get(mail.inReplyTo);
      if (parent && !threadMsgIds.has(parent.messageId ?? '')) {
        collectChain(parent, depth + 1);
      }
    }
  }
  collectChain(target);

  // Any mail in the same account that shares a message-ID or replies to one in the chain
  return allMails.filter(m =>
    m.id !== target.id &&
    m.accountId === target.accountId &&
    (
      (m.messageId && threadMsgIds.has(m.messageId)) ||
      (m.inReplyTo && threadMsgIds.has(m.inReplyTo))
    )
  ).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function App() {
  const { t, i18n } = useTranslation();
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [selectedEmail, setSelectedEmail] = useState<RendererMailSummary | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Mobile panel view state: 'list' | 'detail'
  const [mobileView, setMobileView] = useState<'list' | 'detail'>(() =>
    selectedEmail ? 'detail' : 'list'
  );
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [appLanguage, setAppLanguage] = useState<'zh' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'ru'>('zh');
  const [aiTargetLanguage, setAiTargetLanguage] = useState('中文');

  // ─── AI Behavior Settings ───
  const [aiAutoSort, setAiAutoSort] = useState(false);
  const [aiScanMode, setAiScanMode] = useState<ScanMode>('light');
  const [aiLookback, setAiLookback] = useState<LookbackRange>('7d');

  // ─── Accounts ───
  const { accounts, fetchAccounts, createAccount, deleteAccount: deleteAccountApi } = useAccounts();
  const {
    isSyncing,
    syncMails,
    mailList,
    setMailList,
    currentMail,
    fetchMailDetail,
    mailLoadingState,
    mailError,
    clearCurrentMail,
    clearBodyCacheEntry,
  } = useMail();

  const [currentAccount, setCurrentAccount] = useState<CurrentAccount | 'all'>('all');

  // Debounce/pending-refresh guard
  const refreshPending = useRef(false);

  // Load AI settings on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await window.electronAPI.invoke('ai:getSettings') as {
          success: boolean;
          data?: { autoSort: boolean; scanMode: ScanMode; lookback: LookbackRange };
        };
        if (res.success && res.data) {
          setAiAutoSort(res.data.autoSort);
          setAiScanMode(res.data.scanMode);
          setAiLookback(res.data.lookback);
        }
      } catch (err) {
        console.error('[ai:getSettings]', err);
      }
    })();
  }, []);

  // Initial sync when accounts first become available
  useEffect(() => {
    if (accounts.length > 0) {
      console.log('[initialSync] accounts loaded:', accounts.length, 'currentAccount=', currentAccount);
      if (currentAccount === 'all') {
        // Serial sync — one account at a time to avoid IMAP/SQLite conflicts
        (async () => {
          for (const acc of accounts) {
            console.log('[initialSync] syncing account', acc.id, acc.email);
            await syncMails(acc.id, selectedFolder);
          }
        })();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  // ─── AI classifying lock ───
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const aiLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Reply suggestion ───
  const [replySuggestion, setReplySuggestion] = useState<string | null>(null);

  // ─── Multi-select ───
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [threadSiblings, setThreadSiblings] = useState<RendererMailSummary[]>([]);

  // ─── Context menu ───
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; emailId: string } | null>(null);

  // ─── Toast ───
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addAccountDialogRef = useRef<AddAccountDialogHandle>(null);

  // ─── Fetch mails — serial to avoid IMAP/SQLite conflicts ───
  const fetchMails = useCallback(async (): Promise<void> => {
    console.log('[fetchMails] currentAccount=', currentAccount, 'accounts=', accounts.length);
    if (currentAccount === 'all') {
      // Serial: await each account before starting the next
      for (const acc of accounts) {
        console.log('[fetchMails] syncing account', acc.id, acc.email);
        await syncMails(acc.id, selectedFolder);
      }
    } else {
      console.log('[fetchMails] syncing single account', currentAccount.id);
      await syncMails(currentAccount.id, selectedFolder);
    }
  }, [currentAccount, selectedFolder, accounts, syncMails]);

  const handleRefresh = async () => {
    console.log('[handleRefresh] isSyncing=', isSyncing, 'pending=', refreshPending.current);
    if (isSyncing) {
      refreshPending.current = true;
      console.log('[handleRefresh] busy, queued pending refresh');
      return;
    }
    setSelectedIds([]);
    refreshPending.current = false;
    await fetchMails();
    // If more clicks came in while syncing, sync once more
    if (refreshPending.current) {
      refreshPending.current = false;
      console.log('[handleRefresh] processing queued refresh');
      await fetchMails();
    }
  };

  // ─── Auto-dismiss toasts ───
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts(prev => prev.slice(1)), 5000);
    return () => clearTimeout(timer);
  }, [toasts]);

  // ─── Multi-select handlers ───
  // 纯查看：点击邮件 body → 只切换右侧详情，不影响 selectedIds
  const handleViewEmail = (email: RendererMailSummary) => {
    setSelectedEmail(email);
    fetchMailDetail(email.accountId, email.uid, email.folder);
    setThreadSiblings(findThreadSiblings(email, mailList));
    if (isMobile) setMobileView('detail');
  };

  // 纯勾选：点击 checkbox（左键无修饰）→ 只切换 selectedIds，不切换详情
  const handleToggleSelect = (email: RendererMailSummary) => {
    setSelectedIds(prev =>
      prev.includes(email.id) ? prev.filter(id => id !== email.id) : [...prev, email.id]
    );
    setLastClickedId(email.id);
  };

  // 复合选择：ctrl/shift + 点击 body 或 checkbox → 多选/范围选（保留查看行为）
  const handleSelectEmail = (email: RendererMailSummary, event?: React.MouseEvent) => {
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
      setSelectedEmail(email);
      fetchMailDetail(email.accountId, email.uid, email.folder);
      if (isMobile) setMobileView('detail');
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

  const handleBackToList = () => {
    setMobileView('list');
    if (isMobile) {
      setSelectedEmail(null);
      clearCurrentMail();
    }
  };

  // ─── Bulk operations ───
  const handleDeleteSelected = () => {
    setMailList(prev => prev.filter(email => !selectedIds.includes(email.id)));
    if (selectedEmail && selectedIds.includes(selectedEmail.id)) setSelectedEmail(null);
    setSelectedIds([]);
    setContextMenu(null);
  };

  const handleMarkReadSelected = (read: boolean) => {
    setMailList(prev => prev.map(email =>
      selectedIds.includes(email.id) ? { ...email, isRead: read } : email
    ));
    setContextMenu(null);
  };

  const handleToggleStarSelected = () => {
    setMailList(prev => prev.map(email =>
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

  // ─── Run batch AI classification ───
  const runBatchAnalysis = useCallback(async () => {
    if (isAiClassifying) return;
    if (mailList.length === 0) return;

    setIsAiClassifying(true);

    try {
      const aiConfig = await window.electronAPI.invoke('ai:getConfig') as {
        success: boolean; data?: { hasApiKey: boolean };
      };
      if (!aiConfig.success || !aiConfig.data?.hasApiKey) {
        setToasts(prev => [...prev, {
          id: Date.now().toString(), type: 'error',
          message: '请先在设置中配置 AI API Key',
        }]);
        return;
      }

      // Apply lookback filter — only classify unread mail within the time window
      const lookbackMs = lookbackToMs(aiLookback);
      const lookbackDate = Date.now() - lookbackMs;
      const eligible = mailList.filter(m => m.date.getTime() > lookbackDate && !m.isRead);

      if (eligible.length === 0) {
        const rangeLabel = aiLookback === '3d' ? '3 天' : aiLookback === '7d' ? '7 天' : '1 个月';
        setToasts(prev => [...prev, {
          id: Date.now().toString(), type: 'info',
          message: `没有在 ${rangeLabel}内需要分析的未读邮件`,
        }]);
        return;
      }

      // Respect scan mode batch size
      const maxBatch = aiScanMode === 'deep' ? 10 : 50;
      const toProcess = eligible.slice(0, maxBatch);

      setToasts(prev => [...prev, {
        id: Date.now().toString(), type: 'info',
        message: `正在分析 ${toProcess.length} 封邮件 (${aiScanMode === 'deep' ? '深度' : '轻度'}扫描)...`,
      }]);

      // Build payload matching ai:classifyBatch IPC contract
      const emailPayload = toProcess.map(m => ({
        id: m.id,
        subject: m.subject,
        from: m.from,
        from_name: m.fromName,
        has_attachment: m.hasAttachments,
        snippet: m.snippet,
      }));

      const response = await window.electronAPI.invoke('ai:classifyBatch', {
        emails: emailPayload,
        scanMode: aiScanMode,
      }) as {
        success: boolean;
        results?: Array<{ id: string; category: string }>;
        error?: string;
      };

      if (response.success && response.results && response.results.length > 0) {
        // Write classification results back into mailList
        const categoryMap = new Map(response.results.map(r => [r.id, r.category]));
        setMailList(prev =>
          prev.map(m => categoryMap.has(m.id) ? { ...m, category: categoryMap.get(m.id) } : m)
        );
        setToasts(prev => [...prev, {
          id: Date.now().toString(), type: 'success',
          message: `AI 分析完成：${response.results!.length} 封邮件已分类`,
        }]);
      } else {
        setToasts(prev => [...prev, {
          id: Date.now().toString(), type: 'error',
          message: response.error || 'AI 分析失败，请检查 API Key 和网络',
        }]);
      }
    } catch (err) {
      console.error('[runBatchAnalysis]', err);
      setToasts(prev => [...prev, {
        id: Date.now().toString(), type: 'error',
        message: 'AI 分析异常，请查看控制台',
      }]);
    } finally {
      if (aiLockTimer.current) clearTimeout(aiLockTimer.current);
      aiLockTimer.current = setTimeout(() => {
        setIsAiClassifying(false);
        aiLockTimer.current = null;
      }, 1000);
    }
  }, [isAiClassifying, mailList, aiLookback, aiScanMode]);

  // ─── Auto-analysis when mail list grows ───
  useEffect(() => {
    if (mailList.length === 0) return;
    if (isAiClassifying) return;
    if (!aiAutoSort) return;

    const timer = setTimeout(() => runBatchAnalysis(), 2000);
    return () => clearTimeout(timer);
  }, [mailList.length]);

  useEffect(() => {
    return () => { if (aiLockTimer.current) clearTimeout(aiLockTimer.current); };
  }, []);

  // ─── Helpers ───
  const AI_CATEGORY_IDS = ['工作/业务类', '账单/财务类', '社交/个人类', '广告/营销类', '安全/风险类', '通知类'];

  const getFilteredEmails = useCallback((): RendererMailSummary[] => {
    // ══════════════════════════════════════════════════
    // 🔍 诊断日志 — 排查完成后请删除此区块
    console.log('1. 全局邮件总数:', mailList.length);
    console.log('2. 当前选中的文件夹状态 (selectedFolder):', selectedFolder);
    console.log(
      '3. 提取第一封邮件的真实字段看大小写和命名:',
      mailList[0] ? { folder: mailList[0].folder, category: mailList[0].category } : '无数据'
    );
    if (mailList.length > 0) {
      console.log(
        '3b. 所有邮件的 folder 值 (去重):',
        [...new Set(mailList.map(m => m.folder))]
      );
    }
    // ══════════════════════════════════════════════════

    // AI category view: filter by the category field
    if (AI_CATEGORY_IDS.includes(selectedFolder)) {
      const result = mailList.filter(e => e.category === selectedFolder);
      console.log('4. 经过 getFilteredEmails 过滤后准备传给 MailList 的数量:', result.length);
      return result;
    }
    // Basic folder view: case-insensitive match on the folder field
    const needle = selectedFolder.toLowerCase();
    const result = mailList.filter(e => (e.folder ?? '').toLowerCase() === needle);
    console.log('4. 经过 getFilteredEmails 过滤后准备传给 MailList 的数量:', result.length);
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailList, selectedFolder]);

  useEffect(() => { i18n.changeLanguage(appLanguage); }, [appLanguage, i18n]);

  const folderEmails = getFilteredEmails();

  // ─── Account switching ───
  const handleSwitchAccount = (accountId: number) => {
    if (accountId === -1) {
      setCurrentAccount('all');
      setSelectedIds([]);
      setSelectedFolder('inbox');
      // Serial sync all accounts
      (async () => {
        for (const acc of accounts) {
          await syncMails(acc.id, selectedFolder);
        }
      })();
      return;
    }
    const acc = accounts.find(a => a.id === accountId);
    if (acc) {
      setCurrentAccount({
        id: acc.id,
        email: acc.email,
        name: acc.display_name || acc.email.split('@')[0],
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${acc.email.split('@')[0]}`,
      });
      setSelectedIds([]);
      setSelectedFolder('inbox');
      syncMails(acc.id, selectedFolder);
    }
  };

  const handleDeleteAccount = async (accountId: number) => {
    await deleteAccountApi(accountId);
    if (currentAccount !== 'all' && currentAccount.id === accountId) {
      const remaining = accounts.filter(a => a.id !== accountId);
      if (remaining.length > 0) {
        const nextAcc = remaining[0];
        setCurrentAccount({
          id: nextAcc.id,
          email: nextAcc.email,
          name: nextAcc.display_name || nextAcc.email.split('@')[0],
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${nextAcc.email.split('@')[0]}`,
        });
        syncMails(nextAcc.id, selectedFolder);
      } else {
        setCurrentAccount('all');
      }
    }
  };

  const handleDeleteEmail = (emailId: string) => {
    const target = mailList.find(e => e.id === emailId);
    if (target) clearBodyCacheEntry(target.accountId, target.uid);
    setMailList(prev => prev.filter(e => e.id !== emailId));
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(null);
      clearCurrentMail();
    }
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

  // ─── Screenshot share: saves PNG blob to disk via Electron IPC ───
  const handleShare = async (blob: Blob, _filename: string) => {
    try {
      const clipboardItem = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([clipboardItem]);
      setToasts(prev => [...prev, { id: Date.now().toString(), type: 'success', message: '长截图已复制，直接粘贴发送即可' }]);
    } catch (err) {
      console.error('[handleShare]', err);
      setToasts(prev => [...prev, { id: Date.now().toString(), type: 'error', message: '截图复制失败' }]);
    }
  };

  const handleSaveAttempt = async (input: CreateAccountInput) => {
    const result = await createAccount(input);
    if (result.success) {
      await fetchAccounts();
      setShowAddAccount(false);
    }
    return result;
  };

  const sortedForSelectAll = [...folderEmails].sort((a, b) => b.date.getTime() - a.date.getTime());
  const allVisibleIds = sortedForSelectAll.map(e => e.id);
  const isAllSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.includes(id));

  const isAllAccountsView = currentAccount === 'all';
  const listTitle = isAllAccountsView ? '所有账号' : (currentAccount && 'name' in currentAccount ? currentAccount.name : '');

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#0d0d0f' }}>
      {/* Sidebar — fixed 200px, never shrinks */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{ width: 200, display: isMobile ? 'none' : 'flex', flexDirection: 'column' }}
      >
        <Sidebar
          t={t}
          selectedFolder={selectedFolder}
          onSelectFolder={(folderId) => { setSelectedFolder(folderId); setSelectedIds([]); }}
          onCompose={() => setShowCompose(true)}
          onSettings={() => setShowSettings(true)}
          currentAccount={currentAccount}
          accounts={accounts.map(a => ({
            id: a.id,
            email: a.email,
            name: a.display_name || a.email.split('@')[0],
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${a.email.split('@')[0]}`,
          }))}
          onSwitchAccount={handleSwitchAccount}
          onAddAccount={() => setShowAddAccount(true)}
          onRefresh={handleRefresh}
          isRefreshing={isSyncing}
          isAiClassifying={isAiClassifying}
          onAnalysisDone={runBatchAnalysis}
        />
      </div>

      {/* MailList — fixed 320px, never shrinks; hidden on mobile when in detail view */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{ width: 320, display: isMobile ? (mobileView === 'list' ? 'flex' : 'none') : 'flex', flexDirection: 'column' }}
      >
        <MailList
          t={t}
          emails={folderEmails}
          selectedEmailId={selectedEmail?.id || null}
          onSelectEmail={handleSelectEmail}
          onViewEmail={handleViewEmail}
          onToggleSelect={handleToggleSelect}
          selectedIds={selectedIds}
          onSelectAll={handleSelectAll}
          isAllSelected={isAllSelected}
          onContextMenu={handleContextMenu}
          isLoading={isSyncing}
          listTitle={listTitle}
        />
      </div>

      {/* MailDetail — flex-1, takes all remaining space; min-w-0 prevents shrink */}
      <div className="flex-1 min-w-0 flex-shrink-0 overflow-hidden">
        <MailDetail
          t={t}
          email={currentMail ?? selectedEmail}
          onReply={() => setShowCompose(true)}
          onForward={() => setShowCompose(true)}
          onDelete={() => { if (selectedEmail) handleDeleteEmail(selectedEmail.id); }}
          onBack={handleBackToList}
          onShare={handleShare}
          aiTargetLanguage={aiTargetLanguage}
          onReplyWithSuggestion={handleReplyWithSuggestion}
          mailLoadingState={mailLoadingState}
          mailError={mailError}
          onRetry={() => selectedEmail && fetchMailDetail(selectedEmail.accountId, selectedEmail.uid, selectedEmail.folder)}
          threadSiblings={threadSiblings}
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => { handleDeleteSelected(); setSelectedIds([contextMenu.emailId]); }} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 flex items-center gap-2">🗑️ 删除</button>
          <button onClick={() => handleMarkReadSelected(true)} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 flex items-center gap-2">✓ 标为已读</button>
          <button onClick={() => handleMarkReadSelected(false)} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 flex items-center gap-2">○ 标为未读</button>
          <div className="border-t border-zinc-700 mt-1 pt-1" />
          <button onClick={() => { const email = mailList.find(e => e.id === contextMenu.emailId); if (email) { setSelectedEmail(email); setSelectedIds([contextMenu.emailId]); } closeContextMenu(); }} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 flex items-center gap-2">📧 查看详情</button>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={() => {}} onClick={() => {}} />

      <ComposeDialog
        t={t}
        isOpen={showCompose}
        onClose={handleCloseCompose}
        accounts={accounts.map(a => ({ id: a.id, email: a.email, name: a.display_name || a.email.split('@')[0], avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${a.email.split('@')[0]}` }))}
        selectedAccount={typeof currentAccount === 'string' ? null : currentAccount}
        onSend={async () => ({ success: true, message: '发送成功' })}
        initialTo={selectedEmail ? selectedEmail.from : ''}
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
        accounts={accounts.map(a => ({ id: a.id, email: a.email, name: a.display_name || a.email.split('@')[0], avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${a.email.split('@')[0]}` }))}
        onDeleteAccount={handleDeleteAccount}
        currentAccountId={typeof currentAccount === 'string' ? 0 : (currentAccount?.id ?? 0)}
        aiAutoSort={aiAutoSort}
        onAiAutoSortChange={setAiAutoSort}
        aiScanMode={aiScanMode}
        onAiScanModeChange={setAiScanMode}
        aiLookback={aiLookback}
        onAiLookbackChange={setAiLookback}
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
