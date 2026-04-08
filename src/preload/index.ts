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
      'mail:getCurrentFolder',
      'mail:send',
      'mail:testSmtp',
      'mail:delete',
      'mail:move',
      'ai:getConfig',
      'ai:saveConfig',
      'ai:translate',
      'ai:summarize',
      'ai:suggestReply',
      'ai:polish',
      'oauth:isConfigured',
      'oauth:getStatus',
      'oauth:startFlow',
      'oauth:handleCallback',
      'oauth:refreshToken',
      'mail:sync',
      'mail:fetchFull',
      'mail:loadCached',
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
  // Window controls for frameless window
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
});
