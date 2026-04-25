import { resolveDisplayedMail } from '../src/renderer/utils/mailSelection';

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

type MailDetail = MailSummary & {
  bodyText?: string;
  bodyHtml?: string;
  attachments: [];
  headers: Record<string, string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const summaryA: MailSummary = {
  id: 'mail-a',
  uid: 1,
  accountId: 1,
  from: 'a@example.com',
  fromName: 'A',
  to: 'me@example.com',
  subject: 'Mail A',
  date: new Date('2026-04-12T12:00:00Z'),
  snippet: 'summary-a',
  hasAttachments: false,
  isRead: false,
  isStarred: false,
  folder: 'INBOX',
};

const detailA: MailDetail = {
  ...summaryA,
  bodyText: 'body-a',
  attachments: [],
  headers: {},
};

const summaryB: MailSummary = {
  ...summaryA,
  id: 'mail-b',
  uid: 2,
  subject: 'Mail B',
  snippet: 'summary-b',
};

function testKeepsDetailWhenItMatchesSelection() {
  const resolved = resolveDisplayedMail(summaryA, detailA);
  assert(resolved === detailA, 'Expected matching currentMail detail to be displayed');
}

function testFallsBackToSelectedSummaryWhenDetailIsStale() {
  const resolved = resolveDisplayedMail(summaryB, detailA);
  assert(resolved === summaryB, 'Expected stale currentMail to be ignored in favor of selected summary');
}

function run() {
  testKeepsDetailWhenItMatchesSelection();
  testFallsBackToSelectedSummaryWhenDetailIsStale();
  console.log('mail-selection tests passed');
}

run();
