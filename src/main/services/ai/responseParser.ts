import { getReasoningContentDiagnostics } from './reasoningFilter';

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const item = content as { text?: unknown; value?: unknown; content?: unknown };
    if (typeof item.text === 'string') return item.text;
    if (item.text && typeof item.text === 'object' && typeof (item.text as { value?: unknown }).value === 'string') {
      return (item.text as { value: string }).value;
    }
    if (typeof item.value === 'string') return item.value;
    if (typeof item.content === 'string') return item.content;
  }
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const item = part as { type?: unknown; text?: unknown };
      if (item.type !== undefined && item.type !== 'text') return '';
      if (typeof item.text === 'string') return item.text;
      if (item.text && typeof item.text === 'object' && typeof (item.text as { value?: unknown }).value === 'string') {
        return (item.text as { value: string }).value;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

function getObjectKeys(value: unknown): string[] {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
}

function getValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function getTextPreview(value: unknown): string | undefined {
  const text = extractTextContent(value).trim();
  return text ? text.slice(0, 100) : undefined;
}

export function summarizeOpenAICompatibleResponseStructure(data: unknown) {
  const root = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const choices = root.choices;
  const firstChoice = Array.isArray(choices) && choices.length > 0 && choices[0] && typeof choices[0] === 'object'
    ? choices[0] as Record<string, unknown>
    : {};
  const message = firstChoice.message && typeof firstChoice.message === 'object' && !Array.isArray(firstChoice.message)
    ? firstChoice.message as Record<string, unknown>
    : {};
  const content = message.content;
  const contentType = getValueType(content);
  const contentPreview = contentType === 'array' || contentType === 'object' ? getTextPreview(content) : undefined;

  return {
    topLevelKeys: getObjectKeys(data),
    hasChoices: Array.isArray(choices),
    choicesLength: Array.isArray(choices) ? choices.length : 0,
    firstChoiceKeys: getObjectKeys(firstChoice),
    firstMessageKeys: getObjectKeys(message),
    firstMessageContentType: contentType,
    firstMessageContentTextPreview: contentPreview,
    hasFirstDelta: Boolean(firstChoice.delta),
    firstFinishReason: typeof firstChoice.finish_reason === 'string' ? firstChoice.finish_reason : null,
    ...getReasoningContentDiagnostics(data),
    hasOutput: Object.prototype.hasOwnProperty.call(root, 'output'),
    hasData: Object.prototype.hasOwnProperty.call(root, 'data'),
    hasResult: Object.prototype.hasOwnProperty.call(root, 'result'),
    hasMessage: Object.prototype.hasOwnProperty.call(root, 'message'),
    hasContent: Object.prototype.hasOwnProperty.call(root, 'content'),
  };
}

export function parseOpenAICompatibleResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const root = data as {
    choices?: unknown;
    output_text?: unknown;
    output?: unknown;
    data?: unknown;
    result?: unknown;
    message?: unknown;
    content?: unknown;
  };
  const choices = root.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return (
      extractTextContent(root.output_text) ||
      extractTextContent(root.output) ||
      extractTextContent(root.data) ||
      extractTextContent(root.result) ||
      extractTextContent(root.message) ||
      extractTextContent(root.content)
    );
  }

  const first = choices[0] as {
    message?: { content?: unknown };
    delta?: { content?: unknown };
    text?: unknown;
  };
  return (
    extractTextContent(first?.message?.content) ||
    extractTextContent(first?.text) ||
    extractTextContent(first?.delta?.content)
  );
}
