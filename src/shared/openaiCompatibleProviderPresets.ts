export type OpenAICompatibleProviderPresetId =
  | 'openai'
  | 'gemini'
  | 'siliconflow'
  | 'deepseek'
  | 'qwen-dashscope'
  | 'moonshot-kimi'
  | 'openrouter'
  | 'nvidia-nim'
  | 'minimax'
  | 'ollama'
  | 'lm-studio'
  | 'vllm'
  | 'custom';

export interface OpenAICompatibleProviderPreset {
  id: OpenAICompatibleProviderPresetId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  alternativeModel?: string;
  note?: string;
  isLocal?: boolean;
  isCustom?: boolean;
}

export const OPENAI_COMPATIBLE_PROVIDER_PRESETS: OpenAICompatibleProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.5-flash',
    note: "Gemini uses Google's OpenAI-compatible endpoint. Keep /v1beta/openai in the Base URL.",
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Pro/zai-org/GLM-4.7',
    alternativeModel: 'Qwen/Qwen3.6-35B-A3B',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    note: 'Some users may use /v1; Custom endpoints are supported.',
  },
  {
    id: 'qwen-dashscope',
    label: 'Qwen / DashScope',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    note: 'Regional DashScope endpoints may differ.',
  },
  {
    id: 'moonshot-kimi',
    label: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-latest',
    note: 'Model names may change; users can edit the model field.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    note: 'OpenRouter may support optional HTTP-Referer and X-Title headers, but they are not required here.',
  },
  {
    id: 'nvidia-nim',
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-70b-instruct',
    note: 'NVIDIA catalog model names may change; users can edit the model field.',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M2.7',
    note: 'OpenAI-compatible endpoint. Some MiniMax docs may also mention Anthropic-compatible APIs; this preset is for Chat Completions only.',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    note: 'Local provider. API key may be ignored.',
    isLocal: true,
  },
  {
    id: 'lm-studio',
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    note: 'Local provider. Use the loaded model id from LM Studio.',
    isLocal: true,
  },
  {
    id: 'vllm',
    label: 'vLLM',
    baseUrl: 'http://localhost:8000/v1',
    defaultModel: 'local-model',
    note: 'Local/self-hosted provider. Use the served model name.',
    isLocal: true,
  },
  {
    id: 'custom',
    label: 'Custom OpenAI Compatible',
    baseUrl: '',
    defaultModel: '',
    isCustom: true,
  },
];

export const OPENAI_COMPATIBLE_PROVIDER_DEFAULT_MODELS = new Set(
  OPENAI_COMPATIBLE_PROVIDER_PRESETS
    .map((preset) => preset.defaultModel)
    .filter(Boolean),
);

export function findOpenAICompatiblePresetByBaseUrl(baseUrl: string): OpenAICompatibleProviderPreset {
  const trimmedBaseUrl = baseUrl.trim();
  return (
    OPENAI_COMPATIBLE_PROVIDER_PRESETS.find((preset) => !preset.isCustom && preset.baseUrl === trimmedBaseUrl) ??
    OPENAI_COMPATIBLE_PROVIDER_PRESETS[OPENAI_COMPATIBLE_PROVIDER_PRESETS.length - 1]
  );
}
