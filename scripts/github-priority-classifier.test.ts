import assert from 'node:assert/strict';
import { parseEmailMessage } from '../src/shared/email-ai/parseEmailMessage';
import { parseGitHubDedicatedResult } from '../src/shared/email-ai/githubNotifications';
import { classifyGitHubPriority } from '../src/shared/email-ai/githubPriorityClassifier';
import { maskGitHubSensitive } from '../src/shared/email-ai/redactSensitiveEntities';

function classify(overrides: Partial<Parameters<typeof classifyGitHubPriority>[0]> = {}) {
  return classifyGitHubPriority({
    kind: 'pull_request',
    eventType: 'comment',
    subject: '[owner/repo] Update (#42)',
    newestContent: 'Routine update',
    needsUserAction: false,
    repositoryFullName: 'owner/repo',
    entityNumber: 42,
    ...overrides,
  });
}

assert.equal(classify({
  kind: 'workflow',
  eventType: 'workflow_failed',
  subject: '[owner/repo] workflow run failed: CI',
  newestContent: 'The required check failed.',
  needsUserAction: true,
}).priorityLevel, 'P0_URGENT');

assert.equal(classify({
  eventType: 'review_requested',
  reason: 'review_requested',
  newestContent: 'requested your review on pull request #42.',
  needsUserAction: true,
}).priorityLevel, 'P1_IMPORTANT');

assert.equal(classify({
  eventType: 'comment',
  newestContent: 'commented on pull request #42.',
}).priorityLevel, 'P2_NORMAL');

assert.equal(classify({
  kind: 'repository',
  eventType: 'unknown',
  subject: '[owner/repo] Someone starred owner/repo',
  newestContent: 'A user starred your repository.',
}).priorityLevel, 'P3_LOW');

const masked = maskGitHubSensitive([
  'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
  'github_pat_abcdefghijklmnopqrstuvwxyz_1234567890',
  'Contact maintainer@example.invalid',
  'https://github.com/owner/repo/actions?token=secret-value&email=user@example.invalid',
  'CI_SECRET_TOKEN=secret-value',
].join('\n'));

assert(masked.includes('Authorization: Bearer [SECRET]'));
assert(masked.includes('[GITHUB_TOKEN]'));
assert(masked.includes('[EMAIL]'));
assert(masked.includes('token=[REDACTED]'));
assert(masked.includes('[CI_SECRET_LINE_REDACTED]'));

const parsed = await parseEmailMessage({
  kind: 'raw',
  source: [
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.invalid>',
    'Subject: [owner/repo] Re: Improve parser (#42)',
    'Date: Sat, 18 Apr 2026 11:30:00 +0000',
    'Message-ID: <msg-pr-comment@github.com>',
    'X-GitHub-Reason: subscribed',
    'List-ID: owner/repo <repo.owner.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'contributor commented on pull request #42.',
    'Private implementation detail and maintainer@example.invalid should not be exposed.',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    'https://github.com/owner/repo/pull/42',
  ].join('\r\n'),
});
const dedicated = parseGitHubDedicatedResult(parsed);
assert.equal(dedicated.priority_level, 'P2_NORMAL');
assert.equal(dedicated.safe_summary, 'owner/repo #42: pull_request_update');
assert.equal(dedicated.newest_content, 'comment detected; body redacted');
assert.deepEqual(dedicated.comment_feedback, ['comment detected; body redacted']);
assert(!dedicated.newest_content.includes('maintainer'));
assert(!dedicated.newest_content.includes('Authorization'));

console.log('github-priority-classifier tests passed');
