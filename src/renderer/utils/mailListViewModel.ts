import type { RendererMailSummary } from '../hooks/useMail';
import {
  buildClassifiedConversationRows,
  buildSenderConversationRows,
  filterUnreadConversationRows,
  getConversationKey,
} from './mailConversations';
import { getAiCategorySourceEmails } from './aiCategoryRouting';
import {
  buildGitHubConversationRowsForFolder,
  buildMailRoutingAdapter,
  buildPriorityConversationRowsForFolder,
  countGitHubConversationsWithFallback,
  filterConversationRowsForGitHubView,
  filterMailsForGitHubFolder,
  filterMailsForPriorityFolder,
  getGitHubFolderConversationCounts,
  getPriorityFolderConversationCounts,
  isGitHubSmartFolderId,
  isPriorityFolderId,
  type MailRoutingAdapterResult,
  type MailRoutingResultEntry,
} from './mailRoutingAdapter';
import { buildThreadMailUniverse, getVisibleFolderEmails, isHiddenFromVirtualMailViews } from './mailThreading';
import { folderMatches } from '../../shared/mailFolders';

type CurrentAccount = {
  id: number;
  email: string;
} | 'all' | null;

type AccountLike = {
  email: string;
};

export interface MailListViewModelArgs {
  selectedFolder: string;
  currentAccount: CurrentAccount;
  accounts: AccountLike[];
  nonDraftMailList: RendererMailSummary[];
  nonDraftLocalThreadMails: RendererMailSummary[];
  mailRoutingResults: MailRoutingResultEntry[];
  githubNotificationsViewEnabled: boolean;
  aiCategoryIds: readonly string[];
}

export interface MailListViewModelResult {
  threadMailUniverse: RendererMailSummary[];
  scopedThreadMailUniverse: RendererMailSummary[];
  conversationAccountEmails: string[];
  unreadConversationCount: number;
  mailRoutingAdapter: MailRoutingAdapterResult;
  githubFolderCounts: ReturnType<typeof getGitHubFolderConversationCounts>;
  priorityFolderCounts: ReturnType<typeof getPriorityFolderConversationCounts>;
  rawFolderEmails: RendererMailSummary[];
  categorySourceEmails: RendererMailSummary[];
  conversationRows: RendererMailSummary[];
  folderEmails: RendererMailSummary[];
  githubConversationCount: number;
}

function isDraftMailForDisplay(mail: Pick<RendererMailSummary, 'folder' | 'localDraftKey' | 'messageId' | 'deliveryState'>): boolean {
  if (mail.deliveryState === 'cancelled') return true;
  if (mail.deliveryState) return false;
  if (mail.messageId?.startsWith('<local-')) return false;
  if (mail.localDraftKey) return true;
  if (folderMatches(mail.folder, 'drafts')) return true;
  return /^<draft-[^>]+@minimail>$/.test(mail.messageId || '');
}

function filterDraftsForSelectedFolder(
  mails: RendererMailSummary[],
  selectedFolder: string,
): RendererMailSummary[] {
  if (selectedFolder === 'drafts') return mails;
  return mails.filter((mail) => !isDraftMailForDisplay(mail));
}

