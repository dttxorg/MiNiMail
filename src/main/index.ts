import { app, BrowserWindow, ipcMain, Menu, dialog, shell, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron';
import path from 'path';
import { pathToFileURL } from 'node:url';
import log from 'electron-log';
import { initDatabase, closeDatabase, getSetting } from './database';
import { registerAccountHandlers } from './ipc/accounts';
import { registerSettingsHandlers } from './ipc/settings';
import { registerMailHandlers, startScheduledSendScheduler, stopScheduledSendScheduler } from './ipc/mail';
import { registerAIHandlers } from './ipc/ai';
import { registerOAuthHandlers } from './ipc/oauth';
import { APP_NAME, APP_USER_MODEL_ID, getAppIconPath } from './brand';
import { initializeAISecretStorage } from './services/ai';
import { closeScheduledSendDb, restoreScheduledSendJobs } from './services/scheduledSendService';
import { bootstrapPreheatWorker } from './services/mailSummaryService';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Log app start
log.info('MiNiMail starting...');
log.info(`App path: ${app.getPath('userData')}`);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;
let isQuitting = false;
let appMenuLanguage = 'zh';
const trustedOpenPathRoots = new Set<string>();

const MAX_RENDERER_RECOVERY_ATTEMPTS = 2;
const RENDERER_RECOVERY_DELAY_MS = 500;
const RENDERER_WATCHDOG_MS = 4000;
let rendererRecoveryAttempts = 0;
let rendererRecoveryTimer: NodeJS.Timeout | null = null;
let rendererWatchdogTimer: NodeJS.Timeout | null = null;

const isSmokeTest = process.env.MINIMAIL_ELECTRON_SMOKE === '1';
const isDev = !app.isPackaged && !isSmokeTest;
const isMacOS = process.platform === 'darwin';

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}
try {
  if (!app.isDefaultProtocolClient('mailto')) {
    app.setAsDefaultProtocolClient('mailto');
  }
} catch (err) {
  log.warn('[app] failed to register default mailto client', err);
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  log.info('[app] open-url received:', url);
  if (url && url.startsWith('mailto:')) {
    showMainWindow();
    mainWindow?.webContents.send('app:open-mailto', url);
  }
});

function isAllowedExternalTarget(target: string): boolean {
  try {
    const parsed = new URL(target);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function openInSystemBrowser(target: string): Promise<void> {
  if (!isAllowedExternalTarget(target)) {
    return Promise.reject(new Error(`Blocked external target: ${target}`));
  }
  return shell.openExternal(target).then(() => undefined);
}

function normalizeTrustedPath(targetPath: string): string {
  return path.resolve(targetPath);
}

function rememberTrustedOpenRoot(targetPath: string): void {
  trustedOpenPathRoots.add(normalizeTrustedPath(targetPath));
}

function isTrustedOpenPath(targetPath: string): boolean {
  const resolved = normalizeTrustedPath(targetPath);
  for (const trustedRoot of trustedOpenPathRoots) {
    const relative = path.relative(trustedRoot, resolved);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return true;
    }
  }
  return false;
}

function isRendererAvailable(window: BrowserWindow): boolean {
  return !window.isDestroyed() && !window.webContents.isDestroyed();
}

function clearRendererWatchdog(): void {
  if (rendererWatchdogTimer) {
    clearTimeout(rendererWatchdogTimer);
    rendererWatchdogTimer = null;
  }
}

function getRendererIndexPath(): string {
  return path.join(__dirname, '..', '..', 'renderer', 'index.html');
}

function isRendererEntryUrl(url: string): boolean {
  if (isDev) {
    try {
      return new URL(url).origin === 'http://localhost:5173';
    } catch {
      return false;
    }
  }
  return url.split('#')[0] === pathToFileURL(getRendererIndexPath()).toString();
}

function replaceMainWindow(window: BrowserWindow): void {
  clearRendererWatchdog();
  if (rendererRecoveryTimer) {
    clearTimeout(rendererRecoveryTimer);
    rendererRecoveryTimer = null;
  }
  rendererRecoveryAttempts = 0;
  mainWindow = null;

  // Create the replacement before closing the stale window so window-all-closed
  // cannot quit the app during a renderer recovery on Windows/Linux.
  createWindow();
  if (!window.isDestroyed()) {
    window.destroy();
  }
  showMainWindow();
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !isRendererAvailable(mainWindow)) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      replaceMainWindow(mainWindow);
    } else {
      createWindow();
    }
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function openSettingsWindow(): void {
  showMainWindow();
  mainWindow?.webContents.send('app:open-settings');
}

