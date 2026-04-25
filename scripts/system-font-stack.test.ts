import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const disallowedFontExtensions = new Set(['.ttf', '.otf', '.woff', '.woff2', '.eot']);
const requiredFontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", Arial, sans-serif;';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function walkFiles(dirPath: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolutePath, files);
      continue;
    }
    files.push(absolutePath);
  }
  return files;
}

function testNoBundledFontFiles() {
  const allFiles = walkFiles(repoRoot);
  const bundledFonts = allFiles.filter((filePath) => disallowedFontExtensions.has(path.extname(filePath).toLowerCase()));
  assert(bundledFonts.length === 0, `Expected no bundled font files, found:\n${bundledFonts.join('\n')}`);
}

function testGlobalFontStackUsesSystemFonts() {
  const globalCss = fs.readFileSync(path.join(repoRoot, 'src', 'renderer', 'styles', 'global.css'), 'utf8');
  assert(globalCss.includes(requiredFontStack), 'Expected global.css to use the required system font stack');
  assert(!/Roboto|Helvetica Neue/.test(globalCss), 'Expected global.css to stop referencing third-party font families');
}

function testOAuthCallbackUsesSystemFonts() {
  const oauthPkce = fs.readFileSync(path.join(repoRoot, 'src', 'main', 'services', 'oauthPkce.ts'), 'utf8');
  assert(
    oauthPkce.includes('font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",Arial,sans-serif'),
    'Expected OAuth callback page to use the required system font stack',
  );
}

function testNoFontFaceDeclarationsRemain() {
  const searchRoots = [
    path.join(repoRoot, 'src'),
    path.join(repoRoot, 'build'),
  ].filter((dirPath) => fs.existsSync(dirPath));

  const offenders: string[] = [];
  for (const root of searchRoots) {
    for (const filePath of walkFiles(root)) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('@font-face')) {
        offenders.push(filePath);
      }
    }
  }

  assert(offenders.length === 0, `Expected no @font-face declarations, found:\n${offenders.join('\n')}`);
}

function run() {
  testNoBundledFontFiles();
  testGlobalFontStackUsesSystemFonts();
  testOAuthCallbackUsesSystemFonts();
  testNoFontFaceDeclarationsRemain();
  console.log('system-font-stack tests passed');
}

run();
