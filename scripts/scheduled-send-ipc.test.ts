import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const preload = readFileSync('src/preload/index.ts', 'utf8');
const mailIpc = readFileSync('src/main/ipc/mail.ts', 'utf8');
const mainIndex = readFileSync('src/main/index.ts', 'utf8');
const service = readFileSync('src/main/services/scheduledSendService.ts', 'utf8');
const testSource = readFileSync('scripts/scheduled-send-ipc.test.ts', 'utf8');

const expectedChannels = [
  'mail:scheduleSend',
  'mail:listScheduledSends',
  'mail:cancelScheduledSend',
  'mail:getScheduledSend',
  'mail:markMissedScheduledSends',
  'mail:sendScheduledNow',
  'mail:retryScheduledSend',
];

for (const channel of expectedChannels) {
  assert(preload.includes(`'${channel}'`), `${channel} should be present in the preload allowlist`);
  assert(mailIpc.includes(`ipcMain.handle('${channel}'`), `${channel} should have a main IPC handler`);
}

assert(
  mailIpc.includes('createScheduledSendJob') &&
  mailIpc.includes('listScheduledSendJobs') &&
  mailIpc.includes('cancelScheduledSendJob') &&
  mailIpc.includes('getScheduledSendJob') &&
  mailIpc.includes('markMissedScheduledJobs') &&
  mailIpc.includes('tryMarkJobSending') &&
  mailIpc.includes('markScheduledJobSent') &&
  mailIpc.includes('markScheduledJobFailed'),
  'mail IPC should delegate scheduled send channels to the scheduled send service',
);

assert(
  mailIpc.includes('getAccountById(accountId)'),
  'schedule send IPC should validate that the account exists',
);

assert(
  mailIpc.includes('normalizeScheduledSendRequest'),
  'schedule send IPC should normalize and validate incoming scheduled send requests',
);

assert(
  mainIndex.includes('restoreScheduledSendJobs') &&
  mainIndex.includes('restoreScheduledSendsOnStartup'),
  'main process startup should restore scheduled send job state',
);

assert(
  service.includes('CREATE TABLE IF NOT EXISTS scheduled_send_jobs'),
  'service should initialize the scheduled_send_jobs schema idempotently',
);

assert(
  service.includes('idx_scheduled_send_jobs_status') &&
  service.includes('idx_scheduled_send_jobs_scheduled_at') &&
  service.includes('idx_scheduled_send_jobs_local_send_id'),
  'service should create scheduled send indexes for status, scheduled_at, and local_send_id',
);

assert(
  service.includes("WHERE id = @id AND status IN ('scheduled', 'missed', 'failed')"),
  'tryMarkJobSending should use a status-guarded update as the duplicate-send lock',
);

assert(
  service.includes("status = 'missed'") &&
  service.includes("status = 'scheduled' AND scheduled_at <= @nowValue"),
  'restore should mark past scheduled jobs as missed without sending them',
);

assert(
  !/sendMail\s*[(]/.test(service) &&
  !/mail:send/.test(service),
  'Phase 8D1 scheduled send service must not call SMTP send paths',
);

const sendNowHandler = mailIpc.slice(
  mailIpc.indexOf('async function sendScheduledJobNow'),
  mailIpc.indexOf('function scheduleNextScheduledSendCheck'),
);
assert(sendNowHandler.includes("!['missed', 'failed'].includes(existing.status)"), 'manual send-now should only allow missed or failed jobs');
assert(sendNowHandler.includes("trigger === 'manual'"), 'send-now helper should distinguish manual retries from automatic due sends');
assert(sendNowHandler.includes("existing.status !== 'scheduled'"), 'automatic send-now should only process scheduled due jobs');
assert(sendNowHandler.includes('tryMarkJobSending(jobId)'), 'manual send-now should lock the job before SMTP send');
assert(sendNowHandler.includes('sendMail({'), 'manual send-now should explicitly send only after user action');
assert(sendNowHandler.includes('markScheduledJobSent'), 'manual send-now should mark successful jobs sent');
assert(sendNowHandler.includes('markScheduledJobFailed'), 'manual send-now should mark failed jobs failed');
assert(sendNowHandler.includes("emitScheduledSendUpdate({ trigger, status: 'sent'"), 'send-now helper should notify renderer on success');
assert(sendNowHandler.includes("emitScheduledSendUpdate({ trigger, status: 'failed'"), 'send-now helper should notify renderer on failure');
const sendNowLogLines = sendNowHandler
  .split('\n')
  .filter((line) => /log[.](info|warn|error)[(]/.test(line));
assert(
  !sendNowLogLines.some((line) => /\b(subject|body|cc|bcc|attachment)\b|\bto\s*:/i.test(line)),
  'manual send-now handler should not log scheduled content',
);

assert(!/console[.]log[(]/.test(testSource), 'scheduled send IPC test should not print sensitive fixtures');
