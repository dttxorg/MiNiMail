export type OutgoingAttachmentKind = 'localFile' | 'originalMailAttachment';

export interface OutgoingAttachmentBase {
  kind: OutgoingAttachmentKind;
  id: string;
  filename: string;
  contentType?: string;
  size?: number;
}

export interface LocalFileOutgoingAttachment extends OutgoingAttachmentBase {
  kind: 'localFile';
  token?: string;
  cacheId?: string;
}

export interface OriginalMailOutgoingAttachment extends OutgoingAttachmentBase {
  kind: 'originalMailAttachment';
  accountId: number;
  folder: string;
  uid: number;
  attachmentCacheId: string | number;
}

export type OutgoingAttachmentReference =
  | LocalFileOutgoingAttachment
  | OriginalMailOutgoingAttachment;

export function isOriginalMailOutgoingAttachment(
  attachment: OutgoingAttachmentReference,
): attachment is OriginalMailOutgoingAttachment {
  return attachment.kind === 'originalMailAttachment'
    && Number.isFinite(Number(attachment.accountId))
    && Number(attachment.accountId) > 0
    && typeof attachment.folder === 'string'
    && attachment.folder.trim().length > 0
    && Number.isFinite(Number(attachment.uid))
    && Number(attachment.uid) >= 0
    && String(attachment.attachmentCacheId || '').trim().length > 0;
}

export function isLocalFileOutgoingAttachment(
  attachment: OutgoingAttachmentReference,
): attachment is LocalFileOutgoingAttachment {
  return attachment.kind === 'localFile'
    && (
      (typeof attachment.token === 'string' && attachment.token.trim().length > 0)
      || (typeof attachment.cacheId === 'string' && attachment.cacheId.trim().length > 0)
    );
}

export function normalizeOutgoingAttachments(
  attachments?: unknown,
): OutgoingAttachmentReference[] {
  if (!Array.isArray(attachments)) return [];

  const normalized: OutgoingAttachmentReference[] = [];
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') continue;
    const candidate = attachment as OutgoingAttachmentReference;

    if (isLocalFileOutgoingAttachment(candidate)) {
      const cacheId = typeof candidate.cacheId === 'string' && candidate.cacheId.trim()
        ? candidate.cacheId.trim()
        : undefined;
      const token = typeof candidate.token === 'string' && candidate.token.trim()
        ? candidate.token.trim()
        : undefined;
      normalized.push({
        kind: 'localFile',
        id: String(candidate.id || (cacheId ? `local-cache:${cacheId}` : `local:${token}`)),
        token,
        cacheId,
        filename: candidate.filename || 'attachment',
        contentType: candidate.contentType,
        size: candidate.size,
      });
      continue;
    }

    if (isOriginalMailOutgoingAttachment(candidate)) {
      normalized.push({
        kind: 'originalMailAttachment',
        id: String(candidate.id || `original:${candidate.accountId}:${candidate.folder}:${candidate.uid}:${candidate.attachmentCacheId}`),
        accountId: Number(candidate.accountId),
        folder: candidate.folder,
        uid: Number(candidate.uid),
        attachmentCacheId: candidate.attachmentCacheId,
        filename: candidate.filename || 'attachment',
        contentType: candidate.contentType,
        size: candidate.size,
      });
    }
  }

  return normalized;
}
