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
  body_html?: string;
  body_text?: string;
  snippet?: string;
  category?: string;
  scan_result?: string;
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
