import type {
  Account,
  ApiResponse,
  CreateAccountInput,
  ImapConnectionResult,
  SmtpConnectionResult,
} from '../../../../src/renderer/types';

export type MailDeliveryState = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'missed';

export interface MailAddressList {
  to: string[];
  cc?: string[];
  bcc?: string[];
}

export interface MailListQuery {
  accountId: number;
  folder: string;
  limit?: number;
  offset?: number;
  search?: string;
}

export interface CachedMailSummary {
  id: string;
  uid: number;
  accountId: number;
  folder: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  category?: string;
  deliveryState?: MailDeliveryState;
}

export interface CachedMailDetail extends CachedMailSummary {
  bodyHtml?: string;
  bodyText?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface SendMailInput extends MailAddressList {
  accountId: number;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  attachmentTokens?: string[];
}

export interface ScheduledSendInput extends SendMailInput {
  scheduledAt: string;
}

export interface ScheduledSendJob extends ScheduledSendInput {
  id: string;
  localSendId: string;
  status: MailDeliveryState;
  failureReason?: string;
  lastAttemptAt?: string;
  sentMessageId?: string;
}

export interface AccountService {
  getAll(): Promise<ApiResponse<Account[]>>;
  get(id: number): Promise<ApiResponse<Account>>;
  create(input: CreateAccountInput): Promise<ApiResponse<Account>>;
  update(id: number, input: Partial<CreateAccountInput>): Promise<ApiResponse<Account>>;
  delete(id: number): Promise<ApiResponse<void>>;
  setDefault(id: number): Promise<ApiResponse<Account>>;
  testImap(id: number): Promise<ImapConnectionResult>;
  testSmtp(id: number): Promise<SmtpConnectionResult>;
}

export interface SettingsService {
  get(key: string): Promise<ApiResponse<string | null>>;
  set(key: string, value: string): Promise<ApiResponse<void>>;
}

export interface MailService {
  getFolders(accountId: number): Promise<ApiResponse<unknown[]>>;
  getList(query: MailListQuery): Promise<ApiResponse<CachedMailSummary[]>>;
  getDetail(accountId: number, uid: number, folder: string): Promise<ApiResponse<CachedMailDetail>>;
  sync(accountId: number, folder: string): Promise<ApiResponse<CachedMailSummary[]>>;
  send(input: SendMailInput): Promise<ApiResponse<{ messageId?: string }>>;
  setRead(accountId: number, uid: number, folder: string, read: boolean): Promise<ApiResponse<void>>;
  setStarred(accountId: number, uid: number, folder: string, starred: boolean): Promise<ApiResponse<void>>;
  move(accountId: number, uid: number, fromFolder: string, toFolder: string): Promise<ApiResponse<void>>;
  delete(accountId: number, uid: number, folder: string): Promise<ApiResponse<void>>;
}

export interface AIService {
  summarize(source: unknown, targetLang?: string): Promise<ApiResponse<string>>;
  translate(source: unknown, targetLang: string): Promise<ApiResponse<string>>;
  suggestReply(source: unknown, targetLang?: string): Promise<ApiResponse<string>>;
  classifyBatch(payload: unknown): Promise<ApiResponse<unknown>>;
}

export interface AttachmentService {
  pickOutgoing(): Promise<ApiResponse<{ token: string; name: string; size?: number; contentType?: string }[]>>;
  download(request: unknown): Promise<ApiResponse<{ uri: string }>>;
  open(uri: string): Promise<ApiResponse<void>>;
}

export interface SchedulerService {
  schedule(input: ScheduledSendInput): Promise<ApiResponse<ScheduledSendJob>>;
  list(filter?: { accountId?: number; status?: MailDeliveryState }): Promise<ApiResponse<ScheduledSendJob[]>>;
  cancel(id: string): Promise<ApiResponse<ScheduledSendJob>>;
  sendNow(id: string): Promise<ApiResponse<ScheduledSendJob>>;
  retry(id: string): Promise<ApiResponse<ScheduledSendJob>>;
  markMissed(nowIso?: string): Promise<ApiResponse<ScheduledSendJob[]>>;
}

export interface OAuthService {
  startFlow(params: unknown): Promise<ApiResponse<unknown>>;
  refreshToken(accountId: number): Promise<ApiResponse<void>>;
  getClientConfig(provider: string): Promise<ApiResponse<unknown>>;
}

export interface VectorMemoryDocument {
  id: string;
  accountId?: number;
  sourceType: 'mail' | 'thread' | 'contact' | 'attachment' | 'note';
  sourceId: string;
  title?: string;
  text: string;
  metadata?: Record<string, string | number | boolean | null>;
  updatedAt: string;
}

export interface VectorMemorySearchRequest {
  query: string;
  accountId?: number;
  sourceTypes?: VectorMemoryDocument['sourceType'][];
  limit?: number;
}

export interface VectorMemorySearchResult {
  document: VectorMemoryDocument;
  score: number;
  snippet?: string;
}

export interface VectorMemorySnapshotManifest {
  id: string;
  createdAt: string;
  embeddingModel: string;
  dimensions: number;
  chunkingVersion: string;
  documentCount: number;
  sourceDeviceId?: string;
  encrypted: boolean;
}

export interface VectorMemorySnapshot {
  manifest: VectorMemorySnapshotManifest;
  payloadUri: string;
  checksum: string;
}

export interface VectorMemoryService {
  upsert(documents: VectorMemoryDocument[]): Promise<ApiResponse<{ indexed: number }>>;
  search(request: VectorMemorySearchRequest): Promise<ApiResponse<VectorMemorySearchResult[]>>;
  deleteBySource(sourceType: VectorMemoryDocument['sourceType'], sourceId: string): Promise<ApiResponse<void>>;
  clearAccount(accountId: number): Promise<ApiResponse<void>>;
  exportSnapshot?(accountId?: number): Promise<ApiResponse<VectorMemorySnapshot>>;
  importSnapshot?(snapshot: VectorMemorySnapshot): Promise<ApiResponse<{ imported: number }>>;
}

export interface MiNiMailPlatformServices {
  accounts: AccountService;
  settings: SettingsService;
  mail: MailService;
  ai: AIService;
  attachments: AttachmentService;
  scheduler: SchedulerService;
  oauth: OAuthService;
  vectorMemory: VectorMemoryService;
}
