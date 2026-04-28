export type MailRemovalIdentity = {
  id: string;
  accountId: number;
  messageId?: string | null;
};

export function normalizeMailMessageId(messageId?: string | null): string | null {
  const value = String(messageId ?? '').trim();
  if (!value) return null;
  return value.replace(/^<+/, '').replace(/>+$/, '').trim().toLowerCase() || null;
}

export function shouldRemoveMailForDeletedTarget(
  candidate: MailRemovalIdentity,
  deletedTarget: MailRemovalIdentity,
): boolean {
  if (candidate.accountId !== deletedTarget.accountId) return false;
  if (candidate.id === deletedTarget.id) return true;

  const candidateMessageId = normalizeMailMessageId(candidate.messageId);
  const deletedMessageId = normalizeMailMessageId(deletedTarget.messageId);
  return Boolean(candidateMessageId && deletedMessageId && candidateMessageId === deletedMessageId);
}

export function collectRemovedMailIdsForDeletedTarget<T extends MailRemovalIdentity>(
  candidates: readonly T[],
  deletedTarget: MailRemovalIdentity,
): Set<string> {
  const ids = new Set<string>([deletedTarget.id]);
  for (const candidate of candidates) {
    if (shouldRemoveMailForDeletedTarget(candidate, deletedTarget)) {
      ids.add(candidate.id);
    }
  }
  return ids;
}
