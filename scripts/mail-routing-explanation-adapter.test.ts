import {
  buildMailRoutingAdapter,
  type MailRoutingResultEntry,
} from '../src/renderer/utils/mailRoutingAdapter';
import {
  buildMailRoutingExplanationMap,
  buildMailRoutingDiagnosticsMap,
} from '../src/renderer/utils/mailRoutingExplanationAdapter';

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

function testPriorityHighExplanation() {
  const mail = makeMail({
    id: 'prio-high',
    from: 'boss@example.com',
    subject: 'Urgent: approve budget today',
    snippet: 'Please review and approve today.',
  });

  const routingResults: MailRoutingResultEntry[] = [
    {
      id: mail.id,
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 70,
          urgency_score: 66,
          actionability_score: 88,
          risk_score: 14,
          density_score: 24,
          relationship_score: 36,
          total_light_score: 72,
          force_upgrade: false,
          recommended_depth: 'advanced',
          reasons: [
            'importance signals from sender/topic',
            'urgent timing or deadline language detected',
            'explicit review/reply/approval/pay action requested',
          ],
        },
        smart_folder: { family: 'generic', folder: 'Priority/High', reasons: ['high score'] },
      },
    },
  ];

  const adapter = buildMailRoutingAdapter({ mails: [mail], routingResults, accountEmails: ['me@example.com'] });
  const explanation = buildMailRoutingDiagnosticsMap({
    routingResults,
    routingAdapter: adapter,
    contextFolder: 'Priority/High',
    appLanguage: 'zh',
  })[mail.id];

  assert(explanation, 'Expected Priority/High explanation to exist');
  assert(explanation.mail_id === mail.id, 'Expected diagnostics to carry mail id');
  assert(explanation.matched_folder === 'Priority/High', 'Expected Priority/High folder');
  assert(explanation.family === 'priority', 'Expected priority explanation family');
  assert(explanation.top_routing_reasons.some((reason) => reason.includes('重要性')), 'Expected humanized top reasons');
  assert(explanation.short_explanation_text.includes('高优先级'), 'Expected short explanation to mention high priority');
}

function testPriorityNeedsReplyAndForceUpgradeExplanation() {
  const mail = makeMail({
    id: 'prio-reply',
    from: 'manager@example.com',
    subject: 'Please reply to the client',
    snippet: 'Reply by end of day.',
  });

  const routingResults: MailRoutingResultEntry[] = [
    {
      id: mail.id,
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 58,
          urgency_score: 50,
          actionability_score: 84,
          risk_score: 18,
          density_score: 20,
          relationship_score: 40,
          total_light_score: 61,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: [
            'explicit review/reply/approval/pay action requested',
            'force-upgrade:important_contact',
          ],
        },
        smart_folder: { family: 'generic', folder: 'Priority/Needs Reply', reasons: ['reply requested'] },
      },
    },
  ];

  const adapter = buildMailRoutingAdapter({ mails: [mail], routingResults, accountEmails: ['me@example.com'] });
  const explanation = buildMailRoutingDiagnosticsMap({
    routingResults,
    routingAdapter: adapter,
    contextFolder: 'Priority/Needs Reply',
    appLanguage: 'zh',
  })[mail.id];

  assert(explanation, 'Expected Priority/Needs Reply explanation');
  assert(explanation.matched_folder === 'Priority/Needs Reply', 'Expected needs-reply folder');
  assert(explanation.force_upgrade_reason === '重要联系人', 'Expected force-upgrade reason to be humanized');
  assert(explanation.recommended_depth === 'advanced', 'Expected depth to be preserved');
}

function testPriorityRiskExplanation() {
  const mail = makeMail({
    id: 'prio-risk',
    from: 'security@example.com',
    subject: 'Suspicious login detected',
    snippet: 'Security alert for your account',
  });

  const routingResults: MailRoutingResultEntry[] = [
    {
      id: mail.id,
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 62,
          urgency_score: 38,
          actionability_score: 20,
          risk_score: 91,
          density_score: 14,
          relationship_score: 10,
          total_light_score: 57,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: [
            'security, fraud, payment, or legal risk language detected',
            'force-upgrade:security_alert',
          ],
        },
        smart_folder: { family: 'generic', folder: 'Priority/Risk', reasons: ['security alert'] },
      },
    },
  ];

  const adapter = buildMailRoutingAdapter({ mails: [mail], routingResults, accountEmails: ['me@example.com'] });
  const explanation = buildMailRoutingDiagnosticsMap({
    routingResults,
    routingAdapter: adapter,
    contextFolder: 'Priority/Risk',
    appLanguage: 'zh',
  })[mail.id];

  assert(explanation, 'Expected Priority/Risk explanation');
  assert(explanation.matched_folder === 'Priority/Risk', 'Expected risk folder');
  assert(explanation.short_explanation_text.includes('风险'), 'Expected risk explanation text');
}

