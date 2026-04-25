import type { RendererMailSummary } from '../hooks/useMail';

function buildIdentityKey(prefix: 'id' | 'msg', accountId: number, value: string): string {
  return `${prefix}:${accountId}:${value}`;
}

export function buildServerMailIdentitySet(mails: RendererMailSummary[]): Set<string> {
  const identities = new Set<string>();

  for (const mail of mails) {
    identities.add(buildIdentityKey('id', mail.accountId, mail.id));
    if (mail.messageId) {
      identities.add(buildIdentityKey('msg', mail.accountId, mail.messageId));
    }
  }

  return identities;
}

export function filterOutPersistedLocalThreadMails(
  localThreadMails: RendererMailSummary[],
  serverMailIdentitySet: Set<string>,
): RendererMailSummary[] {
  let changed = false;
  const filtered = localThreadMails.filter((mail) => {
    const hasPersistedId = serverMailIdentitySet.has(buildIdentityKey('id', mail.accountId, mail.id));
    const hasPersistedMessageId = mail.messageId
      ? serverMailIdentitySet.has(buildIdentityKey('msg', mail.accountId, mail.messageId))
      : false;
    const shouldKeep = !hasPersistedId && !hasPersistedMessageId;
    if (!shouldKeep) changed = true;
    return shouldKeep;
  });

  return changed ? filtered : localThreadMails;
}
