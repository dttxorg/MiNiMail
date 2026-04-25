import { buildMailNotificationKey, shouldNotifyMail } from '../src/main/services/mailNotification';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testSkipsHistoricalBackfill() {
  const shouldNotify = shouldNotifyMail({
    notify: true,
    appStartedAt: new Date('2026-04-12T21:00:00Z').getTime(),
    now: new Date('2026-04-12T21:20:00Z').getTime(),
    folderKind: 'inbox',
    alreadyNotified: false,
    accountEmail: 'me@example.com',
    mail: {
      uid: 1,
      from: 'news@example.com',
      messageId: '<m1@example.com>',
      date: new Date('2026-04-12T19:00:00Z'),
      isRead: false,
    },
  });
  assert(shouldNotify === false, 'Expected historical backfill mail not to notify');
}

function testSkipsNonInboxMail() {
  const shouldNotify = shouldNotifyMail({
    notify: true,
    appStartedAt: Date.now() - 1000,
    now: Date.now(),
    folderKind: 'other',
    alreadyNotified: false,
    accountEmail: 'me@example.com',
    mail: {
      uid: 2,
      from: 'me@example.com',
      messageId: '<m2@example.com>',
      date: new Date(),
      isRead: false,
    },
  });
  assert(shouldNotify === false, 'Expected sent or draft folders not to notify');
}

function testNotifiesFreshInboxMailOnce() {
  const mail = {
    uid: 3,
    from: 'alerts@example.com',
    messageId: '<m3@example.com>',
    date: new Date('2026-04-12T21:09:00Z'),
    isRead: false,
  };
  const key = buildMailNotificationKey(9, 'INBOX', mail);
  assert(key === '9:inbox:<m3@example.com>', 'Expected stable notification key');

  const shouldNotify = shouldNotifyMail({
    notify: true,
    appStartedAt: new Date('2026-04-12T21:00:00Z').getTime(),
    now: new Date('2026-04-12T21:10:00Z').getTime(),
    folderKind: 'inbox',
    alreadyNotified: false,
    accountEmail: 'me@example.com',
    mail,
  });
  assert(shouldNotify === true, 'Expected fresh unread inbox mail to notify');
}

function run() {
  testSkipsHistoricalBackfill();
  testSkipsNonInboxMail();
  testNotifiesFreshInboxMailOnce();
  console.log('mail-notification tests passed');
}

run();
