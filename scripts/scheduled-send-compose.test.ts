import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getSchedulePresetTime,
  validateScheduledAt,
} from '../src/shared/compose/scheduleSend';

const base = new Date(2026, 3, 30, 10, 0, 0, 0);
assert.equal(
  getSchedulePresetTime('10m', base).getTime() - base.getTime(),
  10 * 60 * 1000,
  '10 minute preset should add ten minutes',
);

const eveningBeforeBase = new Date(2026, 3, 30, 10, 0, 0, 0);
const eveningBefore = getSchedulePresetTime('this_evening', eveningBeforeBase);
assert.equal(eveningBefore.getHours(), 18, 'this evening should use local 18:00 before evening');
assert.equal(eveningBefore.getDate(), eveningBeforeBase.getDate());

const eveningAfterBase = new Date(2026, 3, 30, 19, 0, 0, 0);
const eveningAfter = getSchedulePresetTime('this_evening', eveningAfterBase);
assert.equal(eveningAfter.getHours(), 18, 'this evening should still target local 18:00');
assert.equal(
  eveningAfter.getDate(),
  new Date(2026, 4, 1, 19, 0, 0, 0).getDate(),
  'this evening should roll to tomorrow if local 18:00 has passed',
);

const tomorrowMorning = getSchedulePresetTime('tomorrow_morning', base);
assert.equal(tomorrowMorning.getHours(), 9, 'tomorrow morning should use local 09:00');
assert.equal(
  tomorrowMorning.getDate(),
  new Date(2026, 4, 1, 10, 0, 0, 0).getDate(),
  'tomorrow morning should be the next local day',
);

assert.equal(validateScheduledAt(new Date(base.getTime() - 60 * 1000), base).ok, false, 'past custom time should be rejected');
assert.equal(validateScheduledAt(new Date(base.getTime() + 60 * 1000), base).ok, true, 'future custom time should be accepted');

const compose = readFileSync('src/renderer/components/ComposeDialog.tsx', 'utf8');
const app = readFileSync('src/renderer/App.tsx', 'utf8');
const i18n = readFileSync('src/renderer/i18n.ts', 'utf8');
const sidebar = readFileSync('src/renderer/components/Sidebar.tsx', 'utf8');
const testSource = readFileSync('scripts/scheduled-send-compose.test.ts', 'utf8');

assert(compose.includes('sendLaterLabel'), 'ComposeDialog should expose a Send later entry');
assert(compose.includes('CalendarClock'), 'ComposeDialog should render a send-later button beside send');
assert(compose.includes('scheduleNoticeTitle'), 'ComposeDialog should show the local scheduling notice');
assert(compose.includes('MiNiMail 需要保持运行') || i18n.includes('MiNiMail must stay running'), 'i18n should include the local scheduling risk notice');
assert(compose.includes('onClick={handleSend}'), 'Send now should still call the original immediate send handler');
assert(compose.includes('onScheduleSend'), 'ComposeDialog should use a separate schedule handler');

const scheduleHandlerStart = compose.indexOf('const handleScheduleSend = async');
const scheduleHandlerEnd = compose.indexOf('const handleSchedulePreset', scheduleHandlerStart);
const scheduleHandler = compose.slice(scheduleHandlerStart, scheduleHandlerEnd);
assert(!scheduleHandler.includes('onSend({'), 'Send later should not call the immediate onSend flow');
assert(scheduleHandler.includes('onScheduleSend({'), 'Send later should call the schedule handler');

assert(app.includes("window.electronAPI.invoke('mail:scheduleSend'"), 'App should create scheduled jobs through mail:scheduleSend');
assert(app.includes('scheduledAt: options.scheduledAt'), 'schedule payload should include scheduledAt');
assert(app.includes('sentFolderPath'), 'schedule payload should include the resolved Sent folder path');
assert(app.includes('draftPayload'), 'schedule payload should include draft payload for later recovery');

const schedulePayloadStart = app.indexOf("window.electronAPI.invoke('mail:scheduleSend'");
const schedulePayloadEnd = app.indexOf('}) as { success?: boolean', schedulePayloadStart);
const schedulePayload = app.slice(schedulePayloadStart, schedulePayloadEnd);
assert(schedulePayload.includes('editableBody: options.editableBody'), 'schedule payload should use marker-stripped editable body');
assert(!schedulePayload.includes('stripSignatureMarkerBeforeSend'), 'App should receive an already cleaned scheduled body from Compose');

assert(compose.includes('stripSignatureMarkerBeforeSend(body)'), 'Compose should strip signature marker before immediate or scheduled payload creation');
assert(i18n.includes('sendNowLabel') && i18n.includes('sendLaterLabel'), 'i18n should include send now/send later labels');
assert(i18n.includes('scheduleIn10MinutesLabel'), 'i18n should include preset labels');
assert(sidebar.includes("onSelectFolder('scheduled')"), 'Scheduled sidebar entry should be available once Phase 8D3 adds visibility');
assert(app.includes("setSelectedFolder('scheduled')"), 'Creating a scheduled job should move the user to Scheduled visibility');
assert(app.includes('reloadScheduledSendJobs'), 'Creating a scheduled job should refresh the Scheduled count/list');
assert(!/console[.](log|warn|error)[(].*(subject|body|recipient|attachment)/i.test(compose), 'Compose should not log scheduled message content');
assert(!/console[.]log[(]/.test(testSource), 'scheduled send compose test should not print message fixtures');
