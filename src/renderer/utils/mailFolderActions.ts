import { folderMatches } from '../../shared/mailFolders';

export interface FolderActionMail {
  id: string;
  folder: string;
  isRead: boolean;
}

export function shouldMarkMailReadOnOpen(
  mail: Pick<FolderActionMail, 'isRead'>,
): boolean {
  return !mail.isRead;
}

export function resolveDeleteMailAction(
  mail: Pick<FolderActionMail, 'id' | 'folder'>,
  trashFolderPath: string
): { type: 'move'; toFolder: string } | { type: 'delete' } {
  if (folderMatches(mail.folder, 'trash')) {
    return { type: 'delete' };
  }
  return { type: 'move', toFolder: trashFolderPath };
}

export function resolveArchiveMailAction(
  mail: Pick<FolderActionMail, 'id' | 'folder'>,
  archiveFolderPath: string,
  inboxFolderPath: string
): { type: 'archive' | 'unarchive'; toFolder: string } {
  if (folderMatches(mail.folder, 'archive')) {
    return { type: 'unarchive', toFolder: inboxFolderPath };
  }
  return { type: 'archive', toFolder: archiveFolderPath };
}

export function resolveArchiveOrSpamRemovalAction(
  mail: Pick<FolderActionMail, 'id' | 'folder'>,
  archiveFolderPath: string,
  inboxFolderPath: string
): { type: 'archive' | 'unarchive' | 'unspam'; toFolder: string } {
  if (folderMatches(mail.folder, 'spam')) {
    return { type: 'unspam', toFolder: inboxFolderPath };
  }
  return resolveArchiveMailAction(mail, archiveFolderPath, inboxFolderPath);
}

export function applyMailReadState<T extends FolderActionMail>(
  mails: T[],
  targetIds: Set<string>,
  read: boolean
): T[] {
  return mails.map((mail) => (
    targetIds.has(mail.id)
      ? { ...mail, isRead: read }
      : mail
  ));
}

export function resolveMailActionTargetIds(
  selectedIds: string[],
  contextEmailId?: string | null,
): string[] {
  if (contextEmailId) {
    return selectedIds.includes(contextEmailId) ? selectedIds : [contextEmailId];
  }
  return selectedIds;
}
