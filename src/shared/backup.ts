import type { MailHistoryRange } from './mailSyncSettings';

export interface MailBackupScope {
  accountId?: number;
  folder?: string;
  mailIds?: string[];
  historyRange?: MailHistoryRange;
}

export interface MailBackupRequest {
  mode: 'export' | 'import';
  sourcePath?: string;
  destinationPath?: string;
  scope?: MailBackupScope;
  includeAttachments?: boolean;
  overwriteExisting?: boolean;
}

export interface MailBackupProgress {
  mode: MailBackupRequest['mode'];
  stage: 'preparing' | 'reading' | 'writing' | 'finalizing';
  processed: number;
  total: number;
  currentItem?: string;
  message?: string;
}

export interface MailBackupResult {
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
