import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import { encryptCredential, decryptCredential, isEncryptionAvailable } from './services/crypto';

let db: Database.Database | null = null;

export interface Account {
  id: number;
  email: string;
  display_name: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'custom';
  auth_type: 'password' | 'oauth';
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  // Password and OAuth tokens are stored separately and not exposed via JSON
  use_tls: number; // SQLite doesn't have boolean, use 0/1
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface AccountWithPassword extends Account {
  password?: string;
  oauth_token?: string;
  oauth_refresh_token?: string;
}

function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'apark.db');
}

export function initDatabase(): void {
  const dbPath = getDbPath();
  log.info(`Initializing database at: ${dbPath}`);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'custom',
      auth_type TEXT NOT NULL DEFAULT 'password',
      imap_host TEXT NOT NULL DEFAULT '',
      imap_port INTEGER NOT NULL DEFAULT 993,
      smtp_host TEXT NOT NULL DEFAULT '',
      smtp_port INTEGER NOT NULL DEFAULT 587,
      username TEXT NOT NULL DEFAULT '',
      use_tls INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create credentials table (separate for security)
  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL UNIQUE,
      password TEXT,
      oauth_token TEXT,
      oauth_refresh_token TEXT,
      oauth_expiry INTEGER,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Create settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  log.info('Database initialized successfully');
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function getAllAccounts(): Account[] {
  const stmt = getDatabase().prepare(`
    SELECT id, email, display_name, provider, auth_type,
           imap_host, imap_port, smtp_host, smtp_port,
           username, use_tls, is_default, created_at, updated_at
    FROM accounts ORDER BY is_default DESC, created_at ASC
  `);
  return stmt.all() as Account[];
}

export function getAccountById(id: number): Account | null {
  const stmt = getDatabase().prepare(`
    SELECT id, email, display_name, provider, auth_type,
           imap_host, imap_port, smtp_host, smtp_port,
           username, use_tls, is_default, created_at, updated_at
    FROM accounts WHERE id = ?
  `);
  return (stmt.get(id) as Account) || null;
}

export function getAccountCredentials(accountId: number): { password?: string; oauth_token?: string; oauth_refresh_token?: string; oauth_expiry?: number } | null {
  const stmt = getDatabase().prepare('SELECT password, oauth_token, oauth_refresh_token, oauth_expiry FROM credentials WHERE account_id = ?');
  const row = stmt.get(accountId) as { password?: Buffer; oauth_token?: Buffer; oauth_refresh_token?: Buffer; oauth_expiry?: number } | undefined;
  if (!row) return null;

  // Decrypt stored BLOB credentials
  let password: string | undefined;
  let oauth_token: string | undefined;
  let oauth_refresh_token: string | undefined;

  if (row.password) {
    try { password = decryptCredential(row.password); } catch { password = undefined; }
  }
  if (row.oauth_token) {
    try { oauth_token = decryptCredential(row.oauth_token); } catch { oauth_token = undefined; }
  }
  if (row.oauth_refresh_token) {
    try { oauth_refresh_token = decryptCredential(row.oauth_refresh_token); } catch { oauth_refresh_token = undefined; }
  }

  return { password, oauth_token, oauth_refresh_token, oauth_expiry: row.oauth_expiry };
}

export interface CreateAccountInput {
  email: string;
  display_name?: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'custom';
  auth_type: 'password' | 'oauth';
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password?: string;
  oauth_token?: string;
  oauth_refresh_token?: string;
  use_tls?: boolean;
}

export function createAccount(input: CreateAccountInput): Account {
  const db = getDatabase();

  // If this is the first account, make it default
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number };
  const isDefault = existingCount.count === 0 ? 1 : 0;

  const stmt = db.prepare(`
    INSERT INTO accounts (email, display_name, provider, auth_type, imap_host, imap_port,
                         smtp_host, smtp_port, username, use_tls, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    input.email,
    input.display_name || '',
    input.provider,
    input.auth_type,
    input.imap_host,
    input.imap_port,
    input.smtp_host,
    input.smtp_port,
    input.username,
    input.use_tls !== false ? 1 : 0,
    isDefault
  );

  const accountId = result.lastInsertRowid as number;

  // Store credentials (encrypted)
  if (!isEncryptionAvailable()) {
    log.warn('safeStorage not available, credentials will not be stored');
  } else {
    if (input.auth_type === 'password' && input.password) {
      const encryptedPassword = encryptCredential(input.password);
      db.prepare('INSERT INTO credentials (account_id, password) VALUES (?, ?)').run(accountId, encryptedPassword);
    } else if (input.auth_type === 'oauth' && (input.oauth_token || input.oauth_refresh_token)) {
      const encryptedToken = input.oauth_token ? encryptCredential(input.oauth_token) : null;
      const encryptedRefreshToken = input.oauth_refresh_token ? encryptCredential(input.oauth_refresh_token) : null;
      db.prepare('INSERT INTO credentials (account_id, oauth_token, oauth_refresh_token) VALUES (?, ?, ?)')
        .run(accountId, encryptedToken, encryptedRefreshToken);
    }
  }

  log.info(`Account created: ${input.email} (ID: ${accountId})`);
  return getAccountById(accountId)!;
}

export function updateAccount(id: number, input: Partial<CreateAccountInput>): Account | null {
  const db = getDatabase();
  const existing = getAccountById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (input.email !== undefined) { fields.push('email = ?'); values.push(input.email); }
  if (input.display_name !== undefined) { fields.push('display_name = ?'); values.push(input.display_name); }
  if (input.provider !== undefined) { fields.push('provider = ?'); values.push(input.provider); }
  if (input.imap_host !== undefined) { fields.push('imap_host = ?'); values.push(input.imap_host); }
  if (input.imap_port !== undefined) { fields.push('imap_port = ?'); values.push(input.imap_port); }
  if (input.smtp_host !== undefined) { fields.push('smtp_host = ?'); values.push(input.smtp_host); }
  if (input.smtp_port !== undefined) { fields.push('smtp_port = ?'); values.push(input.smtp_port); }
  if (input.username !== undefined) { fields.push('username = ?'); values.push(input.username); }
  if (input.use_tls !== undefined) { fields.push('use_tls = ?'); values.push(input.use_tls ? 1 : 0); }

  fields.push("updated_at = datetime('now')");

  if (fields.length > 0) {
    values.push(id);
    const stmt = db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  // Update credentials if provided (encrypt before storing)
  if (!isEncryptionAvailable()) {
    log.warn('safeStorage not available, credentials will not be updated');
  } else {
    if (input.password) {
      const encrypted = encryptCredential(input.password);
      db.prepare('UPDATE credentials SET password = ? WHERE account_id = ?').run(encrypted, id);
    }
    if (input.oauth_token !== undefined || input.oauth_refresh_token !== undefined) {
      const updates: string[] = [];
      const credValues: (Buffer | null)[] = [];
      if (input.oauth_token !== undefined) {
        updates.push('oauth_token = ?');
        credValues.push(input.oauth_token ? encryptCredential(input.oauth_token) : null);
      }
      if (input.oauth_refresh_token !== undefined) {
        updates.push('oauth_refresh_token = ?');
        credValues.push(input.oauth_refresh_token ? encryptCredential(input.oauth_refresh_token) : null);
      }
      if (updates.length > 0) {
        credValues.push(id as never);
        db.prepare(`UPDATE credentials SET ${updates.join(', ')} WHERE account_id = ?`).run(...credValues);
      }
    }
  }

  log.info(`Account updated: ID ${id}`);
  return getAccountById(id);
}

export function deleteAccount(id: number): boolean {
  const db = getDatabase();
  const account = getAccountById(id);
  if (!account) return false;

  db.prepare('DELETE FROM credentials WHERE account_id = ?').run(id);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);

  log.info(`Account deleted: ID ${id} (${account.email})`);
  return true;
}

export function setDefaultAccount(id: number): void {
  const db = getDatabase();
  db.prepare('UPDATE accounts SET is_default = 0').run();
  db.prepare('UPDATE accounts SET is_default = 1 WHERE id = ?').run(id);
  log.info(`Default account set to: ID ${id}`);
}

export function getSetting(key: string): string | null {
  const stmt = getDatabase().prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key) as { value: string } | undefined;
  return row?.value || null;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  log.info(`Setting saved: ${key}`);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info('Database closed');
  }
}
