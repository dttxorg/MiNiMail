import type { EmailAddress, EmailBodyBlocks, ParsedEmailMessage, SummaryView, ActionView, ReplyView, ProfileView } from './types';
import { buildActionView, buildProfileView, buildReplyView, buildSummaryView } from './views';
import { normalizeEmailText } from './normalizeEmailText';
import { sanitizeEmailHtml } from './sanitizeEmailHtml';
import { splitEmailBlocks } from './splitEmailBlocks';
import { plainTextToHtml } from './utils';

export interface MailLikeForAi {
  subject: string;
  from: string;
  fromName?: string;
  to?: string;
  cc?: string;
  date?: Date | string;
  snippet?: string;
  bodyHtml?: string;
  bodyText?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string | string[] | undefined>;
  category?: string;
  scanResult?: string;
  senderType?: string;
  replyNeeded?: boolean | null;
}

export interface EmailAiSnapshot {
  parsed: ParsedEmailMessage;
  blocks: EmailBodyBlocks;
  summaryView: SummaryView;
  actionView: ActionView;
  replyView: ReplyView;
  profileView: ProfileView;
}

function parseAddresses(value?: string): EmailAddress[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*?)(?:<([^>]+)>)?$/);
      const name = match?.[1]?.replace(/^"|"$/g, '').trim() || '';
      const address = (match?.[2] || part).replace(/^<|>$/g, '').trim();
      return { name, address };
    })
    .filter((entry) => Boolean(entry.address));
}

function parseReferences(value?: string): string[] {
  if (!value) return [];
  const matches = value.match(/<[^>]+>/g);
  if (matches) return matches;
  return value.split(/\s+/).map((part) => part.trim()).filter(Boolean);
}

export function buildEmailAiSnapshot(mail: MailLikeForAi): EmailAiSnapshot {
  const htmlBody = mail.bodyHtml || undefined;
  const textBody = mail.bodyText || mail.snippet || '';
  const safeHtml = sanitizeEmailHtml(htmlBody || plainTextToHtml(textBody));
  const normalized = normalizeEmailText({
    textBody,
    htmlBody: safeHtml || htmlBody,
  });

  const parsed: ParsedEmailMessage = {
    messageId: mail.messageId,
    subject: mail.subject || '',
    from: parseAddresses(mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from),
    to: parseAddresses(mail.to),
    cc: parseAddresses(mail.cc),
    date: mail.date ? new Date(mail.date).toISOString() : undefined,
    inReplyTo: mail.inReplyTo,
    references: parseReferences(mail.references),
    headers: Object.fromEntries(
      Object.entries(mail.headers || {}).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [],
      ])
    ),
    textBody,
    htmlBody,
    rawHtml: htmlBody,
    safeHtml,
    plainText: normalized.plainText,
    links: normalized.links,
    attachments: [],
  };

  const blocks = splitEmailBlocks(parsed.plainText);
  return {
    parsed,
    blocks,
    summaryView: buildSummaryView(parsed, blocks),
    actionView: buildActionView(parsed, blocks),
    replyView: buildReplyView(parsed, blocks),
    profileView: buildProfileView(parsed, blocks),
  };
}
