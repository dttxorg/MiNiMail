import { extractReadableEmailText } from './emailContent';
import type { OutgoingAttachmentReference } from '../../shared/outgoingAttachments';

type ComposeMailLike = {
  accountId?: number;
  uid?: number;
  folder?: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  bodyText?: string;
  bodyHtml?: string;
  snippet: string;
  attachments?: ComposeAttachmentReference[];
};

export interface ComposeAttachmentReference {
  cacheId?: string;
  accountId?: number;
  uid?: number;
  folder?: string;
  filename: string;
  contentType?: string;
  size?: number;
  contentId?: string;
  disposition?: string;
  inline?: boolean;
  cid?: string;
  partId?: string;
  attachmentId?: string;
}

export interface ComposeRecipientOption {
  email: string;
  label: string;
}

export interface ComposeDraftOption {
  id: string;
  accountId: number;
  uid?: number;
  folder?: string;
  messageId?: string;
  localOnly?: boolean;
  draftKey: string;
  recipients: ComposeRecipientOption[];
  subject: string;
  body: string;
  bodyHtml?: string;
  quotedOriginal?: ComposeQuotedOriginal | null;
  outgoingAttachments?: OutgoingAttachmentReference[];
  date: Date;
}

export interface ComposeQuotedOriginal {
  mode: 'reply' | 'forward';
  title: string;
  meta: string;
  html: string;
  text: string;
  previewText: string;
  attachments?: ComposeAttachmentReference[];
}

function stripAddress(value?: string | null): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] || raw).trim().toLowerCase();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatComposeDate(value: Date): string {
  return value.toLocaleString();
}

