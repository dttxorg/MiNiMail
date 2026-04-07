import ImapClient, { ImapClientOptions } from 'imap-client';
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

function parseAddressList(header: string | string[] | undefined): { name: string; address: string }[] {
  if (!header) return [];
  const result: { name: string; address: string }[] = [];

  // Handle array format from IMAP envelope: [[name, aol, mailbox, host], ...]
  if (Array.isArray(header)) {
    for (const addr of header) {
      if (Array.isArray(addr) && addr.length >= 4) {
        const [, , mailbox, host] = addr;
        if (mailbox && host) {
          result.push({
            name: '',
            address: `${mailbox}@${host}`,
          });
        }
      }
    }
    return result;
  }

  // Handle string format
  const emailRegex = /([^<]+)?\s*<([^>]+)>/g;
  let match;
  while ((match = emailRegex.exec(header)) !== null) {
    result.push({
      name: (match[1] || '').trim().replace(/^["']|["']$/g, ''),
      address: match[2].trim(),
    });
  }
  if (result.length === 0 && header) {
    const bareEmailRegex = /([^\s,]+@[^\s,]+)/g;
    while ((match = bareEmailRegex.exec(header)) !== null) {
      result.push({ name: '', address: match[1] });
    }
  }
  return result;
}

function getTextContent(mail: { text?: string; textAsHtml?: string }): string {
  if (mail.text) return mail.text;
  if (mail.textAsHtml) {
    return mail.textAsHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function createImapClient(accountId: number): { client: ImapClient; config: Record<string, unknown> } {
  const account = getAccountById(accountId);
  if (!account) throw new Error('Account not found');

  const credentials = getAccountCredentials(accountId);
  if (!credentials) throw new Error('No credentials found');

  const config: Record<string, unknown> = {
    host: account.imap_host,
    port: account.imap_port,
    auth: {
      user: account.username,
    },
    secure: account.use_tls === 1,
  };

  if (account.auth_type === 'oauth' && credentials.oauth_token) {
    config.auth = {
      ...config.auth as Record<string, unknown>,
      xoauth2: credentials.oauth_token,
    };
  } else if (credentials.password) {
    (config.auth as Record<string, unknown>).pass = credentials.password;
  }

  const client = new ImapClient(config as unknown as ImapClientOptions);
  return { client, config };
}

export async function getMailFolders(accountId: number): Promise<FolderInfo[]> {
  log.info(`Getting mail folders for account ${accountId}`);

  try {
    const { client } = createImapClient(accountId);
    await client.login();

    // List mailboxes using the client's internal methods
    // Since imap-client doesn't expose listMailboxes directly, we return common folders
    const commonFolders = [
      { name: 'INBOX', path: 'INBOX', delimiter: '.', flags: [] },
      { name: 'Sent', path: 'Sent', delimiter: '.', flags: [] },
      { name: 'Drafts', path: 'Drafts', delimiter: '.', flags: [] },
      { name: 'Trash', path: 'Trash', delimiter: '.', flags: [] },
      { name: 'Spam', path: 'Spam', delimiter: '.', flags: [] },
    ];

    await client.logout();
    return commonFolders;
  } catch (err) {
    log.error('Failed to get folders:', err);
    throw err;
  }
}

export async function fetchMailList(
  accountId: number,
  folder: string = 'INBOX',
  options: {
    limit?: number;
    offset?: number;
    search?: string;
  } = {}
): Promise<MailSummary[]> {
  const { limit = 50, offset = 0 } = options;

  log.info(`Fetching mail list for account ${accountId} from ${folder}`);

  try {
    const { client } = createImapClient(accountId);
    await client.login();
    await client.selectMailbox({ path: folder });

    // Search for all messages
    const uids = await client.search({ path: folder, uid: undefined }) as number[];

    if (uids.length === 0) {
      await client.logout();
      return [];
    }

    // Sort by UID descending (newest first)
    const sortedUids = uids.sort((a, b) => b - a);

    // Apply pagination
    const start = Math.max(0, offset);
    const end = Math.min(sortedUids.length, start + limit);
    const pageUids = sortedUids.slice(start, end);

    if (pageUids.length === 0) {
      await client.logout();
      return [];
    }

    // Fetch message headers and structure
    const messages = await client.listMessages({
      path: folder,
      uids: pageUids,
    }) as Array<{
      uid: number;
      flags: string[];
      envelope: {
        from?: string;
        to?: string;
        subject?: string;
        date?: string;
      };
      bodystructure: unknown;
    }>;

    const mailList: MailSummary[] = messages.map((msg) => {
      // imap-client returns parsed address arrays and subject directly
      const fromList = (msg as any).from as Array<{ address: string; name: string }> || [];
      const toList = (msg as any).to as Array<{ address: string; name: string }> || [];
      const subject = (msg as any).subject || '(No Subject)';
      const sentDate = (msg as any).sentDate ? new Date((msg as any).sentDate) : new Date();

      return {
        id: String(msg.uid),
        uid: msg.uid,
        from: fromList[0]?.address || '',
        fromName: fromList[0]?.name || '',
        to: toList.map(t => t.address).join(', '),
        subject,
        date: sentDate,
        flags: msg.flags || [],
        snippet: '',
        hasAttachments: false,
        isRead: msg.flags?.includes('\\Seen') || false,
        isStarred: msg.flags?.includes('\\Flagged') || false,
      };
    });

    await client.logout();
    return mailList;
  } catch (err) {
    log.error('Failed to fetch mail list:', err);
    throw err;
  }
}

export async function fetchMailDetail(
  accountId: number,
  messageUid: number,
  folder: string = 'INBOX'
): Promise<MailDetail | null> {
  log.info(`=== fetchMailDetail START: account=${accountId}, UID=${messageUid}, folder=${folder}`);

  try {
    const { client } = createImapClient(accountId);
    log.info('=== Client created, logging in...');
    await client.login();
    log.info('=== Logged in, selecting mailbox...');
    await client.selectMailbox({ path: folder });
    log.info('=== Mailbox selected, fetching message...');

    // Fetch the full message with body parts
    const messages = await client.listMessages({
      path: folder,
      uids: [messageUid],
    }) as Array<{
      uid: number;
      flags: string[];
      from: Array<{ address: string; name: string }>;
      to: Array<{ address: string; name: string }>;
      cc: Array<{ address: string; name: string }>;
      subject: string;
      sentDate: string;
      bodyParts: Array<{
        partNumber: string;
        type: string;
        subtype?: string;
        charset?: string;
        disposition?: string;
        filename?: string;
      }>;
      attachments: Array<{
        filename: string;
        contentType: string;
        size: number;
        partNumber?: string;
      }>;
    }>;
    log.info(`=== Got ${messages.length} messages`);

    if (messages.length === 0) {
      await client.logout();
      return null;
    }

    const msg = messages[0];
    const fromList = msg.from || [];
    const toList = msg.to || [];
    const ccList = msg.cc || [];

    // Fetch body using getBodyParts - need to add a body part with empty partNumber to get full body
    let bodyHtml: string | undefined;
    let bodyText: string | undefined;
    let parsedAttachments: MailDetail['attachments'] = [];

    try {
      log.info('=== Fetching body parts...');
      // Create a body part request with empty partNumber to get full body
      const bodyPartsWithFull = [{ partNumber: '' }];

      const bodyPartsResult = await (client as unknown as {
        getBodyParts: (options: { path: string; uid: number; bodyParts: Array<{ partNumber: string }> }) => Promise<Array<{ raw: string; type: string; subtype?: string }>>
      }).getBodyParts({
        path: folder,
        uid: messageUid,
        bodyParts: bodyPartsWithFull,
      });

      log.info('=== bodyPartsResult length:', bodyPartsResult.length);
      for (const part of bodyPartsResult) {
        if (part.raw) {
          log.info('=== got raw body, length:', part.raw.length);
          try {
            const parsed = await simpleParser(part.raw);
            bodyHtml = parsed.html || undefined;
            bodyText = parsed.text || undefined;
            log.info('=== parsed bodyHtml:', bodyHtml ? `length=${bodyHtml.length}` : 'null');
            log.info('=== parsed bodyText:', bodyText ? `length=${bodyText.length}` : 'null');
            if (!bodyHtml && bodyText) {
              bodyHtml = bodyText.replace(/\n/g, '<br>');
            }
          } catch (e) {
            log.error('=== Failed to parse body:', e);
          }
        }
      }
    } catch (e) {
      log.error('=== Failed to fetch body parts:', e);
    }

    const mailDetail: MailDetail = {
      id: String(msg.uid),
      uid: msg.uid,
      from: fromList[0]?.address || '',
      fromName: fromList[0]?.name || '',
      to: toList.map(t => t.address).join(', '),
      cc: ccList.map(t => t.address).join(', '),
      subject: msg.subject || '(No Subject)',
      date: msg.sentDate ? new Date(msg.sentDate) : new Date(),
      flags: msg.flags || [],
      bodyHtml,
      bodyText,
      attachments: parsedAttachments,
      headers: {
        from: (msg as any).from?.[0]?.address || '',
        to: (msg as any).to?.[0]?.address || '',
        subject: msg.subject || '',
        date: msg.sentDate || '',
      },
    };

    log.info('=== mailDetail.bodyHtml:', mailDetail.bodyHtml ? `length=${mailDetail.bodyHtml.length}` : 'null');
    log.info('=== mailDetail.bodyText:', mailDetail.bodyText ? `length=${mailDetail.bodyText.length}` : 'null');

    await client.logout();
    log.info('=== fetchMailDetail END');
    return mailDetail;
  } catch (err) {
    log.error('Failed to fetch mail detail:', err);
    throw err;
  }
}

export async function setMessageFlags(
  accountId: number,
  messageUid: number,
  flags: string[],
  folder: string = 'INBOX'
): Promise<void> {
  log.info(`Setting flags for account ${accountId}, UID ${messageUid}`);

  try {
    const { client } = createImapClient(accountId);
    await client.login();
    await client.selectMailbox({ path: folder });

    // Add flags using the client's addFlags method
    await (client as unknown as { addFlags: (uids: number[], flags: string[]) => Promise<void> }).addFlags([messageUid], flags);

    await client.logout();
  } catch (err) {
    log.error('Failed to set flags:', err);
    throw err;
  }
}

export async function deleteMessage(
  accountId: number,
  messageUid: number,
  folder: string = 'INBOX'
): Promise<void> {
  log.info(`Deleting message for account ${accountId}, UID ${messageUid}`);

  try {
    const { client } = createImapClient(accountId);
    await client.login();
    await client.selectMailbox({ path: folder });

    // Move to Trash first, then delete
    const trashFolder = 'Trash';
    await (client as unknown as { moveMessages: (uids: number[], path: string) => Promise<void> }).moveMessages([messageUid], trashFolder);

    await client.logout();
    log.info(`Message ${messageUid} moved to Trash`);
  } catch (err) {
    log.error('Failed to delete message:', err);
    throw err;
  }
}

export async function moveMessage(
  accountId: number,
  messageUid: number,
  fromFolder: string,
  toFolder: string
): Promise<void> {
  log.info(`Moving message ${messageUid} from ${fromFolder} to ${toFolder}`);

  try {
    const { client } = createImapClient(accountId);
    await client.login();
    await client.selectMailbox({ path: fromFolder });

    await (client as unknown as { moveMessages: (uids: number[], path: string) => Promise<void> }).moveMessages([messageUid], toFolder);

    await client.logout();
    log.info(`Message ${messageUid} moved to ${toFolder}`);
  } catch (err) {
    log.error('Failed to move message:', err);
    throw err;
  }
}
