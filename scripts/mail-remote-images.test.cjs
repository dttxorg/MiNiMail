const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadTsModule(relativePath) {
  const filename = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => require(require.resolve(request, { paths: [path.dirname(filename), process.cwd()] }));
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
}

function testRemoteImagesAreBlockedByDefault() {
  const { rewriteRemoteImagesForPrivacy } = loadTsModule('src/renderer/utils/mailRemoteImages.ts');
  const result = rewriteRemoteImagesForPrivacy(
    '<p>Hello</p><img src="https://tracker.example/pixel.gif" width="1" height="1" alt="pixel" onerror="alert(1)">',
    { placeholderText: '远程图片已拦截' },
  );

  assert(result.blockedRemoteImageCount === 1, 'Expected one remote image to be blocked');
  assert(!/<img\b[^>]*\ssrc="https:\/\/tracker\.example\/pixel\.gif"/i.test(result.html), 'Expected blocked remote image to have no real img src');
  assert(result.html.includes('data-original-src="https://tracker.example/pixel.gif"'), 'Expected original src to be preserved in data-original-src');
  assert(result.html.includes('minimail-remote-image-placeholder-tracker'), 'Expected 1x1 tracking pixel to receive tracker placeholder class');
  assert(!result.html.includes('onerror='), 'Expected replacing the remote img to remove event attributes from rendered placeholder');
}

function testAllowRemoteImagesRestoresSrc() {
  const { rewriteRemoteImagesForPrivacy } = loadTsModule('src/renderer/utils/mailRemoteImages.ts');
  const result = rewriteRemoteImagesForPrivacy(
    '<img src="https://cdn.example.com/banner.png" width="320" alt="banner">',
    { allowRemoteImages: true },
  );

  assert(result.blockedRemoteImageCount === 0, 'Expected no image to be blocked after explicit allow');
  assert(result.html.includes('src="https://cdn.example.com/banner.png"'), 'Expected explicit allow to keep the original src');
}

function testInlineAndCidImagesAreNotBlocked() {
  const { rewriteRemoteImagesForPrivacy } = loadTsModule('src/renderer/utils/mailRemoteImages.ts');
  const result = rewriteRemoteImagesForPrivacy(
    '<img src="data:image/png;base64,AAAA" alt="inline"><img src="cid:logo-1" alt="cid">',
  );

  assert(result.blockedRemoteImageCount === 0, 'Expected inline data and cid images not to be counted as remote images');
  assert(result.html.includes('src="data:image/png;base64,AAAA"'), 'Expected base64 data image to remain');
  assert(result.html.includes('src="cid:logo-1"'), 'Expected cid image reference to remain');
}

function testSanitizerStillKeepsDangerousAttributesOut() {
  const { rewriteRemoteImagesForPrivacy } = loadTsModule('src/renderer/utils/mailRemoteImages.ts');
  const sanitizer = fs.readFileSync(path.join(process.cwd(), 'src/renderer/utils/mailHtmlSanitizer.ts'), 'utf8');
  const rewrittenUnsafeImage = rewriteRemoteImagesForPrivacy('<img src="javascript:alert(1)" onload="alert(1)" alt="bad">');

  assert(sanitizer.includes("FORBID_TAGS: ['script'"), 'Expected sanitizer to explicitly forbid script tags');
  assert(sanitizer.includes("FORBID_ATTR: ['onerror', 'onload'"), 'Expected sanitizer to explicitly forbid common image event handlers');
  assert(sanitizer.includes('ALLOW_DATA_ATTR: false'), 'Expected sanitizer to continue stripping user-provided data attributes');
  assert(!sanitizer.includes("'srcset'"), 'Expected sanitizer not to allow srcset, which can load remote images');
  assert(!rewrittenUnsafeImage.html.includes('javascript:'), 'Expected unsafe javascript: image URL to be stripped defensively');
  assert(!rewrittenUnsafeImage.html.includes('onload='), 'Expected unsafe image event handlers to be stripped defensively');
}

function testMailDetailHasPerMailRemoteImageGate() {
  const detail = fs.readFileSync(path.join(process.cwd(), 'src/renderer/components/MailDetail.tsx'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'src/renderer/index.html'), 'utf8');

  assert(detail.includes('allowRemoteImages'), 'Expected MailDetail to track per-message remote image permission');
  assert(detail.includes('setAllowRemoteImages(false);'), 'Expected MailDetail to reset remote image permission when switching mail');
  assert(detail.includes('onAllowRemoteImages'), 'Expected MailBody to expose a manual remote image allow action');
  assert(detail.includes('ui.showRemoteImages'), 'Expected UI to provide a manual show remote images button');
  assert(indexHtml.includes('img-src') && indexHtml.includes('https: http:'), 'Expected CSP to permit remote images only after MailBody restores src');
}

function run() {
  testRemoteImagesAreBlockedByDefault();
  testAllowRemoteImagesRestoresSrc();
  testInlineAndCidImagesAreNotBlocked();
  testSanitizerStillKeepsDangerousAttributesOut();
  testMailDetailHasPerMailRemoteImageGate();
  console.log('mail-remote-images tests passed');
}

run();
