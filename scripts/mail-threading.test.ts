import { folderMatches } from '../src/shared/mailFolders';
import {
  buildThreadMailUniverse,
  findThreadSiblings,
  getVisibleFolderEmails,
} from '../src/renderer/utils/mailThreading';

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
  messageId?: string;
  inReplyTo?: string;
  references?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const inboxMail: Mail = {
  id: '1:<root@local>',
  uid: 101,
  from: 'news@insideapple.apple.com',
  fromName: 'Apple News',
  to: 'me@example.com',
  subject: 'Weekend reads',
  date: new Date('2026-04-12T09:00:00Z'),
  snippet: 'Original message',
  hasAttachments: false,
  isRead: false,
  isStarred: false,
  folder: 'INBOX',
  accountId: 1,
  messageId: '<root@local>',
};

const optimisticReply: Mail = {
  id: '1:<reply@local>',
  uid: 999999,
  from: 'me@example.com',
  fromName: 'Me',
  to: 'news@insideapple.apple.com',
  subject: 'Re: Weekend reads',
  date: new Date('2026-04-12T09:05:00Z'),
  snippet: 'Thanks for the update',
  hasAttachments: false,
  isRead: true,
  isStarred: false,
  folder: 'Sent Items',
  accountId: 1,
  messageId: '<reply@local>',
  inReplyTo: '<root@local>',
  references: '<root@local>',
};

const draftMail: Mail = {
  id: '1:<draft@local>',
  uid: 555555,
  from: 'me@example.com',
  fromName: 'Me',
  to: 'news@insideapple.apple.com',
  subject: 'Draft: Weekend reads',
  date: new Date('2026-04-12T09:06:00Z'),
  snippet: 'Working draft',
  hasAttachments: false,
  isRead: true,
  isStarred: false,
  folder: 'Drafts',
  accountId: 1,
  messageId: '<draft@local>',
};

const trashMail: Mail = {
  id: '1:<trash@local>',
  uid: 777777,
  from: 'alerts@example.com',
  fromName: 'Alerts',
  to: 'me@example.com',
  subject: 'Deleted message',
  date: new Date('2026-04-12T09:07:00Z'),
  snippet: 'Trash item',
  hasAttachments: false,
  isRead: true,
  isStarred: false,
  folder: 'Trash',
  accountId: 1,
  messageId: '<trash@local>',
};

function testPrimaryConversationViewIncludesInboxSentAndDrafts() {
  const visible = getVisibleFolderEmails({
    selectedFolder: 'inbox',
    currentAccount: { id: 1 },
    baseMails: [inboxMail, trashMail],
    localThreadMails: [optimisticReply, draftMail],
  });

  assert(visible.length === 3, `Expected unified primary view to show inbox, sent, and drafts, got ${visible.length}`);
  assert(visible.some((mail: Mail) => mail.id === inboxMail.id), 'Expected inbox mail in primary view');
  assert(visible.some((mail: Mail) => mail.id === optimisticReply.id), 'Expected sent reply in primary view');
  assert(visible.some((mail: Mail) => mail.id === draftMail.id), 'Expected draft mail in primary view');
  assert(!visible.some((mail: Mail) => mail.id === trashMail.id), 'Trash mail should not appear in primary conversation view');
}

function testSentViewIncludesOptimisticSentMail() {
  const visible = getVisibleFolderEmails({
    selectedFolder: 'sent',
    currentAccount: { id: 1 },
    baseMails: [inboxMail],
    localThreadMails: [optimisticReply],
  });

  assert(visible.length === 1, `Expected sent view to show the optimistic sent mail, got ${visible.length}`);
  assert(folderMatches(visible[0].folder, 'sent'), 'Expected visible mail to belong to sent folder');
  assert(visible[0].id === optimisticReply.id, 'Expected sent view to contain the optimistic reply');
}

function testStarredViewShowsOnlyStarredPrimaryMails() {
  const starredInbound = { ...inboxMail, id: 'starred-1', isStarred: true };
  const starredSent = { ...optimisticReply, id: 'starred-2', isStarred: true };
  const unstarredDraft = { ...draftMail, id: 'draft-unstarred', isStarred: false };

  const visible = getVisibleFolderEmails({
    selectedFolder: 'starred',
    currentAccount: { id: 1 },
    baseMails: [starredInbound, unstarredDraft],
    localThreadMails: [starredSent],
  });

  assert(visible.length === 2, `Expected starred view to contain only starred primary mails, got ${visible.length}`);
  assert(visible.every((mail: Mail) => mail.isStarred), 'Expected all starred view mails to be starred');
}

function testThreadViewIncludesOptimisticReply() {
  const universe = buildThreadMailUniverse([inboxMail], [optimisticReply]);
  const siblings = findThreadSiblings(inboxMail, universe);

  assert(siblings.length === 1, `Expected one thread sibling, got ${siblings.length}`);
  assert(siblings[0].id === optimisticReply.id, 'Expected optimistic reply to show in the current thread');
}

function run() {
  testPrimaryConversationViewIncludesInboxSentAndDrafts();
  testSentViewIncludesOptimisticSentMail();
  testStarredViewShowsOnlyStarredPrimaryMails();
  testThreadViewIncludesOptimisticReply();
  console.log('mail-threading tests passed');
}

run();
