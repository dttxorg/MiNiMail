import { ipcMain } from 'electron';
import log from 'electron-log';
import { getSetting, setSetting } from '../database';

export function registerSettingsHandlers(): void {
  log.info('Registering settings IPC handlers');

  // Get a setting
  ipcMain.handle('settings:get', async (_event, key: string) => {
    try {
      const value = getSetting(key);
      return { success: true, data: value };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to get setting ${key}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Set a setting
  ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
    try {
      setSetting(key, value);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to set setting ${key}:`, error);
      return { success: false, error: error.message };
    }
  });

  log.info('Settings IPC handlers registered');
}
