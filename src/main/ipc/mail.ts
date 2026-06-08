import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import log from 'electron-log';
import type { MailExportRequest, MailImportRequest } from '../../shared/backup';
import {
  isLocalFileOutgoingAttachment,
  isOriginalMailOutgoingAttachment,
  normalizeOutgoingAttachments,
  type OutgoingAttachmentReference,
} from '../../shared/outgoingAttachments';
import { fetchMailList, fetchMailDetail, getMailFolders, setMessageFlags, setMessageStarred, setMessageRead, deleteMessage, moveMessage, fetchMailAttachmentContent, sanitizeAttachmentFilename } from '../services/mail';
import type { MailAttachmentMetadata } from '../services/mail';
import {
  syncMails,
  subscribeStagedSyncProgress,
  fetchFullMessage as svcFetchFullMessage,
  getFolders as svcGetFolders,
  loadCachedMails,
  loadCachedLocalDrafts,
  pruneCachedMailStore,
  getCachedBody,
  updateCachedMailCategory,
  clearCachedMailScanState,
  updateCachedMailRead,
  updateCachedMailStar,
  saveLocalMailToCache,
  deleteCachedDraft,
  deleteCachedMailById,
  getCachedAttachmentMetadata,
  updateCachedAttachmentLocalCachePath,
} from '../services/mailService';
import { cancelMailBackupTask, exportMailsToEml, importMailsFromEml } from '../services/mailBackup';
import { sendMail, testSmtpConnection, type SendMailAttachment } from '../services/smtp';
import {
  readSentAttachmentCache,
  writeSentAttachmentCache,
} from '../services/sentAttachmentCache';
import {
  readOutgoingAttachmentCache,
  writeOutgoingAttachmentCacheFromPath,
} from '../services/outgoingAttachmentCache';
import {
  cancelScheduledSendJob,
  createScheduledSendJob,
  getScheduledSendJob,
  listScheduledSendJobs,
  markMissedScheduledJobs,
  markScheduledJobFailed,
  markScheduledJobSent,
  tryMarkJobSending,
  type CreateScheduledSendJobInput,
  type ScheduledSendJob,
  type ScheduledSendJobStatus,
} from '../services/scheduledSendService';
import { getAccountById } from '../database';
import type { MailHistoryRange } from '../../shared/mailSyncSettings';
import type { MailCacheRange } from '../../shared/mailSyncSettings';

let stagedSyncProgressForwarderDispose: (() => void) | null = null;
let scheduledSendSchedulerTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledSendSchedulerRunning = false;
let scheduledSendSchedulerInFlight = false;
const outgoingAttachmentTokens = new Map<string, {
  filePath: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: number;
}>();
const OUTGOING_ATTACHMENT_TOKEN_TTL_MS = 1000 * 60 * 60 * 6;
const MAX_OUTGOING_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_OUTGOING_TOTAL_BYTES = 35 * 1024 * 1024;
const LOCAL_ATTACHMENT_READ_ERROR_MESSAGE = '无法读取本地附件，请重新选择文件。';
const ORIGINAL_ATTACHMENT_READ_ERROR_MESSAGE = '无法读取原邮件附件，请重新同步邮件或移除该附件后重试。';
const ORIGINAL_ATTACHMENT_METADATA_MISSING_MESSAGE = '原邮件附件缓存不存在，请重新打开原邮件后再转发。';
const OAUTH_ATTACHMENT_READ_ERROR_MESSAGE = '账号认证暂时不可用，请重新连接账号或稍后重试。';
const SCHEDULED_SEND_SCHEDULER_MAX_DELAY_MS = 60 * 1000;

const ATTACHMENT_METADATA_MISSING_MESSAGE = '\u9644\u4ef6\u4fe1\u606f\u4e0d\u5b58\u5728\uff0c\u8bf7\u91cd\u65b0\u6253\u5f00\u90ae\u4ef6\u6216\u7a0d\u540e\u540c\u6b65\u540e\u518d\u8bd5\u3002';
const ATTACHMENT_SYNC_PENDING_MESSAGE = '\u9644\u4ef6\u6b63\u5728\u540c\u6b65\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const ATTACHMENT_DOWNLOAD_FAILED_MESSAGE = '\u9644\u4ef6\u4e0b\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';
const ATTACHMENT_OPEN_FAILED_MESSAGE = '\u65e0\u6cd5\u6253\u5f00\u9644\u4ef6\uff0c\u8bf7\u5148\u4e0b\u8f7d\u540e\u624b\u52a8\u6253\u5f00\u3002';
const ATTACHMENT_FILE_MISSING_MESSAGE = '\u9644\u4ef6\u7f13\u5b58\u6587\u4ef6\u4e0d\u5b58\u5728\uff0c\u8bf7\u91cd\u65b0\u4e0b\u8f7d\u540e\u518d\u6253\u5f00\u3002';

type AttachmentActionRequest = {
  accountId: number;
  folder: string;
  uid: number;
  attachmentCacheId: string | number;
};

type SentAttachmentCacheTarget = {
  accountId?: number;
  folder?: string;
  uid?: number;
};

