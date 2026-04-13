import { app, BrowserWindow, ipcMain, Menu, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { initDatabase, closeDatabase } from './database';
import { registerAccountHandlers } from './ipc/accounts';
import { registerSettingsHandlers } from './ipc/settings';
import { registerMailHandlers } from './ipc/mail';
import { registerAIHandlers } from './ipc/ai';
import { registerOAuthHandlers } from './ipc/oauth';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Log app start
log.info('APark Mail starting...');
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

const isDev = !app.isPackaged;

function createWindow() {
  log.info('Creating main window...');
  const appIconPath = path.join(app.getAppPath(), 'build', 'icons', 'app-icon.png');

  // Remove menu bar
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MinNiMail',
    backgroundColor: '#1a1d29',
    frame: false,
    titleBarStyle: 'hidden',
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
    },
  });

  // Load the app
  if (isDev) {
    log.info('Loading dev server at http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
    log.info(`Loading production file: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Window finished loading');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error(`Failed to load: ${errorCode} - ${errorDescription}`);
  });

  // Notify renderer on maximize state changes
  mainWindow.on('maximize', () => {
    mainWindow!.webContents.send('window:maximized-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow!.webContents.send('window:maximized-change', false);
  });
}

app.whenReady().then(() => {
  log.info('Initializing database...');
  initDatabase();

  log.info('Registering IPC handlers...');
  registerAccountHandlers();
  registerSettingsHandlers();
  registerMailHandlers();
  registerAIHandlers();
  registerOAuthHandlers();

  log.info('Creating window...');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  log.info('All windows closed');
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  log.info('App quitting, closing database...');
  closeDatabase();
});

// IPC handlers for renderer communication
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('app:get-user-data-path', () => {
  return app.getPath('userData');
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
  mainWindow?.close();
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
  return { success: !result.canceled, filePath: result.filePath };
});

ipcMain.handle('file:writeFile', async (_event, options: { filePath: string; data: string; encoding: 'utf8' | 'base64' }) => {
  try {
    if (options.encoding === 'base64') {
      const buffer = Buffer.from(options.data, 'base64');
      await fs.promises.writeFile(options.filePath, buffer);
    } else {
      await fs.promises.writeFile(options.filePath, options.data, 'utf8');
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('file:pickDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return {
    success: !result.canceled,
    paths: result.filePaths,
  };
});

ipcMain.handle('file:openPath', async (_event, targetPath: string) => {
  try {
    const response = await shell.openPath(targetPath);
    return {
      success: response.length === 0,
      error: response || undefined,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

log.info('Main process initialized');
