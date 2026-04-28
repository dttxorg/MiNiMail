const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const repoRoot = path.resolve(__dirname, '..');
const addAccountDialogPath = path.join(repoRoot, 'src', 'renderer', 'components', 'AddAccountDialog.tsx');
const settingsModalPath = path.join(repoRoot, 'src', 'renderer', 'components', 'SettingsModal.tsx');
const modalPath = path.join(repoRoot, 'src', 'renderer', 'components', 'Modal.tsx');

const addAccountDialog = fs.readFileSync(addAccountDialogPath, 'utf8');
const settingsModal = fs.readFileSync(settingsModalPath, 'utf8');
const modal = fs.readFileSync(modalPath, 'utf8');

assert.match(
  modal,
  /closeOnBackdrop\?\s*:\s*boolean/,
  'Modal should expose an opt-out for backdrop close without changing ordinary dialogs.',
);
assert.match(
  modal,
  /closeOnBackdrop\s*=\s*true/,
  'Modal should keep backdrop-close enabled by default for existing ordinary dialogs.',
);
assert.match(
  modal,
  /onClick=\{closeOnBackdrop \? onClose : undefined\}/,
  'Modal backdrop close should be conditional.',
);

assert.match(
  settingsModal,
  /<Modal[^>]+closeOnBackdrop=\{false\}/,
  'Settings modal should not close from outside/backdrop clicks.',
);

assert.doesNotMatch(
  addAccountDialog,
  /bg-black\/60 backdrop-blur-sm"\s+onClick=\{onClose\}/,
  'Add account dialog backdrop must not close the form.',
);
assert.match(
  addAccountDialog,
  /const requestClose = useCallback/,
  'Add account dialog should route explicit close attempts through the dirty-state guard.',
);
assert.match(
  addAccountDialog,
  /onClick=\{requestClose\}/,
  'Add account dialog close and cancel buttons should use the guarded close path.',
);
assert.match(
  addAccountDialog,
  /event\.key !== 'Escape'/,
  'ESC key should use the same guarded close path.',
);
assert.match(
  addAccountDialog,
  /是否放弃当前修改？/,
  'Unsaved account form changes should show a discard confirmation.',
);
assert.match(
  addAccountDialog,
  /继续编辑/,
  'Discard confirmation should offer continuing editing.',
);
assert.match(
  addAccountDialog,
  /放弃修改/,
  'Discard confirmation should offer discarding changes.',
);

console.log('[settings-modal-close-regression] passed');
