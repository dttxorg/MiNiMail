import {
  buildGitHubConversationRows,
  buildGitHubConversationRowsForFolder,
  buildMailRoutingAdapter,
  countGitHubConversationsWithFallback,
  excludeGithubRoutedMails,
  filterMailsForGitHubFolder,
  filterConversationRowsForGitHubView,
  GITHUB_SMART_FOLDER_IDS,
  buildPriorityConversationRowsForFolder,
  filterMailsForPriorityFolder,
  filterMailsForRoutingFolder,
  getGitHubFolderConversationCounts,
  getPriorityFolderConversationCounts,
  isGitHubSmartFolderId,
  isPriorityFolderId,
  PRIORITY_FOLDER_IDS,
  type MailRoutingResultEntry,
} from '../src/renderer/utils/mailRoutingAdapter';
import { buildSenderConversationRows } from '../src/renderer/utils/mailConversations';

type Mail = {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  accountId: number;
  category?: string;
  bodyText?: string;
  bodyHtml?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeMail(overrides: Partial<Mail>): Mail {
  return {
    id: 'mail-1',
    uid: 1,
    from: 'sender@example.com',
    fromName: 'Sender',
    to: 'me@example.com',
    subject: 'Hello',
    date: new Date('2026-04-19T10:00:00Z'),
    snippet: 'hello',
    hasAttachments: false,
    isRead: false,
    isStarred: false,
    folder: 'INBOX',
    accountId: 1,
    ...overrides,
  };
}

function testGithubMailEntersDedicatedFolderAndNormalMailDoesNot() {
  const githubMail = makeMail({
    id: 'gh-1',
    from: 'notifications@github.com',
    fromName: 'GitHub',
    subject: '[openai/codex] Review requested (#42)',
    snippet: 'alice requested your review',
  });
  const normalMail = makeMail({
    id: 'mail-2',
    from: 'news@example.com',
    subject: 'Weekly newsletter',
    snippet: 'Top stories this week',
  });

  const routingResults: MailRoutingResultEntry[] = [
    {
      id: githubMail.id,
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 60,
          urgency_score: 45,
          actionability_score: 80,
          risk_score: 20,
          density_score: 50,
          relationship_score: 30,
          total_light_score: 61,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: ['review requested'],
        },
        github: {
          parser: 'github',
          is_github: true,
          repository_owner: 'openai',
          repository_name: 'codex',
          repository_full_name: 'openai/codex',
          entity_type: 'pull_request',
          event_type: 'review_requested',
          entity_number: 42,
          entity_title: 'Improve triage',
          thread_key: 'github:openai/codex:pull_request:42',
          reason_for_recipient: 'review_requested',
          actor: 'alice',
          url: 'https://github.com/openai/codex/pull/42',
          short_summary: 'alice requested your review',
          newest_content: 'Please review this pull request',
          needs_user_action: true,
          priority_score: 82,
          todo_items: ['Review the PR'],
          reply_caution: 'Email reply goes to conversation only',
          reasons: ['review_requested'],
        },
        smart_folder: {
          family: 'github',
          folder: 'GitHub/Review Requests',
          reasons: ['review_requested'],
        },
      },
    },
    {
      id: normalMail.id,
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 8,
          urgency_score: 4,
          actionability_score: 2,
          risk_score: 1,
          density_score: 18,
          relationship_score: 5,
          total_light_score: 11,
          force_upgrade: false,
          recommended_depth: 'light',
          reasons: ['newsletter'],
        },
        smart_folder: null,
      },
    },
  ];

  const adapter = buildMailRoutingAdapter({
    mails: [githubMail, normalMail],
    routingResults,
    accountEmails: ['me@example.com'],
  });

  assert(adapter.hasRoutingResults, 'Expected adapter to report routing results');
  assert(
    adapter.mailFolderMembership[githubMail.id]?.includes('GitHub/Review Requests'),
    'Expected GitHub review mail to be in GitHub/Review Requests'
  );
  assert(
    !adapter.mailFolderMembership[normalMail.id]?.some((folder) => folder.startsWith('GitHub/')),
    'Expected normal mail not to be routed into GitHub folders'
  );
}

