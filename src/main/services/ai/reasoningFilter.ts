const REASONING_CONTENT_FIELDS = new Set([
  'reasoning_content',
  'reasoning',
  'thinking',
  'thoughts',
  'chain_of_thought',
]);

function getSafeTextLength(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + getSafeTextLength(item), 0);
  }
  if (!value || typeof value !== 'object') return 0;

  const record = value as Record<string, unknown>;
  return ['text', 'value', 'content']
    .reduce((total, key) => total + getSafeTextLength(record[key]), 0);
}

export function getReasoningContentDiagnostics(value: unknown): { hasReasoningContent: boolean; reasoningContentLength: number } {
  if (!value || typeof value !== 'object') {
    return { hasReasoningContent: false, reasoningContentLength: 0 };
  }

  const stack: unknown[] = [value];
  let reasoningContentLength = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (!current || typeof current !== 'object') continue;

    for (const [key, item] of Object.entries(current as Record<string, unknown>)) {
      if (REASONING_CONTENT_FIELDS.has(key)) {
        reasoningContentLength += getSafeTextLength(item);
        continue;
      }
      if (item && typeof item === 'object') {
        stack.push(item);
      }
    }
  }

  return {
    hasReasoningContent: reasoningContentLength > 0,
    reasoningContentLength,
  };
}
