import type { MailHistoryRange } from './mailSyncSettings';

export interface MailBackupTaskBase {
  taskId: string;
  includeAttachments?: boolean;
}

export interface MailBackupScope {
  accountId?: number;
  folder?: string;
  mailIds?: string[];
  historyRange?: MailHistoryRange;
}

export interface MailExportRequest extends MailBackupTaskBase {
  mode: 'export';
  destinationPath: string;
  scope?: MailBackupScope;
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
  stage: 'preparing' | 'reading' | 'writing' | 'finalizing';
  processed: number;
  total: number;
  currentItem?: string;
  message?: string;
}

export interface MailBackupResult {
  taskId: string;
  success: boolean;
  mode: MailBackupRequest['mode'];
  processed: number;
  imported: number;
  exported: number;
  skipped: number;
  warnings?: string[];
  error?: string;
  outputPath?: string;
}
