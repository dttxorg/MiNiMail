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
}

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

export const DEFAULT_CONFIG: AIConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};