function openComposeWindow(): void {
  showMainWindow();
  mainWindow?.webContents.send('app:compose-new-mail');
}

function refreshMailWindow(): void {
  showMainWindow();
  mainWindow?.webContents.send('app:refresh-mail');
}

interface ApplicationMenuText {
  about: string;
  settings: string;
  quit: string;
  mail: string;
  compose: string;
  refresh: string;
  search: string;
  edit: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
  window: string;
  minimize: string;
  zoom: string;
  closeWindow: string;
}

const APPLICATION_MENU_TEXT: Record<'zh' | 'en', ApplicationMenuText> = {
  zh: {
    about: `关于 ${APP_NAME}`,
    settings: '设置...',
    quit: `退出 ${APP_NAME}`,
    mail: '邮件',
    compose: '写邮件',
    refresh: '刷新邮件',
    search: '搜索邮件',
    edit: '编辑',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    window: '窗口',
    minimize: '最小化',
    zoom: '缩放',
    closeWindow: '关闭窗口',
  },
  en: {
    about: `About ${APP_NAME}`,
    settings: 'Settings...',
    quit: `Quit ${APP_NAME}`,
    mail: 'Mail',
    compose: 'Compose New Mail',
    refresh: 'Refresh Mail',
    search: 'Search Mail',
    edit: 'Edit',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    closeWindow: 'Close Window',
  },
};

function normalizeMenuLanguage(language: string | null | undefined): keyof typeof APPLICATION_MENU_TEXT {
  return language === 'zh' ? 'zh' : 'en';
}

function getApplicationMenuText(): ApplicationMenuText {
  return APPLICATION_MENU_TEXT[normalizeMenuLanguage(appMenuLanguage)];
}

