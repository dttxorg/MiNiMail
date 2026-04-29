export function getEndpointLogFields(endpoint: string): { endpointHost: string; endpointPath: string } {
  try {
    const parsed = new URL(endpoint);
    return {
      endpointHost: parsed.host,
      endpointPath: parsed.pathname,
    };
  } catch {
    return {
      endpointHost: 'invalid-url',
      endpointPath: '',
    };
  }
}

export function redactApiKey(value: string, apiKey: string): string {
  return apiKey ? value.split(apiKey).join('[REDACTED_API_KEY]') : value;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export type AIProviderDiagnosticsOperation = 'testConnection' | 'fetchModels' | 'callAI';

export type SafeProviderDiagnostics = {
  appVersion?: string;
  platform?: string;
  provider?: {
    id?: string;
    label?: string;
  };
  endpointHost?: string;
  endpointPath?: string;
  model?: string;
  operation?: AIProviderDiagnosticsOperation;
  status?: number;
  errorSummary?: string;
  responseStructureSummary?: unknown;
  timestamp?: string;
};

export function redactDiagnosticText(value: string): string {
  return value
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/AIza[0-9A-Za-z_-]{16,}/g, '[REDACTED_API_KEY]')
    .replace(/gh[pousr]_[0-9A-Za-z_]{12,}/g, '[REDACTED_TOKEN]');
}

function stringifyProviderErrorValue(value: unknown, apiKey: string, maxLength = 300): string {
  if (value === undefined || value === null) return '';
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return truncate(redactDiagnosticText(redactApiKey(raw, apiKey)), maxLength);
}

export function sanitizeProviderError(errorData: unknown, status: number, apiKey: string): string {
  const error = errorData && typeof errorData === 'object'
    ? (errorData as { error?: { message?: unknown; type?: unknown }; message?: unknown; type?: unknown })
    : {};
  const rawMessage = typeof error.error?.message === 'string'
    ? error.error.message
    : typeof error.message === 'string'
      ? error.message
      : `HTTP ${status}`;
  const message = redactDiagnosticText(redactApiKey(rawMessage, apiKey));
  const rawType = typeof error.error?.type === 'string'
    ? error.error.type
    : typeof error.type === 'string'
      ? error.type
      : '';
  const type = redactDiagnosticText(redactApiKey(rawType, apiKey));
  const rawCode = error && typeof error === 'object'
    ? (error as { error?: { code?: unknown }; code?: unknown }).error?.code ?? (error as { code?: unknown }).code
    : undefined;
  const code = stringifyProviderErrorValue(rawCode, apiKey, 80);
  const rawProviderStatus = error && typeof error === 'object'
    ? (error as { error?: { status?: unknown }; status?: unknown }).error?.status ?? (error as { status?: unknown }).status
    : undefined;
  const providerStatus = stringifyProviderErrorValue(rawProviderStatus, apiKey, 80);
  const rawDetails = error && typeof error === 'object'
    ? (error as { error?: { details?: unknown }; details?: unknown }).error?.details ?? (error as { details?: unknown }).details
    : undefined;
  const details = stringifyProviderErrorValue(rawDetails, apiKey, 300);
  const metadata = [
    providerStatus ? `status: ${providerStatus}` : '',
    code ? `code: ${code}` : '',
    type ? `type: ${type}` : '',
    `HTTP ${status}`,
    details ? `details: ${details}` : '',
  ].filter(Boolean);
  const combined = `${message} (${metadata.join(', ')})`;
  return combined;
}

export function sanitizeProviderErrorBody(bodyText: string, status: number, apiKey: string): string {
  const redactedBody = redactDiagnosticText(redactApiKey(bodyText.trim(), apiKey));
  if (!redactedBody) return sanitizeProviderError({}, status, apiKey);

  try {
    return sanitizeProviderError(JSON.parse(redactedBody), status, apiKey);
  } catch {
    return `${truncate(redactedBody, 300)} (HTTP ${status})`;
  }
}

