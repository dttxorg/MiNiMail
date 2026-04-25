export interface RewriteRemoteImagesOptions {
  allowRemoteImages?: boolean;
  placeholderText?: string;
}

export interface RewriteRemoteImagesResult {
  html: string;
  blockedRemoteImageCount: number;
}

const IMG_TAG_RE = /<img\b([^>]*)>/gi;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function readAttribute(attributes: string, name: string): string | null {
  ATTR_RE.lastIndex = 0;
  const expected = name.toLowerCase();
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(attributes))) {
    if (match[1].toLowerCase() !== expected) continue;
    return match[2] ?? match[3] ?? match[4] ?? '';
  }
  return null;
}

function stripAttributes(attributes: string, names: string[]): string {
  const blocked = new Set(names.map((name) => name.toLowerCase()));
  const safeParts: string[] = [];

  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(attributes))) {
    const name = match[1];
    if (blocked.has(name.toLowerCase())) continue;
    const value = match[2] ?? match[3] ?? match[4];
    if (value === undefined) {
      safeParts.push(name);
    } else {
      safeParts.push(`${name}="${escapeHtmlAttribute(value)}"`);
    }
  }

  return safeParts.length ? ` ${safeParts.join(' ')}` : '';
}

function isRemoteImageSource(src: string): boolean {
  const normalized = src.trim().toLowerCase();
  return normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('//');
}

function isTinyTrackingImage(attributes: string): boolean {
  const width = Number.parseInt(readAttribute(attributes, 'width') || '', 10);
  const height = Number.parseInt(readAttribute(attributes, 'height') || '', 10);
  return Number.isFinite(width) && Number.isFinite(height) && width <= 1 && height <= 1;
}

function removeUnsafeImageSources(imageTag: string, attributes: string): string {
  const src = readAttribute(attributes, 'src');
  if (!src || !/^\s*javascript:/i.test(src)) return imageTag;
  return `<img${stripAttributes(attributes, ['src', 'srcset', 'onerror', 'onload'])}>`;
}

export function rewriteRemoteImagesForPrivacy(
  html: string,
  options: RewriteRemoteImagesOptions = {},
): RewriteRemoteImagesResult {
  let blockedRemoteImageCount = 0;
  const placeholderText = options.placeholderText || 'Remote image blocked';

  const rewrittenHtml = html.replace(IMG_TAG_RE, (imageTag: string, attributes: string) => {
    const src = readAttribute(attributes, 'src')?.trim();
    if (!src) return imageTag;

    if (!isRemoteImageSource(src)) {
      return removeUnsafeImageSources(imageTag, attributes);
    }

    if (options.allowRemoteImages) {
      return imageTag;
    }

    blockedRemoteImageCount += 1;
    const alt = readAttribute(attributes, 'alt') || placeholderText;
    const width = readAttribute(attributes, 'width');
    const height = readAttribute(attributes, 'height');
    const sizeAttrs = [
      width ? `data-width="${escapeHtmlAttribute(width)}"` : '',
      height ? `data-height="${escapeHtmlAttribute(height)}"` : '',
    ].filter(Boolean).join(' ');
    const trackerClass = isTinyTrackingImage(attributes) ? ' minimail-remote-image-placeholder-tracker' : '';

    return `<span class="minimail-remote-image-placeholder${trackerClass}" data-remote-image-blocked="true" data-original-src="${escapeHtmlAttribute(src)}" ${sizeAttrs} title="${escapeHtmlAttribute(alt)}">${escapeHtmlAttribute(placeholderText)}</span>`;
  });

  return {
    html: rewrittenHtml,
    blockedRemoteImageCount,
  };
}
