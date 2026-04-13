import fs from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';
import type {
  MailBackupProgress,
  MailBackupResult,
  MailExportRequest,
} from '../../shared/backup';
import { getAccountById } from '../database';
import {
  fetchFullMessage,
  loadCachedMailRecords,
  type MailSummaryStored,
} from './mailService';

type ProgressCallback = (progress: MailBackupProgress) => void;

type ExportSummaryLike = Pick<MailSummaryStored, 'uid' | 'subject' | 'date' | 'folder' | 'isRead'>;

const cancelledTaskIds = new Set<string>();
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

export function cancelMailBackupTask(taskId: string): boolean {
  if (!taskId) return false;
  cancelledTaskIds.add(taskId);
  return true;
}

export function sanitizeWindowsPathPart(input: string, fallback: string = 'untitled'): string {
  const trimmed = (input || '').trim();
  const normalized = trimmed
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const value = normalized || fallback;
  return WINDOWS_RESERVED_NAMES.has(value.toUpperCase()) ? `_${value}` : value;
}

export function buildExportFileName(mail: Pick<ExportSummaryLike, 'uid' | 'subject' | 'date'>): string {
  const date = new Date(mail.date);
  const safeDate = Number.isNaN(date.getTime())
    ? 'unknown-date'
    : date.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  const safeSubject = sanitizeWindowsPathPart(mail.subject || '', 'untitled').slice(0, 80);
  return `${safeDate}__${safeSubject}__${mail.uid}.eml`;
}

export function getExportSubdirParts(request: MailExportRequest, folderPath?: string): string[] {
  const parts: string[] = [];

  if (request.scope?.accountLabel) {
    parts.push(sanitizeWindowsPathPart(request.scope.accountLabel, `account-${request.scope.accountId ?? 'mail'}`));
  }

  const selectedFolder = folderPath || request.scope?.folder || request.scope?.folderPaths?.[0];
  if (!selectedFolder) return parts;

  return [
    ...parts,
    ...selectedFolder
      .split(/[\\/]+/)
      .map((part) => sanitizeWindowsPathPart(part, 'folder'))
      .filter(Boolean),
  ];
}

export function filterMailSummariesForExport<TMail extends ExportSummaryLike>(
  mails: TMail[],
  request: Pick<MailExportRequest, 'filters'>,
): TMail[] {
  const readState = request.filters?.readState ?? 'all';
  const startTime = request.filters?.startDate ? new Date(request.filters.startDate).getTime() : null;
  const endTime = request.filters?.endDate ? new Date(request.filters.endDate).getTime() : null;

  return mails.filter((mail) => {
    if (readState === 'read' && !mail.isRead) return false;
    if (readState === 'unread' && mail.isRead) return false;

    const mailTime = new Date(mail.date).getTime();
    if (startTime != null && Number.isFinite(startTime) && mailTime < startTime) return false;
    if (endTime != null && Number.isFinite(endTime) && mailTime > endTime) return false;
    return true;
  });
}

function emitProgress(callback: ProgressCallback | undefined, progress: MailBackupProgress): void {
  callback?.(progress);
}

function encodeHeaderValue(value: string | undefined, fallback: string = ''): string {
  return (value || fallback).replace(/\r?\n/g, ' ').trim();
}

