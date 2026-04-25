import type {
  GitHubNotificationAnalysis,
  GitHubNotificationEventType,
  GitHubNotificationKind,
  GitHubNotificationThread,
  GitHubRepositoryRef,
  ParsedEmailMessage,
} from './types';
import type {
  GithubDedicatedEventType,
  GithubDedicatedParseResult,
} from './scanTypes';
import { splitEmailBlocks } from './splitEmailBlocks';
import { truncateText } from './utils';
import { routeGitHubSmartFolder } from './smartFolderRouter';

const PR_REPLY_CAUTION = 'Email replies on pull request notifications only go to Conversation and do not count as an official GitHub review.';

function firstHeader(parsed: ParsedEmailMessage, name: string): string | undefined {
  return parsed.headers[name.toLowerCase()]?.[0];
}

function normalizeRepo(owner: string, repo: string): GitHubRepositoryRef {
  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
  };
}

function extractRepoFromListId(listId?: string): GitHubRepositoryRef | null {
  if (!listId) return null;
  const direct = listId.match(/([a-z0-9_.-]+)\/([a-z0-9_.-]+)/i);
  if (direct) return normalizeRepo(direct[1], direct[2]);
  return null;
}

function extractGithubUrl(parsed: ParsedEmailMessage): string | undefined {
  return parsed.links.find((link) => /https:\/\/github\.com\//i.test(link.url))?.url;
}

function extractRepoAndEntityFromUrl(url?: string): {
  repository?: GitHubRepositoryRef;
  kind?: GitHubNotificationKind;
  entityNumber?: number;
} {
  if (!url) return {};

  const prMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (prMatch) {
    return {
      repository: normalizeRepo(prMatch[1], prMatch[2]),
      kind: 'pull_request',
      entityNumber: Number(prMatch[3]),
    };
  }

  const issueMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  if (issueMatch) {
    return {
      repository: normalizeRepo(issueMatch[1], issueMatch[2]),
      kind: 'issue',
      entityNumber: Number(issueMatch[3]),
    };
  }

  const discussionMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/discussions\/(\d+)/i);
  if (discussionMatch) {
    return {
      repository: normalizeRepo(discussionMatch[1], discussionMatch[2]),
      kind: 'discussion',
      entityNumber: Number(discussionMatch[3]),
    };
  }

  const workflowMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/i);
  if (workflowMatch) {
    return {
      repository: normalizeRepo(workflowMatch[1], workflowMatch[2]),
      kind: 'workflow',
      entityNumber: Number(workflowMatch[3]),
    };
  }

  const securityMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/security\//i);
  if (securityMatch) {
    return {
      repository: normalizeRepo(securityMatch[1], securityMatch[2]),
      kind: 'security',
    };
  }

  return {};
}

