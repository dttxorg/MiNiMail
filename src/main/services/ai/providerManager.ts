import log from 'electron-log';
import { getAIConfig } from './aiConfigStore';
import { normalizeOpenAICompatibleEndpoint } from './endpointNormalizer';
import {
  appendProviderErrorHint,
  getEndpointLogFields,
  getOpenAICompatibleProviderErrorHint,
  redactApiKey,
  sanitizeProviderError,
} from './providerDiagnostics';
import { buildOpenAICompatibleRequestBody } from './requestSanitizer';
import {
  parseOpenAICompatibleResponse,
  summarizeOpenAICompatibleResponseStructure,
} from './responseParser';
import type { AIRequest, AIResponse } from './types';

export async function callAI(request: AIRequest): Promise<AIResponse> {
  const config = getAIConfig();

  if (!config.apiKey) return { success: false, error: 'API key not configured. Please set your AI API key in Settings.' };
  if (!config.baseUrl) return { success: false, error: 'API base URL not configured.' };

  try {
    const endpoint = normalizeOpenAICompatibleEndpoint(config.baseUrl);
    const endpointLogFields = getEndpointLogFields(endpoint);
    const body = buildOpenAICompatibleRequestBody(config, request);
    log.info('OpenAI-compatible request', {
      providerType: 'openai-compatible',
      ...endpointLogFields,
      model: config.model,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    log.info('OpenAI-compatible response status', {
      providerType: 'openai-compatible',
      ...endpointLogFields,
      model: config.model,
      status: response.status,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = appendProviderErrorHint(
        sanitizeProviderError(errorData, response.status, config.apiKey),
        getOpenAICompatibleProviderErrorHint(endpoint, response.status),
      );
      log.warn('OpenAI-compatible provider error', {
        providerType: 'openai-compatible',
        ...endpointLogFields,
        model: config.model,
        status: response.status,
        providerError: error,
      });
      return { success: false, error };
    }

    const data = await response.json();

    if (data && typeof data === 'object' && 'error' in data) {
      const error = sanitizeProviderError(data, response.status, config.apiKey);
      log.warn('OpenAI-compatible provider error', {
        providerType: 'openai-compatible',
        ...endpointLogFields,
        model: config.model,
        status: response.status,
        providerError: error,
      });
      return { success: false, error };
    }

    const content = parseOpenAICompatibleResponse(data);
    if (!content) {
      const responseStructure = summarizeOpenAICompatibleResponseStructure(data);
      log.warn('OpenAI-compatible response content missing', {
        providerType: 'openai-compatible',
        ...endpointLogFields,
        model: config.model,
        status: response.status,
        responseStructure,
      });
      if (responseStructure.hasReasoningContent) {
        return { success: false, error: 'Provider returned reasoning content without final answer.' };
      }
      return { success: false, error: 'No content in AI response' };
    }

    return { success: true, content };
  } catch (err) {
    return { success: false, error: redactApiKey((err as Error).message, config.apiKey) };
  }
}
