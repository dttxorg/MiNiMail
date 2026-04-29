import { app, BrowserWindow, ipcMain, Menu, dialog, shell, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron';
import path from 'path';
import log from 'electron-log';
import { initDatabase, closeDatabase, getSetting } from './database';
import { registerAccountHandlers } from './ipc/accounts';
import { registerSettingsHandlers } from './ipc/settings';
import { registerMailHandlers } from './ipc/mail';
import { registerAIHandlers } from './ipc/ai';
import { registerOAuthHandlers } from './ipc/oauth';
import { APP_NAME, APP_USER_MODEL_ID, getAppIconPath } from './brand';
import { initializeAISecretStorage } from './services/ai';

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

const isSmokeTest = process.env.MINIMAIL_ELECTRON_SMOKE === '1';
const isDev = !app.isPackaged && !isSmokeTest;
const isMacOS = process.platform === 'darwin';

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

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

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
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

  // Load the app
  if (isDev) {
    log.info('Loading dev server at http://localhost:5173');
    window.loadURL('http://localhost:5173');
    window.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
    log.info(`Loading production file: ${indexPath}`);
    window.loadFile(indexPath);
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalTarget(url)) {
      void openInSystemBrowser(url).catch((err) => {
        log.error('Failed to open external URL from window.open:', err);
      });
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedExternalTarget(url)) {
      event.preventDefault();
      void openInSystemBrowser(url).catch((err) => {
        log.error('Failed to open external URL from navigation:', err);
      });
    }
  });

  window.on('closed', () => {
    mainWindow = null;
  });

  window.on('close', (event) => {
    if (isMacOS && !isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  window.webContents.on('did-finish-load', () => {
    log.info('Window finished loading');
    if (isSmokeTest) {
      log.info('Smoke test completed after renderer load');
      setTimeout(() => quitApplication(), 250).unref();
    }
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error(`Failed to load: ${errorCode} - ${errorDescription}`);
    if (isSmokeTest) {
      app.exit(1);
    }
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone:', details);
    if (isSmokeTest) {
      app.exit(1);
    }
  });

  window.on('unresponsive', () => {
    log.error('Main window became unresponsive');
  });

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      log.error(`Renderer console [${level}] ${sourceId}:${line} ${message}`);
    }
  });

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

  log.info('Creating window...');
  createWindow();
  if (!isMacOS) {
    createAppTray();
  }

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('window-all-closed', () => {
  log.info('All windows closed');
  if (!isMacOS) {
    quitApplication();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  log.info('App quitting, closing database...');
  destroyAppTray();
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

log.info('Main process initialized');
