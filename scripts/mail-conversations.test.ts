import {
  buildSenderConversationRows,
  filterGitHubConversationRows,
  filterUnreadConversationRows,
  findSenderConversationMails,
  formatQuotedOriginalBody,
  resolveConversationCategory,
} from '../src/renderer/utils/mailConversations';
import { normalizeMailSettingsSnapshot } from '../src/renderer/utils/mailSettings';

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
  bodyText?: string;
  bodyHtml?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const olderInbound: Mail = {
  id: 'mail-1',
  uid: 1,
  from: 'account@nvidia.com',
  fromName: 'NVIDIA Accounts',
  to: 'me@example.com',
  subject: 'Verify your email',
  date: new Date('2026-04-10T10:00:00Z'),
  snippet: 'Older inbound message',
  hasAttachments: false,
  isRead: false,
  isStarred: false,
  folder: 'INBOX',
  accountId: 1,
};

const newerInbound: Mail = {
  ...olderInbound,
  id: 'mail-2',
  uid: 2,
  date: new Date('2026-04-12T10:00:00Z'),
  snippet: 'Newest inbound message',
};

const anotherSender: Mail = {
  id: 'mail-4',
  uid: 4,
  from: 'billing@stripe.com',
  fromName: 'Stripe Billing',
  to: 'me@example.com',
  subject: 'Invoice ready',
  date: new Date('2026-04-12T09:00:00Z'),
  snippet: 'Stripe invoice',
  hasAttachments: false,
  isRead: false,
  isStarred: false,
  folder: 'INBOX',
  accountId: 1,
};

const threadStarter: Mail = {
  id: 'mail-5',
  uid: 5,
  from: 'alerts@example.com',
  fromName: 'Alerts',
  to: 'me@example.com',
  subject: 'Security notice',
  date: new Date('2026-04-11T08:00:00Z'),
  snippet: 'Earlier unread mail',
  hasAttachments: false,
  isRead: false,
  isStarred: false,
  folder: 'INBOX',
  accountId: 1,
  messageId: '<security-root@example.com>',
};

const threadFollowUp: Mail = {
  ...threadStarter,
  id: 'mail-6',
  uid: 6,
  date: new Date('2026-04-12T08:00:00Z'),
  snippet: 'Later read follow-up',
  isRead: true,
  inReplyTo: '<security-root@example.com>',
  references: '<security-root@example.com>',
};

const githubInbound: Mail = {
  id: 'mail-8',
  uid: 8,
  from: 'notifications@github.com',
  fromName: 'GitHub',
  to: 'me@example.com',
  subject: '[owner/repo] Re: Improve parser (#42)',
  date: new Date('2026-04-12T11:00:00Z'),
  snippet: 'alice requested your review',
  hasAttachments: false,
  isRead: false,
  isStarred: false,
  folder: 'INBOX',
  accountId: 1,
};

const githubLocalReply: Mail = {
  id: 'mail-9',
  uid: 9,
  from: 'me@example.com',
  fromName: 'Me',
  to: 'notifications@github.com',
  subject: '[owner/repo] Re: Improve parser (#42)',
  date: new Date('2026-04-12T12:00:00Z'),
  snippet: 'I replied by email',
  hasAttachments: false,
  isRead: true,
  isStarred: false,
  folder: 'Sent',
  accountId: 1,
};

function testConversationRowsCollapseSameSender() {
  const rows = buildSenderConversationRows([olderInbound, newerInbound, anotherSender], ['me@example.com']);

  assert(rows.length === 2, `Expected 2 sender conversation rows, got ${rows.length}`);
  assert(rows[0].id === newerInbound.id, 'Expected NVIDIA row to use latest inbound mail as representative');
  assert(rows[1].id === anotherSender.id, 'Expected Stripe row to remain as its own conversation');
}

function testConversationIncludesOutgoingRepliesToSameSender() {
  const mails = findSenderConversationMails(threadStarter, [threadStarter, threadFollowUp, anotherSender], ['me@example.com']);

  assert(mails.length === 1, `Expected 1 thread sibling, got ${mails.length}`);
  assert(mails[0].id === threadFollowUp.id, 'Expected the later read mail to be linked in the same thread');
}

function testQuotedOriginalBodyUsesReadableContent() {
  const quoted = formatQuotedOriginalBody({
    mode: 'reply',
    email: {
      ...newerInbound,
      bodyText: 'Hello there\nThis is the full original body.',
    },
  });

  assert(quoted.includes('On '), 'Expected reply quote header');
  assert(quoted.includes('Hello there'), 'Expected quoted original body content');
  assert(!quoted.includes('Newest inbound message'), 'Expected full body quote, not just snippet fallback');
}

function testUnreadConversationFilterKeepsThreadsWithAnyUnreadMail() {
  const readStripeMail = { ...anotherSender, id: 'mail-7', isRead: true };
  const allMails = [threadStarter, threadFollowUp, readStripeMail];
  const rows = buildSenderConversationRows(allMails, ['me@example.com']);
  const unreadRows = filterUnreadConversationRows(rows, allMails, ['me@example.com']);

  assert(unreadRows.length === 1, `Expected one unread conversation row, got ${unreadRows.length}`);
  assert(unreadRows[0].id === threadFollowUp.id, 'Expected latest mail in the unread conversation to remain visible');
}

function testGitHubConversationFilterKeepsConversationWhenLatestMailIsLocal() {
  const allMails = [githubInbound, githubLocalReply, anotherSender];
  const rows = buildSenderConversationRows(allMails, ['me@example.com']);
  const githubRows = filterGitHubConversationRows(rows, allMails, ['me@example.com']);

  assert(githubRows.length === 1, `Expected one GitHub conversation row, got ${githubRows.length}`);
  assert(githubRows[0].id === githubLocalReply.id, 'Expected latest mail in the GitHub conversation to remain the representative row');
}

function testConversationCategoryFallsBackToHiddenThreadMail() {
  const categorizedInbound = {
    ...githubInbound,
    category: '通知类',
  };
  const allMails = [categorizedInbound, githubLocalReply];
  const rows = buildSenderConversationRows(allMails, ['me@example.com']);
  const representative = rows[0];
  const visibleRowsOnlyCategory = resolveConversationCategory(representative, rows, ['me@example.com']);
  const fullSourceCategory = resolveConversationCategory(representative, allMails, ['me@example.com']);

  assert(visibleRowsOnlyCategory === undefined, 'Expected folded rows alone to miss the hidden categorized mail');
  assert(fullSourceCategory === '通知类', 'Expected full source mails to preserve the conversation category');
}

function testGitHubSettingDefaultsToDisabled() {
  const normalized = normalizeMailSettingsSnapshot({});
  assert(normalized.githubNotificationsViewEnabled === false, 'Expected GitHub notifications view to default to disabled');
}

function run() {
  testConversationRowsCollapseSameSender();
  testConversationIncludesOutgoingRepliesToSameSender();
  testQuotedOriginalBodyUsesReadableContent();
  testUnreadConversationFilterKeepsThreadsWithAnyUnreadMail();
  testGitHubConversationFilterKeepsConversationWhenLatestMailIsLocal();
  testConversationCategoryFallsBackToHiddenThreadMail();
  testGitHubSettingDefaultsToDisabled();
  console.log('mail-conversations tests passed');
}

run();
