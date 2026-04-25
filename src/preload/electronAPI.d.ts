import type { Account, CreateAccountInput, ApiResponse, ImapConnectionResult, SmtpConnectionResult, AIMailCategory } from '../renderer/types';
import type { MailBackupProgress } from '../shared/backup';
import type { MailHistoryRange } from '../shared/mailSyncSettings';

export interface MailStagedSyncProgress {
  accountId: number;
  folder: string;
  stageRange: MailHistoryRange;
  loadedCount: number;
  stageIndex: number;
  totalStages: number;
  done: boolean;
}

export interface MailAttachmentActionRequest {
  accountId: number;
  folder: string;
  uid: number;
  attachmentCacheId: string | number;
}

export interface MailAttachmentActionResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export type MailAttachmentIpcChannel = 'mail:downloadAttachment' | 'mail:openAttachment';

export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getUserDataPath: () => Promise<string>;
  openExternal: (target: string) => Promise<{ success: boolean; error?: string }>;
  downloadAttachment: (request: MailAttachmentActionRequest) => Promise<MailAttachmentActionResult>;
  openAttachment: (request: MailAttachmentActionRequest) => Promise<MailAttachmentActionResult>;
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
  onMessage: (callback: (message: string) => void) => void;
  onMailSync: (callback: (mail: any) => void) => void;
  onMailListUpdated: (callback: (data: { accountId: number; folder: string; newCount: number }) => void) => void;
  onMailStagedSyncProgress: (callback: (progress: MailStagedSyncProgress) => void) => () => void;
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
