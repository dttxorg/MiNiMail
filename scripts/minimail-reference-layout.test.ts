import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testSidebarBrandAndComposeEntry() {
  const sidebar = read('src/renderer/components/Sidebar.tsx');
  assert(sidebar.includes('MiNiMail'), 'Expected Sidebar brand to use MiNiMail');
  assert(sidebar.includes('minimailLogo'), 'Expected Sidebar brand to use the packaged MiNiMail logo asset');
  assert(sidebar.includes('ComposeHeroIcon'), 'Expected compose entry to use the new compose hero icon');
  assert(!sidebar.includes('ComposeShortcutBadge'), 'Expected compose entry to remove the ineffective shortcut badge');
  assert(!sidebar.includes('Ctrl+N'), 'Expected compose entry not to display an inactive Ctrl+N shortcut');
  assert(sidebar.includes('Plus'), 'Expected compose entry to keep plus icon affordance');
  assert(sidebar.includes('px-4 py-3'), 'Expected compose entry to tighten its size toward the reference');
  assert(!sidebar.includes('className="w-full px-5 py-4 cursor-pointer text-left"'), 'Expected compose entry to stop using the oversized spacing');
}

function testMailListWidthIsResizable() {
  const app = read('src/renderer/App.tsx');
  const mailList = read('src/renderer/components/MailList.tsx');

  assert(app.includes('mailListWidth'), 'Expected App.tsx to manage mail list width in state');
  assert(app.includes('isResizingMailList'), 'Expected App.tsx to track resizing interaction state');
  assert(app.includes('onMouseDown={startMailListResize}') || app.includes('onPointerDown={startMailListResize}'), 'Expected resize handle to start drag interaction');
  assert(!mailList.includes('width: 460'), 'Expected MailList width to stop hardcoding 460px');
}

function testComposeDialogGetsModernizedLayout() {
  const compose = read('src/renderer/components/ComposeDialog.tsx');
  assert(compose.includes('max-w-4xl'), 'Expected compose dialog shell to expand toward reference layout');
  assert(compose.includes('草稿'), 'Expected compose dialog header to mention draft context');
  assert(compose.includes('rounded-[24px]') || compose.includes('rounded-3xl'), 'Expected compose dialog to adopt softer large radius styling');
}

function testMailDetailBecomesMoreUnified() {
  const detail = read('src/renderer/components/MailDetail.tsx');
  assert(!detail.includes('borderBottom: `1px solid ${uiColor.borderSubtle}`'), 'Expected MailDetail to remove some rigid divider-heavy structure');
  assert(detail.includes('text-[22px] font-semibold text-white leading-tight'), 'Expected MailDetail to promote the subject into a unified hero heading');
  assert(detail.includes('AI 智能助手') || detail.includes('aiAssistant'), 'Expected unified detail still to include AI assistant area');
}

function run() {
  testSidebarBrandAndComposeEntry();
  testMailListWidthIsResizable();
  testComposeDialogGetsModernizedLayout();
  testMailDetailBecomesMoreUnified();
  console.log('minimail-reference-layout tests passed');
}

run();
