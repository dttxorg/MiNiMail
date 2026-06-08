import type { RendererMailSummary } from '../hooks/useMail';
import { buildSenderConversationRows, filterGitHubConversationRows, getConversationKey } from './mailConversations';
import type { GitHubSmartFolder, ScanPipelineResult } from '../../shared/email-ai/scanTypes';
import { deriveGenericPriorityFolders } from '../../shared/email-ai/smartFolderRouter';
import { runScanPipeline } from '../../shared/email-ai/scanPipeline';

export const PRIORITY_FOLDER_IDS = [
  'Priority/High',
  'Priority/Needs Reply',
  'Priority/Risk',
  'Priority/Low',
] as const;

export type GenericPriorityFolderId = typeof PRIORITY_FOLDER_IDS[number];

export type MailRoutingFolderId = GitHubSmartFolder | GenericPriorityFolderId;

export interface MailRoutingResultEntry {
  id: string;
  routing: ScanPipelineResult;
}

export interface MailRoutingAdapterResult {
  hasRoutingResults: boolean;
  routedMailIds: string[];
  mailFolderMembership: Record<string, MailRoutingFolderId[]>;
  conversationFolderMembership: Record<string, MailRoutingFolderId[]>;
  githubConversationKeysByFolder: Record<GitHubSmartFolder, string[]>;
  priorityConversationKeysByFolder: Record<GenericPriorityFolderId, string[]>;
}

interface BuildMailRoutingAdapterArgs {
  mails: RendererMailSummary[];
  routingResults?: MailRoutingResultEntry[];
  accountEmails?: string[];
}

export const GITHUB_AGGREGATE_FOLDER_ID = 'github' as const;

export const GITHUB_SMART_FOLDER_IDS: readonly GitHubSmartFolder[] = [
  'GitHub/Needs Action',
  'GitHub/Review Requests',
  'GitHub/Assigned to Me',
  'GitHub/Mentions',
  'GitHub/CI and Failures',
  'GitHub/Security',
  'GitHub/Low Priority',
  'GitHub/Archived Updates',
] as const;

const GITHUB_FOLDERS: readonly GitHubSmartFolder[] = GITHUB_SMART_FOLDER_IDS;
const PRIORITY_FOLDERS: readonly GenericPriorityFolderId[] = PRIORITY_FOLDER_IDS;

export function isGitHubSmartFolderId(folderId: string): folderId is GitHubSmartFolder {
  return (GITHUB_SMART_FOLDER_IDS as readonly string[]).includes(folderId);
}

export function isPriorityFolderId(folderId: string): folderId is GenericPriorityFolderId {
  return (PRIORITY_FOLDER_IDS as readonly string[]).includes(folderId);
}

function createGithubFolderMap(): Record<GitHubSmartFolder, Set<string>> {
  return {
    'GitHub/Needs Action': new Set<string>(),
    'GitHub/Review Requests': new Set<string>(),
    'GitHub/Assigned to Me': new Set<string>(),
    'GitHub/Mentions': new Set<string>(),
    'GitHub/CI and Failures': new Set<string>(),
    'GitHub/Security': new Set<string>(),
    'GitHub/Low Priority': new Set<string>(),
    'GitHub/Archived Updates': new Set<string>(),
  };
}

function createPriorityFolderMap(): Record<GenericPriorityFolderId, Set<string>> {
  return {
    'Priority/High': new Set<string>(),
    'Priority/Needs Reply': new Set<string>(),
    'Priority/Risk': new Set<string>(),
    'Priority/Low': new Set<string>(),
  };
}

function toSortedRecord<T extends string>(input: Record<T, Set<string>>): Record<T, string[]> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, (Array.isArray(value) ? [...value] : Array.from(value as Iterable<unknown>)).sort()])
  ) as Record<T, string[]>;
}

function toSortedMembershipRecord(input: Map<string, Set<MailRoutingFolderId>>): Record<string, MailRoutingFolderId[]> {
  const entries = Array.from(input.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, folders]) => [key, Array.from(folders).sort()] as const);
  return Object.fromEntries(entries);
}

function setMembership(target: Map<string, Set<MailRoutingFolderId>>, key: string, folder: MailRoutingFolderId) {
  if (!target.has(key)) {
    target.set(key, new Set<MailRoutingFolderId>());
  }
  target.get(key)!.add(folder);
}

function getPersistedRoutingFolder(mail: RendererMailSummary): MailRoutingFolderId | null {
  const scanResult = mail.scanResult || '';
  if (isGitHubSmartFolderId(scanResult)) return scanResult;
  if (isPriorityFolderId(scanResult)) return scanResult;
  return null;
}

