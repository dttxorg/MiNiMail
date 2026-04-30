import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyComposeTemplateToDraft,
  createEmptyComposeTemplateSettings,
  deleteComposeTemplate,
  parseComposeTemplateSettings,
  serializeComposeTemplateSettings,
  upsertComposeTemplate,
} from '../src/shared/compose/templates';
import { applySignatureToBody, getDefaultComposeCursorPosition } from '../src/shared/compose/signatures';

const empty = parseComposeTemplateSettings('{not valid json');
assert.deepEqual(empty, createEmptyComposeTemplateSettings(), 'invalid JSON should parse to empty settings');

const added = upsertComposeTemplate(empty, {
  id: 'template-one',
  name: '',
  subject: 'Follow up',
  bodyText: 'First paragraph\r\n\r\nSecond paragraph with {{name}}',
  tags: 'sales, follow up, sales',
}, '2026-04-30T00:00:00.000Z');
assert.equal(added.templates.length, 1, 'upsert should add a template');
assert.equal(added.templates[0].id, 'template-one');
assert.equal(added.templates[0].name, 'Follow up');
assert.equal(added.templates[0].subject, 'Follow up');
assert.equal(added.templates[0].bodyText, 'First paragraph\n\nSecond paragraph with {{name}}');
assert.deepEqual(added.templates[0].tags, ['sales', 'follow up']);
assert.equal(added.templates[0].updatedAt, '2026-04-30T00:00:00.000Z');

const edited = upsertComposeTemplate(added, {
  id: 'template-one',
  name: 'Updated template',
  subject: 'Updated subject',
  bodyText: 'Updated body',
  tags: ['support'],
}, '2026-04-30T00:00:01.000Z');
assert.equal(edited.templates.length, 1, 'editing should not create a second template');
assert.equal(edited.templates[0].name, 'Updated template');
assert.equal(edited.templates[0].subject, 'Updated subject');
assert.equal(edited.templates[0].bodyText, 'Updated body');
assert.deepEqual(edited.templates[0].tags, ['support']);

const removed = deleteComposeTemplate(edited, 'template-one');
assert.equal(removed.templates.length, 0, 'delete should remove a template');

const serialized = serializeComposeTemplateSettings(added);
assert.deepEqual(parseComposeTemplateSettings(serialized), added, 'settings should round-trip through JSON');

const template = added.templates[0];
const signatureOnlyBody = applySignatureToBody('', 'SIGNATURE_TEXT');
const appliedBeforeSignature = applyComposeTemplateToDraft({
  currentSubject: '',
  currentBody: signatureOnlyBody,
  template,
  mode: 'insert',
});
assert.equal(appliedBeforeSignature.subject, 'Follow up');
assert.equal(appliedBeforeSignature.body, 'First paragraph\n\nSecond paragraph with {{name}}\n\n-- \nSIGNATURE_TEXT');
assert.equal(appliedBeforeSignature.cursor, 'First paragraph\n\nSecond paragraph with {{name}}\n\n'.length);

const replacedBeforeSignature = applyComposeTemplateToDraft({
  currentSubject: 'Existing subject',
  currentBody: applySignatureToBody('Existing user body', 'SIGNATURE_TEXT'),
  template,
  mode: 'replace',
});
assert.equal(replacedBeforeSignature.subject, 'Follow up');
assert.equal(replacedBeforeSignature.body, 'First paragraph\n\nSecond paragraph with {{name}}\n\n-- \nSIGNATURE_TEXT');

const insertedWithExistingSubject = applyComposeTemplateToDraft({
  currentSubject: 'Existing subject',
  currentBody: signatureOnlyBody,
  template,
  mode: 'insert',
});
assert.equal(insertedWithExistingSubject.subject, 'Existing subject', 'insert should not silently replace an existing subject');

const replyForwardBody = `${signatureOnlyBody}\n\nOn Thu, sender wrote:\n> ORIGINAL_QUOTED_TEXT`;
const insertedInEditableArea = applyComposeTemplateToDraft({
  currentSubject: 'Re: Existing',
  currentBody: replyForwardBody,
  template,
  mode: 'insert',
  selectionStart: getDefaultComposeCursorPosition(replyForwardBody),
  selectionEnd: getDefaultComposeCursorPosition(replyForwardBody),
});
assert(insertedInEditableArea.body.indexOf('Second paragraph with {{name}}') < insertedInEditableArea.body.indexOf('ORIGINAL_QUOTED_TEXT'));

const sourceWithSelection = 'Hello old body';
const replacedSelection = applyComposeTemplateToDraft({
  currentSubject: '',
  currentBody: sourceWithSelection,
  template,
  mode: 'insert',
  selectionStart: 6,
  selectionEnd: 14,
});
assert.equal(replacedSelection.body, 'Hello First paragraph\n\nSecond paragraph with {{name}}');

const settingsModal = readFileSync('src/renderer/components/SettingsModal.tsx', 'utf8');
assert(settingsModal.includes('templateTitle'), 'Settings should include a templates management title');
assert(settingsModal.includes('handleSaveTemplates'), 'Settings should include a template save handler');
const writingPage = settingsModal.slice(
  settingsModal.indexOf("{activeNav === 'writing'"),
  settingsModal.indexOf("{activeNav === 'backup'"),
);
assert(writingPage.includes('ui.templateTitle'), 'Writing page should render template management');
assert(writingPage.includes('writing-section-tabs'), 'Writing page should use tabs for compose tools');
assert(writingPage.includes('writing-item-list'), 'Writing page should render a template list');
assert(writingPage.includes('writing-editor-panel'), 'Writing page should render a selected template editor');
assert(settingsModal.includes('selectedTemplateDraftId'), 'Settings should track the selected template');
assert(settingsModal.includes('setSelectedTemplateDraftId(id)'), 'Adding a template should select the new draft');
assert(settingsModal.includes('window.confirm(ui.templateDelete)'), 'Deleting a template should confirm first');
const templateHelper = readFileSync('src/shared/compose/templates.ts', 'utf8');
assert(templateHelper.includes("compose_templates_v1"), 'Templates should keep the original settings key');

const composeDialog = readFileSync('src/renderer/components/ComposeDialog.tsx', 'utf8');
assert(composeDialog.includes('templatesLabel'), 'ComposeDialog should include a Templates button/menu');
assert(composeDialog.includes('applyComposeTemplateToDraft'), 'ComposeDialog should use the shared template application helper');
assert(!composeDialog.includes('removeExistingMinimailSignature(body'), 'template application should not call signature cleanup helpers directly');

const testSource = readFileSync('scripts/compose-templates.test.ts', 'utf8');
assert(!new RegExp('console[.]log[(]').test(testSource), 'test should not print template subject or body');
