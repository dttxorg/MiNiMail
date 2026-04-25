import type {
  EmailAddress,
  EmailBodyBlock,
  EmailBodyBlockType,
  EmailLink,
  GmailHeaderLike,
  GmailMessagePartLike,
  RedactionMapEntry,
  SensitiveEntityType,
} from './types';

const BLOCK_TYPES: EmailBodyBlockType[] = [
  'latest_reply',
  'quoted_history',
  'signature',
  'disclaimer',
  'footer',
  'list',
  'table',
  'code',
  'link_list',
  'noise',
];

export const QUOTE_HEADER_PATTERNS = [
  /^on .+wrote:$/i,
  /^from:\s/i,
  /^sent:\s/i,
  /^subject:\s/i,
  /^to:\s/i,
  /^cc:\s/i,
  /^发件人[:：]/,
  /^发送时间[:：]/,
  /^日期[:：]/,
  /^主题[:：]/,
  /^收件人[:：]/,
  /^抄送[:：]/,
  /^差出人[:：]/,
  /^件名[:：]/,
  /^送信日時[:：]/,
  /^宛先[:：]/,
  /^보낸 사람[:：]/,
  /^받는 사람[:：]/,
  /^제목[:：]/,
  /^날짜[:：]/,
  /^de[:：]/i,
  /^para[:：]/i,
  /^asunto[:：]/i,
  /^date[:：]/i,
  /^betreff[:：]/i,
  /^von[:：]/i,
  /^an[:：]/i,
  /^от[:：]/i,
  /^кому[:：]/i,
  /^тема[:：]/i,
  /^[-]{2,}\s*forwarded message\s*[-]{2,}$/i,
];

export const SIGNATURE_HINT_PATTERNS = [
  /^--\s*$/,
  /^best regards[,]?\s*$/i,
  /^regards[,]?\s*$/i,
  /^kind regards[,]?\s*$/i,
  /^thanks[,]?\s*$/i,
  /^thank you[,]?\s*$/i,
  /^cheers[,]?\s*$/i,
  /^sincerely[,]?\s*$/i,
  /^此致/,
  /^敬礼/,
  /^谢谢/,
  /^감사합니다/,
  /^よろしくお願いします/,
];

export const DISCLAIMER_PATTERNS = [
  /confidential/i,
  /intended only for the recipient/i,
  /privileged and confidential/i,
  /本邮件.*保密/,
  /本邮件及其附件/,
  /免责声明/,
  /免責事項/,
  /이 메시지/,
];

export const FOOTER_PATTERNS = [
  /unsubscribe/i,
  /manage preferences/i,
  /view in browser/i,
  /privacy policy/i,
  /terms of use/i,
  /退订/,
  /取消订阅/,
  /在浏览器中查看/,
  /配信停止/,
  /購読解除/,
];

export const URL_PATTERN = /https?:\/\/[^\s)>\]]+/gi;
export const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;
export const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
export const ORDER_ID_PATTERN = /\b(?:ORD|ORDER|INV|PO|NO\.?|#)?[-:\s]?[A-Z]{0,4}-?\d{4,}\b/gi;
export const DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
export const AMOUNT_PATTERN = /(?:[$€£¥]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|EUR|CNY|RMB|JPY|HKD)\b)/gi;
export const ADDRESS_PATTERN = /(?:地址[:：]\s*[^\n]+|Address[:：]?\s*[^\n]+|\d{1,5}\s+[A-Za-z0-9.\s]+(?:Street|St|Road|Rd|Avenue|Ave|Blvd|Lane|Ln|Drive|Dr)\b[^\n]*)/gi;

function clonePattern(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags);
}

export function createEmptyBlocks(): Record<EmailBodyBlockType, EmailBodyBlock[]> {
  return BLOCK_TYPES.reduce<Record<EmailBodyBlockType, EmailBodyBlock[]>>((acc, key) => {
    acc[key] = [];
    return acc;
  }, {} as Record<EmailBodyBlockType, EmailBodyBlock[]>);
}

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200f\u2028\u2029]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function plainTextToHtml(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

export function decodeBufferWithCharset(buffer: Buffer, contentType?: string): string {
  const charsetMatch = contentType?.match(/charset="?([^";]+)"?/i);
  const charset = charsetMatch?.[1]?.trim().toLowerCase() || 'utf-8';

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const iconv = require('iconv-lite') as typeof import('iconv-lite');
    if (iconv.encodingExists(charset)) {
      return iconv.decode(buffer, charset);
    }
  } catch {
    // fall back to utf-8 below
  }

  return buffer.toString('utf8');
}

export function parseAddressHeader(value?: string): EmailAddress[] {
  if (!value) return [];

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*?)(?:<([^>]+)>)?$/);
      const name = match?.[1]?.replace(/^"|"$/g, '').trim() || '';
      const address = (match?.[2] || entry).replace(/^<|>$/g, '').trim();
      return { name, address };
    })
    .filter((entry) => Boolean(entry.address));
}

export function stringifyAddress(address: EmailAddress): string {
  return address.name ? `${address.name} <${address.address}>` : address.address;
}

export function getHeaderValue(headers: GmailHeaderLike[] | undefined, name: string): string | undefined {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
}

export function collectGmailParts(part: GmailMessagePartLike, collector: GmailMessagePartLike[] = []): GmailMessagePartLike[] {
  collector.push(part);
  for (const child of part.parts || []) {
    collectGmailParts(child, collector);
  }
  return collector;
}

export function extractReferences(value?: string): string[] {
  if (!value) return [];
  const matches = value.match(/<[^>]+>/g);
  if (matches) return matches;
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function extractLinks(value: string): EmailLink[] {
  return value
    .split('\n')
    .flatMap((line) => {
      const matches = Array.from(line.matchAll(clonePattern(URL_PATTERN)));
      if (matches.length === 0) return [];

      return matches.map((match) => {
        const url = match[0];
        const text = line
          .replace(url, '')
          .replace(/[<>()[\]]/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();

        return {
          text: text || url,
          url,
        };
      });
    });
}

export function makeBlock(
  type: EmailBodyBlockType,
  lines: string[],
  startLine: number,
): EmailBodyBlock | null {
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
  if (cleanLines.length === 0) return null;
  return {
    type,
    text: cleanLines.join('\n'),
    lines: cleanLines,
    startLine,
    endLine: startLine + cleanLines.length - 1,
  };
}

export function appendBlock(
  collection: Record<EmailBodyBlockType, EmailBodyBlock[]>,
  type: EmailBodyBlockType,
  lines: string[],
  startLine: number,
): void {
  const block = makeBlock(type, lines, startLine);
  if (block) collection[type].push(block);
}

export function collectMatches(value: string, pattern: RegExp): string[] {
  return uniqueStrings(Array.from(value.matchAll(clonePattern(pattern))).map((match) => match[0].trim()));
}

export function defaultRedactionToken(type: SensitiveEntityType, index: number): string {
  return `[${type}_${index}]`;
}

export function pushRedactionEntry(
  map: RedactionMapEntry[],
  type: SensitiveEntityType,
  value: string,
): string {
  const existing = map.find((entry) => entry.type === type && entry.original === value);
  if (existing) return existing.placeholder;

  const token = defaultRedactionToken(type, map.filter((entry) => entry.type === type).length + 1);
  map.push({ placeholder: token, original: value, type });
  return token;
}
