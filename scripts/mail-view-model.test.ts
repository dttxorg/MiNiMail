import {
  buildMailListViewModel,
  type MailListViewModelArgs,
} from '../src/renderer/utils/mailListViewModel';
import type { RendererMailSummary } from '../src/renderer/hooks/useMail';
import type { MailRoutingResultEntry } from '../src/renderer/utils/mailRoutingAdapter';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeMail(overrides: Partial<RendererMailSummary>): RendererMailSummary {
  return {
    id: overrides.id || '1',
    uid: overrides.uid || 1,
    from: overrides.from || 'sender@example.com',
    fromName: overrides.fromName || 'Sender',
    to: overrides.to || 'owner@example.com',
    subject: overrides.subject || 'Subject',
    date: overrides.date || new Date('2026-04-24T10:00:00.000Z'),
    snippet: overrides.snippet || 'snippet',
    hasAttachments: overrides.hasAttachments || false,
    isRead: overrides.isRead || false,
    isStarred: overrides.isStarred || false,
    folder: overrides.folder || 'INBOX',
    accountId: overrides.accountId || 1,
    category: overrides.category,
    messageId: overrides.messageId,
    inReplyTo: overrides.inReplyTo,
    references: overrides.references,
    bodyText: overrides.bodyText,
    bodyHtml: overrides.bodyHtml,
    deliveryState: overrides.deliveryState,
    deliveryError: overrides.deliveryError,
    localDraftKey: overrides.localDraftKey,
    quotedBodyHtml: overrides.quotedBodyHtml,
    quotedBodyText: overrides.quotedBodyText,
    headers: overrides.headers,
    scanResult: overrides.scanResult,
    isScanned: overrides.isScanned,
  };
}

function testBuildMailListViewModelKeepsGithubRoutingAndCounts() {
  const mails: RendererMailSummary[] = [
    makeMail({
      id: 'github-1',
      uid: 11,
      from: 'GitHub <noreply@github.com>',
      fromName: 'GitHub',
      to: 'owner@example.com',
      subject: '[acme/repo] Review requested',
      snippet: 'requested your review',
      messageId: '<github-1@example.com>',
    }),
    makeMail({
      id: 'plain-1',
      uid: 12,
      from: 'boss@example.com',
      fromName: 'Boss',
      to: 'owner@example.com',
      subject: 'Please confirm',
      snippet: 'please confirm receipt',
      messageId: '<plain-1@example.com>',
    }),
  ];

  const routingResults: MailRoutingResultEntry[] = [
    {
      id: 'github-1',
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 10,
          urgency_score: 10,
          actionability_score: 10,
          risk_score: 0,
          density_score: 0,
          relationship_score: 10,
          total_light_score: 40,
          force_upgrade: true,
          recommended_depth: 'normal',
          reasons: ['github'],
        },
        smart_folder: {
          family: 'github',
          folder: 'GitHub/Review Requests',
          reasons: ['review requested'],
        },
        github: {
          parser: 'github',
          is_github: true,
          repository_owner: 'acme',
          repository_name: 'repo',
          repository_full_name: 'acme/repo',
          entity_type: 'pull_request',
          event_type: 'review_requested',
          entity_title: 'PR',
          thread_key: 'thread-1',
          short_summary: 'Review requested',
          newest_content: 'please review',
          needs_user_action: true,
          priority_score: 80,
          todo_items: [],
          reasons: ['review requested'],
        },
      },
    },
  ];

  const args: MailListViewModelArgs = {
    selectedFolder: 'github',
    currentAccount: {
      id: 1,
      email: 'owner@example.com',
    },
    accounts: [
      { email: 'owner@example.com' },
    ],
    nonDraftMailList: mails,
    nonDraftLocalThreadMails: [],
    mailRoutingResults: routingResults,
    githubNotificationsViewEnabled: true,
    aiCategoryIds: ['工作/业务类'],
  };

  const result = buildMailListViewModel(args);

  assert(result.scopedThreadMailUniverse.length === 2, 'Expected scoped thread universe to include both mails');
  assert(result.githubConversationCount === 1, 'Expected GitHub aggregate count to stay available');
  assert(result.githubFolderCounts['GitHub/Review Requests'] === 1, 'Expected GitHub folder counts to be preserved');
  assert(result.folderEmails.length === 1, 'Expected github folder view to only return routed github rows');
  assert(result.folderEmails[0]?.id === 'github-1', 'Expected GitHub row to survive view-model consolidation');
}

function run() {
  testBuildMailListViewModelKeepsGithubRoutingAndCounts();
  console.log('mail view model tests passed');
}

run();
