export type GenericFolderId = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'spam' | 'other';
export type AppLanguage = 'zh' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'ru';
export type AiLanguageCode =
  | 'Chinese'
  | 'English'
  | 'Japanese'
  | 'Korean'
  | 'Spanish'
  | 'French'
  | 'German'
  | 'Russian';

type FolderDescriptor = {
  name?: string;
  path: string;
  flags?: Iterable<string> | null;
};

function normalizeFolderValue(value?: string | null): string {
  return (typeof value === 'string' ? value : '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ');
}

function normalizeFolderFlag(value?: string | null): string {
  return (typeof value === 'string' ? value : '').trim().toLowerCase();
}

function matchesFolderCandidate(value: string, candidate: string): boolean {
  const normalizedValue = normalizeFolderValue(value);
  const normalizedCandidate = normalizeFolderValue(candidate);
  if (!normalizedValue || !normalizedCandidate) return false;
  if (normalizedValue === normalizedCandidate) return true;
  if (normalizedValue.endsWith(`/${normalizedCandidate}`)) return true;

  const lastSegment = normalizedValue.split('/').pop();
  return lastSegment === normalizedCandidate;
}

function folderMatchesKind(folderPath: string, folderId: GenericFolderId): boolean {
  return getFolderCandidateNames(folderId).some((candidate) => matchesFolderCandidate(folderPath, candidate));
}

function getFolderFlagCandidates(folderId: GenericFolderId): string[] {
  switch (folderId) {
    case 'inbox':
      return ['\\inbox', '$inbox'];
    case 'sent':
      return ['\\sent', '$sent'];
    case 'drafts':
      return ['\\drafts', '$drafts'];
    case 'archive':
      return ['\\all', '\\archive', '$archive'];
    case 'trash':
      return ['\\trash', '$trash'];
    case 'spam':
      return ['\\junk', '\\spam', '$junk', '$spam'];
    default:
      return [];
  }
}

export function folderMatchesFlags(folder: FolderDescriptor, selectedFolder: GenericFolderId): boolean {
  const folderFlags = Array.from(folder.flags ?? []).map((flag) => normalizeFolderFlag(flag));
  if (folderFlags.length === 0) return false;

  const targetFlags = new Set(getFolderFlagCandidates(selectedFolder));
  return folderFlags.some((flag) => targetFlags.has(flag));
}

export function folderKindFromPath(folderPath?: string | null): GenericFolderId {
  const value = normalizeFolderValue(folderPath);
  if (!value) return 'other';

  if (value === 'inbox' || value.endsWith('/inbox')) return 'inbox';
  if (folderMatchesKind(value, 'sent')) return 'sent';
  if (folderMatchesKind(value, 'drafts')) return 'drafts';
  if (folderMatchesKind(value, 'archive')) return 'archive';
  if (folderMatchesKind(value, 'trash')) return 'trash';
  if (folderMatchesKind(value, 'spam')) return 'spam';

  return 'other';
}

export function folderMatches(folderPath: string | undefined | null, selectedFolder: string): boolean {
  return folderKindFromPath(folderPath) === selectedFolder;
}

export function getAiLanguageFromAppLanguage(appLanguage: AppLanguage): AiLanguageCode {
  switch (appLanguage) {
    case 'zh': return 'Chinese';
    case 'ja': return 'Japanese';
    case 'ko': return 'Korean';
    case 'es': return 'Spanish';
    case 'fr': return 'French';
    case 'de': return 'German';
    case 'ru': return 'Russian';
    default: return 'English';
  }
}

