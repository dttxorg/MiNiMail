import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createEmptyComposeQuickPhraseSettings,
  deleteComposeQuickPhrase,
  insertTextAtSelection,
  parseComposeQuickPhraseSettings,
  serializeComposeQuickPhraseSettings,
  upsertComposeQuickPhrase,
} from '../src/shared/compose/quickPhrases';
import {
  applySignatureToBody,
  getDefaultComposeCursorPosition,
} from '../src/shared/compose/signatures';

const empty = parseComposeQuickPhraseSettings('{not valid json');
assert.deepEqual(empty, createEmptyComposeQuickPhraseSettings(), 'invalid JSON should parse to empty settings');

const added = upsertComposeQuickPhrase(empty, {
  id: 'phrase-one',
  title: '',
  text: 'First line\r\n\r\nSecond line',
  tags: 'follow up, sales, follow up',
}, '2026-04-30T00:00:00.000Z');
assert.equal(added.phrases.length, 1, 'upsert should add a phrase');
assert.equal(added.phrases[0].id, 'phrase-one');
assert.equal(added.phrases[0].title, 'First line Second line');
assert.equal(added.phrases[0].text, 'First line\n\nSecond line');
assert.deepEqual(added.phrases[0].tags, ['follow up', 'sales']);
assert.equal(added.phrases[0].updatedAt, '2026-04-30T00:00:00.000Z');

const edited = upsertComposeQuickPhrase(added, {
  id: 'phrase-one',
  title: 'Updated title',
  text: 'Updated body',
  tags: ['support'],
}, '2026-04-30T00:00:01.000Z');
assert.equal(edited.phrases.length, 1, 'editing should not create a second phrase');
assert.equal(edited.phrases[0].title, 'Updated title');
assert.equal(edited.phrases[0].text, 'Updated body');
assert.deepEqual(edited.phrases[0].tags, ['support']);

const duplicate = upsertComposeQuickPhrase(edited, {
  title: 'Duplicate body title',
  text: 'Updated body',
  tags: 'saved',
}, '2026-04-30T00:00:02.000Z');
assert.equal(duplicate.phrases.length, 1, 'duplicate phrase text should reuse the existing phrase');
assert.equal(duplicate.phrases[0].id, 'phrase-one');
assert.equal(duplicate.phrases[0].title, 'Duplicate body title');

const removed = deleteComposeQuickPhrase(duplicate, 'phrase-one');
assert.equal(removed.phrases.length, 0, 'delete should remove a phrase');

const inserted = insertTextAtSelection('Hello world', ' quick', 5, 5);
assert.equal(inserted.body, 'Hello quick world');
assert.equal(inserted.cursor, 'Hello quick'.length);

const replaced = insertTextAtSelection('Hello old world', 'new', 6, 9);
assert.equal(replaced.body, 'Hello new world');
assert.equal(replaced.cursor, 'Hello new'.length);

const signatureOnlyBody = applySignatureToBody('', 'MiniMail Signature');
assert.equal(signatureOnlyBody, '\n\n-- \nMiniMail Signature');
assert.equal(
  `Direct user text${signatureOnlyBody.slice(getDefaultComposeCursorPosition(signatureOnlyBody))}`,
  'Direct user text\n\n-- \nMiniMail Signature',
);
const quickPhraseBeforeSignature = insertTextAtSelection(
  signatureOnlyBody,
  'Quick phrase body',
  getDefaultComposeCursorPosition(signatureOnlyBody),
  getDefaultComposeCursorPosition(signatureOnlyBody),
);
assert.equal(quickPhraseBeforeSignature.body, 'Quick phrase body\n\n-- \nMiniMail Signature');
assert(quickPhraseBeforeSignature.body.indexOf('Quick phrase body') < quickPhraseBeforeSignature.body.indexOf('-- \nMiniMail Signature'));