function resolveAttachmentActionRequest(input: AttachmentActionRequest): {
  accountId: number;
  folder: string;
  uid: number;
  attachmentCacheId: string;
} {
  const accountId = Number(input.accountId);
  const uid = Number(input.uid);
  const folder = typeof input.folder === 'string' && input.folder.trim() ? input.folder : 'INBOX';
  const attachmentCacheId = String(input.attachmentCacheId || '');
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error('Invalid account id');
  if (!Number.isFinite(uid) || uid < 0) throw new Error('Invalid message uid');
  if (!attachmentCacheId) throw new Error('Missing attachment id');
  return { accountId, folder, uid, attachmentCacheId };
}

function getRequestWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
}

function pruneOutgoingAttachmentTokens(): void {
  const cutoff = Date.now() - OUTGOING_ATTACHMENT_TOKEN_TTL_MS;
  for (const [token, value] of outgoingAttachmentTokens.entries()) {
    if (value.createdAt < cutoff) outgoingAttachmentTokens.delete(token);
  }
}

function guessAttachmentContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const byExt: Record<string, string> = {
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.zip': 'application/zip',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return byExt[ext] || 'application/octet-stream';
}

function isOAuthAttachmentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /OAuth account temporarily unavailable|OAuth token refresh failed|Please reconnect this account|invalid_grant|authentication failed/i.test(message);
}

function toOutgoingAttachmentErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === ORIGINAL_ATTACHMENT_METADATA_MISSING_MESSAGE) {
    return ORIGINAL_ATTACHMENT_METADATA_MISSING_MESSAGE;
  }
  return isOAuthAttachmentError(error) ? OAUTH_ATTACHMENT_READ_ERROR_MESSAGE : fallback;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function normalizeScheduledSendRequest(input: unknown): CreateScheduledSendJobInput {
  const request = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const accountId = Number(request.accountId);
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error('Invalid account id');

  const account = getAccountById(accountId);
  if (!account) throw new Error('Account not found');

  const scheduledAtValue = request.scheduledAt;
  if (!(typeof scheduledAtValue === 'string' || scheduledAtValue instanceof Date)) {
    throw new Error('Invalid scheduled time');
  }
  const scheduledAt = new Date(scheduledAtValue);
  if (!Number.isFinite(scheduledAt.getTime())) throw new Error('Invalid scheduled time');

  return {
    localSendId: typeof request.localSendId === 'string' ? request.localSendId : undefined,
    accountId,
    fromEmail: typeof request.fromEmail === 'string' ? request.fromEmail : account.email,
    to: Array.isArray(request.to) ? request.to : [],
    cc: Array.isArray(request.cc) ? request.cc : [],
    bcc: Array.isArray(request.bcc) ? request.bcc : [],
    subject: typeof request.subject === 'string' ? request.subject : '',
    bodyText: typeof request.bodyText === 'string' ? request.bodyText : '',
    bodyHtml: typeof request.bodyHtml === 'string' ? request.bodyHtml : undefined,
    editableBody: typeof request.editableBody === 'string' ? request.editableBody : '',
    outgoingAttachments: Array.isArray(request.outgoingAttachments) ? request.outgoingAttachments : [],
    draftPayload: request.draftPayload,
    sentFolderPath: typeof request.sentFolderPath === 'string' ? request.sentFolderPath : undefined,
    scheduledAt,
  };
}

function normalizeScheduledSendStatusFilter(value: unknown): ScheduledSendJobStatus | ScheduledSendJobStatus[] | undefined {
  const valid = new Set<ScheduledSendJobStatus>(['scheduled', 'sending', 'sent', 'cancelled', 'failed', 'missed']);
  if (typeof value === 'string' && valid.has(value as ScheduledSendJobStatus)) {
    return value as ScheduledSendJobStatus;
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is ScheduledSendJobStatus =>
      typeof item === 'string' && valid.has(item as ScheduledSendJobStatus)
    );
  }
  return undefined;
}

type ScheduledSendTrigger = 'manual' | 'auto';

function emitScheduledSendUpdate(payload: {
  trigger: ScheduledSendTrigger;
  status: ScheduledSendJobStatus | 'skipped';
  jobId: string;
  job?: unknown;
  error?: string;
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (typeof win.isDestroyed === 'function' && win.isDestroyed()) continue;
      if (typeof win.webContents?.isDestroyed === 'function' && win.webContents.isDestroyed()) continue;
      win.webContents.send('mail:scheduledSendUpdated', payload);
    } catch (error) {
      log.error('[scheduledSend] failed to emit update:', error instanceof Error ? error.message : String(error));
    }
  }
}

function getScheduledSentLocalUid(job: ScheduledSendJob): number {
  const fromLocalSendId = Number(String(job.localSendId || '').replace(/\D/g, '').slice(-12));
  if (Number.isFinite(fromLocalSendId) && fromLocalSendId > 0) return Math.floor(fromLocalSendId);

  const fromCreatedAt = new Date(job.createdAt).getTime();
  if (Number.isFinite(fromCreatedAt) && fromCreatedAt > 0) return Math.floor(fromCreatedAt);

  return Date.now();
}

function buildScheduledSentAttachmentMetadata(attachments: OutgoingAttachmentReference[]): MailAttachmentMetadata[] {
  return normalizeOutgoingAttachments(attachments).map((attachment) => ({
    cacheId: attachment.id,
    filename: attachment.filename || 'attachment',
    contentType: attachment.contentType || 'application/octet-stream',
    size: Number.isFinite(Number(attachment.size)) ? Math.max(0, Math.floor(Number(attachment.size))) : 0,
    inline: false,
    disposition: 'attachment',
  }));
}