function testFallbackKeepsOldGithubLogicWhenNoRoutingResults() {
  const githubInbound = makeMail({
    id: 'gh-2',
    from: 'notifications@github.com',
    fromName: 'GitHub',
    subject: '[owner/repo] Re: Parser fix (#7)',
    snippet: 'bob mentioned you',
  });
  const normalMail = makeMail({
    id: 'mail-3',
    from: 'billing@example.com',
    subject: 'Invoice ready',
  });

  const rows = buildSenderConversationRows([githubInbound, normalMail], ['me@example.com']);
  const adapter = buildMailRoutingAdapter({
    mails: [githubInbound, normalMail],
    routingResults: [],
    accountEmails: ['me@example.com'],
  });

  const filtered = filterConversationRowsForGitHubView(rows, adapter, [githubInbound, normalMail], ['me@example.com']);
  assert(filtered.length === 1, `Expected fallback GitHub filter to keep one row, got ${filtered.length}`);
  assert(filtered[0].id === githubInbound.id, 'Expected fallback GitHub filter to keep the GitHub row');
  assert(
    countGitHubConversationsWithFallback(rows, adapter, [githubInbound, normalMail], ['me@example.com']) === 1,
    'Expected fallback GitHub count to stay correct'
  );
}

function testGithubRoutingWinsOverOldBodyGuessingWhenResultsExist() {
  const githubMail = makeMail({
    id: 'gh-3',
    from: 'notifications@github.com',
    fromName: 'GitHub',
    subject: '[owner/repo] Release v1.4.0',
    snippet: 'A new release is available',
  });
  const rows = buildSenderConversationRows([githubMail], ['me@example.com']);

  const adapter = buildMailRoutingAdapter({
    mails: [githubMail],
    routingResults: [
      {
        id: githubMail.id,
        routing: {
          kind: 'github',
          light_scan: {
            importance_score: 15,
            urgency_score: 5,
            actionability_score: 5,
            risk_score: 0,
            density_score: 20,
            relationship_score: 5,
            total_light_score: 16,
            force_upgrade: true,
            recommended_depth: 'normal',
            reasons: ['github'],
          },
          github: {
            parser: 'github',
            is_github: true,
            repository_owner: 'owner',
            repository_name: 'repo',
            repository_full_name: 'owner/repo',
            entity_type: 'release',
            event_type: 'release_update_notification',
            entity_title: 'v1.4.0',
            thread_key: 'github:owner/repo:release',
            short_summary: 'Release available',
            newest_content: 'Release v1.4.0',
            needs_user_action: false,
            priority_score: 12,
            todo_items: [],
            reasons: ['release'],
          },
          smart_folder: {
            family: 'github',
            folder: 'GitHub/Archived Updates',
            reasons: ['release'],
          },
        },
      },
    ],
    accountEmails: ['me@example.com'],
  });

  const filtered = filterConversationRowsForGitHubView(rows, adapter, [githubMail], ['me@example.com']);
  assert(filtered.length === 1, 'Expected routed GitHub row to stay visible');
  assert(
    adapter.githubConversationKeysByFolder['GitHub/Archived Updates'].length === 1,
    'Expected archived GitHub folder membership to be recorded'
  );
}

