import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run() {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/renderer/components/Sidebar.tsx'), 'utf8');

  assert(
    source.includes("USER_VISIBLE_PRIORITY_FOLDER_IDS = ['Priority/Needs Reply']"),
    'Expected Sidebar to expose only Priority/Needs Reply as a user-visible priority entry'
  );
  assert(
    !source.includes('priorityTone = folderId ==='),
    'Expected removed high/risk/low priority tone branching from Sidebar'
  );
  assert(
    source.includes('USER_VISIBLE_PRIORITY_FOLDER_IDS.filter'),
    'Expected visible priority folder list to use the user-visible allowlist'
  );

  console.log('sidebar-priority-folders tests passed');
}

run();
