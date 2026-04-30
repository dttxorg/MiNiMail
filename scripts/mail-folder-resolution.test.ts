import assert from 'node:assert/strict';
import { folderMatches, resolveFolderPath } from '../src/shared/mailFolders';

assert.equal(
  resolveFolderPath([{ name: 'Sent Mail', path: '[Gmail]/Sent Mail', flags: ['\\Sent'] }], 'sent'),
  '[Gmail]/Sent Mail',
  'Gmail-style Sent folder path should resolve from special-use flags',
);

assert.equal(
  resolveFolderPath([{ name: '已发送', path: '已发送', flags: [] }], 'sent'),
  '已发送',
  'Localized Sent folder path should resolve from known candidate names',
);

assert.equal(folderMatches('[Gmail]/寄件備份', 'sent'), true, 'Traditional Chinese Gmail Sent path should match sent');
assert.equal(folderMatches('寄件備份', 'sent'), true, 'Traditional Chinese Sent folder name should match sent');
assert.equal(folderMatches('寄件备份', 'sent'), true, 'Simplified Chinese Sent backup folder name should match sent');

assert.equal(
  resolveFolderPath([], 'sent'),
  'sent',
  'Sent folder should only fall back to literal sent when discovery has no usable folders',
);

console.log('mail folder resolution tests passed');
