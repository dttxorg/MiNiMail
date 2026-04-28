export function normalizeOpenAICompatibleEndpoint(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('API base URL not configured.');

  const parsed = new URL(trimmed);
  const basePath = parsed.pathname.replace(/\/+$/, '');
  const pathname = /\/chat\/completions$/i.test(basePath)
    ? basePath
    : `${basePath}/chat/completions`;

  parsed.pathname = pathname.replace(/\/{2,}/g, '/');
  parsed.hash = '';
  return parsed.toString();
}
