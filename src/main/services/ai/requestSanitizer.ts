import type { AIConfig, AIRequest, OpenAICompatibleMessage, OpenAICompatibleRequestBody } from './types';

export function buildOpenAICompatibleRequestBody(
  config: Pick<AIConfig, 'model'>,
  request: AIRequest,
): OpenAICompatibleRequestBody {
  const messages: OpenAICompatibleMessage[] = [
    ...(request.system ? [{ role: 'system' as const, content: request.system }] : []),
    { role: 'user', content: request.prompt },
  ];
  const body: OpenAICompatibleRequestBody = {
    model: config.model,
    messages,
  };

  if (request.temperature !== undefined && request.temperature !== null) {
    body.temperature = request.temperature;
  }
  if (request.maxTokens !== undefined && request.maxTokens !== null) {
    body.max_tokens = request.maxTokens;
  }

  return body;
}