const bodyWithSignature = applySignatureToBody('Draft intro', 'MiniMail Signature');
const explicitCursorAfterSignature = insertTextAtSelection(
  bodyWithSignature,
  '\nExplicit after signature',
  bodyWithSignature.length,
  bodyWithSignature.length,
);
assert(explicitCursorAfterSignature.body.endsWith('Explicit after signature'), 'explicit cursor after signature should be respected');

assert.throws(
  () => upsertComposeQuickPhrase(empty, { text: '   ' }),
  /Quick phrase text is required/,
  'empty phrase text should be rejected',
);

const serialized = serializeComposeQuickPhraseSettings(added);
assert.deepEqual(parseComposeQuickPhraseSettings(serialized), added, 'settings should round-trip through JSON');

const composeDialog = readFileSync('src/renderer/components/ComposeDialog.tsx', 'utf8');
assert(composeDialog.includes('richTextEditorRef'), 'ComposeDialog should keep a rich text editor ref for quick phrase insertion');
assert(composeDialog.includes('selection.index'), 'ComposeDialog should track rich text selection index');
assert(composeDialog.includes('selection.index + selection.length'), 'ComposeDialog should track rich text selection length');
assert(composeDialog.includes('getDefaultComposeCursorPosition'), 'ComposeDialog should default quick phrase insertion before signatures');
assert(composeDialog.includes('insertTextAtSelection'), 'ComposeDialog should use the shared insertion helper');
assert(!composeDialog.includes('removeExistingMinimailSignature(body'), 'quick phrase insertion should not call signature cleanup helpers');

const settingsModal = readFileSync('src/renderer/components/SettingsModal.tsx', 'utf8');
assert(settingsModal.includes('quickPhraseTitle'), 'Settings should include a quick phrase management title');
assert(settingsModal.includes('handleSaveQuickPhrases'), 'Settings should include a quick phrase save handler');
assert(settingsModal.includes("id: 'writing'"), 'Settings should include a Writing nav entry');
const accountsPage = settingsModal.slice(
  settingsModal.indexOf("{activeNav === 'accounts'"),
  settingsModal.indexOf("{activeNav === 'writing'"),
);
const writingPage = settingsModal.slice(
  settingsModal.indexOf("{activeNav === 'writing'"),
  settingsModal.indexOf("{activeNav === 'backup'"),
);
assert(!accountsPage.includes('ui.quickPhraseTitle'), 'Accounts page should not render quick phrase management');
assert(writingPage.includes('ui.quickPhraseTitle'), 'Writing page should render quick phrase management');
assert(writingPage.includes('writing-section-tabs'), 'Writing page should use tabs for compose tools');
assert(writingPage.includes('writing-item-list'), 'Writing page should render a quick phrase list');
assert(writingPage.includes('writing-editor-panel'), 'Writing page should render a selected quick phrase editor');
assert(settingsModal.includes('selectedQuickPhraseDraftId'), 'Settings should track the selected quick phrase');
assert(settingsModal.includes('setSelectedQuickPhraseDraftId(id)'), 'Adding a quick phrase should select the new draft');
assert(settingsModal.includes('window.confirm(ui.quickPhraseDelete)'), 'Deleting a quick phrase should confirm first');
const quickPhraseHelper = readFileSync('src/shared/compose/quickPhrases.ts', 'utf8');
assert(quickPhraseHelper.includes("compose_quick_phrases_v1"), 'Quick phrases should keep the original settings key');

const mailDetail = readFileSync('src/renderer/components/MailDetail.tsx', 'utf8');
assert(mailDetail.includes('onSaveQuickPhrase'), 'MailDetail should accept a save quick phrase handler');
assert(mailDetail.includes('saveQuickPhrase'), 'MailDetail should render a save quick phrase button');

const testSource = readFileSync('scripts/compose-quick-phrases.test.ts', 'utf8');
assert(!new RegExp('console[.]log[(]').test(testSource), 'test should not print quick phrase text');
