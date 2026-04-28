const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function extractHandleSendMailSource() {
  const app = read('src/renderer/App.tsx');
  const start = app.indexOf('const handleSendMail = async');
  const end = app.indexOf('const handleSaveAttempt', start);
  assert(start >= 0 && end > start, 'handleSendMail source should be discoverable');
  return app.slice(start, end);
}

function testSendStartsAsScheduledAndDoesNotCallSmtpImmediately() {
  const source = extractHandleSendMailSource();
  const cacheIndex = source.indexOf("window.electronAPI.invoke('mail:cacheLocal'");
  const timerIndex = source.indexOf('timer = setTimeout');
  const scheduledTaskIndex = source.indexOf('const runScheduledSend = async');
  const sendIndex = source.indexOf("window.electronAPI.invoke('mail:send'");

  assert(source.includes("deliveryState: 'scheduled'"), 'send flow should create scheduled local record first');
  assert(source.includes("getResolvedFolderPath(options.accountId, 'sent')"), 'initial scheduling should use sync folder resolution');
  assert(!source.includes("await resolveFolderPathForAction(options.accountId, 'sent')"), 'initial scheduling must not await folder lookup before closing compose');
  assert(source.includes('SEND_UNDO_DELAY_MS'), 'send flow should use a named undo delay constant');
  assert(source.includes('response?.success === false'), 'local cache failure should be explicit before closing compose');
  assert(source.includes('draftPayload: scheduledDraftPayload'), 'scheduled record should persist restore payload for crash/restart recovery');
  assert(cacheIndex >= 0, 'send flow should persist scheduled local record');
  assert(timerIndex > cacheIndex, 'undo timer should start after local scheduled record is cached');
  assert(sendIndex > scheduledTaskIndex, 'SMTP send must live inside the scheduled send task');
  assert(source.includes('void runScheduledSend()'), 'undo timer should trigger the scheduled send task after the delay');
}

function testUndoActionIsExposedThroughToast() {
  const toast = read('src/renderer/components/Toast.tsx');
  const app = extractHandleSendMailSource();

  assert(toast.includes('actionLabel?: string'), 'ToastData should support an action label');
  assert(toast.includes('onAction?: () => void'), 'ToastData should support an action callback');
  assert(app.includes('actionLabel: appUi.sendUndoAction'), 'scheduled send toast should expose undo action');
  assert(app.includes('onAction: () => cancelScheduledSend()'), 'scheduled send toast should call cancelScheduledSend');
}

function testUndoCancelsTimerAndRestoresComposeWithoutSmtp() {
  const source = extractHandleSendMailSource();
  const cancelIndex = source.indexOf('const cancelScheduledSend = async');
  const sendIndex = source.indexOf("window.electronAPI.invoke('mail:send'", cancelIndex);
  const timerClearIndex = source.indexOf('clearTimeout(timer)', cancelIndex);

  assert(cancelIndex >= 0, 'send flow should define cancelScheduledSend');
  assert(timerClearIndex > cancelIndex, 'undo should clear the scheduled timer');
  assert(source.includes("deliveryState: 'cancelled'"), 'undo should mark the local send as cancelled');
  assert(source.includes('setComposeRestoreDraft({'), 'undo should restore compose content');
  assert(
    sendIndex < 0 || sendIndex > source.indexOf('const runScheduledSend = async', cancelIndex),
    'undo path must not call SMTP',
  );
}

function testStateMachinePersistsLocalSendIdentity() {
  const app = read('src/renderer/App.tsx');
  const useMail = read('src/renderer/hooks/useMail.ts');
  const mainMail = read('src/main/services/mail.ts');
  const mailService = read('src/main/services/mailService.ts');
  const cacheQuery = read('src/shared/mailCacheQuery.ts');

  assert(app.includes('localSendId'), 'App should assign a localSendId to scheduled sends');
  assert(useMail.includes('localSendId?: string'), 'renderer mail type should expose localSendId');
  assert(mainMail.includes('localSendId?: string'), 'main mail type should expose localSendId');
  assert(mailService.includes('local_send_id'), 'mail cache should persist local_send_id');
  assert(cacheQuery.includes('local_send_id'), 'mail list query should return local_send_id');
}

