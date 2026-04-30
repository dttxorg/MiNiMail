import assert from 'node:assert/strict';
import {
  applySignatureToBody,
  collectEnabledSignatureTexts,
  collectSignatureTexts,
  findMinimailSignatureStart,
  getDefaultComposeCursorPosition,
  getSignatureForAccount,
  parseComposeSignatureSettings,
  removeExistingMinimailSignature,
  serializeComposeSignatureSettings,
  stripSignatureMarkerBeforeSend,
  updateComposeSignatureForAccount,
} from '../src/shared/compose/signatures';

const settings = updateComposeSignatureForAccount(null, 1, {
  enabled: true,
  text: 'Best,\nMiniMail User',
}, '2026-04-30T00:00:00.000Z');

assert.equal(getSignatureForAccount(settings, 1)?.text, 'Best,\nMiniMail User');
assert.equal(getSignatureForAccount(settings, 2), null);
assert.deepEqual(parseComposeSignatureSettings(serializeComposeSignatureSettings(settings)), settings);

const newMailBody = applySignatureToBody('', getSignatureForAccount(settings, 1));
assert.equal(newMailBody, '\n\n-- \nBest,\nMiniMail User');
assert.equal(findMinimailSignatureStart(newMailBody), 0);
assert.equal(getDefaultComposeCursorPosition(newMailBody), 0);
assert.equal(
  `Hello from user${newMailBody.slice(getDefaultComposeCursorPosition(newMailBody))}`,
  'Hello from user\n\n-- \nBest,\nMiniMail User',
);

const replyBody = applySignatureToBody('Thanks for the update.', getSignatureForAccount(settings, 1));
const quotedBody = `${replyBody}\n\nOn Thu, someone wrote:\n> Original`;
assert(quotedBody.indexOf('-- \nBest,\nMiniMail User') < quotedBody.indexOf('On Thu'));
assert.equal(getDefaultComposeCursorPosition(replyBody), 'Thanks for the update.'.length);

const switchedSettings = updateComposeSignatureForAccount(settings, 2, {
  enabled: true,
  text: 'Regards,\nSecond Account',
}, '2026-04-30T00:00:01.000Z');
const switched = applySignatureToBody(replyBody, getSignatureForAccount(switchedSettings, 2), {
  knownSignatures: collectEnabledSignatureTexts(switchedSettings),
});
assert(!switched.includes('Best,\nMiniMail User'));
assert(switched.includes('Regards,\nSecond Account'));
assert.equal((switched.match(/-- /g) || []).length, 1);
assert.equal(getDefaultComposeCursorPosition(switched), 'Thanks for the update.'.length);

const draftWithSignature = applySignatureToBody('Already drafted.', getSignatureForAccount(settings, 1), {
  knownSignatures: collectEnabledSignatureTexts(settings),
});
const reopenedDraft = applySignatureToBody(draftWithSignature, getSignatureForAccount(settings, 1), {
  knownSignatures: collectEnabledSignatureTexts(settings),
});
assert.equal(reopenedDraft, draftWithSignature);

const cleaned = removeExistingMinimailSignature(reopenedDraft, collectEnabledSignatureTexts(settings));
assert.equal(cleaned, 'Already drafted.');

const markerBody = [
  'Hello',
  '[[MINIMAIL_SIGNATURE_START]]',
  '-- ',
  'Internal marker signature',
  '[[MINIMAIL_SIGNATURE_END]]',
].join('\n');
assert.equal(stripSignatureMarkerBeforeSend(markerBody), 'Hello');

const disabledSettings = updateComposeSignatureForAccount(settings, 3, {
  enabled: false,
  text: 'Disabled signature',
}, '2026-04-30T00:00:02.000Z');
assert.equal(getSignatureForAccount(disabledSettings, 3), null);
assert(!JSON.stringify(collectEnabledSignatureTexts(disabledSettings)).includes('Disabled signature'));
assert(collectSignatureTexts(disabledSettings).includes('Disabled signature'));

console.log('compose signature tests passed');
