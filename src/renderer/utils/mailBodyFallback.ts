export function getVisibleTextFromMailHtmlForFallback(bodyHtml: string): string {
  return bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function shouldRenderPlainTextBodyFallback({
  bodyHtml,
  bodyText,
}: {
  bodyHtml?: string;
  bodyText?: string;
  preferPlainTextFallback?: boolean;
}): boolean {
  if (!bodyText?.trim()) return false;
  if (!bodyHtml?.trim()) return true;

  return getVisibleTextFromMailHtmlForFallback(bodyHtml).length < 8;
}
