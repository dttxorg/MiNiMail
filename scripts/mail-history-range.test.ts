import {
  coerceMailHistoryRange,
  mailHistoryRangeToMs,
  type MailHistoryRange,
} from '../src/shared/mailSyncSettings';
import {
  getAutoFetchIntervalOptions,
  getMailHistoryRangeOptions,
} from '../src/renderer/utils/mailHistoryRange';

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

function testMailHistoryRangeCoercion() {
  assertEqual(coerceMailHistoryRange('7d'), '7d');
  assertEqual(coerceMailHistoryRange('15d'), '15d');
  assertEqual(coerceMailHistoryRange('bogus'), '1mo');
  assertEqual(coerceMailHistoryRange(undefined), '1mo');
}

function testMailHistoryRangeMilliseconds() {
  assertEqual(mailHistoryRangeToMs('7d'), 7 * 24 * 60 * 60 * 1000);
  assertEqual(mailHistoryRangeToMs('1y'), 365 * 24 * 60 * 60 * 1000);
  assertEqual(mailHistoryRangeToMs('all'), null);
}

function testRendererOptionHelpers() {
  const historyOptions = getMailHistoryRangeOptions('en');
  const autoFetchOptions = getAutoFetchIntervalOptions('en');

  assertEqual(historyOptions.length, 6);
  assertDeepEqual(
    historyOptions.map((option) => option.value),
    ['7d', '15d', '1mo', '6mo', '1y', 'all'] satisfies MailHistoryRange[],
  );
  assertEqual(autoFetchOptions[0].value, 0);
  assertEqual(autoFetchOptions[0].label, 'Never');
  assertEqual(autoFetchOptions[1].value, 1);
  assertEqual(autoFetchOptions[1].label, 'Every minute');
}

function run() {
  testMailHistoryRangeCoercion();
  testMailHistoryRangeMilliseconds();
  testRendererOptionHelpers();
  console.log('mail-history-range tests passed');
}

run();
