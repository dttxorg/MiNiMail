import {
  normalizeOpenAICompatibleChatEndpoint,
  normalizeOpenAICompatibleEmbeddingsEndpoint,
  normalizeOpenAICompatibleModelsEndpoint,
} from '../../../shared/openaiCompatibleProviderPresets';

export function normalizeOpenAICompatibleEndpoint(input: string): string {
  return normalizeOpenAICompatibleChatEndpoint(input);
}

export function normalizeOpenAICompatibleModelListEndpoint(input: string): string {
  return normalizeOpenAICompatibleModelsEndpoint(input);
}

export function normalizeOpenAICompatibleEmbeddingEndpoint(input: string): string {
  return normalizeOpenAICompatibleEmbeddingsEndpoint(input);
}