function cacheScheduledSentMail(
  job: ScheduledSendJob,
  options: {
    status: 'sending' | 'sent' | 'failed';
    localSentUid: number;
    messageId?: string;
    error?: string;
  },
): void {
  const account = getAccountById(job.accountId);
  const fromEmail = job.fromEmail || account?.email || '';
  const fromName = account?.display_name || (fromEmail ? fromEmail.split('@')[0] : '');
  const now = new Date().toISOString();
  const localMessageId = `<scheduled-${job.id}@minimail>`;
  const attachments = buildScheduledSentAttachmentMetadata(job.outgoingAttachments as OutgoingAttachmentReference[]);

  saveLocalMailToCache({
    id: `${job.accountId}:scheduled:${job.localSendId}`,
    uid: options.localSentUid,
    from: job.fromEmail || account?.email || '',
    fromName,
    to: job.to.join(', '),
    subject: job.subject,
    date: now,
    snippet: (job.bodyText || '').trim().slice(0, 160),
    hasAttachments: attachments.length > 0,
    isRead: true,
    isStarred: false,
    folder: job.sentFolderPath || 'Sent',
    accountId: job.accountId,
    cachedAt: now,
    messageId: options.messageId || localMessageId,
    bodyHtml: job.bodyHtml,
    bodyText: job.bodyText,
    localSendId: job.localSendId,
    deliveryState: options.status,
    deliveryError: options.error,
    attachments,
  });
}

async function sendScheduledJobNow(jobId: string, trigger: ScheduledSendTrigger): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  let locked = false;
  try {
    const existing = getScheduledSendJob(jobId);
    if (!existing) throw new Error('Scheduled send job not found');

    if (trigger === 'manual') {
      if (!['missed', 'failed'].includes(existing.status)) {
        throw new Error('Scheduled send job is not ready for manual resend');
      }
    } else {
      const scheduledAt = new Date(existing.scheduledAt).getTime();
      if (existing.status !== 'scheduled' || !Number.isFinite(scheduledAt) || scheduledAt > Date.now()) {
        return { success: false, data: existing, error: 'Scheduled send job is not due' };
      }
    }

    locked = tryMarkJobSending(jobId);
    if (!locked) {
      const current = getScheduledSendJob(jobId);
      return { success: false, error: 'Scheduled send job is already processing', data: current };
    }

    const job = getScheduledSendJob(jobId);
    if (!job) throw new Error('Scheduled send job not found');
    emitScheduledSendUpdate({ trigger, status: 'sending', jobId, job });

    const localSentUid = getScheduledSentLocalUid(job);
    cacheScheduledSentMail(job, {
      status: 'sending',
      localSentUid,
    });

    const attachments = await resolveOutgoingAttachmentsForSend(
      normalizeOutgoingAttachments(job.outgoingAttachments as OutgoingAttachmentReference[]),
      {
        accountId: job.accountId,
        folder: job.sentFolderPath || 'Sent',
        uid: localSentUid,
      },
    );
    const result = await sendMail({
      accountId: job.accountId,
      to: job.to,
      cc: job.cc,
      bcc: job.bcc,
      subject: job.subject,
      body: job.bodyHtml || job.bodyText,
      isHtml: Boolean(job.bodyHtml),
      attachments,
    });

    if (!result.success) {
      const failed = markScheduledJobFailed(jobId, result.message || 'Scheduled send failed');
      cacheScheduledSentMail(job, {
        status: 'failed',
        localSentUid,
        error: result.message || 'Scheduled send failed',
      });
      emitScheduledSendUpdate({ trigger, status: 'failed', jobId, job: failed, error: result.message || 'Scheduled send failed' });
      return { success: false, error: result.message || 'Scheduled send failed', data: failed };
    }

    const sent = markScheduledJobSent(jobId, result.messageId);
    cacheScheduledSentMail(job, {
      status: 'sent',
      localSentUid,
      messageId: result.messageId,
    });
    emitScheduledSendUpdate({ trigger, status: 'sent', jobId, job: sent });
    return { success: true, data: sent };
  } catch (err) {
    const error = err as Error;
    const failed = locked ? markScheduledJobFailed(jobId, error) : getScheduledSendJob(jobId);
    emitScheduledSendUpdate({ trigger, status: failed?.status || 'skipped', jobId, job: failed, error: error.message });
    log.error('[scheduledSend] send job failed:', {
      id: jobId,
      trigger,
      error: error.message,
    });
    return { success: false, error: error.message, data: failed };
  }
}

function scheduleNextScheduledSendCheck(): void {
  if (!scheduledSendSchedulerRunning) return;
  if (scheduledSendSchedulerTimer) {
    clearTimeout(scheduledSendSchedulerTimer);
    scheduledSendSchedulerTimer = null;
  }

  let delay = SCHEDULED_SEND_SCHEDULER_MAX_DELAY_MS;
  try {
    const jobs = listScheduledSendJobs({ status: 'scheduled' });
    const now = Date.now();
    const nextDueAt = jobs.reduce<number | null>((earliest, job) => {
      const value = new Date(job.scheduledAt).getTime();
      if (!Number.isFinite(value)) return earliest;
      if (earliest === null || value < earliest) return value;
      return earliest;
    }, null);
    if (nextDueAt !== null) {
      delay = Math.min(Math.max(nextDueAt - now, 0), SCHEDULED_SEND_SCHEDULER_MAX_DELAY_MS);
    }
  } catch (error) {
    log.error('[scheduledSend] failed to schedule next check:', error instanceof Error ? error.message : String(error));
  }

  scheduledSendSchedulerTimer = setTimeout(() => {
    void runScheduledSendSchedulerTick();
  }, delay);
  if (typeof scheduledSendSchedulerTimer.unref === 'function') scheduledSendSchedulerTimer.unref();
}

