import { buildNeedsReplyCandidateExport, type NeedsReplyCandidateSource } from '../src/shared/email-ai';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testBuildNeedsReplyCandidateExportSelectsExplicitReplyCandidates() {
  const sources: NeedsReplyCandidateSource[] = [
    {
      id: 'candidate-1',
      subject: 'Please reply with your approval today',
      from: 'manager@example.com',
      date: '2026-04-19T10:00:00.000Z',
      snippet: 'Please review and reply with your approval by 5 PM.',
      body_text: 'Please review and reply with your approval by 5 PM so we can finalize the plan.',
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 48,
          urgency_score: 36,
          actionability_score: 62,
          risk_score: 6,
          density_score: 22,
          relationship_score: 28,
          total_light_score: 49,
          force_upgrade: false,
          recommended_depth: 'normal',
          reasons: [
            'explicit review/reply/approval/pay action requested',
            'sender appears relationship-relevant',
          ],
        },
        smart_folder: {
          family: 'generic',
          folder: 'Priority/Needs Reply',
          reasons: ['reply requested'],
        },
      },
    },
  ];

  const result = buildNeedsReplyCandidateExport({ sources, appLanguage: 'zh' });
  assert(result.mail_count === 1, `Expected 1 candidate, got ${result.mail_count}`);
  const candidate = result.candidates[0];
  assert(candidate.mail_id === 'candidate-1', 'Expected candidate mail id to match');
  assert(candidate.current_matched_folder === 'Priority/Needs Reply', 'Expected current matched folder to be included');
  assert(candidate.preview_text.length > 0, 'Expected preview text to be exported');
  assert(candidate.candidate_reasons.length > 0, 'Expected candidate reasons to be present');
  assert(candidate.why_candidate.length > 0, 'Expected explanation text to be present');
}

function testBuildNeedsReplyCandidateExportFallsBackSafelyWithoutSources() {
  const result = buildNeedsReplyCandidateExport({ sources: [], appLanguage: 'zh' });
  assert(result.mail_count === 0, `Expected 0 candidates, got ${result.mail_count}`);
  assert(result.candidates.length === 0, 'Expected empty candidates when no sources are provided');
}

function testNewsletterMarketingAndGithubMailAreExcluded() {
  const sources: NeedsReplyCandidateSource[] = [
    {
      id: 'newsletter-1',
      subject: 'Weekly digest: top stories this week',
      from: 'news@example.com',
      snippet: 'Read this week and unsubscribe any time.',
      body_text: 'Top stories this week. Unsubscribe any time.',
      routing: {
        kind: 'generic',
        light_scan: {
          importance_score: 12,
          urgency_score: 0,
          actionability_score: 18,
          risk_score: 0,
          density_score: 24,
          relationship_score: 8,
          total_light_score: 18,
          force_upgrade: false,
          recommended_depth: 'light',
          reasons: ['newsletter/promotional signals reduce urgency'],
        },
        smart_folder: {
          family: 'generic',
          folder: 'Priority/Low',
          reasons: ['newsletter'],
        },
      },
    },
    {
      id: 'github-1',
      subject: '[GitHub] Review requested',
      from: 'notifications@github.com',
      snippet: 'alice requested your review',
      body_text: 'alice requested your review on a pull request.',
      routing: {
        kind: 'github',
        light_scan: {
          importance_score: 50,
          urgency_score: 20,
          actionability_score: 55,
          risk_score: 0,
          density_score: 24,
          relationship_score: 8,
          total_light_score: 38,
          force_upgrade: true,
          recommended_depth: 'advanced',
          reasons: ['github-reason:review_requested', 'force-upgrade:github_email'],
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
          short_summary: 'Review requested',
          newest_content: 'Please review this pull request.',
          needs_user_action: true,
          priority_score: 82,
          todo_items: ['Review the PR'],
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

  const result = buildNeedsReplyCandidateExport({ sources, appLanguage: 'zh' });
  assert(result.mail_count === 0, `Expected excluded samples not to become candidates, got ${result.mail_count}`);
}

function run() {
  testBuildNeedsReplyCandidateExportSelectsExplicitReplyCandidates();
  testBuildNeedsReplyCandidateExportFallsBackSafelyWithoutSources();
  testNewsletterMarketingAndGithubMailAreExcluded();
  console.log('needs-reply-candidates tests passed');
}

run();
