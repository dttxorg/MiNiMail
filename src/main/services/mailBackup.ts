import fs from 'node:fs/promises';
import path from 'node:path';
import { simpleParser } from 'mailparser';
import log from 'electron-log';
import type {
  MailBackupProgress,
  MailBackupResult,
  MailExportRequest,
  MailImportRequest,
} from '../../shared/backup';
import { getAccountById } from '../database';
import { appendMessage, fetchMailList, getMailFolders } from './mail';
import {
  fetchFullMessage,
  loadCachedMailRecords,
  saveLocalMailToCache,
  type MailSummaryStored,
} from './mailService';
import {
  cancelMailBackupTask,
  isMailBackupTaskCancelled,
  runMailBackupTaskWithCleanup,
} from './mailBackupTasks';

type ProgressCallback = (progress: MailBackupProgress) => void;
type ExportSummaryLike = Pick<MailSummaryStored, 'uid' | 'subject' | 'date' | 'folder' | 'isRead'>;

export interface ParsedImportCandidate {
  path: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string;
  text: string;
  html?: string;
  snippet: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

export { cancelMailBackupTask, isMailBackupTaskCancelled, runMailBackupTaskWithCleanup };

export function sanitizeWindowsPathPart(input: string, fallback: string = 'untitled'): string {
  const trimmed = (input || '').trim();
  const normalized = trimmed
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  let value = normalized || fallback;
  if (value === '.' || value === '..') value = fallback;
  return WINDOWS_RESERVED_NAMES.has(value.toUpperCase()) ? `_${value}` : value;
}

function sanitizeExportPathSegments(input: string): string[] {
  return input
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .flatMap((part) => {
      const sanitized = sanitizeWindowsPathPart(part, '');
      if (!sanitized || sanitized === '.' || sanitized === '..') return [];
      return [sanitized];
    });
}

function getExportRootParts(request: MailExportRequest): string[] {
  if (request.scope?.accountLabel) {
    return [sanitizeWindowsPathPart(request.scope.accountLabel, `account-${request.scope.accountId ?? 'mail'}`)];
  }
  return [];
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
  const parts: string[] = [...getExportRootParts(request)];

  const selectedFolder = folderPath || request.scope?.folder || request.scope?.folderPaths?.[0];
  if (!selectedFolder) return parts;

  return [
    ...parts,
    ...sanitizeExportPathSegments(selectedFolder),
  ];
}

export function resolveExportFolderPaths(
  request: MailExportRequest,
  availableFolderPaths: string[] = [],
): string[] {
  if (request.scope?.folderPaths?.length) return request.scope.folderPaths;
  if (request.scope?.folder) return [request.scope.folder];
  return availableFolderPaths;
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

export function shouldFetchDetailForExport(
  mail: Pick<MailSummaryStored, 'bodyHtml' | 'bodyText'>,
  request: Pick<MailExportRequest, 'includeAttachments'>,
): boolean {
  if (request.includeAttachments !== false) return true;
  return !mail.bodyHtml && !mail.bodyText;
}

async function loadExportSourceMails(
  accountId: number,
  folderPath: string,
  request: Pick<MailExportRequest, 'filters'>,
): Promise<MailSummaryStored[]> {
  const cached = loadCachedMailRecords(accountId, folderPath);
  if (cached.length > 0) {
    return cached;
  }

  const historySince = request.filters?.startDate ? new Date(request.filters.startDate) : null;
  const pageSize = 200;
  const remote: MailSummaryStored[] = [];
  let offset = 0;

  while (true) {
    const batch = await fetchMailList(accountId, folderPath, {
      limit: pageSize,
      offset,
      historySince,
    });
    if (batch.length === 0) break;

    remote.push(...batch.map((mail) => ({
      id: mail.id,
      uid: mail.uid,
      from: mail.from,
      fromName: mail.fromName,
      to: mail.to,
      subject: mail.subject,
      date: mail.date.toISOString(),
      snippet: mail.snippet,
      hasAttachments: mail.hasAttachments,
      isRead: mail.isRead,
      isStarred: mail.isStarred,
      folder: folderPath,
      accountId,
      cachedAt: new Date().toISOString(),
      messageId: mail.messageId,
      inReplyTo: mail.inReplyTo,
    })));

    if (batch.length < pageSize) break;
    offset += batch.length;
  }

  return remote;
}

export function buildSyntheticEml(
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
    detail?.cc || messageHeaders.get('cc')
      ? `Cc: ${messageHeaders.get('cc') || encodeHeaderValue(detail?.cc)}`
      : '',
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
  return runMailBackupTaskWithCleanup(request.taskId, () => exportMailsToEmlInternal(request, onProgress));
}

async function exportMailsToEmlInternal(
  request: MailExportRequest,
  onProgress?: ProgressCallback,
): Promise<MailBackupResult> {
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

  const availableFolderPaths = (!request.scope?.folderPaths?.length && !request.scope?.folder)
    ? (await getMailFolders(accountId)).map((folder) => folder.path).filter(Boolean)
    : [];
  const folderPaths = resolveExportFolderPaths(request, availableFolderPaths);

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
  const outputRootPath = path.join(request.destinationPath, ...getExportRootParts(normalizedRequest));
  await ensureDir(outputRootPath);

  const candidateGroups = await Promise.all(folderPaths.map(async (folderPath) => {
    const sourceMails = await loadExportSourceMails(accountId, folderPath, normalizedRequest);
    return filterMailSummariesForExport(sourceMails, normalizedRequest)
      .map((mail) => ({ folderPath, mail }));
  }));
  const candidates = candidateGroups.flat();

  emitProgress(onProgress, {
    taskId: request.taskId,
    mode: 'export',
    stage: 'preparing',
    processed: 0,
    total: candidates.length,
    message: 'Preparing mail export',
    outputPath: outputRootPath,
  });

  let processed = 0;
  let exported = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const candidate of candidates) {
    if (isMailBackupTaskCancelled(request.taskId)) {
      return {
        taskId: request.taskId,
        success: false,
        cancelled: true,
        mode: 'export',
        processed,
        imported: 0,
        exported,
        skipped,
        warnings,
        outputPath: outputRootPath,
      };
    }

    const { folderPath, mail } = candidate;
    emitProgress(onProgress, {
      taskId: request.taskId,
      mode: 'export',
      stage: 'reading',
      processed,
      total: candidates.length,
      currentItem: mail.subject,
      outputPath: outputRootPath,
      message: `Reading ${mail.subject}`,
    });

    try {
      const detail = shouldFetchDetailForExport(mail, request)
        ? await fetchFullMessage(accountId, mail.uid, folderPath)
        : null;
      const destinationDir = path.join(outputRootPath, ...sanitizeExportPathSegments(folderPath));
      await ensureDir(destinationDir);
      const filePath = path.join(destinationDir, buildExportFileName(mail));
      await fs.writeFile(filePath, buildSyntheticEml(mail, detail), 'utf8');
      exported += 1;
      processed += 1;

      emitProgress(onProgress, {
        taskId: request.taskId,
        mode: 'export',
        stage: 'writing',
        processed,
        total: candidates.length,
        currentItem: mail.subject,
        outputPath: outputRootPath,
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

  emitProgress(onProgress, {
    taskId: request.taskId,
    mode: 'export',
    stage: 'finalizing',
    processed,
    total: candidates.length,
    outputPath: outputRootPath,
    message: 'Export complete',
  });

  return {
    taskId: request.taskId,
    success: true,
    mode: 'export',
    processed,
    imported: 0,
    exported,
    skipped,
    warnings,
    outputPath: outputRootPath,
  };
}

async function collectImportFilePaths(entryPath: string): Promise<string[]> {
  const stat = await fs.stat(entryPath);
  if (stat.isFile()) {
    return entryPath.toLowerCase().endsWith('.eml') ? [entryPath] : [];
  }

  if (!stat.isDirectory()) return [];

  const children = await fs.readdir(entryPath, { withFileTypes: true });
  const nested = await Promise.all(children.map((child) => collectImportFilePaths(path.join(entryPath, child.name))));
  return nested.flat();
}

function normalizeParsedAddress(value: string | undefined, fallback: string = ''): string {
  return (value || fallback).replace(/\r?\n/g, ' ').trim();
}

function stringifyAddressObject(value: unknown): string {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const address = 'address' in entry ? String(entry.address || '') : '';
        return address ? [address] : [];
      })
      .join(', ');
  }

  if (typeof value === 'object') {
    const text = 'text' in value ? String((value as { text?: string }).text || '') : '';
    if (text) return text;
    const list = 'value' in value ? (value as { value?: Array<{ address?: string }> }).value || [] : [];
    return list.map((entry) => entry.address || '').filter(Boolean).join(', ');
  }

  return '';
}

function normalizeReferences(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean).join(' ') || undefined;
  }
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }
  return undefined;
}

