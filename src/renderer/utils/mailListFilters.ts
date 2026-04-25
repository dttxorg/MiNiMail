import type { RendererMailSummary } from '../hooks/useMail';

export type MailListFilterTab = 'all' | 'unread' | 'read' | 'attachments';

export function filterMailListByTab(
  emails: RendererMailSummary[],
  activeTab: MailListFilterTab,
  _accountEmails: string[] = [],
): RendererMailSummary[] {
  switch (activeTab) {
    case 'unread':
      return emails.filter((email) => !email.isRead);
    case 'read':
      return emails.filter((email) => email.isRead);
    case 'attachments':
      return emails.filter((email) => email.hasAttachments);
    case 'all':
    default:
      return emails;
  }
}
