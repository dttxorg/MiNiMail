import fs from 'node:fs';
import path from 'node:path';
import { filterMailsBySearchQuery, getMailSearchMatchPreview } from '../src/renderer/utils/mailSearch.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Mail = {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
  _bodyText?: string;
  _bodyHtml?: string;
};

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function makeMail(overrides: Partial<Mail>): Mail {
  return {
    id: 'mail-1',
    subject: 'Weekly report',
    from: 'sender@example.com',
    fromName: 'Sender',
    snippet: 'Short preview',
    ...overrides,
  };
}

function testBodyTextIsSearchable() {
  const mails = [
    makeMail({ id: 'body-text', bodyText: 'The verification code is phoenix-42.' }),
    makeMail({ id: 'other', subject: 'Invoice reminder' }),
  ];

  const results = filterMailsBySearchQuery(mails, 'phoenix-42');
  assert(results.length === 1 && results[0].id === 'body-text', 'Expected bodyText content to be searchable');
}

function testCachedPrefetchedBodyTextIsSearchable() {
  const mails = [
    makeMail({ id: 'cached-body', _bodyText: 'Cached full body mentions Browserbase playground.' }),
    makeMail({ id: 'other', subject: 'General update' }),
  ];

  const results = filterMailsBySearchQuery(mails, 'browserbase playground');
  assert(results.length === 1 && results[0].id === 'cached-body', 'Expected prefetched cached body text to be searchable');
}

function testHtmlBodyIsSearchableAfterStrippingMarkup() {
  const mails = [
    makeMail({ id: 'html-body', bodyHtml: '<div><strong>Account password</strong> generated successfully.</div>' }),
    makeMail({ id: 'other', subject: 'Marketing update' }),
  ];

  const results = filterMailsBySearchQuery(mails, 'generated successfully');
  assert(results.length === 1 && results[0].id === 'html-body', 'Expected HTML body text to be searchable after stripping markup');
}

function testBodyMatchPreviewUsesExcerptAroundMatch() {
  const preview = getMailSearchMatchPreview(
    makeMail({
      bodyText: 'Opening sentence. Hidden token sits in the middle of the cached message body. Closing sentence.',
    }),
    'cached message',
  );

  assert(preview?.field === 'body', 'Expected body match preview to report body field');
  assert(preview?.text.includes('cached message body'), 'Expected body match preview excerpt to include the hit');
  assert(preview?.matchEnd && preview.matchEnd > preview.matchStart, 'Expected body match preview to include highlight boundaries');
}

function testMailListUsesSharedBodySearchHelper() {
  const mailList = read('src/renderer/components/MailList.tsx');
  assert(mailList.includes("from '../utils/mailSearch';"), 'Expected MailList to import shared search helpers');
  assert(mailList.includes('const searchedEmails = filterMailsBySearchQuery(filteredEmails, searchQuery);'), 'Expected MailList search to include body-aware helper');
  assert(mailList.includes('搜索邮件 / 发件人 / 主题 / 正文'), 'Expected search placeholder to mention body search');
  assert(mailList.includes('renderHighlightedText(previewText, searchQuery)'), 'Expected MailList to highlight search hits inside preview text');
}

function run() {
  testBodyTextIsSearchable();
  testCachedPrefetchedBodyTextIsSearchable();
  testHtmlBodyIsSearchableAfterStrippingMarkup();
  testBodyMatchPreviewUsesExcerptAroundMatch();
  testMailListUsesSharedBodySearchHelper();
  console.log('mail-search-body tests passed');
}

run();
