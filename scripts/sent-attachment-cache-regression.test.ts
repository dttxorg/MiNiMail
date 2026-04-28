import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readSentAttachmentCache,
  sanitizeSentAttachmentFilename,
  writeSentAttachmentCache,
} from '../src/main/services/sentAttachmentCache';

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'minimail-sent-attachment-cache-'));

try {
  const unsafeName = '..\\secret/report:image?.jpg';
  const safeName = sanitizeSentAttachmentFilename(unsafeName);
  assert.equal(safeName.includes('..'), false, 'sanitized filename must remove path traversal');
  assert.equal(/[<>:"/\\|?*\x00-\x1f]/.test(safeName), false, 'sanitized filename must remove Windows-invalid characters');

  const content = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03]);
  const cached = await writeSentAttachmentCache({
    filename: unsafeName,
    contentType: 'image/jpeg',
    content,
  }, root);

  assert.equal(path.dirname(cached.localCachePath).startsWith(root), true, 'cache file must be written below the selected cache root');
  assert.equal(path.basename(cached.localCachePath), safeName, 'cache filename must be sanitized');
  assert.equal(fs.existsSync(cached.localCachePath), true, 'cache file must exist on disk');
  assert.equal((await fs.promises.stat(cached.localCachePath)).size, content.length, 'cache file must preserve attachment byte size');

  const restored = await readSentAttachmentCache({
    filename: unsafeName,
    contentType: 'image/jpeg',
    localCachePath: cached.localCachePath,
  });

  assert(restored, 'cache metadata with localCachePath must restore attachment content');
  assert.equal(restored.filename, safeName, 'restored cache entry must expose the sanitized filename');
  assert.equal(restored.contentType, 'image/jpeg', 'restored cache entry must preserve content type');
  assert.deepEqual(restored.content, content, 'restored cache content must match the original attachment bytes');
} finally {
  await fs.promises.rm(root, { recursive: true, force: true });
}

console.log('sent attachment cache regression checks passed');