function formatRfc2822Date(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

function buildTextPart(contentType: string, body: string): string {
  return [
    `Content-Type: ${contentType}; charset=utf-8`,
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');
}

function buildSyntheticEml(
  mail: MailSummaryStored,
  detail: Awaited<ReturnType<typeof fetchFullMessage>> | null,
): string {
  const boundary = `minnimail-${mail.uid}-${Date.now().toString(36)}`;
  const textBody = detail?.bodyText || mail.bodyText || mail.snippet || '';
  const htmlBody = detail?.bodyHtml || mail.bodyHtml || '';
  const messageHeaders = new Map<string, string>();

  for (const [key, value] of Object.entries(detail?.headers || {})) {
    if (value) messageHeaders.set(key.toLowerCase(), encodeHeaderValue(value));
  }

  const headerLines = [
    `From: ${messageHeaders.get('from') || encodeHeaderValue(mail.from)}`,
    `To: ${messageHeaders.get('to') || encodeHeaderValue(mail.to)}`,
    `Subject: ${messageHeaders.get('subject') || encodeHeaderValue(mail.subject, '(No Subject)')}`,
    `Date: ${messageHeaders.get('date') || formatRfc2822Date(mail.date)}`,
    `Message-ID: ${encodeHeaderValue(mail.messageId, `<${mail.accountId}.${mail.uid}@minnimail.local>`)}`,
    mail.inReplyTo ? `In-Reply-To: ${encodeHeaderValue(mail.inReplyTo)}` : '',
    mail.references ? `References: ${encodeHeaderValue(mail.references)}` : '',
    detail?.attachments?.length
      ? `X-MinNiMail-Attachments: ${detail.attachments.map((attachment) => sanitizeWindowsPathPart(attachment.filename || 'attachment')).join(', ')}`
      : '',
    'MIME-Version: 1.0',
    htmlBody && textBody
      ? `Content-Type: multipart/alternative; boundary="${boundary}"`
      : `Content-Type: ${htmlBody ? 'text/html' : 'text/plain'}; charset=utf-8`,
    'Content-Transfer-Encoding: 8bit',
    '',
  ].filter(Boolean);

  if (!htmlBody || !textBody) {
    const body = htmlBody || textBody;
    return `${headerLines.join('\r\n')}\r\n${body}`;
  }

  const parts = [
    `--${boundary}`,
    buildTextPart('text/plain', textBody),
    '',
    `--${boundary}`,
    buildTextPart('text/html', htmlBody),
    '',
    `--${boundary}--`,
    '',
  ];

  return `${headerLines.join('\r\n')}\r\n${parts.join('\r\n')}`;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function exportMailsToEml(
  request: MailExportRequest,
  onProgress?: ProgressCallback,
): Promise<MailBackupResult> {
  const folderPaths = request.scope?.folderPaths?.length
    ? request.scope.folderPaths
    : request.scope?.folder
      ? [request.scope.folder]
      : [];
  const accountId = request.scope?.accountId;

  if (!accountId) {
    return {
      taskId: request.taskId,
      success: false,
      mode: 'export',
      processed: 0,
      imported: 0,
      exported: 0,
      skipped: 0,
      error: 'Account is required for export',
    };
  }

  if (folderPaths.length === 0) {
    return {
      taskId: request.taskId,
      success: false,
      mode: 'export',
      processed: 0,
      imported: 0,
      exported: 0,
      skipped: 0,
      error: 'At least one folder is required for export',
    };
  }

  const account = getAccountById(accountId);
  const accountLabel = request.scope?.accountLabel || account?.email || `account-${accountId}`;
  const normalizedRequest: MailExportRequest = {
    ...request,
    scope: {
      ...request.scope,
      accountId,
      accountLabel,
      folderPaths,
    },
  };

  const candidates = folderPaths.flatMap((folderPath) =>
    filterMailSummariesForExport(loadCachedMailRecords(accountId, folderPath), normalizedRequest)
      .map((mail) => ({ folderPath, mail })),
  );

  emitProgress(onProgress, {
    taskId: request.taskId,
    mode: 'export',
    stage: 'preparing',
    processed: 0,
    total: candidates.length,
    message: 'Preparing mail export',
    outputPath: request.destinationPath,
  });

  let processed = 0;
  let exported = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const candidate of candidates) {
    if (cancelledTaskIds.has(request.taskId)) {
      cancelledTaskIds.delete(request.taskId);
      const result: MailBackupResult = {
        taskId: request.taskId,
        success: false,
        cancelled: true,
        mode: 'export',
        processed,
        imported: 0,
        exported,
        skipped,
        warnings,
        outputPath: request.destinationPath,
      };
      emitProgress(onProgress, {
        taskId: request.taskId,
        mode: 'export',
        stage: 'cancelled',
        processed,
        total: candidates.length,
        currentItem: candidate.mail.subject,
        outputPath: request.destinationPath,
        cancelled: true,
        message: 'Export cancelled',
      });
      return result;
    }

    const { folderPath, mail } = candidate;
    emitProgress(onProgress, {
      taskId: request.taskId,
      mode: 'export',
      stage: 'reading',
      processed,
      total: candidates.length,
      currentItem: mail.subject,
      outputPath: request.destinationPath,
      message: `Reading ${mail.subject}`,
    });

    try {
      const detail = (mail.bodyHtml || mail.bodyText)
        ? null
        : await fetchFullMessage(accountId, mail.uid, folderPath);
      const destinationDir = path.join(request.destinationPath, ...getExportSubdirParts(normalizedRequest, folderPath));
      await ensureDir(destinationDir);
      const filePath = path.join(destinationDir, buildExportFileName(mail));
      const emlSource = buildSyntheticEml(mail, detail);
      await fs.writeFile(filePath, emlSource, 'utf8');
      exported += 1;
      processed += 1;

      emitProgress(onProgress, {
        taskId: request.taskId,
        mode: 'export',
        stage: 'writing',
        processed,
        total: candidates.length,
        currentItem: mail.subject,
        outputPath: request.destinationPath,
        message: `Wrote ${path.basename(filePath)}`,
      });
    } catch (error) {
      skipped += 1;
      processed += 1;
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${mail.folder} #${mail.uid}: ${message}`);
      log.warn('[mailBackup] Failed to export message', {
        taskId: request.taskId,
        accountId,
        folder: mail.folder,
        uid: mail.uid,
        message,
      });
    }
  }

  cancelledTaskIds.delete(request.taskId);

  const result: MailBackupResult = {
    taskId: request.taskId,
    success: true,
    mode: 'export',
    processed,
    imported: 0,
    exported,
    skipped,
    warnings,
    outputPath: request.destinationPath,
  };

  emitProgress(onProgress, {
    taskId: request.taskId,
    mode: 'export',
    stage: 'finalizing',
    processed,
    total: candidates.length,
    outputPath: request.destinationPath,
    message: 'Export complete',
  });

  return result;
}
