import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testComposeDialogUsesAppLanguageForComposeLabels() {
  const compose = read('src/renderer/components/ComposeDialog.tsx');
  const i18n = read('src/renderer/i18n.ts');

  assert(!compose.includes('const composeUiByLanguage'), 'Expected ComposeDialog not to keep an inline multilingual label table');
  assert(compose.includes('const composeUi = useMemo(() => buildComposeUiLabels(t), [t, appLanguage]);'), 'Expected ComposeDialog to derive labels from shared i18n translator');
  assert(i18n.includes("composeTitle: '写邮件'"), 'Expected Chinese compose title label in i18n');
  assert(i18n.includes("composeTitle: 'Compose'"), 'Expected English compose title label in i18n');
  assert(i18n.includes("composeTitle: 'メール作成'"), 'Expected Japanese compose title label in i18n');
  assert(i18n.includes("composeTitle: '메일 작성'"), 'Expected Korean compose title label in i18n');
  assert(i18n.includes("composeTitle: 'Redactar'"), 'Expected Spanish compose title label in i18n');
  assert(i18n.includes("composeTitle: 'Nouveau mail'"), 'Expected French compose title label in i18n');
  assert(i18n.includes("composeTitle: 'Neue Nachricht'"), 'Expected German compose title label in i18n');
  assert(i18n.includes("composeTitle: 'Новое письмо'"), 'Expected Russian compose title label in i18n');
  assert(compose.includes('{composeUi.fromLabel}'), 'Expected compose From label to use localized composeUi');
  assert(compose.includes('{composeUi.toLabel}'), 'Expected compose To label to use localized composeUi');
  assert(compose.includes('{composeUi.aiAssistantLabel}'), 'Expected AI assistant label to use localized composeUi');
  assert(!compose.includes("t('newMail')"), 'Expected compose title not to rely on generic t(newMail)');
  assert(!compose.includes("t('from')"), 'Expected compose from label not to rely on generic t(from)');
  assert(!compose.includes("t('to')"), 'Expected compose to label not to rely on generic t(to)');
}

function testComposeDialogKeepsQuotedOriginalOutsideAiEdits() {
  const compose = read('src/renderer/components/ComposeDialog.tsx');

  assert(compose.includes('initialQuotedOriginal?: ComposeQuotedOriginal | null;'), 'Expected ComposeDialog to accept structured quoted original content');
  assert(compose.includes('const [currentQuotedOriginal, setCurrentQuotedOriginal] = useState<ComposeQuotedOriginal | null>(null);'), 'Expected ComposeDialog to keep the current draft quote in state');
  assert(compose.includes('setCurrentQuotedOriginal(initialQuotedOriginal || null);'), 'Expected ComposeDialog to initialize quote state when opened');
  assert(compose.includes('setCurrentQuotedOriginal(draft.quotedOriginal || null);'), 'Expected applying a draft to switch the quoted original too');
  assert(compose.includes('quotedOriginal: currentQuotedOriginal,'), 'Expected saved drafts to keep their matching quoted original');
  assert(compose.includes('const editableBodyForSend = stripSignatureMarkerBeforeSend(body);'), 'Expected sending to strip internal signature markers before send');
  assert(compose.includes('bodyText: buildComposeTextBody(editableBodyForSend, currentQuotedOriginal)'), 'Expected sending to merge cleaned editable body with the current quoted original at send time');
  assert(compose.includes('bodyHtml: currentQuotedOriginal ? buildComposeHtmlBody(editableBodyForSend, currentQuotedOriginal) : undefined'), 'Expected HTML send payload to include the current quoted original only at send time');
  assert(compose.includes('ai:polish'), 'Expected polish action to remain wired');
  assert(compose.includes("window.electronAPI.invoke('ai:translate', body"), 'Expected translate to operate only on editable body');
}

function testComposeDialogSupportsRecipientChipsAndScrollableSuggestions() {
  const compose = read('src/renderer/components/ComposeDialog.tsx');

  assert(compose.includes('initialRecipients?: ComposeRecipientOption[];'), 'Expected ComposeDialog to accept structured initial recipients');
  assert(compose.includes('recipientSuggestions?: ComposeRecipientOption[];'), 'Expected ComposeDialog to accept recipient suggestions');
  assert(compose.includes('filterRecipientSuggestions'), 'Expected ComposeDialog to filter recipient suggestions by user input');
  assert(compose.includes('max-h-[96px]'), 'Expected selected recipient chip area to have a max height');
  assert(compose.includes('overflow-y-auto'), 'Expected recipient chip area or suggestion list to be scrollable');
  assert(compose.includes('maxHeight: 248'), 'Expected recipient suggestion list to cap height');
  assert(compose.includes('overflow-visible'), 'Expected compose recipient field container to allow overlay suggestions without clipping');
}

