import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildComposeHtmlBodyFromEditableHtml,
  convertComposeHtmlToPlainText,
  convertComposePlainTextToHtml,
  sanitizeComposeEditableHtml,
} from '../src/renderer/utils/composeDraft';

const packageJson = readFileSync('package.json', 'utf8');
assert(packageJson.includes('"quill"'), 'Quill should be installed for the compose rich text editor');

const composeDialog = readFileSync('src/renderer/components/ComposeDialog.tsx', 'utf8');
assert(composeDialog.includes("import Quill from 'quill';"), 'ComposeDialog should initialize Quill');
assert(composeDialog.includes("import 'quill/dist/quill.snow.css';"), 'ComposeDialog should load Quill snow CSS');
assert(composeDialog.includes('richTextContainerRef'), 'ComposeDialog should render a rich text editor container');
assert(composeDialog.includes('new Quill'), 'ComposeDialog should replace the compose body textarea with Quill');
assert(composeDialog.includes('Font.FontStyle'), 'ComposeDialog should use inline font-family styles for email clients');
assert(composeDialog.includes('Align.AlignStyle'), 'ComposeDialog should use inline text-align styles for email clients');
assert(!composeDialog.includes('<textarea'), 'Compose body should no longer render a textarea editor');
for (const toolbarToken of ['font', 'size', 'color', 'bold', 'italic', 'underline', 'bullet', 'ordered', 'align', 'link', 'image']) {
  assert(composeDialog.includes(toolbarToken), `Compose rich text toolbar should include ${toolbarToken}`);
}
assert(composeDialog.includes('buildComposeHtmlBodyFromEditableHtml'), 'ComposeDialog should send sanitized editable HTML');
assert(composeDialog.includes('bodyHtml: buildComposeHtmlBodyFromEditableHtml(editableHtmlForSend, currentQuotedOriginal) || undefined'), 'ComposeDialog should include HTML body for rich text sends');
assert(composeDialog.includes('bodyHtml?: string;'), 'Draft and send types should carry editable HTML');
assert(composeDialog.includes('sanitizeComposeEditorHtml(bodyHtml || bodyHtmlRef.current)'), 'Draft save should persist sanitized editable HTML');

const app = readFileSync('src/renderer/App.tsx', 'utf8');
assert(app.includes('bodyHtml?: string;'), 'App draft payload should preserve rich text HTML');
assert(app.includes('initialEditableHtml={composeInitialHtml}'), 'App should hydrate ComposeDialog with saved editable HTML');
assert(app.includes('bodyHtml: options.bodyHtml'), 'App should cache draft/scheduled/send rich text HTML');

const styles = readFileSync('src/renderer/styles/global.css', 'utf8');
assert(styles.includes('.compose-rich-text-editor .ql-toolbar.ql-snow'), 'Global styles should theme the rich text toolbar');
assert(styles.includes('.compose-rich-text-editor .ql-editor'), 'Global styles should theme the rich text editable area');

const html = convertComposePlainTextToHtml('Hello\n\n-- \nSignature');
assert.equal(html, '<p>Hello</p><p><br/></p><p>-- </p><p>Signature</p>', 'plain text should convert to editable HTML while preserving blank lines');

const unsafe = sanitizeComposeEditableHtml('<p><strong>Hello</strong><script>alert(1)</script><a href="javascript:bad()">link</a><img src="https://example.test/image.png" onerror="bad()"></p>');
assert(unsafe.includes('<strong>Hello</strong>'), 'sanitizer should preserve basic formatting');
assert(!unsafe.includes('<script'), 'sanitizer should remove scripts');
assert(!unsafe.includes('javascript:'), 'sanitizer should remove javascript URLs');
assert(!unsafe.includes('onerror'), 'sanitizer should remove event handlers');
assert(unsafe.includes('<img src="https://example.test/image.png"'), 'sanitizer should preserve safe image URLs');
assert.equal(
  sanitizeComposeEditableHtml('<p>Body</p>[[MINIMAIL_SIGNATURE_START]]private[[MINIMAIL_SIGNATURE_END]]'),
  '<p>Body</p>',
  'HTML sanitizer should remove internal signature markers',
);

const outbound = buildComposeHtmlBodyFromEditableHtml(
  '<p style="text-align:center;"><span style="color:#ef4444;"><u>Hello</u></span></p><p><a href="https://example.test">link</a></p>',
);
assert(outbound.includes('text-align:center'), 'HTML body should preserve alignment');
assert(outbound.includes('color:#ef4444'), 'HTML body should preserve text color');
assert(outbound.includes('<u>Hello</u>'), 'HTML body should preserve underline');
assert(outbound.includes('href="https://example.test"'), 'HTML body should preserve safe links');

assert.equal(
  convertComposeHtmlToPlainText('<p>Hello</p><p><br></p><p>Signature</p>'),
  'Hello\n\nSignature',
  'HTML drafts should have a plain text compatibility representation',
);

const testSource = readFileSync('scripts/compose-rich-text.test.ts', 'utf8');
assert(!new RegExp('console[.]log[(]').test(testSource), 'test should not print message body content');
