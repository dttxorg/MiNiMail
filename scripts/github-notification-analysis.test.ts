import {
  analyzeGitHubNotification,
  buildGitHubNotificationThread,
  parseEmailMessage,
  parseGitHubDedicatedResult,
  runScanPipeline,
  type GitHubNotificationAnalysis,
} from '../src/shared/email-ai';

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function parseRaw(source: string) {
  return parseEmailMessage({ kind: 'raw', source });
}

async function testPullRequestReviewRequested() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [openai/openai] Re: Improve backup imports (#4812)',
    'Date: Sat, 18 Apr 2026 11:30:00 +0000',
    'Message-ID: <msg-pr-1@github.com>',
    'X-GitHub-Reason: review_requested',
    'X-GitHub-Recipient: user',
    'List-ID: openai/openai <openai.openai.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'alice requested your review on pull request #4812.',
    '',
    'Only the latest change needs attention.',
    '',
    'View it on GitHub:',
    'https://github.com/openai/openai/pull/4812',
    '',
    '>',
    '> older quoted thread',
  ].join('\r\n'));

  const analysis = analyzeGitHubNotification(parsed);
  assertEqual(analysis.kind, 'pull_request');
  assertEqual(analysis.repository.owner, 'openai');
  assertEqual(analysis.repository.repo, 'openai');
  assertEqual(analysis.entityNumber, 4812);
  assertEqual(analysis.reason, 'review_requested');
  assertEqual(analysis.actor, 'alice');
  assertEqual(analysis.needsUserAction, true);
  assert(analysis.priorityScore >= 80, 'review requested should be high priority');
  assert(analysis.shortSummary.includes('review'), 'short summary should mention review');
  assertEqual(analysis.newestContent.includes('older quoted thread'), false, 'newest content must exclude quoted history');
  assert(analysis.replyCaution.includes('Conversation'), 'reply caution should mention Conversation');
}

async function testIssueCommentNotification() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [vercel/next.js] Bug in mail sync (#9001)',
    'Date: Sat, 18 Apr 2026 12:00:00 +0000',
    'Message-ID: <msg-issue-1@github.com>',
    'X-GitHub-Reason: subscribed',
    'List-ID: vercel/next.js <next.js.vercel.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'bob commented on issue #9001.',
    '',
    'I can reproduce this on Windows.',
    '',
    'https://github.com/vercel/next.js/issues/9001',
  ].join('\r\n'));

  const analysis = analyzeGitHubNotification(parsed);
  assertEqual(analysis.kind, 'issue');
  assertEqual(analysis.eventType, 'comment');
  assertEqual(analysis.needsUserAction, false);
  assert(analysis.priorityScore < 60, 'plain subscribed issue comment should not be high priority');
}

async function testDiscussionMention() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [owner/repo] New mention in discussion #77',
    'Date: Sat, 18 Apr 2026 12:05:00 +0000',
    'Message-ID: <msg-discussion-1@github.com>',
    'X-GitHub-Reason: mention',
    'List-ID: owner/repo <repo.owner.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'carol mentioned you in discussion #77.',
    'https://github.com/owner/repo/discussions/77',
  ].join('\r\n'));

  const analysis = analyzeGitHubNotification(parsed);
  assertEqual(analysis.kind, 'discussion');
  assertEqual(analysis.needsUserAction, true);
  assert(analysis.priorityScore >= 70, 'discussion mention should be actionable');
}

async function testWorkflowFailure() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [owner/repo] workflow run failed: CI',
    'Date: Sat, 18 Apr 2026 12:10:00 +0000',
    'Message-ID: <msg-workflow-1@github.com>',
    'X-GitHub-Reason: ci_activity',
    'List-ID: owner/repo <repo.owner.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'dora triggered a workflow run that failed.',
    'https://github.com/owner/repo/actions/runs/123456789',
  ].join('\r\n'));

  const analysis = analyzeGitHubNotification(parsed);
  assertEqual(analysis.kind, 'workflow');
  assertEqual(analysis.eventType, 'workflow_failed');
  assertEqual(analysis.needsUserAction, true);
  assert(analysis.priorityScore >= 70, 'workflow failure should be important');
}