function toParagraphHtml(value: string): string {
  const safe = escapeHtml(value).replace(/\r\n/g, '\n');
  const sections = safe
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!sections.length) {
    return '';
  }

  return sections
    .map((part) => `<p style="margin:0 0 14px; line-height:1.7;">${part.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export function normalizeComposeEditorText(value: string): string {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
}

export function convertComposePlainTextToHtml(value: string): string {
  const normalized = String(value || '').replace(/\r\n/g, '\n');
  if (!normalized) return '';

  return normalized
    .split('\n')
    .map((line) => `<p>${line ? escapeHtml(line) : '<br/>'}</p>`)
    .join('');
}

// Strip the in-editor signature markers so they don't leak to the rendered
// body. The DOMPurify-based callers also run sanitizeComposeEditableHtml,
// but this helper is used independently by `sanitizeComposeEditableHtml`
// and the legacy `stripUnsafeHtml` for tests/older callers, so it must
// remain a pure string utility.
export function stripComposeSignatureMarkers(value: string): string {
  return String(value || '')
    .replace(/\[\[MINIMAIL_SIGNATURE_START\]\][\s\S]*?\[\[MINIMAIL_SIGNATURE_END\]\]/g, '')
    .trim();
}

// Defense-in-depth sanitization for the editable compose HTML. DOMPurify is
// the authoritative sanitizer at the render site, but this regex pass keeps
// `sanitizeComposeEditableHtml` self-contained for callers that don't pipe
// through DOMPurify (tests, programmatic API) and strips signature markers
// in the same pass. Regex sanitization alone is unsafe; DOMPurify is still
// required downstream.
function stripUnsafeHtml(value: string): string {
  const strippedSignature = stripComposeSignatureMarkers(value);
  return strippedSignature
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href|formaction|action)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src|xlink:href|formaction|action)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'")
    .replace(/(href|src|xlink:href|formaction|action)\s*=\s*javascript:[^\s>]*/gi, '$1="#"')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, 'data:text/plain');
}

export function sanitizeComposeEditableHtml(value: string): string {
  const sanitized = stripUnsafeHtml(value)
    .replace(/contenteditable\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();
  return sanitized === '<p><br></p>' || sanitized === '<p><br/></p>' ? '' : sanitized;
}

export function convertComposeHtmlToPlainText(value: string): string {
  const html = sanitizeComposeEditableHtml(value)
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return html.replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function buildComposeHtmlBodyFromEditableHtml(
  editableBodyHtml: string,
  quotedOriginal?: ComposeQuotedOriginal | null,
): string {
  const editableHtml = sanitizeComposeEditableHtml(editableBodyHtml);
  if (!quotedOriginal) {
    return editableHtml;
  }

  const quoteBlock = `
    <div style="margin-top:20px;border-top:1px solid #d1d5db;padding-top:16px;">
      ${quotedOriginal.html}
    </div>
  `.trim();

  if (!editableHtml) {
    return quoteBlock;
  }

  return `${editableHtml}${quoteBlock}`;
}

export function extractQuotedOriginalHtmlFragment(value: string): string {
  const raw = value.trim();
  if (!raw) return '';

  const bodyMatch = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  let fragment = bodyMatch?.[1] ?? raw;

  fragment = fragment
    .replace(/<!doctype[\s\S]*?>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '')
    .trim();

  return fragment;
}

function quoteLines(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export function formatQuotedOriginalBody({
  mode,
  email,
}: {
  mode: 'reply' | 'forward';
  email: ComposeMailLike;
}): string {
  const readable = extractReadableEmailText(email, { stripUrls: false }).trim();
  const fromLine = `${email.fromName || email.from} <${email.from}>`;
  const toLine = email.to ? `To: ${email.to}\n` : '';
  const dateLine = formatComposeDate(email.date);
  const subjectLine = email.subject;

  if (mode === 'reply') {
    return `\n\nOn ${dateLine}, ${fromLine} wrote:\n${quoteLines(readable || email.subject)}`;
  }

  return `\n\n---------- Forwarded message ----------\nFrom: ${fromLine}\n${toLine}Date: ${dateLine}\nSubject: ${subjectLine}\n\n${readable || email.subject}`;
}

export function buildComposeQuotedOriginal({
  mode,
  email,
}: {
  mode: 'reply' | 'forward';
  email: ComposeMailLike;
}): ComposeQuotedOriginal {
  const senderLabel = email.fromName?.trim() || stripAddress(email.from).split('@')[0] || email.from;
  const meta = `${senderLabel} · ${formatComposeDate(email.date)}`;
  const previewText = (email.snippet || extractReadableEmailText(email, { stripUrls: false })).trim().slice(0, 140);
  const text = formatQuotedOriginalBody({ mode, email });
  const htmlBody = email.bodyHtml ? extractQuotedOriginalHtmlFragment(email.bodyHtml) : '';
  const fallbackBody = toParagraphHtml(extractReadableEmailText(email, { stripUrls: false }) || email.subject);
  const attachments = mode === 'forward'
    ? (email.attachments || [])
        .filter((attachment) =>
          !attachment.inline &&
          attachment.disposition !== 'inline' &&
          !attachment.cid &&
          !attachment.contentId
        )
        .map((attachment) => ({
          ...attachment,
          accountId: email.accountId,
          uid: email.uid,
          folder: email.folder,
        }))
    : [];
  const introLines = [
    `<div style="font-size:12px;color:#6b7280;margin-bottom:10px;">${escapeHtml(meta)}</div>`,
    `<div style="font-size:12px;color:#6b7280;margin-bottom:14px;">From: ${escapeHtml(email.fromName || email.from)} &lt;${escapeHtml(email.from)}&gt;<br/>${email.to ? `To: ${escapeHtml(email.to)}<br/>` : ''}Subject: ${escapeHtml(email.subject)}</div>`,
  ].join('');

  return {
    mode,
    title: email.subject,
    meta,
    html: `${introLines}<div class="minimail-quoted-original">${htmlBody || fallbackBody}</div>`,
    text,
    previewText,
    attachments,
  };
}

export function buildComposeTextBody(editableBody: string, quotedOriginal?: ComposeQuotedOriginal | null): string {
  const trimmedBody = editableBody.trim();
  if (!quotedOriginal) {
    return trimmedBody;
  }

  if (!trimmedBody) {
    return quotedOriginal.text.trim();
  }

  return `${trimmedBody}\n${quotedOriginal.text}`.trim();
}

export function buildComposeHtmlBody(editableBody: string, quotedOriginal?: ComposeQuotedOriginal | null): string {
  const editableHtml = toParagraphHtml(editableBody.trim());
  if (!quotedOriginal) {
    return editableHtml;
  }

  const quoteBlock = `
    <div style="margin-top:20px;border-top:1px solid #d1d5db;padding-top:16px;">
      ${quotedOriginal.html}
    </div>
  `.trim();

  if (!editableHtml) {
    return quoteBlock;
  }

  return `${editableHtml}${quoteBlock}`;
}

export function normalizeComposeRecipientInput(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildComposeRecipientOption(
  email: string,
  name?: string | null,
): ComposeRecipientOption | null {
  const normalizedEmail = stripAddress(email);
  if (!normalizedEmail) return null;

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const label = trimmedName || normalizedEmail.split('@')[0];
  return {
    email: normalizedEmail,
    label,
  };
}

export function buildRecipientSuggestionsFromMails(
  mails: Array<Pick<ComposeMailLike, 'from' | 'fromName' | 'date'>>,
  accountEmails: string[] = [],
): ComposeRecipientOption[] {
  const ownAddresses = new Set(accountEmails.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const latestByEmail = new Map<string, { option: ComposeRecipientOption; timestamp: number }>();

  for (const mail of mails) {
    const option = buildComposeRecipientOption(mail.from, mail.fromName);
    if (!option) continue;
    if (ownAddresses.has(option.email)) continue;

    const previous = latestByEmail.get(option.email);
    const timestamp = mail.date.getTime();
    if (!previous || timestamp > previous.timestamp) {
      latestByEmail.set(option.email, { option, timestamp });
    }
  }

  return Array.from(latestByEmail.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((entry) => entry.option);
}

export function filterRecipientSuggestions(
  options: ComposeRecipientOption[],
  query: string,
  selectedEmails: string[],
): ComposeRecipientOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  const selected = new Set(selectedEmails.map((value) => value.trim().toLowerCase()));

  return options
    .filter((option) => !selected.has(option.email))
    .filter((option) => {
      if (!normalizedQuery) return true;
      return option.label.toLowerCase().includes(normalizedQuery) || option.email.toLowerCase().includes(normalizedQuery);
    })
    .slice(0, 8);
}
