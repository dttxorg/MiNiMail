import { folderKindFromPath, getFolderCandidateNames, resolveFolderPath } from '../src/shared/mailFolders';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testGmailSpamFolderIsRecognized() {
  assert(folderKindFromPath('[Gmail]/Spam') === 'spam', 'Expected Gmail spam folder to be recognized');
  assert(folderKindFromPath('[Gmail]/Junk') === 'spam', 'Expected Gmail junk folder to be recognized');
  assert(folderKindFromPath('[Gmail]/垃圾邮件') === 'spam', 'Expected localized Chinese Gmail spam folder to be recognized');
  assert(folderKindFromPath('[Gmail]/迷惑メール') === 'spam', 'Expected localized Japanese Gmail spam folder to be recognized');
}

function testOutlookJunkEmailFolderIsRecognized() {
  assert(folderKindFromPath('Junk Email') === 'spam', 'Expected Outlook Junk Email folder to be recognized');
  assert(folderKindFromPath('Junk E-mail') === 'spam', 'Expected Outlook Junk E-mail folder to be recognized');
}

function testSpamFolderResolutionPrefersServerPath() {
  const resolved = resolveFolderPath([
    { name: 'Inbox', path: 'INBOX' },
    { name: 'Spam', path: '[Gmail]/Spam' },
  ], 'spam');

  assert(resolved === '[Gmail]/Spam', 'Expected spam folder resolution to use the server spam path');
}

function testSpamCandidatesCoverCommonProviders() {
  const candidates = getFolderCandidateNames('spam');
  assert(candidates.includes('[Gmail]/Spam'), 'Expected spam candidates to include Gmail spam');
  assert(candidates.includes('[Gmail]/垃圾邮件'), 'Expected spam candidates to include localized Chinese Gmail spam');
  assert(candidates.includes('[Gmail]/迷惑メール'), 'Expected spam candidates to include localized Japanese Gmail spam');
  assert(candidates.includes('Junk Email'), 'Expected spam candidates to include Outlook junk email');
}

function run() {
  testGmailSpamFolderIsRecognized();
  testOutlookJunkEmailFolderIsRecognized();
  testSpamFolderResolutionPrefersServerPath();
  testSpamCandidatesCoverCommonProviders();
  console.log('mail-folders tests passed');
}

run();