async function testSecurityAlert() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [owner/repo] Dependabot alert: critical vulnerability',
    'Date: Sat, 18 Apr 2026 12:15:00 +0000',
    'Message-ID: <msg-security-1@github.com>',
    'X-GitHub-Reason: security_alert',
    'List-ID: owner/repo <repo.owner.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'A critical security vulnerability needs your attention.',
    'https://github.com/owner/repo/security/dependabot/42',
  ].join('\r\n'));

  const analysis = analyzeGitHubNotification(parsed);
  assertEqual(analysis.kind, 'security');
  assertEqual(analysis.needsUserAction, true);
  assert(analysis.priorityScore >= 90, 'security alert should be highest priority');
}

async function testWeakSubjectGithubMailStillRecognizedByHeadersAndBody() {
  const parsed = await parseRaw([
    'From: alerts@github.com',
    'To: User <user@example.com>',
    'Subject: Notification',
    'Date: Sat, 18 Apr 2026 12:18:00 +0000',
    'Message-ID: <msg-weak-gh-1@github.com>',
    'X-GitHub-Reason: review_requested',
    'List-ID: owner/repo <repo.owner.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'alice requested your review on pull request #42.',
    'View it on GitHub: https://github.com/owner/repo/pull/42',
  ].join('\r\n'));

  const dedicated = parseGitHubDedicatedResult(parsed);
  assertEqual(dedicated.event_type, 'review_requested');
  assertEqual(dedicated.repository_full_name, 'owner/repo');

  const pipeline = runScanPipeline({
    subject: parsed.subject,
    from: 'alerts@github.com',
    fromName: 'GitHub Alerts',
    snippet: parsed.plainText.slice(0, 160),
    bodyText: parsed.plainText,
    headers: {
      'x-github-reason': 'review_requested',
      'list-id': 'owner/repo <repo.owner.github.com>',
    },
  });

  assertEqual(pipeline.kind, 'github');
  assertEqual(pipeline.smart_folder.folder, 'GitHub/Review Requests');
}

async function testGithubSecurityMailGeneratesStructuredSuggestions() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [GitHub] A third-party OAuth application has been added to your account',
    'Date: Sat, 18 Apr 2026 12:19:00 +0000',
    'Message-ID: <msg-gh-oauth-security@github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'A third-party OAuth application has been added to your account.',
    'Review the application permissions and revoke access if you do not recognize it.',
    'https://github.com/settings/applications',
  ].join('\r\n'));

  const dedicated = parseGitHubDedicatedResult(parsed);
  assertEqual(dedicated.event_type, 'security_alert');
  assert(dedicated.task_reminders.length > 0, 'Expected task reminders for GitHub security mail');
  assert(
    dedicated.suggested_actions.some((item) => /检查|撤销|review|revoke/i.test(item)),
    'Expected suggested actions for GitHub security mail'
  );
}

async function testSignInReviewMailClassifiedAsSecurityAlert() {
  const parsed = await parseRaw([
    'From: GitHub <noreply@github.com>',
    'To: User <user@example.com>',
    'Subject: [GitHub] Please review this sign in',
    'Date: Sat, 18 Apr 2026 12:20:00 +0000',
    'Message-ID: <msg-gh-signin-review@github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Please review this sign in from a new device.',
    'If this was not you, secure your account immediately.',
    'https://github.com/settings/security-log',
  ].join('\r\n'));

  const dedicated = parseGitHubDedicatedResult(parsed);
  assertEqual(dedicated.event_type, 'security_alert');
  assert(
    dedicated.suggested_actions.some((item) => /登录|设备|账户|sign in/i.test(item)),
    'Expected sign-in security suggestions'
  );
}

