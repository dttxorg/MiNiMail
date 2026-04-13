import type { MailHistoryRange } from './mailSyncSettings';

export interface MailBackupTaskBase {
  taskId: string;
  includeAttachments?: boolean;
}

export type MailBackupReadState = 'all' | 'read' | 'unread';
export type MailBackupProgressStage = 'preparing' | 'reading' | 'writing' | 'finalizing' | 'cancelled';

export interface MailBackupScope {
  accountId?: number;
  folder?: string;
  folderPaths?: string[];
  mailIds?: string[];
  historyRange?: MailHistoryRange;
  accountLabel?: string;
}

export interface MailExportFilters {
  readState?: MailBackupReadState;
  startDate?: string;
  endDate?: string;
}

export interface MailExportRequest extends MailBackupTaskBase {
  mode: 'export';
  destinationPath: string;
  scope?: MailBackupScope;
  filters?: MailExportFilters;
}

export interface MailImportRequest extends MailBackupTaskBase {
  mode: 'import';
  sourcePath: string;
  targetAccountId?: number;
  targetFolder?: string;
  overwriteExisting?: boolean;
}

export type MailBackupRequest = MailExportRequest | MailImportRequest;

export interface MailBackupProgress {
  taskId: string;
  mode: MailBackupRequest['mode'];
  stage: MailBackupProgressStage;
  processed: number;
  total: number;
  currentItem?: string;
  message?: string;
  outputPath?: string;
  cancelled?: boolean;
}

export interface MailBackupResult {
  taskId: string;
  success: boolean;
  mode: MailBackupRequest['mode'];
  processed: number;
  imported: number;
  exported: number;
  skipped: number;
  cancelled?: boolean;
  warnings?: string[];
  error?: string;
  outputPath?: string;
}
