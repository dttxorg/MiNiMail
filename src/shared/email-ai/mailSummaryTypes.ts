// Shared types for mail-level AI summary persistence (Layer 1 of the
// "knowledge bedrock" series). These types are imported by both the main
// process (`src/main/services/mailSummaryService.ts`, IPC handlers) and the
// renderer (`src/renderer/components/KnowledgeBasePanel.tsx`,
// `MailDetail.tsx`, `SettingsModal.tsx`). This module MUST stay free of
// Node-only or Electron-only imports so the renderer bundle does not pull
// in better-sqlite3 / electron-log / node:crypto / node:fs.

export type MailAiUrgency = 'now' | 'today' | 'later' | 'none';

export type MailAiQuickReply = {
  style: 'short' | 'formal' | 'best';
  body: string;
};

export type MailAiKeyInfo = Record<string, string | string[] | null>;

export type MailAiSummaryRecord = {
  accountId: number;
  mailId: string;
  subject: string;
  what: string;
  impact: string | null;
  action: string | null;
  urgency: MailAiUrgency;
  keyFacts: string[];
  keyInfo: MailAiKeyInfo;
  quickReplies: MailAiQuickReply[];
  model: string;
  promptHash: string;
  evidenceHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type MailAiThreadSummaryRecord = {
  accountId: number;
  threadId: string;
  threadSubject: string;
  threadParticipants: string[];
  mailCount: number;
  overallSummary: string;
  overallOpenLoops: string[];
  overallCommitments: string[];
  overallActionItems: string[];
  latestRoundSummary: string;
  latestRoundAt: string;
  model: string;
  evidenceHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type MailAiSummarySearchHit = {
  mailId: string;
  subject: string;
  snippet: string;
  score: number;
  source: 'mail' | 'thread';
};

export type PreheatMode = 'off' | 'conservative' | 'aggressive';

export type PreheatStatus = {
  mode: PreheatMode;
  queueLength: number;
  dailyUsed: number;
  dailyCap: number;
};

export const PREHEAT_DAILY_CAPS: Record<PreheatMode, number> = {
  off: 0,
  conservative: 50,
  aggressive: 200,
};

export const PREHEAT_RECENT_DAYS: Record<Exclude<PreheatMode, 'off'>, number> = {
  conservative: 7,
  aggressive: 30,
};
