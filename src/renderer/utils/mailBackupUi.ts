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
  importSourcePaths: string[];
  importTargetFolderPath: string;
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
    importSourcePaths: [],
    importTargetFolderPath: '',
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

  if (language === 'ja') {
    return [
      { value: 'all', label: 'すべてのメール' },
      { value: 'read', label: '既読のみ' },
      { value: 'unread', label: '未読のみ' },
    ];
  }

  if (language === 'ko') {
    return [
      { value: 'all', label: '모든 메일' },
      { value: 'read', label: '읽은 메일만' },
      { value: 'unread', label: '읽지 않은 메일만' },
    ];
  }

  if (language === 'es') {
    return [
      { value: 'all', label: 'Todo el correo' },
      { value: 'read', label: 'Solo leído' },
      { value: 'unread', label: 'Solo no leído' },
    ];
  }

  if (language === 'fr') {
    return [
      { value: 'all', label: 'Tous les mails' },
      { value: 'read', label: 'Lus uniquement' },
      { value: 'unread', label: 'Non lus uniquement' },
    ];
  }

  if (language === 'de') {
    return [
      { value: 'all', label: 'Alle Mails' },
      { value: 'read', label: 'Nur gelesen' },
      { value: 'unread', label: 'Nur ungelesen' },
    ];
  }

  if (language === 'ru') {
    return [
      { value: 'all', label: 'Все письма' },
      { value: 'read', label: 'Только прочитанные' },
      { value: 'unread', label: 'Только непрочитанные' },
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

export function canStartBackupImport(state: BackupUiState): boolean {
  if (!state.selectedAccountId || !state.importTargetFolderPath || state.isRunning) {
    return false;
  }

  return state.importSourcePaths.length > 0;
}

export function summarizeBackupResult(result: MailBackupResult | null, language: AppLanguage): string {
  if (!result) return '';

  if (language === 'zh') {
    if (result.mode === 'import') {
      if (result.cancelled) {
        return `已取消，已导入 ${result.imported} 封，跳过 ${result.skipped} 封。`;
      }

      if (!result.success) {
        return result.error || `导入失败，已导入 ${result.imported} 封。`;
      }

      return `导入完成，共导入 ${result.imported} 封，跳过 ${result.skipped} 封。`;
    }

    if (result.cancelled) {
      return `已取消，已导出 ${result.exported} 封，跳过 ${result.skipped} 封。`;
    }

    if (!result.success) {
      return result.error || `导出失败，已导出 ${result.exported} 封。`;
    }

    return `导出完成，共导出 ${result.exported} 封，跳过 ${result.skipped} 封。`;
  }

  if (language === 'ja') {
    if (result.mode === 'import') {
      if (result.cancelled) return `${result.imported} 件を取り込み、${result.skipped} 件をスキップしたところで中止しました。`;
      if (!result.success) return result.error || `${result.imported} 件取り込んだ時点でインポートに失敗しました。`;
      return `${result.imported} 件を取り込み、${result.skipped} 件をスキップしました。`;
    }
    if (result.cancelled) return `${result.exported} 件を書き出し、${result.skipped} 件をスキップしたところで中止しました。`;
    if (!result.success) return result.error || `${result.exported} 件を書き出した時点でエクスポートに失敗しました。`;
    return `${result.exported} 件を書き出し、${result.skipped} 件をスキップしました。`;
  }

  if (language === 'ko') {
    if (result.mode === 'import') {
      if (result.cancelled) return `${result.imported}개를 가져오고 ${result.skipped}개를 건너뛴 뒤 취소했습니다.`;
      if (!result.success) return result.error || `${result.imported}개를 가져온 뒤 가져오기에 실패했습니다.`;
      return `${result.imported}개를 가져오고 ${result.skipped}개를 건너뛰었습니다.`;
    }
    if (result.cancelled) return `${result.exported}개를 내보내고 ${result.skipped}개를 건너뛴 뒤 취소했습니다.`;
    if (!result.success) return result.error || `${result.exported}개를 내보낸 뒤 내보내기에 실패했습니다.`;
    return `${result.exported}개를 내보내고 ${result.skipped}개를 건너뛰었습니다.`;
  }

  if (language === 'es') {
    if (result.mode === 'import') {
      if (result.cancelled) return `Cancelado tras importar ${result.imported} correos y omitir ${result.skipped}.`;
      if (!result.success) return result.error || `La importación falló tras importar ${result.imported} correos.`;
      return `Importación completada con ${result.imported} correos y ${result.skipped} omitidos.`;
    }
    if (result.cancelled) return `Cancelado tras exportar ${result.exported} correos y omitir ${result.skipped}.`;
    if (!result.success) return result.error || `La exportación falló tras exportar ${result.exported} correos.`;
    return `Exportación completada con ${result.exported} correos y ${result.skipped} omitidos.`;
  }

  if (language === 'fr') {
    if (result.mode === 'import') {
      if (result.cancelled) return `Annulé après ${result.imported} mails importés et ${result.skipped} ignorés.`;
      if (!result.success) return result.error || `L’import a échoué après ${result.imported} mails importés.`;
      return `Import terminé : ${result.imported} mails importés et ${result.skipped} ignorés.`;
    }
    if (result.cancelled) return `Annulé après ${result.exported} mails exportés et ${result.skipped} ignorés.`;
    if (!result.success) return result.error || `L’export a échoué après ${result.exported} mails exportés.`;
    return `Export terminé : ${result.exported} mails exportés et ${result.skipped} ignorés.`;
  }

  if (language === 'de') {
    if (result.mode === 'import') {
      if (result.cancelled) return `Nach ${result.imported} importierten und ${result.skipped} übersprungenen Mails abgebrochen.`;
      if (!result.success) return result.error || `Import nach ${result.imported} importierten Mails fehlgeschlagen.`;
      return `Import abgeschlossen: ${result.imported} Mails importiert, ${result.skipped} übersprungen.`;
    }
    if (result.cancelled) return `Nach ${result.exported} exportierten und ${result.skipped} übersprungenen Mails abgebrochen.`;
    if (!result.success) return result.error || `Export nach ${result.exported} exportierten Mails fehlgeschlagen.`;
    return `Export abgeschlossen: ${result.exported} Mails exportiert, ${result.skipped} übersprungen.`;
  }

  if (language === 'ru') {
    if (result.mode === 'import') {
      if (result.cancelled) return `Отменено после импорта ${result.imported} писем и пропуска ${result.skipped}.`;
      if (!result.success) return result.error || `Импорт завершился ошибкой после ${result.imported} импортированных писем.`;
      return `Импорт завершён: ${result.imported} писем импортировано, ${result.skipped} пропущено.`;
    }
    if (result.cancelled) return `Отменено после экспорта ${result.exported} писем и пропуска ${result.skipped}.`;
    if (!result.success) return result.error || `Экспорт завершился ошибкой после ${result.exported} писем.`;
    return `Экспорт завершён: ${result.exported} писем экспортировано, ${result.skipped} пропущено.`;
  }

  if (result.mode === 'import') {
    if (result.cancelled) {
      return `Cancelled after importing ${result.imported} messages and skipping ${result.skipped}.`;
    }

    if (!result.success) {
      return result.error || `Import failed after importing ${result.imported} messages.`;
    }

    return `Import finished with ${result.imported} messages and ${result.skipped} skipped.`;
  }

  if (result.cancelled) {
    return `Cancelled after exporting ${result.exported} messages and skipping ${result.skipped}.`;
  }

  if (!result.success) {
    return result.error || `Export failed after exporting ${result.exported} messages.`;
  }

  return `Export finished with ${result.exported} messages and ${result.skipped} skipped.`;
}

export function formatBackupProgress(progress: MailBackupProgress, language: AppLanguage): string {
  const currentItem = progress.currentItem ? ` ${progress.currentItem}` : '';

  if (language === 'zh') {
    if (progress.stage === 'preparing') return '正在准备导出';
    if (progress.stage === 'reading') return `正在读取${currentItem}`.trim();
    if (progress.stage === 'writing') return `正在写入${currentItem}`.trim();
    if (progress.stage === 'finalizing') return progress.mode === 'import' ? '导入完成' : '导出完成';
    return progress.message || '';
  }

  if (language === 'ja') {
    if (progress.stage === 'preparing') return progress.mode === 'import' ? 'インポートを準備しています' : 'エクスポートを準備しています';
    if (progress.stage === 'reading') return `読み込み中:${currentItem.trim()}`.replace(/:$/, '');
    if (progress.stage === 'writing') return `書き込み中:${currentItem.trim()}`.replace(/:$/, '');
    if (progress.stage === 'finalizing') return progress.mode === 'import' ? 'インポートが完了しました' : 'エクスポートが完了しました';
    return progress.message || '';
  }

  if (language === 'ko') {
    if (progress.stage === 'preparing') return progress.mode === 'import' ? '가져오기를 준비하는 중' : '내보내기를 준비하는 중';
    if (progress.stage === 'reading') return `읽는 중${currentItem}`;
    if (progress.stage === 'writing') return `쓰는 중${currentItem}`;
    if (progress.stage === 'finalizing') return progress.mode === 'import' ? '가져오기가 완료되었습니다' : '내보내기가 완료되었습니다';
    return progress.message || '';
  }

  if (language === 'es') {
    if (progress.stage === 'preparing') return progress.mode === 'import' ? 'Preparando importación' : 'Preparando exportación';
    if (progress.stage === 'reading') return `Leyendo${currentItem}`;
    if (progress.stage === 'writing') return `Escribiendo${currentItem}`;
    if (progress.stage === 'finalizing') return progress.mode === 'import' ? 'Importación completa' : 'Exportación completa';
    return progress.message || '';
  }

  if (language === 'fr') {
    if (progress.stage === 'preparing') return progress.mode === 'import' ? 'Préparation de l’import' : 'Préparation de l’export';
    if (progress.stage === 'reading') return `Lecture${currentItem}`;
    if (progress.stage === 'writing') return `Écriture${currentItem}`;
    if (progress.stage === 'finalizing') return progress.mode === 'import' ? 'Import terminé' : 'Export terminé';
    return progress.message || '';
  }

  if (language === 'de') {
    if (progress.stage === 'preparing') return progress.mode === 'import' ? 'Import wird vorbereitet' : 'Export wird vorbereitet';
    if (progress.stage === 'reading') return `Lese${currentItem}`;
    if (progress.stage === 'writing') return `Schreibe${currentItem}`;
    if (progress.stage === 'finalizing') return progress.mode === 'import' ? 'Import abgeschlossen' : 'Export abgeschlossen';
    return progress.message || '';
  }

  if (language === 'ru') {
    if (progress.stage === 'preparing') return progress.mode === 'import' ? 'Подготовка импорта' : 'Подготовка экспорта';
    if (progress.stage === 'reading') return `Чтение${currentItem}`;
    if (progress.stage === 'writing') return `Запись${currentItem}`;
    if (progress.stage === 'finalizing') return progress.mode === 'import' ? 'Импорт завершён' : 'Экспорт завершён';
    return progress.message || '';
  }

  if (progress.stage === 'preparing') return progress.mode === 'import' ? 'Preparing import' : 'Preparing export';
  if (progress.stage === 'reading') return `Reading${currentItem}`;
  if (progress.stage === 'writing') return `Writing${currentItem}`;
  if (progress.stage === 'finalizing') return progress.mode === 'import' ? 'Import complete' : 'Export complete';
  return progress.message || '';
}
