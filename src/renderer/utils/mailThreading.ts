import { folderMatches } from '../../shared/mailFolders';

type CurrentAccount = { id: number } | 'all' | null;
export interface ThreadableMail {
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
}

interface VisibleFolderArgs {
  selectedFolder: string;
  currentAccount: CurrentAccount;
  baseMails: ThreadableMail[];
  localThreadMails: ThreadableMail[];
  aiCategoryIds?: readonly string[];
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();
}

function getAddressSet(mail: Pick<ThreadableMail, 'from' | 'to'>): Set<string> {
  return new Set(
    [mail.from, mail.to]
      .flatMap((value) => value.split(','))
      .map((value) => value.replace(/[<>]/g, '').trim().toLowerCase())
      .filter(Boolean)
  );
}

function getThreadIdentity(mail: ThreadableMail): string {
  if (mail.messageId) return `${mail.accountId}:msg:${mail.messageId}`;
  return `${mail.accountId}:id:${mail.id}`;
}

function getThreadRoot(mail: ThreadableMail): string | undefined {
  if (mail.references) {
    const refs = mail.references.trim().split(/\s+/);
    if (refs[0]) return refs[0];
  }
  return mail.messageId;
}

export function buildThreadMailUniverse(
  baseMails: ThreadableMail[],
  localThreadMails: ThreadableMail[]
): ThreadableMail[] {
  const deduped = new Map<string, ThreadableMail>();

  for (const mail of [...localThreadMails, ...baseMails]) {
    deduped.set(getThreadIdentity(mail), mail);
  }

  return Array.from(deduped.values());
}

export function isHiddenFromVirtualMailViews(mail: Pick<ThreadableMail, 'folder'>): boolean {
  return folderMatches(mail.folder, 'trash') || folderMatches(mail.folder, 'spam');
}

export function findThreadSiblings(
  target: ThreadableMail,
  allMails: ThreadableMail[]
): ThreadableMail[] {
  const byMsgId = new Map<string, ThreadableMail>();
  for (const mail of allMails) {
    if (mail.accountId === target.accountId && mail.messageId) {
      byMsgId.set(mail.messageId, mail);
    }
  }

  const threadRoot = getThreadRoot(target);
  const threadMsgIds = new Set<string>(threadRoot ? [threadRoot] : []);

  function collectChain(mail: ThreadableMail, depth = 0): void {
    if (depth > 50) return;
    if (mail.messageId) threadMsgIds.add(mail.messageId);
    if (mail.inReplyTo) {
      threadMsgIds.add(mail.inReplyTo);
      const parent = byMsgId.get(mail.inReplyTo);
      if (parent) collectChain(parent, depth + 1);
    }
  }

  if (threadRoot) {
    collectChain(target);
  }

  const threadedMatches = allMails
    .filter((mail) =>
      mail.id !== target.id &&
      mail.accountId === target.accountId &&
      (
        (mail.messageId && threadMsgIds.has(mail.messageId)) ||
        (mail.inReplyTo && threadMsgIds.has(mail.inReplyTo)) ||
        (threadRoot && mail.references && mail.references.includes(threadRoot))
      )
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (threadedMatches.length > 0) {
    return threadedMatches;
  }

  const targetSubject = normalizeSubject(target.subject);
  const targetAddresses = getAddressSet(target);
  const windowMs = 30 * 24 * 60 * 60 * 1000;

  return allMails
    .filter((mail) => {
      if (mail.id === target.id || mail.accountId !== target.accountId) return false;
      if (normalizeSubject(mail.subject) !== targetSubject) return false;
      if (Math.abs(mail.date.getTime() - target.date.getTime()) > windowMs) return false;

      const mailAddresses = getAddressSet(mail);
      for (const address of mailAddresses) {
        if (targetAddresses.has(address)) return true;
      }
      return false;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function getVisibleFolderEmails({
  selectedFolder,
  currentAccount,
  baseMails,
  localThreadMails,
  aiCategoryIds = [],
}: VisibleFolderArgs): ThreadableMail[] {
  const accountFiltered = (currentAccount === null
    ? []
    : currentAccount === 'all'
    ? buildThreadMailUniverse(baseMails, localThreadMails)
    : buildThreadMailUniverse(
      baseMails.filter((mail) => mail.accountId === currentAccount.id),
      localThreadMails.filter((mail) => mail.accountId === currentAccount.id)
    )
  );

  if (aiCategoryIds.includes(selectedFolder)) {
    return accountFiltered.filter((mail) =>
      mail.category === selectedFolder &&
      !isHiddenFromVirtualMailViews(mail)
    );
  }

  if (selectedFolder === 'starred') {
    return accountFiltered.filter((mail) =>
      mail.isStarred &&
      !folderMatches(mail.folder, 'trash') &&
      !folderMatches(mail.folder, 'spam')
    );
  }

  const standardFolders = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam'];
  if (!standardFolders.includes(selectedFolder)) return accountFiltered;

  if (selectedFolder === 'inbox') {
    return accountFiltered.filter((mail) =>
      folderMatches(mail.folder, 'inbox') ||
      folderMatches(mail.folder, 'sent') ||
      folderMatches(mail.folder, 'drafts')
    );
  }

  return accountFiltered.filter((mail) => folderMatches(mail.folder, selectedFolder));
}
