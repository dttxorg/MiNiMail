import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOBILE_SCHEMA_VERSION,
  getMobileMigrationPlan,
  mobileMigrations,
  mobileSchemaTables,
} from '../apps/mobile/src/platform/storage/mobileSchema';
import { createMobilePlatformServices } from '../apps/mobile/src/platform/services/mobilePlatformServices';
import { demoFolders, demoMails, demoMemorySnapshot, demoScheduledJobs } from '../apps/mobile/src/data/mobileDemoData';

const mobileAppConfig = JSON.parse(readFileSync(new URL('../apps/mobile/app.json', import.meta.url), 'utf8')) as {
  name?: string;
};

assert.equal(MOBILE_SCHEMA_VERSION, 1);
assert.equal(mobileMigrations.length, 1);
assert.deepEqual(
  mobileSchemaTables.map((table) => table.name),
  ['accounts', 'settings', 'mail_cache', 'scheduled_send_jobs']
);
assert.equal(getMobileMigrationPlan(0).length, 1);
assert.equal(getMobileMigrationPlan(MOBILE_SCHEMA_VERSION).length, 0);

const migrationSql = mobileMigrations.flatMap((migration) => migration.statements).join('\n');
for (const expected of ['CREATE TABLE IF NOT EXISTS accounts', 'CREATE TABLE IF NOT EXISTS mail_cache', 'scheduled_send_jobs']) {
  assert.ok(migrationSql.includes(expected), `expected migration SQL to contain ${expected}`);
}

const services = createMobilePlatformServices();
assert.deepEqual(Object.keys(services), [
  'accounts',
  'settings',
  'mail',
  'ai',
  'attachments',
  'scheduler',
  'oauth',
  'vectorMemory',
]);

await services.settings.set('mobile_foundation_test', 'ok');
const setting = await services.settings.get('mobile_foundation_test');
assert.equal(setting.success, true);
assert.equal(setting.data, 'ok');

await assert.rejects(
  () => services.mail.sync(1, 'INBOX'),
  /Mobile platform service is not implemented yet: mail\.sync/
);

const vectorSearch = await services.vectorMemory.search({ query: 'project update', limit: 3 });
assert.equal(vectorSearch.success, true);
assert.deepEqual(vectorSearch.data, []);
assert.equal(typeof services.vectorMemory.exportSnapshot, 'undefined');
assert.equal(typeof services.vectorMemory.importSnapshot, 'undefined');

assert.equal(demoFolders[0]?.label, '收件箱');
assert.ok(demoMails.length >= 3);
assert.ok(demoMails.some((mail) => mail.category === '重要' && mail.aiSummary.length > 20));
assert.deepEqual(
  demoFolders.map((folder) => folder.id),
  ['inbox', 'priority', 'starred', 'sent', 'all']
);
assert.ok(demoScheduledJobs.some((job) => job.status === 'scheduled'));
assert.equal(demoMemorySnapshot.name, '桌面端向量快照');
assert.equal(mobileAppConfig.name, 'MiNiMailMobile');

console.log('mobile foundation contract ok');
