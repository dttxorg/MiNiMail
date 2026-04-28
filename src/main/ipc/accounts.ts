import { ipcMain } from 'electron';
import log from 'electron-log';
import {
  getAllAccounts,
  getAccountById,
  getAccountCredentials,
  createOrUpdateAccountByEmail,
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

  // Create account — PRE-FLIGHT IMAP VALIDATION
  ipcMain.handle('accounts:create', async (_event, input: CreateAccountInput) => {
    try {
      // ── Step 1: Real IMAP handshake test before storing ──────────────────
      log.info(`[accounts:create] Testing IMAP connection for ${input.email} at ${input.imap_host}:${input.imap_port}`);

      const imapResult = await testImapConnection({
        host: input.imap_host,
        port: input.imap_port,
        username: input.username || input.email,
        password: input.password,
        oauthToken: input.oauth_token,
        useTLS: input.use_tls !== false,
      });

      if (!imapResult.success) {
        log.warn(`[accounts:create] IMAP handshake failed for ${input.email}: ${imapResult.message}`);
        return {
          success: false,
          error: `无法连接邮箱服务器：${imapResult.message}`,
          code: 'IMAP_AUTH_FAILED',
        };
      }

      log.info(`[accounts:create] IMAP handshake OK for ${input.email}, proceeding to store`);

      // ── Step 2: Encrypt & persist to SQLite ────────────────────────────────
      const account = createOrUpdateAccountByEmail(input);
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
