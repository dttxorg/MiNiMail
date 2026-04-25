import { parseDocument } from 'htmlparser2';
import type { ChildNode, DataNode, Element, Node } from 'domhandler';
import { escapeHtml } from './utils';

const DROP_TAGS = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'meta', 'link', 'head']);
const SKIP_TRANSLATE_TAGS = new Set(['script', 'style', 'noscript', 'code', 'pre']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const URL_TEXT_PATTERN = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
const TRANSLATABLE_CHAR_PATTERN = /[A-Za-z\u00C0-\u024F\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const TRANSLATE_SEGMENT_BATCH_SIZE = 24;

type TranslateSegments = (segments: string[]) => Promise<string[]>;

function isElement(node: Node): node is Element {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

function isText(node: Node): node is DataNode {
  return node.type === 'text';
}

function splitWhitespace(value: string): { leading: string; core: string; trailing: string } {
  const match = value.match(/^(\s*)([\s\S]*?\S)(\s*)$/);
  if (!match) {
    return { leading: value, core: '', trailing: '' };
  }
  return {
    leading: match[1],
    core: match[2],
    trailing: match[3],
  };
}

function shouldTranslateText(value: string): boolean {
  return TRANSLATABLE_CHAR_PATTERN.test(value);
}

function maskUrls(value: string): { masked: string; restore: Array<{ token: string; value: string }> } {
  const restore: Array<{ token: string; value: string }> = [];
  let index = 0;
  const masked = value.replace(URL_TEXT_PATTERN, (match) => {
    index += 1;
    const token = `[LINK_${index}]`;
    restore.push({ token, value: match });
    return token;
  });

  return { masked, restore };
}

function unmaskUrls(value: string, restore: Array<{ token: string; value: string }>): string {
  return restore.reduce((current, entry) => current.split(entry.token).join(entry.value), value);
}

function serializeAttributes(attributes: Record<string, string> | undefined): string {
  if (!attributes) return '';

  return Object.entries(attributes)
    .filter(([name]) => !name.toLowerCase().startsWith('on'))
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
}

function serializeNode(node: Node): string {
  if (isText(node)) {
    return escapeHtml(node.data);
  }

  if (!isElement(node)) {
    return '';
  }

  const tagName = node.name.toLowerCase();
  if (DROP_TAGS.has(tagName)) {
    return '';
  }

  const attrs = serializeAttributes(node.attribs);
  if (VOID_TAGS.has(tagName)) {
    return `<${tagName}${attrs}>`;
  }

  const children = (node.children || []).map((child) => serializeNode(child)).join('');
  return `<${tagName}${attrs}>${children}</${tagName}>`;
}

type TextMutation = {
  node: DataNode;
  leading: string;
  trailing: string;
  restore: Array<{ token: string; value: string }>;
  masked: string;
};

async function translateSegmentBatches(
  values: string[],
  translateSegments: TranslateSegments,
): Promise<string[]> {
  const translated: string[] = [];

  for (let index = 0; index < values.length; index += TRANSLATE_SEGMENT_BATCH_SIZE) {
    const batch = values.slice(index, index + TRANSLATE_SEGMENT_BATCH_SIZE);
    const batchResult = await translateSegmentBatchSafely(batch, translateSegments);
    translated.push(...batchResult);
  }

  return translated;
}

async function translateSegmentBatchSafely(
  values: string[],
  translateSegments: TranslateSegments,
): Promise<string[]> {
  if (values.length === 0) {
    return [];
  }

  try {
    const result = await translateSegments(values);
    if (result.length !== values.length) {
      throw new Error('Translated segment count did not match source segment count');
    }
    return result;
  } catch (err) {
    if (values.length === 1) {
      return values;
    }

    const midpoint = Math.ceil(values.length / 2);
    const left = await translateSegmentBatchSafely(values.slice(0, midpoint), translateSegments);
    const right = await translateSegmentBatchSafely(values.slice(midpoint), translateSegments);
    return [...left, ...right];
  }
}

function collectTextMutations(node: Node, mutations: TextMutation[], ancestorTags: string[] = []): void {
  if (isText(node)) {
    const parentTag = ancestorTags[ancestorTags.length - 1];
    if (parentTag && SKIP_TRANSLATE_TAGS.has(parentTag)) {
      return;
    }

    const { leading, core, trailing } = splitWhitespace(node.data);
    if (!core || !shouldTranslateText(core)) {
      return;
    }

    const masked = maskUrls(core);
    if (!shouldTranslateText(masked.masked.replace(/\[LINK_\d+\]/g, ''))) {
      return;
    }

    mutations.push({
      node,
      leading,
      trailing,
      restore: masked.restore,
      masked: masked.masked,
    });
    return;
  }

  if (!isElement(node)) {
    return;
  }

  const tagName = node.name.toLowerCase();
  if (DROP_TAGS.has(tagName)) {
    return;
  }

  const nextAncestors = [...ancestorTags, tagName];
  for (const child of node.children || []) {
    collectTextMutations(child, mutations, nextAncestors);
  }
}

export async function translateHtmlPreservingMarkup(
  rawHtml: string,
  translateSegments: TranslateSegments,
): Promise<string> {
  if (!rawHtml.trim()) {
    return rawHtml;
  }

  const document = parseDocument(rawHtml, { decodeEntities: true });
  const mutations: TextMutation[] = [];
  for (const child of document.children as ChildNode[]) {
    collectTextMutations(child, mutations);
  }

  if (mutations.length === 0) {
    return rawHtml;
  }

  const translated = await translateSegmentBatches(
    mutations.map((mutation) => mutation.masked),
    translateSegments,
  );
  if (translated.length !== mutations.length) {
    throw new Error('Translated segment count did not match source segment count');
  }

  mutations.forEach((mutation, index) => {
    const restored = unmaskUrls(translated[index] || mutation.masked, mutation.restore);
    mutation.node.data = `${mutation.leading}${restored}${mutation.trailing}`;
  });

  return document.children.map((child) => serializeNode(child)).join('');
}
