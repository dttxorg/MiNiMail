import * as mailViewSync from '../src/renderer/utils/mailViewSync';

const { shouldAutoSyncView } = mailViewSync;
const shouldUseStagedHistorySync = (
  mailViewSync as {
    shouldUseStagedHistorySync?: (args: { cachedCount: number; forceHistoryRange: boolean }) => boolean;
  }
).shouldUseStagedHistorySync;

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function testInitialHydrationOnlySyncsEmptyViews() {
  assertEqual(shouldAutoSyncView({
    previousViewKey: null,
    nextViewKey: 'all:inbox',
    loadedCount: 0,
    wasInitialHydration: true,
    syncInFlight: false,
  }), true);

  assertEqual(shouldAutoSyncView({
    previousViewKey: null,
    nextViewKey: 'all:inbox',
    loadedCount: 15,
    wasInitialHydration: true,
    syncInFlight: false,
  }), false);
}

function testRangeChangesDoNotAutoSyncCurrentView() {
  assertEqual(shouldAutoSyncView({
    previousViewKey: 'all:inbox',
    nextViewKey: 'all:inbox',
    loadedCount: 0,
    wasInitialHydration: false,
    syncInFlight: false,
  }), false);
}

function testViewSwitchCanSyncEmptyView() {
  assertEqual(shouldAutoSyncView({
    previousViewKey: 'all:inbox',
    nextViewKey: '10:archive',
    loadedCount: 0,
    wasInitialHydration: false,
    syncInFlight: false,
  }), true);
}

function testSyncInFlightAlwaysSuppressesAutoSync() {
  assertEqual(shouldAutoSyncView({
    previousViewKey: 'all:inbox',
    nextViewKey: '10:archive',
    loadedCount: 0,
    wasInitialHydration: false,
    syncInFlight: true,
  }), false);
}

function testStagedHistorySyncRequiresForcedEmptyCache() {
  if (typeof shouldUseStagedHistorySync !== 'function') {
    throw new Error('Expected shouldUseStagedHistorySync to be defined');
  }

  assertEqual(shouldUseStagedHistorySync({
    cachedCount: 0,
    forceHistoryRange: true,
  }), true);

  assertEqual(shouldUseStagedHistorySync({
    cachedCount: 12,
    forceHistoryRange: false,
  }), false);
}

function run() {
  testInitialHydrationOnlySyncsEmptyViews();
  testRangeChangesDoNotAutoSyncCurrentView();
  testViewSwitchCanSyncEmptyView();
  testSyncInFlightAlwaysSuppressesAutoSync();
  testStagedHistorySyncRequiresForcedEmptyCache();
  console.log('mail-view-sync tests passed');
}

run();
