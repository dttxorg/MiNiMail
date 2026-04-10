import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import log from 'electron-log';
import { getAccountById, getAccountCredentials } from '../database';

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
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    contentId?: string;
  }>;
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

async function createClient(accountId: number): Promise<ImapFlow> {
  console.log('[mail.createClient] ENTER accountId=', accountId);
  const account = getAccountById(accountId);
  if (!account) throw new Error('Account not found');

  let credentials = getAccountCredentials(accountId);
  if (!credentials) throw new Error('No credentials found');

  // Auto-refresh OAuth tokens that expire within the next 5 minutes
  if (account.auth_type === 'oauth' && credentials.oauth_expiry) {
    const fiveMinMs = 5 * 60 * 1000;
    if (Date.now() > credentials.oauth_expiry - fiveMinMs) {
      log.info(`[mail] Token expiring soon for account ${accountId}, refreshing…`);
      const { refreshTokenForAccount } = await import('./oauth');
      const refreshed = await refreshTokenForAccount(accountId);
      if (refreshed) {
        credentials = getAccountCredentials(accountId) ?? credentials;
      }
    }
  }

  const auth = account.auth_type === 'oauth' && credentials.oauth_token
    ? { user: account.username, accessToken: credentials.oauth_token }
    : { user: account.username, pass: credentials.password };

  const client = new ImapFlow({
    host:              account.imap_host,
    port:              account.imap_port,
    secure:            account.use_tls === 1,
    auth,
    logger:            false,
    connectionTimeout: 15000,
  });

  console.log('[mail.createClient] connecting to', `${account.imap_host}:${account.imap_port}`, account.auth_type);
  await client.connect();
  console.log('[mail.createClient] connected OK');
  return client;
}

export async function getMailFolders(accountId: number): Promise<FolderInfo[]> {
  log.info(`[mail] Getting folders for account ${accountId}`);

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId);
    const list = await client.list();

    const folders: FolderInfo[] = list.map(mb => ({
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
  options: { limit?: number; offset?: number } = {}
): Promise<MailSummary[]> {
  const { limit = 50, offset = 0 } = options;

  console.log('[mail.fetchMailList] ENTER accountId=', accountId, 'folder=', folder);
  log.info(`[mail] Fetching mail list for account ${accountId} from ${folder}`);

  let client: ImapFlow | null = null;
  try {
    console.log('[mail.fetchMailList] calling createClient...');
    client = await createClient(accountId);
    console.log('[mail.fetchMailList] createClient returned, client=', !!client);

    // Open mailbox to access messages
    const lock = await client.getMailboxLock(folder);
    try {
      // Get total message count
      const status = await client.status(folder, { messages: true });
      const total = status.messages || 0;

      if (total === 0) return [];

      // Calculate range — fetch last N messages (newest first)
      const end = total - offset;
      const start = Math.max(1, end - limit + 1);

      if (start > end) return [];

      const summaries: MailSummary[] = [];

      // fetch returns AsyncIterableIterator<FetchMessageObject>
      for await (const msg of client.fetch(`${start}:${end}`, {
        envelope: true,
        uid: true,
        flags: true,
        size: false,
      })) {
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
          hasAttachments: false,
          isRead: flags.includes('\\Seen'),
          isStarred: flags.includes('\\Flagged'),
          messageId: msg.envelope?.messageId,
          inReplyTo: msg.envelope?.inReplyTo,
        });
      }

      // Sort by UID descending (newest first)
      summaries.sort((a, b) => b.uid - a.uid);

      log.info(`[mail] Fetched ${summaries.length} messages from ${folder}`);
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
  folder: string = 'INBOX'
): Promise<MailDetail | null> {
  log.info(`[mail] Fetching full message UID=${messageUid} for account ${accountId}`);

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId);

    // Normalize folder: IMAP INBOX is case-insensitive per spec, but some
    // servers (Dovecot, QQ Mail) are strict — always uppercase INBOX.
    const imapFolder = folder.toLowerCase() === 'inbox' ? 'INBOX' : folder;
    const lock = await client.getMailboxLock(imapFolder);
    try {
      // CRITICAL: third argument { uid: true } tells ImapFlow to treat the
      // first argument as a UID, NOT a sequence number.
      // Without it, fetchOne(45) fetches the 45th message in sequence order,
      // which is a completely different (or non-existent) message.
      const msg = await client.fetchOne(String(messageUid), {
        envelope: true,
        flags: true,
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
          bodyHtml = parsed.html || undefined;
          bodyText = parsed.text || undefined;
          parsedAttachments = parsed.attachments.map(att => ({
            filename: att.filename || 'attachment',
            contentType: att.contentType || 'application/octet-stream',
            size: att.size,
            contentId: att.contentId || undefined,
          }));
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

export async function setMessageFlags(
  accountId: number,
  messageUid: number,
  flags: string[],
  folder: string = 'INBOX'
): Promise<void> {
  log.info(`[mail] Setting flags for account ${accountId}, UID ${messageUid}`);

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId);
    await client.messageFlagsSet(messageUid, flags, { uid: true });
  } catch (err) {
    log.error('[mail] setFlags failed:', err);
    throw err;
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}

export async function deleteMessage(
  accountId: number,
  messageUid: number,
  folder: string = 'INBOX'
): Promise<void> {
  log.info(`[mail] Deleting message UID=${messageUid} for account ${accountId}`);

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId);
    await client.messageDelete(messageUid, { uid: true });
    log.info(`[mail] Message ${messageUid} deleted`);
  } catch (err) {
    log.error('[mail] deleteMessage failed:', err);
    throw err;
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}

export async function moveMessage(
  accountId: number,
  messageUid: number,
  fromFolder: string,
  toFolder: string
): Promise<void> {
  log.info(`[mail] Moving message ${messageUid} from ${fromFolder} to ${toFolder}`);

  let client: ImapFlow | null = null;
  try {
    client = await createClient(accountId);
    await client.messageMove(messageUid, toFolder, { uid: true });
    log.info(`[mail] Message ${messageUid} moved to ${toFolder}`);
  } catch (err) {
    log.error('[mail] moveMessage failed:', err);
    throw err;
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}