function addFolderMembership(
  mail: RendererMailSummary,
  folder: MailRoutingFolderId,
  accountEmails: string[],
  routedMailIds: Set<string>,
  mailFolderMembership: Map<string, Set<MailRoutingFolderId>>,
  conversationFolderMembership: Map<string, Set<MailRoutingFolderId>>,
  githubConversationKeysByFolder: Record<GitHubSmartFolder, Set<string>>,
  priorityConversationKeysByFolder: Record<GenericPriorityFolderId, Set<string>>,
) {
  const conversationKey = getConversationKey(mail, accountEmails);
  routedMailIds.add(mail.id);
  setMembership(mailFolderMembership, mail.id, folder);
  setMembership(conversationFolderMembership, conversationKey, folder);

  if (isGitHubSmartFolderId(folder)) {
    githubConversationKeysByFolder[folder].add(conversationKey);
  } else {
    priorityConversationKeysByFolder[folder].add(conversationKey);
  }
}

function deriveLocalGitHubRouting(mail: RendererMailSummary): ScanPipelineResult | null {
  const routing = runScanPipeline({
    subject: mail.subject || '',
    from: mail.from || '',
    fromName: mail.fromName || '',
    to: mail.to || '',
    snippet: mail.snippet || '',
    bodyText: mail.bodyText,
    bodyHtml: mail.bodyHtml,
    date: mail.date,
    hasAttachments: mail.hasAttachments,
  });

  return routing.kind === 'github' ? routing : null;
}

export function buildMailRoutingAdapter({
  mails,
  routingResults = [],
  accountEmails = [],
}: BuildMailRoutingAdapterArgs): MailRoutingAdapterResult {
  const mailById = new Map(mails.map((mail) => [mail.id, mail]));
  const mailFolderMembership = new Map<string, Set<MailRoutingFolderId>>();
  const conversationFolderMembership = new Map<string, Set<MailRoutingFolderId>>();
  const githubConversationKeysByFolder = createGithubFolderMap();
  const priorityConversationKeysByFolder = createPriorityFolderMap();
  const routedMailIds = new Set<string>();

  for (const entry of routingResults) {
    const mail = mailById.get(entry.id);
    if (!mail) continue;

    if (entry.routing.kind === 'github') {
      const folder = entry.routing.smart_folder.folder as GitHubSmartFolder;
      addFolderMembership(
        mail,
        folder,
        accountEmails,
        routedMailIds,
        mailFolderMembership,
        conversationFolderMembership,
        githubConversationKeysByFolder,
        priorityConversationKeysByFolder,
      );
      continue;
    }

    const priorityFolders = deriveGenericPriorityFolders(entry.routing.light_scan) as GenericPriorityFolderId[];
    for (const folder of priorityFolders) {
      addFolderMembership(
        mail,
        folder,
        accountEmails,
        routedMailIds,
        mailFolderMembership,
        conversationFolderMembership,
        githubConversationKeysByFolder,
        priorityConversationKeysByFolder,
      );
    }
  }

  for (const mail of mails) {
    if (routedMailIds.has(mail.id)) continue;

    const derivedRouting = deriveLocalGitHubRouting(mail);
    const folder = derivedRouting
      ? (derivedRouting.smart_folder?.folder as GitHubSmartFolder | undefined)
      : getPersistedRoutingFolder(mail);
    if (!folder) continue;

    addFolderMembership(
      mail,
      folder,
      accountEmails,
      routedMailIds,
      mailFolderMembership,
      conversationFolderMembership,
      githubConversationKeysByFolder,
      priorityConversationKeysByFolder,
    );
  }

  return {
    hasRoutingResults: routedMailIds.size > 0,
    routedMailIds: Array.from(routedMailIds).sort(),
    mailFolderMembership: toSortedMembershipRecord(mailFolderMembership),
    conversationFolderMembership: toSortedMembershipRecord(conversationFolderMembership),
    githubConversationKeysByFolder: toSortedRecord(githubConversationKeysByFolder),
    priorityConversationKeysByFolder: toSortedRecord(priorityConversationKeysByFolder),
  };
}