function testGithubExplanation() {
  const mail = makeMail({
    id: 'gh-review',
    from: 'notifications@github.com',
    fromName: 'GitHub',
    subject: '[owner/repo] Review requested (#12)',
    snippet: 'alice requested your review',
  });

  const routingResults: MailRoutingResultEntry[] = [
    {
      id: mail.id,
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 60,
          urgency_score: 42,
          actionability_score: 80,
          risk_score: 12,
          density_score: 20,
          relationship_score: 18,
          total_light_score: 58,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: ['github-reason:review_requested', 'github:needs-user-action', 'force-upgrade:github_email'],
        },
        github: {
          parser: 'github',
          is_github: true,
          repository_owner: 'owner',
          repository_name: 'repo',
          repository_full_name: 'owner/repo',
          entity_type: 'pull_request',
          event_type: 'review_requested',
          entity_number: 12,
          entity_title: 'PR 12',
          thread_key: 'github:owner/repo:pull_request:12',
          reason_for_recipient: 'review_requested',
          actor: 'alice',
          url: 'https://github.com/owner/repo/pull/12',
          short_summary: 'Review requested',
          newest_content: 'Please review',
          needs_user_action: true,
          priority_score: 84,
          todo_items: ['Review PR'],
          reply_caution: 'Email reply goes to conversation only',
          reasons: ['github-reason:review_requested', 'github:needs-user-action'],
        },
        smart_folder: { family: 'github', folder: 'GitHub/Review Requests', reasons: ['review requested'] },
      },
    },
  ];

  const adapter = buildMailRoutingAdapter({ mails: [mail], routingResults, accountEmails: ['me@example.com'] });
  const explanation = buildMailRoutingDiagnosticsMap({
    routingResults,
    routingAdapter: adapter,
    contextFolder: 'GitHub/Review Requests',
    appLanguage: 'zh',
  })[mail.id];

  assert(explanation, 'Expected GitHub explanation');
  assert(explanation.matched_folder === 'GitHub/Review Requests', 'Expected GitHub review requests folder');
  assert(explanation.family === 'github', 'Expected github family');
  assert(explanation.github_event_type === 'review_requested', 'Expected GitHub event type to be visible');
  assert(explanation.top_routing_reasons.some((reason) => reason.includes('评审') || reason.includes('GitHub')), 'Expected GitHub reason label');
}

function testNoRoutingResultsFallback() {
  const adapter = buildMailRoutingAdapter({
    mails: [makeMail({ id: 'plain-mail' })],
    routingResults: [],
    accountEmails: ['me@example.com'],
  });

  const explanations = buildMailRoutingDiagnosticsMap({
    routingResults: [],
    routingAdapter: adapter,
    contextFolder: 'Priority/High',
    appLanguage: 'zh',
  });

  assert(Object.keys(explanations).length === 0, 'Expected empty explanation map without routing results');
}

function testExplanationAdapterDoesNotLeakPipelineFields() {
  const mail = makeMail({ id: 'shape-mail' });
  const routingResults: MailRoutingResultEntry[] = [
    {
      id: mail.id,
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 58,
          urgency_score: 60,
          actionability_score: 84,
          risk_score: 18,
          density_score: 20,
          relationship_score: 40,
          total_light_score: 61,
          force_upgrade: false,
          recommended_depth: 'normal',
          reasons: ['explicit review/reply/approval/pay action requested'],
        },
        smart_folder: { family: 'generic', folder: 'Priority/Needs Reply', reasons: ['reply requested'] },
      },
    },
  ];

  const adapter = buildMailRoutingAdapter({ mails: [mail], routingResults, accountEmails: ['me@example.com'] });
  const explanation = buildMailRoutingDiagnosticsMap({
    routingResults,
    routingAdapter: adapter,
    contextFolder: 'Priority/Needs Reply',
    appLanguage: 'en',
  })[mail.id];

  assert(explanation, 'Expected explanation shape');
  assert(!('kind' in explanation), 'Expected diagnostics not to leak routing kind');
  assert(!('light_scan' in explanation), 'Expected explanation not to leak light_scan');
  assert(!('github' in explanation), 'Expected explanation not to leak github payload');
}

function run() {
  testPriorityHighExplanation();
  testPriorityNeedsReplyAndForceUpgradeExplanation();
  testPriorityRiskExplanation();
  testGithubExplanation();
  testNoRoutingResultsFallback();
  testExplanationAdapterDoesNotLeakPipelineFields();
  console.log('mail-routing-explanation-adapter tests passed');
}

run();
