type SummaryLike = {
  id: string;
  uid: number;
  accountId: number;
};

type DetailLike = SummaryLike & {
  bodyText?: string;
  bodyHtml?: string;
};

type MailLike = SummaryLike | DetailLike | null;

export function isSameMailIdentity(a: MailLike, b: MailLike): boolean {
  if (!a || !b) return false;
  return a.id === b.id || (a.accountId === b.accountId && a.uid === b.uid);
}

export function resolveDisplayedMail(
  selectedEmail: SummaryLike | null,
  currentMail: DetailLike | null
): SummaryLike | DetailLike | null {
  if (selectedEmail && currentMail && isSameMailIdentity(selectedEmail, currentMail)) {
    return currentMail;
  }
  return selectedEmail;
}
