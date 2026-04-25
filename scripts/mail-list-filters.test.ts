import { filterMailListByTab } from '../src/renderer/utils/mailListFilters';

type MailSummary = {
  id: string;
  uid: number;
  accountId: number;
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
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const baseMail: MailSummary = {
  id: 'mail-a',
  uid: 1,
  accountId: 1,
  from: 'sender@example.com',
  fromName: 'Sender',
  to: 'me@example.com',
  subject: 'Hello',
  date: new Date('2026-04-20T10:00:00Z'),
  snippet: 'hello world',
  hasAttachments: false,
  isRead: false,
  isStarred: false,
  folder: 'INBOX',
};

const mails: MailSummary[] = [
  baseMail,
  {
    ...baseMail,
    id: 'mail-b',
    uid: 2,
    isRead: true,
  },
  {
    ...baseMail,
    id: 'mail-c',
    uid: 3,
    hasAttachments: true,
    to: 'team@example.com',
  },
  {
    ...baseMail,
    id: 'mail-d',
    uid: 4,
    to: 'team@example.com',
    subject: '请确认这个版本',
    snippet: '请回复我你的意见 @me',
  },
  {
    ...baseMail,
    id: 'mail-e',
    uid: 5,
    isRead: true,
    subject: 'Weekly digest preview',
    snippet: 'This preview is for the weekly digest only.',
    to: 'newsletter@example.com',
  },
];

function testUnreadTabOnlyReturnsUnreadMails() {
  const result = filterMailListByTab(mails, 'unread', ['me@example.com']);
  assert(result.length === 3, 'Expected unread tab to return only unread mails');
  assert(result.every((mail) => !mail.isRead), 'Expected unread tab result to exclude read mails');
}

function testReadTabOnlyReturnsReadMails() {
  const result = filterMailListByTab(mails, 'read', ['me@example.com']);
  assert(result.length === 2, 'Expected read tab to return only read mails');
  assert(result.every((mail) => mail.isRead), 'Expected read tab result to include only read mails');
}

function testAttachmentsTabOnlyReturnsAttachmentMails() {
  const result = filterMailListByTab(mails, 'attachments', ['me@example.com']);
  assert(result.length === 1 && result[0].id === 'mail-c', 'Expected attachments tab to return only attachment mails');
}

function testMentionsTabUsesRecipientAndExplicitMentionSignal() {
  const result = filterMailListByTab(mails, 'mentions', ['me@example.com']);
  const ids = result.map((mail) => mail.id);
  assert(ids.includes('mail-a'), 'Expected direct recipient mail to be treated as @我');
  assert(ids.includes('mail-b'), 'Expected read direct recipient mail to remain a valid @我 candidate');
  assert(ids.includes('mail-d'), 'Expected explicit @localpart mention to be treated as @我');
  assert(!ids.includes('mail-e'), 'Expected preview text to not accidentally match @我 mention logic');
}

function run() {
  testUnreadTabOnlyReturnsUnreadMails();
  testReadTabOnlyReturnsReadMails();
  testAttachmentsTabOnlyReturnsAttachmentMails();
  console.log('mail-list-filters tests passed');
}

run();
