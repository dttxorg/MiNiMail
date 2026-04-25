import type { GenericFolderId } from '../../shared/mailFolders';

export type StandardFolderId = Exclude<GenericFolderId, 'other'>;

export const STANDARD_FOLDERS: StandardFolderId[] = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam'];

export function isStandardFolder(folder: string): folder is StandardFolderId {
  return STANDARD_FOLDERS.includes(folder as StandardFolderId);
}

export function getSyncFoldersForView(folder: string): StandardFolderId[] {
  if (folder === 'inbox' || folder === 'starred' || folder === 'github' || folder === 'unread') {
    return ['inbox'];
  }
  if (folder === 'sent') return ['sent'];
  if (folder === 'drafts') return ['drafts'];
  if (folder === 'archive') return ['archive'];
  if (folder === 'trash') return ['trash'];
  if (folder === 'spam') return ['spam'];
  return [];
}
