import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildGitHubTriageQuestions,
  buildGitHubTriageState,
  classifyGitHubWithJev,
} from '../src/shared/email-ai/jev/githubClassifier';
import type {
  JevAsker,
  JevQuestions,
  JevResponse,
  JevState,
} from '../src/shared/email-ai/jev/types';

test('github triage: builds speculative fan-out questions', () => {
  const questions = buildGitHubTriageQuestions('gh_101');
  assert.ok(questions['folder_gh_101']);
  assert.ok(questions['priority_gh_101']);
  assert.ok(questions['blocking_gh_101']);
  assert.ok(questions['urgency_gh_101']);

  assert.equal(questions['folder_gh_101'].type, 'choice');
  assert.equal(questions['priority_gh_101'].type, 'choice');
  assert.equal(questions['blocking_gh_101'].type, 'noul');
  assert.equal(questions['urgency_gh_101'].type, 'score');
});

test('github triage: redacts sensitive info in GitHub triage state', () => {
  const state = buildGitHubTriageState({
    id: 'gh_102',
    repositoryFullName: 'org/repo',
    from: 'notifications@github.com',
    subject: '[org/repo] Secret token exposed for user 13912345678',
    snippet: 'Commit b8ad69 contains API key and contact card 6222021234567890123',
  });

  const notif = (state as any).github_notification;
  assert.ok(!notif.subject.includes('13912345678'));
  assert.ok(!notif.preview.includes('6222021234567890123'));
});

test('github triage: accurately classifies blocking review request (P1)', async () => {
  const mockAsker: JevAsker = {
    async ask(_state: JevState, questions: JevQuestions): Promise<JevResponse> {
      assert.ok(questions['folder_pr_1']);
      return {
        answers: {
          folder_pr_1: { type: 'choice', choice: 'review_requests', confidence: 0.96 },
          priority_pr_1: { type: 'choice', choice: 'P1', confidence: 0.91 },
          blocking_pr_1: { type: 'noul', noul: 0.89 },
          urgency_pr_1: { type: 'score', score: 75, confidence: 0.88 },
        },
      };
    },
  };

  const result = await classifyGitHubWithJev(mockAsker, {
    id: 'pr_1',
    repositoryFullName: 'dttxorg/MiNiMail',
    from: 'notifications@github.com',
    subject: '[dttxorg/MiNiMail] Pull Request #50: Add Jev decision engine (review requested)',
    snippet: '@zhuli requested your review on this pull request.',
  });

  assert.equal(result.matchedFolder, 'GitHub/Review Requests');
  assert.equal(result.priorityLevel, 'P1');
  assert.equal(result.isHumanBlocking, true);
  assert.equal(result.urgencyScore, 75);
  assert.equal(result.isHighConfidence, true);
});

test('github triage: accurately classifies broken build / CI failure (P0 blocker)', async () => {
  const mockAsker: JevAsker = {
    async ask(): Promise<JevResponse> {
      return {
        answers: {
          folder_ci_1: { type: 'choice', choice: 'ci_failures', confidence: 0.98 },
          priority_ci_1: { type: 'choice', choice: 'P0', confidence: 0.94 },
          blocking_ci_1: { type: 'noul', noul: 0.95 },
          urgency_ci_1: { type: 'score', score: 95, confidence: 0.92 },
        },
      };
    },
  };

  const result = await classifyGitHubWithJev(mockAsker, {
    id: 'ci_1',
    repositoryFullName: 'dttxorg/MiNiMail',
    from: 'notifications@github.com',
    subject: 'Run failed: Release Pipeline · dttxorg/MiNiMail@main',
    snippet: 'Required status check "test:release" failed on main branch. Merge blocked.',
  });

  assert.equal(result.matchedFolder, 'GitHub/CI and Failures');
  assert.equal(result.priorityLevel, 'P0');
  assert.equal(result.isHumanBlocking, true);
  assert.equal(result.urgencyScore, 95);
  assert.equal(result.isHighConfidence, true);
});

test('github triage: accurately classifies dependabot security alert (P0)', async () => {
  const mockAsker: JevAsker = {
    async ask(): Promise<JevResponse> {
      return {
        answers: {
          folder_sec_1: { type: 'choice', choice: 'security', confidence: 0.99 },
          priority_sec_1: { type: 'choice', choice: 'P0', confidence: 0.95 },
          blocking_sec_1: { type: 'noul', noul: 0.70 },
          urgency_sec_1: { type: 'score', score: 90, confidence: 0.90 },
        },
      };
    },
  };

  const result = await classifyGitHubWithJev(mockAsker, {
    id: 'sec_1',
    repositoryFullName: 'dttxorg/MiNiMail',
    from: 'notifications@github.com',
    subject: '[Security Advisory] Critical vulnerability detected in dependency',
    snippet: 'Dependabot identified a critical CVE vulnerability in package.json.',
  });

  assert.equal(result.matchedFolder, 'GitHub/Security');
  assert.equal(result.priorityLevel, 'P0');
  assert.equal(result.isHighConfidence, true);
});
