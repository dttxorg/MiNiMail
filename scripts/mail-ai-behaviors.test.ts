import {
  buildSenderConversationRows,
  resolveConversationCategory,
} from '../src/renderer/utils/mailConversations';
import { buildLocalizedMailNotificationContent } from '../src/main/services/mailNotification';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Mail = {
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
};

function testConversationCategoryFallsBackToCategorizedSibling() {
  const mails: Mail[] = [
    {
      id: 'reply-latest',
      uid: 22,
      from: 'me@example.com',
      fromName: 'Me',
      to: 'alerts@example.com',
      subject: 'Re: Security notice',
      date: new Date('2026-04-18T10:30:00Z'),
      snippet: 'Thanks, reviewing now',
      hasAttachments: false,
      isRead: true,
      isStarred: false,
      folder: 'SENT',
      accountId: 1,
    },
    {
      id: 'source-categorized',
      uid: 21,
      from: 'alerts@example.com',
      fromName: 'Security Alerts',
      to: 'me@example.com',
      subject: 'Security notice',
      date: new Date('2026-04-18T10:00:00Z'),
      snippet: 'Please review the latest sign-in',
      hasAttachments: false,
      isRead: false,
      isStarred: false,
      folder: 'INBOX',
      accountId: 1,
      category: '通知类',
    },
  ];

  const rows = buildSenderConversationRows(mails, ['me@example.com']);
  assert(rows.length === 1, `Expected a single conversation row, got ${rows.length}`);

  const resolved = resolveConversationCategory(rows[0], mails, ['me@example.com']);
  assert(resolved === '通知类', `Expected conversation category to fall back to categorized sibling, got ${resolved ?? 'none'}`);
}

function testLocalizedNotificationUsesUiLanguageCopy() {
  const zh = buildLocalizedMailNotificationContent('zh', {
    fromName: '安全团队',
    from: 'alerts@example.com',
    subject: '账户异常提醒',
    snippet: '请尽快检查最近的登录活动',
  });

  assert(zh.title.includes('新邮件'), `Expected Chinese notification title, got ${zh.title}`);
  assert(zh.body.includes('账户异常提醒'), 'Expected notification body to include subject');

  const ja = buildLocalizedMailNotificationContent('ja', {
    fromName: '',
    from: 'alerts@example.com',
    subject: 'Verify your sign-in',
    snippet: '',
  });

  assert(ja.title.includes('新着メール'), `Expected Japanese notification title, got ${ja.title}`);
  assert(ja.body.includes('alerts@example.com'), 'Expected sender fallback in localized body');
}

function run() {
  testConversationCategoryFallsBackToCategorizedSibling();
  testLocalizedNotificationUsesUiLanguageCopy();
  console.log('mail-ai-behaviors tests passed');
}

run();
