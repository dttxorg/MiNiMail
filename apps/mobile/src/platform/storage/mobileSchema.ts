export const MOBILE_SCHEMA_VERSION = 1;

export type MobileTableName =
  | 'accounts'
  | 'settings'
  | 'mail_cache'
  | 'scheduled_send_jobs';

export interface MobileSchemaTable {
  name: MobileTableName;
  createSql: string;
}

export interface MobileMigration {
  version: number;
  description: string;
  statements: string[];
}

export const mobileSchemaTables: MobileSchemaTable[] = [
  {
    name: 'accounts',
    createSql: `
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
    `,
  },
  {
    name: 'settings',
    createSql: `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `,
  },
  {
    name: 'mail_cache',
    createSql: `
      CREATE TABLE IF NOT EXISTS mail_cache (
        id TEXT PRIMARY KEY,
        uid INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        folder TEXT NOT NULL,
        "from" TEXT NOT NULL DEFAULT '',
        from_name TEXT NOT NULL DEFAULT '',
        "to" TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL DEFAULT '',
        snippet TEXT NOT NULL DEFAULT '',
        has_attachments INTEGER NOT NULL DEFAULT 0,
        is_read INTEGER NOT NULL DEFAULT 0,
        is_starred INTEGER NOT NULL DEFAULT 0,
        message_id TEXT,
        in_reply_to TEXT,
        references_header TEXT,
        body_html TEXT,
        body_text TEXT,
        draft_payload TEXT,
        local_draft_id TEXT,
        local_send_id TEXT,
        category TEXT,
        is_scanned INTEGER NOT NULL DEFAULT 0,
        scan_result TEXT,
        delivery_state TEXT,
        delivery_error TEXT,
        cached_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `,
  },
  {
    name: 'scheduled_send_jobs',
    createSql: `
      CREATE TABLE IF NOT EXISTS scheduled_send_jobs (
        id TEXT PRIMARY KEY,
        local_send_id TEXT NOT NULL UNIQUE,
        account_id INTEGER NOT NULL,
        from_email TEXT NOT NULL DEFAULT '',
        to_json TEXT NOT NULL DEFAULT '[]',
        cc_json TEXT NOT NULL DEFAULT '[]',
        bcc_json TEXT NOT NULL DEFAULT '[]',
        subject TEXT NOT NULL DEFAULT '',
        body_text TEXT NOT NULL DEFAULT '',
        body_html TEXT,
        editable_body TEXT,
        outgoing_attachments_json TEXT NOT NULL DEFAULT '[]',
        draft_payload_json TEXT,
        sent_folder_path TEXT,
        scheduled_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        failure_reason TEXT,
        last_attempt_at TEXT,
        sent_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `,
  },
];

export const mobileMigrations: MobileMigration[] = [
  {
    version: 1,
    description: 'Initial mobile schema aligned with desktop account, cache, settings, and scheduled-send storage.',
    statements: [
      'PRAGMA foreign_keys = ON',
      ...mobileSchemaTables.map((table) => table.createSql),
      'CREATE INDEX IF NOT EXISTS idx_mobile_mail_cache_account_folder_date ON mail_cache(account_id, folder, date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_mobile_mail_cache_local_draft_id ON mail_cache(account_id, local_draft_id) WHERE local_draft_id IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_mobile_mail_cache_local_send_id ON mail_cache(account_id, local_send_id) WHERE local_send_id IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_mobile_scheduled_send_jobs_status_at ON scheduled_send_jobs(status, scheduled_at)',
    ],
  },
];

export function getMobileMigrationPlan(fromVersion: number): MobileMigration[] {
  return mobileMigrations.filter((migration) => migration.version > fromVersion);
}
