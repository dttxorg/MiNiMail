/**
 * TypeSafe Jev System One primitives and MiNiMail integration types.
 *
 * References:
 * - TypeSafe Jev API: https://docs.typesafe.ai/introduction
 * - fast-jev-compaction: context compaction & noise pruning pattern
 * - jev-ultrafast: dynamic indexed action space and typed choices
 */

export type JevRole = 'user' | 'assistant' | 'system';

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: {
    true?: string;
    false?: string;
  };
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type JevQuestions = Record<string, JevQuestion>;

export interface NoulAnswer {
  type?: 'noul';
  noul: number;
}

export interface ChoiceAnswer {
  type?: 'choice';
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface ScoreAnswer {
  type?: 'score';
  score: number;
  confidence: number;
  probabilities?: Record<string, number>;
}

export type JevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface JevResponse {
  model?: string;
  answers: Record<string, JevAnswer>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  [key: string]: unknown;
}

export type JevState = string | Record<string, unknown>;

export interface JevAsker {
  ask(state: JevState, questions: JevQuestions): Promise<JevResponse>;
}

// ---------------------------------------------------------------------------
// MiNiMail Jev Configuration & Privacy Settings
// ---------------------------------------------------------------------------

export interface JevSettings {
  /** Master switch. When false, system completely uses legacy regex/heuristic + LLM pipeline. */
  enabled: boolean;
  /** Encrypted API key for TypeSafe Jev. */
  apiKey: string;
  /** Custom endpoint or default https://api.typesafe.ai/v1/systemone */
  baseUrl: string;
  /** Model name, defaults to 'jev-latest' */
  model: string;
  /** Minimum confidence threshold for automatic decisions (default: 0.8) */
  confidenceThreshold: number;
  /** Number of most recent emails preserved verbatim in thread compaction (default: 2) */
  preserveRecentMails: number;
}

export const DEFAULT_JEV_SETTINGS: JevSettings = {
  enabled: false,
  apiKey: '',
  baseUrl: 'https://api.typesafe.ai/v1/systemone',
  model: 'jev-latest',
  confidenceThreshold: 0.8,
  preserveRecentMails: 2,
};

// ---------------------------------------------------------------------------
// Email Triage / Classification Types
// ---------------------------------------------------------------------------

export type JevEmailCategory =
  | 'inbox'         // Primary high-value correspondence
  | 'newsletter'    // Subscriptions, digests, articles
  | 'transactional' // Receipts, orders, bank statements, OTP codes
  | 'notification'  // Automated notices, GitHub, CI/CD, calendar alerts
  | 'risk'          // Phishing, fraud, security alerts
  | 'spam';         // Unsolicited sales, promotions

export type JevPriorityLevel = 'high' | 'normal' | 'low';

export interface JevMailClassification {
  mailId: string;
  category: JevEmailCategory;
  categoryConfidence: number;
  priority: JevPriorityLevel;
  priorityConfidence: number;
  actionRequired: boolean;
  actionRequiredProbability: number;
  urgencyScore: number;
  urgencyConfidence: number;
  isHighConfidence: boolean;
}

// ---------------------------------------------------------------------------
// Email Thread Compaction & Lineage (脉络整理) Types
// ---------------------------------------------------------------------------

export interface JevThreadMailInput {
  id: string;
  from: string;
  date: string;
  subject: string;
  bodyText: string;
  snippet?: string;
}

export interface JevThreadTurnDecision {
  mailId: string;
  from: string;
  date: string;
  subject: string;
  /** Probability (0..1) that this email contributes core progress or decisions */
  keepProbability: number;
  /** Decision: keep verbatim or prune redundant greeting/quote */
  kept: boolean;
  /** Whether Jev identified unresolved tasks / questions in this email */
  hasOpenLoops: boolean;
  /** Whether Jev identified concrete promises / deadlines in this email */
  hasCommitments: boolean;
  reason: 'preserved_recent' | 'informative' | 'redundant_chatter';
}

export interface JevThreadCompactionResult {
  threadId: string;
  originalMailCount: number;
  keptMailCount: number;
  decisions: JevThreadTurnDecision[];
  /** Compacted outline summarizing key progress points across the thread */
  compactedTimeline: Array<{
    mailId: string;
    from: string;
    date: string;
    summaryHint: string;
  }>;
  /** Extracted open loops (tasks waiting for follow-up) */
  openLoops: string[];
  /** Extracted commitments (promises, deliverables, agreed deadlines) */
  commitments: string[];
}
