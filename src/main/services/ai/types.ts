import type { OpenAICompatibleProviderPresetId } from '../../../shared/openaiCompatibleProviderPresets';
import type { AIProviderDiagnosticsOperation } from './providerDiagnostics';

export interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type AIConfigProfileId = 'primary' | 'secondary';

export interface AIConfigProfile extends AIConfig {
  id: AIConfigProfileId;
  label: string;
}

export interface AIConfigSnapshot {
  activeProfileId: AIConfigProfileId;
  profiles: Record<AIConfigProfileId, AIConfigProfile>;
  providerProfiles?: AIProviderProfileSnapshot;
}

export interface AIProviderProfile {
  id: string;
  providerPresetId: OpenAICompatibleProviderPresetId;
  label: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AIProviderProfileSnapshot {
  defaultProviderId: string;
  profiles: AIProviderProfile[];
}

export interface AIProviderAccount {
  providerAccountId: string;
  providerPresetId: OpenAICompatibleProviderPresetId;
  label: string;
  baseUrl: string;
  hasApiKey: boolean;
  isLocal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AIModelProfile {
  modelProfileId: string;
  providerAccountId: string;
  label: string;
  model: string;
  isDefault: boolean;
  taskType?: 'summary' | 'reply' | 'classification' | 'embedding';
  createdAt: string;
  updatedAt: string;
}

export interface AIProviderAccountSnapshot {
  accounts: AIProviderAccount[];
}

export interface AIModelProfileSnapshot {
  defaultModelProfileId: string;
  profiles: AIModelProfile[];
}

export interface AIProviderAccountWithModels extends AIProviderAccount {
  modelProfiles: AIModelProfile[];
}

export interface AIProviderAccountsWithModelsSnapshot {
  defaultModelProfileId: string;
  accounts: AIProviderAccountWithModels[];
}

export type SaveProviderAccountInput = {
  providerAccountId?: string;
  providerPresetId: OpenAICompatibleProviderPresetId;
  label: string;
  baseUrl: string;
  apiKey?: string;
  isLocal?: boolean;
};

export type SaveModelProfileInput = {
  modelProfileId?: string;
  providerAccountId: string;
  label: string;
  model: string;
  isDefault?: boolean;
  taskType?: 'summary' | 'reply' | 'classification' | 'embedding';
};

export type SaveProviderProfileInput = {
  id?: string;
  providerPresetId: OpenAICompatibleProviderPresetId;
  label: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  isDefault?: boolean;
};

export interface AIRequest {
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: AIResponseMetadata;
}

export interface AISummaryMetadata {
  what: string;
  impact: string | null;
  action: string | null;
  keyFacts: string[];
  urgency: 'now' | 'today' | 'later' | 'none';
}

export interface AIActionSuggestionMetadata {
  label: string;
  type: 'primary' | 'secondary' | 'dismiss';
  intent: 'reply' | 'archive' | 'unsubscribe' | 'read' | 'external_link' | 'none';
  evidence: string;
}

export interface AIReplyCandidateMetadata {
  style: 'short' | 'formal' | 'best';
  body: string;
}

export interface AIResponseMetadata {
  senderType?: string;
  inboxClass?: string;
  messageScenario?: string;
  overlays?: {
    replyNeeded: boolean;
    timeSensitive: boolean;
    securitySensitive: boolean;
    hasExternalAction: boolean;
    actionUrgency: 'now' | 'today' | 'later' | 'none';
  };
  replyNeeded?: boolean | null;
  replyNeededReason?: string;
  noReplyMessage?: string;
  parseStatus?: 'parsed' | 'fallback';
  summary?: AISummaryMetadata;
  actions?: AIActionSuggestionMetadata[];
  urgency?: 'now' | 'today' | 'later' | 'none';
  quickReplies?: string[];
  replyCandidates?: AIReplyCandidateMetadata[];
  classificationSource?: string;
  confidence?: number;
}

export interface AITranslateSegmentsResponse {
  success: boolean;
  translations?: string[];
  error?: string;
}

export interface AIEmailSource {
  subject?: string;
  from?: string;
  from_name?: string;
  to?: string;
  cc?: string;
  date?: string | Date;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string | string[] | undefined>;
  body_html?: string;
  body_text?: string;
  snippet?: string;
  category?: string;
  scan_result?: string;
  senderType?: string;
  replyNeeded?: boolean | null;
  contactWikiContext?: string;
}

export type OpenAICompatibleMessage = {
  role: 'system' | 'user';
  content: string;
};

export type OpenAICompatibleRequestBody = {
  model: string;
  messages: OpenAICompatibleMessage[];
  temperature?: number;
  max_tokens?: number;
};

export type AIConfigSaveInput = Partial<AIConfig> & {
  profileId?: AIConfigProfileId;
  activeProfileId?: AIConfigProfileId;
};

export interface AIProviderTestConnectionRequest {
  profileId?: string;
  providerAccountId?: string;
  providerId?: string;
  providerLabel?: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  localProvider?: boolean;
}

export interface AIProviderTestConnectionResult {
  success: boolean;
  provider: {
    id?: string;
    label?: string;
  };
  endpointHost: string;
  endpointPath: string;
  model: string;
  status?: number;
  operation?: AIProviderDiagnosticsOperation;
  timestamp?: string;
  friendlyMessage?: string;
  errorSummary?: string;
  responseStructureSummary?: unknown;
  requestBodyKeys?: string[];
  parsedPreview?: string;
  error?: string;
}

export interface AIProviderModelListRequest {
  profileId?: string;
  providerAccountId?: string;
  providerId?: string;
  providerLabel?: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
  localProvider?: boolean;
}

export interface AIProviderModelListResult {
  success: boolean;
  provider: {
    id?: string;
    label?: string;
  };
  endpointHost: string;
  endpointPath: string;
  model?: string;
  status?: number;
  operation?: AIProviderDiagnosticsOperation;
  timestamp?: string;
  friendlyMessage?: string;
  errorSummary?: string;
  requestBodyKeys?: string[];
  models?: string[];
  error?: string;
}

export const DEFAULT_CONFIG: AIConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};
