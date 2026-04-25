import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testUnsentDraftsDoNotJoinNormalConversationThread() {
  const app = read('src/renderer/App.tsx');
  const viewModel = read('src/renderer/utils/mailListViewModel.ts');

  assert(app.includes('function isDraftMailForDisplay'), 'Expected App to define a broad draft display guard');
  assert(app.includes('function filterDraftsForSelectedFolder'), 'Expected App to define a selected-folder draft filter');
  assert(app.includes("if (selectedFolder === 'drafts') return mails;"), 'Expected draft folder to keep draft rows visible');
  assert(viewModel.includes('const visibleNonDraftFolderEmails = filterDraftsForSelectedFolder(visibleFolderEmails, selectedFolder);'), 'Expected normal list source to filter drafts before rendering inside the consolidated view model');
  assert(app.includes('const selectedIsDraft = isUnsentDraftMail(selectedMailForThread);'), 'Expected selected draft state to be detected before building thread siblings');
  assert(app.includes('safeThreadSource'), 'Expected conversation thread source to be filtered through a safe source');
  assert(app.includes('threadSource.filter((mail) => !isUnsentDraftMail(mail))'), 'Expected unsent drafts to be excluded from normal thread siblings');
  assert(app.includes('.filter((mail) => selectedIsDraft || !isUnsentDraftMail(mail))'), 'Expected final conversation messages to keep drafts only when the selected item is a draft');
}

function testRichTranslationFallsBackToPlainTextHtml() {
  const detail = read('src/renderer/components/MailDetail.tsx');
  const htmlTranslator = read('src/shared/email-ai/translateHtmlPreservingMarkup.ts');

  assert(detail.includes('function plainTextToMailHtml'), 'Expected plain translation fallback to be wrapped as HTML');
  assert(htmlTranslator.includes('translateSegmentBatchSafely'), 'Expected HTML translator to retry failed segment batches safely');
  assert(htmlTranslator.includes('return values;'), 'Expected failed single segment translation to keep source text instead of throwing');
  assert(detail.includes('translatePlainTextFallback'), 'Expected rich translation catch to reuse the plain-text fallback path');
  assert(detail.includes('falling back to plain text translation'), 'Expected rich translation catch to degrade to plain text instead of abandoning translation');
  assert(detail.includes('const fallbackHtml = await translatePlainTextFallback();'), 'Expected failed rich translation to render the fallback translated HTML');
  assert(!detail.includes('setTranslatedHtml(loadedSource.bodyHtml);'), 'Expected rich translation catch not to mark the original HTML as a translated result');
  assert(!detail.includes("aiFunction === 'translate' && aiResult ?"), 'Expected translation fallback not to render a separate raw pre block');
}

function testComposeDraftDeletionMatchesDraftIdentity() {
  const app = read('src/renderer/App.tsx');
  const mailService = read('src/main/services/mailService.ts');
  const compose = read('src/renderer/components/ComposeDialog.tsx');

  assert(app.includes('const [deletedComposeDraftTokens, setDeletedComposeDraftTokens] = useState<string[]>([]);'), 'Expected App to track deleted compose drafts outside the global mail list');
  assert(app.includes('const handleDeleteComposeDraft = useCallback((draftId: string, draft?: ComposeDraftOption) => {'), 'Expected compose draft deletion to return immediately instead of awaiting network work');
  assert(app.includes('const draftKey = draft?.draftKey || getDraftKeyFromMailId(draftId);'), 'Expected draft deletion to derive the stable draft key from draft metadata first');
  assert(app.includes('const draftMessageId = getLocalDraftMessageId(draftKey);'), 'Expected draft deletion to match local draft message id');
  assert(app.includes('const draftTokens = new Set([draftId, draftKey, draftMessageId,'), 'Expected draft deletion to build one stable identity token set');
  assert(app.includes('setDeletedComposeDraftTokens((prev) => Array.from(new Set([...prev, ...draftTokens])));'), 'Expected deleted drafts to be hidden through a lightweight token set');
  assert(app.includes('setMailList((prev) => prev.filter((mail) => !matchesComposeDraftToken(mail, draftTokens)));'), 'Expected deleting a compose draft to immediately remove cached draft rows from the visible mail list');
  assert(app.includes('setLocalThreadMails((prev) => prev.filter((mail) => !matchesComposeDraftToken(mail, draftTokens)));'), 'Expected deleting a compose draft to remove matching local thread rows');
  assert(app.includes('token !== draftOption.id && token !== draftOption.draftKey && token !== (draftOption.messageId || \'\')'), 'Expected saving a draft to clear any hidden-token state for that draft');
  assert(compose.includes('await onDeleteDraft(draft.id, draft);'), 'Expected compose draft deletion to pass source metadata to App');
  assert(app.includes('if (!draft?.localOnly && draft?.uid != null && draft.folder)'), 'Expected App to distinguish server drafts from local-only drafts');
  assert(app.includes('const cleanupTasks: Promise<unknown>[] = ['), 'Expected draft deletion to batch cleanup tasks');
  assert(app.includes('Promise.allSettled(cleanupTasks)'), 'Expected draft deletion cleanup to run in the background without blocking the UI');
  assert(app.includes("window.electronAPI.invoke('mail:delete', draft.accountId, draft.uid, draft.folder)"), 'Expected server-backed draft deletion to still delete the IMAP draft too');
  assert(mailService.includes('const localDraftId = resolveLocalDraftId({ id, localDraftId: id });'), 'Expected cached draft deletion to resolve a stable draft key');
  assert(mailService.includes('WHERE local_draft_id = ?'), 'Expected cached draft deletion to use exact local_draft_id matching');
  assert(!mailService.includes('id LIKE ?'), 'Expected cached draft deletion not to use fuzzy matching for colon-bearing ids');
}