function testGithubRoutedMailsCanBeExcludedFromGenericCategoryViews() {
  const githubMail = makeMail({
    id: 'gh-4',
    from: 'notifications@github.com',
    subject: '[openai/codex] review requested (#8)',
    category: '工作/业务类',
  });
  const normalCategorizedMail = makeMail({
    id: 'mail-4',
    from: 'boss@example.com',
    subject: 'Project review',
    category: '工作/业务类',
  });

  const adapter = buildMailRoutingAdapter({
    mails: [githubMail, normalCategorizedMail],
    routingResults: [
      {
        id: githubMail.id,
        routing: {
          kind: 'github',
          light_scan: {
            importance_score: 62,
            urgency_score: 30,
            actionability_score: 75,
            risk_score: 10,
            density_score: 20,
            relationship_score: 15,
            total_light_score: 57,
            force_upgrade: true,
            recommended_depth: 'advanced',
            reasons: ['github'],
          },
          github: {
            parser: 'github',
            is_github: true,
            repository_owner: 'openai',
            repository_name: 'codex',
            repository_full_name: 'openai/codex',
            entity_type: 'pull_request',
            event_type: 'review_requested',
            entity_number: 8,
            entity_title: 'Refactor routing adapter',
            thread_key: 'github:openai/codex:pull_request:8',
            short_summary: 'Review requested',
            newest_content: 'Please review',
            needs_user_action: true,
            priority_score: 80,
            todo_items: ['Review PR'],
            reasons: ['review_requested'],
          },
          smart_folder: {
            family: 'github',
            folder: 'GitHub/Review Requests',
            reasons: ['review_requested'],
          },
        },
      },
    ],
    accountEmails: ['me@example.com'],
  });

  const filtered = excludeGithubRoutedMails([githubMail, normalCategorizedMail], adapter);
  assert(filtered.length === 1, `Expected one categorized non-GitHub mail to remain, got ${filtered.length}`);
  assert(filtered[0].id === normalCategorizedMail.id, 'Expected GitHub-routed categorized mail to be excluded');
}

function testGenericPriorityMembershipIsPreparedWithoutUi() {
  const replyMail = makeMail({
    id: 'mail-5',
    from: 'manager@example.com',
    subject: 'Please reply with approval today',
    snippet: 'Please review and reply by 5 PM today.',
  });

  const adapter = buildMailRoutingAdapter({
    mails: [replyMail],
    routingResults: [
      {
        id: replyMail.id,
        routing: {
          kind: 'generic',
          light_scan: {
            importance_score: 58,
            urgency_score: 62,
            actionability_score: 88,
            risk_score: 12,
            density_score: 35,
            relationship_score: 45,
            total_light_score: 68,
            force_upgrade: false,
            recommended_depth: 'advanced',
            reasons: ['reply requested'],
          },
          smart_folder: null,
        },
      },
    ],
    accountEmails: ['me@example.com'],
  });

  assert(
    adapter.priorityConversationKeysByFolder['Priority/Needs Reply'].length === 1,
    'Expected future Priority/Needs Reply membership to be prepared'
  );
  assert(
    adapter.priorityConversationKeysByFolder['Priority/High'].length === 1,
    'Expected future Priority/High membership to be prepared'
  );
}

function testPriorityFolderHelpersCoverAllFolders() {
  assert(PRIORITY_FOLDER_IDS.length === 4, `Expected 4 priority folders, got ${PRIORITY_FOLDER_IDS.length}`);
  for (const folder of PRIORITY_FOLDER_IDS) {
    assert(isPriorityFolderId(folder), `Expected ${folder} to be recognized as a priority folder`);
  }
  assert(!isPriorityFolderId('Priority'), 'Expected invalid aggregate id not to be treated as a priority folder');
}

