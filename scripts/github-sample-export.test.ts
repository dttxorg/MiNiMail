import {
  buildGitHubSampleExport,
  type RoutingDiagnosticsSource,
} from '../src/shared/email-ai';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testBuildGitHubSampleExport() {
  const routingResults: RoutingDiagnosticsSource[] = [
    {
      id: 'mail-github-security',
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 58,
          urgency_score: 44,
          actionability_score: 36,
          risk_score: 72,
          density_score: 18,
          relationship_score: 12,
          total_light_score: 55,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: ['github:security', 'force-upgrade:github_email'],
        },
        github: {
          parser: 'github',
          is_github: true,
          repository_owner: 'unknown',
          repository_name: 'unknown',
          repository_full_name: 'unknown/unknown',
          entity_type: 'security',
          event_type: 'security_alert',
          entity_title: 'A third-party OAuth application has been added to your account',
          thread_key: 'github:security:1',
          short_summary: 'unknown/unknown security alert',
          newest_content: 'Review the application permissions and revoke access if you do not recognize it.',
          needs_user_action: true,
          priority_score: 95,
          todo_items: ['Inspect security alert'],
          task_reminders: ['检查 GitHub 账号的安全警报并尽快处理'],
          comment_feedback: [],
          review_reminders: [],
          suggested_actions: ['检查新增的 OAuth 应用是否可信，必要时撤销权限'],
          reasons: ['github:security'],
        },
        smart_folder: {
          family: 'github',
          folder: 'GitHub/Security',
          reasons: ['security alert'],
        },
      },
    },
    {
      id: 'mail-non-github',
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 12,
          urgency_score: 0,
          actionability_score: 0,
          risk_score: 0,
          density_score: 10,
          relationship_score: 8,
          total_light_score: 10,
          force_upgrade: false,
          recommended_depth: 'light',
          reasons: [],
        },
        smart_folder: {
          family: 'generic',
          folder: 'Priority/Low',
          reasons: [],
        },
      },
    },
  ];

  const exportResult = buildGitHubSampleExport({
    routingResults,
    metadataById: {
      'mail-github-security': {
        subject: '[GitHub] A third-party OAuth application has been added to your account',
        from: 'noreply@github.com',
        date: '2026-04-20T00:00:00.000Z',
      },
    },
  });

  assert(exportResult.mail_count === 1, 'Expected only GitHub samples to be exported');
  assert(exportResult.samples.length === 1, 'Expected one GitHub sample');
  const sample = exportResult.samples[0];
  assert(sample.mail_id === 'mail-github-security', 'Expected correct sample id');
  assert(sample.matched_folder === 'GitHub/Security', 'Expected matched folder exported');
  assert(sample.github_event_type === 'security_alert', 'Expected GitHub event exported');
  assert(sample.suggested_actions.length === 1, 'Expected suggested actions exported');
  assert(exportResult.summary.folder_counts['GitHub/Security'] === 1, 'Expected folder count summary');
  assert(exportResult.summary.event_counts.security_alert === 1, 'Expected event count summary');
}

function run() {
  testBuildGitHubSampleExport();
  console.log('github-sample-export tests passed');
}

run();
