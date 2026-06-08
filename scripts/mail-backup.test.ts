import {
  buildSyntheticEml,
  buildExportFileName,
  filterMailSummariesForExport,
  getExportSubdirParts,
  resolveExportFolderPaths,
  parseImportCandidates,
  shouldFetchDetailForExport,
} from '../src/main/services/mailBackup';
import {
  canStartBackupImport,
  createInitialBackupState,
  formatBackupProgress,
  getBackupReadStateOptions,
} from '../src/renderer/utils/mailBackupUi';
import type { MailExportRequest } from '../src/shared/backup';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

  assertDeepEqual(
    getExportSubdirParts({
      mode: 'export',
      taskId: 'task-2b',
      destinationPath: 'D:/Exports',
      scope: {
        accountId: 8,
        accountLabel: '..',
        folderPaths: ['.././Reports//.. /Q1/.'],
      },
    }),
    ['account-8', 'Reports', 'Q1'],
  );

  assertEqual(
    buildExportFileName({
      uid: 23,
      subject: '..',
      date: '2026-04-03T08:30:00.000Z',
    }),
    '2026-04-03_08-30-00__untitled__23.eml',
  );

  assertDeepEqual(
    resolveExportFolderPaths(
      {
        mode: 'export',
        taskId: 'task-3',
        destinationPath: 'D:/Exports',
        scope: {
          accountId: 9,
          accountLabel: 'ops@example.com',
        },
      },
      ['INBOX', 'Sent', 'Archive/2026'],
    ),
    ['INBOX', 'Sent', 'Archive/2026'],
    'Expected account-wide export to fall back to all available folders',
  );
}

function testDetailFetchPolicy() {
  assertEqual(
    shouldFetchDetailForExport(
      {
        bodyText: 'cached',
      },
      {},
    ),
    true,
  );

  assertEqual(
    shouldFetchDetailForExport(
      {
        bodyText: 'cached',
      },
      { includeAttachments: false },
    ),
    false,
  );
}

function testSyntheticEmlCcHeader() {
  const eml = buildSyntheticEml(
    {
      id: 'mail-1',
      uid: 1,
      from: 'sender@example.com',
      fromName: 'Sender',
      to: 'to@example.com',
      subject: 'Subject',
      date: '2026-04-03T08:30:00.000Z',
      snippet: 'snippet',
      hasAttachments: true,
      isRead: false,
      isStarred: false,
      folder: 'INBOX',
      accountId: 3,
      cachedAt: '2026-04-03T08:30:00.000Z',
    },
    {
      id: 'mail-1',
      uid: 1,
      from: 'sender@example.com',
      fromName: 'Sender',
      to: 'to@example.com',
      cc: 'cc@example.com',
      subject: 'Subject',
      date: new Date('2026-04-03T08:30:00.000Z'),
      flags: [],
      bodyText: 'Hello world',
      attachments: [
        { filename: 'file.txt', contentType: 'text/plain', size: 42 },
      ],
      headers: {
        from: 'sender@example.com',
        to: 'to@example.com',
        cc: 'cc@example.com',
        subject: 'Subject',
        date: 'Thu, 03 Apr 2026 08:30:00 GMT',
      },
    },
  );

  if (!eml.includes('\r\nCc: cc@example.com\r\n')) {
    throw new Error(`Expected synthetic EML to include Cc header, got: ${eml}`);
  }
}

function testBackupUiDefaults() {
  const state = createInitialBackupState();
  assertEqual(state.exportScope, 'folders');
  assertEqual(state.readState, 'all');
  assertEqual(state.destinationPath, '');
  assertEqual(state.importSourcePaths.length, 0);
  assertEqual(state.importTargetFolderPath, '');
  assertEqual(state.progress.processed, 0);
  assertEqual(state.progress.total, 0);
}

function testBackupUiLocalization() {
  const jaOptions = getBackupReadStateOptions('ja');
  assertEqual(jaOptions[0]?.label, 'すべてのメール');
  assertEqual(jaOptions[1]?.label, '既読のみ');
  assertEqual(jaOptions[2]?.label, '未読のみ');

  const progressLabel = formatBackupProgress({
    taskId: 'backup-1',
    mode: 'export',
    stage: 'preparing',
    processed: 0,
    total: 5,
    message: 'Preparing mail export',
  }, 'ja');
  assertEqual(progressLabel, 'エクスポートを準備しています');
}

async function testImportHelpers() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'minnimail-import-'));
  const emlPath = path.join(tempDir, 'sample.eml');
  await fs.writeFile(emlPath, [
    'From: Example Sender <sender@example.com>',
    'To: Receiver <receiver@example.com>',
    'Subject: Imported mail',
    'Date: Sat, 12 Apr 2026 10:20:30 +0000',
    'Message-ID: <sample-import@example.com>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hello from an imported EML file.',
  ].join('\r\n'), 'utf8');

  const { candidates, rawBuffers } = await parseImportCandidates([tempDir]);
  assertEqual(candidates.length, 1);
  assertEqual(candidates[0]?.subject, 'Imported mail');
  assertEqual(candidates[0]?.from, 'sender@example.com');
  assertEqual(candidates[0]?.to, '"Receiver" <receiver@example.com>');
  assertEqual(candidates[0]?.messageId, '<sample-import@example.com>');
  // rawBuffers should hold the source buffer so the importer doesn't re-read.
  assert.ok(rawBuffers.has(candidates[0]!.path), 'rawBuffers should contain candidate path');
  assert.ok(rawBuffers.get(candidates[0]!.path)!.length > 0, 'rawBuffers entry should be non-empty');
  assertEqual(canStartBackupImport({
    ...createInitialBackupState(),
    selectedAccountId: 3,
    importTargetFolderPath: 'INBOX',
    importSourcePaths: [emlPath],
  }), true);

  await fs.rm(tempDir, { recursive: true, force: true });
}

async function run() {
  testExportFilters();
  testExportLayoutHelpers();
  testDetailFetchPolicy();
  testSyntheticEmlCcHeader();
  testBackupUiDefaults();
  testBackupUiLocalization();
  await testImportHelpers();
  console.log('mail-backup tests passed');
}

void run();
