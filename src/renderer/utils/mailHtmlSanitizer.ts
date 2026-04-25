import DOMPurify from 'dompurify';
import { rewriteRemoteImagesForPrivacy, type RewriteRemoteImagesResult } from './mailRemoteImages';

export interface SanitizeMailHtmlOptions {
  allowRemoteImages?: boolean;
  remoteImagePlaceholderText?: string;
}

export interface SanitizedMailHtmlResult extends RewriteRemoteImagesResult {}

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

  return rewriteRemoteImagesForPrivacy(cleanHtml, {
    allowRemoteImages: options.allowRemoteImages,
    placeholderText: options.remoteImagePlaceholderText,
  });
}
