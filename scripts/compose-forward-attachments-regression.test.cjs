const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const composeDraft = read('src/renderer/utils/composeDraft.ts');
const composeDialog = read('src/renderer/components/ComposeDialog.tsx');
const i18n = read('src/renderer/i18n.ts');

assert(
  composeDraft.includes('export interface ComposeAttachmentReference'),
  'compose quoted original should have a stable attachment reference type',
);
assert(
  composeDraft.includes('attachments?: ComposeAttachmentReference[]'),
  'compose quoted original should persist original attachment metadata',
);
assert(
  composeDraft.includes("mode === 'forward'") && composeDraft.includes('!attachment.inline'),
  'forward quote should include only non-inline original attachments',
);
assert(
  composeDialog.includes('originalAttachmentsNotIncluded'),
  'compose dialog should warn when original attachments are not automatically forwarded',
);
assert(
  composeDialog.includes('currentQuotedOriginal.mode === \'forward\'') && composeDialog.includes('currentQuotedOriginal.attachments'),
  'compose dialog should render original attachment metadata for forwards',
);
assert(
  !composeDialog.includes('attachments: currentQuotedOriginal.attachments'),
  'send payload should not pretend original attachments are included',
);
for (const key of ['originalAttachmentsLabel', 'originalAttachmentsNotIncluded']) {
  const matches = i18n.match(new RegExp(`${key}:`, 'g')) || [];
  assert(matches.length >= 8, `${key} should be localized for all supported languages`);
}

console.log('compose forward attachments regression tests passed');
