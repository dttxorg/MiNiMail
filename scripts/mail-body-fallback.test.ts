import assert from 'node:assert/strict';
import {
  buildComposeHtmlBody,
  buildComposeQuotedOriginal,
} from '../src/renderer/utils/composeDraft';
import {
  getVisibleTextFromMailHtmlForFallback,
  shouldRenderPlainTextBodyFallback,
} from '../src/renderer/utils/mailBodyFallback';
import { stripSignatureMarkerBeforeSend } from '../src/shared/compose/signatures';

const sentBodyText = [
  'HELLO_SENT_BODY_SHOULD_RENDER',
  '',
  '---------- Forwarded message ----------',
  'Quoted content is intentionally fake.',
].join('\n');

const sentNormalHtml = '<p>HELLO_SENT_BODY_SHOULD_RENDER</p>';

assert.equal(
  shouldRenderPlainTextBodyFallback({
    bodyHtml: sentNormalHtml,
    bodyText: 'FORWARDED_PLAIN_TEXT_ONLY',
    preferPlainTextFallback: true,
  }),
  false,
  'Sent mail with visible HTML should render HTML instead of forcing bodyText fallback',
);

assert.equal(
  shouldRenderPlainTextBodyFallback({
    bodyHtml: '<style>.empty{display:none}</style><div>   </div>',
    bodyText: 'HELLO_SENT_BODY_SHOULD_RENDER',
    preferPlainTextFallback: false,
  }),
  true,
  'Empty visible HTML should fall back to bodyText',
);

assert.equal(
  shouldRenderPlainTextBodyFallback({
    bodyHtml: '<p>Normal rich HTML body should stay rich.</p>',
    bodyText: 'Different plain fallback',
    preferPlainTextFallback: false,
  }),
  false,
  'Normal non-sent HTML mail should keep HTML rendering',
);

const quoted = buildComposeQuotedOriginal({
  mode: 'forward',
  email: {
    from: 'sender@example.invalid',
    fromName: 'Sender',
    to: 'recipient@example.invalid',
    subject: 'Fake forwarded HTML',
    date: new Date('2026-04-30T00:00:00.000Z'),
    bodyText: 'FORWARDED_PLAIN_TEXT_ONLY',
    bodyHtml: [
      '<!doctype html><html><head><style>body{color:red}</style>',
      '<script>window.__fake = true</script></head><body>',
      '<h1>ORIGINAL_HTML_TITLE_SHOULD_KEEP_FORMAT</h1>',
      '<p>Original formatted body</p>',
      '</body></html>',
    ].join(''),
  },
});
const forwardedHtml = buildComposeHtmlBody(
  [
    'USER_FORWARD_NOTE_SHOULD_RENDER',
    '',
    '-- ',
    'SIGNATURE_SHOULD_RENDER',
  ].join('\n'),
  quoted,
);

assert(forwardedHtml.includes('USER_FORWARD_NOTE_SHOULD_RENDER'), 'Expected forwarded HTML to include the user-authored note');
assert(forwardedHtml.includes('SIGNATURE_SHOULD_RENDER'), 'Expected forwarded HTML to include the signature');
assert(forwardedHtml.includes('<h1>ORIGINAL_HTML_TITLE_SHOULD_KEEP_FORMAT</h1>'), 'Expected forwarded HTML to preserve quoted original HTML formatting');
assert(
  forwardedHtml.indexOf('USER_FORWARD_NOTE_SHOULD_RENDER') < forwardedHtml.indexOf('SIGNATURE_SHOULD_RENDER') &&
  forwardedHtml.indexOf('SIGNATURE_SHOULD_RENDER') < forwardedHtml.indexOf('ORIGINAL_HTML_TITLE_SHOULD_KEEP_FORMAT'),
  'Expected forwarded HTML order to be user note, signature, then quoted original',
);
assert.equal(/<html\b/i.test(forwardedHtml), false, 'Expected quoted original HTML document wrapper to be removed');
assert.equal(/<head\b/i.test(forwardedHtml), false, 'Expected quoted original head wrapper to be removed');
assert.equal(/<body\b/i.test(forwardedHtml), false, 'Expected quoted original body wrapper to be removed');
assert.equal(/<script\b/i.test(forwardedHtml), false, 'Expected quoted original scripts to be removed');
assert.equal(
  shouldRenderPlainTextBodyFallback({
    bodyHtml: forwardedHtml,
    bodyText: sentBodyText,
  }),
  false,
  'Forwarded sent HTML with visible authored and quoted content should not fall back to bodyText',
);

const markerBody = [
  'USER_FORWARD_NOTE_SHOULD_RENDER',
  '[[MINIMAIL_SIGNATURE_START]]',
  '-- ',
  'SIGNATURE_SHOULD_RENDER',
  '[[MINIMAIL_SIGNATURE_END]]',
].join('\n');
const htmlWithoutMarker = buildComposeHtmlBody(stripSignatureMarkerBeforeSend(markerBody), quoted);
assert.equal(htmlWithoutMarker.includes('[[MINIMAIL_SIGNATURE_START]]'), false, 'Expected signature marker start to be stripped before rendering');
assert.equal(htmlWithoutMarker.includes('[[MINIMAIL_SIGNATURE_END]]'), false, 'Expected signature marker end to be stripped before rendering');

assert.equal(
  getVisibleTextFromMailHtmlForFallback('<style>p{color:red}</style><p>Hello&nbsp;visible</p>'),
  'Hello visible',
);

console.log('mail body fallback tests passed');
