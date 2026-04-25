import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element, DataNode, Node } from 'domhandler';
import type { EmailLink, NormalizedEmailText } from './types';
import { normalizeWhitespace, URL_PATTERN } from './utils';

interface NormalizeInput {
  textBody?: string;
  htmlBody?: string;
}

type RenderContext = {
  links: EmailLink[];
  listDepth: number;
  orderedListIndex: number[];
};

function isElement(node: Node): node is Element {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

function isText(node: Node): node is DataNode {
  return node.type === 'text';
}

function extractText(nodes: ChildNode[] | undefined): string {
  return (nodes || [])
    .map((node) => {
      if (isText(node)) return node.data;
      if (isElement(node)) return extractText(node.children);
      return '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderNode(node: Node, ctx: RenderContext): string {
  if (isText(node)) return node.data;
  if (!isElement(node)) return '';

  const tag = node.name.toLowerCase();
  if (tag === 'script' || tag === 'style') return '';
  if (tag === 'br') return '\n';
  if (tag === 'hr') return '\n---\n';

  if (tag === 'a') {
    const text = extractText(node.children) || node.attribs?.href || '';
    const href = node.attribs?.href?.trim();
    if (href) {
      ctx.links.push({ text, url: href });
      return text && text !== href ? `${text} <${href}>` : href;
    }
    return text;
  }

  if (tag === 'img') {
    return node.attribs?.alt?.trim() || '';
  }

  if (tag === 'li') {
    const text = renderChildren(node.children, ctx).trim();
    const prefix = ctx.listDepth > 0 ? '- ' : '';
    return `${prefix}${text}\n`;
  }

  if (tag === 'tr') {
    const cells = (node.children || [])
      .filter((child): child is Element => isElement(child) && ['td', 'th'].includes(child.name.toLowerCase()))
      .map((cell) => renderChildren(cell.children, ctx).trim())
      .filter(Boolean);
    return cells.length > 0 ? `${cells.join(' | ')}\n` : renderChildren(node.children, ctx);
  }

  if (tag === 'pre' || tag === 'code') {
    return `\n${extractText(node.children)}\n`;
  }

  const childContent = renderChildren(node.children, ctx);
  if (['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'table', 'ul', 'ol', 'thead', 'tbody', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
    return `${childContent}\n`;
  }

  return childContent;
}

function renderChildren(nodes: ChildNode[] | undefined, ctx: RenderContext): string {
  return (nodes || []).map((node) => renderNode(node, ctx)).join('');
}

function normalizeLines(value: string): string[] {
  return normalizeWhitespace(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Build AI-friendly plain text while preserving paragraphs, lists, tables and link text.
 *
 * Example:
 * normalizeEmailText({ htmlBody: '<p>Pay now <a href="https://x.com">portal</a></p>' })
 * -> { plainText: 'Pay now portal <https://x.com>', links: [{ text: 'portal', url: 'https://x.com' }] }
 */
export function normalizeEmailText(input: NormalizeInput): NormalizedEmailText {
  const links: EmailLink[] = [];
  const textCandidate = normalizeWhitespace(input.textBody || '');

  let htmlCandidate = '';
  if (input.htmlBody?.trim()) {
    const ctx: RenderContext = { links, listDepth: 0, orderedListIndex: [] };
    const document = parseDocument(input.htmlBody, { decodeEntities: true });
    htmlCandidate = normalizeWhitespace(document.children.map((child) => renderNode(child, ctx)).join(''));
  }

  const fallbackLinks = Array.from((textCandidate || htmlCandidate).matchAll(URL_PATTERN)).map((match) => ({ text: match[0], url: match[0] }));
  const uniqueLinks = [...links, ...fallbackLinks].filter((link, index, arr) =>
    arr.findIndex((item) => item.url === link.url && item.text === link.text) === index
  );

  const plainText = textCandidate.length >= Math.max(40, htmlCandidate.length * 0.5)
    ? textCandidate
    : htmlCandidate || textCandidate;

  return {
    plainText,
    paragraphs: plainText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean),
    lines: normalizeLines(plainText),
    links: uniqueLinks,
  };
}
