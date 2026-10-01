const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const main = read('src/main/services/ai.ts');
const app = read('src/renderer/App.tsx');
const ipc = read('src/main/ipc/ai.ts');
const preload = read('src/preload/index.ts');
const mailService = read('src/main/services/mailService.ts');

assert(
  app.includes("window.electronAPI.invoke('ai:getJevSettings')") &&
  app.includes('const hasJevKey ='),
  'Batch analysis must accept an enabled JEV key without requiring the generic AI key',
);
assert(
  app.includes("ai:organizeThreadWithJev") &&
  app.includes('conversationMessages.length < 3') &&
  app.includes('sort((left, right) => left.date.getTime() - right.date.getTime())'),
  'Long conversations must be organized through JEV in chronological order',
);
assert(
  main.includes('classifyGitHubMailViaJev({') &&
  main.includes('routing.github.repository_full_name') &&
  main.includes("source = 'jev'"),
  'GitHub classification must pass parsed repository context through JEV when enabled',
);
assert(
  main.includes('if (!getAIConfig().apiKey)') &&
  main.includes('returning JEV/local results only') &&
  main.includes('failedIds.push(...remainingGenericEmails.map'),
  'JEV-only operation must return successful JEV/local results without a generic-model crash',
);
assert(
  ipc.includes("ipcMain.handle('ai:organizeThreadWithJev'") &&
  ipc.includes('organizeThreadLineageWithJev(input)') &&
  preload.includes("'ai:organizeThreadWithJev'"),
  'Thread organization must be wired through main IPC and the preload allowlist',
);
assert(
  main.includes('jev: {') &&
  main.includes('urgencyScore: jevResult.urgencyScore') &&
  main.includes('matchedFolder: jevResult.matchedFolder'),
  'JEV structured metadata must remain available to the renderer response',
);
assert(
  mailService.includes('ALTER TABLE mail_cache ADD COLUMN classification_source TEXT') &&
  mailService.includes('classification_source = ?') &&
  app.includes('classificationSource: result.source'),
  'JEV source must be persisted and reflected back into renderer state',
);

console.log('jev runtime integration regression passed');
