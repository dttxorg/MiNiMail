import {
  buildServerMailIdentitySet,
  filterOutPersistedLocalThreadMails,
} from '../src/renderer/utils/localThreadMailState';
import type { RendererMailSummary } from '../src/renderer/hooks/useMail';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeMail(overrides: Partial<RendererMailSummary>): RendererMailSummary {
  return {
    id: overrides.id || '1',
    uid: overrides.uid || 1,
    from: overrides.from || 'sender@example.com',
    fromName: overrides.fromName || 'Sender',
    to: overrides.to || 'owner@example.com',
    subject: overrides.subject || 'Subject',
    date: overrides.date || new Date('2026-04-24T10:00:00.000Z'),
    snippet: overrides.snippet || 'snippet',
    hasAttachments: overrides.hasAttachments || false,
    isRead: overrides.isRead || false,
    isStarred: overrides.isStarred || false,
    folder: overrides.folder || 'INBOX',
    accountId: overrides.accountId || 1,
    category: overrides.category,
    messageId: overrides.messageId,
    inReplyTo: overrides.inReplyTo,
    references: overrides.references,
    bodyText: overrides.bodyText,
    bodyHtml: overrides.bodyHtml,
    deliveryState: overrides.deliveryState,
    deliveryError: overrides.deliveryError,
    localDraftKey: overrides.localDraftKey,
    quotedBodyHtml: overrides.quotedBodyHtml,
    quotedBodyText: overrides.quotedBodyText,
    headers: overrides.headers,
    scanResult: overrides.scanResult,
    isScanned: overrides.isScanned,
  };
}

function testFilterOutPersistedLocalThreadMailsRemovesServerDuplicates() {
  const localMails = [
    makeMail({ id: 'local-1', accountId: 1, messageId: '<msg-1@example.com>' }),
    makeMail({ id: 'local-2', accountId: 1, messageId: '<msg-2@example.com>' }),
  ];
  const serverMails = [
    makeMail({ id: 'server-1', accountId: 1, messageId: '<msg-1@example.com>' }),
  ];

  const identitySet = buildServerMailIdentitySet(serverMails);
  const filtered = filterOutPersistedLocalThreadMails(localMails, identitySet);

  assert(filtered.length === 1, 'Expected duplicate local mail to be removed once it exists on the server');
  assert(filtered[0]?.id === 'local-2', 'Expected only non-duplicated local mail to remain');
}

function testFilterOutPersistedLocalThreadMailsReturnsSameReferenceWhenNothingChanges() {
  const localMails = [
    makeMail({ id: 'local-1', accountId: 1, messageId: '<msg-1@example.com>' }),
  ];
  const identitySet = buildServerMailIdentitySet([
    makeMail({ id: 'server-2', accountId: 1, messageId: '<msg-2@example.com>' }),
  ]);

  const filtered = filterOutPersistedLocalThreadMails(localMails, identitySet);

  assert(filtered === localMails, 'Expected unchanged local thread mail arrays to preserve reference stability');
}

function run() {
  testFilterOutPersistedLocalThreadMailsRemovesServerDuplicates();
  testFilterOutPersistedLocalThreadMailsReturnsSameReferenceWhenNothingChanges();
  console.log('local thread mail state tests passed');
}

run();
