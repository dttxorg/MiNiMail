const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const databaseSource = fs.readFileSync(path.join(root, 'src/main/database.ts'), 'utf8');
const accountIpcSource = fs.readFileSync(path.join(root, 'src/main/ipc/accounts.ts'), 'utf8');
const smtpSource = fs.readFileSync(path.join(root, 'src/main/services/smtp.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  /export function getAccountByEmail\s*\(/.test(databaseSource),
  'database.ts should expose getAccountByEmail() for duplicate OAuth account lookup',
);

assert(
  /export function createOrUpdateAccountByEmail\s*\(/.test(databaseSource),
  'database.ts should expose createOrUpdateAccountByEmail() for OAuth reauthorization upsert',
);

assert(
  /lower\(email\)\s*=\s*lower\(\?\)/i.test(databaseSource),
  'duplicate account lookup should be case-insensitive by email',
);

assert(
  /createOrUpdateAccountByEmail\(input\)/.test(accountIpcSource),
  'accounts:create should use createOrUpdateAccountByEmail(input) instead of unconditional insert',
);

assert(
  !/const account = createAccount\(input\)/.test(accountIpcSource),
  'accounts:create must not unconditionally call createAccount(input)',
);

assert(
  /oauth_expiry/.test(databaseSource) && /updateAccountCredentials\([^)]*oauth_expiry/s.test(databaseSource),
  'OAuth credential updates should persist oauth_expiry during reauthorization',
);

assert(
  /refreshTokenForAccount/.test(smtpSource),
  'smtp.ts should refresh expired OAuth tokens before SMTP send/test',
);

assert(
  /type:\s*'OAuth2'/.test(smtpSource) && /accessToken:\s*credentials\.oauth_token/.test(smtpSource),
  'OAuth SMTP should use XOAUTH2 accessToken auth',
);

assert(
  /account\.auth_type\s*===\s*'oauth'[\s\S]*return\s*\{\s*success:\s*false/.test(smtpSource),
  'OAuth SMTP should fail explicitly when no OAuth token is available instead of falling back to password auth',
);

assert(
  /buildSmtpAuth/.test(smtpSource),
  'SMTP auth selection should be centralized so send and test paths share OAuth behavior',
);

console.log('[oauth-account-upsert-smtp] passed');