async function testPermissionUpdateRequestClassifiedAsSecurityAlert() {
  const parsed = await parseRaw([
    'From: GitHub <noreply@github.com>',
    'To: User <user@example.com>',
    'Subject: [GitHub] Vercel is requesting updated permissions',
    'Date: Sat, 18 Apr 2026 12:22:00 +0000',
    'Message-ID: <msg-gh-permissions@github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Vercel is requesting updated permissions for your GitHub account.',
    'Review the permission request before allowing access.',
    'https://github.com/settings/connections/applications/12345',
  ].join('\r\n'));

  const dedicated = parseGitHubDedicatedResult(parsed);
  assertEqual(dedicated.event_type, 'security_alert');
  assert(
    dedicated.suggested_actions.some((item) => /权限|访问权限|OAuth/i.test(item)),
    'Expected permission security suggestions'
  );
}

async function testCommentFeedbackRemovesBoilerplateAndBotNoise() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: Re: [owner/repo] Improve workflow (PR #18)',
    'Date: Sat, 18 Apr 2026 12:24:00 +0000',
    'Message-ID: <msg-gh-comment-cleanup@github.com>',
    'X-GitHub-Reason: subscribed',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'vercel[bot] left a comment (owner/repo#18)',
    '[vc]: #ksyRG4j7Rqw73DtXpiO5UPzGbjpgH+0zWzT/a9IbXhE=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt9fQ==',
    'The deployment preview is ready for review.',
    'Reply to this email directly or view it on GitHub:',
    'You are receiving this because you are subscribed to this thread.',
    'Message ID: <owner/repo/pull/18/comment@github.com>',
    'https://github.com/owner/repo/pull/18#issuecomment-1',
  ].join('\r\n'));

  const dedicated = parseGitHubDedicatedResult(parsed);
  assertEqual(dedicated.comment_feedback.length > 0, true, 'Expected comment feedback to be generated');
  const feedback = dedicated.comment_feedback[0];
  assert(!/Reply to this email directly/i.test(feedback), 'Expected boilerplate removed from comment feedback');
  assert(!/You are receiving this because/i.test(feedback), 'Expected subscription boilerplate removed');
  assert(!/\[vc\]:/i.test(feedback), 'Expected bot payload marker removed');
  assert(/deployment preview/i.test(feedback), 'Expected meaningful comment content preserved');
}

async function testThreadAggregation() {
  const mailA = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [owner/repo] Re: Improve parser (#42)',
    'Date: Sat, 18 Apr 2026 11:00:00 +0000',
    'Message-ID: <msg-thread-a@github.com>',
    'X-GitHub-Reason: subscribed',
    'List-ID: owner/repo <repo.owner.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'alice commented.',
    'https://github.com/owner/repo/pull/42',
  ].join('\r\n'));
  const mailB = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [owner/repo] Re: Improve parser (#42)',
    'Date: Sat, 18 Apr 2026 13:00:00 +0000',
    'Message-ID: <msg-thread-b@github.com>',
    'X-GitHub-Reason: review_requested',
    'List-ID: owner/repo <repo.owner.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'bob requested your review.',
    'https://github.com/owner/repo/pull/42',
  ].join('\r\n'));

  const analyses: GitHubNotificationAnalysis[] = [
    analyzeGitHubNotification(mailA),
    analyzeGitHubNotification(mailB),
  ];
  const thread = buildGitHubNotificationThread(analyses);

  assertEqual(thread.threadKey, 'owner/repo#42');
  assertEqual(thread.messages.length, 2);
  assertEqual(thread.latest.messageId, '<msg-thread-b@github.com>');
  assertEqual(thread.needsUserAction, true);
  assert(thread.todoItems.some((item: string) => /review/i.test(item)), 'thread todo should keep actionable review item');
}

async function run() {
  await testPullRequestReviewRequested();
  await testIssueCommentNotification();
  await testDiscussionMention();
  await testWorkflowFailure();
  await testSecurityAlert();
  await testWeakSubjectGithubMailStillRecognizedByHeadersAndBody();
  await testGithubSecurityMailGeneratesStructuredSuggestions();
  await testSignInReviewMailClassifiedAsSecurityAlert();
  await testPermissionUpdateRequestClassifiedAsSecurityAlert();
  await testCommentFeedbackRemovesBoilerplateAndBotNoise();
  await testThreadAggregation();
  console.log('github-notification-analysis tests passed');
}

void run();