async function runScheduledSendSchedulerTick(): Promise<void> {
  if (!scheduledSendSchedulerRunning) return;
  if (scheduledSendSchedulerInFlight) {
    scheduleNextScheduledSendCheck();
    return;
  }

  scheduledSendSchedulerInFlight = true;
  try {
    const now = Date.now();
    const dueJobs = listScheduledSendJobs({ status: 'scheduled' }).filter((job) => {
      const scheduledAt = new Date(job.scheduledAt).getTime();
      return Number.isFinite(scheduledAt) && scheduledAt <= now;
    });
    for (const job of dueJobs) {
      await sendScheduledJobNow(job.id, 'auto');
    }
  } catch (error) {
    log.error('[scheduledSend] scheduler tick failed:', error instanceof Error ? error.message : String(error));
  } finally {
    scheduledSendSchedulerInFlight = false;
    scheduleNextScheduledSendCheck();
  }
}

export function startScheduledSendScheduler(): void {
  if (scheduledSendSchedulerRunning) return;
  scheduledSendSchedulerRunning = true;
  scheduleNextScheduledSendCheck();
  log.info('[scheduledSend] scheduler started');
}

export function stopScheduledSendScheduler(): void {
  scheduledSendSchedulerRunning = false;
  if (scheduledSendSchedulerTimer) {
    clearTimeout(scheduledSendSchedulerTimer);
    scheduledSendSchedulerTimer = null;
  }
  log.info('[scheduledSend] scheduler stopped');
}

function formatAttachmentActionError(error: unknown, action: 'download' | 'open'): string {
  const message = getErrorMessage(error);
  if (!message) return action === 'open' ? ATTACHMENT_OPEN_FAILED_MESSAGE : ATTACHMENT_DOWNLOAD_FAILED_MESSAGE;
  if (message === 'cancelled') return 'cancelled';
  if (message === ATTACHMENT_METADATA_MISSING_MESSAGE || /Attachment metadata not found/i.test(message)) {
    return ATTACHMENT_METADATA_MISSING_MESSAGE;
  }
  if (isOAuthAttachmentError(error)) return OAUTH_ATTACHMENT_READ_ERROR_MESSAGE;
  if (/ENOENT|no such file|cannot find|not found/i.test(message) && /file|path|cache/i.test(message)) {
    return ATTACHMENT_FILE_MISSING_MESSAGE;
  }
  if (/Message not found|Attachment content not found|missing_part_id|part_fetch_failed/i.test(message)) {
    return ATTACHMENT_SYNC_PENDING_MESSAGE;
  }
  if (action === 'open' && /Command failed|openPath|No application|not associated|access denied/i.test(message)) {
    return ATTACHMENT_OPEN_FAILED_MESSAGE;
  }
  return action === 'open' ? ATTACHMENT_OPEN_FAILED_MESSAGE : ATTACHMENT_DOWNLOAD_FAILED_MESSAGE;
}

