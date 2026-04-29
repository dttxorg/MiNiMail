import log from 'electron-log';
import { getAIConfig, getAIConfigForProfile } from './aiConfigStore';
import { normalizeOpenAICompatibleModelListEndpoint } from './endpointNormalizer';
import {
  appendProviderErrorHint,
  getEndpointLogFields,
  getOpenAICompatibleProviderErrorHint,
  readProviderErrorResponse,
  redactApiKey,
  sanitizeProviderError,
} from './providerDiagnostics';
import type {
  AIConfig,
  AIProviderModelListRequest,
  AIProviderModelListResult,
} from './types';

type ModelListItem = {
  id?: unknown;
  name?: unknown;
  model?: unknown;
};

function resolveModelListConfig(request: AIProviderModelListRequest): AIConfig {
  const savedProfile = request.profileId ? getAIConfigForProfile(request.profileId) : getAIConfig();
  return {
    baseUrl: request.baseUrl || savedProfile.baseUrl,
    apiKey: request.apiKey?.trim() || savedProfile.apiKey,
    model: request.model || savedProfile.model,
  };
}

function isLocalModelProvider(endpoint: string, request: AIProviderModelListRequest): boolean {
  if (request.localProvider) return true;
  try {
    const { hostname } = new URL(endpoint);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function buildModelListResultBase(
  request: AIProviderModelListRequest,
  endpoint: string,
): Pick<AIProviderModelListResult, 'provider' | 'endpointHost' | 'endpointPath'> {
  return {
    provider: {
      id: request.providerId,
      label: request.providerLabel,
    },
    ...getEndpointLogFields(endpoint),
  };
}

function getModelId(item: unknown): string {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  const model = item as ModelListItem;
  for (const value of [model.id, model.name, model.model]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function parseOpenAICompatibleModelList(data: unknown): string[] {
  const root = data && typeof data === 'object' && !Array.isArray(data)
    ? data as { data?: unknown; models?: unknown }
    : {};
  const rawModels = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : [];
  const models: string[] = [];
  const seen = new Set<string>();

  for (const item of rawModels) {
    const id = getModelId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push(id);
  }

  return models;
}

export async function fetchOpenAICompatibleModels(
  request: AIProviderModelListRequest,
): Promise<AIProviderModelListResult> {
  const config = resolveModelListConfig(request);
  let endpoint = '';

  try {
    if (!config.baseUrl) {
      return {
        success: false,
        ...buildModelListResultBase(request, ''),
        error: 'API base URL not configured.',
      };
    }

    endpoint = normalizeOpenAICompatibleModelListEndpoint(config.baseUrl);
    const endpointLogFields = getEndpointLogFields(endpoint);
    const localProvider = isLocalModelProvider(endpoint, request);
    if (!localProvider && !config.apiKey) {
      return {
        success: false,
        ...buildModelListResultBase(request, endpoint),
        error: 'API key not configured. Please set your AI API key in Settings.',
      };
    }

    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    log.info('OpenAI-compatible model list request', {
      providerType: 'openai-compatible',
      providerId: request.providerId,
      providerLabel: request.providerLabel,
      ...endpointLogFields,
      localProvider,
    });

    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    log.info('OpenAI-compatible model list response status', {
      providerType: 'openai-compatible',
      providerId: request.providerId,
      providerLabel: request.providerLabel,
      ...endpointLogFields,
      status: response.status,
    });

    const resultBase = buildModelListResultBase(request, endpoint);

    if (!response.ok) {
      const error = appendProviderErrorHint(
        await readProviderErrorResponse(response, config.apiKey),
        getOpenAICompatibleProviderErrorHint(endpoint, response.status),
      );
      log.warn('OpenAI-compatible model list provider error', {
        providerType: 'openai-compatible',
        providerId: request.providerId,
        providerLabel: request.providerLabel,
        ...endpointLogFields,
        status: response.status,
        providerError: error,
      });
      return { success: false, ...resultBase, status: response.status, error };
    }

    const data = await response.json();
    if (data && typeof data === 'object' && 'error' in data) {
      const error = sanitizeProviderError(data, response.status, config.apiKey);
      log.warn('OpenAI-compatible model list provider error', {
        providerType: 'openai-compatible',
        providerId: request.providerId,
        providerLabel: request.providerLabel,
        ...endpointLogFields,
        status: response.status,
        providerError: error,
      });
      return { success: false, ...resultBase, status: response.status, error };
    }

    return {
      success: true,
      ...resultBase,
      status: response.status,
      models: parseOpenAICompatibleModelList(data),
    };
  } catch (err) {
    return {
      success: false,
      ...buildModelListResultBase(request, endpoint),
      error: redactApiKey((err as Error).message, config.apiKey),
    };
  }
}
