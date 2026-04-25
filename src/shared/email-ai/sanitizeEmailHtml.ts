import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element, DataNode, Node } from 'domhandler';
import { escapeHtml, normalizeWhitespace } from './utils';

const ALLOWED_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

const DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'meta', 'link', 'head', 'noscript']);
const SAFE_HREF_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:', 'cid:', 'data:image/'];

function isElement(node: Node): node is Element {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

function isText(node: Node): node is DataNode {
  return node.type === 'text';
}

function sanitizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (SAFE_HREF_PROTOCOLS.some((protocol) => lower.startsWith(protocol))) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return null;
}

function renderChildren(children: ChildNode[] | undefined): string {
  return (children || []).map((child) => sanitizeNode(child)).join('');
}

function sanitizeAttributes(tagName: string, attributes: Record<string, string> | undefined): string {
  if (!attributes) return '';

  const safeEntries: string[] = [];
  for (const [name, rawValue] of Object.entries(attributes)) {
    const lower = name.toLowerCase();
    if (lower.startsWith('on')) continue;

    if (tagName === 'a' && (lower === 'href' || lower === 'title')) {
      if (lower === 'href') {
        const sanitized = sanitizeUrl(rawValue);
        if (sanitized) safeEntries.push(`href="${escapeHtml(sanitized)}"`);
      } else {
        safeEntries.push(`title="${escapeHtml(rawValue)}"`);
      }
      continue;
    }

    if (tagName === 'img' && ['src', 'alt', 'title', 'width', 'height'].includes(lower)) {
      if (lower === 'src') {
        const sanitized = sanitizeUrl(rawValue);
        if (sanitized) safeEntries.push(`src="${escapeHtml(sanitized)}"`);
      } else {
        safeEntries.push(`${lower}="${escapeHtml(rawValue)}"`);
      }
      continue;
    }

    if (['colspan', 'rowspan'].includes(lower)) {
      safeEntries.push(`${lower}="${escapeHtml(rawValue)}"`);
    }
  }

  return safeEntries.length > 0 ? ` ${safeEntries.join(' ')}` : '';
}

function sanitizeNode(node: Node): string {
  if (isText(node)) {
    return escapeHtml(node.data);
  }

  if (!isElement(node)) return '';

  const tagName = node.name.toLowerCase();
  if (DROP_CONTENT_TAGS.has(tagName)) return '';

  const children = renderChildren(node.children);
  if (!ALLOWED_TAGS.has(tagName)) {
    return children;
  }

  const attrs = sanitizeAttributes(tagName, node.attribs);
  if (tagName === 'br' || tagName === 'hr') {
    return `<${tagName}${attrs} />`;
  }

  if (tagName === 'img') {
    return `<img${attrs} />`;
  }

  return `<${tagName}${attrs}>${children}</${tagName}>`;
}

/**
 * Convert unsafe email HTML into a render-safe whitelist HTML string.
 *
 * Example:
 * sanitizeEmailHtml('<p>Hello<script>alert(1)</script></p>')
 * -> '<p>Hello</p>'
 */
export function sanitizeEmailHtml(rawHtml?: string): string {
  if (!rawHtml?.trim()) return '';

  const document = parseDocument(rawHtml, { decodeEntities: true });
  const rendered = document.children.map((child) => sanitizeNode(child)).join('');

  return normalizeWhitespace(rendered)
    .replace(/<\/(p|div|li|tr|blockquote|pre|h[1-6])>\s+</g, '</$1><')
    .trim();
}
