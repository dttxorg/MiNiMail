const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const compose = read('src/renderer/components/ComposeDialog.tsx');
const app = read('src/renderer/App.tsx');
const releaseGate = read('scripts/test-release.cjs');

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert(start >= 0, `Missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, `Missing end marker: ${endNeedle}`);
  return source.slice(start, end);
}

function testComposeHydratesOnlyForNewSessionOrDraftSwitch() {
  assert(compose.includes('initialHydrateKey?: string;'), 'ComposeDialog should receive a stable hydrate key from App');
  assert(compose.includes('lastInitialHydrateKeyRef'), 'ComposeDialog should remember the last hydrated compose session');
  assert(compose.includes('lastInitialHydrateKeyRef.current === initialHydrateKey'), 'ComposeDialog should skip rehydration when only unrelated props/state changed');
  assert(app.includes('const [composeSessionId, setComposeSessionId] = useState(0);'), 'App should track compose session identity');
  assert(app.includes('const composeInitialHydrateKey = useMemo'), 'App should compute a stable compose hydrate key');
  assert(app.includes('initialHydrateKey={composeInitialHydrateKey}'), 'App should pass the hydrate key into ComposeDialog');
}

function testSubjectBodyAndAttachmentsDoNotResetRecipients() {
  const subjectInput = sliceBetween(compose, 'value={subject}', 'placeholder={composeUi.subjectPlaceholder}');
  assert(subjectInput.includes('onChange={(e) => setSubject(e.target.value)}'), 'Subject edits should only update subject state');
  assert(!subjectInput.includes('setRecipients'), 'Subject edits must not reset recipients');

  const bodyEditor = sliceBetween(compose, 'editor.on(\'text-change\'', 'editor.on(\'selection-change\'');
  assert(bodyEditor.includes('setRichBodyState(editor.getText(), editor.root.innerHTML)'), 'Rich text body edits should only update body/bodyHtml state');
  assert(!bodyEditor.includes('setRecipients'), 'Body edits must not reset recipients');

  const addAttachments = sliceBetween(compose, 'const handleAddAttachments = async () => {', 'const resolveRecipientsForSend');
  assert(addAttachments.includes('setOutgoingAttachments((prev) =>'), 'Adding attachments should append through a functional attachment update');
  assert(!addAttachments.includes('setRecipients'), 'Adding attachments must not reset to/cc/bcc recipients');
  assert(!addAttachments.includes('setSubject'), 'Adding attachments must not reset subject');
  assert(!addAttachments.includes('setBody'), 'Adding attachments must not reset body');
  assert(!addAttachments.includes('setActiveDraftSource'), 'Adding attachments must not rehydrate or switch drafts');
}

function testDraftDeleteKeepsComposeOpenAndStartsCleanDraft() {
  assert(compose.includes('const resetComposeToBlankDraft = () => {'), 'ComposeDialog should have a dedicated clean-draft reset helper');
  const deleteDraft = sliceBetween(compose, 'const handleDeleteDraft = async (draft: ComposeDraftOption) => {', 'const handleSend = async () => {');
  assert(deleteDraft.includes('resetComposeToBlankDraft();'), 'Deleting the active draft should switch the open dialog to a clean draft');
  assert(!deleteDraft.includes('onClose('), 'Deleting a draft from the picker must not close ComposeDialog');
  assert(deleteDraft.includes('setShowDraftMenu(false)'), 'Deleting a draft should close only the draft picker menu');
}

function testReleaseGateCoversComposeStateStability() {
  assert(releaseGate.includes('compose state stability regression'), 'test:release should include the compose state stability regression');
  assert(releaseGate.includes('scripts/compose-state-stability-regression.test.cjs'), 'test:release should run the compose state stability regression script');
}

testComposeHydratesOnlyForNewSessionOrDraftSwitch();
testSubjectBodyAndAttachmentsDoNotResetRecipients();
testDraftDeleteKeepsComposeOpenAndStartsCleanDraft();
testReleaseGateCoversComposeStateStability();

console.log('compose state stability regression tests passed');