function buildApplicationMenu(): Menu {
  const text = getApplicationMenuText();
  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { label: text.about, role: 'about' },
        { type: 'separator' },
        { label: text.settings, accelerator: 'Command+,', click: openSettingsWindow },
        { type: 'separator' },
        { label: text.quit, accelerator: 'Command+Q', click: quitApplication },
      ],
    },
    {
      label: text.mail,
      submenu: [
        { label: text.compose, accelerator: 'Command+N', click: openComposeWindow },
        { label: text.refresh, accelerator: 'Command+R', click: refreshMailWindow },
        { label: text.search, accelerator: 'Command+F', enabled: false },
      ],
    },
    {
      label: text.edit,
      submenu: [
        { label: text.cut, role: 'cut' },
        { label: text.copy, role: 'copy' },
        { label: text.paste, role: 'paste' },
        { type: 'separator' },
        { label: text.selectAll, role: 'selectAll' },
      ],
    },
    {
      label: text.window,
      submenu: [
        { label: text.minimize, role: 'minimize' },
        { label: text.zoom, role: 'zoom' },
        { label: text.closeWindow, role: 'close' },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function rebuildApplicationMenu(): void {
  Menu.setApplicationMenu(isMacOS ? buildApplicationMenu() : null);
}

function updateApplicationMenuLanguage(language: string | null | undefined): void {
  appMenuLanguage = normalizeMenuLanguage(language);
  rebuildApplicationMenu();
}

function restoreScheduledSendsOnStartup(): void {
  try {
    const result = restoreScheduledSendJobs(new Date());
    log.info('[scheduledSend] startup restore summary', {
      missedCount: result.missedCount,
      scheduledCount: result.scheduled.length,
      missedTotal: result.missed.length,
    });
  } catch (error) {
    log.error('[scheduledSend] startup restore failed:', error instanceof Error ? error.message : String(error));
  }
}

function createAppTray(): void {
  if (isMacOS) return;
  if (appTray) return;

  const ico = nativeImage.createFromPath(getAppIconPath('ico'));
  const png = nativeImage.createFromPath(getAppIconPath('png'));
  appTray = new Tray(ico.isEmpty() ? png : ico);
  appTray.setToolTip(APP_NAME);
  appTray.setContextMenu(Menu.buildFromTemplate([
    { label: `Open ${APP_NAME}`, click: showMainWindow },
    { type: 'separator' },
    { label: 'Quit', click: quitApplication },
  ]));
  appTray.on('click', showMainWindow);
}

function destroyAppTray(): void {
  appTray?.destroy();
  appTray = null;
}

function quitApplication(): void {
  if (isQuitting) return;
  isQuitting = true;
  destroyAppTray();
  app.quit();
  setTimeout(() => {
    if (isQuitting) {
      app.exit(0);
    }
  }, 2500).unref();
}

function showRendererRecoveryPage(window: BrowserWindow): void {
  if (!isRendererAvailable(window)) return;

  const target = isDev
    ? 'http://localhost:5173'
    : pathToFileURL(getRendererIndexPath()).toString();
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${APP_NAME}</title>
    <style>
      html, body { height: 100%; margin: 0; }
      body { display: grid; place-items: center; background: #0a0b0e; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(440px, calc(100vw - 48px)); box-sizing: border-box; padding: 28px; border: 1px solid rgba(255,255,255,.1); border-radius: 18px; background: #14161b; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
      h1 { margin: 0 0 10px; font-size: 18px; }
      p { margin: 0 0 20px; color: #a1a1aa; font-size: 13px; line-height: 1.7; }
      button { border: 0; border-radius: 10px; padding: 10px 16px; background: #6366f1; color: #fff; font: inherit; font-size: 13px; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <h1>界面没有正常启动</h1>
      <p>MiNiMail 已停止重复加载以避免卡死。本地邮件数据不会受到影响，请重新尝试进入界面。</p>
      <button type="button" id="retry">重新尝试</button>
    </main>
    <script>document.getElementById('retry').addEventListener('click', function () { location.href = ${JSON.stringify(target)}; });</script>
  </body>
</html>`;

  log.error('[window] renderer failed repeatedly; showing recovery page');
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error) => {
    log.error('[window] failed to show renderer recovery page:', error instanceof Error ? error.message : String(error));
  });
}

function loadRenderer(window: BrowserWindow): void {
  if (!isRendererAvailable(window)) return;

  const loadPromise = isDev
    ? window.loadURL('http://localhost:5173')
    : window.loadFile(getRendererIndexPath());

  if (isDev) {
    log.info('Loading dev server at http://localhost:5173');
    window.webContents.openDevTools();
  } else {
    log.info(`Loading production file: ${getRendererIndexPath()}`);
  }

  void loadPromise.catch((error) => {
    log.error('[window] renderer load promise rejected:', error instanceof Error ? error.message : String(error));
    scheduleRendererRecovery(window, 'load promise rejected');
  });
}

function scheduleRendererRecovery(window: BrowserWindow, reason: string): void {
  if (isSmokeTest || isQuitting || window !== mainWindow || !isRendererAvailable(window)) return;
  if (rendererRecoveryTimer) return;

  if (rendererRecoveryAttempts >= MAX_RENDERER_RECOVERY_ATTEMPTS) {
    showRendererRecoveryPage(window);
    return;
  }

  rendererRecoveryAttempts += 1;
  const attempt = rendererRecoveryAttempts;
  log.warn(`[window] renderer recovery attempt ${attempt}/${MAX_RENDERER_RECOVERY_ATTEMPTS}: ${reason}`);
  rendererRecoveryTimer = setTimeout(() => {
    rendererRecoveryTimer = null;
    if (window !== mainWindow || !isRendererAvailable(window)) return;
    loadRenderer(window);
  }, RENDERER_RECOVERY_DELAY_MS);
  rendererRecoveryTimer.unref();
}

function recreateMainWindow(window: BrowserWindow): void {
  if (isQuitting || window !== mainWindow) return;

  log.warn('[window] recreating main window after renderer process exit');
  replaceMainWindow(window);
}

function scheduleRendererWatchdog(window: BrowserWindow): void {
  clearRendererWatchdog();
  rendererWatchdogTimer = setTimeout(() => {
    rendererWatchdogTimer = null;
    if (isQuitting || window !== mainWindow || !isRendererAvailable(window)) return;

    void window.webContents.executeJavaScript(
      'document.getElementById("root")?.childElementCount ?? -1',
    ).then((rootChildCount) => {
      if (rootChildCount === 0 || rootChildCount === -1) {
        log.error('[window] renderer loaded without mounting the React root');
        scheduleRendererRecovery(window, 'empty React root');
        return;
      }
      rendererRecoveryAttempts = 0;
    }).catch((error) => {
      log.error('[window] renderer watchdog failed:', error instanceof Error ? error.message : String(error));
      scheduleRendererRecovery(window, 'watchdog execution failed');
    });
  }, RENDERER_WATCHDOG_MS);
  rendererWatchdogTimer.unref();
}

function createWindow() {
  log.info('Creating main window...');
  const appIconPath = getAppIconPath(process.platform === 'win32' ? 'ico' : 'png');

  // Remove menu bar on Windows/Linux; use a localized native menu on macOS.
  rebuildApplicationMenu();

  mainWindow = new BrowserWindow({
    width: 1536,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#1a1d29',
    frame: isMacOS,
    ...(isMacOS ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 14, y: 14 },
    } : {}),
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
    },
  });
  const window = mainWindow;

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalTarget(url)) {
      void openInSystemBrowser(url).catch((err) => {
        log.error('Failed to open external URL from window.open:', err);
      });
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isRendererEntryUrl(url)) return;
    if (isAllowedExternalTarget(url)) {
      event.preventDefault();
      void openInSystemBrowser(url).catch((err) => {
        log.error('Failed to open external URL from navigation:', err);
      });
    }
  });

  window.on('closed', () => {
    clearRendererWatchdog();
    if (rendererRecoveryTimer) {
      clearTimeout(rendererRecoveryTimer);
      rendererRecoveryTimer = null;
    }
    rendererRecoveryAttempts = 0;
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.on('close', (event) => {
    if (isMacOS && !isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  window.webContents.on('did-finish-load', () => {
    const loadedUrl = window.webContents.getURL();
    if (loadedUrl.startsWith('data:text/html')) {
      log.warn('[window] renderer recovery page loaded');
      return;
    }

    log.info('Window finished loading');
    scheduleRendererWatchdog(window);
    if (isSmokeTest) {
      log.info('Smoke test completed after renderer load');
      setTimeout(() => quitApplication(), 250).unref();
    }
  });

  window.webContents.on('did-fail-load', (
    _event,
    errorCode,
    errorDescription,
    _validatedURL,
    isMainFrame,
  ) => {
    if (isMainFrame === false || errorCode === -3) return;
    log.error(`Failed to load: ${errorCode} - ${errorDescription}`);
    if (isSmokeTest) {
      app.exit(1);
      return;
    }
    scheduleRendererRecovery(window, `load failed (${errorCode})`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone:', details);
    if (isSmokeTest) {
      app.exit(1);
      return;
    }
    recreateMainWindow(window);
  });

  window.on('unresponsive', () => {
    log.error('Main window became unresponsive');
  });

  // Electron 41 passes a single ConsoleMessageEvent object to the handler.
  // The old (level, message, line, sourceId) signature is deprecated and
  // returns all-undefined on newer versions, so we read the new shape.
  window.webContents.on('console-message', (event) => {
    const level = (event as { level?: string }).level ?? 'log';
    const message = (event as { message?: string }).message ?? '';
    const line = (event as { lineNumber?: number }).lineNumber ?? 0;
    const sourceId = (event as { sourceId?: string }).sourceId ?? '';
    if (level === 'error' || level === 'warning') {
      log.warn(`Renderer console [${level}] ${sourceId}:${line} ${message}`);
    }
  });

  loadRenderer(window);

  // Notify renderer on maximize state changes
  window.on('maximize', () => {
    window.webContents.send('window:maximized-change', true);
  });
  window.on('unmaximize', () => {
    window.webContents.send('window:maximized-change', false);
  });
}

app.whenReady().then(() => {
  log.info('Initializing database...');
  initDatabase();
  appMenuLanguage = normalizeMenuLanguage(getSetting('app_language'));
  initializeAISecretStorage();

  log.info('Registering IPC handlers...');
  registerAccountHandlers();
  registerSettingsHandlers();
  registerMailHandlers();
  registerAIHandlers();
  registerOAuthHandlers();
  restoreScheduledSendsOnStartup();
  bootstrapPreheatWorker();

  log.info('Creating window...');
  createWindow();
  startScheduledSendScheduler();
  if (!isMacOS) {
    createAppTray();
  }

  app.on('activate', () => {
    showMainWindow();
  });
}).catch((error) => {
  log.error('[app] startup failed before a healthy renderer was ready:', error instanceof Error ? error.message : String(error));
  if (isSmokeTest) {
    app.exit(1);
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  log.info('All windows closed');
  if (!isMacOS) {
    quitApplication();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  clearRendererWatchdog();
  if (rendererRecoveryTimer) {
    clearTimeout(rendererRecoveryTimer);
    rendererRecoveryTimer = null;
  }
  log.info('App quitting, closing database...');
  destroyAppTray();
  stopScheduledSendScheduler();
  closeScheduledSendDb();
  closeDatabase();
});

// IPC handlers for renderer communication
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('app:get-user-data-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('app:openExternal', async (_event, target: string) => {
  try {
    await openInSystemBrowser(target);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to open external target:', message);
    return { success: false, error: message };
  }
});

ipcMain.handle('app:set-language', async (_event, language: string) => {
  updateApplicationMenuLanguage(language);
  return { success: true };
});

// Window control handlers (for frameless window)
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (isMacOS) {
    mainWindow?.close();
    return;
  }
  quitApplication();
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// ── File dialog and write handlers (used for screenshot export) ─────────────────
ipcMain.handle('file:saveDialog', async (_event, options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: options.defaultPath,
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (!result.canceled && result.filePath) {
    rememberTrustedOpenRoot(path.dirname(result.filePath));
  }
  return { success: !result.canceled, filePath: result.filePath };
});

ipcMain.handle('file:pickDirectory', async () => {
  if (!mainWindow) return { success: false, paths: [] };
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (!result.canceled) {
    result.filePaths.forEach(rememberTrustedOpenRoot);
  }
  return {
    success: !result.canceled,
    paths: result.filePaths,
  };
});

ipcMain.handle('file:pickImportSources', async () => {
  if (!mainWindow) return { success: false, paths: [] };
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [
      { name: 'Email files', extensions: ['eml'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  return {
    success: !result.canceled,
    paths: result.filePaths,
  };
});

ipcMain.handle('file:openPath', async (_event, targetPath: string) => {
  try {
    if (!targetPath || !isTrustedOpenPath(targetPath)) {
      return { success: false, error: 'Path is not trusted for opening.' };
    }
    const response = await shell.openPath(normalizeTrustedPath(targetPath));
    return {
      success: response.length === 0,
      error: response || undefined,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('app:setBadgeCount', (_event, count: number) => {
  try {
    const validCount = Math.max(0, Math.floor(Number(count) || 0));
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setBadge(validCount > 0 ? String(validCount) : '');
    }
    if (typeof app.setBadgeCount === 'function') {
      app.setBadgeCount(validCount);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('mail:print', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'No active window' };
  try {
    mainWindow.webContents.print({ silent: false, printBackground: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

log.info('Main process initialized');
