import type { AppLanguage } from '../../shared/mailFolders';
import type {
  MailBackupProgress,
  MailBackupReadState,
  MailBackupResult,
} from '../../shared/backup';

export type BackupExportScope = 'folders' | 'account';

export interface BackupUiState {
  taskId: string;
  selectedAccountId: number | null;
  exportScope: BackupExportScope;
  selectedFolderPaths: string[];
  readState: MailBackupReadState;
  startDate: string;
  endDate: string;
  destinationPath: string;
  progress: MailBackupProgress;
  isRunning: boolean;
  lastResult: MailBackupResult | null;
}

export interface BackupOption<TValue extends string | number> {
  value: TValue;
  label: string;
}

export function createInitialBackupState(): BackupUiState {
  return {
    taskId: '',
    selectedAccountId: null,
    exportScope: 'folders',
    selectedFolderPaths: [],
    readState: 'all',
    startDate: '',
    endDate: '',
    destinationPath: '',
    progress: {
      taskId: '',
      mode: 'export',
      stage: 'preparing',
      processed: 0,
      total: 0,
    },
    isRunning: false,
    lastResult: null,
  };
}

export function getBackupReadStateOptions(language: AppLanguage): Array<BackupOption<MailBackupReadState>> {
  if (language === 'zh') {
    return [
      { value: 'all', label: '全部邮件' },
      { value: 'read', label: '仅已读' },
      { value: 'unread', label: '仅未读' },
    ];
  }

  return [
    { value: 'all', label: 'All mail' },
    { value: 'read', label: 'Read only' },
    { value: 'unread', label: 'Unread only' },
  ];
}

export function canStartBackupExport(state: BackupUiState): boolean {
  if (!state.selectedAccountId || !state.destinationPath || state.isRunning) {
    return false;
  }

  if (state.exportScope === 'folders' && state.selectedFolderPaths.length === 0) {
    return false;
  }

  return true;
}

export function summarizeBackupResult(result: MailBackupResult | null, language: AppLanguage): string {
  if (!result) return '';

  if (language === 'zh') {
    if (result.cancelled) {
      return `已取消，已导出 ${result.exported} 封，跳过 ${result.skipped} 封。`;
    }

    if (!result.success) {
      return result.error || `导出失败，已导出 ${result.exported} 封。`;
    }

    return `导出完成，共导出 ${result.exported} 封，跳过 ${result.skipped} 封。`;
  }

  if (result.cancelled) {
    return `Cancelled after exporting ${result.exported} messages and skipping ${result.skipped}.`;
  }

  if (!result.success) {
    return result.error || `Export failed after exporting ${result.exported} messages.`;
  }

  return `Export finished with ${result.exported} messages and ${result.skipped} skipped.`;
}