function parseSubject(parsed: ParsedEmailMessage): {
  repository?: GitHubRepositoryRef;
  entityNumber?: number;
  title: string;
  kind?: GitHubNotificationKind;
} {
  const subject = parsed.subject.trim();
  const subjectRepo = subject.match(/^\[([^[\]]+\/[^[\]]+)\]\s*(.+)$/);
  const repo = subjectRepo?.[1];
  let remainder = subjectRepo?.[2] || subject;
  remainder = remainder.replace(/^(?:re|fw|fwd):\s*/i, '').trim();

  const entityNumberMatch = remainder.match(/\(#(\d+)\)|#(\d+)/);
  const entityNumber = entityNumberMatch ? Number(entityNumberMatch[1] || entityNumberMatch[2]) : undefined;
  const title = remainder
    .replace(/\(#\d+\)/g, '')
    .replace(/\bdiscussion\s+#\d+/i, '')
    .replace(/\bpull request\s+#\d+/i, '')
    .replace(/\bissue\s+#\d+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let kind: GitHubNotificationKind | undefined;
  if (/discussion/i.test(subject)) kind = 'discussion';
  else if (/workflow|actions?\s+run/i.test(subject)) kind = 'workflow';
  else if (/dependabot|security|vulnerability/i.test(subject)) kind = 'security';
  else if (/release/i.test(subject)) kind = 'release';
  else if (/\(#\d+\)/.test(subject) || /pull request|pr #/i.test(subject)) kind = 'pull_request';
  else if (/issue\s+#\d+/i.test(subject)) kind = 'issue';

  return {
    repository: repo ? (() => {
      const [owner, repoName] = repo.split('/', 2);
      return normalizeRepo(owner, repoName);
    })() : undefined,
    entityNumber,
    title,
    kind,
  };
}

function detectKind(reason: string | undefined, subjectKind: GitHubNotificationKind | undefined, urlKind: GitHubNotificationKind | undefined, plainText: string): GitHubNotificationKind {
  const lower = plainText.toLowerCase();
  if (urlKind) return urlKind;
  if (subjectKind) return subjectKind;
  if (reason === 'security_alert') return 'security';
  if (reason === 'ci_activity') return 'workflow';
  if (/verify your device|oauth application has been added|linked to your github account|security key|ssh key|sign-in attempt|review this sign in|updated permissions|requesting updated permissions|permission request/.test(lower)) {
    return 'security';
  }
  if (/discussion/i.test(plainText)) return 'discussion';
  return 'unknown';
}

function buildNewestContent(parsed: ParsedEmailMessage): string {
  const blocks = splitEmailBlocks(parsed.plainText);
  const latest = blocks.latest_reply.map((block) => block.text).join('\n\n').trim();
  if (latest) return truncateText(latest, 400);

  const plain = parsed.plainText
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .trim();
  return truncateText(plain, 400);
}

function extractActor(text: string): string | undefined {
  const patterns = [
    /^([a-z0-9_.-]+)\s+requested your review/i,
    /^([a-z0-9_.-]+)\s+commented/i,
    /^([a-z0-9_.-]+)\s+mentioned you/i,
    /^([a-z0-9_.-]+)\s+assigned you/i,
    /^([a-z0-9_.-]+)\s+triggered/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

function detectEventType(reason: string | undefined, kind: GitHubNotificationKind, subject: string, newestContent: string): GitHubNotificationEventType {
  const combined = `${subject}\n${newestContent}`.toLowerCase();

  if (reason === 'review_requested' || /requested your review/.test(combined)) return 'review_requested';
  if (reason === 'mention' || reason === 'team_mention' || /mentioned you/.test(combined)) return 'mention';
  if (reason === 'assign' || /assigned you/.test(combined)) return 'assign';
  if (/verify your device|oauth application has been added|linked to your github account|security key|ssh key|sign-in attempt|review this sign in|updated permissions|requesting updated permissions|permission request/.test(combined)) return 'security_alert';
  if (kind === 'workflow' && /failed|failure/.test(combined)) return 'workflow_failed';
  if (kind === 'workflow' && /success|succeeded|passed/.test(combined)) return 'workflow_succeeded';
  if (kind === 'security' || reason === 'security_alert') return 'security_alert';
  if (kind === 'release') return 'release';
  if (/commented|comment/.test(combined)) return 'comment';
  if (/closed|merged|reopened|opened/.test(combined)) return 'state_change';
  if (/pushed/.test(combined)) return 'push';
  return 'unknown';
}

function computeNeedsUserAction(reason: string | undefined, kind: GitHubNotificationKind, eventType: GitHubNotificationEventType): boolean {
  if (kind === 'security') return true;
  if (eventType === 'workflow_failed') return true;
  return ['review_requested', 'mention', 'assign'].includes(reason || '') ||
    ['review_requested', 'mention', 'assign'].includes(eventType);
}

function computePriority(kind: GitHubNotificationKind, eventType: GitHubNotificationEventType, needsUserAction: boolean): number {
  let score = 30;
  if (kind === 'security') score = 95;
  else if (eventType === 'review_requested') score = 88;
  else if (eventType === 'assign') score = 82;
  else if (eventType === 'mention') score = 76;
  else if (eventType === 'workflow_failed') score = 74;
  else if (kind === 'pull_request') score = 52;
  else if (kind === 'issue') score = 46;
  else if (kind === 'discussion') score = 42;

  if (!needsUserAction) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function buildTodoItems(kind: GitHubNotificationKind, repository: GitHubRepositoryRef, entityNumber: number | undefined, eventType: GitHubNotificationEventType): string[] {
  if (eventType === 'review_requested' && entityNumber) {
    return [`Review PR #${entityNumber} in ${repository.fullName}`];
  }
  if (eventType === 'assign' && entityNumber) {
    return [`Handle assigned item #${entityNumber} in ${repository.fullName}`];
  }
  if (eventType === 'mention' && entityNumber) {
    return [`Reply to mention on #${entityNumber} in ${repository.fullName}`];
  }
  if (eventType === 'workflow_failed') {
    return [`Investigate failed workflow in ${repository.fullName}`];
  }
  if (kind === 'security') {
    return [`Inspect security alert in ${repository.fullName}`];
  }
  return [];
}

function buildMergeSuggestion(
  kind: GitHubNotificationKind,
  eventType: GitHubNotificationEventType,
  newestContent: string,
): string | undefined {
  const lower = newestContent.toLowerCase();
  if (kind !== 'pull_request') return undefined;

  if (/approved|all checks have passed|ready to merge|merge when ready|can be merged/i.test(lower)) {
    return '该 PR 可能已具备合并条件，建议确认 CI、审批状态与分支保护规则后再合并。';
  }

  if (eventType === 'review_requested') {
    return '在完成本次代码评审前，不建议直接合并；建议先处理评审意见和必需检查项。';
  }

  return undefined;
}

function buildTaskReminders(
  kind: GitHubNotificationKind,
  repository: GitHubRepositoryRef,
  entityNumber: number | undefined,
  eventType: GitHubNotificationEventType,
): string[] {
  if (eventType === 'review_requested' && entityNumber) {
    return [`跟进 ${repository.fullName} 的 PR #${entityNumber} 评审请求`];
  }
  if (eventType === 'assign' && entityNumber) {
    return [`处理分配给你的 ${repository.fullName} #${entityNumber}`];
  }
  if (eventType === 'mention' && entityNumber) {
    return [`查看并回应 ${repository.fullName} #${entityNumber} 中对你的提及`];
  }
  if (eventType === 'workflow_failed') {
    return [`检查 ${repository.fullName} 的 CI/工作流失败原因`];
  }
  if (kind === 'security') {
    return [`检查 ${repository.fullName} 或 GitHub 账号的安全警报并尽快处理`];
  }
  return [];
}

function buildSecuritySuggestedActions(newestContent: string): string[] {
  const lower = newestContent.toLowerCase();
  const actions: string[] = [];

  if (/oauth application|linked to your github account|application has been added/.test(lower)) {
    actions.push('检查新增的 OAuth 应用或身份绑定是否可信，必要时立即撤销访问权限。');
  }

  if (/verify your device|sign-in attempt|security key|ssh key/.test(lower)) {
    actions.push('检查最近的 GitHub 登录或设备活动，确认是否为本人操作。');
  }

  if (/review this sign in|sign in from a new device|sign in/.test(lower)) {
    actions.push('审查这次 GitHub 登录是否为本人操作；如果不是，请立即修改密码并检查安全设置。');
  }

  if (/updated permissions|requesting updated permissions|permission request/.test(lower)) {
    actions.push('检查第三方应用的权限变更请求，确认仅授予必要权限。');
  }

  return actions;
}

function cleanCommentFeedbackText(newestContent: string): string {
  const normalized = newestContent
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\[vc\]:.*$/gim, ' ')
    .replace(/^Reply to this email directly or view it on GitHub:.*$/gim, ' ')
    .replace(/^You are receiving this because.*$/gim, ' ')
    .replace(/^Message ID:.*$/gim, ' ')
    .replace(/^View it on GitHub:.*$/gim, ' ')
    .replace(/^https:\/\/github\.com\/\S+$/gim, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

function buildCommentFeedback(
  eventType: GitHubNotificationEventType,
  newestContent: string,
): string[] {
  if (!['comment', 'mention'].includes(eventType)) {
    return [];
  }

  const cleaned = cleanCommentFeedbackText(newestContent);
  const excerpt = truncateText(cleaned, 160);
  if (!excerpt) return [];
  return [`评论反馈：${excerpt}`];
}

function buildReviewReminders(
  repository: GitHubRepositoryRef,
  entityNumber: number | undefined,
  eventType: GitHubNotificationEventType,
): string[] {
  if (eventType !== 'review_requested' || !entityNumber) {
    return [];
  }

  return [`代码审核提醒：请评审 ${repository.fullName} 的 PR #${entityNumber}`];
}

function buildSuggestedActions(
  mergeSuggestion: string | undefined,
  taskReminders: string[],
  commentFeedback: string[],
  reviewReminders: string[],
  newestContent: string,
): string[] {
  return Array.from(new Set([
    ...(mergeSuggestion ? [mergeSuggestion] : []),
    ...taskReminders,
    ...commentFeedback,
    ...reviewReminders,
    ...buildSecuritySuggestedActions(newestContent),
  ]));
}

function buildShortSummary(repository: GitHubRepositoryRef, entityNumber: number | undefined, eventType: GitHubNotificationEventType, actor: string | undefined): string {
  const entityLabel = entityNumber ? `${repository.fullName}#${entityNumber}` : repository.fullName;
  if (eventType === 'review_requested') return `${entityLabel} review requested${actor ? ` by ${actor}` : ''}`;
  if (eventType === 'mention') return `${entityLabel} mention${actor ? ` from ${actor}` : ''}`;
  if (eventType === 'assign') return `${entityLabel} assigned${actor ? ` by ${actor}` : ''}`;
  if (eventType === 'workflow_failed') return `${repository.fullName} workflow failed`;
  if (eventType === 'security_alert') return `${repository.fullName} security alert`;
  if (eventType === 'comment') return `${entityLabel} new comment${actor ? ` by ${actor}` : ''}`;
  return entityNumber ? `${entityLabel} updated` : `${repository.fullName} notification`;
}

export function analyzeGitHubNotification(parsed: ParsedEmailMessage): GitHubNotificationAnalysis {
  const reason = firstHeader(parsed, 'x-github-reason');
  const recipient = firstHeader(parsed, 'x-github-recipient');
  const listId = firstHeader(parsed, 'list-id');
  const url = extractGithubUrl(parsed);
  const subjectInfo = parseSubject(parsed);
  const urlInfo = extractRepoAndEntityFromUrl(url);
  const repository = urlInfo.repository || subjectInfo.repository || extractRepoFromListId(listId) || normalizeRepo('unknown', 'unknown');
  const kind = detectKind(reason, subjectInfo.kind, urlInfo.kind, parsed.plainText);
  const entityNumber = urlInfo.entityNumber ?? subjectInfo.entityNumber;
  const newestContent = buildNewestContent(parsed);
  const actor = extractActor(newestContent);
  const eventType = detectEventType(reason, kind, parsed.subject, newestContent);
  const needsUserAction = computeNeedsUserAction(reason, kind, eventType);
  const priorityScore = computePriority(kind, eventType, needsUserAction);
  const todoItems = buildTodoItems(kind, repository, entityNumber, eventType);
  const mergeSuggestion = buildMergeSuggestion(kind, eventType, newestContent);
  const taskReminders = buildTaskReminders(kind, repository, entityNumber, eventType);
  const commentFeedback = buildCommentFeedback(eventType, newestContent);
  const reviewReminders = buildReviewReminders(repository, entityNumber, eventType);
  const suggestedActions = buildSuggestedActions(
    mergeSuggestion,
    taskReminders,
    commentFeedback,
    reviewReminders,
    newestContent,
  );
  const shortSummary = buildShortSummary(repository, entityNumber, eventType, actor);
  const threadKey = entityNumber ? `${repository.fullName}#${entityNumber}` : `${repository.fullName}:${kind}:${subjectInfo.title || parsed.subject}`;

  return {
    messageId: parsed.messageId,
    date: parsed.date,
    kind,
    eventType,
    reason,
    recipient,
    repository,
    entityNumber,
    entityTitle: subjectInfo.title || parsed.subject,
    url,
    actor,
    newestContent,
    needsUserAction,
    priorityScore,
    shortSummary,
    threadKey,
    todoItems,
    mergeSuggestion,
    taskReminders,
    commentFeedback,
    reviewReminders,
    suggestedActions,
    replyCaution: kind === 'pull_request' ? PR_REPLY_CAUTION : '',
    headers: {
      listId,
      reason,
      recipient,
    },
  };
}

export function buildGitHubNotificationThread(messages: GitHubNotificationAnalysis[]): GitHubNotificationThread {
  const sorted = [...messages].sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    return bTime - aTime;
  });
  const latest = sorted[0];
  const needsUserAction = sorted.some((message) => message.needsUserAction);
  const priorityScore = sorted.reduce((max, message) => Math.max(max, message.priorityScore), 0);
  const todoItems = Array.from(new Set(sorted.flatMap((message) => message.todoItems)));

  return {
    threadKey: latest.threadKey,
    repository: latest.repository,
    kind: latest.kind,
    entityNumber: latest.entityNumber,
    entityTitle: latest.entityTitle,
    messages: sorted,
    latest,
    needsUserAction,
    priorityScore,
    todoItems,
    shortSummary: latest.shortSummary,
  };
}

function toDedicatedEventType(analysis: GitHubNotificationAnalysis): GithubDedicatedEventType {
  switch (analysis.eventType) {
    case 'review_requested':
      return 'review_requested';
    case 'mention':
      return 'mention';
    case 'assign':
      return 'assigned_issue';
    case 'workflow_failed':
      return 'workflow_failure';
    case 'security_alert':
      return 'security_alert';
    case 'release':
      return 'release_update_notification';
    case 'comment':
    case 'state_change':
    case 'push':
      if (analysis.kind === 'pull_request') return 'pull_request_update';
      if (analysis.kind === 'issue') return 'issue_update';
      if (analysis.kind === 'release') return 'release_update_notification';
      return 'unknown';
    default:
      if (analysis.kind === 'pull_request') return 'pull_request_update';
      if (analysis.kind === 'issue') return 'issue_update';
      if (analysis.kind === 'release') return 'release_update_notification';
      return 'unknown';
  }
}

function buildDedicatedReasons(analysis: GitHubNotificationAnalysis): string[] {
  const reasons: string[] = [];
  if (analysis.reason) reasons.push(`github-reason:${analysis.reason}`);
  if (analysis.needsUserAction) reasons.push('github:needs-user-action');
  if (analysis.priorityScore >= 80) reasons.push('github:high-priority');
  if (analysis.kind === 'security') reasons.push('github:security');
  if (analysis.kind === 'workflow') reasons.push('github:workflow');
  return reasons;
}

export function parseGitHubDedicatedResult(parsed: ParsedEmailMessage): GithubDedicatedParseResult {
  const analysis = analyzeGitHubNotification(parsed);
  const smartFolder = routeGitHubSmartFolder({
    parser: 'github',
    is_github: true,
    repository_owner: analysis.repository.owner,
    repository_name: analysis.repository.repo,
    repository_full_name: analysis.repository.fullName,
    entity_type: analysis.kind,
    event_type: toDedicatedEventType(analysis),
    entity_number: analysis.entityNumber,
    entity_title: analysis.entityTitle,
    thread_key: analysis.threadKey,
    reason_for_recipient: analysis.reason,
    actor: analysis.actor,
    url: analysis.url,
    short_summary: analysis.shortSummary,
    newest_content: analysis.newestContent,
    needs_user_action: analysis.needsUserAction,
    priority_score: analysis.priorityScore,
    todo_items: analysis.todoItems,
    merge_suggestion: analysis.mergeSuggestion,
    task_reminders: analysis.taskReminders,
    comment_feedback: analysis.commentFeedback,
    review_reminders: analysis.reviewReminders,
    suggested_actions: analysis.suggestedActions,
    reply_caution: analysis.replyCaution || undefined,
    reasons: buildDedicatedReasons(analysis),
  });

  return {
    parser: 'github',
    is_github: true,
    repository_owner: analysis.repository.owner,
    repository_name: analysis.repository.repo,
    repository_full_name: analysis.repository.fullName,
    entity_type: analysis.kind,
    event_type: toDedicatedEventType(analysis),
    entity_number: analysis.entityNumber,
    entity_title: analysis.entityTitle,
    thread_key: analysis.threadKey,
    reason_for_recipient: analysis.reason,
    actor: analysis.actor,
    url: analysis.url,
    short_summary: analysis.shortSummary,
    newest_content: analysis.newestContent,
    needs_user_action: analysis.needsUserAction,
    priority_score: analysis.priorityScore,
    todo_items: analysis.todoItems,
    merge_suggestion: analysis.mergeSuggestion,
    task_reminders: analysis.taskReminders,
    comment_feedback: analysis.commentFeedback,
    review_reminders: analysis.reviewReminders,
    suggested_actions: analysis.suggestedActions,
    reply_caution: analysis.replyCaution || undefined,
    reasons: [...smartFolder.reasons],
  };
}
