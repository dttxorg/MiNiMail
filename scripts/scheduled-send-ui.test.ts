import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatScheduledSendCountdown } from '../src/shared/compose/scheduleSend';

const app = readFileSync('src/renderer/App.tsx', 'utf8');
const sidebar = readFileSync('src/renderer/components/Sidebar.tsx', 'utf8');
const mailList = readFileSync('src/renderer/components/MailList.tsx', 'utf8');
const scheduledDetail = readFileSync('src/renderer/components/ScheduledSendDetail.tsx', 'utf8');
const service = readFileSync('src/main/services/scheduledSendService.ts', 'utf8');
const testSource = readFileSync('scripts/scheduled-send-ui.test.ts', 'utf8');

const future = formatScheduledSendCountdown(
  '2026-04-30T10:09:00.000Z',
  'scheduled',
  new Date('2026-04-30T10:00:00.000Z'),
  'en',
);
assert.equal(future.label, 'Sends in 9 min', 'future countdown should render a compact minute label');

const zhFuture = formatScheduledSendCountdown(
  '2026-04-30T10:09:00.000Z',
  'scheduled',
  new Date('2026-04-30T10:00:00.000Z'),
  'zh',
);
assert.equal(zhFuture.label, '9 分钟后发送', 'Chinese countdown should describe scheduled send timing');

assert.equal(
  formatScheduledSendCountdown('2026-04-30T10:00:00.000Z', 'scheduled', new Date('2026-04-30T10:00:01.000Z'), 'en').label,
  'Due',
  'due jobs should not imply automatic SMTP delivery in Phase 8D3',
);
assert.equal(
  formatScheduledSendCountdown('2026-04-30T10:00:00.000Z', 'cancelled', new Date('2026-04-30T09:00:00.000Z'), 'en').label,
  'Cancelled',
  'cancelled jobs should render a cancelled state',
);

assert(sidebar.includes('CalendarClock'), 'Sidebar should use a scheduled-send icon');
assert(sidebar.includes("onSelectFolder('scheduled')"), 'Sidebar should expose a Scheduled folder entry');
assert(sidebar.includes('scheduledCount'), 'Sidebar should render the scheduled count');
assert(sidebar.includes("t('scheduled')"), 'Sidebar label should use the Scheduled i18n key');

assert(app.includes("selectedFolder === 'scheduled'"), 'App should branch for the Scheduled view');
assert(app.includes("window.electronAPI.invoke('mail:listScheduledSends'"), 'Scheduled view should load jobs through mail:listScheduledSends');
assert(app.includes("window.electronAPI.invoke('mail:cancelScheduledSend'"), 'Scheduled view should cancel jobs through mail:cancelScheduledSend');
assert(app.includes("window.electronAPI.invoke('mail:sendScheduledNow'"), 'Scheduled view should allow explicit manual send for missed jobs');
assert(app.includes('<ScheduledSendDetail'), 'App should render the dedicated scheduled send detail panel');
assert(app.includes("setSelectedFolder('scheduled')"), 'Creating a scheduled job should navigate to Scheduled');
assert(app.includes('reloadScheduledSendJobs'), 'Creating or cancelling jobs should refresh the scheduled list/count');
assert(app.includes('accounts.length === 0') && app.includes('void reloadScheduledSendJobs();'), 'App startup/account hydration should refresh scheduled jobs for missed visibility');
assert(app.includes('promptedMissedScheduledJobIdsRef'), 'App should avoid repeatedly prompting for the same missed scheduled job');
assert(app.includes("job.status === 'missed'") && app.includes('missedScheduledSendNotice'), 'App should prompt when missed jobs are visible');
assert(app.includes('reviewScheduledSendsAction') && app.includes("setSelectedFolder('scheduled')"), 'Missed-job prompt should guide the user to Scheduled for explicit action');
assert(app.includes("job.status === 'scheduled' || job.status === 'missed' || job.status === 'failed'"), 'Cancelled jobs should be excluded from the active Scheduled list');

assert(mailList.includes("sortOrder?: 'newest' | 'oldest'"), 'MailList should support Scheduled ascending sort');
assert(mailList.includes("sortOrder === 'oldest'"), 'Scheduled list should be able to sort by soonest scheduledAt');
assert(mailList.includes('getScheduledStatusLabel'), 'Scheduled rows should render a status badge');
assert(mailList.includes('formatMailListDate(email.date'), 'Scheduled rows should display the scheduledAt date instead of past-relative time');

assert(scheduledDetail.includes('bodyHtml') && scheduledDetail.includes('bodyText'), 'Scheduled detail should display scheduled message body content');
assert(scheduledDetail.includes('sanitizeMailHtml'), 'Scheduled detail should sanitize HTML body before display');
assert(scheduledDetail.includes('formatScheduledSendCountdown'), 'Scheduled detail should show a live countdown label');
assert(scheduledDetail.includes('Local scheduling notice') && scheduledDetail.includes('MiNiMail 需要保持运行'), 'Scheduled detail should show the local scheduling risk notice');
assert(scheduledDetail.includes('onCancel(job.id)'), 'Scheduled detail should expose a cancel button');
assert(scheduledDetail.includes('onSendNow(job.id)'), 'Scheduled detail should expose a manual send-now button');
assert(scheduledDetail.includes("job.status === 'scheduled' || job.status === 'missed' || job.status === 'failed'"), 'Scheduled detail should allow cancelling active non-sent jobs');
assert(scheduledDetail.includes("job.status === 'missed' || job.status === 'failed'"), 'Scheduled detail should only offer manual send-now for missed or failed jobs');

assert(!/sendMail\s*[(]/.test(service), 'scheduled send data service should not call SMTP directly');
const scheduleHandler = app.slice(app.indexOf('const handleScheduleSendMail'), app.indexOf('const handleSaveAttempt'));
assert(!/console[.](log|warn|error)[(].*(subject|body|recipient|attachment)/i.test(scheduleHandler), 'Scheduled handlers should not log message content');
assert(!/console[.]log[(]/.test(testSource), 'scheduled send UI test should not print sensitive fixtures');
