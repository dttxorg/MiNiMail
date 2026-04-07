import { ipcMain } from 'electron';
import log from 'electron-log';
import {
  getAllAccounts,
  getAccountById,
  getAccountCredentials,
  createAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount,
  CreateAccountInput,
} from '../database';
import { testImapConnection, testSmtpConnection } from '../services/imap';

export function registerAccountHandlers(): void {
  log.info('Registering account IPC handlers');

  // Get all accounts
  ipcMain.handle('accounts:getAll', async () => {
    try {
      const accounts = getAllAccounts();
      // Don't expose sensitive data
      return { success: true, data: accounts };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to get accounts:', error);
      return { success: false, error: error.message };
    }
  });

  // Get single account
  ipcMain.handle('accounts:get', async (_event, id: number) => {
    try {
      const account = getAccountById(id);
      if (!account) {
        return { success: false, error: 'Account not found' };
      }
      return { success: true, data: account };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to get account ${id}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Create account
  ipcMain.handle('accounts:create', async (_event, input: CreateAccountInput) => {
    try {
      const account = createAccount(input);
      return { success: true, data: account };
    } catch (err) {
      const error = err as Error;
      log.error('Failed to create account:', error);
      return { success: false, error: error.message };
    }
  });

  // Update account
  ipcMain.handle('accounts:update', async (_event, id: number, input: Partial<CreateAccountInput>) => {
    try {
      const account = updateAccount(id, input);
      if (!account) {
        return { success: false, error: 'Account not found' };
      }
      return { success: true, data: account };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to update account ${id}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Delete account
  ipcMain.handle('accounts:delete', async (_event, id: number) => {
    try {
      const result = deleteAccount(id);
      if (!result) {
        return { success: false, error: 'Account not found' };
      }
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to delete account ${id}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Set default account
  ipcMain.handle('accounts:setDefault', async (_event, id: number) => {
    try {
      setDefaultAccount(id);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to set default account ${id}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Test IMAP connection
  ipcMain.handle('accounts:testImap', async (_event, id: number) => {
    try {
      const account = getAccountById(id);
      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      const credentials = getAccountCredentials(id);
      const result = await testImapConnection({
        host: account.imap_host,
        port: account.imap_port,
        username: account.username,
        password: credentials?.password,
        oauthToken: credentials?.oauth_token,
        useTLS: account.use_tls === 1,
      });

      return result;
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to test IMAP for account ${id}:`, error);
      return { success: false, message: error.message };
    }
  });

  // Test SMTP connection
  ipcMain.handle('accounts:testSmtp', async (_event, id: number) => {
    try {
      const account = getAccountById(id);
      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      const credentials = getAccountCredentials(id);
      const result = await testSmtpConnection({
        host: account.smtp_host,
        port: account.smtp_port,
        username: account.username,
        password: credentials?.password,
        oauthToken: credentials?.oauth_token,
        useTLS: account.use_tls === 1,
      });

      return result;
    } catch (err) {
      const error = err as Error;
      log.error(`Failed to test SMTP for account ${id}:`, error);
      return { success: false, message: error.message };
    }
  });

  log.info('Account IPC handlers registered');
}
