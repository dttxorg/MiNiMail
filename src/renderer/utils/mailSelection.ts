import type { RendererMailDetail, RendererMailSummary } from '../hooks/useMail';

type MailIdentity = {
  id: string;
  uid: number;
  accountId: number;
};

type MailLike = MailIdentity | null;

export function isSameMailIdentity(a: MailLike, b: MailLike): boolean {
  if (!a || !b) return false;
  return a.id === b.id || (a.accountId === b.accountId && a.uid === b.uid);
}

export function resolveDisplayedMail(
  selectedEmail: RendererMailSummary | null,
  currentMail: RendererMailDetail | null
): RendererMailSummary | RendererMailDetail | null {
  if (selectedEmail && currentMail && isSameMailIdentity(selectedEmail, currentMail)) {
    return currentMail;
  }
  return selectedEmail;
}
