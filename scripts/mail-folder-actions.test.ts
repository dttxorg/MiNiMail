import {
  applyMailReadState,
  resolveArchiveOrSpamRemovalAction,
  resolveArchiveMailAction,
  resolveDeleteMailAction,
  resolveMailActionTargetIds,
  shouldMarkMailReadOnOpen,
} from '../src/renderer/utils/mailFolderActions';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testDeleteMovesToTrashOutsideTrashFolder() {
  const result = resolveDeleteMailAction({
    id: '1',
    folder: 'INBOX',
  }, 'Trash');

  assert(result.type === 'move', 'Expected inbox delete to move mail to trash');
  assert(result.toFolder === 'Trash', 'Expected trash destination to be propagated');
}

function testDeletePurgesInsideTrashFolder() {
  const result = resolveDeleteMailAction({
    id: '2',
    folder: 'Trash',
  }, 'Trash');

  assert(result.type === 'delete', 'Expected trash delete to permanently delete');
}

function testArchiveTogglesToArchiveOutsideArchiveFolder() {
  const result = resolveArchiveMailAction({ id: '3', folder: 'INBOX' }, 'Archive', 'INBOX');
  assert(result.type === 'archive', 'Expected non-archive mail to archive');
  assert(result.toFolder === 'Archive', 'Expected archive destination to be propagated');
}

function testArchiveTogglesBackToInboxInsideArchiveFolder() {
  const result = resolveArchiveMailAction({ id: '4', folder: 'Archive' }, 'Archive', 'INBOX');
  assert(result.type === 'unarchive', 'Expected archive mail to be removed from archive');
  assert(result.toFolder === 'INBOX', 'Expected unarchive destination to return to inbox');
}

function testSpamRemovalMovesBackToInbox() {
  const result = resolveArchiveOrSpamRemovalAction({ id: '5', folder: '[Gmail]/垃圾邮件' }, 'Archive', 'INBOX');
  assert(result.type === 'unspam', 'Expected spam mail primary move action to remove it from spam');
  assert(result.toFolder === 'INBOX', 'Expected spam removal destination to return to inbox');
}

function testApplyMailReadStateOnlyTouchesSelectedIds() {
  const mails = [
    { id: '1', isRead: false, folder: 'INBOX' },
    { id: '2', isRead: true, folder: 'INBOX' },
  ];

  const updated = applyMailReadState(mails, new Set(['1']), true);
  assert(updated[0].isRead === true, 'Expected selected mail to be marked read');
  assert(updated[1].isRead === true, 'Expected unselected mail to remain unchanged');
}

function testOpenUnreadMailShouldMarkRead() {
  assert(shouldMarkMailReadOnOpen({ isRead: false }) === true, 'Expected unread mail to be marked read on open');
  assert(shouldMarkMailReadOnOpen({ isRead: true }) === false, 'Expected read mail to stay read without extra write');
}

function testContextMenuFallsBackToCurrentMailWhenNothingSelected() {
  const targetIds = resolveMailActionTargetIds([], 'mail-1');
  assert(targetIds.length === 1, 'Expected right-click actions to target the current mail');
  assert(targetIds[0] === 'mail-1', 'Expected right-click action to target the context menu mail id');
}

function run() {
  testDeleteMovesToTrashOutsideTrashFolder();
  testDeletePurgesInsideTrashFolder();
  testArchiveTogglesToArchiveOutsideArchiveFolder();
  testArchiveTogglesBackToInboxInsideArchiveFolder();
  testSpamRemovalMovesBackToInbox();
  testApplyMailReadStateOnlyTouchesSelectedIds();
  testOpenUnreadMailShouldMarkRead();
  testContextMenuFallsBackToCurrentMailWhenNothingSelected();
  console.log('mail-folder-actions tests passed');
}

run();