function testPriorityFolderCountsAndFiltering() {
  const highMail = makeMail({
    id: 'prio-high',
    from: 'manager@example.com',
    subject: 'Urgent reply needed today',
    snippet: 'Please approve and reply before 5 PM.',
  });
  const riskMail = makeMail({
    id: 'prio-risk',
    from: 'security@example.com',
    subject: 'Security warning on your account',
    snippet: 'Suspicious access detected.',
    date: new Date('2026-04-19T11:00:00Z'),
  });
  const lowMail = makeMail({
    id: 'prio-low',
    from: 'newsletter@example.com',
    subject: 'Weekly digest',
    snippet: 'Top stories of the week.',
    date: new Date('2026-04-19T09:00:00Z'),
  });

  const mails = [highMail, riskMail, lowMail];
  const routingResults: MailRoutingResultEntry[] = [
    {
      id: highMail.id,
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 70,
          urgency_score: 68,
          actionability_score: 92,
          risk_score: 18,
          density_score: 30,
          relationship_score: 35,
          total_light_score: 73,
          force_upgrade: false,
          recommended_depth: 'advanced',
          reasons: ['reply requested'],
        },
        smart_folder: { family: 'generic', folder: 'Priority/High', reasons: ['reply requested'] },
      },
    },
    {
      id: riskMail.id,
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 55,
          urgency_score: 40,
          actionability_score: 35,
          risk_score: 88,
          density_score: 22,
          relationship_score: 15,
          total_light_score: 57,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: ['security alert'],
        },
        smart_folder: { family: 'generic', folder: 'Priority/Risk', reasons: ['security alert'] },
      },
    },
    {
      id: lowMail.id,
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 5,
          urgency_score: 2,
          actionability_score: 1,
          risk_score: 1,
          density_score: 12,
          relationship_score: 3,
          total_light_score: 9,
          force_upgrade: false,
          recommended_depth: 'light',
          reasons: ['newsletter'],
        },
        smart_folder: { family: 'generic', folder: 'Priority/Low', reasons: ['newsletter'] },
      },
    },
  ];

  const adapter = buildMailRoutingAdapter({
    mails,
    routingResults,
    accountEmails: ['me@example.com'],
  });

  const counts = getPriorityFolderConversationCounts(adapter);
  assert(counts['Priority/High'] === 2, 'Expected high-priority bucket to include urgent and force-upgraded risk conversations');
  assert(counts['Priority/Needs Reply'] === 1, 'Expected one needs-reply conversation');
  assert(counts['Priority/Risk'] === 1, 'Expected one risk conversation');
  assert(counts['Priority/Low'] === 1, 'Expected one low-priority conversation');

  const highRows = buildPriorityConversationRowsForFolder(mails, adapter, 'Priority/High', ['me@example.com']);
  const needsReplyRows = buildPriorityConversationRowsForFolder(mails, adapter, 'Priority/Needs Reply', ['me@example.com']);
  const riskRows = buildPriorityConversationRowsForFolder(mails, adapter, 'Priority/Risk', ['me@example.com']);
  const lowRows = buildPriorityConversationRowsForFolder(mails, adapter, 'Priority/Low', ['me@example.com']);

  assert(
    highRows.length === 2 &&
      highRows.some((row) => row.id === highMail.id) &&
      highRows.some((row) => row.id === riskMail.id),
    'Expected high folder to contain urgent reply and force-upgraded risk mail'
  );
  assert(needsReplyRows.length === 1 && needsReplyRows[0].id === highMail.id, 'Expected needs-reply folder to contain urgent reply mail');
  assert(riskRows.length === 1 && riskRows[0].id === riskMail.id, 'Expected risk folder to contain security mail');
  assert(lowRows.length === 1 && lowRows[0].id === lowMail.id, 'Expected low folder to contain newsletter mail');

  const riskMails = filterMailsForPriorityFolder(mails, adapter, 'Priority/Risk');
  assert(riskMails.length === 1 && riskMails[0].id === riskMail.id, 'Expected raw priority mail filter to keep only risk mail');
}

function testPriorityFolderReturnsEmptyWithoutRoutingResults() {
  const mail = makeMail({
    id: 'prio-none',
    subject: 'Please review this',
    snippet: 'Review requested',
  });
  const adapter = buildMailRoutingAdapter({
    mails: [mail],
    routingResults: [],
    accountEmails: ['me@example.com'],
  });

  const rows = buildPriorityConversationRowsForFolder([mail], adapter, 'Priority/High', ['me@example.com']);
  const mailsOnly = filterMailsForPriorityFolder([mail], adapter, 'Priority/High');
  assert(rows.length === 0, `Expected empty priority rows without routing results, got ${rows.length}`);
  assert(mailsOnly.length === 0, `Expected empty priority mail filter without routing results, got ${mailsOnly.length}`);
}

