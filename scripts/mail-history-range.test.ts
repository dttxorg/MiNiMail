import {
  coerceMailCacheRange,
  coerceMailHistoryRange,
  clampHistoryRangeToCacheRange,
  mailCacheRangeToMs,
  mailHistoryRangeToMs,
  buildHistoryStages,
  shouldUseHistoryRange,
  type MailCacheRange,
  type MailHistoryRange,
} from '../src/shared/mailSyncSettings';
import {
  AI_LOOKBACK_SETTING_KEY,
  MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY,
  MAIL_CACHE_RANGE_SETTING_KEY,
  MAIL_FETCH_HISTORY_RANGE_SETTING_KEY,
  normalizeMailSettingsSnapshot,
} from '../src/renderer/utils/mailSettings';
import {
  getAutoFetchIntervalOptions,
  getMailCacheRangeOptions,
  getMailHistoryRangeOptions,
} from '../src/renderer/utils/mailHistoryRange';

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertSequenceEqual<T>(actual: readonly T[], expected: readonly T[], message?: string) {
  if (actual.length !== expected.length) {
    throw new Error(message || `Expected length ${expected.length}, got ${actual.length}`);
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(
        message || `Expected [${expected.map((item) => JSON.stringify(item)).join(', ')}], got [${actual.map((item) => JSON.stringify(item)).join(', ')}]`,
      );
    }
  }
}
function testMailHistoryRangeCoercion() {
  assertEqual(coerceMailHistoryRange('7d'), '7d');
  assertEqual(coerceMailHistoryRange('15d'), '15d');
  assertEqual(coerceMailHistoryRange('bogus'), '1mo');
  assertEqual(coerceMailHistoryRange(undefined), '1mo');
  assertEqual(coerceMailCacheRange('3d'), '3d');
  assertEqual(coerceMailCacheRange('bogus'), '1mo');
}

function testMailHistoryRangeMilliseconds() {
  assertEqual(mailHistoryRangeToMs('7d'), 7 * 24 * 60 * 60 * 1000);
  assertEqual(mailHistoryRangeToMs('1y'), 365 * 24 * 60 * 60 * 1000);
  assertEqual(mailHistoryRangeToMs('all'), null);
  assertEqual(mailCacheRangeToMs('3d'), 3 * 24 * 60 * 60 * 1000);
  assertEqual(mailCacheRangeToMs('all'), null);
}

function testHistoryRangeUsageGate() {
  assertEqual(shouldUseHistoryRange(0), true);
  assertEqual(shouldUseHistoryRange(-1), true);
  assertEqual(shouldUseHistoryRange(24), false);
  assertEqual(shouldUseHistoryRange(24, true), true);
}

function testHistoryStageBuilder() {
  assertSequenceEqual(buildHistoryStages('7d'), ['7d']);
  assertSequenceEqual(buildHistoryStages('15d'), ['7d', '15d']);
  assertSequenceEqual(buildHistoryStages('1mo'), ['7d', '15d', '1mo']);
  assertSequenceEqual(buildHistoryStages('6mo'), ['7d', '15d', '1mo', '6mo']);
  assertSequenceEqual(buildHistoryStages('1y'), ['7d', '15d', '1mo', '6mo', '1y']);
  assertSequenceEqual(buildHistoryStages('all'), ['7d', '15d', '1mo', '6mo', '1y', 'all']);
}

function testCachePriorityClamp() {
  assertEqual(clampHistoryRangeToCacheRange('all', '7d'), '7d');
  assertEqual(clampHistoryRangeToCacheRange('6mo', '1mo'), '1mo');
  assertEqual(clampHistoryRangeToCacheRange('15d', '6mo'), '15d');
}

function testRendererOptionHelpers() {
  const historyOptions = getMailHistoryRangeOptions('en');
  const cacheOptions = getMailCacheRangeOptions('en');
  const autoFetchOptions = getAutoFetchIntervalOptions('en');

  assertEqual(historyOptions.length, 6);
  assertEqual(cacheOptions.length, 5);
  assertSequenceEqual(
    historyOptions.map((option) => option.value),
    ['7d', '15d', '1mo', '6mo', '1y', 'all'] satisfies MailHistoryRange[],
  );
  assertSequenceEqual(
    cacheOptions.map((option) => option.value),
    ['3d', '7d', '1mo', '6mo', 'all'] satisfies MailCacheRange[],
  );
  assertEqual(autoFetchOptions[0].value, 0);
  assertEqual(autoFetchOptions[0].label, 'Never');
  assertEqual(autoFetchOptions[1].value, 1);
  assertEqual(autoFetchOptions[1].label, 'Every minute');
}

function testSettingsNormalizationKeepsKeysSeparate() {
  const normalized = normalizeMailSettingsSnapshot({
    aiLookback: '7d',
    mailAutoFetchIntervalMinutes: '15',
    mailFetchHistoryRange: 'all',
    mailCacheRange: '6mo',
  });

  assertEqual(MAIL_FETCH_HISTORY_RANGE_SETTING_KEY, 'mail_fetch_history_range');
  assertEqual(MAIL_CACHE_RANGE_SETTING_KEY, 'mail_cache_range');
  assertEqual(MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY, 'mail_auto_fetch_interval_minutes');
  assertEqual(AI_LOOKBACK_SETTING_KEY, 'ai_lookback');
  assertEqual(normalized.aiLookback, '7d');
  assertEqual(normalized.mailAutoFetchIntervalMinutes, 15);
  assertEqual(normalized.mailFetchHistoryRange, 'all');
  assertEqual(normalized.mailCacheRange, '6mo');
}

function run() {
  testMailHistoryRangeCoercion();
  testMailHistoryRangeMilliseconds();
  testHistoryRangeUsageGate();
  testHistoryStageBuilder();
  testCachePriorityClamp();
  testRendererOptionHelpers();
  testSettingsNormalizationKeepsKeysSeparate();
  console.log('mail-history-range tests passed');
}

run();
