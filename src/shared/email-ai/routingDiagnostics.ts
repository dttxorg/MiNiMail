import type { RecommendedDepth, ScanPipelineResult } from './scanTypes';
import type { GitHubPriorityLevel } from './scanTypes';
import { deriveGenericPriorityFolders } from './smartFolderRouter';

export interface RoutingDiagnosticsKeyScores {
  importance_score: number;
  urgency_score: number;
  actionability_score: number;
  risk_score: number;
  density_score: number;
  relationship_score: number;
  total_light_score: number;
}

export interface RoutingDiagnosticsRecord {
  mail_id: string;
  matched_folder: string;
  all_matched_folders: string[];
  family: 'priority' | 'github';
  folder_reason: string;
  top_routing_reasons: string[];
  key_scores: RoutingDiagnosticsKeyScores;
  force_upgrade_reason?: string;
  recommended_depth: RecommendedDepth;
  github_event_type?: string;
  github_priority_level?: GitHubPriorityLevel;
  github_safe_summary?: string;
  github_friendly_text?: string;
  short_explanation_text: string;
  subject?: string;
  from?: string;
  date?: string;
}

export interface RoutingDiagnosticsSummary {
  folder_counts: Record<string, number>;
  force_upgrade_reason_counts: Record<string, number>;
  recommended_depth_counts: Record<RecommendedDepth, number>;
  github_event_type_counts: Record<string, number>;
  multi_priority_bucket_hits: Array<{ mail_id: string; folders: string[] }>;
}

export interface RoutingDiagnosticsExport {
  generated_at: string;
  mail_count: number;
  diagnostics: RoutingDiagnosticsRecord[];
  summary: RoutingDiagnosticsSummary;
}

export interface RoutingDiagnosticsSource {
  id: string;
  routing: ScanPipelineResult;
}

export interface RoutingDiagnosticsMetadata {
  subject?: string;
  from?: string;
  date?: string;
}

interface BuildRoutingDiagnosticsArgs {
  routingResults?: RoutingDiagnosticsSource[];
  mailFolderMembership?: Record<string, string[]>;
  metadataById?: Record<string, RoutingDiagnosticsMetadata>;
  appLanguage?: string;
}

function localize(appLanguage: string | undefined, zh: string, en: string): string {
  return appLanguage === 'zh' ? zh : en;
}

