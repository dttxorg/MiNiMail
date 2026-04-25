const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const mailTs = read('src/main/services/mail.ts');
const mailServiceTs = read('src/main/services/mailService.ts');
const mailIpcTs = read('src/main/ipc/mail.ts');
const preloadTs = read('src/preload/index.ts');
const preloadTypesTs = read('src/preload/electronAPI.d.ts');
const useMailTs = read('src/renderer/hooks/useMail.ts');
const mailBodyLoaderTs = read('src/renderer/utils/mailBodyLoader.ts');
const mailDetailTs = read('src/renderer/components/MailDetail.tsx');
const testReleaseTs = read('scripts/test-release.cjs');

assert(
  /cacheId\?:\s*string/.test(mailTs) &&
    /cacheId:\s*row\.id/.test(mailServiceTs),
  'attachment metadata must expose stable cacheId from mail_attachments.id',
);

assert(
  /mail:downloadAttachment/.test(preloadTs) &&
    /mail:openAttachment/.test(preloadTs) &&
    /mail:downloadAttachment/.test(preloadTypesTs) &&
    /mail:openAttachment/.test(preloadTypesTs),
  'preload allowlist and types must expose attachment download/open IPC channels',
);

assert(
  /ipcMain\.handle\('mail:downloadAttachment'/.test(mailIpcTs) &&
    /ipcMain\.handle\('mail:openAttachment'/.test(mailIpcTs),
  'main mail IPC must register mail:downloadAttachment and mail:openAttachment handlers',
);

assert(
  /getCachedAttachmentMetadata/.test(mailServiceTs) &&
    /attachmentCacheId/.test(mailServiceTs) &&
    /WHERE account_id = \? AND folder = \? AND uid = \? AND id = \?/.test(mailServiceTs),
  'main process must resolve trusted attachment metadata by account/folder/uid/cacheId',
);

assert(
  /fetchMailAttachmentContent/.test(mailTs) &&
    /simpleParser\(msg\.source as Buffer\)/.test(mailTs) &&
    /findMatchingParsedAttachment/.test(mailTs),
  'attachment content fetch must use fallback source parsing and metadata matching',
);

assert(
  /sanitizeAttachmentFilename/.test(mailTs) &&
    /replace\(\s*\/\[<>:"\/\\\\\|\?\*\]/.test(mailTs) &&
    /attachment/.test(mailTs),
  'attachment filename must be sanitized against Windows-invalid and empty names',
);

assert(
  /dialog\.showSaveDialog/.test(mailIpcTs) &&
    /fs\.promises\.writeFile/.test(mailIpcTs) &&
    /app\.getPath\('temp'\)/.test(mailIpcTs) &&
    /shell\.openPath/.test(mailIpcTs),
  'download must use save dialog; open must write temp file and call shell.openPath',
);

assert(
  !/content:\s*attachmentContent\.content/.test(mailIpcTs) &&
    !/content:\s*attachment\.content/.test(useMailTs) &&
    !/content:\s*attachment\.content/.test(mailBodyLoaderTs),
  'attachment binary content must not be passed to renderer-facing paths',
);

assert(
  /downloadAttachment/.test(mailDetailTs) &&
    /openAttachment/.test(mailDetailTs) &&
    /attachmentDownloadStates/.test(mailDetailTs) &&
    /mail:downloadAttachment/.test(mailDetailTs) &&
    /mail:openAttachment/.test(mailDetailTs),
  'MailDetail must render download/open actions and track attachment action state',
);

assert(
  /\.filter\(\(attachment\)\s*=>\s*!attachment\.inline\)/.test(mailDetailTs),
  'inline cid images must remain hidden from normal downloadable attachment list',
);

assert(
  /mail attachment download regression/.test(testReleaseTs),
  'test:release must include the attachment download regression check',
);

console.log('mail attachment download regression checks passed');
