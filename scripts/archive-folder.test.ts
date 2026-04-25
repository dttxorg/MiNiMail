import { folderKindFromPath, resolveFolderPath } from '../src/shared/mailFolders';
import { getVisibleFolderEmails } from '../src/renderer/utils/mailThreading';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testFolderKindRecognizesArchive() {
  assert(folderKindFromPath('Archive') === 'archive', 'Expected Archive folder to normalize to archive');
  assert(folderKindFromPath('[Gmail]/All Mail') === 'archive', 'Expected Gmail All Mail to normalize to archive');
}

function testResolveFolderPathPrefersArchiveCandidates() {
  const path = resolveFolderPath([
    { path: 'INBOX' },
    { path: '[Gmail]/All Mail' },
  ], 'archive');
  assert(path === '[Gmail]/All Mail', 'Expected archive folder resolver to choose Gmail All Mail');
}

function testVisibleFolderEmailsExcludeArchiveFromPrimaryView() {
  const mails = [
    {
      id: '1',
      uid: 1,
      from: 'a@example.com',
      fromName: 'A',
      to: 'me@example.com',
      subject: 'Inbox',
      date: new Date('2026-04-12T10:00:00Z'),
      snippet: '',
      hasAttachments: false,
      isRead: false,
      isStarred: false,
      folder: 'INBOX',
      accountId: 1,
    },
    {
      id: '2',
      uid: 2,
      from: 'a@example.com',
      fromName: 'A',
      to: 'me@example.com',
      subject: 'Archived',
      date: new Date('2026-04-12T09:00:00Z'),
      snippet: '',
      hasAttachments: false,
      isRead: true,
      isStarred: false,
      folder: 'Archive',
      accountId: 1,
    },
  ];

  const primary = getVisibleFolderEmails({
    selectedFolder: 'inbox',
    currentAccount: 'all',
    baseMails: mails,
    localThreadMails: [],
  });
  assert(primary.length === 1 && primary[0].id === '1', 'Expected primary view to exclude archived mail');

  const archived = getVisibleFolderEmails({
    selectedFolder: 'archive',
    currentAccount: 'all',
    baseMails: mails,
    localThreadMails: [],
  });
  assert(archived.length === 1 && archived[0].id === '2', 'Expected archive view to include archived mail');
}

function run() {
  testFolderKindRecognizesArchive();
  testResolveFolderPathPrefersArchiveCandidates();
  testVisibleFolderEmailsExcludeArchiveFromPrimaryView();
  console.log('archive-folder tests passed');
}

run();