function testScheduledStartupDoesNotSilentlySend() {
  const app = read('src/renderer/App.tsx');
  assert(app.includes('activeScheduledSendsRef'), 'App should track currently active scheduled sends');
  assert(app.includes('staleScheduledSendIdsRef'), 'App should avoid repeatedly cancelling stale scheduled records');
  assert(app.includes("mail.deliveryState === 'scheduled'"), 'App should detect scheduled records');
  assert(app.includes('buildRecoveredDraftFromScheduledMail'), 'stale scheduled records should be converted back to drafts');
  assert(app.includes("getResolvedFolderPath(mail.accountId, 'drafts')"), 'stale scheduled records should restore into the drafts folder');
  assert(app.includes("window.electronAPI.invoke('mail:deleteCachedById', mail.id)"), 'stale scheduled sent record should be removed after draft recovery');
  assert(app.includes("mail.deliveryState === 'scheduled'") && !app.includes("mail.deliveryState !== 'sent' && !activeScheduledSendsRef"), 'sent/succeeded records must not be eligible for scheduled draft recovery');
}

function testDeliveredSendDoesNotRemainDraftRecoverable() {
  const source = extractHandleSendMailSource();
  const deliveredStart = source.indexOf('const deliveredMail: RendererMailSummary = {');
  const deliveredEnd = source.indexOf('setLocalThreadMails((prev) =>', deliveredStart);
  assert(deliveredStart >= 0 && deliveredEnd > deliveredStart, 'delivered sent mail block should be discoverable');

  const deliveredBlock = source.slice(deliveredStart, deliveredEnd);
  assert(deliveredBlock.includes("deliveryState: 'sent'"), 'delivered optimistic mail should be marked sent');
  assert(deliveredBlock.includes('localDraftKey: undefined,'), 'delivered optimistic mail should not keep localDraftKey');
  assert(deliveredBlock.includes('draftPayload: undefined,'), 'delivered optimistic mail should not keep draftPayload that would reload as a draft');
  assert(source.includes("window.electronAPI.invoke('mail:deleteCachedDraft'"), 'successful send should delete drafts through structured draft identity');
  assert(source.includes("window.electronAPI.invoke(\n            'mail:delete'"), 'successful send should also delete selected server draft when one was used');
  assert(source.includes('sourceDraftTokens'), 'successful send should hide selected server draft identity from local draft lists');
}

function testFailedSendKeepsDraftAndRecoverablePayload() {
  const source = extractHandleSendMailSource();
  const failureStart = source.indexOf('if (!result.success) {');
  const failureEnd = source.indexOf('\n      }\n\n      activeScheduledSendsRef.current.delete(localSendId);', failureStart);
  assert(failureStart >= 0 && failureEnd > failureStart, 'failed send block should be discoverable');

  const failureBlock = source.slice(failureStart, failureEnd);
  assert(failureBlock.includes("deliveryState: 'failed'"), 'failed send should persist failed delivery state');
  assert(failureBlock.includes('...optimisticMail'), 'failed send should preserve scheduled metadata including attachments');
  assert(failureBlock.includes('bodyText: options.bodyText'), 'failed send should preserve plain text body');
  assert(failureBlock.includes('bodyHtml: options.bodyHtml'), 'failed send should preserve HTML body');
  assert(failureBlock.includes('await cacheLocalMail(failedMail)'), 'failed send should persist the failed local record');
  assert(!failureBlock.includes("mail:deleteCachedDraft"), 'failed send must not delete the draft identity');
  assert(!failureBlock.includes("mail:delete'"), 'failed send must not delete a server draft');
}

function testComposePassesEditableBodyForUndoRestore() {
  const compose = read('src/renderer/components/ComposeDialog.tsx');
  assert(compose.includes('editableBody: string'), 'ComposeDialog onSend payload should include editableBody');
  assert(compose.includes('editableBody: body'), 'ComposeDialog should pass editable editableBody before quoted original');
  assert(compose.includes('activeDraftSource'), 'ComposeDialog should track selected draft source identity');
  assert(compose.includes('sourceDraft: activeDraftSource'), 'ComposeDialog should pass selected draft source identity to send flow');
}

testSendStartsAsScheduledAndDoesNotCallSmtpImmediately();
testUndoActionIsExposedThroughToast();
testUndoCancelsTimerAndRestoresComposeWithoutSmtp();
testStateMachinePersistsLocalSendIdentity();
testScheduledStartupDoesNotSilentlySend();
testDeliveredSendDoesNotRemainDraftRecoverable();
testFailedSendKeepsDraftAndRecoverablePayload();
testComposePassesEditableBodyForUndoRestore();

console.log('mail send undo regression tests passed');
