import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeSentAttachmentFilename } from './sentAttachmentCache';

const OUTGOING_ATTACHMENT_CACHE_DIR = 'outgoing-attachments';
const OUTGOING_ATTACHMENT_METADATA_FILE = 'metadata.json';

export interface OutgoingAttachmentCacheEntry {
  cacheId: string;
  filename: string;
  contentType: string;
  size: number;
  localCachePath: string;
}

export interface OutgoingAttachmentCacheContent extends OutgoingAttachmentCacheEntry {
  content: Buffer;
}

function getDefaultOutgoingAttachmentCacheRoot(): string {
  // Lazy-load Electron so filesystem-only tests can pass an explicit root.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), OUTGOING_ATTACHMENT_CACHE_DIR);
}

function assertSafeCacheId(cacheId: string): string {
  const normalized = String(cacheId || '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(normalized)) {
    throw new Error('Invalid outgoing attachment cache id');
  }
  return normalized;
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

export async function writeOutgoingAttachmentCacheFromPath(
  filePath: string,
  options: { filename?: string; contentType?: string } = {},
  rootDir = getDefaultOutgoingAttachmentCacheRoot(),
): Promise<OutgoingAttachmentCacheEntry> {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new Error('Attachment path is not a file');

  const cacheId = crypto.randomUUID();
  const filename = sanitizeSentAttachmentFilename(options.filename || path.basename(filePath));
  const contentType = options.contentType || guessAttachmentContentType(filePath);
  const cacheDir = path.join(rootDir, cacheId);
  await fs.promises.mkdir(cacheDir, { recursive: true });

  const localCachePath = path.join(cacheDir, filename);
  await fs.promises.copyFile(filePath, localCachePath);

  const metadata: OutgoingAttachmentCacheEntry = {
    cacheId,
    filename,
    contentType,
    size: stat.size,
    localCachePath,
  };
  await fs.promises.writeFile(
    path.join(cacheDir, OUTGOING_ATTACHMENT_METADATA_FILE),
    JSON.stringify(metadata, null, 2),
    'utf8',
  );

  return metadata;
}

export async function readOutgoingAttachmentCache(
  cacheId: string,
  rootDir = getDefaultOutgoingAttachmentCacheRoot(),
): Promise<OutgoingAttachmentCacheContent> {
  const safeCacheId = assertSafeCacheId(cacheId);
  const cacheDir = path.join(rootDir, safeCacheId);
  const metadataPath = path.join(cacheDir, OUTGOING_ATTACHMENT_METADATA_FILE);
  const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8')) as Partial<OutgoingAttachmentCacheEntry>;

  const filename = sanitizeSentAttachmentFilename(metadata.filename);
  const contentType = metadata.contentType || 'application/octet-stream';
  const localCachePath = path.join(cacheDir, filename);
  const content = await fs.promises.readFile(localCachePath);

  return {
    cacheId: safeCacheId,
    filename,
    contentType,
    size: content.length,
    localCachePath,
    content,
  };
}
