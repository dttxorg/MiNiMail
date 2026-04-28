import fs from 'node:fs';
import path from 'node:path';

export function resolveDefaultMailCacheDbPath(): string {
  const roots = [process.env.APPDATA, process.env.HOME, process.cwd()].filter(Boolean) as string[];
  const candidates = roots.flatMap((root) => [
    path.join(root, 'minimail', 'mail_cache.db'),
    path.join(root, 'apark', 'mail_cache.db'),
  ]);

  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing || candidates[0];
}
