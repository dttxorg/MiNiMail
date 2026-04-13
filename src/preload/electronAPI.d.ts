import type { Account, CreateAccountInput, ApiResponse, ImapConnectionResult, SmtpConnectionResult, AIMailCategory } from '../renderer/types';
import type { MailBackupProgress } from '../shared/backup';

export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getUserDataPath: () => Promise<string>;
  invoke: <T = any>(channel: string, ...args: unknown[]) => Promise<T>;
  onMessage: (callback: (message: string) => void) => void;
  onMailSync: (callback: (mail: any) => void) => void;
  onMailListUpdated: (callback: (data: { accountId: number; folder: string; newCount: number }) => void) => void;
  onBackupProgress: (callback: (progress: MailBackupProgress) => void) => () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
  log: (...args: unknown[]) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
