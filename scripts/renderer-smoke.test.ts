import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const requireHelper = createRequire(import.meta.url);

test('renderer smoke: index.html and compiled bundle assets exist and resolve', () => {
  const distDir = path.resolve('dist/renderer');
  const indexHtmlPath = path.join(distDir, 'index.html');

  assert.ok(fs.existsSync(indexHtmlPath), 'dist/renderer/index.html must exist');
  const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

  // Verify DOM mount target
  assert.ok(htmlContent.includes('<div id="root"></div>'), 'Mount root element must exist');

  // Verify referenced asset files
  const assetMatches = Array.from(htmlContent.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g));
  assert.ok(assetMatches.length > 0, 'index.html must reference compiled assets');

  for (const match of assetMatches) {
    const relativeAssetPath = match[1];
    const fullAssetPath = path.join(distDir, relativeAssetPath);
    assert.ok(
      fs.existsSync(fullAssetPath),
      `Referenced asset ${relativeAssetPath} must exist in dist/renderer`,
    );
  }
});

test('renderer live smoke: React mounts root and renders workspace without error boundary', () => {
  let electronBinary: string | null = null;
  try {
    electronBinary = requireHelper('electron');
  } catch {
    electronBinary = null;
  }
  if (!electronBinary || typeof electronBinary !== 'string') {
    return;
  }

  const smokeScript = path.resolve('scripts/renderer-render-smoke.cjs');
  const res = spawnSync(electronBinary, [smokeScript], {
    encoding: 'utf8',
    timeout: 15000,
  });

  assert.equal(res.status, 0, `Electron live smoke test failed: ${res.stderr || res.stdout}`);
  assert.ok(res.stdout.includes('renderer render smoke passed'), 'Expected smoke test pass output');
});
