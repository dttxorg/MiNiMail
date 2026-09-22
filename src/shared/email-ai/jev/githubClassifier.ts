/**
 * Jev-powered GitHub Notification Triage & Priority Classification.
 *
 * References:
 * - sathariels/jevtriage: PR triage gate with choice & confidence floors
 * - ruslanlap/jev-gate: Speculative fan-out (single round-trip multi-question triage)
 * - fatwang2/jev-review-action: PR classification and action routing
 */

import { redactSensitiveEntities } from '../redactSensitiveEntities';
import { getChoiceAnswer, getNoulAnswer, getScoreAnswer } from './client';
import type {
  JevAsker,
  JevQuestions,
  JevSettings,
} from './types';

export type GitHubSmartFolderDestination =
  | 'GitHub/Needs Action'
  | 'GitHub/Review Requests'
  | 'GitHub/Assigned to Me'
  | 'GitHub/Mentions'
  | 'GitHub/CI and Failures'
  | 'GitHub/Security'
  | 'GitHub/Low Priority';

export type GitHubJevPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface GitHubMailTriageInput {
  id: string;
  subject: string;
  from: string;
  fromName?: string;
  snippet?: string;
  bodyText?: string;
  repositoryFullName?: string;
  headers?: Record<string, string | string[] | undefined>;
}

export interface JevGitHubClassification {
  mailId: string;
  matchedFolder: GitHubSmartFolderDestination;
  folderConfidence: number;
  priorityLevel: GitHubJevPriority;
  priorityConfidence: number;
  isHumanBlocking: boolean;
  isHumanBlockingProbability: number;
  urgencyScore: number;
  reason: string;
  isHighConfidence: boolean;
}

/**
 * Builds the typed questions for GitHub notification triage using speculative fan-out.
 */
export function buildGitHubTriageQuestions(mailId: string): JevQuestions {
  return {
    [`folder_${mailId}`]: {
      type: 'choice',
      instructions: `Classify the GitHub notification ${mailId} into the most appropriate destination folder based on the required action:`,
      criteria: {
        needs_action: 'Direct action urgently required from the recipient (failing merge, required check failed, or blocking issue)',
        review_requests: 'Pull request review explicitly requested from recipient or their team',
        assigned: 'Issue or Pull Request assigned directly to the recipient',
        mentions: 'Recipient directly mentioned (@username) in comments or discussions asking for feedback',
        ci_failures: 'Workflow, build, or test failure in a repository or branch (e.g. GitHub Actions failed)',
        security: 'Dependabot alert, vulnerability alert, secret scanning, or security advisory',
        low_priority: 'General commentary, merged PRs, closed issues, star/watch notices, automated weekly digests',
      },
    },
    [`priority_${mailId}`]: {
      type: 'choice',
      instructions: `Determine the engineering triage priority for GitHub notification ${mailId}:`,
      criteria: {
        P0: 'Critical blocker: release blocked, production build broken, or critical security vulnerability',
        P1: 'High priority: review requested, assigned issue/PR, direct mention requiring feedback soon',
        P2: 'Normal priority: routine update, discussion comment, merged/closed PR, passing CI',
        P3: 'Low priority: stars, forks, repository activity digests, bot noise',
      },
    },
    [`blocking_${mailId}`]: {
      type: 'noul',
      instructions: `Does GitHub notification ${mailId} indicate that other team members or a release pipeline are actively waiting on or blocked by the recipient?`,
      criteria: {
        true: 'Recipient is a blocker: review blocking merge, failing check blocking release, assigned blocker',
        false: 'Informational only or recipient is not blocking anyone',
      },
    },
    [`urgency_${mailId}`]: {
      type: 'score',
      instructions: `Rate the urgency of this GitHub notification from 0 (background noise) to 100 (drop everything and unblock):`,
      criteria: [
        '0-25: Digest, star, bot comment, passing build, routine closed item',
        '26-50: Normal comment in subscribed issue, non-urgent discussion',
        '51-75: Review requested, assigned task, direct mention asking for response',
        '76-100: Main branch broken, security vulnerability, release blocker',
      ],
    },
  };
}

/**
 * Prepares the sanitized/redacted state for GitHub triage.
 */
export function buildGitHubTriageState(input: GitHubMailTriageInput): Record<string, unknown> {
  const cleanSubject = redactSensitiveEntities(input.subject || '').redactedText;
  const cleanBody = redactSensitiveEntities(input.bodyText || input.snippet || '').redactedText.slice(0, 2000);

  return {
    github_notification: {
      id: input.id,
      repository: input.repositoryFullName || 'unknown/repository',
      subject: cleanSubject,
      preview: cleanBody,
      from: input.from,
    },
    goal: 'Accurately triage GitHub notification into high-signal folders to separate blockers from background chatter.',
  };
}

const FOLDER_MAP: Record<string, GitHubSmartFolderDestination> = {
  needs_action: 'GitHub/Needs Action',
  review_requests: 'GitHub/Review Requests',
  assigned: 'GitHub/Assigned to Me',
  mentions: 'GitHub/Mentions',
  ci_failures: 'GitHub/CI and Failures',
  security: 'GitHub/Security',
  low_priority: 'GitHub/Low Priority',
};

/**
 * Classifies a GitHub notification using TypeSafe Jev System One.
 */
export async function classifyGitHubWithJev(
  asker: JevAsker,
  input: GitHubMailTriageInput,
  options?: { confidenceThreshold?: number },
): Promise<JevGitHubClassification> {
  const threshold = options?.confidenceThreshold ?? 0.8;
  const state = buildGitHubTriageState(input);
  const questions = buildGitHubTriageQuestions(input.id);

  const response = await asker.ask(state, questions);
  const answers = response.answers || {};

  const folderAns = getChoiceAnswer(answers, `folder_${input.id}`, 'low_priority');
  const priAns = getChoiceAnswer(answers, `priority_${input.id}`, 'P2');
  const blockingProb = getNoulAnswer(answers, `blocking_${input.id}`);
  const urgAns = getScoreAnswer(answers, `urgency_${input.id}`, 30);

  const matchedFolder = FOLDER_MAP[folderAns.choice] || 'GitHub/Low Priority';
  const priorityLevel = (priAns.choice.toUpperCase() as GitHubJevPriority) || 'P2';

  const isHighConfidence = folderAns.confidence >= threshold && priAns.confidence >= threshold;

  return {
    mailId: input.id,
    matchedFolder,
    folderConfidence: folderAns.confidence,
    priorityLevel,
    priorityConfidence: priAns.confidence,
    isHumanBlocking: blockingProb >= 0.5,
    isHumanBlockingProbability: blockingProb,
    urgencyScore: urgAns.score,
    reason: `Jev triage: ${folderAns.choice} (${Math.round(folderAns.confidence * 100)}%), priority ${priorityLevel}`,
    isHighConfidence,
  };
}
