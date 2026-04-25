import { simpleParser } from 'mailparser';
import type { ParsedMail } from 'mailparser';
import type {
  AttachmentMetadata,
  EmailAddress,
  EmailMessageInput,
  GmailHeaderLike,
  GmailMessagePayloadLike,
  ParsedEmailMessage,
} from './types';
import { normalizeEmailText } from './normalizeEmailText';
import { sanitizeEmailHtml } from './sanitizeEmailHtml';
import {
  collectGmailParts,
  decodeBase64Url,
  decodeBufferWithCharset,
  extractReferences,
  getHeaderValue,
  parseAddressHeader,
  plainTextToHtml,
} from './utils';

function mapAddresses(list: Array<{ name?: string; address?: string }> | undefined | null): EmailAddress[] {
  return (list || [])
    .map((entry) => ({
      name: entry.name || '',
      address: entry.address || '',
    }))
    .filter((entry) => Boolean(entry.address));
}

function readParsedAddresses(
  value: ParsedMail['from'] | ParsedMail['to'] | ParsedMail['cc'],
): EmailAddress[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return mapAddresses(value.flatMap((item) => item.value || []));
  }
  return mapAddresses(value.value || []);
}

function appendHeaderValue(target: Record<string, string[]>, name: string, value: string | undefined): void {
  if (!value) return;
  const key = name.toLowerCase();
  if (!target[key]) target[key] = [];
  target[key].push(value);
}

function normalizeHeadersFromParsedMail(parsed: ParsedMail): Record<string, string[]> {
  const headers: Record<string, string[]> = {};
  appendHeaderValue(headers, 'message-id', parsed.messageId || undefined);
  appendHeaderValue(headers, 'subject', parsed.subject || undefined);
  appendHeaderValue(headers, 'date', parsed.date?.toISOString());
  appendHeaderValue(headers, 'in-reply-to', parsed.inReplyTo || undefined);

  for (const [key, rawValue] of parsed.headers.entries()) {
    if (Array.isArray(rawValue)) {
      for (const entry of rawValue) {
        appendHeaderValue(headers, key, String(entry));
      }
      continue;
    }
    appendHeaderValue(headers, key, String(rawValue));
  }

  return headers;
}

function normalizeHeadersFromGmail(headers: GmailHeaderLike[] | undefined): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const header of headers || []) {
    appendHeaderValue(result, header.name, header.value);
  }
  return result;
}

function normalizeParsedMail(parsed: ParsedMail): ParsedEmailMessage {
  const htmlBody = typeof parsed.html === 'string'
    ? parsed.html
    : parsed.html
      ? String(parsed.html)
      : undefined;
  const textBody = parsed.text || '';
  const rawHtml = htmlBody;
  const safeHtml = sanitizeEmailHtml(rawHtml || plainTextToHtml(textBody || ''));
  const normalized = normalizeEmailText({ textBody, htmlBody: safeHtml || rawHtml });

  const headerReferences = parsed.references || parsed.headers.get('references');
  const references = Array.isArray(headerReferences)
    ? headerReferences.flatMap((value) => extractReferences(String(value)))
    : extractReferences(headerReferences ? String(headerReferences) : undefined);

  const attachments: AttachmentMetadata[] = parsed.attachments.map((attachment) => ({
    filename: attachment.filename || 'attachment',
    contentType: attachment.contentType || 'application/octet-stream',
    size: attachment.size,
    contentId: attachment.contentId || undefined,
    inline: attachment.contentDisposition === 'inline',
  }));

  return {
    messageId: parsed.messageId || undefined,
    subject: parsed.subject || '',
    from: readParsedAddresses(parsed.from),
    to: readParsedAddresses(parsed.to),
    cc: readParsedAddresses(parsed.cc),
    date: parsed.date?.toISOString(),
    inReplyTo: parsed.inReplyTo || undefined,
    references,
    headers: normalizeHeadersFromParsedMail(parsed),
    textBody,
    htmlBody,
    rawHtml,
    safeHtml,
    plainText: normalized.plainText,
    links: normalized.links,
    attachments,
  };
}

function normalizeGmailPayload(payload: GmailMessagePayloadLike): ParsedEmailMessage {
  const headers = payload.headers || [];
  const parts = collectGmailParts(payload);
  const textBodies: string[] = [];
  const htmlBodies: string[] = [];
  const attachments: AttachmentMetadata[] = [];

  for (const part of parts) {
    const mimeType = (part.mimeType || '').toLowerCase();
    const contentTypeHeader = getHeaderValue(part.headers, 'content-type') || mimeType;
    const data = part.body?.data ? decodeBase64Url(part.body.data) : null;

    if (mimeType === 'text/plain' && data) {
      textBodies.push(decodeBufferWithCharset(data, contentTypeHeader));
    } else if (mimeType === 'text/html' && data) {
      htmlBodies.push(decodeBufferWithCharset(data, contentTypeHeader));
    }

    if (part.filename || part.body?.attachmentId) {
      attachments.push({
        filename: part.filename || 'attachment',
        contentType: part.mimeType || 'application/octet-stream',
        size: part.body?.size || 0,
        attachmentId: part.body?.attachmentId,
        inline: Boolean(part.filename && /inline/i.test(contentTypeHeader)),
      });
    }
  }

  const textBody = textBodies.join('\n\n').trim();
  const htmlBody = htmlBodies.join('\n').trim() || undefined;
  const safeHtml = sanitizeEmailHtml(htmlBody || plainTextToHtml(textBody));
  const normalized = normalizeEmailText({ textBody, htmlBody: safeHtml || htmlBody });

  return {
    messageId: getHeaderValue(headers, 'message-id'),
    subject: getHeaderValue(headers, 'subject') || '',
    from: parseAddressHeader(getHeaderValue(headers, 'from')),
    to: parseAddressHeader(getHeaderValue(headers, 'to')),
    cc: parseAddressHeader(getHeaderValue(headers, 'cc')),
    date: getHeaderValue(headers, 'date')
      ? new Date(getHeaderValue(headers, 'date') as string).toISOString()
      : undefined,
    inReplyTo: getHeaderValue(headers, 'in-reply-to'),
    references: extractReferences(getHeaderValue(headers, 'references')),
    headers: normalizeHeadersFromGmail(headers),
    textBody,
    htmlBody,
    rawHtml: htmlBody,
    safeHtml,
    plainText: normalized.plainText,
    links: normalized.links,
    attachments,
  };
}

/**
 * Parse raw RFC 5322 / MIME content, an existing mailparser result, or a Gmail payload
 * into a single normalized message shape for AI features.
 *
 * Example:
 * await parseEmailMessage({ kind: 'raw', source: 'Subject: Hi\\r\\n\\r\\nHello' })
 * -> { subject: 'Hi', plainText: 'Hello', ... }
 */
export async function parseEmailMessage(input: EmailMessageInput): Promise<ParsedEmailMessage> {
  if (input.kind === 'parsed') {
    return normalizeParsedMail(input.parsed);
  }

  if (input.kind === 'gmail') {
    return normalizeGmailPayload(input.payload);
  }

  const parsed = await simpleParser(input.source);
  return normalizeParsedMail(parsed);
}