function testPersistedScanResultRestoresPriorityMembershipAfterReload() {
  const highMail = makeMail({
    id: 'persisted-high',
    from: 'boss@example.com',
    fromName: 'Boss',
    subject: 'Please handle this today',
    snippet: 'This was scanned in a previous session.',
    scanResult: 'Priority/High',
    isScanned: true,
  });

  const adapter = buildMailRoutingAdapter({
    mails: [highMail],
    routingResults: [],
    accountEmails: ['me@example.com'],
  });

  const rows = buildPriorityConversationRowsForFolder([highMail], adapter, 'Priority/High', ['me@example.com']);
  assert(rows.length === 1 && rows[0].id === highMail.id, 'Expected persisted Priority/High scan result to restore folder rows');
}

function testRoutingFolderThreadFilterKeepsOnlyMatchingPriorityMails() {
  const highMail = makeMail({
    id: 'thread-high',
    from: 'same@example.com',
    fromName: 'Same Sender',
    subject: 'Urgent approval needed',
    snippet: 'Please approve this today.',
    date: new Date('2026-04-19T12:00:00Z'),
  });
  const lowMail = makeMail({
    id: 'thread-low',
    from: 'same@example.com',
    fromName: 'Same Sender',
    subject: 'Monthly newsletter',
    snippet: 'A passive update for later reading.',
    date: new Date('2026-04-19T11:00:00Z'),
  });

  const adapter = buildMailRoutingAdapter({
    mails: [highMail, lowMail],
    routingResults: [
      {
        id: highMail.id,
        routing: {
          kind: 'generic',
          light_scan: {
            importance_score: 70,
            urgency_score: 70,
            actionability_score: 88,
            risk_score: 12,
            density_score: 20,
            relationship_score: 20,
            total_light_score: 72,
            force_upgrade: false,
            recommended_depth: 'advanced',
            reasons: ['reply requested'],
          },
          smart_folder: { family: 'generic', folder: 'Priority/High', reasons: ['reply requested'] },
        },
      },
      {
        id: lowMail.id,
        routing: {
          kind: 'generic',
          light_scan: {
            importance_score: 5,
            urgency_score: 2,
            actionability_score: 0,
            risk_score: 0,
            density_score: 10,
            relationship_score: 4,
            total_light_score: 8,
            force_upgrade: false,
            recommended_depth: 'light',
            reasons: ['newsletter'],
          },
          smart_folder: { family: 'generic', folder: 'Priority/Low', reasons: ['newsletter'] },
        },
      },
    ],
    accountEmails: ['me@example.com'],
  });

  const highThreadMails = filterMailsForRoutingFolder([highMail, lowMail], adapter, 'Priority/High');
  const lowThreadMails = filterMailsForRoutingFolder([highMail, lowMail], adapter, 'Priority/Low');

  assert(
    highThreadMails.length === 1 && highThreadMails[0].id === highMail.id,
    'Expected Priority/High thread source to contain only high-priority mail from the sender'
  );
  assert(
    lowThreadMails.length === 1 && lowThreadMails[0].id === lowMail.id,
    'Expected Priority/Low thread source to contain only low-priority mail from the sender'
  );
}

function testPriorityFoldersDoNotCollectGithubRoutedMail() {
  const githubMail = makeMail({
    id: 'gh-prio',
    from: 'notifications@github.com',
    subject: '[owner/repo] Review requested (#9)',
    snippet: 'alice requested your review',
  });

  const adapter = buildMailRoutingAdapter({
    mails: [githubMail],
    routingResults: [
      {
        id: githubMail.id,
        routing: {
          kind: 'github',
          light_scan: {
            importance_score: 70,
            urgency_score: 40,
            actionability_score: 85,
            risk_score: 10,
            density_score: 20,
            relationship_score: 15,
            total_light_score: 60,
            force_upgrade: true,
            recommended_depth: 'advanced',
            reasons: ['github review requested'],
          },
          github: {
            parser: 'github',
            is_github: true,
            repository_owner: 'owner',
            repository_name: 'repo',
            repository_full_name: 'owner/repo',
            entity_type: 'pull_request',
            event_type: 'review_requested',
            entity_number: 9,
            entity_title: 'PR 9',
            thread_key: 'github:owner/repo:pull_request:9',
            short_summary: 'Review requested',
            newest_content: 'Please review',
            needs_user_action: true,
            priority_score: 80,
            todo_items: ['Review'],
            reasons: ['review_requested'],
          },
          smart_folder: { family: 'github', folder: 'GitHub/Review Requests', reasons: ['review_requested'] },
        },
      },
    ],
    accountEmails: ['me@example.com'],
  });

  for (const folder of PRIORITY_FOLDER_IDS) {
    assert(
      buildPriorityConversationRowsForFolder([githubMail], adapter, folder, ['me@example.com']).length === 0,
      `Expected GitHub-routed mail not to appear in ${folder}`
    );
  }
}