export function buildMailListViewModel({
  selectedFolder,
  currentAccount,
  accounts,
  nonDraftMailList,
  nonDraftLocalThreadMails,
  mailRoutingResults,
  githubNotificationsViewEnabled,
  aiCategoryIds,
}: MailListViewModelArgs): MailListViewModelResult {
  const threadMailUniverse = buildThreadMailUniverse(nonDraftMailList, nonDraftLocalThreadMails);
  const scopedThreadMailUniverse = currentAccount === null
    ? []
    : currentAccount === 'all'
    ? threadMailUniverse
    : threadMailUniverse.filter((mail) => mail.accountId === currentAccount.id);
  const activeScopedThreadMailUniverse = scopedThreadMailUniverse.filter(
    (mail) => !isHiddenFromVirtualMailViews(mail),
  );

  const conversationAccountEmails = currentAccount === null
    ? []
    : currentAccount === 'all'
    ? accounts.map((account) => account.email)
    : [currentAccount.email];

  const unreadKeys = new Set<string>();
  for (const mail of activeScopedThreadMailUniverse) {
    if (!mail.isRead) unreadKeys.add(getConversationKey(mail, conversationAccountEmails));
  }

  const mailRoutingAdapter = buildMailRoutingAdapter({
    mails: activeScopedThreadMailUniverse,
    routingResults: mailRoutingResults,
    accountEmails: conversationAccountEmails,
  });

  const githubFolderCounts = getGitHubFolderConversationCounts(mailRoutingAdapter);
  const priorityFolderCounts = getPriorityFolderConversationCounts(mailRoutingAdapter);

  const isAiCategoryView = aiCategoryIds.includes(selectedFolder);
  const isGitHubSmartFolderView = isGitHubSmartFolderId(selectedFolder);
  const isPriorityFolderView = isPriorityFolderId(selectedFolder);

  const visibleFolderEmails = (
    selectedFolder === 'unread' ||
    selectedFolder === 'github' ||
    isGitHubSmartFolderView ||
    isPriorityFolderView
  )
    ? activeScopedThreadMailUniverse
    : getVisibleFolderEmails({
      selectedFolder,
      currentAccount,
      baseMails: nonDraftMailList,
      localThreadMails: nonDraftLocalThreadMails,
      aiCategoryIds,
    });

  const visibleNonDraftFolderEmails = filterDraftsForSelectedFolder(visibleFolderEmails, selectedFolder);

  const rawFolderEmails = isGitHubSmartFolderView
    ? filterMailsForGitHubFolder(visibleNonDraftFolderEmails, mailRoutingAdapter, selectedFolder)
    : isPriorityFolderView
      ? filterMailsForPriorityFolder(visibleNonDraftFolderEmails, mailRoutingAdapter, selectedFolder)
      : isAiCategoryView
        ? getAiCategorySourceEmails(visibleNonDraftFolderEmails, mailRoutingAdapter, githubNotificationsViewEnabled)
        : visibleNonDraftFolderEmails;

  const categorySourceEmails = getAiCategorySourceEmails(
    activeScopedThreadMailUniverse,
    mailRoutingAdapter,
    githubNotificationsViewEnabled,
  );

  const conversationRows = isAiCategoryView
    ? buildClassifiedConversationRows(rawFolderEmails, conversationAccountEmails)
    : buildSenderConversationRows(rawFolderEmails, conversationAccountEmails);

  const folderEmails = selectedFolder === 'unread'
    ? filterUnreadConversationRows(conversationRows, activeScopedThreadMailUniverse, conversationAccountEmails)
    : selectedFolder === 'github'
      ? filterConversationRowsForGitHubView(
        conversationRows,
        mailRoutingAdapter,
        activeScopedThreadMailUniverse,
        conversationAccountEmails,
      )
      : isGitHubSmartFolderView
        ? buildGitHubConversationRowsForFolder(
          activeScopedThreadMailUniverse,
          mailRoutingAdapter,
          selectedFolder,
          conversationAccountEmails,
        )
        : isPriorityFolderView
          ? buildPriorityConversationRowsForFolder(
            activeScopedThreadMailUniverse,
            mailRoutingAdapter,
            selectedFolder,
            conversationAccountEmails,
          )
          : conversationRows;

  const githubConversationCount = countGitHubConversationsWithFallback(
    conversationRows,
    mailRoutingAdapter,
    activeScopedThreadMailUniverse,
    conversationAccountEmails,
  );

  return {
    threadMailUniverse,
    scopedThreadMailUniverse,
    conversationAccountEmails,
    unreadConversationCount: unreadKeys.size,
    mailRoutingAdapter,
    githubFolderCounts,
    priorityFolderCounts,
    rawFolderEmails,
    categorySourceEmails,
    conversationRows,
    folderEmails,
    githubConversationCount,
  };
}
