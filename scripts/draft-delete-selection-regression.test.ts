import fs from 'node:fs';
import path from 'node:path';
import { resolveNextDraftSelectionAfterDelete } from '../src/renderer/utils/draftSelection.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function draft(id: string) {
  return { id };
}

function testSelectedDraftMovesToNextDraft() {
  const drafts = [draft('draft-a'), draft('draft-b'), draft('draft-c')];
  const next = resolveNextDraftSelectionAfterDelete(drafts, 'draft-a', 'draft-a');
  assert(next?.id === 'draft-b', 'Deleting the selected first draft should select the next draft');
}

function testSelectedLastDraftMovesToPreviousDraft() {
  const drafts = [draft('draft-a'), draft('draft-b'), draft('draft-c')];
  const next = resolveNextDraftSelectionAfterDelete(drafts, 'draft-c', 'draft-c');
  assert(next?.id === 'draft-b', 'Deleting the selected last draft should select the previous draft');
}

function testDeletingOnlyDraftReturnsEmptySelection() {
  const next = resolveNextDraftSelectionAfterDelete([draft('draft-a')], 'draft-a', 'draft-a');
  assert(next === null, 'Deleting the only selected draft should leave Drafts in an empty state');
}

function testDeletingUnselectedDraftPreservesSelection() {
  const drafts = [draft('draft-a'), draft('draft-b'), draft('draft-c')];
  const next = resolveNextDraftSelectionAfterDelete(drafts, 'draft-a', 'draft-c');
  assert(next === undefined, 'Deleting an unselected draft should not change the current selection');
}

function testAppDoesNotRedirectDraftFolderToInbox() {
  const app = read('src/renderer/App.tsx');
  assert(!app.includes("selectedFolder === 'sent' || selectedFolder === 'drafts'"), 'Drafts view must not be redirected to inbox');
  assert(!app.includes("selectedFolder === 'drafts') {\n      setSelectedFolder('inbox');"), 'Drafts view must remain selected after draft deletion');
  assert(app.includes('resolveNextDraftSelectionAfterDelete'), 'App should use adjacent draft selection when deleting drafts');
}

function testAppDoesNotRedirectSentFolderToInbox() {
  const app = read('src/renderer/App.tsx');
  assert(!app.includes("if (selectedFolder === 'sent') {\n      setSelectedFolder('inbox');"), 'Sent view must remain selected after opening Sent');
}

function run() {
  testSelectedDraftMovesToNextDraft();
  testSelectedLastDraftMovesToPreviousDraft();
  testDeletingOnlyDraftReturnsEmptySelection();
  testDeletingUnselectedDraftPreservesSelection();
  testAppDoesNotRedirectDraftFolderToInbox();
  testAppDoesNotRedirectSentFolderToInbox();
  console.log('draft delete selection regression tests passed');
}

run();
