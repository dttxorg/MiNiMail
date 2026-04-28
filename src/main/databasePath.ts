import fs from 'fs';
import path from 'path';

type DatabasePathLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

type DatabasePathOptions = {
  copyFileSync?: typeof fs.copyFileSync;
  existsSync?: typeof fs.existsSync;
  logger?: DatabasePathLogger;
  unlinkSync?: typeof fs.unlinkSync;
};

const NEW_DATABASE_FILE = 'minimail.db';
const LEGACY_DATABASE_FILE = 'apark.db';

export function resolveDatabasePath(userDataPath: string, options: DatabasePathOptions = {}): string {
  const existsSync = options.existsSync ?? fs.existsSync;
  const copyFileSync = options.copyFileSync ?? fs.copyFileSync;
  const unlinkSync = options.unlinkSync ?? fs.unlinkSync;
  const logger = options.logger;
  const newDbPath = path.join(userDataPath, NEW_DATABASE_FILE);
  const legacyDbPath = path.join(userDataPath, LEGACY_DATABASE_FILE);

  if (existsSync(newDbPath)) {
    return newDbPath;
  }

  if (!existsSync(legacyDbPath)) {
    return newDbPath;
  }

  try {
    const legacyFiles = [
      [legacyDbPath, newDbPath],
      [`${legacyDbPath}-wal`, `${newDbPath}-wal`],
      [`${legacyDbPath}-shm`, `${newDbPath}-shm`],
    ].filter(([source]) => existsSync(source));

    for (const [source, target] of legacyFiles) {
      copyFileSync(source, target);
    }

    logger?.info('Copied legacy database to minimail.db for compatibility');
    return newDbPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const target of [newDbPath, `${newDbPath}-wal`, `${newDbPath}-shm`]) {
      try {
        if (existsSync(target)) unlinkSync(target);
      } catch {
        logger?.warn('Could not remove partial minimail database copy after migration failure');
      }
    }
    logger?.warn(`Could not copy legacy database; continuing with legacy database path: ${message}`);
    return legacyDbPath;
  }
}
