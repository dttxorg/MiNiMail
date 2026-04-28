import { normalizeOpenAICompatibleChatEndpoint } from '../../../shared/openaiCompatibleProviderPresets';

export function normalizeOpenAICompatibleEndpoint(input: string): string {
  return normalizeOpenAICompatibleChatEndpoint(input);
}
