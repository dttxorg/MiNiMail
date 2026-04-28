const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const outgoingTypes = read('src/shared/outgoingAttachments.ts');
const app = read('src/renderer/App.tsx');
const compose = read('src/renderer/components/ComposeDialog.tsx');
const ipc = read('src/main/ipc/mail.ts');
const smtp = read('src/main/services/smtp.ts');
const preload = read('src/preload/index.ts');

assert(outgoingTypes.includes("kind: 'localFile'"), 'outgoing attachment schema should support localFile');
assert(outgoingTypes.includes("kind: 'originalMailAttachment'"), 'outgoing attachment schema should support originalMailAttachment');
assert(outgoingTypes.includes('cacheId?: string'), 'local attachments should support durable cache ids for draft/restart recovery');
assert(outgoingTypes.includes('attachmentCacheId'), 'original attachments should be referenced by trusted cache id');

assert(preload.includes('mail:selectOutgoingAttachments'), 'preload should whitelist outgoing attachment picker IPC');
assert(ipc.includes("ipcMain.handle('mail:selectOutgoingAttachments'"), 'main process should expose attachment picker IPC');
assert(ipc.includes('outgoingAttachmentTokens'), 'main process should keep legacy local file paths behind tokens');
assert(ipc.includes('writeOutgoingAttachmentCacheFromPath'), 'local outgoing attachments should be copied into a durable outgoing cache');
assert(ipc.includes('readOutgoingAttachmentCache'), 'send should be able to restore local outgoing attachments from durable cache');
assert(ipc.includes('resolveOutgoingAttachmentsForSend'), 'main process should resolve attachment content only during send');
assert(ipc.includes('fetchMailAttachmentContent'), 'original forwarded attachments should be loaded by the existing attachment fetch path');
assert(ipc.includes('writeSentAttachmentCache'), 'resolved outgoing attachments should be copied into a durable Sent attachment cache');
assert(ipc.includes('updateCachedAttachmentLocalCachePath'), 'resolved outgoing attachments should link the durable cache path back to Sent metadata');

assert(ipc.includes('LOCAL_ATTACHMENT_READ_ERROR_MESSAGE'), 'local attachment failures should have a dedicated user-facing error');
assert(ipc.includes('ORIGINAL_ATTACHMENT_READ_ERROR_MESSAGE'), 'original attachment failures should have a dedicated user-facing error');
assert(ipc.includes('OAUTH_ATTACHMENT_READ_ERROR_MESSAGE'), 'OAuth attachment failures should have a dedicated user-facing error');
assert(ipc.includes('无法读取本地附件，请重新选择文件。'), 'missing local attachment files should show readable Chinese guidance');
assert(ipc.includes('原邮件附件缓存不存在，请重新打开原邮件后再转发。'), 'missing original attachment metadata should show readable Chinese guidance');
assert(ipc.includes('账号认证暂时不可用，请重新连接账号或稍后重试。'), 'OAuth attachment failures should show readable Chinese guidance');
assert(!/(鍘熼偖|璇烽噸|鏃犳硶|绋嶅悗|锛|銆)/.test(ipc), 'attachment error messages must not contain mojibake');

const resolverStart = ipc.indexOf('async function resolveOutgoingAttachmentsForSend');
const resolverEnd = ipc.indexOf('function normalizeSentAttachmentCacheTarget', resolverStart);
const resolverBody = ipc.slice(resolverStart, resolverEnd);
const localBranchStart = resolverBody.indexOf('isLocalFileOutgoingAttachment(attachment)');
const originalBranchStart = resolverBody.indexOf('isOriginalMailOutgoingAttachment(attachment)');
const localBranch = resolverBody.slice(localBranchStart, originalBranchStart);
const originalBranch = resolverBody.slice(originalBranchStart);
assert(localBranchStart >= 0 && originalBranchStart > localBranchStart, 'resolver should keep local and original attachment branches separate through strict type guards');
assert(!localBranch.includes('fetchMailAttachmentContent'), 'local file attachments must not trigger IMAP/original attachment fetch');
assert(!localBranch.includes('getCachedAttachmentMetadata'), 'local file attachments must not query original attachment metadata');
assert(localBranch.includes('readOutgoingAttachmentCache(attachment.cacheId)'), 'local file attachments should prefer durable cache before token fallback');
assert(localBranch.includes('durable outgoing attachment cache unavailable; falling back to active token'), 'local file attachments should support legacy token fallback when cache is unavailable');
assert(!resolverBody.match(/resolveOutgoingAttachmentsForSend\s*\([^)]*accountId/), 'attachment resolver must not use sending account id for original attachments');
assert(originalBranch.includes('const sourceAccountId = Number(attachment.accountId)'), 'original attachment fetch should use sourceAccountId from attachment metadata');
assert(originalBranch.includes('getCachedAttachmentMetadata(sourceAccountId'), 'original attachment metadata lookup should use sourceAccountId');
assert(originalBranch.includes('fetchMailAttachmentContent(sourceAccountId'), 'original attachment content fetch should use sourceAccountId');
assert(originalBranch.includes('bypassOAuthCooldown: true'), 'user-triggered original attachment send should retry beyond stale OAuth cooldown before failing');
assert(originalBranch.includes('ORIGINAL_ATTACHMENT_METADATA_MISSING_MESSAGE'), 'missing metadata should not use the generic original attachment read error');

assert(compose.includes('handleAddAttachments'), 'compose dialog should add local attachments');
assert(compose.includes('removeOutgoingAttachment'), 'compose dialog should allow removing outgoing attachments');
assert(compose.includes('outgoingAttachments'), 'compose dialog should pass outgoingAttachments to send');
assert(compose.includes("quotedOriginal?.mode !== 'forward'"), 'only forwards should auto include original attachments');
assert(compose.includes('normalizeOutgoingAttachments'), 'compose dialog should normalize restored outgoing attachments');
assert(compose.includes('normalizeOutgoingAttachments(initialOutgoingAttachments)'), 'initial local attachments should remain localFile after restore');
assert(app.includes('normalizeOutgoingAttachments(parsed.outgoingAttachments)'), 'persisted draft attachments should be normalized on restore');

const handleSendStart = app.indexOf('const handleSendMail = async');
const handleSendEnd = app.indexOf('const handleSaveAttempt', handleSendStart);
const handleSend = app.slice(handleSendStart, handleSendEnd);
assert(handleSend.includes('outgoingAttachments'), 'scheduled payload should carry outgoing attachment metadata');
assert(handleSend.includes('hasAttachments: outgoingAttachments.length > 0'), 'optimistic sent record should expose attachment state');
assert(handleSend.includes('sentCache:') && handleSend.includes('uid: localSentUid'), 'scheduled send should pass local Sent identity for durable attachment caching');
assert(handleSend.includes('const runScheduledSend = async () =>'), 'SMTP send should stay inside scheduled send worker');
assert(handleSend.includes('timer = setTimeout(() =>') && handleSend.includes('void runScheduledSend();'), 'scheduled send worker should only run after undo window timer');

assert(smtp.includes('attachments?: SendMailAttachment[]'), 'SMTP options should support MIME attachments');
assert(smtp.includes('attachments: attachments.map'), 'SMTP send should pass attachments to nodemailer');

console.log('mail outgoing attachments tests passed');
