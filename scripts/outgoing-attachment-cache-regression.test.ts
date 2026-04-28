import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readOutgoingAttachmentCache,
  writeOutgoingAttachmentCacheFromPath,
} from '../src/main/services/outgoingAttachmentCache';

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'minimail-outgoing-attachment-cache-'));
const sourceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'minimail-outgoing-source-'));

try {
  const sourcePath = path.join(sourceDir, 'source.txt');
  const content = Buffer.from('durable outgoing attachment content', 'utf8');
  await fs.promises.writeFile(sourcePath, content);

  const cached = await writeOutgoingAttachmentCacheFromPath(sourcePath, {
    filename: '..\\unsafe:name?.txt',
    contentType: 'text/plain',
  }, root);

  assert.match(cached.cacheId, /^[a-f0-9-]{36}$/i, 'durable outgoing attachment cache must expose a stable cache id');
  assert.equal(cached.filename.includes('..'), false, 'durable outgoing attachment filename must prevent path traversal');
  assert.equal(/[<>:"/\\|?*\x00-\x1f]/.test(cached.filename), false, 'durable outgoing attachment filename must be Windows-safe');
  assert.equal(fs.existsSync(cached.localCachePath), true, 'durable outgoing attachment cache file must exist on disk');

  await fs.promises.unlink(sourcePath);
  const restored = await readOutgoingAttachmentCache(cached.cacheId, root);

  assert.equal(restored.filename, cached.filename, 'restored durable attachment must preserve sanitized filename');
  assert.equal(restored.contentType, 'text/plain', 'restored durable attachment must preserve content type');
  assert.equal(restored.size, content.length, 'restored durable attachment must preserve byte size');
  assert.deepEqual(restored.content, content, 'restored durable attachment must not depend on the original local file path');
} finally {
  await fs.promises.rm(root, { recursive: true, force: true });
  await fs.promises.rm(sourceDir, { recursive: true, force: true });
}

console.log('outgoing attachment durable cache regression checks passed');
