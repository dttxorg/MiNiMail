const { spawnSync } = require('node:child_process');

function npmRunArgs(scriptName) {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, 'run', scriptName],
    };
  }

  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', scriptName],
  };
}

const tsLoaderImport = [
  'data:text/javascript,',
  'import { register } from "node:module";',
  'import { pathToFileURL } from "node:url";',
  'register("./scripts/ts-extension-loader.mjs", pathToFileURL("./"));',
].join('');

const checks = [
  {
    name: 'production build',
    ...npmRunArgs('build'),
  },
  {
    name: 'mail runtime regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/mail-runtime-regression.test.ts'],
  },
  {
    name: 'compose AI regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/compose-dialog-ai-regression.test.ts'],
  },
  {
    name: 'AI prompt regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/ai-prompts.test.ts'],
  },
  {
    name: 'project rename compatibility regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/project-rename-compat.test.ts'],
  },
  {
    name: 'AI key info i18n regression',
    command: process.execPath,
    args: ['scripts/ai-key-info-i18n-regression.test.cjs'],
  },
  {
    name: 'AI key info dynamic label regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/ai-key-info-dynamic-labels.test.ts'],
  },
  {
    name: 'compose state stability regression',
    command: process.execPath,
    args: ['scripts/compose-state-stability-regression.test.cjs'],
  },
  {
    name: 'AI secure storage regression',
    command: process.execPath,
    args: ['scripts/ai-secure-storage.test.cjs'],
  },
  {
    name: 'OpenAI-compatible provider regression',
    command: process.execPath,
    args: ['scripts/openai-compatible-provider.test.cjs'],
  },
  {
    name: 'GitHub priority classifier and redaction regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/github-priority-classifier.test.ts'],
  },
  {
    name: 'OAuth account upsert and SMTP auth regression',
    command: process.execPath,
    args: ['scripts/oauth-account-upsert-smtp.test.cjs'],
  },
  {
    name: 'remote image privacy regression',
    command: process.execPath,
    args: ['scripts/mail-remote-images.test.cjs'],
  },
  {
    name: 'draft cache identity regression',
    command: process.execPath,
    args: ['scripts/mail-draft-cache-identity.test.cjs'],
  },
  {
    name: 'body prefetch regression',
    command: process.execPath,
    args: ['scripts/mail-body-prefetch.test.cjs'],
  },
  {
    name: 'mail cache SQL window regression',
    command: process.execPath,
    args: ['scripts/mail-cache-sql-window.test.cjs'],
  },
  {
    name: 'mail attachments regression',
    command: process.execPath,
    args: ['scripts/mail-attachments-regression.test.cjs'],
  },
  {
    name: 'mail attachment download regression',
    command: process.execPath,
    args: ['scripts/mail-attachment-download.test.cjs'],
  },
  {
    name: 'sent attachment cache regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/sent-attachment-cache-regression.test.ts'],
  },
  {
    name: 'outgoing attachment durable cache regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/outgoing-attachment-cache-regression.test.ts'],
  },
  {
    name: 'mail outgoing attachments regression',
    command: process.execPath,
    args: ['scripts/mail-outgoing-attachments.test.cjs'],
  },
  {
    name: 'mail body search regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/mail-search-body.test.ts'],
  },
  {
    name: 'HTML translation preserve regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/html-translation-preserve.test.ts'],
  },
  {
    name: 'compose translation/draft regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/mail-compose-translation-draft-regression.test.ts'],
  },
  {
    name: 'draft delete selection regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/draft-delete-selection-regression.test.ts'],
  },
  {
    name: 'mail delete ghost regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/mail-delete-ghost-regression.test.ts'],
  },
  {
    name: 'compose i18n regression',
    command: process.execPath,
    args: ['scripts/compose-i18n-regression.test.cjs'],
  },
  {
    name: 'compose signature regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/compose-signatures.test.ts'],
  },
  {
    name: 'compose quick phrases regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/compose-quick-phrases.test.ts'],
  },
  {
    name: 'compose templates regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/compose-templates.test.ts'],
  },
  {
    name: 'email provider auto config regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/email-provider-auto-config.test.ts'],
  },
  {
    name: 'account empty state regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/account-empty-state-regression.test.ts'],
  },
  {
    name: 'settings modal close regression',
    command: process.execPath,
    args: ['scripts/settings-modal-close-regression.test.cjs'],
  },
  {
    name: 'backup task cleanup regression',
    command: process.execPath,
    args: ['scripts/mail-backup-task-cleanup-regression.test.cjs'],
  },
  {
    name: 'notification regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/mail-notification.test.ts'],
  },
  {
    name: 'Electron sandbox security regression',
    command: process.execPath,
    args: ['scripts/electron-sandbox-security.test.cjs'],
  },
  {
    name: 'macOS native experience regression',
    command: process.execPath,
    args: ['scripts/macos-native-experience.test.cjs'],
  },
  {
    name: 'mail detail layout/body rendering regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/mail-detail-layout-regression.test.ts'],
  },
  {
    name: 'mail body fallback regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/mail-body-fallback.test.ts'],
  },
  {
    name: 'sent forward cache regression',
    command: process.execPath,
    args: ['scripts/mail-sent-forward-cache.test.cjs'],
  },
  {
    name: 'mail folder resolution regression',
    command: process.execPath,
    args: ['--import', tsLoaderImport, 'scripts/mail-folder-resolution.test.ts'],
  },
  {
    name: 'send undo regression',
    command: process.execPath,
    args: ['scripts/mail-send-undo-regression.test.cjs'],
  },
  {
    name: 'compose forward attachments regression',
    command: process.execPath,
    args: ['scripts/compose-forward-attachments-regression.test.cjs'],
  },
  {
    name: 'IMAP UID fetch regression',
    command: process.execPath,
    args: ['scripts/mail-imap-uid-fetch.test.cjs'],
  },
];

const failures = [];

for (const check of checks) {
  console.log(`\n[test:release] ${check.name}`);
  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error || result.status !== 0) {
    failures.push({
      name: check.name,
      error: result.error?.message,
      status: result.status,
      signal: result.signal,
    });
  }
}

if (failures.length > 0) {
  console.error('\n[test:release] Failed checks:');
  for (const failure of failures) {
    const details = [
      `status: ${failure.status ?? 'n/a'}`,
      `signal: ${failure.signal ?? 'n/a'}`,
      failure.error ? `error: ${failure.error}` : null,
    ].filter(Boolean).join(', ');
    console.error(`- ${failure.name} (${details})`);
  }
  process.exitCode = 1;
} else {
  console.log('\n[test:release] All release checks passed.');
}
