import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useMail, RendererMailDetail, RendererMailSummary } from './hooks/useMail';
import {
  buildSenderConversationRows,
  filterUnreadConversationRows,
  findSenderConversationMails,
  formatQuotedOriginalBody,
  getConversationCounterparty,
  getConversationKey,
  isLocalSenderMail,
} from './utils/mailConversations';
import { applyMailReadState, resolveDeleteMailAction } from './utils/mailFolderActions';
import { resolveDisplayedMail } from './utils/mailSelection';
import { resolveComposeSelectedAccount } from './utils/composeAccount';
import { buildThreadMailUniverse, getVisibleFolderEmails } from './utils/mailThreading';
import {
  AppLanguage,
  GenericFolderId,
  folderMatches,
  getAiLanguageFromAppLanguage,
  resolveFolderPath,
} from '../shared/mailFolders';
import type { MailHistoryRange } from '../shared/mailSyncSettings';
import type { MailBackupProgress, MailBackupResult, MailExportRequest } from '../shared/backup';
import {
  MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY,
  MAIL_FETCH_HISTORY_RANGE_SETTING_KEY,
  normalizeMailSettingsSnapshot,
} from './utils/mailSettings';
import {
  canStartBackupExport,
  createInitialBackupState,
  type BackupUiState,
} from './utils/mailBackupUi';
import './i18n';

type ScanMode = 'light' | 'deep';
type LookbackRange = '3d' | '7d' | '1mo';
type StandardFolderId = Exclude<GenericFolderId, 'other'>;

interface CurrentAccount {
  id: number;
  email: string;
  name: string;
  avatar?: string;
}

interface MailFolderInfo {
  name: string;
  path: string;
  delimiter: string;
  flags: string[];
}

interface ComposeContext {
  mode: 'new' | 'reply' | 'forward';
  source: RendererMailSummary | RendererMailDetail | null;
}

const STANDARD_FOLDERS: StandardFolderId[] = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam'];
const PRIMARY_VIEW_FOLDERS: StandardFolderId[] = ['inbox', 'sent', 'drafts'];
const AI_CATEGORY_IDS = [
  '工作/业务类',
  '账单/财务类',
  '社交/个人类',
  '广告/营销类',
  '安全/风险类',
  '通知类',
] as const;

