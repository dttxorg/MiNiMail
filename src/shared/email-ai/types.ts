export type EmailBodyBlockType =
  | 'latest_reply'
  | 'quoted_history'
  | 'signature'
  | 'disclaimer'
  | 'footer'
  | 'list'
  | 'table'
  | 'code'
  | 'link_list'
  | 'noise';

export type SensitiveEntityType =
  | 'PERSON'
  | 'EMAIL'
  | 'PHONE'
  | 'ORG'
  | 'ADDRESS'
  | 'ID'
  | 'PAYMENT'
  | 'SECRET'
  | 'REPO'
  | 'DOMAIN';

export interface EmailAddress {
  name: string;
  address: string;
}

export interface AttachmentMetadata {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  attachmentId?: string;
  inline?: boolean;
}

export interface EmailLink {
  text: string;
  url: string;
}

export interface GmailHeaderLike {
  name: string;
  value: string;
}

export interface GmailBodyLike {
  attachmentId?: string;
  size?: number;
  data?: string;
}

export interface GmailMessagePartLike {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeaderLike[];
  body?: GmailBodyLike;
  parts?: GmailMessagePartLike[];
}

export interface GmailMessagePayloadLike extends GmailMessagePartLike {}

export type EmailMessageInput =
  | { kind: 'raw'; source: string | Buffer }
  | { kind: 'parsed'; parsed: import('mailparser').ParsedMail }
  | { kind: 'gmail'; payload: GmailMessagePayloadLike };

export interface NormalizedEmailText {
  plainText: string;
  paragraphs: string[];
  lines: string[];
  links: EmailLink[];
}

export interface ParsedEmailMessage {
  messageId?: string;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  date?: string;
  inReplyTo?: string;
  references: string[];
  headers: Record<string, string[]>;
  textBody: string;
  htmlBody?: string;
  rawHtml?: string;
  safeHtml: string;
  plainText: string;
  links: EmailLink[];
  attachments: AttachmentMetadata[];
}

export type GitHubNotificationKind =
  | 'pull_request'
  | 'issue'
  | 'discussion'
  | 'workflow'
  | 'security'
  | 'release'
  | 'repository'
  | 'unknown';

export type GitHubNotificationEventType =
  | 'review_requested'
  | 'comment'
  | 'mention'
  | 'assign'
  | 'state_change'
  | 'workflow_failed'
  | 'workflow_succeeded'
  | 'security_alert'
  | 'push'
  | 'release'
  | 'unknown';

export interface GitHubRepositoryRef {
  owner: string;
  repo: string;
  fullName: string;
}

export interface GitHubNotificationAnalysis {
  messageId?: string;
  date?: string;
  kind: GitHubNotificationKind;
  eventType: GitHubNotificationEventType;
  reason?: string;
  recipient?: string;
  repository: GitHubRepositoryRef;
  entityNumber?: number;
  entityTitle: string;
  url?: string;
  actor?: string;
  newestContent: string;
  needsUserAction: boolean;
  priorityScore: number;
  shortSummary: string;
  threadKey: string;
  todoItems: string[];
  mergeSuggestion?: string;
  taskReminders: string[];
  commentFeedback: string[];
  reviewReminders: string[];
  suggestedActions: string[];
  replyCaution: string;
  headers: {
    listId?: string;
    reason?: string;
    recipient?: string;
  };
}

export interface GitHubNotificationThread {
  threadKey: string;
  repository: GitHubRepositoryRef;
  kind: GitHubNotificationKind;
  entityNumber?: number;
  entityTitle: string;
  messages: GitHubNotificationAnalysis[];
  latest: GitHubNotificationAnalysis;
  needsUserAction: boolean;
  priorityScore: number;
  todoItems: string[];
  shortSummary: string;
}

export interface EmailBodyBlock {
  type: EmailBodyBlockType;
  text: string;
  lines: string[];
  startLine: number;
  endLine: number;
}

export type EmailBodyBlocks = Record<EmailBodyBlockType, EmailBodyBlock[]>;

export interface SummaryView {
  latestReply: string;
  context: string;
  bullets: string[];
  links: EmailLink[];
  attachments: string[];
}

export interface ActionView {
  latestReply: string;
  actions: string[];
  deadlines: string[];
  amounts: string[];
  links: EmailLink[];
}

export interface ReplyView {
  latestReply: string;
  quotedHistory: string;
  sender: EmailAddress | null;
  recipients: EmailAddress[];
  references: string[];
  suggestedOpening: string;
}

export interface ProfileView {
  sender: {
    name: string;
    email: string;
    domain: string;
  };
  contacts: string[];
  companies: string[];
  phones: string[];
  addresses: string[];
  orderIds: string[];
  signature: string;
}

export type AiPrivacyMode = 'local_raw' | 'cloud_raw' | 'cloud_redacted';

export interface RedactionInputMetadata {
  subject?: string;
  from?: EmailAddress[];
  to?: EmailAddress[];
  cc?: EmailAddress[];
  headers?: Record<string, string | string[] | undefined>;
}

export interface RedactionEntityToggles {
  PERSON?: boolean;
  EMAIL?: boolean;
  PHONE?: boolean;
  ORG?: boolean;
  ADDRESS?: boolean;
  ID?: boolean;
  PAYMENT?: boolean;
  SECRET?: boolean;
}

export interface RedactionOptions extends RedactionEntityToggles {
  subject?: string;
  from?: EmailAddress[];
  to?: EmailAddress[];
  cc?: EmailAddress[];
  headers?: Record<string, string | string[] | undefined>;
  names?: boolean;
  companies?: boolean;
  emails?: boolean;
  phones?: boolean;
  addresses?: boolean;
  orderIds?: boolean;
}

export interface RedactionCandidate {
  type: SensitiveEntityType;
  original: string;
  normalized: string;
  start: number;
  end: number;
  score: number;
}

export interface RedactedEntity extends RedactionCandidate {
  placeholder: string;
}

export interface RedactionMapEntry {
  type: SensitiveEntityType;
  original: string;
  placeholder: string;
}

export interface RedactionResult {
  redactedText: string;
  redactionMap: RedactionMapEntry[];
  entities: RedactedEntity[];
  redacted?: {
    plainText: string;
    safeHtml?: string;
    rawHtml?: string;
  };
}

export interface GitHubMailMetadata {
  repo?: string;
  entityType?: GitHubNotificationKind | 'issue' | 'pull_request' | 'discussion' | 'workflow' | 'security';
  number?: number;
  url?: string;
  reasonForRecipient?: string;
  headers?: Record<string, string | string[] | undefined>;
}

export interface GitHubSemanticTokens {
  repoMentions: string[];
  issueNumbers: number[];
  ownerRepoNumbers: string[];
  usernames: string[];
  workflowStatusTokens: string[];
  urlsPreserved: string[];
}

export interface GithubRedactionOptions extends RedactionEntityToggles {
  preservePublicUsernames?: boolean;
  preservePublicRepositories?: boolean;
  maskRepositories?: boolean;
  maskInternalDomains?: boolean;
  internalDomains?: string[];
}

export interface GithubRedactionInput {
  subject: string;
  headers?: Record<string, string | string[] | undefined>;
  plainText: string;
  attachments?: AttachmentMetadata[];
  metadata?: GitHubMailMetadata;
}

export interface GithubRedactionResult extends RedactionResult {
  preservedGithubSemantics: GitHubSemanticTokens;
  redactedAttachments?: AttachmentMetadata[];
}
