import { extractReadableEmailText } from './emailContent';

export type ConversationMail = {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  accountId: number;
  category?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  bodyText?: string;
  bodyHtml?: string;
  deliveryState?: 'sending' | 'sent' | 'failed';
  deliveryError?: string;
  localDraftKey?: string;
};

function splitAddresses(value: string): string[] {
  return value
    .split(',')
    .map((part) => {
      const match = part.match(/<([^>]+)>/);
      return (match?.[1] || part).trim().toLowerCase();
    })
    .filter(Boolean);
}

function firstAddress(value: string): string | undefined {
  return splitAddresses(value)[0];
}

export function getConversationCounterparty(
  mail: Pick<ConversationMail, 'from' | 'to' | 'accountId'>,
  accountEmails: string[] = []
): string {
  const normalizedAccountEmails = new Set(accountEmails.map((email) => email.trim().toLowerCase()));
  const from = firstAddress(mail.from) || '';

  if (normalizedAccountEmails.has(from)) {
    const recipient = splitAddresses(mail.to).find((address) => !normalizedAccountEmails.has(address));
    return recipient || firstAddress(mail.to) || from;
  }

  return from || firstAddress(mail.to) || `${mail.accountId}:unknown`;
}

export function getConversationKey(
  mail: Pick<ConversationMail, 'from' | 'to' | 'accountId'>,
  accountEmails: string[] = []
): string {
  return `${mail.accountId}:${getConversationCounterparty(mail, accountEmails)}`;
}

export function isLocalSenderMail(
  mail: Pick<ConversationMail, 'from'>,
  accountEmails: string[] = []
): boolean {
  const normalizedAccountEmails = new Set(accountEmails.map((email) => email.trim().toLowerCase()));
  const from = firstAddress(mail.from) || '';
  return normalizedAccountEmails.has(from);
}

export function buildSenderConversationRows(
  mails: ConversationMail[],
  accountEmails: string[] = []
): ConversationMail[] {
  const latestByKey = new Map<string, ConversationMail>();

  for (const mail of mails) {
    const key = getConversationKey(mail, accountEmails);
    const current = latestByKey.get(key);
    if (!current || mail.date.getTime() > current.date.getTime()) {
      latestByKey.set(key, mail);
    }
  }

  return Array.from(latestByKey.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function findSenderConversationMails(
  target: ConversationMail,
  allMails: ConversationMail[],
  accountEmails: string[] = []
): ConversationMail[] {
  const targetKey = getConversationKey(target, accountEmails);

  return allMails
    .filter((mail) =>
      mail.id !== target.id &&
      mail.accountId === target.accountId &&
      getConversationKey(mail, accountEmails) === targetKey
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function filterUnreadConversationRows(
  rows: ConversationMail[],
  allMails: ConversationMail[],
  accountEmails: string[] = []
): ConversationMail[] {
  const unreadKeys = new Set(
    allMails
      .filter((mail) => !mail.isRead)
      .map((mail) => getConversationKey(mail, accountEmails))
  );

  if (unreadKeys.size === 0) return [];

  return rows.filter((row) => unreadKeys.has(getConversationKey(row, accountEmails)));
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
  email: ConversationMail;
}): string {
  const readable = extractReadableEmailText(email, { stripUrls: true }).trim();
  const fromLine = `${email.fromName || email.from} <${email.from}>`;
  const toLine = email.to ? `To: ${email.to}\n` : '';
  const dateLine = email.date.toLocaleString();
  const subjectLine = email.subject;

  if (mode === 'reply') {
    return `\n\nOn ${dateLine}, ${fromLine} wrote:\n${quoteLines(readable || email.subject)}`;
  }

  return `\n\n---------- Forwarded message ----------\nFrom: ${fromLine}\n${toLine}Date: ${dateLine}\nSubject: ${subjectLine}\n\n${readable || email.subject}`;
}
