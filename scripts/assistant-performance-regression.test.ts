import fs from 'fs';
import path from 'path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const mailDetail = fs.readFileSync(path.join(process.cwd(), 'src/renderer/components/MailDetail.tsx'), 'utf8');

function testAssistantHasBoundedCacheAndCooldown() {
  assert(mailDetail.includes('ASSISTANT_RESULT_CACHE_LIMIT = 80'), 'Expected bounded assistant result cache');
  assert(mailDetail.includes('ASSISTANT_ERROR_COOLDOWN_MS'), 'Expected assistant error cooldown to prevent retry storms');
  assert(mailDetail.includes('rememberAssistantState(cacheKey, errorState, ASSISTANT_ERROR_COOLDOWN_MS)'), 'Expected failed assistant calls to be cooled down');
}

function testAssistantRequestsAreNotParallelStorms() {
  assert(!mailDetail.includes('Promise.all([\n        summarize(aiPayload'), 'Expected assistant auto-analysis to avoid four parallel model calls');
  assert(mailDetail.includes('const summaryResult = await summarize(aiPayload, normalizedLanguage);'), 'Expected summary request to run through controlled sequence');
  assert(mailDetail.includes('const actionsResult = await suggestActions(aiPayload, normalizedLanguage);'), 'Expected action request to run through controlled sequence');
}

function run() {
  testAssistantHasBoundedCacheAndCooldown();
  testAssistantRequestsAreNotParallelStorms();
  console.log('assistant performance regression tests passed');
}

run();
