import { readFileSync } from 'node:fs';
import { buildMailListViewModel } from '../src/renderer/utils/mailListViewModel';
import { getVisibleFolderEmails, type ThreadableMail } from '../src/renderer/utils/mailThreading';
import {
  collectRemovedMailIdsForDeletedTarget,
  shouldRemoveMailForDeletedTarget,
} from '../src/renderer/utils/mailRemoval';
import type { RendererMailSummary } from '../src/renderer/hooks/useMail';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createMail(overrides: Partial<RendererMailSummary> = {}): RendererMailSummary {
  return {
    id: overrides.id || '1:<mail@example.com>',
    uid: overrides.uid ?? 101,
    from: overrides.from || 'sender@example.com',
    fromName: overrides.fromName || 'Sender',
    to: overrides.to || 'me@example.com',
    subject: overrides.subject || 'Message',
    date: overrides.date || new Date('2026-04-20T08:00:00Z'),
    snippet: overrides.snippet || 'Snippet',
    hasAttachments: overrides.hasAttachments ?? false,
    isRead: overrides.isRead ?? true,
    isStarred: overrides.isStarred ?? false,
    folder: overrides.folder || 'INBOX',
    accountId: overrides.accountId ?? 1,
    category: overrides.category,
    isScanned: overrides.isScanned,
    scanResult: overrides.scanResult,
    messageId: overrides.messageId,
    inReplyTo: overrides.inReplyTo,
    references: overrides.references,
    localSendId: overrides.localSendId,
    deliveryState: overrides.deliveryState,
    deliveryError: overrides.deliveryError,
    localDraftKey: overrides.localDraftKey,
    draftPayload: overrides.draftPayload,
    bodyText: overrides.bodyText,
    bodyHtml: overrides.bodyHtml,
    attachments: overrides.attachments,
  };
}

function testAiCategoryDoesNotShowTrashMail() {
  const active = createMail({
    id: 'active-work',
    category: 'work',
    folder: 'INBOX',
  });
  const trashed = createMail({
    id: 'trashed-work',
    category: 'work',
    folder: 'Trash',
  });

  const visible = getVisibleFolderEmails({
    selectedFolder: 'work',
    currentAccount: { id: 1 },
    baseMails: [active, trashed] as ThreadableMail[],
    localThreadMails: [],
    aiCategoryIds: ['work'],
  });

  assert(visible.some((mail) => mail.id === active.id), 'Expected active categorized mail to remain visible');
  assert(!visible.some((mail) => mail.id === trashed.id), 'Deleted/trash mail must not remain in AI category views');
}

function testSmartFoldersDoNotRouteTrashMail() {
  const activeGithub = createMail({
    id: 'active-github',
    folder: 'INBOX',
    scanResult: 'GitHub/Security',
  });
  const trashedGithub = createMail({
    id: 'trashed-github',
    folder: 'Trash',
    scanResult: 'GitHub/Security',
  });
  const trashedPriority = createMail({
    id: 'trashed-priority',
    folder: 'Trash',
    scanResult: 'Priority/High',
  });

  const viewModel = buildMailListViewModel({
    selectedFolder: 'GitHub/Security',
    currentAccount: { id: 1, email: 'me@example.com' },
    accounts: [{ email: 'me@example.com' }],
    nonDraftMailList: [activeGithub, trashedGithub, trashedPriority],
    nonDraftLocalThreadMails: [],
    mailRoutingResults: [],
    githubNotificationsViewEnabled: true,
    aiCategoryIds: ['work'],
  });

  assert(viewModel.githubFolderCounts['GitHub/Security'] === 1, 'Trash GitHub mail must not be counted');
  assert(viewModel.folderEmails.some((mail) => mail.id === activeGithub.id), 'Expected active GitHub mail in folder');
  assert(!viewModel.folderEmails.some((mail) => mail.id === trashedGithub.id), 'Trash GitHub mail must not be listed');
  assert(viewModel.priorityFolderCounts['Priority/High'] === 0, 'Trash priority mail must not be counted');
}

function testDeleteFlowWaitsForRemoteSuccessBeforeClearingLocalState() {
  const source = readFileSync('src/renderer/App.tsx', 'utf8');
  const moveBlockStart = source.indexOf("if (action.type === 'move')");
  const moveTryStart = source.indexOf('try {', moveBlockStart);
  const moveBlockEnd = source.indexOf('    }', source.indexOf('      } catch (err)', moveTryStart));
  const moveBlock = source.slice(moveBlockStart, moveBlockEnd);
  const hardDeleteBlockStart = source.indexOf("const result = await window.electronAPI.invoke('mail:delete'");
  const hardDeleteBlock = source.slice(hardDeleteBlockStart, source.indexOf('  }, [', hardDeleteBlockStart));

  assert(
    !source.slice(moveBlockStart, moveTryStart).includes('removeMailFromState('),
    'Delete-to-trash must not remove renderer state before remote/cache work succeeds',
  );
  assert(
    moveBlock.indexOf("window.electronAPI.invoke('mail:move'") < moveBlock.indexOf('removeMailFromState(target)'),
    'Delete-to-trash must wait for remote move before removing local views',
  );
  assert(
    hardDeleteBlock.indexOf("window.electronAPI.invoke('mail:delete'") < hardDeleteBlock.indexOf('removeMailFromState(target)'),
    'Permanent remote delete must wait for server/cache delete before removing local views',
  );
  assert(
    hardDeleteBlock.indexOf("window.electronAPI.invoke('mail:deleteCachedById', target.id)") < hardDeleteBlock.indexOf('clearBodyCacheEntry('),
    'Body cache must only be cleared after cached metadata delete succeeds',
  );
}

function testSameAccountSameMessageIdRemoval() {
  const deleted = createMail({
    id: 'local-sent-1',
    accountId: 1,
    messageId: '<same-message@example.com>',
  });
  const imapDuplicate = createMail({
    id: 'imap-sent-999',
    accountId: 1,
    uid: 999,
    messageId: 'same-message@example.com',
  });
  const otherAccountSameMessageId = createMail({
    id: 'other-account-copy',
    accountId: 2,
    messageId: '<same-message@example.com>',
  });

  assert(shouldRemoveMailForDeletedTarget(deleted, deleted), 'Deleted target should remove itself');
  assert(
    shouldRemoveMailForDeletedTarget(imapDuplicate, deleted),
    'Same-account sent optimistic/IMAP duplicates with same Message-ID must be removed together',
  );
  assert(
    !shouldRemoveMailForDeletedTarget(otherAccountSameMessageId, deleted),
    'Same Message-ID in another account must not be removed',
  );

  const removedIds = collectRemovedMailIdsForDeletedTarget(
    [deleted, imapDuplicate, otherAccountSameMessageId],
    deleted,
  );
  assert(removedIds.has(deleted.id), 'Expected deleted id in removal set');
  assert(removedIds.has(imapDuplicate.id), 'Expected same-account duplicate id in removal set');
  assert(!removedIds.has(otherAccountSameMessageId.id), 'Other account duplicate must not be in removal set');
}

function run() {
  testAiCategoryDoesNotShowTrashMail();
  testSmartFoldersDoNotRouteTrashMail();
  testDeleteFlowWaitsForRemoteSuccessBeforeClearingLocalState();
  testSameAccountSameMessageIdRemoval();
  console.log('mail delete ghost regression tests passed');
}

run();