export function getFolderCandidateNames(folderId: GenericFolderId): string[] {
  switch (folderId) {
    case 'inbox':
      return ['INBOX', 'Inbox', 'inbox'];
    case 'sent':
      return [
        'Sent',
        'SENT',
        'Sent Items',
        'Sent Mail',
        '[Gmail]/Sent Mail',
        '[Google Mail]/Sent Mail',
        '\u5df2\u53d1\u9001',
        '\u5df2\u53d1\u9001\u90ae\u4ef6',
        '\u5df2\u5bc4\u4ef6',
        '\u9001\u4fe1\u6e08\u307f',
        '\u9001\u4fe1\u6e08\u307f\u30e1\u30fc\u30eb',
        '\ubcf4\ub0b8\ud3b8\uc9c0\ud568',
        '\ubcf4\ub0b8\uba54\uc77c\ud568',
        'Enviados',
        '\u00c9l\u00e9ments envoy\u00e9s',
        'Gesendet',
        '\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043d\u044b\u0435',
      ];
    case 'drafts':
      return [
        'Drafts',
        'DRAFTS',
        'Draft',
        '[Gmail]/Drafts',
        '[Google Mail]/Drafts',
        '\u8349\u7a3f',
        '\u8349\u7a3f\u7bb1',
        '\u4e0b\u66f8\u304d',
        '\u4e0b\u66f8\u304d\u30e1\u30fc\u30eb',
        '\uc784\uc2dc\ubcf4\uad00\ud568',
        'Borradores',
        'Brouillons',
        'Entw\u00fcrfe',
        '\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438',
      ];
    case 'archive':
      return [
        'Archive',
        'ARCHIVE',
        'Archives',
        'All Mail',
        '[Gmail]/All Mail',
        '[Google Mail]/All Mail',
        '\u5f52\u6863',
        '\u5b58\u6863',
        '\u30a2\u30fc\u30ab\u30a4\u30d6',
        '\ubcf4\uad00\ud568',
        'Archivo',
        'Archives',
        'Archiv',
        '\u0410\u0440\u0445\u0438\u0432',
      ];
    case 'trash':
      return [
        'Trash',
        'TRASH',
        'Deleted Items',
        'Deleted Messages',
        'Bin',
        '[Gmail]/Trash',
        '[Google Mail]/Trash',
        '\u5e9f\u7eb8\u7bee',
        '\u5783\u573e\u7bb1',
        '\u30b4\u30df\u7bb1',
        '\ud734\uc9c0\ud1b5',
        'Papelera',
        'Corbeille',
        'Papierkorb',
        '\u041a\u043e\u0440\u0437\u0438\u043d\u0430',
      ];
    case 'spam':
      return [
        'Spam',
        'SPAM',
        'Junk',
        'Junk Email',
        'Junk E-mail',
        'Bulk Mail',
        'Bulk',
        '[Gmail]/Spam',
        '[Google Mail]/Spam',
        '\u5783\u573e\u90ae\u4ef6',
        '\u5f85\u5220\u9664\u90ae\u4ef6',
        '\u8ff7\u60d1\u30e1\u30fc\u30eb',
        '\uc2a4\ud338\ud568',
        'Correo no deseado',
        'Courrier ind\u00e9sirable',
        'Ind\u00e9sirables',
        'Spamverdacht',
        'Unerw\u00fcnscht',
        '\u0421\u043f\u0430\u043c',
      ];
    default:
      return [];
  }
}

export function resolveFolderPath(
  availableFolders: FolderDescriptor[] | undefined,
  selectedFolder: GenericFolderId
): string {
  if (!availableFolders || availableFolders.length === 0) {
    return selectedFolder === 'inbox' ? 'INBOX' : selectedFolder;
  }

  const candidates = getFolderCandidateNames(selectedFolder);
  const match =
    availableFolders.find((folder) => folderMatchesFlags(folder, selectedFolder))
    || availableFolders.find((folder) => folderKindFromPath(folder.path) === selectedFolder)
    || availableFolders.find((folder) => candidates.some((candidate) => matchesFolderCandidate(folder.path, candidate)))
    || availableFolders.find((folder) => folder.name && folderKindFromPath(folder.name) === selectedFolder)
    || availableFolders.find((folder) => folder.name && candidates.some((candidate) => matchesFolderCandidate(folder.name!, candidate)));

  return match?.path || (selectedFolder === 'inbox' ? 'INBOX' : selectedFolder);
}