async function resolveOutgoingAttachmentsForSend(
  attachments?: OutgoingAttachmentReference[],
  sentCache?: SentAttachmentCacheTarget,
): Promise<SendMailAttachment[]> {
  const normalizedAttachments = normalizeOutgoingAttachments(attachments);
  if (normalizedAttachments.length === 0) return [];
  pruneOutgoingAttachmentTokens();

  const resolved: SendMailAttachment[] = [];
  let totalBytes = 0;
  const sentCacheTarget = normalizeSentAttachmentCacheTarget(sentCache);

  for (const attachment of normalizedAttachments) {
    if (isLocalFileOutgoingAttachment(attachment)) {
      try {
        let resolvedAttachment: SendMailAttachment | null = null;
        let resolvedSize = 0;

        if (attachment.cacheId) {
          try {
            const cached = await readOutgoingAttachmentCache(attachment.cacheId);
            if (cached.size > MAX_OUTGOING_ATTACHMENT_BYTES) throw new Error('Attachment is too large');
            resolvedSize = cached.size;
            resolvedAttachment = {
              filename: cached.filename,
              contentType: cached.contentType,
              content: cached.content,
            };
          } catch (error) {
            if (!attachment.token) throw error;
            log.warn('[mail] durable outgoing attachment cache unavailable; falling back to active token', {
              cacheId: attachment.cacheId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (!resolvedAttachment && attachment.token) {
          const token = outgoingAttachmentTokens.get(attachment.token);
          if (!token) throw new Error('Attachment token no longer available');
          const stat = await fs.promises.stat(token.filePath);
          if (!stat.isFile()) throw new Error('Attachment path is not a file');
          if (stat.size > MAX_OUTGOING_ATTACHMENT_BYTES) throw new Error('Attachment is too large');
          resolvedSize = stat.size;
          resolvedAttachment = {
            filename: token.filename,
            contentType: token.contentType,
            content: await fs.promises.readFile(token.filePath),
          };
        }

        if (!resolvedAttachment) throw new Error('Attachment cache no longer available');

        totalBytes += resolvedSize;
        if (totalBytes > MAX_OUTGOING_TOTAL_BYTES) throw new Error('Total attachment size is too large');
        await persistSentAttachmentCache(sentCacheTarget, attachment, resolvedAttachment);
        resolved.push(resolvedAttachment);
      } catch (error) {
        log.warn('[mail] failed to resolve local outgoing attachment', {
          hasCacheId: Boolean(attachment.cacheId),
          hasToken: attachment.token ? outgoingAttachmentTokens.has(attachment.token) : false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(LOCAL_ATTACHMENT_READ_ERROR_MESSAGE);
      }
      continue;
    }

    if (isOriginalMailOutgoingAttachment(attachment)) {
      const sourceAccountId = Number(attachment.accountId);
      const uid = Number(attachment.uid);
      const folder = String(attachment.folder || 'INBOX');
      const attachmentCacheId = String(attachment.attachmentCacheId || '');
      try {
        if (!Number.isFinite(sourceAccountId) || sourceAccountId <= 0 || !Number.isFinite(uid) || uid < 0 || !attachmentCacheId) {
          throw new Error('Invalid original attachment reference');
        }
        const metadata = getCachedAttachmentMetadata(sourceAccountId, folder, uid, attachmentCacheId);
        if (!metadata) throw new Error(ORIGINAL_ATTACHMENT_METADATA_MISSING_MESSAGE);
        const loaded = await fetchMailAttachmentContent(sourceAccountId, uid, folder, metadata, { bypassOAuthCooldown: true });
        totalBytes += loaded.content.length;
        if (totalBytes > MAX_OUTGOING_TOTAL_BYTES) throw new Error('Total attachment size is too large');
        const resolvedAttachment: SendMailAttachment = {
          filename: sanitizeAttachmentFilename(loaded.filename || metadata.filename || attachment.filename),
          contentType: loaded.contentType || metadata.contentType || attachment.contentType || 'application/octet-stream',
          content: loaded.content,
        };
        await persistSentAttachmentCache(sentCacheTarget, attachment, resolvedAttachment);
        resolved.push(resolvedAttachment);
      } catch (error) {
        log.warn('[mail] failed to resolve original outgoing attachment', {
          sourceAccountId: Number.isFinite(sourceAccountId) ? sourceAccountId : undefined,
          folder,
          uid: Number.isFinite(uid) ? uid : undefined,
          attachmentCacheId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(toOutgoingAttachmentErrorMessage(error, ORIGINAL_ATTACHMENT_READ_ERROR_MESSAGE));
      }
    }
  }

  return resolved;
}

function normalizeSentAttachmentCacheTarget(
  sentCache?: SentAttachmentCacheTarget,
): { accountId: number; folder: string; uid: number } | null {
  if (!sentCache) return null;
  const accountId = Number(sentCache.accountId);
  const uid = Number(sentCache.uid);
  const folder = String(sentCache.folder || '').trim();
  if (!Number.isFinite(accountId) || accountId <= 0 || !Number.isFinite(uid) || uid < 0 || !folder) {
    return null;
  }
  return { accountId, folder, uid };
}

async function persistSentAttachmentCache(
  sentCacheTarget: { accountId: number; folder: string; uid: number } | null,
  attachment: OutgoingAttachmentReference,
  resolvedAttachment: SendMailAttachment,
): Promise<void> {
  if (!sentCacheTarget) return;
  try {
    const cached = await writeSentAttachmentCache({
      filename: resolvedAttachment.filename,
      contentType: resolvedAttachment.contentType,
      content: resolvedAttachment.content,
    });
    updateCachedAttachmentLocalCachePath(
      sentCacheTarget.accountId,
      sentCacheTarget.folder,
      sentCacheTarget.uid,
      String(attachment.id),
      cached.localCachePath,
    );
  } catch (error) {
    log.warn('[mail] failed to persist sent attachment cache', {
      attachmentId: attachment.id,
      accountId: sentCacheTarget.accountId,
      folder: sentCacheTarget.folder,
      uid: sentCacheTarget.uid,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function loadAttachmentForAction(request: AttachmentActionRequest) {
  const { accountId, folder, uid, attachmentCacheId } = resolveAttachmentActionRequest(request);
  const metadata = getCachedAttachmentMetadata(accountId, folder, uid, attachmentCacheId);
  if (!metadata) throw new Error(ATTACHMENT_METADATA_MISSING_MESSAGE);
  if (metadata.localCachePath) {
    try {
      const cachedAttachment = await readSentAttachmentCache(metadata);
      if (cachedAttachment) {
        return {
          filename: cachedAttachment.filename,
          contentType: cachedAttachment.contentType,
          content: cachedAttachment.content,
          diagnostics: {
            method: 'localCache' as const,
            fetchMs: 0,
            parseMs: 0,
          },
        };
      }
    } catch (error) {
      log.warn('[mail] sent attachment cache unavailable; falling back to IMAP/source', {
        attachmentCacheId,
        accountId,
        folder,
        uid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return fetchMailAttachmentContent(accountId, uid, folder, metadata);
}

function logAttachmentDiagnostics(
  action: 'download' | 'open',
  request: AttachmentActionRequest,
  attachment: Awaited<ReturnType<typeof loadAttachmentForAction>>,
  writeMs: number,
  totalMs: number,
): void {
  const resolved = resolveAttachmentActionRequest(request);
  const diagnostics = attachment.diagnostics;
  log.info('[mail] attachmentDiagnostics', {
    action,
    attachmentCacheId: resolved.attachmentCacheId,
    hasPartId: diagnostics?.method === 'partId' || diagnostics?.fallbackReason === 'part_fetch_failed',
    method: diagnostics?.method ?? 'unknown',
    fallbackReason: diagnostics?.fallbackReason,
    fetchMs: diagnostics?.fetchMs ?? 0,
    parseMs: diagnostics?.parseMs ?? 0,
    writeMs,
    totalMs,
  });
}

function registerStagedSyncProgressForwarder(): void {
  if (stagedSyncProgressForwarderDispose) return;

  const unsubscribe = subscribeStagedSyncProgress((progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (typeof win.isDestroyed === 'function' && win.isDestroyed()) continue;
        if (typeof win.webContents?.isDestroyed === 'function' && win.webContents.isDestroyed()) continue;
        win.webContents.send('mail:stagedSyncProgress', progress);
      } catch (error) {
        log.error('Failed to forward staged sync progress to window:', error);
      }
    }
  });

  const cleanup = () => {
    unsubscribe();
    stagedSyncProgressForwarderDispose = null;
    app.removeListener('before-quit', cleanup);
  };

  stagedSyncProgressForwarderDispose = cleanup;
  app.once('before-quit', cleanup);
}

export function registerMailHandlers(): void {
  log.info('Registering mail IPC handlers');
  registerStagedSyncProgressForwarder();

  ipcMain.handle('mail:scheduleSend', async (_event, request: unknown) => {
    try {
      const job = createScheduledSendJob(normalizeScheduledSendRequest(request));
      scheduleNextScheduledSendCheck();
      return { success: true, data: job };
    } catch (err) {
      const error = err as Error;
      log.error('[mail] failed to create scheduled send job:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:listScheduledSends', async (_event, filter?: { status?: unknown; accountId?: unknown }) => {
    try {
      const accountId = filter?.accountId == null ? undefined : Number(filter.accountId);
      if (accountId !== undefined && (!Number.isFinite(accountId) || accountId <= 0)) {
        throw new Error('Invalid account id');
      }
      if (accountId !== undefined && !getAccountById(accountId)) {
        throw new Error('Account not found');
      }
      const jobs = listScheduledSendJobs({
        accountId,
        status: normalizeScheduledSendStatusFilter(filter?.status),
      });
      return { success: true, data: jobs };
    } catch (err) {
      const error = err as Error;
      log.error('[mail] failed to list scheduled send jobs:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:cancelScheduledSend', async (_event, id: string) => {
    try {
      const job = cancelScheduledSendJob(String(id || ''));
      scheduleNextScheduledSendCheck();
      return { success: true, data: job };
    } catch (err) {
      const error = err as Error;
      log.error('[mail] failed to cancel scheduled send job:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:getScheduledSend', async (_event, id: string) => {
    try {
      const job = getScheduledSendJob(String(id || ''));
      return { success: true, data: job };
    } catch (err) {
      const error = err as Error;
      log.error('[mail] failed to get scheduled send job:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:markMissedScheduledSends', async (_event, now?: string) => {
    try {
      const count = markMissedScheduledJobs(now || new Date());
      return { success: true, data: { count } };
    } catch (err) {
      const error = err as Error;
      log.error('[mail] failed to mark missed scheduled send jobs:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:sendScheduledNow', async (_event, id: string) => {
    const result = await sendScheduledJobNow(String(id || ''), 'manual');
    scheduleNextScheduledSendCheck();
    return result;
  });

  ipcMain.handle('mail:retryScheduledSend', async (_event, id: string) => {
    const result = await sendScheduledJobNow(String(id || ''), 'manual');
    scheduleNextScheduledSendCheck();
    return result;
  });

  // Get mail folders
  ipcMain.handle('mail:getFolders', async (_event, accountId: number) => {
    try {
      const folders = await getMailFolders(accountId);
      return { success: true, data: folders };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to get folders for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Sync mails (main entry point for refresh)
  ipcMain.handle('mail:sync', async (_event, accountId: number, folder: string, options?: { notify?: boolean; folderKind?: 'inbox' | 'other'; historyRange?: MailHistoryRange; forceHistoryRange?: boolean }) => {
    try {
      const result = await syncMails(accountId, folder, options);
      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to sync mails for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Load cached mails from SQLite (for offline/startup)
  ipcMain.handle('mail:loadCached', async (_event, accountId: number, folder: string, historyRange?: MailHistoryRange, options?: { limit?: number; offset?: number }) => {
    try {
      const cached = loadCachedMails(accountId, folder, historyRange, options);
      return { success: true, data: cached };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to load cached mails for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:loadLocalDrafts', async (_event, accountId?: number) => {
    try {
      const cached = loadCachedLocalDrafts(accountId);
      return { success: true, data: cached };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to load cached local drafts:', error);
      return { success: false, error: error.message };
    }
  });

  // Load cached body from SQLite (for session reuse without re-fetching IMAP)
  ipcMain.handle('mail:loadCachedBody', async (_event, accountId: number, uid: number, folder: string = 'INBOX') => {
    try {
      const body = getCachedBody(accountId, uid, folder);
      return { success: true, data: body };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to load cached body for account ${accountId} UID ${uid}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Fetch full message with 15s timeout
  ipcMain.handle('mail:fetchFull', async (_event, accountId: number, messageUid: number, folder: string) => {
    try {
      const detail = await svcFetchFullMessage(accountId, messageUid, folder);
      return { success: true, data: detail };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to fetch full message UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Get mail list
  ipcMain.handle('mail:getList', async (_event, accountId: number, folder: string, options: { limit?: number; offset?: number; search?: string }) => {
    try {
      const mails = await fetchMailList(accountId, folder, options);
      return { success: true, data: mails };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to get mail list for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Get mail detail
  ipcMain.handle('mail:getDetail', async (_event, accountId: number, messageUid: number, folder: string) => {
    try {
      const mail = await fetchMailDetail(accountId, messageUid, folder);
      return { success: true, data: mail };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to get mail detail for account ${accountId}, UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:downloadAttachment', async (event, request: AttachmentActionRequest) => {
    const totalStartedAt = Date.now();
    try {
      const attachment = await loadAttachmentForAction(request);
      const safeFilename = sanitizeAttachmentFilename(attachment.filename);
      const saveOptions = {
        defaultPath: path.join(app.getPath('downloads'), safeFilename),
        filters: [{ name: 'All Files', extensions: ['*'] }],
      };
      const ownerWindow = getRequestWindow(event);
      const saveResult = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, saveOptions)
        : await dialog.showSaveDialog(saveOptions);
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, error: 'cancelled' };
      }
      const writeStartedAt = Date.now();
      await fs.promises.writeFile(saveResult.filePath, attachment.content);
      const writeMs = Date.now() - writeStartedAt;
      logAttachmentDiagnostics('download', request, attachment, writeMs, Date.now() - totalStartedAt);
      return { success: true, filePath: saveResult.filePath };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to download mail attachment:', error.message);
      return { success: false, error: formatAttachmentActionError(error, 'download') };
    }
  });

  ipcMain.handle('mail:openAttachment', async (_event, request: AttachmentActionRequest) => {
    const totalStartedAt = Date.now();
    try {
      const attachment = await loadAttachmentForAction(request);
      const safeFilename = sanitizeAttachmentFilename(attachment.filename);
      const tempDir = path.join(app.getPath('temp'), 'MiNiMail', 'attachments', crypto.randomUUID());
      await fs.promises.mkdir(tempDir, { recursive: true });
      const filePath = path.join(tempDir, safeFilename);
      const writeStartedAt = Date.now();
      await fs.promises.writeFile(filePath, attachment.content);
      await fs.promises.access(filePath, fs.constants.R_OK);
      const writeMs = Date.now() - writeStartedAt;
      const openError = await shell.openPath(filePath);
      if (openError) {
        log.warn('[mail] shell.openPath failed for attachment', {
          attachmentCacheId: resolveAttachmentActionRequest(request).attachmentCacheId,
          error: openError,
        });
        return { success: false, filePath, error: formatAttachmentActionError(openError, 'open') };
      }
      logAttachmentDiagnostics('open', request, attachment, writeMs, Date.now() - totalStartedAt);
      return { success: true, filePath };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to open mail attachment:', error.message);
      return { success: false, error: formatAttachmentActionError(error, 'open') };
    }
  });

  // Fetch a single attachment's bytes (base64) and content-type without
  // triggering a save dialog. Used by the renderer to inline cid: images
  // inside sanitized email HTML.
  ipcMain.handle(
    'mail:fetchAttachmentBytes',
    async (_event, request: AttachmentActionRequest) => {
      try {
        const attachment = await loadAttachmentForAction(request);
        return {
          success: true,
          data: {
            filename: attachment.filename,
            contentType: attachment.contentType,
            contentBase64: attachment.content.toString('base64'),
            size: attachment.content.length,
          },
        };
      } catch (err) {
        const error = err as Error;
        log.warn(
          '[mail] fetchAttachmentBytes failed:',
          error.message,
        );
        return { success: false, error: error.message };
      }
    },
  );

  // Set message flags (mark as read, starred, etc.)
  ipcMain.handle('mail:setFlags', async (_event, accountId: number, messageUid: number, flags: string[], folder: string) => {
    try {
      await setMessageFlags(accountId, messageUid, flags, folder);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to set flags for account ${accountId}, UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:pruneCache', async (_event, options?: { range?: MailCacheRange; accountId?: number; folder?: string }) => {
    try {
      const changes = pruneCachedMailStore(options?.range || '1mo', options?.accountId, options?.folder);
      return { success: true, data: { changes } };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to prune mail cache:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:setStarred', async (_event, accountId: number, messageUid: number, starred: boolean, folder: string) => {
    try {
      await setMessageStarred(accountId, messageUid, starred, folder);
      updateCachedMailStar(accountId, folder, messageUid, starred);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to set starred for account ${accountId}, UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:setRead', async (_event, accountId: number, messageUid: number, read: boolean, folder: string) => {
    try {
      await setMessageRead(accountId, messageUid, read, folder);
      updateCachedMailRead(accountId, folder, messageUid, read);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to set read for account ${accountId}, UID ${messageUid}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:updateCategories', async (_event, updates: Array<{ accountId: number; uid: number; folder: string; category: string; scanResult?: string }>) => {
    try {
      for (const update of updates) {
        updateCachedMailCategory(update.accountId, update.folder, update.uid, update.category, update.scanResult);
      }
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to update cached categories:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:clearScanResults', async (_event, updates: Array<{ accountId: number; uid: number; folder: string }>) => {
    try {
      for (const update of updates) {
        clearCachedMailScanState(update.accountId, update.folder, update.uid);
      }
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to clear cached scan results:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:selectOutgoingAttachments', async (event) => {
    try {
      pruneOutgoingAttachmentTokens();
      const pickerOptions: Electron.OpenDialogOptions = {
        title: 'Select attachments',
        properties: ['openFile', 'multiSelections'],
      };
      const ownerWindow = getRequestWindow(event);
      const result = ownerWindow
        ? await dialog.showOpenDialog(ownerWindow, pickerOptions)
        : await dialog.showOpenDialog(pickerOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: [] };
      }

      const attachments: OutgoingAttachmentReference[] = [];
      let totalBytes = 0;
      for (const filePath of result.filePaths) {
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) continue;
        if (stat.size > MAX_OUTGOING_ATTACHMENT_BYTES) {
          throw new Error(`Attachment is too large: ${path.basename(filePath)}`);
        }
        totalBytes += stat.size;
        if (totalBytes > MAX_OUTGOING_TOTAL_BYTES) {
          throw new Error('Total attachment size is too large');
        }

        const filename = sanitizeAttachmentFilename(path.basename(filePath));
        const contentType = guessAttachmentContentType(filePath);
        const durableCache = await writeOutgoingAttachmentCacheFromPath(filePath, { filename, contentType });
        const token = crypto.randomUUID();
        outgoingAttachmentTokens.set(token, {
          filePath,
          filename,
          contentType,
          size: stat.size,
          createdAt: Date.now(),
        });
        attachments.push({
          kind: 'localFile',
          id: `local-cache:${durableCache.cacheId}`,
          token,
          cacheId: durableCache.cacheId,
          filename,
          contentType,
          size: stat.size,
        });
      }

      return { success: true, data: attachments };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to select outgoing attachments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:cacheLocal', async (_event, mail: {
    id: string;
    uid: number;
    from: string;
    fromName: string;
    to: string;
    subject: string;
    date: string;
    snippet: string;
    hasAttachments: boolean;
    isRead: boolean;
    isStarred: boolean;
    folder: string;
    accountId: number;
    cachedAt: string;
    messageId?: string;
    inReplyTo?: string;
    references?: string;
    bodyHtml?: string;
    bodyText?: string;
    draftPayload?: string;
    localDraftKey?: string;
    localSendId?: string;
    deliveryState?: import('../../shared/mailDeliveryState').MailDeliveryState;
    deliveryError?: string;
    category?: string;
    isScanned?: boolean;
    scanResult?: string;
    attachments?: Array<{
      cacheId?: string;
      filename: string;
      contentType: string;
      size: number;
      contentId?: string;
      disposition?: string;
      inline?: boolean;
      cid?: string;
      partId?: string;
      attachmentId?: string;
    }>;
  }) => {
    try {
      saveLocalMailToCache(mail);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to cache local mail:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:deleteCachedById', async (_event, id: string) => {
    try {
      deleteCachedMailById(id);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to delete cached local mail by id:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:deleteCachedDraft', async (_event, identity: {
    accountId?: number;
    folder?: string;
    uid?: number;
    id?: string;
    messageId?: string;
    localDraftKey?: string;
  }) => {
    try {
      deleteCachedDraft(identity || {});
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to delete cached draft:', error);
      return { success: false, error: error.message };
    }
  });

  // Get current folder for account (stored in account settings)
  ipcMain.handle('mail:getCurrentFolder', async (_event, accountId: number) => {
    try {
      const account = getAccountById(accountId);
      if (!account) {
        return { success: false, error: 'Account not found' };
      }
      return { success: true, data: 'INBOX' };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:exportEml', async (event, request: MailExportRequest) => {
    try {
      const result = await exportMailsToEml(request, (progress) => {
        event.sender.send('mail:backup-progress', progress);
      });
      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to export mail backup:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:importEml', async (event, request: MailImportRequest) => {
    try {
      const result = await importMailsFromEml(request, (progress) => {
        event.sender.send('mail:backup-progress', progress);
      });
      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to import mail backup:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('mail:cancelBackup', async (_event, taskId: string) => {
    try {
      return { success: cancelMailBackupTask(taskId) };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to cancel mail backup:', error);
      return { success: false, error: error.message };
    }
  });

  // Send email
  ipcMain.handle('mail:send', async (_event, accountId: number, options: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    isHtml?: boolean;
    outgoingAttachments?: OutgoingAttachmentReference[];
    sentCache?: SentAttachmentCacheTarget;
  }) => {
    try {
      const attachments = await resolveOutgoingAttachmentsForSend(options.outgoingAttachments, options.sentCache);
      const result = await sendMail({ accountId, ...options, attachments });
      return result;
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to send email for account ${accountId}:`, error);
      return { success: false, message: error.message };
    }
  });

  // Test SMTP connection
  ipcMain.handle('mail:testSmtp', async (_event, accountId: number) => {
    try {
      const result = await testSmtpConnection(accountId);
      return result;
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to test SMTP for account ${accountId}:`, error);
      return { success: false, message: error.message };
    }
  });

  // Delete message (move to Trash)
  ipcMain.handle('mail:delete', async (_event, accountId: number, messageUid: number, folder: string) => {
    try {
      await deleteMessage(accountId, messageUid, folder);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to delete message ${messageUid} for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Move message to another folder
  ipcMain.handle('mail:move', async (_event, accountId: number, messageUid: number, fromFolder: string, toFolder: string) => {
    try {
      await moveMessage(accountId, messageUid, fromFolder, toFolder);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to move message ${messageUid} for account ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  });

  log.info('Mail IPC handlers registered');
}