export async function readProviderErrorResponse(response: {
  status: number;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}, apiKey: string): Promise<string> {
  if (typeof response.text === 'function') {
    return sanitizeProviderErrorBody(await response.text(), response.status, apiKey);
  }

  if (typeof response.json === 'function') {
    try {
      return sanitizeProviderError(await response.json(), response.status, apiKey);
    } catch {
      return sanitizeProviderError({}, response.status, apiKey);
    }
  }

  return sanitizeProviderError({}, response.status, apiKey);
}

export function getProviderFriendlyMessage(params: {
  status?: number;
  error?: string;
  operation?: AIProviderDiagnosticsOperation;
  localProvider?: boolean;
}): string {
  const operation = params.operation === 'fetchModels' ? 'Fetch models' : 'Test connection';
  const error = params.error || '';
  if (/api key/i.test(error)) {
    return 'API key or provider permission may be invalid.';
  }
  if (/base url|endpoint|model/i.test(error) && !params.status) {
    return 'Endpoint or model may be incorrect.';
  }
  if (params.status === 401 || params.status === 403) {
    return 'API key or provider permission may be invalid.';
  }
  if (params.status === 404) {
    return 'Endpoint or model may be incorrect.';
  }
  if (params.status === 429) {
    return 'Quota exceeded or rate limited by provider.';
  }
  if (params.status === 500 || params.status === 502 || params.status === 503) {
    return 'Provider upstream temporary error.';
  }
  if (!params.status && error) {
    return params.localProvider
      ? 'Ollama / LM Studio / vLLM local server may not be running.'
      : 'Network error. Check your connection or provider availability.';
  }
  return params.operation === 'fetchModels'
    ? `${operation} completed.`
    : 'Connection succeeded.';
}

export function summarizeProviderErrorForUi(error: string | undefined): string | undefined {
  if (!error) return undefined;
  return truncate(redactDiagnosticText(error), 300);
}

export function buildSafeProviderDiagnostics(input: SafeProviderDiagnostics & Record<string, unknown>): SafeProviderDiagnostics {
  return {
    appVersion: typeof input.appVersion === 'string' ? redactDiagnosticText(input.appVersion) : undefined,
    platform: typeof input.platform === 'string' ? redactDiagnosticText(input.platform) : undefined,
    provider: input.provider && typeof input.provider === 'object'
      ? {
          id: typeof input.provider.id === 'string' ? redactDiagnosticText(input.provider.id) : undefined,
          label: typeof input.provider.label === 'string' ? redactDiagnosticText(input.provider.label) : undefined,
        }
      : undefined,
    endpointHost: typeof input.endpointHost === 'string' ? redactDiagnosticText(input.endpointHost) : undefined,
    endpointPath: typeof input.endpointPath === 'string' ? redactDiagnosticText(input.endpointPath) : undefined,
    model: typeof input.model === 'string' ? redactDiagnosticText(input.model) : undefined,
    operation: input.operation,
    status: typeof input.status === 'number' ? input.status : undefined,
    errorSummary: typeof input.errorSummary === 'string' ? summarizeProviderErrorForUi(input.errorSummary) : undefined,
    responseStructureSummary: input.responseStructureSummary,
    timestamp: typeof input.timestamp === 'string' ? redactDiagnosticText(input.timestamp) : undefined,
  };
}

export function getOpenAICompatibleProviderErrorHint(endpoint: string, status: number): string {
  const fields = getEndpointLogFields(endpoint);
  if (
    status === 404 &&
    fields.endpointHost === 'generativelanguage.googleapis.com' &&
    fields.endpointPath === '/chat/completions'
  ) {
    return 'Gemini Base URL may be missing /v1beta/openai.';
  }
  if (status === 503) {
    return 'Provider upstream temporary error / service unavailable.';
  }
  return '';
}

export function appendProviderErrorHint(error: string, hint: string): string {
  return hint ? `${error}. ${hint}` : error;
}
