import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import log from 'electron-log';
import { getAccountById, getAccountCredentials } from '../database';
import type { Readable } from 'node:stream';
import type { MailDeliveryState } from '../../shared/mailDeliveryState';

const OAUTH_FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
const oauthFailureCooldownUntil = new Map<number, number>();

export interface MailSummary {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  flags: string[];
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  bodyText?: string;
  draftPayload?: string;
  localDraftKey?: string;
  localSendId?: string;
  deliveryState?: MailDeliveryState;
  deliveryError?: string;
  category?: string;
  isScanned?: boolean;
  scanResult?: string;
}

export interface MailAttachmentMetadata {
  cacheId?: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  disposition?: string;
  inline?: boolean;
  cid?: string;
  partId?: string;
  attachmentId?: string;
  /** Main-process only: durable local source for optimistic Sent attachments. */
  localCachePath?: string;
}

export interface MailAttachmentContent {
  filename: string;
  contentType: string;
  content: Buffer;
  diagnostics?: {
    method: 'partId' | 'fallbackSource' | 'localCache';
    fallbackReason?: 'missing_part_id' | 'part_fetch_failed';
    fetchMs: number;
    parseMs: number;
  };
}

export interface MailDetail {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  cc?: string;
  subject: string;
  date: Date;
  flags: string[];
  bodyHtml?: string;
  bodyText?: string;
  attachments: MailAttachmentMetadata[];
  headers: Record<string, string>;
}

export interface FolderInfo {
  name: string;
  path: string;
  delimiter: string;
  flags: string[];
}

function parseAddress(addr: { name?: string; address?: string } | null): { name: string; address: string } {
  if (!addr) return { name: '', address: '' };
  return {
    name: addr.name || '',
    address: addr.address || '',
  };
}

function normalizeContentId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/^<|>$/g, '');
  return trimmed || undefined;
}

export function sanitizeAttachmentFilename(filename?: string): string {
  const fallback = 'attachment';
  const withoutPaths = String(filename || fallback)
    .replace(/\.\.[/\\]/g, '')
    .replace(/[/\\]/g, ' ')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  const sanitized = withoutPaths || fallback;
  const maxLength = 180;
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength).trim() || fallback : sanitized;
}

