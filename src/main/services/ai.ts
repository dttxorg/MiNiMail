import log from 'electron-log';
import { getSetting, setSetting } from '../database';

export interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
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

const DEFAULT_CONFIG: AIConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

export function getAIConfig(): AIConfig {
  const baseUrl = getSetting('ai_base_url');
  const apiKey = getSetting('ai_api_key');
  const model = getSetting('ai_model');

  return {
    baseUrl: baseUrl || DEFAULT_CONFIG.baseUrl,
    apiKey: apiKey || '',
    model: model || DEFAULT_CONFIG.model,
  };
}

export function saveAIConfig(config: Partial<AIConfig>): void {
  if (config.baseUrl !== undefined) {
    setSetting('ai_base_url', config.baseUrl);
  }
  if (config.apiKey !== undefined) {
    setSetting('ai_api_key', config.apiKey);
  }
  if (config.model !== undefined) {
    setSetting('ai_model', config.model);
  }
  log.info('AI config saved');
}

export async function callAI(request: AIRequest): Promise<AIResponse> {
  const config = getAIConfig();

  if (!config.apiKey) {
    return { success: false, error: 'API key not configured. Please set your AI API key in Settings.' };
  }

  if (!config.baseUrl) {
    return { success: false, error: 'API base URL not configured. Please set your AI API base URL in Settings.' };
  }

  try {
    log.info(`Calling AI: ${config.baseUrl}/chat/completions`);

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          ...(request.system ? [{ role: 'system' as const, content: request.system }] : []),
          { role: 'user' as const, content: request.prompt },
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      log.error(`AI API error: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) {
      return { success: false, error: data.error.message || 'AI returned an error' };
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'No content in AI response' };
    }

    return { success: true, content };
  } catch (err) {
    const error = err as Error;
    log.error(`AI request failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// AI Helper functions
export async function translateText(text: string, targetLang: string): Promise<AIResponse> {
  return callAI({
    system: 'You are a professional translator. Translate the following text to ' + targetLang + '. Only provide the translation, no explanations.',
    prompt: text,
    temperature: 0.3,
    maxTokens: 2000,
  });
}

export async function summarizeText(text: string): Promise<AIResponse> {
  return callAI({
    system: 'You are a professional summarizer. Provide a concise summary of the following text in 3-5 sentences.',
    prompt: text,
    temperature: 0.3,
    maxTokens: 500,
  });
}

export async function suggestReply(emailContent: string): Promise<AIResponse> {
  return callAI({
    system: 'You are an AI assistant helping to compose email replies. Based on the received email content, suggest a professional reply. Format your response as a suggested email body only.',
    prompt: `Received email:\n${emailContent}\n\nSuggested reply:`,
    temperature: 0.7,
    maxTokens: 1000,
  });
}

export async function polishText(text: string, style: 'formal' | 'friendly' | 'shorter' | 'longer'): Promise<AIResponse> {
  const styleInstructions: Record<string, string> = {
    formal: 'Make this text more formal and professional.',
    friendly: 'Make this text more friendly and casual.',
    shorter: 'Rewrite this text to be shorter and more concise while preserving the key points.',
    longer: 'Expand this text with more details while keeping it relevant.',
  };

  return callAI({
    system: 'You are an AI assistant helping to improve email writing. ' + styleInstructions[style] + ' Only provide the rewritten text.',
    prompt: text,
    temperature: 0.7,
    maxTokens: 2000,
  });
}
