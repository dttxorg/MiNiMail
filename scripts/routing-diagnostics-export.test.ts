import { buildRoutingDiagnosticsExport, type RoutingDiagnosticsSource } from '../src/shared/email-ai';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testBuildRoutingDiagnosticsExportIncludesPriorityAndGithubFields() {
  const routingResults: RoutingDiagnosticsSource[] = [
    {
      id: 'mail-priority',
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 68,
          urgency_score: 71,
          actionability_score: 84,
          risk_score: 24,
          density_score: 42,
          relationship_score: 33,
          total_light_score: 72,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: [
            'importance signals from sender/topic',
            'explicit review/reply/approval/pay action requested',
            'force-upgrade:important_contact',
          ],
        },
        smart_folder: {
          family: 'generic',
          folder: 'Priority/High',
          reasons: ['high score'],
        },
      },
    },
    {
      id: 'mail-github',
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 55,
          urgency_score: 30,
          actionability_score: 82,
          risk_score: 12,
          density_score: 28,
          relationship_score: 16,
          total_light_score: 58,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: [
            'github-reason:review_requested',
            'github:needs-user-action',
            'force-upgrade:github_email',
          ],
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
  ];

  const exportResult = buildRoutingDiagnosticsExport({
    routingResults,
    metadataById: {
      'mail-priority': {
        subject: 'Approve budget today',
        from: 'boss@example.com',
        date: '2026-04-19T10:00:00.000Z',
      },
      'mail-github': {
        subject: '[openai/codex] Review requested (#42)',
        from: 'notifications@github.com',
        date: '2026-04-19T11:00:00.000Z',
      },
    },
    appLanguage: 'en',
  });

  assert(exportResult.mail_count === 2, `Expected 2 diagnostics, got ${exportResult.mail_count}`);

  const priority = exportResult.diagnostics.find((entry) => entry.mail_id === 'mail-priority');
  const github = exportResult.diagnostics.find((entry) => entry.mail_id === 'mail-github');

  assert(priority, 'Expected priority diagnostics entry');
  assert(github, 'Expected GitHub diagnostics entry');

  assert(priority.matched_folder === 'Priority/High', 'Expected priority mail to match Priority/High');
  assert(priority.all_matched_folders.includes('Priority/Needs Reply'), 'Expected overlapping priority bucket to be preserved');
  assert(priority.folder_reason.length > 0, 'Expected folder_reason for priority mail');
  assert(priority.key_scores.density_score === 42, 'Expected density score to be exported');
  assert(priority.force_upgrade_reason === 'Important contact', 'Expected humanized force-upgrade reason');
  assert(priority.recommended_depth === 'advanced', 'Expected recommended depth to be exported');

  assert(github.matched_folder === 'GitHub/Review Requests', 'Expected GitHub mail to match review requests folder');
  assert(github.github_event_type === 'review_requested', 'Expected GitHub event type to be exported');
  assert(github.top_routing_reasons.length > 0, 'Expected GitHub top reasons to be exported');

  assert(exportResult.summary.folder_counts['Priority/High'] === 1, 'Expected Priority/High count');
  assert(exportResult.summary.folder_counts['Priority/Needs Reply'] === 1, 'Expected Priority/Needs Reply overlap count');
  assert(exportResult.summary.folder_counts['GitHub/Review Requests'] === 1, 'Expected GitHub folder count');
  assert(exportResult.summary.force_upgrade_reason_counts['Important contact'] === 1, 'Expected force-upgrade summary count');
  assert(exportResult.summary.recommended_depth_counts.advanced === 2, 'Expected advanced depth count');
  assert(exportResult.summary.github_event_type_counts.review_requested === 1, 'Expected GitHub event summary count');
  assert(
    exportResult.summary.multi_priority_bucket_hits.some((entry) => entry.mail_id === 'mail-priority'),
    'Expected overlapping priority bucket hit to be captured'
  );
}

function testBuildRoutingDiagnosticsExportFallsBackSafelyWithoutRoutingResults() {
  const exportResult = buildRoutingDiagnosticsExport({
    routingResults: [],
    appLanguage: 'en',
  });

  assert(exportResult.mail_count === 0, `Expected 0 diagnostics, got ${exportResult.mail_count}`);
  assert(exportResult.diagnostics.length === 0, 'Expected no diagnostics without routing results');
  assert(Object.keys(exportResult.summary.folder_counts).length === 0, 'Expected empty folder summary');
  assert(exportResult.summary.recommended_depth_counts.light === 0, 'Expected zero light depth count');
  assert(exportResult.summary.recommended_depth_counts.normal === 0, 'Expected zero normal depth count');
  assert(exportResult.summary.recommended_depth_counts.advanced === 0, 'Expected zero advanced depth count');
}

function run() {
  testBuildRoutingDiagnosticsExportIncludesPriorityAndGithubFields();
  testBuildRoutingDiagnosticsExportFallsBackSafelyWithoutRoutingResults();
  console.log('routing-diagnostics-export tests passed');
}

run();
