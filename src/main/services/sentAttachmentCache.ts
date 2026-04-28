import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_SAFE_FILENAME_LENGTH = 180;

export interface SentAttachmentCacheInput {
  filename?: string;
  contentType?: string;
  content: Buffer;
}

export interface SentAttachmentCacheEntry {
  filename: string;
  contentType: string;
  size: number;
  localCachePath: string;
  content: Buffer;
}

export interface SentAttachmentCacheMetadata {
  filename?: string;
  contentType?: string;
  size?: number;
  localCachePath?: string;
}

export function sanitizeSentAttachmentFilename(filename?: string): string {
  const safe = String(filename || '')
    .replace(/\.\.[/\\]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .trim()
    .slice(0, MAX_SAFE_FILENAME_LENGTH);

  return safe || 'attachment';
}

export function getDefaultSentAttachmentCacheRoot(): string {
  // Keep electron lazy-loaded so filesystem-only tests can pass an explicit root
  // without requiring an initialized Electron app.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), 'sent-attachments');
}

export async function writeSentAttachmentCache(
  attachment: SentAttachmentCacheInput,
  rootDir = getDefaultSentAttachmentCacheRoot(),
): Promise<SentAttachmentCacheEntry> {
  const safeFilename = sanitizeSentAttachmentFilename(attachment.filename);
  const contentType = attachment.contentType || 'application/octet-stream';
  const cacheDir = path.join(rootDir, crypto.randomUUID());
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const localCachePath = path.join(cacheDir, safeFilename);
  await fs.promises.writeFile(localCachePath, attachment.content);

  return {
    filename: safeFilename,
    contentType,
    size: attachment.content.length,
    localCachePath,
    content: attachment.content,
  };
}

export async function readSentAttachmentCache(
  metadata: SentAttachmentCacheMetadata,
): Promise<SentAttachmentCacheEntry | null> {
  const localCachePath = metadata.localCachePath;
  if (!localCachePath) return null;

  const content = await fs.promises.readFile(localCachePath);
  return {
    filename: sanitizeSentAttachmentFilename(metadata.filename),
    contentType: metadata.contentType || 'application/octet-stream',
    size: content.length,
    localCachePath,
    content,
  };
}
