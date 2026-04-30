import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testTrashAndSpamRenderNearSettings() {
  const sidebar = read('src/renderer/components/Sidebar.tsx');
  const lowFrequencyBlock = "FOLDERS.filter((folder) => folder.id !== 'inbox').map";
  const lowFrequencyIndex = sidebar.lastIndexOf(lowFrequencyBlock);
  const settingsIndex = sidebar.indexOf("onClick={onSettings}");

  assert(lowFrequencyIndex > 0, 'Expected Sidebar to render trash/spam as a low-frequency block');
  assert(settingsIndex > lowFrequencyIndex, 'Expected settings to render after trash/spam');
}

function testSidebarIncludesSentFolderEntry() {
  const sidebar = read('src/renderer/components/Sidebar.tsx');
  assert(sidebar.includes("{ id: 'sent', labelKey: 'sent' }"), 'Expected Sidebar folder config to include Sent');
  assert(sidebar.includes("folder.id === 'sent' ? navIcons.sent"), 'Expected Sidebar to render a Sent icon for the Sent folder');
}

function testSidebarDoesNotDuplicateUnreadEntry() {
  const sidebar = read('src/renderer/components/Sidebar.tsx');
  assert(!sidebar.includes("onClick={() => onSelectFolder('unread')}"), 'Expected Sidebar to remove the duplicate unread entry and leave unread filtering to the center tabs');
}

function run() {
  testTrashAndSpamRenderNearSettings();
  testSidebarIncludesSentFolderEntry();
  testSidebarDoesNotDuplicateUnreadEntry();
  console.log('sidebar low-frequency folders tests passed');
}

run();
