export type DeepScanDepth = 'normal' | 'advanced';

interface BaseDeepScanInput {
  depth: DeepScanDepth;
  subject: string;
  latestReply: string;
  quotedHistory?: string;
  links: Array<{ text: string; url: string }>;
}

export interface NormalDeepScanInput extends BaseDeepScanInput {
  depth: 'normal';
}

export interface AdvancedDeepScanInput extends BaseDeepScanInput {
  depth: 'advanced';
  safeHtml?: string;
  plainText: string;
  headers?: Record<string, string[]>;
}

export type DeepScanInput = NormalDeepScanInput | AdvancedDeepScanInput;

export interface DeepScanTask {
  title: string;
  deadline?: string;
  confidence: number;
}

export interface DeepScanEntity {
  type: string;
  value: string;
  confidence: number;
}

export interface DeepScanReplySuggestion {
  opening: string;
  body: string;
  confidence: number;
}

export interface DeepScanMemoryCandidate {
  type: 'contact' | 'project' | 'billing' | 'security' | 'relationship';
  summary: string;
  confidence: number;
}

export interface DeepScanResult {
  tasks: DeepScanTask[];
  deadlines: string[];
  entities: DeepScanEntity[];
  reply_suggestions: DeepScanReplySuggestion[];
  memory_candidates: DeepScanMemoryCandidate[];
}
