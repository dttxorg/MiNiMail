import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path'),
  openExternal: (target: string) => ipcRenderer.invoke('app:openExternal', target),
  downloadAttachment: (request: unknown) => ipcRenderer.invoke('mail:downloadAttachment', request),
  openAttachment: (request: unknown) => ipcRenderer.invoke('mail:openAttachment', request),
  invoke: (channel: string, ...args: unknown[]) => {
    const validChannels = [
      'app:openExternal',
      'app:set-language',
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
      'mail:downloadAttachment',
      'mail:openAttachment',
      'mail:selectOutgoingAttachments',
      'mail:setFlags',
      'mail:setRead',
      'mail:setStarred',
      'mail:updateCategories',
      'mail:clearScanResults',
      'mail:getCurrentFolder',
      'mail:send',
      'mail:scheduleSend',
      'mail:listScheduledSends',
      'mail:cancelScheduledSend',
      'mail:getScheduledSend',
      'mail:markMissedScheduledSends',
      'mail:sendScheduledNow',
      'mail:retryScheduledSend',
      'mail:testSmtp',
      'mail:delete',
      'mail:move',
      'ai:getConfig',
      'ai:saveConfig',
      'ai:getSettings',
      'ai:saveSettings',
      'ai:getContactKnowledgeSettings',
      'ai:saveContactKnowledgeSettings',
      'ai:buildContactWiki',
      'ai:getContactWiki',
      'ai:reindexContactKnowledge',
      'ai:listContactKnowledgeStats',
      'ai:saveContactWikiFeedback',
      'ai:contactReplySuggestion',
      'ai:getContactBehaviorSettings',
      'ai:saveContactBehaviorSettings',
      'ai:recordContactMailInteraction',
      'ai:listContactBehaviorInsights',
      'ai:exportContactBehaviorSummary',
      'ai:clearContactBehaviorData',
      'ai:testConnection',
      'ai:fetchModels',
      'ai:getProviderProfiles',
      'ai:saveProviderProfile',
      'ai:deleteProviderProfile',
      'ai:setDefaultProvider',
      'ai:getProviderAccountsWithModels',
      'ai:saveProviderAccount',
      'ai:saveModelProfile',
      'ai:deleteModelProfile',
      'ai:setDefaultModelProfile',
      'ai:translate',
      'ai:translateSegments',
      'ai:summarize',
      'ai:suggestReply',
      'ai:suggestActions',
      'ai:suggestQuickReplies',
      'ai:extractKeyInfo',
      'ai:polish',
      'ai:classifyBatch',
      'oauth:startFlow',
      'oauth:refreshToken',
      'oauth:getClientConfig',
      'mail:sync',
      'mail:fetchFull',
      'mail:loadCached',
      'mail:loadLocalDrafts',
      'mail:loadCachedBody',
      'mail:pruneCache',
      'mail:cacheLocal',
      'mail:deleteCachedById',
      'mail:deleteCachedDraft',
      'mail:exportEml',
      'mail:importEml',
      'mail:cancelBackup',
      'file:saveDialog',
      'file:pickDirectory',
      'file:pickImportSources',
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
  onMailStagedSyncProgress: (callback: (progress: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
    ipcRenderer.on('mail:stagedSyncProgress', listener);
    return () => ipcRenderer.removeListener('mail:stagedSyncProgress', listener);
  },
  onScheduledSendUpdated: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on('mail:scheduledSendUpdated', listener);
    return () => ipcRenderer.removeListener('mail:scheduledSendUpdated', listener);
  },
  onBackupProgress: (callback: (progress: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
    ipcRenderer.on('mail:backup-progress', listener);
    return () => ipcRenderer.removeListener('mail:backup-progress', listener);
  },
  onOpenSettings: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:open-settings', listener);
    return () => ipcRenderer.removeListener('app:open-settings', listener);
  },
  onComposeNewMail: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:compose-new-mail', listener);
    return () => ipcRenderer.removeListener('app:compose-new-mail', listener);
  },
  onRefreshMail: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:refresh-mail', listener);
    return () => ipcRenderer.removeListener('app:refresh-mail', listener);
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
