import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mailIpc = readFileSync('src/main/ipc/mail.ts', 'utf8');
const mainIndex = readFileSync('src/main/index.ts', 'utf8');
const preload = readFileSync('src/preload/index.ts', 'utf8');
const preloadTypes = readFileSync('src/preload/electronAPI.d.ts', 'utf8');
const app = readFileSync('src/renderer/App.tsx', 'utf8');
const testSource = readFileSync('scripts/scheduled-send-auto.test.ts', 'utf8');

assert(mailIpc.includes('startScheduledSendScheduler'), 'mail IPC should export a scheduled send scheduler starter');
assert(mailIpc.includes('stopScheduledSendScheduler'), 'mail IPC should export a scheduled send scheduler stopper');
assert(mailIpc.includes('SCHEDULED_SEND_SCHEDULER_MAX_DELAY_MS'), 'scheduler should cap timer delay for robust wakeups');
assert(mailIpc.includes("listScheduledSendJobs({ status: 'scheduled' })"), 'scheduler should only scan scheduled jobs for automatic due sends');
assert(mailIpc.includes("await sendScheduledJobNow(job.id, 'auto')"), 'scheduler should automatically send due scheduled jobs');
assert(mailIpc.includes("trigger === 'manual'") && mailIpc.includes("trigger: ScheduledSendTrigger"), 'send helper should keep manual and automatic triggers distinct');
assert(mailIpc.includes("existing.status !== 'scheduled'"), 'automatic send should not process missed/failed jobs silently');
assert(mailIpc.includes('tryMarkJobSending(jobId)'), 'automatic send should use the DB status lock to prevent duplicates');
assert(mailIpc.includes('markScheduledJobSent'), 'automatic send success should mark the job sent');
assert(mailIpc.includes('markScheduledJobFailed'), 'automatic send failure should mark the job failed');
assert(mailIpc.includes("win.webContents.send('mail:scheduledSendUpdated'"), 'automatic send should notify renderer windows');
assert(mailIpc.includes('scheduleNextScheduledSendCheck();'), 'scheduler should reschedule after job changes');

assert(mainIndex.includes('restoreScheduledSendsOnStartup()'), 'startup should restore missed jobs before scheduling future sends');
assert(mainIndex.indexOf('restoreScheduledSendsOnStartup()') < mainIndex.indexOf('startScheduledSendScheduler()'), 'scheduler should start after startup missed restore');
assert(mainIndex.includes('stopScheduledSendScheduler()'), 'app shutdown should stop scheduler timers');

assert(preload.includes('mail:retryScheduledSend'), 'retry channel should be allowlisted');
assert(preload.includes('onScheduledSendUpdated'), 'preload should expose scheduled send update events');
assert(preloadTypes.includes('ScheduledSendUpdateEvent'), 'preload types should include scheduled send update payloads');

assert(app.includes('onScheduledSendUpdated'), 'renderer should subscribe to scheduled send update events');
assert(app.includes("event.trigger !== 'auto'"), 'renderer should avoid duplicate manual notifications');
assert(app.includes("event.status === 'sent'") && app.includes('appUi.sendSuccess'), 'automatic success should show a sent notification');
assert(app.includes("event.status === 'failed'") && app.includes('appUi.sendFailedFallback'), 'automatic failure should show a failed notification');
assert(app.includes('reviewScheduledSendsAction'), 'failed automatic sends should guide the user to retry or cancel');
assert(app.includes("window.electronAPI.invoke('mail:sendScheduledNow'"), 'manual retry should remain available from Scheduled detail');

const schedulerSource = mailIpc.slice(
  mailIpc.indexOf('function scheduleNextScheduledSendCheck'),
  mailIpc.indexOf('function formatAttachmentActionError'),
);
const schedulerLogLines = schedulerSource
  .split('\n')
  .filter((line) => /log[.](info|warn|error)[(]/.test(line) && /scheduledSend|scheduled send/i.test(line));
assert(
  !schedulerLogLines.some((line) => /\b(subject|body|cc|bcc|attachment)\b|\bto\s*:/i.test(line)),
  'scheduled send scheduler logs should not include message content',
);
assert(!/console[.]log[(]/.test(testSource), 'scheduled send auto test should not print fixtures');
