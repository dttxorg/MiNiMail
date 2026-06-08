import type { MailDeliveryState } from '../../shared/mailDeliveryState';

export { formatQuotedOriginalBody } from './composeDraft';

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
  deliveryState?: MailDeliveryState;
  deliveryError?: string;
  localDraftKey?: string;
  localSendId?: string;
};

function splitAddresses(value?: string | null): string[] {
  return (typeof value === 'string' ? value : '')
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
  const normalizedAccountEmails = new Set(
    accountEmails
      .filter((email): email is string => typeof email === 'string' && email.trim().length > 0)
      .map((email) => email.trim().toLowerCase())
  );
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

export function buildClassifiedConversationKey(
  mail: Pick<ConversationMail, 'from' | 'to' | 'accountId' | 'category'>,
  accountEmails: string[] = []
): string | null {
  const contactKey = getConversationKey(mail, accountEmails);
  if (!mail.category) return null;
  return `${contactKey}::${mail.category}`;
}

export function isLocalSenderMail(
  mail: Pick<ConversationMail, 'from'>,
  accountEmails: string[] = []
): boolean {
  const normalizedAccountEmails = new Set(
    accountEmails
      .filter((email): email is string => typeof email === 'string' && email.trim().length > 0)
      .map((email) => email.trim().toLowerCase())
  );
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

export function buildClassifiedConversationRows(
  mails: ConversationMail[],
  accountEmails: string[] = []
): ConversationMail[] {
  const latestByKey = new Map<string, ConversationMail>();

  for (const mail of mails) {
    const key = buildClassifiedConversationKey(mail, accountEmails);
    if (!key) continue;
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

export function findClassifiedConversationMails(
  target: ConversationMail,
  allMails: ConversationMail[],
  accountEmails: string[] = []
): ConversationMail[] {
  const targetKey = buildClassifiedConversationKey(target, accountEmails);
  if (!targetKey) return [];

  return allMails
    .filter((mail) =>
      mail.id !== target.id &&
      mail.accountId === target.accountId &&
      buildClassifiedConversationKey(mail, accountEmails) === targetKey
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

export function isGitHubNotificationMail(
  mail: Pick<ConversationMail, 'from' | 'to' | 'subject' | 'snippet' | 'bodyText' | 'bodyHtml'>,
): boolean {
  const haystack = [
    mail.from,
    mail.to,
    mail.subject,
    mail.snippet,
    mail.bodyText,
    mail.bodyHtml,
  ].filter(Boolean).join('\n').toLowerCase();

  if (/@github\.com\b/.test(haystack)) return true;
  if (/https:\/\/github\.com\//.test(haystack)) return true;
  if (/^\[[^[\]]+\/[^[\]]+\]/.test(mail.subject || '')) return true;
  return false;
}

export function filterGitHubConversationRows(
  rows: ConversationMail[],
  allMails: ConversationMail[],
  accountEmails: string[] = []
): ConversationMail[] {
  const githubKeys = new Set(
    allMails
      .filter((mail) => isGitHubNotificationMail(mail))
      .map((mail) => getConversationKey(mail, accountEmails))
  );

  if (githubKeys.size === 0) return [];

  return rows.filter((row) => githubKeys.has(getConversationKey(row, accountEmails)));
}

export function resolveConversationCategory(
  target: Pick<ConversationMail, 'id' | 'from' | 'to' | 'accountId' | 'date' | 'category'>,
  allMails: Array<Pick<ConversationMail, 'id' | 'from' | 'to' | 'accountId' | 'date' | 'category'>>,
  accountEmails: string[] = []
): string | undefined {
  if (target.category) return target.category;

  const targetKey = getConversationKey(target, accountEmails);
  const candidates = allMails
    .filter((mail) => getConversationKey(mail, accountEmails) === targetKey && mail.category)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return candidates[0]?.category;
}
