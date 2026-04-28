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

function stringifyProviderErrorValue(value: unknown, apiKey: string, maxLength = 300): string {
  if (value === undefined || value === null) return '';
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return truncate(redactApiKey(raw, apiKey), maxLength);
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
  const message = redactApiKey(rawMessage, apiKey);
  const rawType = typeof error.error?.type === 'string'
    ? error.error.type
    : typeof error.type === 'string'
      ? error.type
      : '';
  const type = redactApiKey(rawType, apiKey);
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
  const redactedBody = redactApiKey(bodyText.trim(), apiKey);
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
