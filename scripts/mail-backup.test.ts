import {
  buildExportFileName,
  filterMailSummariesForExport,
  getExportSubdirParts,
} from '../src/main/services/mailBackup';
import { createInitialBackupState } from '../src/renderer/utils/mailBackupUi';
import type { MailExportRequest } from '../src/shared/backup';

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message?: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message || `Expected ${expectedJson}, got ${actualJson}`);
  }
}

function testExportFilters() {
  const request: MailExportRequest = {
    mode: 'export',
    taskId: 'task-1',
    destinationPath: 'D:/Exports',
    scope: {
      accountId: 7,
      folderPaths: ['INBOX', 'Archive/2026'],
    },
    filters: {
      readState: 'unread',
      startDate: '2026-04-02T00:00:00.000Z',
      endDate: '2026-04-03T23:59:59.999Z',
    },
  };

  const filtered = filterMailSummariesForExport(
    [
      { uid: 1, subject: 'read mail', date: '2026-04-02T12:00:00.000Z', isRead: true, folder: 'INBOX' },
      { uid: 2, subject: 'outside date', date: '2026-04-05T12:00:00.000Z', isRead: false, folder: 'INBOX' },
      { uid: 3, subject: 'keep me', date: '2026-04-03T08:30:00.000Z', isRead: false, folder: 'Archive/2026' },
    ],
    request,
  );

  assertEqual(filtered.length, 1);
  assertEqual(filtered[0]?.uid, 3);
}

function testExportLayoutHelpers() {
  assertEqual(
    buildExportFileName({
      uid: 22,
      subject: 'A/B:C*D?"<>|',
      date: '2026-04-03T08:30:00.000Z',
    }),
    '2026-04-03_08-30-00__A_B_C_D_______22.eml',
  );

  assertDeepEqual(
    getExportSubdirParts({
      mode: 'export',
      taskId: 'task-2',
      destinationPath: 'D:/Exports',
      scope: {
        accountId: 7,
        accountLabel: 'Team / Ops',
        folderPaths: ['Archive/2026'],
      },
    }),
    ['Team _ Ops', 'Archive', '2026'],
  );
}

function testBackupUiDefaults() {
  const state = createInitialBackupState();
  assertEqual(state.exportScope, 'folders');
  assertEqual(state.readState, 'all');
  assertEqual(state.destinationPath, '');
  assertEqual(state.progress.processed, 0);
  assertEqual(state.progress.total, 0);
}

function run() {
  testExportFilters();
  testExportLayoutHelpers();
  testBackupUiDefaults();
  console.log('mail-backup tests passed');
}

run();
