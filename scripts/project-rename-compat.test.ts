import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveDatabasePath } from '../src/main/databasePath';
import { resolveDefaultMailCacheDbPath } from './routing-diagnostics-path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minimail-rename-'));
}

function testPackageNameUsesMinimail() {
  const pkg = JSON.parse(read('package.json')) as { name?: string };
  const lock = JSON.parse(read('package-lock.json')) as { name?: string; packages?: Record<string, { name?: string }> };

  assert(pkg.name === 'minimail', `Expected package.json name to be minimail, got ${pkg.name}`);
  assert(lock.name === 'minimail', `Expected package-lock.json root name to be minimail, got ${lock.name}`);
  assert(lock.packages?.['']?.name === 'minimail', `Expected package-lock root package name to be minimail, got ${lock.packages?.['']?.name}`);
}

function testStartupLogUsesMinimailName() {
  const main = read('src/main/index.ts');

  assert(main.includes("log.info('MiNiMail starting...')"), 'Expected startup log to use MiNiMail');
  assert(!main.includes('APark Mail starting'), 'Expected startup log to stop referencing APark');
}

function testDatabasePathMigratesLegacyAparkDbByCopying() {
  const userDataPath = makeTempDir();
  const oldDb = path.join(userDataPath, 'apark.db');
  const newDb = path.join(userDataPath, 'minimail.db');
  fs.writeFileSync(oldDb, 'legacy-data');
  fs.writeFileSync(`${oldDb}-wal`, 'legacy-wal');
  fs.writeFileSync(`${oldDb}-shm`, 'legacy-shm');

  const result = resolveDatabasePath(userDataPath);

  assert(result === newDb, `Expected new database path, got ${result}`);
  assert(fs.readFileSync(newDb, 'utf8') === 'legacy-data', 'Expected legacy database to be copied to minimail.db');
  assert(fs.readFileSync(`${newDb}-wal`, 'utf8') === 'legacy-wal', 'Expected legacy WAL file to be copied with the database');
  assert(fs.readFileSync(`${newDb}-shm`, 'utf8') === 'legacy-shm', 'Expected legacy SHM file to be copied with the database');
  assert(fs.existsSync(oldDb), 'Expected legacy apark.db to remain in place after migration');
}

function testDatabasePathPrefersExistingMinimailDb() {
  const userDataPath = makeTempDir();
  const oldDb = path.join(userDataPath, 'apark.db');
  const newDb = path.join(userDataPath, 'minimail.db');
  fs.writeFileSync(oldDb, 'legacy-data');
  fs.writeFileSync(newDb, 'new-data');

  const result = resolveDatabasePath(userDataPath);

  assert(result === newDb, `Expected existing minimail database path, got ${result}`);
  assert(fs.readFileSync(newDb, 'utf8') === 'new-data', 'Expected existing minimail.db not to be overwritten');
}

function testDatabasePathFallsBackToLegacyDbWhenCopyFails() {
  const userDataPath = makeTempDir();
  const oldDb = path.join(userDataPath, 'apark.db');
  fs.writeFileSync(oldDb, 'legacy-data');
  const warnings: string[] = [];

  const result = resolveDatabasePath(userDataPath, {
    copyFileSync: () => {
      throw new Error('copy denied');
    },
    logger: {
      info: () => undefined,
      warn: (message: string) => warnings.push(message),
    },
  });

  assert(result === oldDb, `Expected fallback to legacy database path, got ${result}`);
  assert(warnings.some((message) => message.includes('legacy database')), 'Expected safe warning when legacy database copy fails');
}

function testRoutingDiagnosticsPrefersMinimailCacheAndKeepsLegacyFallback() {
  const root = makeTempDir();
  const previousAppData = process.env.APPDATA;
  const previousHome = process.env.HOME;
  process.env.APPDATA = root;
  process.env.HOME = '';
  fs.mkdirSync(path.join(root, 'minimail'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apark'), { recursive: true });
  const minimailCache = path.join(root, 'minimail', 'mail_cache.db');
  const legacyCache = path.join(root, 'apark', 'mail_cache.db');
  fs.writeFileSync(minimailCache, 'new-cache');
  fs.writeFileSync(legacyCache, 'legacy-cache');

  try {
    assert(resolveDefaultMailCacheDbPath() === minimailCache, 'Expected diagnostics export to prefer minimail cache');
    fs.unlinkSync(minimailCache);
    assert(resolveDefaultMailCacheDbPath() === legacyCache, 'Expected diagnostics export to fall back to legacy apark cache');
  } finally {
    if (previousAppData === undefined) {
      delete process.env.APPDATA;
    } else {
      process.env.APPDATA = previousAppData;
    }
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
}

function run() {
  testPackageNameUsesMinimail();
  testStartupLogUsesMinimailName();
  testDatabasePathMigratesLegacyAparkDbByCopying();
  testDatabasePathPrefersExistingMinimailDb();
  testDatabasePathFallsBackToLegacyDbWhenCopyFails();
  testRoutingDiagnosticsPrefersMinimailCacheAndKeepsLegacyFallback();
  console.log('project rename compatibility tests passed');
}

run();
