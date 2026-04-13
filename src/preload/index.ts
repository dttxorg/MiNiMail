import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path'),
  invoke: (channel: string, ...args: unknown[]) => {
    const validChannels = [
      'accounts:getAll',
      'accounts:get',
      'accounts:create',
      'accounts:update',
      'accounts:delete',
      'accounts:setDefault',
      'accounts:testImap',
      'accounts:testSmtp',
      'settings:get',
      'settings:set',
      'mail:getFolders',
      'mail:getList',
      'mail:getDetail',
      'mail:setFlags',
      'mail:setRead',
      'mail:setStarred',
      'mail:updateCategories',
      'mail:getCurrentFolder',
      'mail:send',
      'mail:testSmtp',
      'mail:delete',
      'mail:move',
      'ai:getConfig',
      'ai:saveConfig',
      'ai:getSettings',
      'ai:saveSettings',
      'ai:translate',
      'ai:summarize',
      'ai:suggestReply',
      'ai:polish',
      'ai:classifyBatch',
      'oauth:startFlow',
      'oauth:refreshToken',
      'oauth:getClientConfig',
      'mail:sync',
      'mail:fetchFull',
      'mail:loadCached',
      'mail:loadCachedBody',
      'mail:cacheLocal',
      'mail:exportEml',
      'mail:cancelBackup',
      'file:saveDialog',
      'file:writeFile',
      'file:pickDirectory',
      'file:openPath',
    ];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Invalid IPC channel: ${channel}`);
  },
  onMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('message', (_event, message) => callback(message));
  },
  onMailSync: (callback: (mail: unknown) => void) => {
    ipcRenderer.on('mail:sync-new', (_event, mail) => callback(mail));
  },
  onBackupProgress: (callback: (progress: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
    ipcRenderer.on('mail:backup-progress', listener);
    return () => ipcRenderer.removeListener('mail:backup-progress', listener);
  },
  // Window controls for frameless window
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window:maximized-change', listener);
    return () => ipcRenderer.removeListener('window:maximized-change', listener);
  },
});
