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
  const combined = type ? `${message} (${type}, HTTP ${status})` : `${message} (HTTP ${status})`;
  return combined;
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