function testOrdinaryMailMayAppearInAiCategoryAndPriorityView() {
  const ordinaryMail = makeMail({
    id: 'prio-category',
    from: 'manager@example.com',
    subject: 'Please reply with the updated timeline',
    snippet: 'Need your reply today.',
    category: '工作/业务类',
  });

  const adapter = buildMailRoutingAdapter({
    mails: [ordinaryMail],
    routingResults: [
      {
        id: ordinaryMail.id,
        routing: {
          kind: 'generic',
          light_scan: {
            importance_score: 58,
            urgency_score: 60,
            actionability_score: 85,
            risk_score: 10,
            density_score: 24,
            relationship_score: 28,
            total_light_score: 63,
            force_upgrade: false,
            recommended_depth: 'normal',
            reasons: ['reply requested'],
          },
          smart_folder: { family: 'generic', folder: 'Priority/Needs Reply', reasons: ['reply requested'] },
        },
      },
    ],
    accountEmails: ['me@example.com'],
  });

  assert(
    buildPriorityConversationRowsForFolder([ordinaryMail], adapter, 'Priority/Needs Reply', ['me@example.com']).length === 1,
    'Expected ordinary mail to appear in priority needs-reply view'
  );
  assert(
    excludeGithubRoutedMails([ordinaryMail], adapter).length === 1,
    'Expected ordinary mail to remain available to generic AI category views'
  );
}

function testGithubSmartFolderHelpersCoverAllFolders() {
  assert(GITHUB_SMART_FOLDER_IDS.length === 8, `Expected 8 GitHub smart folders, got ${GITHUB_SMART_FOLDER_IDS.length}`);
  for (const folder of GITHUB_SMART_FOLDER_IDS) {
    assert(isGitHubSmartFolderId(folder), `Expected ${folder} to be recognized as a GitHub smart folder`);
  }
  assert(!isGitHubSmartFolderId('github'), 'Expected aggregate github entry not to be treated as a smart subfolder');
}

