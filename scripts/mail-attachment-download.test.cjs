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
    /client\.download\(String\(messageUid\),\s*targetAttachment\.partId/.test(mailTs) &&
    /method:\s*'partId'/.test(mailTs),
  'attachment content fetch must prefer IMAP part download when partId is available',
);

assert(
  /fetchAttachmentViaSourceFallback/.test(mailTs) &&
    /simpleParser\(msg\.source as Buffer\)/.test(mailTs) &&
    /findMatchingParsedAttachment/.test(mailTs) &&
    /fallbackReason/.test(mailTs),
  'attachment content fetch must keep full-source fallback with metadata matching and diagnostics',
);

assert(
  /collectBodyStructureAttachmentMetadata/.test(mailTs) &&
    /partId:\s*partPath/.test(mailTs) &&
    /bodyStructureAttachments/.test(mailTs),
  'attachment metadata must derive stable partId values from BODYSTRUCTURE',
);

assert(
  /part_id TEXT/.test(mailServiceTs) &&
    /partId:\s*attachment\.partId/.test(mailServiceTs) &&
    /partId:\s*row\.part_id/.test(mailServiceTs),
  'mail_attachments must persist and restore part_id for fast attachment fetches',
);

assert(
  /local_cache_path TEXT/.test(mailServiceTs) &&
    /const localCachePath = attachment\.localCachePath/.test(mailServiceTs) &&
    /localCachePath:\s*row\.local_cache_path/.test(mailServiceTs),
  'mail_attachments must persist and restore local_cache_path for optimistic Sent attachments',
);

assert(
  /const id = attachment\.cacheId \|\|/.test(mailServiceTs),
  'mail_attachments must preserve renderer cacheId values so Sent optimistic attachment cards can be resolved',
);

assert(
  /writeSentAttachmentCache/.test(mailIpcTs) &&
    /updateCachedAttachmentLocalCachePath/.test(mailIpcTs) &&
    /readSentAttachmentCache/.test(mailIpcTs) &&
    /method:\s*'localCache'/.test(mailIpcTs),
  'Sent attachment actions must use a durable local cache before falling back to IMAP/source fetch',
);

assert(
  /sentCache\?:\s*SentAttachmentCacheTarget/.test(mailIpcTs) &&
    /resolveOutgoingAttachmentsForSend\(options\.outgoingAttachments,\s*options\.sentCache\)/.test(mailIpcTs),
  'mail:send must accept a Sent cache target so outgoing attachment bytes are durable for local Sent records',
);

assert(
  /sentCache:\s*\{\s*accountId:\s*options\.accountId,\s*folder:\s*sentFolderPath,\s*uid:\s*localSentUid/s.test(read('src/renderer/App.tsx')),
  'renderer scheduled send must pass the local Sent identity to mail:send for attachment cache linking',
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
    /shell\.openPath/.test(mailIpcTs) &&
    /attachmentDiagnostics/.test(mailIpcTs),
  'download/open must use safe main-process file handling and emit minimal attachment diagnostics',
);

assert(
  /formatAttachmentActionError/.test(mailIpcTs) &&
    /ATTACHMENT_OPEN_FAILED_MESSAGE/.test(mailIpcTs) &&
    /ATTACHMENT_SYNC_PENDING_MESSAGE/.test(mailIpcTs),
  'attachment actions must wrap raw open/fetch failures in user-friendly localized messages',
);

assert(
  /fs\.promises\.access\(filePath/.test(mailIpcTs) &&
    !/return\s*\{\s*success:\s*false,\s*filePath,\s*error:\s*openError/.test(mailIpcTs) &&
    /formatAttachmentActionError\(openError,\s*'open'/.test(mailIpcTs),
  'openAttachment must verify the temp file exists and must not return raw shell.openPath errors like Command failed',
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
