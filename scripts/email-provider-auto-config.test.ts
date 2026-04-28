import assert from 'node:assert/strict';
import {
  applyEmailProviderAutoConfig,
  resolveEmailProviderAutoConfig,
} from '../src/renderer/utils/emailProviderAutoConfig';

const cases = [
  ['user@gmail.com', 'imap.gmail.com', 993, 'smtp.gmail.com', 465, 'gmail'],
  ['user@hotmail.com', 'outlook.office365.com', 993, 'smtp.office365.com', 587, 'outlook'],
  ['user@live.com', 'outlook.office365.com', 993, 'smtp.office365.com', 587, 'outlook'],
  ['user@yahoo.com', 'imap.mail.yahoo.com', 993, 'smtp.mail.yahoo.com', 465, 'yahoo'],
  ['user@icloud.com', 'imap.mail.me.com', 993, 'smtp.mail.me.com', 587, 'custom'],
  ['user@qq.com', 'imap.qq.com', 993, 'smtp.qq.com', 465, 'custom'],
  ['user@163.com', 'imap.163.com', 993, 'smtp.163.com', 465, 'custom'],
  ['user@126.com', 'imap.126.com', 993, 'smtp.126.com', 465, 'custom'],
  ['user@sohu.com', 'imap.sohu.com', 993, 'smtp.sohu.com', 465, 'custom'],
  ['user@zoho.com', 'imap.zoho.com', 993, 'smtp.zoho.com', 465, 'custom'],
] as const;

for (const [email, imapHost, imapPort, smtpHost, smtpPort, provider] of cases) {
  const config = resolveEmailProviderAutoConfig(email);
  assert.ok(config, `${email} should resolve`);
  assert.equal(config.imapHost, imapHost);
  assert.equal(config.imapPort, imapPort);
  assert.equal(config.smtpHost, smtpHost);
  assert.equal(config.smtpPort, smtpPort);
  assert.equal(config.provider, provider);
}

const gmailConfig = resolveEmailProviderAutoConfig('user@gmail.com');
assert.ok(gmailConfig, 'gmail should resolve');
assert.equal(gmailConfig.authType, 'oauth');
assert.equal(gmailConfig.provider, 'gmail');

const sohuConfig = resolveEmailProviderAutoConfig('user@sohu.com');
assert.ok(sohuConfig, 'sohu should resolve');
assert.equal(sohuConfig.imapHost, 'imap.sohu.com');
assert.equal(sohuConfig.imapPort, 993);
assert.equal(sohuConfig.imapSecure, true);
assert.notEqual(sohuConfig.imapPort, 43);
assert.equal(sohuConfig.smtpHost, 'smtp.sohu.com');
assert.equal(sohuConfig.smtpPort, 465);
assert.equal(sohuConfig.smtpSecure, true);

for (const email of ['user@outlook.com', 'user@hotmail.com', 'user@live.com', 'user@yahoo.com']) {
  const config = resolveEmailProviderAutoConfig(email);
  assert.ok(config, `${email} should resolve`);
  assert.equal(config.authType, 'oauth', `${email} should prefer OAuth over password auth`);
}

const genericConfig = resolveEmailProviderAutoConfig('user@example.org');
assert.ok(genericConfig, 'unknown but valid domains should use generic imap/smtp host fallback');
assert.equal(genericConfig.domain, 'example.org');
assert.equal(genericConfig.provider, 'custom');
assert.equal(genericConfig.authType, 'password');
assert.equal(genericConfig.imapHost, 'imap.example.org');
assert.equal(genericConfig.imapPort, 993);
assert.equal(genericConfig.imapSecure, true);
assert.equal(genericConfig.smtpHost, 'smtp.example.org');
assert.equal(genericConfig.smtpPort, 587);
assert.equal(genericConfig.smtpSecure, false);

assert.equal(resolveEmailProviderAutoConfig('invalid-email'), null);

const blankForm = {
  email: '',
  username: '',
  provider: 'custom' as const,
  auth_type: 'password' as const,
  imap_host: '',
  imap_port: 993,
  smtp_host: '',
  smtp_port: 587,
  use_tls: true,
};

const applied = applyEmailProviderAutoConfig(blankForm, 'user@qq.com');
assert.equal(applied.applied, true);
assert.equal(applied.form.imap_host, 'imap.qq.com');
assert.equal(applied.form.smtp_host, 'smtp.qq.com');
assert.equal(applied.form.smtp_port, 465);
assert.equal(applied.form.username, 'user@qq.com');

const manual = applyEmailProviderAutoConfig(
  { ...blankForm, imap_host: 'custom.imap.local', smtp_port: 2525 },
  'user@zoho.com',
  { imap_host: true, smtp_port: true },
);
assert.equal(manual.form.imap_host, 'custom.imap.local');
assert.equal(manual.form.smtp_host, 'smtp.zoho.com');
assert.equal(manual.form.smtp_port, 2525);

const genericApplied = applyEmailProviderAutoConfig(blankForm, 'person@example.org');
assert.equal(genericApplied.applied, true);
assert.equal(genericApplied.form.imap_host, 'imap.example.org');
assert.equal(genericApplied.form.smtp_host, 'smtp.example.org');
assert.equal(genericApplied.form.smtp_port, 587);

const genericManual = applyEmailProviderAutoConfig(
  { ...blankForm, imap_host: 'mail.example.org', smtp_host: 'send.example.org' },
  'person@example.org',
  { imap_host: true, smtp_host: true },
);
assert.equal(genericManual.form.imap_host, 'mail.example.org');
assert.equal(genericManual.form.smtp_host, 'send.example.org');

console.log('email provider auto config regression passed');