function testGithubSmartFolderCountsAndFiltering() {
  const mails = [
    makeMail({
      id: 'gh-review',
      from: 'notifications@github.com',
      fromName: 'GitHub',
      subject: '[owner/repo] Review requested (#1)',
      snippet: 'review requested',
    }),
    makeMail({
      id: 'gh-security',
      from: 'notifications@github.com',
      fromName: 'GitHub',
      subject: '[owner/repo] Dependabot alert',
      snippet: 'critical vulnerability',
      date: new Date('2026-04-19T11:00:00Z'),
    }),
    makeMail({
      id: 'gh-release',
      from: 'notifications@github.com',
      fromName: 'GitHub',
      subject: '[owner/repo] Release v1.0.0',
      snippet: 'release available',
      date: new Date('2026-04-19T09:00:00Z'),
    }),
  ];

  const routingResults: MailRoutingResultEntry[] = [
    {
      id: 'gh-review',
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 60,
          urgency_score: 30,
          actionability_score: 80,
          risk_score: 10,
          density_score: 20,
          relationship_score: 15,
          total_light_score: 56,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: ['review_requested'],
        },
        github: {
          parser: 'github',
          is_github: true,
          repository_owner: 'owner',
          repository_name: 'repo',
          repository_full_name: 'owner/repo',
          entity_type: 'pull_request',
          event_type: 'review_requested',
          entity_number: 1,
          entity_title: 'PR 1',
          thread_key: 'github:owner/repo:pull_request:1',
          short_summary: 'Review requested',
          newest_content: 'Please review',
          needs_user_action: true,
          priority_score: 80,
          todo_items: ['Review'],
          reasons: ['review_requested'],
        },
        smart_folder: { family: 'github', folder: 'GitHub/Review Requests', reasons: ['review_requested'] },
      },
    },
    {
      id: 'gh-security',
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 80,
          urgency_score: 50,
          actionability_score: 60,
          risk_score: 90,
          density_score: 20,
          relationship_score: 10,
          total_light_score: 71,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: ['security_alert'],
        },
        github: {
          parser: 'github',
          is_github: true,
          repository_owner: 'owner',
          repository_name: 'repo',
          repository_full_name: 'owner/repo',
          entity_type: 'security',
          event_type: 'security_alert',
          entity_title: 'Security alert',
          thread_key: 'github:owner/repo:security',
          short_summary: 'Security alert',
          newest_content: 'critical vulnerability',
          needs_user_action: true,
          priority_score: 95,
          todo_items: ['Fix vulnerability'],
          reasons: ['security_alert'],
        },
        smart_folder: { family: 'github', folder: 'GitHub/Security', reasons: ['security_alert'] },
      },
    },
    {
      id: 'gh-release',
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 10,
          urgency_score: 0,
          actionability_score: 0,
          risk_score: 0,
          density_score: 10,
          relationship_score: 5,
          total_light_score: 9,
          force_upgrade: true,
          recommended_depth: 'normal',
          reasons: ['github_email'],
        },
        github: {
          parser: 'github',
          is_github: true,
          repository_owner: 'owner',
          repository_name: 'repo',
          repository_full_name: 'owner/repo',
          entity_type: 'release',
          event_type: 'release_update_notification',
          entity_title: 'v1.0.0',
          thread_key: 'github:owner/repo:release',
          short_summary: 'Release available',
          newest_content: 'release available',
          needs_user_action: false,
          priority_score: 8,
          todo_items: [],
          reasons: ['release_update_notification'],
        },
        smart_folder: { family: 'github', folder: 'GitHub/Archived Updates', reasons: ['release'] },
      },
    },
  ];

  const adapter = buildMailRoutingAdapter({
    mails,
    routingResults,
    accountEmails: ['me@example.com'],
  });
  const counts = getGitHubFolderConversationCounts(adapter);
  assert(counts['GitHub/Review Requests'] === 1, 'Expected one review request conversation');
  assert(counts['GitHub/Security'] === 1, 'Expected one security conversation');
  assert(counts['GitHub/Archived Updates'] === 1, 'Expected one archived update conversation');

  const reviewMails = filterMailsForGitHubFolder(mails, adapter, 'GitHub/Review Requests');
  const securityMails = filterMailsForGitHubFolder(mails, adapter, 'GitHub/Security');
  const archivedMails = filterMailsForGitHubFolder(mails, adapter, 'GitHub/Archived Updates');

  assert(reviewMails.length === 1 && reviewMails[0].id === 'gh-review', 'Expected review folder to contain only review mail');
  assert(securityMails.length === 1 && securityMails[0].id === 'gh-security', 'Expected security folder to contain only security mail');
  assert(archivedMails.length === 1 && archivedMails[0].id === 'gh-release', 'Expected archived folder to contain only release mail');
  assert(
    buildGitHubConversationRows(mails, adapter, ['me@example.com']).length ===
      buildGitHubConversationRowsForFolder(mails, adapter, 'GitHub/Review Requests', ['me@example.com']).length +
        buildGitHubConversationRowsForFolder(mails, adapter, 'GitHub/Security', ['me@example.com']).length +
        buildGitHubConversationRowsForFolder(mails, adapter, 'GitHub/Archived Updates', ['me@example.com']).length,
    'Expected aggregate GitHub conversation count to match the union of smart folders'
  );
}

