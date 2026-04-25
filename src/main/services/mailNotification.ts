import type { MailSummary } from './mail';
import type { AppLanguage } from '../../shared/mailFolders';

type NotificationCandidate = Pick<MailSummary, 'uid' | 'from' | 'messageId' | 'date' | 'isRead'>;
type NotificationMailPreview = Pick<MailSummary, 'from' | 'subject' | 'snippet'> & { fromName?: string };

export function buildMailNotificationKey(accountId: number, folder: string, mail: NotificationCandidate): string {
  const stableId = mail.messageId?.trim() || String(mail.uid);
  return `${accountId}:${folder.toLowerCase()}:${stableId}`;
}

export function shouldNotifyMail(params: {
  notify: boolean;
  accountEmail?: string;
  appStartedAt: number;
  now?: number;
  mail: NotificationCandidate;
  folderKind: 'inbox' | 'other';
  alreadyNotified: boolean;
}): boolean {
  const { notify, accountEmail, appStartedAt, now = Date.now(), mail, folderKind, alreadyNotified } = params;

  if (!notify || alreadyNotified) return false;
  if (folderKind !== 'inbox') return false;
  if (mail.isRead) return false;

  const mailTime = mail.date instanceof Date ? mail.date.getTime() : new Date(mail.date).getTime();
  if (!Number.isFinite(mailTime)) return false;

  // Suppress startup backfill and stale history from re-triggering native notifications.
  if (mailTime < appStartedAt - 60_000) return false;
  if (mailTime < now - 15 * 60 * 1000) return false;

  if (accountEmail && mail.from.toLowerCase().includes(accountEmail.toLowerCase())) return false;

  return true;
}

function normalizeNotificationLanguage(value?: string | null): AppLanguage {
  switch ((value || '').toLowerCase()) {
    case 'en':
    case 'ja':
    case 'ko':
    case 'es':
    case 'fr':
    case 'de':
    case 'ru':
      return value as AppLanguage;
    default:
      return 'zh';
  }
}

export function buildLocalizedMailNotificationContent(
  language: string | null | undefined,
  mail: NotificationMailPreview,
): { title: string; body: string } {
  const appLanguage = normalizeNotificationLanguage(language);
  const sender = mail.fromName?.trim() || mail.from;
  const subject = mail.subject?.trim();
  const snippet = mail.snippet?.trim();
  const preview = subject || snippet || sender;

  if (appLanguage === 'ja') {
    return {
      title: '新着メール',
      body: `${sender} ・ ${preview}`,
    };
  }

  if (appLanguage === 'en') {
    return {
      title: 'New email',
      body: `${sender} · ${preview}`,
    };
  }

  if (appLanguage === 'ko') {
    return {
      title: '새 메일',
      body: `${sender} · ${preview}`,
    };
  }

  if (appLanguage === 'es') {
    return {
      title: 'Correo nuevo',
      body: `${sender} · ${preview}`,
    };
  }

  if (appLanguage === 'fr') {
    return {
      title: 'Nouveau mail',
      body: `${sender} · ${preview}`,
    };
  }

  if (appLanguage === 'de') {
    return {
      title: 'Neue Mail',
      body: `${sender} · ${preview}`,
    };
  }

  if (appLanguage === 'ru') {
    return {
      title: 'Новое письмо',
      body: `${sender} · ${preview}`,
    };
  }

  return {
    title: '新邮件',
    body: `${sender} · ${preview}`,
  };
}
