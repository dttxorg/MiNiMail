const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8');

assert(main.includes('const MAX_RENDERER_RECOVERY_ATTEMPTS = 2;'), 'Expected bounded renderer recovery attempts');
assert(main.includes('const RENDERER_WATCHDOG_MS = 4000;'), 'Expected a delayed empty-root watchdog');
assert(main.includes('function isRendererAvailable(window: BrowserWindow)'), 'Expected renderer availability guard');
assert(
  main.includes('if (!mainWindow || mainWindow.isDestroyed() || !isRendererAvailable(mainWindow))'),
  'Dock/window activation must recreate an unavailable renderer instead of showing a dead black window',
);
assert(main.includes('window.destroy();') && main.includes('rendererRecoveryAttempts = 0;'), 'Expected dead-window recreation to reset recovery state');
assert(main.includes('function loadRenderer(window: BrowserWindow)'), 'Expected centralized renderer loading');
assert(main.includes('scheduleRendererRecovery(window, \'load promise rejected\')'), 'Expected rejected renderer loads to enter bounded recovery');
assert(
  main.includes("window.webContents.on('did-fail-load'") &&
  main.includes('scheduleRendererRecovery(window, `load failed (${errorCode})`)'),
  'Expected did-fail-load to recover instead of leaving a visible black window',
);
assert(main.includes('if (isMainFrame === false || errorCode === -3) return;'), 'Expected subframe and aborted loads to be ignored');
assert(
  main.includes("window.webContents.on('render-process-gone'") &&
  main.includes('recreateMainWindow(window);'),
  'Expected renderer process crashes to recreate the main window',
);
assert(main.includes('function scheduleRendererWatchdog(window: BrowserWindow)'), 'Expected renderer root watchdog');
assert(
  main.includes('document.getElementById("root")?.childElementCount ?? -1') &&
  main.includes('rootChildCount === 0 || rootChildCount === -1'),
  'Expected watchdog to detect both an empty and missing React root',
);

const didFinishIndex = main.indexOf("window.webContents.on('did-finish-load'");
const didFailIndex = main.indexOf("window.webContents.on('did-fail-load'");
assert(didFinishIndex >= 0 && didFailIndex > didFinishIndex, 'Expected did-finish-load handler before did-fail-load handler');
assert(
  !main.slice(didFinishIndex, didFailIndex).includes('rendererRecoveryAttempts = 0;'),
  'Recovery attempts must not reset before the watchdog confirms React mounted',
);

const watchdogIndex = main.indexOf('function scheduleRendererWatchdog');
const watchdogSource = main.slice(watchdogIndex, main.indexOf('function createWindow', watchdogIndex));
assert(
  watchdogSource.indexOf('rootChildCount === 0 || rootChildCount === -1') <
  watchdogSource.indexOf('rendererRecoveryAttempts = 0;'),
  'Recovery attempts should reset only after a non-empty React root is observed',
);

assert(main.includes('function showRendererRecoveryPage(window: BrowserWindow)'), 'Expected a visible fallback instead of a black screen');
assert(main.includes('renderer failed repeatedly; showing recovery page'), 'Expected repeated renderer failures to be logged safely');
assert(main.includes('function isRendererEntryUrl(url: string)'), 'Expected internal renderer navigation detection');
assert(
  main.includes("if (isRendererEntryUrl(url)) return;") &&
  main.includes("new URL(url).origin === 'http://localhost:5173'"),
  'Expected renderer retry navigation to stay inside the app in development',
);
assert(main.includes("}).catch((error) => {") && main.includes('[app] startup failed before a healthy renderer was ready'), 'Expected startup initialization failures to open a recovery window');
assert(main.includes('clearRendererWatchdog();') && main.includes('rendererRecoveryAttempts = 0;'), 'Expected window close and successful mount to clear recovery state');

console.log('electron window recovery regression passed');