export async function parseImportCandidates(sourcePaths: string[]): Promise<ParsedImportCandidate[]> {
  const filePaths = Array.from(new Set((await Promise.all(sourcePaths.map((entry) => collectImportFilePaths(entry)))).flat()));
  const parsed: ParsedImportCandidate[] = [];

  for (const filePath of filePaths) {
    const buffer = await fs.readFile(filePath);
    const mail = await simpleParser(buffer);
    const fromValue = mail.from?.value?.[0];
    const text = mail.text || '';
    const html = typeof mail.html === 'string' ? mail.html : undefined;

    parsed.push({
      path: filePath,
      subject: mail.subject || '(No subject)',
      from: normalizeParsedAddress(fromValue?.address, stringifyAddressObject(mail.from)),
      fromName: normalizeParsedAddress(fromValue?.name, ''),
      to: normalizeParsedAddress(stringifyAddressObject(mail.to), ''),
      date: mail.date?.toISOString() || new Date().toISOString(),
      text,
      html,
      snippet: (text || html || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      messageId: mail.messageId || undefined,
      inReplyTo: normalizeReferences(mail.inReplyTo),
      references: normalizeReferences(mail.references),
      attachments: mail.attachments.map((attachment) => ({
        filename: attachment.filename || 'attachment',
        contentType: attachment.contentType || 'application/octet-stream',
        size: attachment.size,
      })),
    });
  }

  return parsed;
}

export async function importMailsFromEml(
  request: MailImportRequest,
  onProgress?: ProgressCallback,
): Promise<MailBackupResult> {
  return runMailBackupTaskWithCleanup(request.taskId, () => importMailsFromEmlInternal(request, onProgress));
}

async function importMailsFromEmlInternal(
  request: MailImportRequest,
  onProgress?: ProgressCallback,
): Promise<MailBackupResult> {
  if (!request.targetAccountId) {
    return {
      taskId: request.taskId,
      success: false,
      mode: 'import',
      processed: 0,
      imported: 0,
      exported: 0,
      skipped: 0,
      error: 'Target account is required for import',
    };
  }

  if (!request.targetFolder) {
    return {
      taskId: request.taskId,
      success: false,
      mode: 'import',
      processed: 0,
      imported: 0,
      exported: 0,
      skipped: 0,
      error: 'Target folder is required for import',
    };
  }

  if (!request.sourcePaths?.length) {
    return {
      taskId: request.taskId,
      success: false,
      mode: 'import',
      processed: 0,
      imported: 0,
      exported: 0,
      skipped: 0,
      error: 'At least one EML source is required for import',
    };
  }

  const account = getAccountById(request.targetAccountId);
  if (!account) {
    return {
      taskId: request.taskId,
      success: false,
      mode: 'import',
      processed: 0,
      imported: 0,
      exported: 0,
      skipped: 0,
      error: 'Target account not found',
    };
  }

  const warnings: string[] = [];
  const candidates = await parseImportCandidates(request.sourcePaths);

  emitProgress(onProgress, {
    taskId: request.taskId,
    mode: 'import',
    stage: 'preparing',
    processed: 0,
    total: candidates.length,
    message: 'Preparing mail import',
  });

  let processed = 0;
  let imported = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    if (isMailBackupTaskCancelled(request.taskId)) {
      return {
        taskId: request.taskId,
        success: false,
        cancelled: true,
        mode: 'import',
        processed,
        imported,
        exported: 0,
        skipped,
        warnings,
      };
    }

    emitProgress(onProgress, {
      taskId: request.taskId,
      mode: 'import',
      stage: 'reading',
      processed,
      total: candidates.length,
      currentItem: path.basename(candidate.path),
      message: `Importing ${candidate.subject}`,
    });

    try {
      const rawSource = await fs.readFile(candidate.path);
      const appendResult = await appendMessage(
        request.targetAccountId,
        request.targetFolder,
        rawSource,
        ['\\Seen'],
        new Date(candidate.date),
      );

      const uid = appendResult.uid ?? Date.now() + processed;
      saveLocalMailToCache({
        id: candidate.messageId || `${request.targetAccountId}:${request.targetFolder}:${uid}`,
        uid,
        from: candidate.from,
        fromName: candidate.fromName,
        to: candidate.to,
        subject: candidate.subject,
        date: candidate.date,
        snippet: candidate.snippet,
        hasAttachments: candidate.attachments.length > 0,
        isRead: true,
        isStarred: false,
        folder: request.targetFolder,
        accountId: request.targetAccountId,
        cachedAt: new Date().toISOString(),
        messageId: candidate.messageId,
        inReplyTo: candidate.inReplyTo,
        references: candidate.references,
        bodyHtml: candidate.html,
        bodyText: candidate.text,
      });

      processed += 1;
      imported += 1;

      emitProgress(onProgress, {
        taskId: request.taskId,
        mode: 'import',
        stage: 'writing',
        processed,
        total: candidates.length,
        currentItem: candidate.subject,
        message: `Imported ${candidate.subject}`,
      });
    } catch (error) {
      processed += 1;
      skipped += 1;
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${candidate.path}: ${message}`);
      log.warn('[mailBackup] Failed to import message', {
        taskId: request.taskId,
        accountId: request.targetAccountId,
        targetFolder: request.targetFolder,
        path: candidate.path,
        message,
      });
    }
  }

  emitProgress(onProgress, {
    taskId: request.taskId,
    mode: 'import',
    stage: 'finalizing',
    processed,
    total: candidates.length,
    message: 'Import complete',
  });

  return {
    taskId: request.taskId,
    success: true,
    mode: 'import',
    processed,
    imported,
    exported: 0,
    skipped,
    warnings,
  };
}