function lookbackToMs(range: LookbackRange): number {
  if (range === '3d') return 3 * 24 * 60 * 60 * 1000;
  if (range === '7d') return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

function isStandardFolder(folder: string): folder is StandardFolderId {
  return STANDARD_FOLDERS.includes(folder as StandardFolderId);
}

function getSyncFoldersForView(folder: string): StandardFolderId[] {
  if (folder === 'inbox' || folder === 'sent' || folder === 'drafts' || folder === 'starred') {
    return PRIMARY_VIEW_FOLDERS;
  }
  if (folder === 'unread') {
    return STANDARD_FOLDERS;
  }
  if (folder === 'archive') return ['archive'];
  if (folder === 'trash') return ['trash'];
  if (folder === 'spam') return ['spam'];
  return [];
}

function getAccountAvatar(email: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${email.split('@')[0]}`;
}

function getAppUi(appLanguage: AppLanguage) {
  if (appLanguage === 'ja') {
    return {
      shareSuccess: '長いスクリーンショットをコピーしました',
      shareFailed: 'このメールはスクリーンショットとしてコピーできません',
      aiNeedApiKey: '設定で AI API Key を先に設定してください',
      aiNoEligibleShort: '分類対象の未読メールがありません',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `${total} 件のメールを分析開始（${scanLabel}・${rangeLabel}）`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `${processed}/${total} 件を分析中（${scanLabel}）`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `AI 分析完了: 走査 ${total} 件 / 分類 ${classified} 件${failed > 0 ? ` / 未認識 ${failed} 件` : ''}${unclassified > 0 ? ` / 未分類 ${unclassified} 件` : ''}`,
      aiFailed: 'AI 分析に失敗しました',
      sendSuccess: '送信しました',
      sendFailedFallback: '送信に失敗しました',
      archiveSuccess: 'メールをアーカイブしました',
      archiveFailed: 'メールをアーカイブできませんでした',
      archiveAction: 'アーカイブ',
    };
  }

  if (appLanguage === 'en') {
    return {
      shareSuccess: 'Screenshot copied to clipboard',
      shareFailed: 'This email could not be copied as a screenshot',
      aiNeedApiKey: 'Please configure an AI API key in Settings first',
      aiNoEligibleShort: 'No unread uncategorized emails need analysis',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Started analyzing ${total} emails (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Analyzing ${processed}/${total} emails (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `AI analysis finished: scanned ${total}, categorized ${classified}${failed > 0 ? `, failed ${failed}` : ''}${unclassified > 0 ? `, uncategorized ${unclassified}` : ''}`,
      aiFailed: 'AI analysis failed',
      sendSuccess: 'Email sent',
      sendFailedFallback: 'Failed to send email',
      archiveSuccess: 'Email archived',
      archiveFailed: 'Failed to archive email',
      archiveAction: 'Archive',
    };
  }

  if (appLanguage === 'ko') {
    return {
      shareSuccess: '스크린샷이 클립보드에 복사되었습니다',
      shareFailed: '이 메일은 스크린샷으로 복사할 수 없습니다',
      aiNeedApiKey: '먼저 설정에서 AI API 키를 입력하세요',
      aiNoEligibleShort: '분석할 미분류 메일이 없습니다',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `${total}개의 메일 분석 시작 (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `${processed}/${total}개 메일 분석 중 (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `AI 분석 완료: 스캔 ${total}개 / 분류 ${classified}개${failed > 0 ? ` / 실패 ${failed}개` : ''}${unclassified > 0 ? ` / 미분류 ${unclassified}개` : ''}`,
      aiFailed: 'AI 분석에 실패했습니다',
      sendSuccess: '메일을 보냈습니다',
      sendFailedFallback: '메일 전송에 실패했습니다',
      archiveSuccess: '메일을 보관했습니다',
      archiveFailed: '메일 보관에 실패했습니다',
      archiveAction: '보관',
    };
  }

  if (appLanguage === 'es') {
    return {
      shareSuccess: 'La captura se copió al portapapeles',
      shareFailed: 'Este correo no se puede copiar como captura',
      aiNeedApiKey: 'Configura primero una clave API de IA en Ajustes',
      aiNoEligibleShort: 'No hay correos sin clasificar para analizar',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Análisis iniciado para ${total} correos (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Analizando ${processed}/${total} correos (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `Análisis IA completado: escaneados ${total}, clasificados ${classified}${failed > 0 ? `, fallidos ${failed}` : ''}${unclassified > 0 ? `, sin clasificar ${unclassified}` : ''}`,
      aiFailed: 'El análisis de IA falló',
      sendSuccess: 'Correo enviado',
      sendFailedFallback: 'No se pudo enviar el correo',
      archiveSuccess: 'Correo archivado',
      archiveFailed: 'No se pudo archivar el correo',
      archiveAction: 'Archivar',
    };
  }

  if (appLanguage === 'fr') {
    return {
      shareSuccess: 'Capture copiée dans le presse-papiers',
      shareFailed: 'Ce mail ne peut pas être copié en capture',
      aiNeedApiKey: 'Veuillez d’abord configurer une clé API IA dans les réglages',
      aiNoEligibleShort: 'Aucun mail non classé à analyser',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Analyse lancée pour ${total} mails (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Analyse de ${processed}/${total} mails (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `Analyse IA terminée : ${total} scannés, ${classified} classés${failed > 0 ? `, ${failed} échecs` : ''}${unclassified > 0 ? `, ${unclassified} non classés` : ''}`,
      aiFailed: 'Échec de l’analyse IA',
      sendSuccess: 'Mail envoyé',
      sendFailedFallback: 'Échec de l’envoi du mail',
      archiveSuccess: 'Mail archivé',
      archiveFailed: 'Échec de l’archivage du mail',
      archiveAction: 'Archiver',
    };
  }

  if (appLanguage === 'de') {
    return {
      shareSuccess: 'Screenshot in die Zwischenablage kopiert',
      shareFailed: 'Diese Mail konnte nicht als Screenshot kopiert werden',
      aiNeedApiKey: 'Bitte zuerst einen KI-API-Schlüssel in den Einstellungen hinterlegen',
      aiNoEligibleShort: 'Keine unklassifizierten Mails zur Analyse',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Analyse für ${total} Mails gestartet (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Analysiere ${processed}/${total} Mails (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `KI-Analyse fertig: ${total} gescannt, ${classified} klassifiziert${failed > 0 ? `, ${failed} fehlgeschlagen` : ''}${unclassified > 0 ? `, ${unclassified} unklassifiziert` : ''}`,
      aiFailed: 'KI-Analyse fehlgeschlagen',
      sendSuccess: 'Mail gesendet',
      sendFailedFallback: 'Mail konnte nicht gesendet werden',
      archiveSuccess: 'Mail archiviert',
      archiveFailed: 'Mail konnte nicht archiviert werden',
      archiveAction: 'Archivieren',
    };
  }

  if (appLanguage === 'ru') {
    return {
      shareSuccess: 'Снимок письма скопирован в буфер обмена',
      shareFailed: 'Это письмо не удалось скопировать как снимок',
      aiNeedApiKey: 'Сначала укажите API-ключ ИИ в настройках',
      aiNoEligibleShort: 'Нет писем без категории для анализа',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Запущен анализ ${total} писем (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Анализ ${processed}/${total} писем (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `Анализ ИИ завершён: проверено ${total}, классифицировано ${classified}${failed > 0 ? `, ошибок ${failed}` : ''}${unclassified > 0 ? `, без категории ${unclassified}` : ''}`,
      aiFailed: 'Ошибка анализа ИИ',
      sendSuccess: 'Письмо отправлено',
      sendFailedFallback: 'Не удалось отправить письмо',
      archiveSuccess: 'Письмо архивировано',
      archiveFailed: 'Не удалось архивировать письмо',
      archiveAction: 'Архивировать',
    };
  }

  return {
    shareSuccess: '长截图已复制，可直接粘贴发送',
    shareFailed: '该邮件无法截图复制',
    aiNeedApiKey: '请先在设置中配置 AI API Key',
    aiNoEligibleShort: '没有需要分析的未分类邮件',
    aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
      `开始分析 ${total} 封邮件（${scanLabel}，${rangeLabel}）`,
    aiProgress: (processed: number, total: number, scanLabel: string) =>
      `正在分析 ${processed}/${total} 封邮件（${scanLabel}）`,
    aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
      `AI 分析完成：已扫描 ${total} 封，已分类 ${classified} 封${failed > 0 ? `，未识别 ${failed} 封` : ''}${unclassified > 0 ? `，未分类 ${unclassified} 封` : ''}`,
    aiFailed: 'AI 分析异常，请稍后重试',
    sendSuccess: '发送成功',
    sendFailedFallback: '发送失败',
    archiveSuccess: '已归档邮件',
    archiveFailed: '归档失败',
    archiveAction: '归档',
  };
}

function App() {
  const { t, i18n } = useTranslation();
  const [selectedFolder, setSelectedFolder] = useState<string>('inbox');
  const [selectedEmail, setSelectedEmail] = useState<RendererMailSummary | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext>({ mode: 'new', source: null });
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [isMobile, setIsMobile] = useState(false);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('zh');
  const [aiAutoSort, setAiAutoSort] = useState(false);
  const [aiScanMode, setAiScanMode] = useState<ScanMode>('light');
  const [aiLookback, setAiLookback] = useState<LookbackRange>('7d');
  const [mailFetchHistoryRange, setMailFetchHistoryRange] = useState<MailHistoryRange>('1mo');
  const [autoFetchMinutes, setAutoFetchMinutes] = useState(0);
  const [isAutoAnalysisReady, setIsAutoAnalysisReady] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<CurrentAccount | 'all'>('all');
  const [replySuggestion, setReplySuggestion] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; emailId: string } | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [accountFoldersById, setAccountFoldersById] = useState<Record<number, MailFolderInfo[]>>({});
  const [isViewHydrating, setIsViewHydrating] = useState(false);
  const [localThreadMails, setLocalThreadMails] = useState<RendererMailSummary[]>([]);
  const [backupState, setBackupState] = useState<BackupUiState>(() => createInitialBackupState());

  const addAccountDialogRef = useRef<AddAccountDialogHandle>(null);
  const refreshPending = useRef(false);
  const initialHydrationDoneRef = useRef(false);
  const autoSyncedViewsRef = useRef(new Set<string>());
  const aiLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressToastId = useRef<string>('');
  const aiAutoSortRef = useRef(aiAutoSort);
  const aiLookbackRef = useRef(aiLookback);
  const isAiClassifyingRef = useRef(false);
  const runBatchAnalysisRef = useRef<(() => Promise<void>) | null>(null);
  const knownAutoAnalyzedIdsRef = useRef(new Set<string>());

  const {
    isSyncing,
    syncMails,
    mailList,
    setMailList,
    currentMail,
    setCurrentMail,
    fetchMailDetail,
    mailLoadingState,
    mailError,
    clearCurrentMail,
    clearBodyCacheEntry,
  } = useMail();

  const [isAiClassifying, setIsAiClassifying] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    aiAutoSortRef.current = aiAutoSort;
  }, [aiAutoSort]);

  useEffect(() => {
    aiLookbackRef.current = aiLookback;
  }, [aiLookback]);

  useEffect(() => {
    isAiClassifyingRef.current = isAiClassifying;
  }, [isAiClassifying]);

  const effectiveAiTargetLanguage = useMemo(
    () => getAiLanguageFromAppLanguage(appLanguage),
    [appLanguage]
  );

  const appUi = useMemo(() => getAppUi(appLanguage), [appLanguage]);

  useEffect(() => {
    void (async () => {
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
        const intervalRes = await window.electronAPI.invoke('settings:get', MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY) as {
          success: boolean;
          data?: string | null;
        };
        const historyRes = await window.electronAPI.invoke('settings:get', MAIL_FETCH_HISTORY_RANGE_SETTING_KEY) as {
          success: boolean;
          data?: string | null;
        };
        if (intervalRes.success || historyRes.success) {
          const snapshot = normalizeMailSettingsSnapshot({
            mailAutoFetchIntervalMinutes: intervalRes.success ? intervalRes.data ?? null : null,
            mailFetchHistoryRange: historyRes.success ? historyRes.data ?? null : null,
          });
          setAutoFetchMinutes(snapshot.mailAutoFetchIntervalMinutes);
          setMailFetchHistoryRange(snapshot.mailFetchHistoryRange);
        }
      } catch (err) {
        console.error('[ai:getSettings]', err);
      }
    })();
  }, []);

  const { accounts, fetchAccounts, createAccount, deleteAccount: deleteAccountApi } = useAccounts();

  const accountList = useMemo(
    () => accounts.map((account) => ({
      id: account.id,
      email: account.email,
      name: account.display_name || account.email.split('@')[0],
      avatar: getAccountAvatar(account.email),
    })),
    [accounts]
  );

  const scopedAccounts = useMemo(() => {
    if (currentAccount === 'all') return accounts;
    return accounts.filter((account) => account.id === currentAccount.id);
  }, [accounts, currentAccount]);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (accounts.length === 0) {
      setCurrentAccount('all');
      return;
    }

    setCurrentAccount((prev) => {
      if (prev === 'all') return prev;
      const stillExists = accounts.some((account) => account.id === prev.id);
      if (stillExists) return prev;
      return 'all';
    });
  }, [accounts]);

  useEffect(() => {
    setBackupState((prev) => {
      if (accounts.length === 0) {
        return { ...prev, selectedAccountId: null, selectedFolderPaths: [] };
      }

      if (prev.selectedAccountId && accounts.some((account) => account.id === prev.selectedAccountId)) {
        return prev;
      }

      return {
        ...prev,
        selectedAccountId: currentAccount !== 'all' ? currentAccount.id : accounts[0].id,
        selectedFolderPaths: [],
      };
    });
  }, [accounts, currentAccount]);

  useEffect(() => {
    if (accounts.length === 0) return;
    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(accounts.map(async (account) => {
        try {
          const res = await window.electronAPI.invoke('mail:getFolders', account.id) as {
            success: boolean;
            data?: MailFolderInfo[];
          };
          return [account.id, res.success && res.data ? res.data : []] as const;
        } catch (err) {
          console.error('[mail:getFolders]', account.id, err);
          return [account.id, []] as const;
        }
      }));

      if (cancelled) return;
      setAccountFoldersById(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [accounts]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBackupProgress((progress: MailBackupProgress) => {
      setBackupState((prev) => {
        if (prev.taskId && progress.taskId !== prev.taskId) {
          return prev;
        }

        return {
          ...prev,
          taskId: progress.taskId,
          isRunning: !progress.cancelled && progress.stage !== 'finalizing',
          progress,
        };
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (selectedFolder === 'sent' || selectedFolder === 'drafts') {
      setSelectedFolder('inbox');
    }
  }, [selectedFolder]);

  const replaceFolderEntries = useCallback((
    prev: RendererMailSummary[],
    accountId: number,
    genericFolder: StandardFolderId,
    nextMails: RendererMailSummary[]
  ) => {
    const others = prev.filter((mail) => !(mail.accountId === accountId && folderMatches(mail.folder, genericFolder)));
    return [...others, ...nextMails];
  }, []);

  const getResolvedFolderPath = useCallback((accountId: number, folder: StandardFolderId) => {
    return resolveFolderPath(accountFoldersById[accountId], folder);
  }, [accountFoldersById]);

  const loadCachedForCurrentView = useCallback(async () => {
    const foldersToLoad = getSyncFoldersForView(selectedFolder);
    if (foldersToLoad.length === 0 || scopedAccounts.length === 0) {
      setIsViewHydrating(false);
      if (!initialHydrationDoneRef.current) {
        initialHydrationDoneRef.current = true;
        setIsAutoAnalysisReady(true);
      }
      return 0;
    }

    setIsViewHydrating(true);
    let loadedCount = 0;

    for (const account of scopedAccounts) {
      for (const folder of foldersToLoad) {
        try {
          const folderPath = getResolvedFolderPath(account.id, folder);
          const res = await window.electronAPI.invoke('mail:loadCached', account.id, folderPath) as {
            success: boolean;
            data?: RendererMailSummary[];
          };
          const cached = res.success && res.data ? res.data : [];
          loadedCount += cached.length;
          setMailList((prev) => replaceFolderEntries(prev, account.id, folder, cached));
        } catch (err) {
          console.error('[mail:loadCached]', account.id, folder, err);
          setMailList((prev) => replaceFolderEntries(prev, account.id, folder, []));
        }
      }
    }

    setIsViewHydrating(false);

    if (!initialHydrationDoneRef.current) {
      initialHydrationDoneRef.current = true;
      setIsAutoAnalysisReady(true);
    }

    return loadedCount;
  }, [getResolvedFolderPath, replaceFolderEntries, scopedAccounts, selectedFolder, setMailList]);

  useEffect(() => {
    let active = true;
    const wasInitialHydration = !initialHydrationDoneRef.current;

    void (async () => {
      const loadedCount = await loadCachedForCurrentView();
      if (!active) return;

      if (
        !wasInitialHydration &&
        getSyncFoldersForView(selectedFolder).length > 0 &&
        loadedCount === 0 &&
        scopedAccounts.length > 0
      ) {
        const viewKey = `${currentAccount === 'all' ? 'all' : currentAccount.id}:${selectedFolder}`;
        if (!autoSyncedViewsRef.current.has(viewKey)) {
          autoSyncedViewsRef.current.add(viewKey);
          void (async () => {
            for (const account of scopedAccounts) {
              for (const folder of getSyncFoldersForView(selectedFolder)) {
                await syncMails(account.id, getResolvedFolderPath(account.id, folder), {
                  notify: folder === 'inbox',
                  folderKind: folder === 'inbox' ? 'inbox' : 'other',
                });
              }
            }
          })();
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [currentAccount, getResolvedFolderPath, loadCachedForCurrentView, scopedAccounts, selectedFolder, syncMails]);

  const folderUnreadCounts = useMemo(() => {
    const counts: Record<string, number> = {
      inbox: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      trash: 0,
      spam: 0,
    };

    for (const mail of mailList) {
      if (currentAccount !== 'all' && mail.accountId !== currentAccount.id) continue;
      if (!mail.isRead) {
        for (const folder of STANDARD_FOLDERS) {
          if (folderMatches(mail.folder, folder)) {
            counts[folder] += 1;
            break;
          }
        }
      }
    }

    return counts;
  }, [currentAccount, mailList]);

  const threadMailUniverse = useMemo(
    () => buildThreadMailUniverse(mailList, localThreadMails),
    [localThreadMails, mailList]
  );

  const scopedThreadMailUniverse = useMemo(() => {
    if (currentAccount === 'all') return threadMailUniverse;
    return threadMailUniverse.filter((mail) => mail.accountId === currentAccount.id);
  }, [currentAccount, threadMailUniverse]);

  const conversationAccountEmails = useMemo(() => {
    if (currentAccount === 'all') {
      return accounts.map((account) => account.email);
    }
    return [currentAccount.email];
  }, [accounts, currentAccount]);

  const unreadConversationCount = useMemo(() => {
    const unreadKeys = new Set<string>();
    for (const mail of scopedThreadMailUniverse) {
      if (!mail.isRead) unreadKeys.add(getConversationKey(mail, conversationAccountEmails));
    }
    return unreadKeys.size;
  }, [conversationAccountEmails, scopedThreadMailUniverse]);

  const getFilteredEmails = useCallback((): RendererMailSummary[] => {
    if (selectedFolder === 'unread') {
      return scopedThreadMailUniverse;
    }
    return getVisibleFolderEmails({
      selectedFolder,
      currentAccount,
      baseMails: mailList,
      localThreadMails,
      aiCategoryIds: AI_CATEGORY_IDS,
    });
  }, [currentAccount, localThreadMails, mailList, scopedThreadMailUniverse, selectedFolder]);

  const rawFolderEmails = useMemo(() => getFilteredEmails(), [getFilteredEmails]);
  const conversationRows = useMemo(
    () => buildSenderConversationRows(rawFolderEmails, conversationAccountEmails),
    [conversationAccountEmails, rawFolderEmails]
  );
  const folderEmails = useMemo(() => {
    if (selectedFolder !== 'unread') return conversationRows;
    return filterUnreadConversationRows(conversationRows, scopedThreadMailUniverse, conversationAccountEmails);
  }, [conversationAccountEmails, conversationRows, scopedThreadMailUniverse, selectedFolder]);

  useEffect(() => {
    i18n.changeLanguage(appLanguage);
  }, [appLanguage, i18n]);

  useEffect(() => {
    if (!selectedEmail) return;
    if (folderEmails.some((mail) => mail.id === selectedEmail.id)) return;
    const selectedKey = getConversationCounterparty(selectedEmail, conversationAccountEmails);
    const replacement = folderEmails.find((mail) =>
      mail.accountId === selectedEmail.accountId &&
      getConversationCounterparty(mail, conversationAccountEmails) === selectedKey
    );
    if (replacement) {
      setSelectedEmail(replacement);
      return;
    }
    setSelectedEmail(null);
    clearCurrentMail();
  }, [clearCurrentMail, conversationAccountEmails, folderEmails, selectedEmail]);

  const displayedMail = useMemo(
    () => resolveDisplayedMail(selectedEmail, currentMail),
    [currentMail, selectedEmail]
  );

  const selectedMailForThread = displayedMail as RendererMailSummary | null;

  const conversationMessages = useMemo(() => {
    if (!selectedMailForThread) return [];
    const siblings = findSenderConversationMails(selectedMailForThread, threadMailUniverse, conversationAccountEmails);
    return [selectedMailForThread, ...siblings]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .filter((mail, index, arr) => arr.findIndex((candidate) => candidate.id === mail.id) === index);
  }, [conversationAccountEmails, selectedMailForThread, threadMailUniverse]);

  useEffect(() => {
    setLocalThreadMails((prev) =>
      prev.filter((localMail) => !mailList.some((serverMail) =>
        serverMail.accountId === localMail.accountId &&
        (
          (localMail.messageId && serverMail.messageId === localMail.messageId) ||
          serverMail.id === localMail.id
        )
      ))
    );
  }, [mailList]);

  const fetchMails = useCallback(async (): Promise<void> => {
    const foldersToSync = getSyncFoldersForView(selectedFolder);
    if (foldersToSync.length === 0) return;

    if (currentAccount === 'all') {
      for (const account of accounts) {
        for (const folder of foldersToSync) {
          await syncMails(account.id, getResolvedFolderPath(account.id, folder), {
            notify: folder === 'inbox',
            folderKind: folder === 'inbox' ? 'inbox' : 'other',
          });
        }
      }
      return;
    }

    for (const folder of foldersToSync) {
      await syncMails(currentAccount.id, getResolvedFolderPath(currentAccount.id, folder), {
        notify: folder === 'inbox',
        folderKind: folder === 'inbox' ? 'inbox' : 'other',
      });
    }
  }, [accounts, currentAccount, getResolvedFolderPath, selectedFolder, syncMails]);

  const handleRefresh = async () => {
    if (isSyncing) {
      refreshPending.current = true;
      return;
    }

    setSelectedIds([]);
    refreshPending.current = false;
    await fetchMails();

    if (refreshPending.current) {
      refreshPending.current = false;
      await fetchMails();
    }
  };

  useEffect(() => {
    if (autoFetchMinutes <= 0) return;
    if (getSyncFoldersForView(selectedFolder).length === 0) return;
    if (!isAutoAnalysisReady) return;

    const timer = setInterval(() => {
      if (isSyncing || scopedAccounts.length === 0) return;
      void fetchMails();
    }, autoFetchMinutes * 60 * 1000);

    return () => clearInterval(timer);
  }, [autoFetchMinutes, fetchMails, isAutoAnalysisReady, isSyncing, scopedAccounts.length, selectedFolder]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(1)), 5000);
    return () => clearTimeout(timer);
  }, [toasts]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const handleViewEmail = (email: RendererMailSummary) => {
    setSelectedEmail(email);
    fetchMailDetail(email.accountId, email.uid, email.folder, email);
    if (isMobile) setMobileView('detail');
  };

  const handleToggleSelect = (email: RendererMailSummary) => {
    setSelectedIds((prev) =>
      prev.includes(email.id) ? prev.filter((id) => id !== email.id) : [...prev, email.id]
    );
    setLastClickedId(email.id);
  };

  const handleSelectEmail = (email: RendererMailSummary, event?: React.MouseEvent) => {
    const isCtrl = event?.ctrlKey || event?.metaKey;
    const isShift = event?.shiftKey;

    if (isShift && lastClickedId) {
      const sorted = [...folderEmails].sort((a, b) => b.date.getTime() - a.date.getTime());
      const lastIdx = sorted.findIndex((item) => item.id === lastClickedId);
      const currentIdx = sorted.findIndex((item) => item.id === email.id);
      if (lastIdx !== -1 && currentIdx !== -1) {
        const [start, end] = [Math.min(lastIdx, currentIdx), Math.max(lastIdx, currentIdx)];
        const rangeIds = sorted.slice(start, end + 1).map((item) => item.id);
        setSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
      }
    } else if (isCtrl) {
      setSelectedIds((prev) =>
        prev.includes(email.id) ? prev.filter((id) => id !== email.id) : [...prev, email.id]
      );
    } else {
      handleViewEmail(email);
    }

    setLastClickedId(email.id);
  };

  const handleSelectAll = () => {
    const sorted = [...folderEmails].sort((a, b) => b.date.getTime() - a.date.getTime());
    const allIds = sorted.map((mail) => mail.id);
    setSelectedIds((prev) => (prev.length === allIds.length ? [] : allIds));
  };

  const handleBackToList = () => {
    setMobileView('list');
    if (isMobile) {
      setSelectedEmail(null);
      clearCurrentMail();
    }
  };

  const handleDeleteSelected = async () => {
    const targets = mailList.filter((mail) => selectedIds.includes(mail.id));
    for (const mail of targets) {
      try {
        await handleDeleteForMail(mail);
      } catch (err) {
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'error',
          message: (err as Error).message || t('delete'),
        }]);
      }
    }
    setSelectedIds([]);
    setContextMenu(null);
  };

  const handleMarkReadSelected = async (read: boolean) => {
    const targetIds = new Set(selectedIds);
    const targets = mailList.filter((mail) => targetIds.has(mail.id));
    applyReadUpdateToState(targetIds, read);

    for (const mail of targets) {
      try {
        await persistReadChange(mail, read);
      } catch (err) {
        console.error('[markReadSelected]', err);
        applyReadUpdateToState(new Set([mail.id]), !read);
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'error',
          message: (err as Error).message || (read ? t('markAsRead') : t('markAsUnread')),
        }]);
      }
    }
    setContextMenu(null);
  };

  const persistStarChange = useCallback(async (mail: RendererMailSummary, nextStarred: boolean) => {
    try {
      if (mail.messageId?.startsWith('<local-') || isLocalSenderMail(mail, conversationAccountEmails)) {
        await window.electronAPI.invoke('mail:cacheLocal', {
          ...mail,
          isStarred: nextStarred,
          date: mail.date.toISOString(),
          cachedAt: new Date().toISOString(),
        });
        return;
      }
      await window.electronAPI.invoke('mail:setStarred', mail.accountId, mail.uid, nextStarred, mail.folder);
    } catch (err) {
      console.error('[mail:setStarred]', err);
    }
  }, [conversationAccountEmails]);

  const handleToggleStarForMail = useCallback(async (target: RendererMailSummary) => {
    const nextStarred = !target.isStarred;
    setMailList((prev) =>
      prev.map((mail) => (mail.id === target.id ? { ...mail, isStarred: nextStarred } : mail))
    );
    setLocalThreadMails((prev) =>
      prev.map((mail) => (mail.id === target.id ? { ...mail, isStarred: nextStarred } : mail))
    );
    if (currentMail && currentMail.id === target.id) {
      setCurrentMail({ ...currentMail, isStarred: nextStarred });
    }
    await persistStarChange(target, nextStarred);
  }, [currentMail, persistStarChange, setCurrentMail, setMailList]);

  const handleToggleStarSelected = async () => {
    const targets = mailList.filter((mail) => selectedIds.includes(mail.id));
    const updates = targets.map(async (mail) => {
      const nextStarred = !mail.isStarred;
      await persistStarChange(mail, nextStarred);
      return { id: mail.id, nextStarred };
    });
    const results = await Promise.all(updates);
    const nextMap = new Map(results.map((item) => [item.id, item.nextStarred]));
    setMailList((prev) =>
      prev.map((mail) => (nextMap.has(mail.id) ? { ...mail, isStarred: nextMap.get(mail.id)! } : mail))
    );
    if (currentMail && nextMap.has(currentMail.id)) {
      setCurrentMail({ ...currentMail, isStarred: nextMap.get(currentMail.id)! });
    }
    setContextMenu(null);
  };

  const handleArchiveSelected = async () => {
    const targets = mailList.filter((mail) => selectedIds.includes(mail.id));
    for (const mail of targets) {
      await handleArchiveForMail(mail);
    }
    setSelectedIds([]);
    setContextMenu(null);
  };

  const handleContextMenu = (emailId: string, x: number, y: number) => {
    setContextMenu({ x, y, emailId });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const getAutoAnalysisEligibleIds = useCallback((mails: RendererMailSummary[]): string[] => {
    const lookbackDate = Date.now() - lookbackToMs(aiLookbackRef.current);
    return mails
      .filter((mail) =>
        mail.date.getTime() > lookbackDate &&
        !mail.category &&
        !folderMatches(mail.folder, 'trash') &&
        !folderMatches(mail.folder, 'spam') &&
        !isLocalSenderMail(mail, conversationAccountEmails)
      )
      .map((mail) => mail.id);
  }, [conversationAccountEmails]);

  const runBatchAnalysis = useCallback(async () => {
    if (isAiClassifyingRef.current) return;
    if (mailList.length === 0) return;

    setIsAiClassifying(true);

    try {
      const aiConfig = await window.electronAPI.invoke('ai:getConfig') as {
        success: boolean;
        data?: { hasApiKey: boolean };
      };
      if (!aiConfig.success || !aiConfig.data?.hasApiKey) {
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'error',
          message: appUi.aiNeedApiKey,
        }]);
        return;
      }

      const lookbackMs = lookbackToMs(aiLookback);
      const lookbackDate = Date.now() - lookbackMs;
      const eligible = mailList.filter((mail) =>
        mail.date.getTime() > lookbackDate &&
        !mail.category &&
        !folderMatches(mail.folder, 'trash') &&
        !folderMatches(mail.folder, 'spam') &&
        !isLocalSenderMail(mail, conversationAccountEmails)
      );

      if (eligible.length === 0) {
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'info',
          message: appUi.aiNoEligibleShort,
        }]);
        return;
      }

      const rangeLabel = aiLookback === '3d' ? '3d' : aiLookback === '7d' ? '7d' : '1mo';
      const scanLabel = aiScanMode === 'deep' ? 'deep' : 'light';
      const batchSize = aiScanMode === 'deep' ? 10 : 50;
      const total = eligible.length;

      setToasts((prev) => [...prev, {
        id: (progressToastId.current = Date.now().toString()),
        type: 'info',
        message: appUi.aiStarted(total, scanLabel, rangeLabel),
      }]);

      const allResults: Array<{ id: string; category: string }> = [];
      const failedBatchIds: string[] = [];
      let processed = 0;

      for (let i = 0; i < eligible.length; i += batchSize) {
        const batch = eligible.slice(i, i + batchSize);

        if (aiScanMode === 'deep') {
          await Promise.all(batch.map(async (mail) => {
            try {
              const bodyResp = await window.electronAPI.invoke('mail:loadCachedBody', mail.accountId, mail.uid) as {
                success: boolean;
                data?: { bodyHtml?: string; bodyText?: string };
              };
              if (bodyResp.success && bodyResp.data) {
                (mail as RendererMailSummary & { _bodyText?: string; _bodyHtml?: string })._bodyText = bodyResp.data.bodyText;
                (mail as RendererMailSummary & { _bodyText?: string; _bodyHtml?: string })._bodyHtml = bodyResp.data.bodyHtml;
              }
            } catch {
            }
          }));
        }

        const emailPayload = batch.map((mail) => ({
          id: mail.id,
          subject: mail.subject,
          from: mail.from,
          from_name: mail.fromName,
          has_attachment: mail.hasAttachments,
          body_text: aiScanMode === 'deep'
            ? ((mail as RendererMailSummary & { _bodyText?: string; _bodyHtml?: string })._bodyText ||
              (mail as RendererMailSummary & { _bodyText?: string; _bodyHtml?: string })._bodyHtml ||
              mail.snippet ||
              '')
            : undefined,
          snippet: mail.snippet,
        }));

        const response = await window.electronAPI.invoke('ai:classifyBatch', {
          emails: emailPayload,
          scanMode: aiScanMode,
        }) as {
          success: boolean;
          results?: Array<{ id: string; category: string }>;
          failedIds?: string[];
        };

        if (response.success && response.results) {
          allResults.push(...response.results);
          if (response.failedIds?.length) {
            failedBatchIds.push(...response.failedIds);
          }
        } else {
          failedBatchIds.push(...batch.map((mail) => mail.id));
        }

        processed += batch.length;
        setToasts((prev) =>
          prev.map((toast) =>
            toast.id === progressToastId.current
              ? { ...toast, message: appUi.aiProgress(processed, total, scanLabel) }
              : toast
          )
        );

        if (i + batchSize < total) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      if (allResults.length > 0) {
        const categoryMap = new Map(allResults.map((result) => [result.id, result.category]));
        setMailList((prev) =>
          prev.map((mail) => (categoryMap.has(mail.id) ? { ...mail, category: categoryMap.get(mail.id) } : mail))
        );
        if (currentMail && categoryMap.has(currentMail.id)) {
          setCurrentMail({ ...currentMail, category: categoryMap.get(currentMail.id) });
        }
        const categoryUpdates = eligible
          .filter((mail) => categoryMap.has(mail.id))
          .map((mail) => ({
            accountId: mail.accountId,
            uid: mail.uid,
            folder: mail.folder,
            category: categoryMap.get(mail.id)!,
          }));
        if (categoryUpdates.length > 0) {
          await window.electronAPI.invoke('mail:updateCategories', categoryUpdates);
        }
      }

      const classifiedIds = new Set(allResults.map((result) => result.id));
      const uniqueFailedIds = Array.from(new Set(failedBatchIds.filter((id) => !classifiedIds.has(id))));
      const unclassifiedCount = eligible.filter((mail) => !classifiedIds.has(mail.id)).length;

      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'success',
        message: appUi.aiFinished(total, classifiedIds.size, uniqueFailedIds.length, unclassifiedCount),
      }]);
    } catch (err) {
      console.error('[runBatchAnalysis]', err);
      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'error',
        message: appUi.aiFailed,
      }]);
    } finally {
      if (aiLockTimer.current) clearTimeout(aiLockTimer.current);
      aiLockTimer.current = setTimeout(() => {
        setIsAiClassifying(false);
        aiLockTimer.current = null;
      }, 1000);
    }
  }, [aiLookback, aiScanMode, appUi, currentMail, mailList, setCurrentMail, setMailList]);

  useEffect(() => {
    runBatchAnalysisRef.current = runBatchAnalysis;
  }, [runBatchAnalysis]);

  useEffect(() => {
    const eligibleIds = getAutoAnalysisEligibleIds(mailList);

    if (!isAutoAnalysisReady || !aiAutoSortRef.current) {
      knownAutoAnalyzedIdsRef.current = new Set(eligibleIds);
      return;
    }

    const newEligibleIds = eligibleIds.filter((id) => !knownAutoAnalyzedIdsRef.current.has(id));
    if (newEligibleIds.length === 0 || isAiClassifyingRef.current) return;

    newEligibleIds.forEach((id) => knownAutoAnalyzedIdsRef.current.add(id));

    const timer = setTimeout(() => {
      if (!aiAutoSortRef.current || isAiClassifyingRef.current) return;
      if (getAutoAnalysisEligibleIds(mailList).length === 0) return;
      void runBatchAnalysisRef.current?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, [getAutoAnalysisEligibleIds, isAutoAnalysisReady, mailList]);

  useEffect(() => {
    return () => {
      if (aiLockTimer.current) clearTimeout(aiLockTimer.current);
    };
  }, []);

  const handleSwitchAccount = (accountId: number) => {
    setSelectedIds([]);
    setSelectedEmail(null);
    clearCurrentMail();
    setSelectedFolder('inbox');

    if (accountId === -1) {
      setCurrentAccount('all');
      return;
    }

    const nextAccount = accounts.find((account) => account.id === accountId);
    if (!nextAccount) return;

    setCurrentAccount({
      id: nextAccount.id,
      email: nextAccount.email,
      name: nextAccount.display_name || nextAccount.email.split('@')[0],
      avatar: getAccountAvatar(nextAccount.email),
    });
  };

  const handleDeleteAccount = async (accountId: number) => {
    await deleteAccountApi(accountId);
    if (currentAccount !== 'all' && currentAccount.id === accountId) {
      setCurrentAccount('all');
      setSelectedEmail(null);
      clearCurrentMail();
      setSelectedFolder('inbox');
    }
  };

  const removeMailFromState = useCallback((mailId: string) => {
    setMailList((prev) => prev.filter((mail) => mail.id !== mailId));
    setLocalThreadMails((prev) => prev.filter((mail) => mail.id !== mailId));
    if (selectedEmail?.id === mailId) {
      setSelectedEmail(null);
      clearCurrentMail();
    }
    setSelectedIds((prev) => prev.filter((id) => id !== mailId));
  }, [clearCurrentMail, selectedEmail?.id, setMailList]);

  const applyFolderUpdateToState = useCallback((mailId: string, nextFolder: string) => {
    setMailList((prev) => prev.map((mail) => (mail.id === mailId ? { ...mail, folder: nextFolder } : mail)));
    setLocalThreadMails((prev) => prev.map((mail) => (mail.id === mailId ? { ...mail, folder: nextFolder } : mail)));
    setCurrentMail((prev) => (prev && prev.id === mailId ? { ...prev, folder: nextFolder } : prev));
    setSelectedEmail((prev) => (prev && prev.id === mailId ? { ...prev, folder: nextFolder } : prev));
  }, [setCurrentMail, setMailList]);

  const applyReadUpdateToState = useCallback((targetIds: Set<string>, read: boolean) => {
    setMailList((prev) => applyMailReadState(prev, targetIds, read));
    setLocalThreadMails((prev) => applyMailReadState(prev, targetIds, read));
    setCurrentMail((prev) => (prev && targetIds.has(prev.id) ? { ...prev, isRead: read } : prev));
    setSelectedEmail((prev) => (prev && targetIds.has(prev.id) ? { ...prev, isRead: read } : prev));
  }, [setCurrentMail, setMailList]);

  const persistReadChange = useCallback(async (mail: RendererMailSummary, read: boolean) => {
    await window.electronAPI.invoke('mail:cacheLocal', {
      ...mail,
      isRead: read,
      date: mail.date.toISOString(),
      cachedAt: new Date().toISOString(),
    });

    if (mail.localDraftKey || mail.messageId?.startsWith('<local-')) {
      return;
    }

    const result = await window.electronAPI.invoke('mail:setRead', mail.accountId, mail.uid, read, mail.folder) as {
      success: boolean;
      error?: string;
    };
    if (!result.success) {
      throw new Error(result.error || `Failed to mark mail as ${read ? 'read' : 'unread'}`);
    }
  }, []);

  const handleDeleteForMail = useCallback(async (target: RendererMailSummary) => {
    const trashFolderPath = getResolvedFolderPath(target.accountId, 'trash');
    const action = resolveDeleteMailAction(target, trashFolderPath);

    if (action.type === 'move') {
      const previousFolder = target.folder;
      const optimisticMail = { ...target, folder: action.toFolder };
      applyFolderUpdateToState(target.id, action.toFolder);

      try {
        await window.electronAPI.invoke('mail:cacheLocal', {
          ...optimisticMail,
          date: optimisticMail.date.toISOString(),
          cachedAt: new Date().toISOString(),
        });

        if (!(target.localDraftKey || target.messageId?.startsWith('<local-'))) {
          const result = await window.electronAPI.invoke('mail:move', target.accountId, target.uid, previousFolder, action.toFolder) as {
            success: boolean;
            error?: string;
          };
          if (!result.success) {
            throw new Error(result.error || t('delete'));
          }
        }

        clearBodyCacheEntry(target.accountId, target.uid);
        return;
      } catch (err) {
        console.error('[mail:move trash]', err);
        applyFolderUpdateToState(target.id, previousFolder);
        await window.electronAPI.invoke('mail:cacheLocal', {
          ...target,
          date: target.date.toISOString(),
          cachedAt: new Date().toISOString(),
        });
        throw err;
      }
    }

    removeMailFromState(target.id);
    clearBodyCacheEntry(target.accountId, target.uid);

    try {
      if (target.localDraftKey || target.messageId?.startsWith('<local-')) {
        await window.electronAPI.invoke('mail:deleteCachedById', target.id);
        return;
      }

      const result = await window.electronAPI.invoke('mail:delete', target.accountId, target.uid, target.folder) as {
        success: boolean;
        error?: string;
      };
      if (!result.success) {
        throw new Error(result.error || t('delete'));
      }
    } catch (err) {
      console.error('[mail:delete]', err);
      setMailList((prev) => [target, ...prev.filter((mail) => mail.id !== target.id)]);
      setLocalThreadMails((prev) => [target, ...prev.filter((mail) => mail.id !== target.id)]);
      setSelectedEmail((prev) => prev ?? target);
      setCurrentMail((prev) => prev ?? (currentMail && currentMail.id === target.id ? currentMail : null));
      throw err;
    }
  }, [applyFolderUpdateToState, clearBodyCacheEntry, currentMail, getResolvedFolderPath, removeMailFromState, setCurrentMail, setMailList, t]);

  const handleArchiveForMail = useCallback(async (target: RendererMailSummary) => {
    if (folderMatches(target.folder, 'archive')) return;

    const archiveFolderPath = getResolvedFolderPath(target.accountId, 'archive');
    const previousFolder = target.folder;
    const optimisticMail = { ...target, folder: archiveFolderPath };
    const isLocalOnlyMail = Boolean(target.localDraftKey) || target.messageId?.startsWith('<local-');

    applyFolderUpdateToState(target.id, archiveFolderPath);

    try {
      await window.electronAPI.invoke('mail:cacheLocal', {
        ...optimisticMail,
        date: optimisticMail.date.toISOString(),
        cachedAt: new Date().toISOString(),
      });

      if (!isLocalOnlyMail) {
        const result = await window.electronAPI.invoke('mail:move', target.accountId, target.uid, previousFolder, archiveFolderPath) as {
          success: boolean;
          error?: string;
        };
        if (!result.success) {
          throw new Error(result.error || appUi.archiveFailed);
        }
      }

      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'success',
        message: appUi.archiveSuccess,
      }]);

      void (async () => {
        try {
          await syncMails(target.accountId, previousFolder, { notify: false, folderKind: 'other' });
          await syncMails(target.accountId, archiveFolderPath, { notify: false, folderKind: 'other' });
        } catch (err) {
          console.error('[mail:archive sync]', err);
        }
      })();
    } catch (err) {
      console.error('[mail:archive]', err);
      applyFolderUpdateToState(target.id, previousFolder);
      try {
        await window.electronAPI.invoke('mail:cacheLocal', {
          ...target,
          date: target.date.toISOString(),
          cachedAt: new Date().toISOString(),
        });
      } catch (cacheErr) {
        console.error('[mail:archive revert cacheLocal]', cacheErr);
      }
      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'error',
        message: (err as Error).message || appUi.archiveFailed,
      }]);
    }
  }, [appUi.archiveFailed, appUi.archiveSuccess, applyFolderUpdateToState, getResolvedFolderPath, syncMails]);

  const openCompose = useCallback((mode: ComposeContext['mode'], source?: RendererMailSummary | RendererMailDetail | null) => {
    setComposeContext({ mode, source: source ?? selectedMailForThread });
    setShowCompose(true);
  }, [selectedMailForThread]);

  const handleReplyWithSuggestion = (content: string) => {
    setReplySuggestion(content);
    openCompose('reply', selectedMailForThread);
  };

  const handleCloseCompose = () => {
    setShowCompose(false);
    setReplySuggestion(null);
    setComposeContext({ mode: 'new', source: null });
  };

  const handleShare = async (blob: Blob) => {
    try {
      const clipboardItem = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([clipboardItem]);
      setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'success', message: appUi.shareSuccess }]);
    } catch (err) {
      console.error('[handleShare]', err);
      setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'error', message: appUi.shareFailed }]);
    }
  };

  const handleSendMail = async (options: {
    accountId: number;
    to: string[];
    subject: string;
    body: string;
    draftKey: string;
  }): Promise<{ success: boolean; message: string }> => {
    const account = accounts.find((item) => item.id === options.accountId);
    if (!account) {
      const message = appUi.sendFailedFallback;
      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'error',
        message,
      }]);
      return { success: false, message };
    }

    const source = composeContext.source;
    const sentFolderPath = getResolvedFolderPath(options.accountId, 'sent');
    const localMessageId = `<local-${Date.now()}-${Math.random().toString(36).slice(2)}@minimail>`;
    const localMailId = `${options.accountId}:${localMessageId}`;
    const references = [source?.references, source?.messageId].filter(Boolean).join(' ').trim() || undefined;

    const optimisticMail: RendererMailSummary = {
      id: localMailId,
      uid: Date.now(),
      from: account.email,
      fromName: account.display_name || account.email.split('@')[0],
      to: options.to.join(', '),
      subject: options.subject,
      date: new Date(),
      snippet: options.body.trim().slice(0, 160),
      hasAttachments: false,
      isRead: true,
      isStarred: false,
      folder: sentFolderPath,
      accountId: options.accountId,
      messageId: localMessageId,
      inReplyTo: composeContext.mode === 'reply' ? source?.messageId : undefined,
      references,
      deliveryState: 'sending',
      localDraftKey: options.draftKey,
    };

    setLocalThreadMails((prev) => {
      const filtered = prev.filter((mail) => mail.localDraftKey !== options.draftKey && mail.id !== localMailId);
      return [optimisticMail, ...filtered];
    });

    setMailList((prev) => prev.filter((mail) => mail.localDraftKey !== options.draftKey));

    const result = await window.electronAPI.invoke('mail:send', options.accountId, {
      to: options.to,
      subject: options.subject,
      body: options.body,
      isHtml: false,
    }) as { success: boolean; message: string; messageId?: string };

    if (!result.success) {
      const failureMessage = result.message || appUi.sendFailedFallback;
      setLocalThreadMails((prev) =>
        prev.map((mail) => mail.id === localMailId ? { ...mail, deliveryState: 'failed', deliveryError: failureMessage } : mail)
      );
      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'error',
        message: failureMessage,
      }]);
      return { success: false, message: failureMessage };
    }

    const deliveredMail: RendererMailSummary = {
      ...optimisticMail,
      messageId: result.messageId || localMessageId,
      deliveryState: 'sent',
      deliveryError: undefined,
    };

    setLocalThreadMails((prev) =>
      prev.map((mail) => mail.id === localMailId ? deliveredMail : mail)
    );

    const draftId = `${options.accountId}:${options.draftKey}`;
    setMailList((prev) => prev.filter((mail) => mail.id !== draftId));
    setLocalThreadMails((prev) => prev.filter((mail) => mail.id !== draftId));

    setToasts((prev) => [...prev, {
      id: Date.now().toString(),
      type: 'success',
      message: appUi.sendSuccess,
    }]);

    void (async () => {
      try {
        await window.electronAPI.invoke('mail:cacheLocal', {
          ...deliveredMail,
          date: deliveredMail.date.toISOString(),
          cachedAt: new Date().toISOString(),
          bodyText: options.body,
        });
      } catch (err) {
        console.error('[mail:cacheLocal deliveredMail]', err);
      }

      try {
        await window.electronAPI.invoke('mail:deleteCachedById', draftId);
      } catch (err) {
        console.error('[mail:deleteCachedById draft]', err);
      }

      try {
        for (const folder of PRIMARY_VIEW_FOLDERS) {
          await syncMails(options.accountId, getResolvedFolderPath(options.accountId, folder), {
            notify: false,
            folderKind: folder === 'inbox' ? 'inbox' : 'other',
          });
        }
      } catch (err) {
        console.error('[mail:sync after send]', err);
      }
    })();

    return { success: true, message: result.message || appUi.sendSuccess };
  };

  const handleSaveAttempt = async (input: CreateAccountInput) => {
    const result = await createAccount(input);
    if (result.success) {
      await fetchAccounts();
      setShowAddAccount(false);
    }
    return result;
  };

  const handleAutoFetchIntervalChange = useCallback(async (minutes: number) => {
    setAutoFetchMinutes(minutes);
    try {
      await window.electronAPI.invoke('settings:set', MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY, String(minutes));
    } catch (err) {
      console.error(`[settings:set ${MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY}]`, err);
    }
  }, []);

  const handleMailHistoryRangeChange = useCallback(async (range: MailHistoryRange) => {
    setMailFetchHistoryRange(range);
    try {
      await window.electronAPI.invoke('settings:set', MAIL_FETCH_HISTORY_RANGE_SETTING_KEY, range);
    } catch (err) {
      console.error(`[settings:set ${MAIL_FETCH_HISTORY_RANGE_SETTING_KEY}]`, err);
    }
  }, []);

  const backupFolders = useMemo(
    () => (backupState.selectedAccountId ? accountFoldersById[backupState.selectedAccountId] || [] : []),
    [accountFoldersById, backupState.selectedAccountId]
  );

  const handleBackupAccountChange = useCallback((accountId: number) => {
    setBackupState((prev) => ({
      ...prev,
      selectedAccountId: Number.isFinite(accountId) ? accountId : null,
      selectedFolderPaths: [],
      lastResult: null,
    }));
  }, []);

  const handleBackupScopeChange = useCallback((scope: BackupUiState['exportScope']) => {
    setBackupState((prev) => ({
      ...prev,
      exportScope: scope,
      lastResult: null,
    }));
  }, []);

  const handleBackupFolderToggle = useCallback((folderPath: string) => {
    setBackupState((prev) => ({
      ...prev,
      selectedFolderPaths: prev.selectedFolderPaths.includes(folderPath)
        ? prev.selectedFolderPaths.filter((value) => value !== folderPath)
        : [...prev.selectedFolderPaths, folderPath],
      lastResult: null,
    }));
  }, []);

  const handleBackupPickDestination = useCallback(async () => {
    const response = await window.electronAPI.invoke('file:pickDirectory') as {
      success: boolean;
      paths?: string[];
    };

    if (response.success && response.paths?.[0]) {
      setBackupState((prev) => ({
        ...prev,
        destinationPath: response.paths![0],
        lastResult: null,
      }));
    }
  }, []);

  const handleCancelBackupExport = useCallback(async () => {
    if (!backupState.taskId) return;
    await window.electronAPI.invoke('mail:cancelBackup', backupState.taskId);
  }, [backupState.taskId]);

  const handleOpenBackupFolder = useCallback(async () => {
    const targetPath = backupState.lastResult?.outputPath || backupState.destinationPath;
    if (!targetPath) return;
    await window.electronAPI.invoke('file:openPath', targetPath);
  }, [backupState.destinationPath, backupState.lastResult?.outputPath]);

  const handleStartBackupExport = useCallback(async () => {
    const currentBackupState = backupState;
    if (!canStartBackupExport(currentBackupState) || !currentBackupState.selectedAccountId) {
      return;
    }

    const taskId = `backup-${Date.now()}`;
    const selectedAccount = accountList.find((account) => account.id === currentBackupState.selectedAccountId);
    const folderPaths = currentBackupState.exportScope === 'account'
      ? backupFolders.map((folder) => folder.path)
      : currentBackupState.selectedFolderPaths;
    const request: MailExportRequest = {
      mode: 'export',
      taskId,
      destinationPath: currentBackupState.destinationPath,
      scope: {
        accountId: currentBackupState.selectedAccountId,
        accountLabel: selectedAccount?.email || selectedAccount?.name || `account-${currentBackupState.selectedAccountId}`,
        folderPaths,
      },
      filters: {
        readState: currentBackupState.readState,
        startDate: currentBackupState.startDate ? new Date(`${currentBackupState.startDate}T00:00:00`).toISOString() : undefined,
        endDate: currentBackupState.endDate ? new Date(`${currentBackupState.endDate}T23:59:59.999`).toISOString() : undefined,
      },
    };

    setBackupState((prev) => ({
      ...prev,
      taskId,
      isRunning: true,
      lastResult: null,
      progress: {
        taskId,
        mode: 'export',
        stage: 'preparing',
        processed: 0,
        total: 0,
        message: 'Preparing export',
      },
    }));

    const response = await window.electronAPI.invoke('mail:exportEml', request) as {
      success: boolean;
      data?: MailBackupResult;
      error?: string;
    };

    setBackupState((prev) => ({
      ...prev,
      taskId,
      isRunning: false,
      lastResult: response.success && response.data
        ? response.data
        : {
            taskId,
            success: false,
            mode: 'export',
            processed: prev.progress.processed,
            imported: 0,
            exported: prev.progress.processed,
            skipped: 0,
            error: response.error || 'Export failed',
            outputPath: prev.destinationPath,
          },
    }));
  }, [accountList, backupFolders, backupState]);

  const handleSaveDraft = useCallback(async (options: {
    accountId: number;
    to: string[];
    subject: string;
    body: string;
    draftKey: string;
  }) => {
    const account = accounts.find((item) => item.id === options.accountId);
    if (!account) return;

    const draftFolderPath = getResolvedFolderPath(options.accountId, 'drafts');
    const draftUid = Number(options.draftKey.replace(/\D/g, '').slice(-12)) || Date.now();
    const draftMail: RendererMailSummary = {
      id: `${options.accountId}:${options.draftKey}`,
      uid: draftUid,
      from: account.email,
      fromName: account.display_name || account.email.split('@')[0],
      to: options.to.join(', '),
      subject: options.subject || '(Draft)',
      date: new Date(),
      snippet: options.body.trim().slice(0, 160) || '(Draft)',
      hasAttachments: false,
      isRead: true,
      isStarred: false,
      folder: draftFolderPath,
      accountId: options.accountId,
      messageId: `<${options.draftKey}@minimail>`,
      localDraftKey: options.draftKey,
    };

    setMailList((prev) => {
      const filtered = prev.filter((mail) => mail.id !== draftMail.id);
      return [draftMail, ...filtered];
    });

    await window.electronAPI.invoke('mail:cacheLocal', {
      ...draftMail,
      date: draftMail.date.toISOString(),
      cachedAt: new Date().toISOString(),
      bodyText: options.body,
    });
  }, [accounts, getResolvedFolderPath, setMailList]);

  const composeInitialTo = composeContext.mode === 'reply'
    ? composeContext.source?.from || ''
    : '';

  const composeInitialSubject = (() => {
    if (!composeContext.source) return '';
    if (composeContext.mode === 'reply') {
      return /^re:/i.test(composeContext.source.subject) ? composeContext.source.subject : `Re: ${composeContext.source.subject}`;
    }
    if (composeContext.mode === 'forward') {
      return /^fwd:/i.test(composeContext.source.subject) ? composeContext.source.subject : `Fwd: ${composeContext.source.subject}`;
    }
    return '';
  })();

  const composeInitialBody = (() => {
    if (!composeContext.source) {
      return replySuggestion || '';
    }

    const quotedOriginal = formatQuotedOriginalBody({
      mode: composeContext.mode === 'forward' ? 'forward' : 'reply',
      email: composeContext.source,
    });

    if (replySuggestion) {
      return `${replySuggestion}${quotedOriginal}`;
    }

    if (composeContext.mode === 'reply') {
      return quotedOriginal.trimStart();
    }

    if (composeContext.mode === 'forward') {
      return quotedOriginal.trimStart();
    }

    return '';
  })();

  const composeSelectedAccount = useMemo(
    () => resolveComposeSelectedAccount(accountList, currentAccount, composeContext.source),
    [accountList, composeContext.source, currentAccount]
  );

  const sortedForSelectAll = [...folderEmails].sort((a, b) => b.date.getTime() - a.date.getTime());
  const allVisibleIds = sortedForSelectAll.map((mail) => mail.id);
  const isAllSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));
  const isAllAccountsView = currentAccount === 'all';
  const listTitle = isAllAccountsView
    ? t('allAccounts')
    : (currentAccount && 'name' in currentAccount ? currentAccount.name : '');

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#0d0d0f' }}>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className="flex-shrink-0 overflow-hidden"
          style={{ width: 200, display: isMobile ? 'none' : 'flex', flexDirection: 'column' }}
        >
          <Sidebar
            t={t}
            selectedFolder={selectedFolder}
            onSelectFolder={(folderId) => {
              setSelectedFolder(folderId);
              setSelectedIds([]);
              setSelectedEmail(null);
              clearCurrentMail();
            }}
            onCompose={() => openCompose('new', null)}
            onSettings={() => setShowSettings(true)}
            currentAccount={currentAccount}
            accounts={accountList}
            onSwitchAccount={handleSwitchAccount}
            onAddAccount={() => setShowAddAccount(true)}
            onRefresh={handleRefresh}
            isRefreshing={isSyncing}
            isAiClassifying={isAiClassifying}
            onAnalysisDone={runBatchAnalysis}
            folderUnreadCounts={folderUnreadCounts}
            unreadConversationCount={unreadConversationCount}
          />
        </div>

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
            isLoading={isSyncing || isViewHydrating}
            listTitle={listTitle}
            accountEmails={conversationAccountEmails}
          />
        </div>

        <div className="flex-1 min-w-0 flex-shrink-0 overflow-hidden flex flex-col">
          <MailDetail
            t={t}
            email={displayedMail}
            onReply={() => openCompose('reply')}
            onForward={() => openCompose('forward')}
            onDelete={() => {
              if (selectedEmail) {
                void handleDeleteForMail(selectedEmail).catch((err) => {
                  setToasts((prev) => [...prev, {
                    id: Date.now().toString(),
                    type: 'error',
                    message: (err as Error).message || t('delete'),
                  }]);
                });
              }
            }}
            onBack={isMobile ? handleBackToList : undefined}
            onShare={handleShare}
            aiTargetLanguage={effectiveAiTargetLanguage}
            onReplyWithSuggestion={handleReplyWithSuggestion}
            mailLoadingState={mailLoadingState}
            mailError={mailError}
            onRetry={() => selectedEmail && fetchMailDetail(selectedEmail.accountId, selectedEmail.uid, selectedEmail.folder, selectedEmail)}
            conversationMessages={conversationMessages}
            accountEmails={conversationAccountEmails}
            onReplyForMail={(mail) => openCompose('reply', mail)}
            onForwardForMail={(mail) => openCompose('forward', mail)}
            onDeleteMail={(mail) => {
              void handleDeleteForMail(mail).catch((err) => {
                setToasts((prev) => [...prev, {
                  id: Date.now().toString(),
                  type: 'error',
                  message: (err as Error).message || t('delete'),
                }]);
              });
            }}
            onArchiveMail={(mail) => {
              void handleArchiveForMail(mail);
            }}
            onToggleStarMail={(mail) => {
              void handleToggleStarForMail(mail);
            }}
            onError={(message: string) => setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'error', message }])}
            isStarred={Boolean(displayedMail?.isStarred)}
            onToggleStar={() => {
              const target = displayedMail;
              if (target) {
                void handleToggleStarForMail(target);
              }
            }}
            onArchive={() => {
              const target = displayedMail;
              if (target) {
                void handleArchiveForMail(target);
              }
            }}
          />
        </div>

        {contextMenu && (
          <div
            className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button onClick={() => { setSelectedIds([contextMenu.emailId]); handleDeleteSelected(); }} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              {t('delete')}
            </button>
            <button onClick={() => handleMarkReadSelected(true)} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              {t('markAsRead')}
            </button>
            <button onClick={() => handleMarkReadSelected(false)} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              {t('markAsUnread')}
            </button>
            <button onClick={() => handleToggleStarSelected()} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              {t('starred')}
            </button>
            <button onClick={() => { void handleArchiveSelected(); }} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              {appUi.archiveAction}
            </button>
          </div>
        )}

        <ToastContainer toasts={toasts} onDismiss={dismissToast} onClick={() => {}} />

        <ComposeDialog
          t={t}
          isOpen={showCompose}
          onClose={handleCloseCompose}
          onSaveDraft={handleSaveDraft}
          accounts={accountList}
          selectedAccount={composeSelectedAccount}
          onSend={handleSendMail}
          initialTo={composeInitialTo}
          initialSubject={composeInitialSubject}
          initialBody={composeInitialBody}
          aiTargetLanguage={effectiveAiTargetLanguage}
        />

        <SettingsModal
          t={t}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          appLanguage={appLanguage}
          onAppLanguageChange={setAppLanguage}
          aiTargetLanguage={effectiveAiTargetLanguage}
          onAiTargetLanguageChange={() => {}}
          onAddAccount={() => {
            setShowSettings(false);
            setShowAddAccount(true);
          }}
          accounts={accountList}
          onDeleteAccount={handleDeleteAccount}
          currentAccountId={typeof currentAccount === 'string' ? 0 : (currentAccount?.id ?? 0)}
          aiAutoSort={aiAutoSort}
          onAiAutoSortChange={setAiAutoSort}
          aiScanMode={aiScanMode}
          onAiScanModeChange={setAiScanMode}
          aiLookback={aiLookback}
          onAiLookbackChange={setAiLookback}
          mailHistoryRange={mailFetchHistoryRange}
          onMailHistoryRangeChange={handleMailHistoryRangeChange}
          autoFetchInterval={autoFetchMinutes}
          onAutoFetchIntervalChange={handleAutoFetchIntervalChange}
          backupState={backupState}
          backupAccounts={accountList}
          backupFolders={backupFolders}
          onBackupAccountChange={handleBackupAccountChange}
          onBackupScopeChange={handleBackupScopeChange}
          onBackupFolderToggle={handleBackupFolderToggle}
          onBackupReadStateChange={(readState) => setBackupState((prev) => ({ ...prev, readState, lastResult: null }))}
          onBackupStartDateChange={(value) => setBackupState((prev) => ({ ...prev, startDate: value, lastResult: null }))}
          onBackupEndDateChange={(value) => setBackupState((prev) => ({ ...prev, endDate: value, lastResult: null }))}
          onBackupPickDestination={handleBackupPickDestination}
          onStartBackupExport={handleStartBackupExport}
          onCancelBackupExport={handleCancelBackupExport}
          onOpenBackupFolder={handleOpenBackupFolder}
        />

        <AddAccountDialog
          ref={addAccountDialogRef}
          t={t}
          appLanguage={appLanguage}
          isOpen={showAddAccount}
          onClose={() => setShowAddAccount(false)}
          onSaveAttempt={handleSaveAttempt}
          onTest={async () => ({ success: true, message: 'Test passed' })}
        />
      </div>
    </div>
  );
}

export default App;
