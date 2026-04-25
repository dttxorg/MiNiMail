const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const mailTs = read('src/main/services/mail.ts');
const mailServiceTs = read('src/main/services/mailService.ts');
const mailBodyLoaderTs = read('src/renderer/utils/mailBodyLoader.ts');
const useMailTs = read('src/renderer/hooks/useMail.ts');
const mailDetailTs = read('src/renderer/components/MailDetail.tsx');
const mailCacheQueryTs = read('src/shared/mailCacheQuery.ts');

assert(
  /bodyStructure:\s*true/.test(mailTs),
  'fetchMailList must request BODYSTRUCTURE metadata for attachment detection',
);
assert(
  /bodyStructureHasDownloadableAttachment/.test(mailTs) &&
    /hasAttachments:\s*bodyStructureHasDownloadableAttachment/.test(mailTs),
  'fetchMailList must derive hasAttachments from BODYSTRUCTURE instead of hardcoding false',
);
assert(
  /disposition/.test(mailTs) &&
    /inline/.test(mailTs) &&
    /cid/.test(mailTs) &&
    /attachmentId/.test(mailTs),
  'fetchMailDetail must expose attachment metadata fields without binary content',
);
assert(
  !/parsedAttachments\s*=\s*parsed\.attachments\.map[\s\S]*content:\s*att\.content[\s\S]*return\s*\{[\s\S]*attachments:\s*parsedAttachments/.test(mailTs),
  'fetchMailDetail must not pass attachment binary content to renderer',
);
assert(
  /CREATE TABLE IF NOT EXISTS mail_attachments/.test(mailServiceTs) &&
    /INSERT OR REPLACE INTO mail_attachments/.test(mailServiceTs) &&
    /getCachedAttachments/.test(mailServiceTs),
  'mail attachment metadata must be persisted in a dedicated mail_attachments table',
);
assert(
  /const attachments = getCachedAttachments\(accountId,\s*folder,\s*uid\)/.test(mailServiceTs) &&
    /attachments\.length > 0 \? \{ attachments \}/.test(mailServiceTs),
  'getCachedBody must restore attachment metadata for restart-style cached detail loads',
);
assert(
  /attachments:\s*detail\.attachments/.test(mailServiceTs),
  'fetchFullMessage must write parsed attachment metadata into cache',
);
assert(
  /hasDownloadableAttachmentMetadata\(detail\.attachments\)/.test(mailServiceTs),
  'cached hasAttachments must ignore inline cid images when detail metadata is available',
);
assert(
  /attachments\?:\s*RendererMailDetail\['attachments'\]/.test(mailBodyLoaderTs) &&
    /cachedBody\.data\.attachments/.test(mailBodyLoaderTs),
  'renderer body loader must carry cached attachment metadata',
);
assert(
  /RendererMailAttachment/.test(useMailTs) &&
    /result\.attachments/.test(useMailTs),
  'useMail detail merge must preserve cached attachments',
);
assert(
  /Paperclip/.test(mailDetailTs) &&
    /visibleAttachments/.test(mailDetailTs) &&
    /\.filter\(\(attachment\)\s*=>\s*!attachment\.inline\)/.test(mailDetailTs),
  'MailDetail must render a minimal attachment list and hide inline cid images as normal attachments',
);
assert(
  /has_attachments/.test(mailCacheQueryTs) &&
    !/body_html/.test(mailCacheQueryTs) &&
    !/body_text/.test(mailCacheQueryTs),
  'list SQL query must keep has_attachments while avoiding body materialization',
);

console.log('mail attachments regression checks passed');
