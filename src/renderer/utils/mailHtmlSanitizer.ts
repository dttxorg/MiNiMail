import DOMPurify from 'dompurify';
import { rewriteRemoteImagesForPrivacy, type RewriteRemoteImagesResult } from './mailRemoteImages';

export interface SanitizeMailHtmlOptions {
  allowRemoteImages?: boolean;
  remoteImagePlaceholderText?: string;
  /**
   * Map of inline image content-id (the part after `cid:`) to a resolved
   * data: URL or blob: URL. Mail bodies use `cid:foo` to reference
   * attachments; the renderer fetches the bytes separately and passes them
   * back through this map so the inline image renders.
   */
  inlineImages?: Record<string, string>;
}

export interface SanitizedMailHtmlResult extends RewriteRemoteImagesResult {
  /** Number of `cid:` references that were replaced via inlineImages. */
  inlineImageResolvedCount: number;
}

function stripAngleBrackets(value: string): string {
  return value.replace(/[<>]/g, '').trim();
}

function resolveCidReferences(html: string, inlineImages: Record<string, string>): { html: string; resolved: number } {
  let resolved = 0;
  const rewritten = html.replace(
    /<img\b([^>]*?)\ssrc\s*=\s*(?:"cid:([^"]+)"|'cid:([^']+)'|cid:([^\s>"']+))/gi,
    (full: string, attrs: string, dq: string | undefined, sq: string | undefined, bare: string | undefined) => {
      const cid = stripAngleBrackets(dq ?? sq ?? bare ?? '');
      if (!cid) return full;
      const dataUrl = inlineImages[cid] ?? inlineImages[cid.toLowerCase()];
      if (!dataUrl) return full;
      resolved += 1;
      // Strip any existing src attribute then append the resolved data URL.
      // Keep the rest of the attributes intact (alt, width, height, etc.).
      const cleanedAttrs = attrs.replace(
        /\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+)/i,
        '',
      );
      return `<img${cleanedAttrs} src="${dataUrl.replace(/"/g, '&quot;')}" data-minimail-cid="${cid.replace(/"/g, '&quot;')}"`;
    },
  );
  return { html: rewritten, resolved };
}

export function sanitizeMailHtml(bodyHtml: string, options: SanitizeMailHtmlOptions = {}): SanitizedMailHtmlResult {
  const cleanHtml = DOMPurify.sanitize(bodyHtml, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr', 'pre', 'code',
      'html', 'body', 'center',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'style', 'class', 'target',
      'width', 'height', 'colspan', 'rowspan',
      'bgcolor', 'align', 'valign', 'cellpadding', 'cellspacing', 'border', 'dir',
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onmouseenter'],
  });

  // Resolve cid: references first (after DOMPurify so the markup is well-formed),
  // then run the remote-image privacy pass — inline data: URLs are never
  // remote, so the privacy pass leaves them alone.
  const { html: cidResolvedHtml, resolved } = options.inlineImages
    ? resolveCidReferences(cleanHtml, options.inlineImages)
    : { html: cleanHtml, resolved: 0 };

  const remote = rewriteRemoteImagesForPrivacy(cidResolvedHtml, {
    allowRemoteImages: options.allowRemoteImages,
    placeholderText: options.remoteImagePlaceholderText,
  });

  return {
    html: remote.html,
    blockedRemoteImageCount: remote.blockedRemoteImageCount,
    inlineImageResolvedCount: resolved,
  };
}
