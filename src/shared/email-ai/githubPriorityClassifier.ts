import type {
  GitHubNotificationEventType,
  GitHubNotificationKind,
} from './types';
import type {
  GitHubPriorityClassification,
  GitHubPriorityLevel,
} from './scanTypes';

interface ClassifyGitHubPriorityInput {
  kind: GitHubNotificationKind;
  eventType: GitHubNotificationEventType;
  reason?: string;
  subject: string;
  newestContent: string;
  needsUserAction: boolean;
  repositoryFullName: string;
  entityNumber?: number;
}

const P0_PATTERN = /required check.*fail|branch protection|release.*blocked|release blocker|vulnerab|dependabot|security alert|failed check|checks? failed/i;
const P1_PATTERN = /requested.*your review|assign(?:ed)? you|team mention|code owners?.*requested|review requested|mentioned you/i;
const P2_PATTERN = /commented|review comment|opened|closed|merged|reopened|pushed|updated|succeeded|passed/i;
const P3_PATTERN = /starred|forked|watching|subscribed|new release|released|repository activity/i;
const P1_REASONS = new Set(['review_requested', 'assign', 'mention', 'team_mention']);
const P2_EVENTS = new Set<GitHubNotificationEventType>(['comment', 'state_change', 'push', 'workflow_succeeded']);

function buildSafeSummary(input: ClassifyGitHubPriorityInput, eventCode: string): string {
  const entity = input.entityNumber ? ` #${input.entityNumber}` : '';
  return `${input.repositoryFullName}${entity}: ${eventCode}`;
}

function buildClassification(
  priorityLevel: GitHubPriorityLevel,
  eventCode: string,
  friendlyText: string,
  reasons: string[],
  input: ClassifyGitHubPriorityInput,
): GitHubPriorityClassification {
  return {
    priorityLevel,
    eventCode,
    friendlyText,
    safeSummary: buildSafeSummary(input, eventCode),
    reasons,
  };
}

function detectP0EventCode(input: ClassifyGitHubPriorityInput, text: string): string {
  if (input.reason === 'security_alert' || input.eventType === 'security_alert') return 'security_alert';
  if (input.eventType === 'workflow_failed') return 'workflow_failed';
  if (/branch protection/i.test(text)) return 'branch_protection_failure';
  if (/release.*blocked|release blocker/i.test(text)) return 'release_blocked';
  if (/required check.*fail|failed check|checks? failed/i.test(text)) return 'required_check_failed';
  if (/dependabot|vulnerab|security alert/i.test(text)) return 'security_alert';
  return 'urgent_github_notification';
}

function detectP1EventCode(input: ClassifyGitHubPriorityInput, text: string): string {
  if (/code owners?.*requested/i.test(text)) return 'code_owner_review_requested';
  if (input.eventType === 'review_requested' || input.reason === 'review_requested') return 'review_requested';
  if (input.eventType === 'assign' || input.reason === 'assign') return 'assigned_issue';
  if (input.reason === 'team_mention') return 'team_mention';
  if (input.eventType === 'mention' || input.reason === 'mention') return 'mention';
  return 'github_action_requested';
}

function detectP2EventCode(input: ClassifyGitHubPriorityInput): string {
  if (input.kind === 'pull_request') return 'pull_request_update';
  if (input.kind === 'issue') return 'issue_update';
  if (input.kind === 'discussion') return 'discussion_update';
  if (input.eventType === 'workflow_succeeded') return 'workflow_succeeded';
  return input.eventType === 'unknown' ? 'github_update' : input.eventType;
}

function detectP3EventCode(text: string): string {
  if (/starred/i.test(text)) return 'repository_star';
  if (/forked/i.test(text)) return 'repository_fork';
  if (/watching/i.test(text)) return 'repository_watch';
  if (/release|released/i.test(text)) return 'release_update_notification';
  return 'repository_activity';
}

export function classifyGitHubPriority(input: ClassifyGitHubPriorityInput): GitHubPriorityClassification {
  const reason = input.reason || '';
  const text = `${input.subject}\n${input.newestContent}`;

  if (reason === 'security_alert' || input.eventType === 'workflow_failed' || P0_PATTERN.test(text)) {
    return buildClassification(
      'P0_URGENT',
      detectP0EventCode(input, text),
      'Requires immediate attention',
      ['github:p0', 'github:urgent'],
      input,
    );
  }

  if (P1_REASONS.has(reason) || P1_PATTERN.test(text)) {
    return buildClassification(
      'P1_IMPORTANT',
      detectP1EventCode(input, text),
      'Needs your action',
      ['github:p1', 'github:actionable'],
      input,
    );
  }

  if (['pull_request', 'issue', 'discussion'].includes(input.kind) && (P2_EVENTS.has(input.eventType) || P2_PATTERN.test(text))) {
    return buildClassification(
      'P2_NORMAL',
      detectP2EventCode(input),
      'Routine GitHub update',
      ['github:p2', 'github:update'],
      input,
    );
  }

  if (!input.needsUserAction && (input.kind === 'release' || P3_PATTERN.test(text))) {
    return buildClassification(
      'P3_LOW',
      detectP3EventCode(text),
      'Low-priority GitHub notification',
      ['github:p3', 'github:low-priority'],
      input,
    );
  }

  return buildClassification(
    input.needsUserAction ? 'P1_IMPORTANT' : 'P3_LOW',
    input.needsUserAction ? 'github_action_requested' : 'github_notification',
    input.needsUserAction ? 'Needs your action' : 'Low-priority GitHub notification',
    input.needsUserAction ? ['github:p1', 'github:actionable'] : ['github:p3', 'github:low-priority'],
    input,
  );
}