function testGithubSmartFolderReturnsEmptyWithoutRoutingResults() {
  const githubInbound = makeMail({
    id: 'gh-5',
    from: 'notifications@github.com',
    fromName: 'GitHub',
    subject: '[owner/repo] Review requested (#5)',
    snippet: 'alice requested your review',
  });
  const adapter = buildMailRoutingAdapter({
    mails: [githubInbound],
    routingResults: [],
    accountEmails: ['me@example.com'],
  });

  const filtered = filterMailsForGitHubFolder([githubInbound], adapter, 'GitHub/Review Requests');
  const rows = buildGitHubConversationRowsForFolder([githubInbound], adapter, 'GitHub/Review Requests', ['me@example.com']);
  const counts = getGitHubFolderConversationCounts(adapter);
  assert(filtered.length === 1, `Expected local GitHub fallback to keep one mail, got ${filtered.length}`);
  assert(rows.length === 1, `Expected local GitHub fallback to keep one row, got ${rows.length}`);
  assert(counts['GitHub/Review Requests'] === 1, 'Expected local GitHub fallback to populate review request count');
}

function testPersistedScanResultRestoresGithubFolderAfterReload() {
  const githubMail = makeMail({
    id: 'gh-persisted',
    from: 'noreply@github.com',
    fromName: 'GitHub',
    subject: '[GitHub] A new SSH authentication public key was added to your account',
    snippet: 'A new SSH key was added to your account.',
    scanResult: 'GitHub/Security',
    isScanned: true,
  });

  const adapter = buildMailRoutingAdapter({
    mails: [githubMail],
    routingResults: [],
    accountEmails: ['me@example.com'],
  });

  const rows = buildGitHubConversationRowsForFolder([githubMail], adapter, 'GitHub/Security', ['me@example.com']);
  assert(rows.length === 1 && rows[0].id === githubMail.id, 'Expected persisted GitHub/Security scan result to restore folder rows');
}

function testNonGithubMailStillDoesNotEnterGithubFolderWithoutRoutingResults() {
  const ordinaryMail = makeMail({
    id: 'mail-plain',
    from: 'welcome@example.com',
    subject: 'Welcome to the product',
    snippet: 'Let us walk you through the basics',
  });
  const adapter = buildMailRoutingAdapter({
    mails: [ordinaryMail],
    routingResults: [],
    accountEmails: ['me@example.com'],
  });

  const filtered = filterMailsForGitHubFolder([ordinaryMail], adapter, 'GitHub/Low Priority');
  const rows = buildGitHubConversationRowsForFolder([ordinaryMail], adapter, 'GitHub/Low Priority', ['me@example.com']);
  assert(filtered.length === 0, `Expected non-GitHub mail not to enter GitHub folder, got ${filtered.length}`);
  assert(rows.length === 0, `Expected non-GitHub mail not to produce GitHub rows, got ${rows.length}`);
}

function run() {
  testGithubMailEntersDedicatedFolderAndNormalMailDoesNot();
  testFallbackKeepsOldGithubLogicWhenNoRoutingResults();
  testGithubRoutingWinsOverOldBodyGuessingWhenResultsExist();
  testGithubRoutedMailsCanBeExcludedFromGenericCategoryViews();
  testGenericPriorityMembershipIsPreparedWithoutUi();
  testPriorityFolderHelpersCoverAllFolders();
  testPriorityFolderCountsAndFiltering();
  testPriorityFolderReturnsEmptyWithoutRoutingResults();
  testPersistedScanResultRestoresPriorityMembershipAfterReload();
  testRoutingFolderThreadFilterKeepsOnlyMatchingPriorityMails();
  testPriorityFoldersDoNotCollectGithubRoutedMail();
  testOrdinaryMailMayAppearInAiCategoryAndPriorityView();
  testGithubSmartFolderHelpersCoverAllFolders();
  testGithubSmartFolderCountsAndFiltering();
  testGithubSmartFolderReturnsEmptyWithoutRoutingResults();
  testPersistedScanResultRestoresGithubFolderAfterReload();
  testNonGithubMailStillDoesNotEnterGithubFolderWithoutRoutingResults();
  console.log('mail-routing-adapter tests passed');
}

run();