function normalizeAppLanguage(appLanguage?: string): string {
  return (appLanguage || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function derivePriorityFoldersFromLightScan(routing: ScanPipelineResult): string[] {
  if (routing.kind === 'github') {
    return [];
  }

  return deriveGenericPriorityFolders(routing.light_scan);
}

function deriveMatchedFolders(
  source: RoutingDiagnosticsSource,
  memberships: string[] | undefined,
): string[] {
  if (memberships && memberships.length > 0) {
    return memberships;
  }

  if (source.routing.kind === 'github') {
    return [source.routing.smart_folder.folder];
  }

  const derived = derivePriorityFoldersFromLightScan(source.routing);
  if (derived.length > 0) {
    return derived;
  }

  return source.routing.smart_folder?.folder ? [source.routing.smart_folder.folder] : [];
}

function extractForceUpgradeReason(reasons: string[], appLanguage: string): string | undefined {
  const raw = reasons.find((reason) => reason.startsWith('force-upgrade:'))?.replace('force-upgrade:', '');
  if (!raw) return undefined;

  const labels: Record<string, string> = {
    important_contact: localize(appLanguage, '重要联系人', 'Important contact'),
    security_alert: localize(appLanguage, '安全警报', 'Security alert'),
    billing_anomaly: localize(appLanguage, '账单异常', 'Billing anomaly'),
    legal_contract: localize(appLanguage, '法律/合同邮件', 'Legal or contract mail'),
    schedule_change: localize(appLanguage, '日程变更', 'Schedule change'),
    github_email: localize(appLanguage, 'GitHub 通知', 'GitHub email'),
  };

  return labels[raw] || raw;
}

function humanizeReason(reason: string, appLanguage: string): string {
  const map: Record<string, string> = {
    'importance signals from sender/topic': localize(appLanguage, '重要性信号较强', 'Strong importance signals'),
    'urgent timing or deadline language detected': localize(appLanguage, '检测到紧急/截止时间', 'Urgency or deadline detected'),
    'explicit review/reply/approval/pay action requested': localize(appLanguage, '包含明确回复或处理请求', 'Explicit action requested'),
    'security, fraud, payment, or legal risk language detected': localize(appLanguage, '检测到风险/安全信号', 'Risk or security signals detected'),
    'dense preview with enough context for deeper analysis': localize(appLanguage, '内容信息量较高', 'Dense content worth deeper analysis'),
    'sender appears relationship-relevant': localize(appLanguage, '发件人与关系联系人相关', 'Sender is relationship-relevant'),
    'newsletter/promotional signals reduce urgency': localize(appLanguage, '营销/订阅信号降低紧急度', 'Promotional signals reduce urgency'),
    'github:needs-user-action': localize(appLanguage, 'GitHub 需要处理', 'GitHub requires action'),
    'github:high-priority': localize(appLanguage, 'GitHub 优先级较高', 'GitHub high priority'),
    'github:security': localize(appLanguage, 'GitHub 安全警报', 'GitHub security alert'),
    'github:workflow': localize(appLanguage, 'GitHub CI/工作流事件', 'GitHub CI/workflow event'),
    'github-reason:review_requested': localize(appLanguage, 'GitHub 请求评审', 'GitHub review requested'),
    'github-reason:mention': localize(appLanguage, 'GitHub 提及你', 'GitHub mention'),
    'github-reason:assign': localize(appLanguage, 'GitHub 分配给你', 'GitHub assigned to you'),
    'github-reason:security_alert': localize(appLanguage, 'GitHub 安全警报', 'GitHub security alert'),
    'github-priority:P0_URGENT': localize(appLanguage, 'GitHub P0 紧急', 'GitHub P0 urgent'),
    'github-priority:P1_IMPORTANT': localize(appLanguage, 'GitHub P1 重要', 'GitHub P1 important'),
    'github-priority:P2_NORMAL': localize(appLanguage, 'GitHub P2 普通', 'GitHub P2 normal'),
    'github-priority:P3_LOW': localize(appLanguage, 'GitHub P3 低优先级', 'GitHub P3 low priority'),
  };

  if (reason.startsWith('force-upgrade:')) {
    return extractForceUpgradeReason([reason], appLanguage) || reason;
  }

  return map[reason] || reason;
}

function buildFolderReason(
  folder: string,
  source: RoutingDiagnosticsSource,
  topReasons: string[],
  appLanguage: string,
): string {
  const reasonSnippet = topReasons.slice(0, 2).join(', ');
  if (folder === 'Priority/High') {
    return localize(
      appLanguage,
      `命中高优先级路由，主要依据是高总分${reasonSnippet ? `，并包含 ${reasonSnippet}` : ''}`,
      `Matched Priority/High because the total score is elevated${reasonSnippet ? ` and it includes ${reasonSnippet}` : ''}`,
    );
  }
  if (folder === 'Priority/Needs Reply') {
    return localize(
      appLanguage,
      `命中需回复路由，主要依据是行动性较高${reasonSnippet ? `，并包含 ${reasonSnippet}` : ''}`,
      `Matched Priority/Needs Reply because the message shows strong actionability${reasonSnippet ? ` and includes ${reasonSnippet}` : ''}`,
    );
  }
  if (folder === 'Priority/Risk') {
    return localize(
      appLanguage,
      `命中风险路由，主要依据是风险分较高${reasonSnippet ? `，并包含 ${reasonSnippet}` : ''}`,
      `Matched Priority/Risk because the risk score is elevated${reasonSnippet ? ` and includes ${reasonSnippet}` : ''}`,
    );
  }
  if (folder === 'Priority/Low') {
    return localize(
      appLanguage,
      '命中低优先级路由，因为总分较低且未触发强制升级',
      'Matched Priority/Low because the total score is low and no force-upgrade was triggered',
    );
  }
  if (source.routing.kind === 'github') {
    const eventType = source.routing.github.event_type.replace(/_/g, ' ');
    const priority = (source.routing.github.priority_level || 'P3_LOW').replace(/_/g, ' ');
    return localize(
      appLanguage,
      `命中 ${folder}，GitHub 事件类型为 ${eventType}，优先级为 ${priority}${reasonSnippet ? `，并包含 ${reasonSnippet}` : ''}`,
      `Matched ${folder} because the GitHub event type is ${eventType} with ${priority} priority${reasonSnippet ? ` and includes ${reasonSnippet}` : ''}`,
    );
  }
  return localize(
    appLanguage,
    `命中 ${folder}${reasonSnippet ? `，主要原因是 ${reasonSnippet}` : ''}`,
    `Matched ${folder}${reasonSnippet ? ` because of ${reasonSnippet}` : ''}`,
  );
}

function buildShortExplanation(folder: string, topReasons: string[], appLanguage: string): string {
  const reasonSnippet = topReasons.slice(0, 2).join(' · ');
  if (folder === 'Priority/High') {
    return localize(appLanguage, `该邮件因总分较高${reasonSnippet ? `，并包含${reasonSnippet}` : ''}而进入高优先级。`, `Routed to Priority/High because the overall score is high${reasonSnippet ? ` and it shows ${reasonSnippet}` : ''}.`);
  }
  if (folder === 'Priority/Needs Reply') {
    return localize(appLanguage, `该邮件包含明确回复或处理请求${reasonSnippet ? `，并体现为${reasonSnippet}` : ''}。`, `Routed to Priority/Needs Reply because it asks for a clear response or action${reasonSnippet ? ` and shows ${reasonSnippet}` : ''}.`);
  }
  if (folder === 'Priority/Risk') {
    return localize(appLanguage, `该邮件包含风险或安全相关信号${reasonSnippet ? `，包括${reasonSnippet}` : ''}。`, `Routed to Priority/Risk because it contains risk or security signals${reasonSnippet ? ` including ${reasonSnippet}` : ''}.`);
  }
  if (folder === 'GitHub/Needs Action') {
    return localize(appLanguage, `该 GitHub 通知需要你处理${reasonSnippet ? `，主要因为${reasonSnippet}` : ''}。`, `Routed to GitHub/Needs Action because this GitHub notification needs your action${reasonSnippet ? ` due to ${reasonSnippet}` : ''}.`);
  }
  if (folder === 'GitHub/Review Requests') {
    return localize(appLanguage, '该 GitHub 通知识别为评审请求。', 'Routed to GitHub/Review Requests because it is a review request.');
  }
  if (folder === 'GitHub/Security') {
    return localize(appLanguage, '该 GitHub 通知识别为安全警报。', 'Routed to GitHub/Security because it is a security alert.');
  }
  return localize(appLanguage, `该邮件进入 ${folder}。`, `Routed to ${folder}.`);
}

export function buildRoutingDiagnosticsEntries({
  routingResults = [],
  mailFolderMembership = {},
  metadataById = {},
  appLanguage,
}: BuildRoutingDiagnosticsArgs): RoutingDiagnosticsRecord[] {
  const language = normalizeAppLanguage(appLanguage);

  return routingResults.flatMap((source) => {
    const matchedFolders = deriveMatchedFolders(source, mailFolderMembership[source.id]);
    if (matchedFolders.length === 0) {
      return [];
    }

    const lightScan = source.routing.light_scan;
    const topReasons = lightScan.reasons.map((reason) => humanizeReason(reason, language)).filter(Boolean).slice(0, 3);
    const primaryFolder = source.routing.smart_folder?.folder || matchedFolders[0];
    const metadata = metadataById[source.id] || {};

    return [{
      mail_id: source.id,
      matched_folder: primaryFolder,
      all_matched_folders: matchedFolders,
      family: primaryFolder.startsWith('GitHub/') ? 'github' : 'priority',
      folder_reason: buildFolderReason(primaryFolder, source, topReasons, language),
      top_routing_reasons: topReasons,
      key_scores: {
        importance_score: lightScan.importance_score,
        urgency_score: lightScan.urgency_score,
        actionability_score: lightScan.actionability_score,
        risk_score: lightScan.risk_score,
        density_score: lightScan.density_score,
        relationship_score: lightScan.relationship_score,
        total_light_score: lightScan.total_light_score,
      },
      force_upgrade_reason: extractForceUpgradeReason(lightScan.reasons, language),
      recommended_depth: lightScan.recommended_depth,
      github_event_type: source.routing.kind === 'github' ? source.routing.github.event_type : undefined,
      github_priority_level: source.routing.kind === 'github' ? source.routing.github.priority_level || 'P3_LOW' : undefined,
      github_safe_summary: source.routing.kind === 'github' ? source.routing.github.safe_summary : undefined,
      github_friendly_text: source.routing.kind === 'github' ? source.routing.github.priority?.friendlyText : undefined,
      short_explanation_text: buildShortExplanation(primaryFolder, topReasons, language),
      subject: metadata.subject,
      from: metadata.from,
      date: metadata.date,
    }];
  });
}

export function summarizeRoutingDiagnostics(entries: RoutingDiagnosticsRecord[]): RoutingDiagnosticsSummary {
  const folderCounts: Record<string, number> = {};
  const forceUpgradeCounts: Record<string, number> = {};
  const depthCounts: Record<RecommendedDepth, number> = {
    light: 0,
    normal: 0,
    advanced: 0,
  };
  const githubEventCounts: Record<string, number> = {};
  const multiPriorityBucketHits: Array<{ mail_id: string; folders: string[] }> = [];

  for (const entry of entries) {
    for (const folder of entry.all_matched_folders) {
      folderCounts[folder] = (folderCounts[folder] || 0) + 1;
    }

    depthCounts[entry.recommended_depth] += 1;

    if (entry.force_upgrade_reason) {
      forceUpgradeCounts[entry.force_upgrade_reason] = (forceUpgradeCounts[entry.force_upgrade_reason] || 0) + 1;
    }

    if (entry.github_event_type) {
      githubEventCounts[entry.github_event_type] = (githubEventCounts[entry.github_event_type] || 0) + 1;
    }

    const priorityFolders = entry.all_matched_folders.filter((folder) => folder.startsWith('Priority/'));
    if (priorityFolders.length > 1) {
      multiPriorityBucketHits.push({
        mail_id: entry.mail_id,
        folders: priorityFolders,
      });
    }
  }

  return {
    folder_counts: folderCounts,
    force_upgrade_reason_counts: forceUpgradeCounts,
    recommended_depth_counts: depthCounts,
    github_event_type_counts: githubEventCounts,
    multi_priority_bucket_hits: multiPriorityBucketHits,
  };
}

export function buildRoutingDiagnosticsExport(args: BuildRoutingDiagnosticsArgs): RoutingDiagnosticsExport {
  const diagnostics = buildRoutingDiagnosticsEntries(args);
  return {
    generated_at: new Date().toISOString(),
    mail_count: diagnostics.length,
    diagnostics,
    summary: summarizeRoutingDiagnostics(diagnostics),
  };
}
