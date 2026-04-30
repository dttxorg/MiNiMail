export type RecommendedDepth = 'light' | 'normal' | 'advanced';

export type ForceUpgradeReason =
  | 'important_contact'
  | 'security_alert'
  | 'billing_anomaly'
  | 'legal_contract'
  | 'schedule_change'
  | 'github_email';

export interface LightScanResult {
  importance_score: number;
  urgency_score: number;
  actionability_score: number;
  risk_score: number;
  density_score: number;
  relationship_score: number;
  total_light_score: number;
  force_upgrade: boolean;
  recommended_depth: RecommendedDepth;
  reasons: string[];
}

export interface LightScanInput {
  subject: string;
  from: string;
  from_name?: string;
  to?: string;
  cc?: string;
  snippet?: string;
  body_text?: string;
  body_html?: string;
  has_attachments?: boolean;
  headers?: Record<string, string | string[] | undefined>;
  important_contacts?: string[];
  relationship_contacts?: string[];
}

export type GithubDedicatedEventType =
  | 'review_requested'
  | 'assigned_issue'
  | 'mention'
  | 'pull_request_update'
  | 'issue_update'
  | 'workflow_failure'
  | 'security_alert'
  | 'release_update_notification'
  | 'unknown';

export type GitHubPriorityLevel = 'P0_URGENT' | 'P1_IMPORTANT' | 'P2_NORMAL' | 'P3_LOW';

export interface GitHubPriorityClassification {
  priorityLevel: GitHubPriorityLevel;
  eventCode: string;
  friendlyText: string;
  safeSummary: string;
  reasons: string[];
}

export type GithubDedicatedEntityType =
  | 'pull_request'
  | 'issue'
  | 'discussion'
  | 'workflow'
  | 'security'
  | 'release'
  | 'repository'
  | 'unknown';

export type GitHubSmartFolder =
  | 'GitHub/Needs Action'
  | 'GitHub/Review Requests'
  | 'GitHub/Assigned to Me'
  | 'GitHub/Mentions'
  | 'GitHub/CI and Failures'
  | 'GitHub/Security'
  | 'GitHub/Low Priority'
  | 'GitHub/Archived Updates';

export interface GithubDedicatedParseResult {
  parser: 'github';
  is_github: true;
  repository_owner: string;
  repository_name: string;
  repository_full_name: string;
  entity_type: GithubDedicatedEntityType;
  event_type: GithubDedicatedEventType;
  entity_number?: number;
  entity_title: string;
  thread_key: string;
  reason_for_recipient?: string;
  actor?: string;
  url?: string;
  short_summary: string;
  newest_content: string;
  priority_level: GitHubPriorityLevel;
  priority: GitHubPriorityClassification;
  safe_summary: string;
  needs_user_action: boolean;
  priority_score: number;
  todo_items: string[];
  merge_suggestion?: string;
  task_reminders: string[];
  comment_feedback: string[];
  review_reminders: string[];
  suggested_actions: string[];
  reply_caution?: string;
  reasons: string[];
}

export interface ForceUpgradeEvaluation {
  force_upgrade: boolean;
  recommended_depth: RecommendedDepth;
  reasons: ForceUpgradeReason[];
}

export interface SmartFolderRoute {
  folder: string;
  family: 'github' | 'generic';
  reasons: string[];
}

export interface GenericScanPipelineResult {
  kind: 'generic';
  light_scan: LightScanResult;
  smart_folder: SmartFolderRoute | null;
}

export interface GithubScanPipelineResult {
  kind: 'github';
  light_scan: LightScanResult;
  github: GithubDedicatedParseResult;
  smart_folder: SmartFolderRoute;
}

export type ScanPipelineResult = GenericScanPipelineResult | GithubScanPipelineResult;

export interface DeepScanRequest {
  depth: Exclude<RecommendedDepth, 'light'>;
  light_scan: LightScanResult;
  source: LightScanInput;
}

export interface DeepScanTaskCandidate {
  title: string;
  deadline?: string;
  confidence: number;
}

export interface DeepScanEntityCandidate {
  type: string;
  value: string;
  confidence: number;
}

export interface DeepScanMemoryCandidate {
  type: 'contact' | 'project' | 'billing' | 'security' | 'relationship';
  summary: string;
  confidence: number;
}

export interface DeepScanOutput {
  tasks: DeepScanTaskCandidate[];
  deadlines: string[];
  entities: DeepScanEntityCandidate[];
  reply_suggestions: string[];
  memory_candidates: DeepScanMemoryCandidate[];
}
