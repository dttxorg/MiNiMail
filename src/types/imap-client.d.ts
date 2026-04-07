declare module 'imap-client' {
  export interface ImapClientOptions {
    host: string;
    port: number;
    auth?: {
      user: string;
      pass?: string;
      xoauth2?: string;
    };
    secure?: boolean;
    ignoreTLS?: boolean;
    requireTLS?: boolean;
    ca?: string[];
  }

  export default class ImapClient {
    constructor(options: ImapClientOptions);
    login(): Promise<void>;
    logout(): Promise<void>;
    selectMailbox(options: { path: string }): Promise<void>;
    search(options: {
      path: string;
      uid?: number;
      unread?: boolean;
      client?: unknown;
    }): Promise<number[]>;
    listMessages(options: {
      path: string;
      uids: number[];
      firstUid?: number;
      lastUid?: number;
    }): Promise<unknown[]>;
    addFlags(uids: number[], flags: string[]): Promise<void>;
    removeFlags(uids: number[], flags: string[]): Promise<void>;
    deleteMessages(uids: number[]): Promise<void>;
    moveMessages(uids: number[], path: string): Promise<void>;
    copyMessages(uids: number[], path: string): Promise<void>;
    createFolder(path: string): Promise<void>;
    deleteFolder(path: string): Promise<void>;
    renameFolder(oldPath: string, newPath: string): Promise<void>;
    append(options: { path: string; raw: string | Buffer }): Promise<void>;
    listenForChanges(options: { path: string }): Promise<void>;
    stopListeningForChanges(): Promise<void>;
    onSyncUpdate: ((update: unknown) => void) | false;
    onError: ((error: Error) => void) | false;
    mailboxCache: Record<string, {
      exists: number;
      uidNext: number;
      uidlist: number[];
    }>;
  }
}