function testComposeDialogSupportsDraftPickerAndSave() {
  const compose = read('src/renderer/components/ComposeDialog.tsx');
  const app = read('src/renderer/App.tsx');
  const composeDraft = read('src/renderer/utils/composeDraft.ts');
  const mailService = read('src/main/services/mailService.ts');
  const useMail = read('src/renderer/hooks/useMail.ts');

  assert(composeDraft.includes('quotedOriginal?: ComposeQuotedOriginal | null;'), 'Expected draft options to keep a matching quoted original');
  assert(composeDraft.includes('uid?: number;'), 'Expected draft options to retain source UID for server draft deletion');
  assert(composeDraft.includes('folder?: string;'), 'Expected draft options to retain source folder for server draft deletion');
  assert(composeDraft.includes('localOnly?: boolean;'), 'Expected draft options to distinguish local-only drafts from server drafts');
  assert(compose.includes('draftOptions?: ComposeDraftOption[];'), 'Expected ComposeDialog to accept draft options');
  assert(compose.includes('onDeleteDraft?: (draftId: string, draft?: ComposeDraftOption)'), 'Expected ComposeDialog to pass draft metadata when deleting drafts');
  assert(compose.includes('const handleSaveDraft = async () =>'), 'Expected ComposeDialog to save drafts from the footer');
  assert(compose.includes('max-h-[260px] overflow-y-auto'), 'Expected draft picker list to be scrollable');
  assert(compose.includes('composeUi.chooseDraftLabel'), 'Expected draft picker label to be localized');
  assert(app.includes('const [localComposeDrafts, setLocalComposeDrafts] = useState<ComposeDraftOption[]>([]);'), 'Expected App to maintain local compose drafts');
  assert(app.includes('draftOptions={composeDraftOptions}'), 'Expected App to pass compose drafts into ComposeDialog');
  assert(app.includes('onDeleteDraft={handleDeleteComposeDraft}'), 'Expected App to wire draft deletion into ComposeDialog');
  assert(app.includes('quotedOriginal: options.quotedOriginal || null,'), 'Expected App to store the matching quoted original with local drafts');
  assert(app.includes('draftPayload:'), 'Expected App to persist a structured draft payload for compose recovery');
  assert(app.includes('JSON.stringify({'), 'Expected App to serialize compose draft payload into cache');
  assert(app.includes('quotedOriginal: draftPayload?.quotedOriginal ?? null,'), 'Expected cached draft restore to recover quoted original from persisted payload');
  assert(app.includes('body: draftPayload?.body ?? mail.bodyText ?? mail.snippet,'), 'Expected cached draft restore to prefer persisted body over snippet fallback');
  assert(app.includes('recipients: draftPayload?.recipients'), 'Expected cached draft restore to prefer persisted recipients over derived fallback');
  assert(app.includes('localOnly: true,'), 'Expected locally saved drafts to be marked local-only');
  assert(app.includes("localOnly: Boolean(mail.localDraftKey) || mail.deliveryState === 'cancelled' || /^<draft-[^>]+@minimail>$/.test(mail.messageId || ''),"), 'Expected fallback draft entries to mark local drafts and cancelled scheduled sends as local-only');
  assert(app.includes("window.electronAPI.invoke('mail:delete', draft.accountId, draft.uid, draft.folder)"), 'Expected server draft deletion to still call the mail delete IPC with uid and folder');
  assert(mailService.includes('ALTER TABLE mail_cache ADD COLUMN draft_payload TEXT'), 'Expected mail cache schema to persist structured compose draft payload');
  assert(mailService.includes('draftPayload?: string;'), 'Expected stored mail shape to expose draft payload');
  assert(useMail.includes('draftPayload?: string;'), 'Expected renderer mail summary to carry draft payload from cache');
  assert(mailService.includes('ALTER TABLE mail_cache ADD COLUMN local_draft_id TEXT'), 'Expected mail cache schema to persist a stable local draft id');
  assert(mailService.includes('const localDraftId = resolveLocalDraftId({ id, localDraftId: id });'), 'Expected cached draft deletion to resolve only stable local draft ids');
  assert(mailService.includes('WHERE local_draft_id = ?'), 'Expected local draft deletion to use exact local_draft_id matching');
  assert(!mailService.includes('id LIKE ?'), 'Expected cached draft deletion to avoid fuzzy id matching');
}

function testComposeDialogOverallWindowCanScroll() {
  const compose = read('src/renderer/components/ComposeDialog.tsx');

  assert(compose.includes('items-start justify-center overflow-y-auto overflow-x-hidden px-4 py-6'), 'Expected compose overlay to allow full-window vertical scrolling');
  assert(compose.includes('max-h-[calc(100vh-48px)] overflow-y-auto overflow-x-hidden'), 'Expected compose modal shell to cap height and expose its own scrollbar');
}

function testComposeBodyTextareaHasSafeTextPadding() {
  const compose = read('src/renderer/components/ComposeDialog.tsx');

  assert(compose.includes('px-3 py-2'), 'Expected compose body textarea to have inner padding so the first character is not clipped');
  assert(compose.includes('leading-6'), 'Expected compose body textarea to use a stable line height');
}

function run() {
  testComposeDialogUsesAppLanguageForComposeLabels();
  testComposeDialogKeepsQuotedOriginalOutsideAiEdits();
  testComposeDialogSupportsRecipientChipsAndScrollableSuggestions();
  testComposeDialogSupportsDraftPickerAndSave();
  testComposeDialogOverallWindowCanScroll();
  testComposeBodyTextareaHasSafeTextPadding();
  console.log('compose-dialog-ai-regression tests passed');
}

run();
