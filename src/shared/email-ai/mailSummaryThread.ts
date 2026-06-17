// Pure helpers for mail-level AI summary thread identity. This module is
// imported by both the main process (`src/main/services/mailSummaryService.ts`)
// and the renderer (`src/renderer/components/MailDetail.tsx`), so it MUST NOT
// pull in `better-sqlite3`, `electron-log`, `node:fs`, or any other Node-only
// module. Only `node:crypto` is allowed (renderer bundles will tree-shake or
// polyfill it). If a future refactor adds more side effects here, split into
// a separate file.

import { createHash } from 'node:crypto';

export function normalizeSubjectForThread(subject: string): string {
  return String(subject || '')
    .toLowerCase()
    .replace(/^(re|fw|fwd|回复|转发)[:：\s]+/gi, '')
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .slice(0, 80);
}

function normalizeParticipants(participants: string[]): string[] {
  return Array.from(
    new Set(
      participants.map((p) => String(p || '').toLowerCase().trim()).filter(Boolean)
    )
  ).sort();
}

export function getOrBuildThreadId(input: { subject: string; from: string; to: string[] }): string {
  const subject = normalizeSubjectForThread(input.subject);
  const participants = normalizeParticipants([input.from, ...(input.to || [])]);
  const seed = `${subject}|${participants.join(',')}`;
  return createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

export function hashPrompt(input: { subject: string; body: string }): string {
  return createHash('sha256')
    .update(`${input.subject || ''}\n${(input.body || '').slice(0, 4000)}`)
    .digest('hex')
    .slice(0, 32);
}
