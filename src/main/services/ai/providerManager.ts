import log from 'electron-log';
import { getAIConfig } from './aiConfigStore';
import { getAIProviderConfigById } from './aiProviderProfileStore';
import { normalizeOpenAICompatibleEndpoint } from './endpointNormalizer';
import {
  appendProviderErrorHint,
  getEndpointLogFields,
  getOpenAICompatibleProviderErrorHint,
  readProviderErrorResponse,
  redactApiKey,
  sanitizeProviderError,
} from './providerDiagnostics';
import { buildOpenAICompatibleRequestBody } from './requestSanitizer';
import {
  parseOpenAICompatibleResponse,
  summarizeOpenAICompatibleResponseStructure,
} from './responseParser';
import type {
  AIConfig,
  AIProviderTestConnectionRequest,
  AIProviderTestConnectionResult,
  AIRequest,
  AIResponse,
} from './types';

const TEST_CONNECTION_PROMPT = 'Reply with OK.';

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
      const error = appendProviderErrorHint(
        await readProviderErrorResponse(response, config.apiKey),
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

function resolveTestConnectionConfig(request: AIProviderTestConnectionRequest): AIConfig {
  const savedProfile = request.profileId ? getAIProviderConfigById(request.profileId) ?? getAIConfig() : getAIConfig();
  return {
    baseUrl: request.baseUrl || savedProfile.baseUrl,
    apiKey: request.apiKey?.trim() || savedProfile.apiKey,
    model: request.model || savedProfile.model,
  };
}

function buildTestConnectionResultBase(
  request: AIProviderTestConnectionRequest,
  endpoint: string,
  model: string,
): Pick<AIProviderTestConnectionResult, 'provider' | 'endpointHost' | 'endpointPath' | 'model'> {
  return {
    provider: {
      id: request.providerId,
      label: request.providerLabel,
    },
    ...getEndpointLogFields(endpoint),
    model,
  };
}

export async function testOpenAICompatibleConnection(
  request: AIProviderTestConnectionRequest,
): Promise<AIProviderTestConnectionResult> {
  const config = resolveTestConnectionConfig(request);
  let endpoint = '';

  try {
    if (!config.apiKey) {
      endpoint = config.baseUrl ? normalizeOpenAICompatibleEndpoint(config.baseUrl) : '';
      return {
        success: false,
        ...buildTestConnectionResultBase(request, endpoint, config.model),
        error: 'API key not configured. Please set your AI API key in Settings.',
      };
    }
    if (!config.baseUrl) {
      return {
        success: false,
        ...buildTestConnectionResultBase(request, '', config.model),
        error: 'API base URL not configured.',
      };
    }

    endpoint = normalizeOpenAICompatibleEndpoint(config.baseUrl);
    const endpointLogFields = getEndpointLogFields(endpoint);
    const body = buildOpenAICompatibleRequestBody(config, {
      prompt: TEST_CONNECTION_PROMPT,
      temperature: 0,
      maxTokens: 512,
    });
    log.info('OpenAI-compatible test connection request', {
      providerType: 'openai-compatible',
      providerId: request.providerId,
      providerLabel: request.providerLabel,
      ...endpointLogFields,
      model: config.model,
      requestBodyKeys: Object.keys(body),
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    log.info('OpenAI-compatible test connection response status', {
      providerType: 'openai-compatible',
      providerId: request.providerId,
      providerLabel: request.providerLabel,
      ...endpointLogFields,
      model: config.model,
      status: response.status,
    });

    const resultBase = buildTestConnectionResultBase(request, endpoint, config.model);

    if (!response.ok) {
      const error = appendProviderErrorHint(
        await readProviderErrorResponse(response, config.apiKey),
        getOpenAICompatibleProviderErrorHint(endpoint, response.status),
      );
      log.warn('OpenAI-compatible test connection provider error', {
        providerType: 'openai-compatible',
        providerId: request.providerId,
        providerLabel: request.providerLabel,
        ...endpointLogFields,
        model: config.model,
        status: response.status,
        providerError: error,
      });
      return { success: false, ...resultBase, status: response.status, error };
    }

    const data = await response.json();
    if (data && typeof data === 'object' && 'error' in data) {
      const error = sanitizeProviderError(data, response.status, config.apiKey);
      log.warn('OpenAI-compatible test connection provider error', {
        providerType: 'openai-compatible',
        providerId: request.providerId,
        providerLabel: request.providerLabel,
        ...endpointLogFields,
        model: config.model,
        status: response.status,
        providerError: error,
      });
      return { success: false, ...resultBase, status: response.status, error };
    }

    const content = parseOpenAICompatibleResponse(data);
    if (!content) {
      const responseStructure = summarizeOpenAICompatibleResponseStructure(data);
      log.warn('OpenAI-compatible test connection response content missing', {
        providerType: 'openai-compatible',
        providerId: request.providerId,
        providerLabel: request.providerLabel,
        ...endpointLogFields,
        model: config.model,
        status: response.status,
        responseStructure,
      });
      const error = responseStructure.hasReasoningContent
        ? 'Provider returned reasoning content without final answer.'
        : 'No content in AI response';
      return { success: false, ...resultBase, status: response.status, error };
    }

    return {
      success: true,
      ...resultBase,
      status: response.status,
      parsedPreview: content.trim().slice(0, 120),
    };
  } catch (err) {
    return {
      success: false,
      ...buildTestConnectionResultBase(request, endpoint, config.model),
      error: redactApiKey((err as Error).message, config.apiKey),
    };
  }
}
