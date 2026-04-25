import { formatMailListDate } from '../src/renderer/utils/mailDateDisplay';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testCurrentYearUsesMonthDay() {
  const now = new Date('2026-04-20T12:00:00Z');
  const mailDate = new Date('2026-02-11T08:00:00Z');
  const value = formatMailListDate(mailDate, 'zh-CN', now);
  assert(value === '2/11', `预期今年邮件显示 2/11，实际为 ${value}`);
}

function testPreviousYearUsesFullDate() {
  const now = new Date('2026-04-20T12:00:00Z');
  const mailDate = new Date('2025-11-15T08:00:00Z');
  const value = formatMailListDate(mailDate, 'zh-CN', now);
  assert(value === '2025-11-15', `预期往年邮件显示 2025-11-15，实际为 ${value}`);
}

function testMuchOlderYearUsesFullDate() {
  const now = new Date('2026-04-20T12:00:00Z');
  const mailDate = new Date('2022-01-03T08:00:00Z');
  const value = formatMailListDate(mailDate, 'en-US', now);
  assert(value === '2022-01-03', `预期更早邮件显示 2022-01-03，实际为 ${value}`);
}

testCurrentYearUsesMonthDay();
testPreviousYearUsesFullDate();
testMuchOlderYearUsesFullDate();

console.log('mail-date-display tests passed');