function dedupeRowsById(rows: RendererMailSummary[]): RendererMailSummary[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return Array.from(byId.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function buildGitHubConversationRows(
  mails: RendererMailSummary[],
  adapter: MailRoutingAdapterResult,
  accountEmails: string[] = [],
): RendererMailSummary[] {
  if (!adapter.hasRoutingResults) {
    const rows = buildSenderConversationRows(mails, accountEmails);
    return filterGitHubConversationRows(rows, mails, accountEmails);
  }

  const groupedRows = GITHUB_FOLDERS.flatMap((folder) =>
    buildSenderConversationRows(filterMailsForGitHubFolder(mails, adapter, folder), accountEmails)
  );
  return dedupeRowsById(groupedRows);
}

export function filterConversationRowsForGitHubView(
  rows: RendererMailSummary[],
  adapter: MailRoutingAdapterResult,
  allMails: RendererMailSummary[],
  accountEmails: string[] = [],
): RendererMailSummary[] {
  if (!adapter.hasRoutingResults) {
    return filterGitHubConversationRows(rows, allMails, accountEmails);
  }
  return buildGitHubConversationRows(allMails, adapter, accountEmails);
}

export function filterMailsForGitHubFolder(
  mails: RendererMailSummary[],
  adapter: MailRoutingAdapterResult,
  folder: GitHubSmartFolder,
): RendererMailSummary[] {
  if (!adapter.hasRoutingResults) {
    return [];
  }

  return mails.filter((mail) => (adapter.mailFolderMembership[mail.id] || []).includes(folder));
}

export function buildGitHubConversationRowsForFolder(
  mails: RendererMailSummary[],
  adapter: MailRoutingAdapterResult,
  folder: GitHubSmartFolder,
  accountEmails: string[] = [],
): RendererMailSummary[] {
  if (!adapter.hasRoutingResults) {
    return [];
  }

  return buildSenderConversationRows(filterMailsForGitHubFolder(mails, adapter, folder), accountEmails);
}

export function countGitHubConversationsWithFallback(
  rows: RendererMailSummary[],
  adapter: MailRoutingAdapterResult,
  allMails: RendererMailSummary[],
  accountEmails: string[] = [],
): number {
  return filterConversationRowsForGitHubView(rows, adapter, allMails, accountEmails).length;
}

export function excludeGithubRoutedMails(
  mails: RendererMailSummary[],
  adapter: MailRoutingAdapterResult,
): RendererMailSummary[] {
  if (!adapter.hasRoutingResults) return mails;

  return mails.filter((mail) => {
    const membership = adapter.mailFolderMembership[mail.id] || [];
    return !membership.some((folder) => folder.startsWith('GitHub/'));
  });
}

export function getPriorityConversationKeys(
  adapter: MailRoutingAdapterResult,
  folder: GenericPriorityFolderId,
): string[] {
  return adapter.priorityConversationKeysByFolder[folder] || [];
}

export function getGithubConversationKeys(
  adapter: MailRoutingAdapterResult,
  folder: GitHubSmartFolder,
): string[] {
  return adapter.githubConversationKeysByFolder[folder] || [];
}

export function getGitHubFolderConversationCounts(
  adapter: MailRoutingAdapterResult,
): Record<GitHubSmartFolder, number> {
  return Object.fromEntries(
    GITHUB_SMART_FOLDER_IDS.map((folder) => [folder, adapter.githubConversationKeysByFolder[folder]?.length || 0])
  ) as Record<GitHubSmartFolder, number>;
}

export function filterMailsForPriorityFolder(
  mails: RendererMailSummary[],
  adapter: MailRoutingAdapterResult,
  folder: GenericPriorityFolderId,
): RendererMailSummary[] {
  if (!adapter.hasRoutingResults) {
    return [];
  }

  return mails.filter((mail) => (adapter.mailFolderMembership[mail.id] || []).includes(folder));
}

export function filterMailsForRoutingFolder(
  mails: RendererMailSummary[],
  adapter: MailRoutingAdapterResult,
  folder: MailRoutingFolderId,
): RendererMailSummary[] {
  if (isGitHubSmartFolderId(folder)) {
    return filterMailsForGitHubFolder(mails, adapter, folder);
  }
  return filterMailsForPriorityFolder(mails, adapter, folder);
}

export function buildPriorityConversationRowsForFolder(
  mails: RendererMailSummary[],
  adapter: MailRoutingAdapterResult,
  folder: GenericPriorityFolderId,
  accountEmails: string[] = [],
): RendererMailSummary[] {
  if (!adapter.hasRoutingResults) {
    return [];
  }

  return buildSenderConversationRows(filterMailsForPriorityFolder(mails, adapter, folder), accountEmails);
}

export function getPriorityFolderConversationCounts(
  adapter: MailRoutingAdapterResult,
): Record<GenericPriorityFolderId, number> {
  return Object.fromEntries(
    PRIORITY_FOLDERS.map((folder) => [folder, adapter.priorityConversationKeysByFolder[folder]?.length || 0])
  ) as Record<GenericPriorityFolderId, number>;
}
