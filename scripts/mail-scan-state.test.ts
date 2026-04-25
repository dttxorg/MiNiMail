import { clearMailScanState } from '../src/renderer/utils/mailScanState';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testClearMailScanStateRemovesScanFieldsAndRouting() {
  const result = clearMailScanState({
    mailList: [
      {
        id: 'mail-1',
        uid: 1,
        from: 'alice@example.com',
        fromName: 'Alice',
        to: 'me@example.com',
        subject: 'Hello',
        date: new Date('2026-04-20T10:00:00Z'),
        snippet: 'hello',
        hasAttachments: false,
        isRead: false,
        isStarred: false,
        folder: 'INBOX',
        accountId: 1,
        category: '工作/业务类',
        isScanned: true,
        scanResult: 'Priority/High',
      },
      {
        id: 'mail-2',
        uid: 2,
        from: 'bob@example.com',
        fromName: 'Bob',
        to: 'me@example.com',
        subject: 'World',
        date: new Date('2026-04-20T11:00:00Z'),
        snippet: 'world',
        hasAttachments: false,
        isRead: true,
        isStarred: false,
        folder: 'INBOX',
        accountId: 1,
        category: '通知类',
        isScanned: true,
        scanResult: 'Priority/Low',
      },
    ],
    currentMail: {
      id: 'mail-1',
      uid: 1,
      from: 'alice@example.com',
      fromName: 'Alice',
      to: 'me@example.com',
      subject: 'Hello',
      date: new Date('2026-04-20T10:00:00Z'),
      snippet: 'hello',
      hasAttachments: false,
      isRead: false,
      isStarred: false,
      folder: 'INBOX',
      accountId: 1,
      category: '工作/业务类',
      isScanned: true,
      scanResult: 'Priority/High',
      bodyText: 'hello body',
      attachments: [],
      headers: {},
    },
    routingResults: [
      {
        id: 'mail-1',
        routing: {
          kind: 'generic',
          light_scan: {
            importance_score: 50,
            urgency_score: 40,
            actionability_score: 60,
            risk_score: 20,
            density_score: 20,
            relationship_score: 10,
            total_light_score: 45,
            force_upgrade: false,
            recommended_depth: 'normal',
            reasons: [],
          },
          smart_folder: {
            folder: 'Priority/High',
            family: 'generic',
            reasons: [],
          },
        },
      },
      {
        id: 'mail-2',
        routing: {
          kind: 'generic',
          light_scan: {
            importance_score: 5,
            urgency_score: 5,
            actionability_score: 5,
            risk_score: 0,
            density_score: 5,
            relationship_score: 0,
            total_light_score: 10,
            force_upgrade: false,
            recommended_depth: 'light',
            reasons: [],
          },
          smart_folder: {
            folder: 'Priority/Low',
            family: 'generic',
            reasons: [],
          },
        },
      },
    ],
    targetMailId: 'mail-1',
  });

  const clearedMail = result.mailList.find((mail) => mail.id === 'mail-1');
  const untouchedMail = result.mailList.find((mail) => mail.id === 'mail-2');

  assert(clearedMail, 'Expected cleared mail to remain in mail list');
  assert(clearedMail?.isScanned === false, 'Expected isScanned to be reset');
  assert(clearedMail?.scanResult === undefined, 'Expected scanResult to be cleared');
  assert(clearedMail?.category === undefined, 'Expected category to be cleared');

  assert(untouchedMail?.isScanned === true, 'Expected unrelated mail to stay scanned');
  assert(result.currentMail?.id === 'mail-1', 'Expected current mail to remain selected');
  assert(result.currentMail?.isScanned === false, 'Expected current mail scan state to be reset');
  assert(result.routingResults.length === 1, `Expected only unrelated routing result to remain, got ${result.routingResults.length}`);
  assert(result.routingResults[0]?.id === 'mail-2', 'Expected unrelated routing result to remain');
}

function run() {
  testClearMailScanStateRemovesScanFieldsAndRouting();
  console.log('mail-scan-state tests passed');
}

run();