function testComposeDraftSavingDoesNotEnterGlobalMailUniverse() {
  const app = read('src/renderer/App.tsx');
  const viewModel = read('src/renderer/utils/mailListViewModel.ts');

  assert(app.includes("const nonDraftMailList = useMemo("), 'Expected App to derive a draft-free main mail list');
  assert(app.includes("() => mailList.filter((mail) => !isUnsentDraftMail(mail))"), 'Expected main mail list to exclude unsent drafts');
  assert(app.includes("const nonDraftLocalThreadMails = useMemo("), 'Expected App to derive draft-free local thread mails');
  assert(app.includes("() => localThreadMails.filter((mail) => !isUnsentDraftMail(mail))"), 'Expected local thread mails to exclude unsent drafts');
  assert(viewModel.includes('const threadMailUniverse = buildThreadMailUniverse(nonDraftMailList, nonDraftLocalThreadMails);'), 'Expected thread universe to be built from draft-free mail sources');
  assert(viewModel.includes('baseMails: nonDraftMailList,'), 'Expected visible folder filtering to use the draft-free base list');
  assert(viewModel.includes('localThreadMails: nonDraftLocalThreadMails,'), 'Expected visible folder filtering to use the draft-free local thread list');
  assert(app.includes('if (nonDraftMailList.length === 0) return;'), 'Expected AI batch analysis to ignore compose drafts entirely');
  assert(app.includes('return nonDraftMailList.filter((mail) =>'), 'Expected AI eligibility to be derived from draft-free mails');
  assert(app.includes('() => autoAnalysisEligibleMails.map((mail) => mail.id)'), 'Expected auto-analysis ids to reuse the draft-free eligible mail memo');
  assert(app.includes('...nonDraftMailList,'), 'Expected compose recipient suggestions to avoid draft-only mails');
  assert(!app.includes("setMailList((prev) => {\r\n      const filtered = prev.filter((mail) => mail.id !== draftMail.id);\r\n      return [draftMail, ...filtered];\r\n    });"), 'Expected save draft to stop inserting local drafts into the global mail list');
  const saveDraftCacheIndex = app.lastIndexOf("const response = await window.electronAPI.invoke('mail:cacheLocal', {");
  const saveDraftStateIndex = app.indexOf('setLocalComposeDrafts((prev) => {', saveDraftCacheIndex);
  assert(saveDraftCacheIndex >= 0, 'Expected draft cache persistence to finish before the draft is considered saved');
  assert(saveDraftStateIndex > saveDraftCacheIndex, 'Expected local draft UI state to update only after cache persistence succeeds');
  assert(app.includes("console.error('[composeDraft] failed to persist local draft cache', error);"), 'Expected draft cache persistence failures to be surfaced and logged');
}

function testComposeDialogHasStableDragRegions() {
  const compose = read('src/renderer/components/ComposeDialog.tsx');

  assert(compose.includes('[-webkit-app-region:drag]'), 'Expected compose modal shell/header to provide a draggable region');
  assert(compose.includes('[-webkit-app-region:no-drag]'), 'Expected compose controls and editable regions to remain interactive');
  assert(compose.includes('px-7 py-5 space-y-4 [-webkit-app-region:no-drag]'), 'Expected form controls to be protected from drag-region capture');
  assert(compose.includes('px-7 pb-6 [-webkit-app-region:no-drag]'), 'Expected body and quoted original area to stay editable/clickable when expanded');
}

function run() {
  testUnsentDraftsDoNotJoinNormalConversationThread();
  testRichTranslationFallsBackToPlainTextHtml();
  testComposeDraftDeletionMatchesDraftIdentity();
  testComposeDraftSavingDoesNotEnterGlobalMailUniverse();
  testComposeDialogHasStableDragRegions();
  console.log('mail compose translation draft regression tests passed');
}

run();