function getCacheIndex(cacheId?: string): number | null {
  if (!cacheId) return null;
  const separatorIndex = cacheId.lastIndexOf(':');
  if (separatorIndex < 0) return null;
  const index = Number(cacheId.slice(separatorIndex + 1));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function normalizeAttachmentDisposition(value: unknown): string | undefined {
  return typeof value === 'string' ? value.toLowerCase() : undefined;
}

function attachmentLooksSame(parsedAttachment: {
  filename?: string;
  contentType?: string;
  size?: number;
  contentId?: string;
  contentDisposition?: string;
  cid?: string;
  related?: boolean;
}, target: MailAttachmentMetadata): boolean {
  const parsedContentId = normalizeContentId(parsedAttachment.contentId ?? parsedAttachment.cid);
  const targetContentId = normalizeContentId(target.contentId ?? target.cid);
  if (targetContentId && parsedContentId === targetContentId) return true;

  const parsedFilename = sanitizeAttachmentFilename(parsedAttachment.filename || 'attachment');
  const targetFilename = sanitizeAttachmentFilename(target.filename || 'attachment');
  const filenameMatches = parsedFilename === targetFilename;
  const contentTypeMatches = !target.contentType || parsedAttachment.contentType === target.contentType;
  const sizeMatches = !target.size || !parsedAttachment.size || Number(parsedAttachment.size) === Number(target.size);
  const disposition = normalizeAttachmentDisposition(parsedAttachment.contentDisposition);
  const dispositionMatches = !target.disposition || disposition === target.disposition.toLowerCase();
  return filenameMatches && contentTypeMatches && sizeMatches && dispositionMatches;
}

function findMatchingParsedAttachment(
  parsedAttachments: Array<{
    filename?: string;
    contentType?: string;
    size?: number;
    content?: Buffer;
    contentId?: string;
    contentDisposition?: string;
    cid?: string;
    related?: boolean;
  }>,
  target: MailAttachmentMetadata,
): typeof parsedAttachments[number] | null {
  const index = getCacheIndex(target.cacheId);
  if (index != null && parsedAttachments[index] && attachmentLooksSame(parsedAttachments[index], target)) {
    return parsedAttachments[index];
  }

  if (target.contentId || target.cid) {
    const targetContentId = normalizeContentId(target.contentId ?? target.cid);
    const byContentId = parsedAttachments.find((attachment) =>
      normalizeContentId(attachment.contentId ?? attachment.cid) === targetContentId
    );
    if (byContentId) return byContentId;
  }

  return parsedAttachments.find((attachment) => attachmentLooksSame(attachment, target)) ?? null;
}

function getBodyStructureDisposition(part: unknown): string | undefined {
  const record = part as Record<string, unknown>;
  const disposition = record.disposition ?? record.contentDisposition;
  if (typeof disposition === 'string') return disposition.toLowerCase();
  if (disposition && typeof disposition === 'object') {
    const type = (disposition as Record<string, unknown>).type;
    if (typeof type === 'string') return type.toLowerCase();
  }
  return undefined;
}

function getBodyStructureParam(part: unknown, key: string): string | undefined {
  const record = part as Record<string, unknown>;
  const candidates = [
    record.parameters,
    record.params,
    record.dispositionParameters,
    (record.disposition && typeof record.disposition === 'object')
      ? (record.disposition as Record<string, unknown>).params
      : undefined,
    (record.contentDisposition && typeof record.contentDisposition === 'object')
      ? (record.contentDisposition as Record<string, unknown>).params
      : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const value = (candidate as Record<string, unknown>)[key] ?? (candidate as Record<string, unknown>)[key.toLowerCase()];
    if (typeof value === 'string' && value.trim()) return value;
  }

  return undefined;
}

function getBodyStructureChildren(part: unknown): unknown[] {
  if (!part || typeof part !== 'object') return [];
  const record = part as Record<string, unknown>;
  const children = record.childNodes ?? record.children ?? record.parts;
  return Array.isArray(children) ? children : [];
}

function getBodyStructurePartId(part: unknown): string | undefined {
  if (!part || typeof part !== 'object') return undefined;
  const value = (part as Record<string, unknown>).part;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getBodyStructureContentType(part: unknown): string {
  if (!part || typeof part !== 'object') return '';
  const record = part as Record<string, unknown>;
  const type = record.type ?? record.contentType;
  return typeof type === 'string' ? type.toLowerCase() : '';
}

export function collectBodyStructureAttachmentMetadata(bodyStructure: unknown): MailAttachmentMetadata[] {
  const attachments: MailAttachmentMetadata[] = [];

  const visit = (part: unknown, fallbackPath: string): void => {
    if (!part || typeof part !== 'object') return;
    const record = part as Record<string, unknown>;
    const children = getBodyStructureChildren(part);
    const partPath = getBodyStructurePartId(part) ?? fallbackPath;
    const disposition = getBodyStructureDisposition(part);
    const filename = getBodyStructureParam(part, 'filename')
      ?? getBodyStructureParam(part, 'name')
      ?? (typeof record.filename === 'string' ? record.filename : undefined);
    const contentId = normalizeContentId(record.id ?? record.contentId ?? record.cid);
    const contentType = getBodyStructureContentType(part) || 'application/octet-stream';
    const isImage = contentType.startsWith('image/');
    const isInlineCidImage = Boolean(contentId) && (disposition === 'inline' || isImage);

    if ((disposition === 'attachment' || Boolean(filename)) && partPath) {
      attachments.push({
        filename: filename || 'attachment',
        contentType,
        size: typeof record.size === 'number' ? record.size : Number(record.size || 0),
        contentId,
        disposition,
        inline: isInlineCidImage || disposition === 'inline',
        cid: contentId,
        partId: partPath,
      });
    }

    children.forEach((child, index) => {
      const childFallbackPath = partPath ? `${partPath}.${index + 1}` : `${index + 1}`;
      visit(child, childFallbackPath);
    });
  };

  const rootChildren = getBodyStructureChildren(bodyStructure);
  if (rootChildren.length === 0) {
    visit(bodyStructure, getBodyStructurePartId(bodyStructure) ?? '1');
  } else {
    rootChildren.forEach((child, index) => visit(child, getBodyStructurePartId(child) ?? `${index + 1}`));
  }

  return attachments;
}

function findMatchingBodyStructureAttachment(
  bodyStructureAttachments: MailAttachmentMetadata[],
  parsedAttachment: {
    filename?: string;
    contentType?: string;
    size?: number;
    contentId?: string;
    contentDisposition?: string;
    cid?: string;
    related?: boolean;
  },
  index: number,
): MailAttachmentMetadata | undefined {
  const parsedContentId = normalizeContentId(parsedAttachment.contentId ?? parsedAttachment.cid);
  if (parsedContentId) {
    const byContentId = bodyStructureAttachments.find((attachment) =>
      normalizeContentId(attachment.contentId ?? attachment.cid) === parsedContentId
    );
    if (byContentId) return byContentId;
  }

  const byMetadata = bodyStructureAttachments.find((attachment) => attachmentLooksSame(parsedAttachment, attachment));
  if (byMetadata) return byMetadata;

  return bodyStructureAttachments[index];
}

export function bodyStructureHasDownloadableAttachment(bodyStructure: unknown): boolean {
  const visit = (part: unknown): boolean => {
    if (!part || typeof part !== 'object') return false;
    const record = part as Record<string, unknown>;
    const disposition = getBodyStructureDisposition(part);
    const filename = getBodyStructureParam(part, 'filename')
      ?? getBodyStructureParam(part, 'name')
      ?? (typeof record.filename === 'string' ? record.filename : undefined);
    const contentId = normalizeContentId(record.id ?? record.contentId ?? record.cid);
    const mediaType = String(record.type ?? record.contentType ?? '').toLowerCase();
    const isImage = mediaType.startsWith('image/');
    const isInlineCidImage = Boolean(contentId) && (disposition === 'inline' || isImage);

    if ((disposition === 'attachment' || Boolean(filename)) && !isInlineCidImage) {
      return true;
    }

    return getBodyStructureChildren(part).some(visit);
  };

  return visit(bodyStructure);
}

async function streamToBuffer(stream: Readable, maxBytes?: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (maxBytes != null && total > maxBytes) {
      throw new Error(`Attachment exceeds maximum allowed size of ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function createClient(accountId: number, options: { bypassOAuthCooldown?: boolean } = {}): Promise<ImapFlow> {
  const account = getAccountById(accountId);
  if (!account) throw new Error('Account not found');

  let credentials = getAccountCredentials(accountId);
  if (!credentials) throw new Error('No credentials found');

  if (account.auth_type === 'oauth') {
    const cooldownUntil = oauthFailureCooldownUntil.get(accountId) ?? 0;
    if (cooldownUntil > Date.now() && !options.bypassOAuthCooldown) {
      throw new Error('OAuth account temporarily unavailable. Please reconnect this account or wait a moment before retrying.');
    }
    if (cooldownUntil > Date.now() && options.bypassOAuthCooldown) {
      log.info(`[mail] Bypassing OAuth cooldown for user-triggered attachment fetch on account ${accountId}`);
    }
  }

  if (account.auth_type === 'oauth' && credentials.oauth_expiry) {
    const fiveMinMs = 5 * 60 * 1000;
    if (Date.now() > credentials.oauth_expiry - fiveMinMs) {
      log.info(`[mail] Token expiring soon for account ${accountId}, refreshing...`);
      const { refreshTokenForAccount } = await import('./oauth');
      const refreshed = await refreshTokenForAccount(accountId);
      if (refreshed) {
        credentials = getAccountCredentials(accountId) ?? credentials;
        oauthFailureCooldownUntil.delete(accountId);
      } else {
        oauthFailureCooldownUntil.set(accountId, Date.now() + OAUTH_FAILURE_COOLDOWN_MS);
        throw new Error('OAuth token refresh failed. Please reconnect this account.');
      }
    }
  }

  const auth = account.auth_type === 'oauth' && credentials.oauth_token
    ? { user: account.username, accessToken: credentials.oauth_token }
    : { user: account.username, pass: credentials.password };

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.use_tls === 1,
    auth,
    logger: false,
    connectionTimeout: 15000,
  });

  log.info(`[mail] creating IMAP client for account ${accountId} (${account.auth_type})`);
  try {
    await client.connect();
    if (account.auth_type === 'oauth') {
      oauthFailureCooldownUntil.delete(accountId);
    }
  } catch (error) {
    if (account.auth_type === 'oauth') {
      oauthFailureCooldownUntil.set(accountId, Date.now() + OAUTH_FAILURE_COOLDOWN_MS);
    }
    throw error;
  }
  return client;
}

export async function getMailFolders(accountId: number): Promise<FolderInfo[]> {
  log.info(`[mail] Getting folders for account ${accountId}`);

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId);
    const list = await client.list();

    const folders: FolderInfo[] = list.map((mb) => ({
      name: mb.name || mb.path,
      path: mb.path,
      delimiter: mb.delimiter || '.',
      flags: Array.from(mb.flags || []),
    }));

    log.info(`[mail] Found ${folders.length} folders`);
    return folders;
  } catch (err) {
    log.error('[mail] getMailFolders failed:', err);
    throw err;
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}

export async function fetchMailList(
  accountId: number,
  folder: string = 'INBOX',
  options: { limit?: number; offset?: number; historySince?: Date | null } = {},
): Promise<MailSummary[]> {
  const { limit = 50, offset = 0, historySince = null } = options;

  log.info(`[mail] Fetching mail list for account ${accountId} from ${folder}`);

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId);
    const lock = await client.getMailboxLock(folder);
    try {
      let fetchQuery: string | number[];
      if (historySince) {
        const uids = await client.search({ since: historySince }, { uid: true });
        if (!Array.isArray(uids) || uids.length === 0) return [];
        fetchQuery = [...uids].sort((a, b) => b - a).slice(offset, offset + limit);
        if (fetchQuery.length === 0) return [];
      } else {
        const status = await client.status(folder, { messages: true });
        const total = status.messages || 0;
        if (total === 0) return [];

        const end = total - offset;
        const start = Math.max(1, end - limit + 1);
        if (start > end) return [];
        fetchQuery = `${start}:${end}`;
      }

      const summaries: MailSummary[] = [];
      const fetchOptions = historySince ? { uid: true } : undefined;
      for await (const msg of client.fetch(fetchQuery, {
        envelope: true,
        uid: true,
        flags: true,
        size: false,
        bodyStructure: true,
      }, fetchOptions)) {
        const fromParsed = parseAddress(msg.envelope?.from?.[0] || null);
        const toParsed = (msg.envelope?.to || [])
          .map((a: { name?: string; address?: string }) => a.address || '')
          .filter(Boolean)
          .join(', ');

        const flags = msg.flags ? Array.from(msg.flags) : [];
        const subject = msg.envelope?.subject || '(No Subject)';

        summaries.push({
          id: String(msg.uid),
          uid: Number(msg.uid),
          from: fromParsed.address,
          fromName: fromParsed.name,
          to: toParsed,
          subject: typeof subject === 'string' ? subject : '(No Subject)',
          date: msg.envelope?.date ? new Date(msg.envelope.date) : new Date(),
          flags,
          snippet: '',
          hasAttachments: bodyStructureHasDownloadableAttachment((msg as typeof msg & { bodyStructure?: unknown }).bodyStructure),
          isRead: flags.includes('\\Seen'),
          isStarred: flags.includes('\\Flagged'),
          messageId: msg.envelope?.messageId,
          inReplyTo: msg.envelope?.inReplyTo,
        });
      }

      summaries.sort((a, b) => b.uid - a.uid);
      return summaries;
    } finally {
      try { lock.release(); } catch { /* ignore */ }
    }
  } catch (err) {
    log.error('[mail] fetchMailList failed:', err);
    throw err;
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}

export async function fetchMailDetail(
  accountId: number,
  messageUid: number,
  folder: string = 'INBOX',
): Promise<MailDetail | null> {
  log.info(`[mail] Fetching full message UID=${messageUid} for account ${accountId}`);

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId);
    const imapFolder = folder.toLowerCase() === 'inbox' ? 'INBOX' : folder;
    const lock = await client.getMailboxLock(imapFolder);
    try {
      const msg = await client.fetchOne(String(messageUid), {
        envelope: true,
        flags: true,
        bodyStructure: true,
        source: true,
      }, { uid: true });

      if (!msg) return null;

      const fromParsed = parseAddress(msg.envelope?.from?.[0] || null);
      const toParsed = (msg.envelope?.to || [])
        .map((a: { name?: string; address?: string }) => a.address || '')
        .filter(Boolean)
        .join(', ');
      const ccParsed = (msg.envelope?.cc || [])
        .map((a: { name?: string; address?: string }) => a.address || '')
        .filter(Boolean)
        .join(', ');

      let bodyHtml: string | undefined;
      let bodyText: string | undefined;
      let parsedAttachments: MailDetail['attachments'] = [];

      if (msg.source) {
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          bodyHtml = typeof parsed.html === 'string' ? parsed.html : undefined;
          bodyText = parsed.text || undefined;
          const bodyStructureAttachments = collectBodyStructureAttachmentMetadata(
            (msg as typeof msg & { bodyStructure?: unknown }).bodyStructure,
          );
          parsedAttachments = parsed.attachments.map((att, index) => {
            const extra = att as typeof att & {
              contentDisposition?: string;
              related?: boolean;
              cid?: string;
              partId?: string;
              attachmentId?: string;
            };
            const contentId = normalizeContentId(att.contentId);
            const cid = normalizeContentId(extra.cid) ?? contentId;
            const disposition = typeof extra.contentDisposition === 'string'
              ? extra.contentDisposition.toLowerCase()
              : undefined;
            const bodyStructureAttachment = findMatchingBodyStructureAttachment(
              bodyStructureAttachments,
              {
                filename: att.filename,
                contentType: att.contentType,
                size: att.size,
                contentId: att.contentId,
                contentDisposition: disposition,
                cid,
                related: extra.related,
              },
              index,
            );
            return {
              filename: att.filename || 'attachment',
              contentType: att.contentType || 'application/octet-stream',
              size: att.size,
              contentId,
              disposition,
              inline: disposition === 'inline' || Boolean(extra.related),
              cid,
              partId: extra.partId ?? bodyStructureAttachment?.partId,
              attachmentId: extra.attachmentId,
            };
          });
        } catch (parseErr) {
          log.warn('[mail] Failed to parse message body:', parseErr);
        }
      }

      return {
        id: String(msg.uid),
        uid: Number(msg.uid),
        from: fromParsed.address,
        fromName: fromParsed.name,
        to: toParsed,
        cc: ccParsed || undefined,
        subject: String(msg.envelope?.subject || '(No Subject)'),
        date: msg.envelope?.date ? new Date(msg.envelope.date) : new Date(),
        flags: msg.flags ? Array.from(msg.flags) : [],
        bodyHtml,
        bodyText,
        attachments: parsedAttachments,
        headers: {
          from: fromParsed.address,
          to: toParsed,
          subject: String(msg.envelope?.subject || ''),
          date: msg.envelope?.date ? String(msg.envelope.date) : '',
        },
      };
    } finally {
      try { lock.release(); } catch { /* ignore */ }
    }
  } catch (err) {
    log.error('[mail] fetchMailDetail failed:', err);
    throw err;
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}

export async function fetchMailAttachmentContent(
  accountId: number,
  messageUid: number,
  folder: string,
  targetAttachment: MailAttachmentMetadata,
  options: { bypassOAuthCooldown?: boolean } = {},
): Promise<MailAttachmentContent> {
  log.info(`[mail] Fetching attachment UID=${messageUid} for account ${accountId}`);

  // Defence-in-depth: a malicious or buggy server could advertise a small
  // attachment and stream gigabytes. Cap the in-memory buffer size to
  // prevent OOM and match the SMTP send-side cap.
  const MAX_ATTACHMENT_DOWNLOAD_BYTES = 25 * 1024 * 1024;

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId, { bypassOAuthCooldown: options.bypassOAuthCooldown });
    const imapFolder = folder.toLowerCase() === 'inbox' ? 'INBOX' : folder;
    const lock = await client.getMailboxLock(imapFolder);
    try {
      if (targetAttachment.partId) {
        const fetchStartedAt = Date.now();
        try {
          const downloaded = await client.download(String(messageUid), targetAttachment.partId, { uid: true });
          if (!downloaded?.content) {
            throw new Error('Attachment part content not found');
          }
          const content = await streamToBuffer(downloaded.content, MAX_ATTACHMENT_DOWNLOAD_BYTES);
          return {
            filename: sanitizeAttachmentFilename(targetAttachment.filename || downloaded.meta?.filename),
            contentType: targetAttachment.contentType || downloaded.meta?.contentType || 'application/octet-stream',
            content,
            diagnostics: {
              method: 'partId',
              fetchMs: Date.now() - fetchStartedAt,
              parseMs: 0,
            },
          };
        } catch (partErr) {
          log.warn('[mail] attachment part fetch failed; falling back to full source', {
            uid: messageUid,
            folder: imapFolder,
            attachmentCacheId: targetAttachment.cacheId,
            partId: targetAttachment.partId,
            error: partErr instanceof Error ? partErr.message : String(partErr),
          });
          return await fetchAttachmentViaSourceFallback(
            client,
            messageUid,
            targetAttachment,
            'part_fetch_failed',
          );
        }
      }

      return await fetchAttachmentViaSourceFallback(
        client,
        messageUid,
        targetAttachment,
        'missing_part_id',
      );
    } finally {
      try { lock.release(); } catch { /* ignore */ }
    }
  } catch (err) {
    log.error('[mail] fetchMailAttachmentContent failed:', err);
    throw err;
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}

async function fetchAttachmentViaSourceFallback(
  client: ImapFlow,
  messageUid: number,
  targetAttachment: MailAttachmentMetadata,
  fallbackReason: 'missing_part_id' | 'part_fetch_failed',
): Promise<MailAttachmentContent> {
  const fetchStartedAt = Date.now();
  const msg = await client.fetchOne(String(messageUid), {
    source: true,
  }, { uid: true });
  const fetchMs = Date.now() - fetchStartedAt;

  if (!msg || !msg.source) throw new Error('Message source not found');

  const parseStartedAt = Date.now();
  const parsed = await simpleParser(msg.source as Buffer);
  const parseMs = Date.now() - parseStartedAt;
  const parsedAttachments = parsed.attachments.map((att) => {
    const extra = att as typeof att & {
      contentDisposition?: string;
      related?: boolean;
      cid?: string;
    };
    return {
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      content: att.content,
      contentId: att.contentId,
      contentDisposition: extra.contentDisposition,
      cid: extra.cid,
      related: extra.related,
    };
  });

  const matched = findMatchingParsedAttachment(parsedAttachments, targetAttachment);
  if (!matched?.content) throw new Error('Attachment content not found');

  return {
    filename: sanitizeAttachmentFilename(matched.filename || targetAttachment.filename),
    contentType: matched.contentType || targetAttachment.contentType || 'application/octet-stream',
    content: matched.content,
    diagnostics: {
      method: 'fallbackSource',
      fallbackReason,
      fetchMs,
      parseMs,
    },
  };
}

export async function setMessageFlags(
  accountId: number,
  messageUid: number,
  flags: string[],
  folder: string = 'INBOX',
): Promise<void> {
  log.info(`[mail] Setting flags for account ${accountId}, UID ${messageUid}, folder=${folder}`);

  let client: ImapFlow | null = null;
  let lock: Awaited<ReturnType<ImapFlow['getMailboxLock']>> | null = null;
  try {
    client = await createClient(accountId);
    const imapFolder = folder.toLowerCase() === 'inbox' ? 'INBOX' : folder;
    lock = await client.getMailboxLock(imapFolder);
    await client.messageFlagsSet(messageUid, flags, { uid: true });
  } catch (err) {
    log.error('[mail] setFlags failed:', err);
    throw err;
  } finally {
    if (lock) { try { lock.release(); } catch { /* ignore */ } }
    if (client) { try { await client.logout(); } catch { /* ignore */ } }
  }
}

export async function setMessageStarred(
  accountId: number,
  messageUid: number,
  starred: boolean,
  folder: string = 'INBOX',
): Promise<void> {
  log.info(`[mail] Setting starred=${starred} for account ${accountId}, UID ${messageUid}, folder=${folder}`);

  let client: ImapFlow | null = null;
  let lock: Awaited<ReturnType<ImapFlow['getMailboxLock']>> | null = null;
  try {
    client = await createClient(accountId);
    const imapFolder = folder.toLowerCase() === 'inbox' ? 'INBOX' : folder;
    lock = await client.getMailboxLock(imapFolder);
    if (starred) {
      await client.messageFlagsAdd(messageUid, ['\\Flagged'], { uid: true });
    } else {
      await client.messageFlagsRemove(messageUid, ['\\Flagged'], { uid: true });
    }
  } catch (err) {
    log.error('[mail] setMessageStarred failed:', err);
    throw err;
  } finally {
    if (lock) { try { lock.release(); } catch { /* ignore */ } }
    if (client) { try { await client.logout(); } catch { /* ignore */ } }
  }
}

export async function setMessageRead(
  accountId: number,
  messageUid: number,
  read: boolean,
  folder: string = 'INBOX',
): Promise<void> {
  log.info(`[mail] Setting read=${read} for account ${accountId}, UID ${messageUid}, folder=${folder}`);

  let client: ImapFlow | null = null;
  let lock: Awaited<ReturnType<ImapFlow['getMailboxLock']>> | null = null;
  try {
    client = await createClient(accountId);
    const imapFolder = folder.toLowerCase() === 'inbox' ? 'INBOX' : folder;
    lock = await client.getMailboxLock(imapFolder);
    if (read) {
      await client.messageFlagsAdd(messageUid, ['\\Seen'], { uid: true });
    } else {
      await client.messageFlagsRemove(messageUid, ['\\Seen'], { uid: true });
    }
  } catch (err) {
    log.error('[mail] setMessageRead failed:', err);
    throw err;
  } finally {
    if (lock) { try { lock.release(); } catch { /* ignore */ } }
    if (client) { try { await client.logout(); } catch { /* ignore */ } }
  }
}

export async function deleteMessage(
  accountId: number,
  messageUid: number,
  folder: string = 'INBOX',
): Promise<void> {
  log.info(`[mail] Deleting message UID=${messageUid} for account ${accountId}, folder=${folder}`);

  let client: ImapFlow | null = null;
  let lock: Awaited<ReturnType<ImapFlow['getMailboxLock']>> | null = null;
  try {
    client = await createClient(accountId);
    const imapFolder = folder.toLowerCase() === 'inbox' ? 'INBOX' : folder;
    lock = await client.getMailboxLock(imapFolder);
    await client.messageDelete(messageUid, { uid: true });
  } catch (err) {
    log.error('[mail] deleteMessage failed:', err);
    throw err;
  } finally {
    if (lock) { try { lock.release(); } catch { /* ignore */ } }
    if (client) { try { await client.logout(); } catch { /* ignore */ } }
  }
}

export async function moveMessage(
  accountId: number,
  messageUid: number,
  fromFolder: string,
  toFolder: string,
): Promise<void> {
  log.info(`[mail] Moving message ${messageUid} from ${fromFolder} to ${toFolder}`);

  let client: ImapFlow | null = null;
  let lock: Awaited<ReturnType<ImapFlow['getMailboxLock']>> | null = null;
  try {
    client = await createClient(accountId);
    const imapFolder = fromFolder.toLowerCase() === 'inbox' ? 'INBOX' : fromFolder;
    lock = await client.getMailboxLock(imapFolder);
    await client.messageMove(messageUid, toFolder, { uid: true });
  } catch (err) {
    log.error('[mail] moveMessage failed:', err);
    throw err;
  } finally {
    if (lock) { try { lock.release(); } catch { /* ignore */ } }
    if (client) { try { await client.logout(); } catch { /* ignore */ } }
  }
}

export async function appendMessage(
  accountId: number,
  folder: string,
  content: string | Buffer,
  flags: string[] = [],
  internalDate?: Date,
): Promise<{ uid?: number; destination: string }> {
  log.info(`[mail] Appending message for account ${accountId} into ${folder}`);

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId);
    const destinationFolder = folder.toLowerCase() === 'inbox' ? 'INBOX' : folder;
    const result = await client.append(destinationFolder, content, flags, internalDate);
    if (!result) {
      return { destination: destinationFolder };
    }

    return {
      uid: result.uid,
      destination: result.destination,
    };
  } catch (err) {
    log.error('[mail] appendMessage failed:', err);
    throw err;
  } finally {
    if (client) { try { await client.logout(); } catch { /* ignore */ } }
  }
}
