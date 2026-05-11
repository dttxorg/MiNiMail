import crypto from 'node:crypto';
import log from 'electron-log';
import { getSetting, setSetting } from '../database';
import {
  callAI,
  getAIModelProfileConfigForTask,
  normalizeOpenAICompatibleEmbeddingEndpoint,
  type AIResponse,
  type AIReplyCandidateMetadata,
  type AIResponseMetadata,
} from './ai/index';
import { getMailCacheDb } from './mailService';
import {
  buildContactKnowledgeChunks,
  buildContactKnowledgeSearchTerms,
  cleanScenarioEvidenceText,
  calculateContactWikiConfidence,
  cleanContactKnowledgeText,
  contactWikiConfidenceLevel,
  cosineSimilarity,
  extractJsonObjectPayload,
  extractForumFeedbackSignals,
  hybridContactChunkScore,
  hasForumRelayContext,
  inferContactChunkKind,
  inferContactKnowledgeLanguageHint,
  inferContactMailDirection,
  isForumRelayBoilerplateLine,
  keywordOverlapScore,
  mailMatchesContact,
  mailMatchesAnyContact,
  normalizeContactAliases,
  normalizeContactEmail,
  redactContactKnowledgeEvidenceText,
  searchTermOverlapScore,
  type ContactKnowledgeChunk,
  type ContactKnowledgeChunkKind,
  type ContactKnowledgeLanguageHint,
  type ContactKnowledgeMailDirection,
  type ContactKnowledgeMailLike,
  type ContactWikiConfidenceLevel,
} from '../../shared/contactKnowledge';
import {
  deriveEmailAIContext,
  redactSensitiveEntities,
  restoreSensitiveEntities,
  type EmailAIContext,
  type RedactionMapEntry,
} from '../../shared/email-ai';

const CONTACT_KNOWLEDGE_ENABLED_KEY = 'contact_knowledge_enabled_v1';
const CONTACT_BEHAVIOR_LEARNING_ENABLED_KEY = 'contact_behavior_learning_enabled_v1';
const MAX_SOURCE_MAILS = 240;
const MAX_WIKI_CONTEXT_CHUNKS = 10;
const CONTACT_MAIL_SCAN_PAGE_SIZE = 500;
const MAX_CONTACT_MAIL_SCAN_ROWS = MAX_SOURCE_MAILS * 40;
const LOCAL_EMBEDDING_MODEL = 'local-hash-embedding-v1';
const LOCAL_EMBEDDING_DIM = 384;
const WIKI_REBUILD_BACKOFF_MS = 5 * 60 * 1000;
const BEHAVIOR_SCHEMA_VERSION = 1;
const MIN_USER_INSIGHT_BEHAVIOR_SAMPLES = 3;

let remoteEmbeddingDisabledReason: string | null = null;

export type ContactKnowledgeSettings = {
  enabled: boolean;
};

export type ContactBehaviorSettings = {
  enabled: boolean;
  retentionDays: number;
  deviceScoped: true;
};

export type ContactWikiInsight = {
  text: string;
  confidence: ContactWikiConfidenceLevel;
  confidenceScore: number;
  evidenceIds: string[];
};

export type ContactWikiSenderType =
  | 'personal'
  | 'work_contact'
  | 'marketing'
  | 'newsletter'
  | 'vendor'
  | 'system_notification'
  | 'community_feedback'
  | 'unknown';

const SUPPORTS_USER_INSIGHTS: Record<ContactWikiSenderType, boolean> = {
  personal: true,
  work_contact: true,
  marketing: false,
  newsletter: false,
  vendor: false,
  system_notification: false,
  community_feedback: false,
  unknown: false,
};

export type SenderTypeSignal = {
  type: ContactWikiSenderType;
  score: number;
  source: string;
  strength: 'hard' | 'strong' | 'medium' | 'weak';
  reasonCode: string;
};

export type WikiDiagnostics = {
  fallbackReasons: string[];
  strippedFields: string[];
  canonicalSummaryField?: string;
  summaryReplaced: boolean;
};

type SenderTypeProfile = {
  senderType: ContactWikiSenderType;
  senderTypeConfidence: number;
  senderTypeSource: string;
  senderTypeUncertain: boolean;
  manualSenderTypeOverride: false;
  senderTypeSignals: SenderTypeSignal[];
  secondarySenderTypes: ContactWikiSenderType[];
};

type ScenarioEvidenceKind = 'deal' | 'change' | 'deadline' | 'pattern' | 'feedback';

type ScenarioEvidenceItem = {
  date: string;
  signal: string;
  kind: ScenarioEvidenceKind;
};

type ScenarioEvidence = {
  dealSignals: ScenarioEvidenceItem[];
  changeSignals: ScenarioEvidenceItem[];
  deadlineSignals: ScenarioEvidenceItem[];
  patternSignals: ScenarioEvidenceItem[];
};

export type ContactWiki = {
  accountId: number;
  contactEmail: string;
  contactName?: string;
  aliases: string[];
  senderType: ContactWikiSenderType;
  senderTypeConfidence: number;
  senderTypeSource: string;
  senderTypeUncertain: boolean;
  manualSenderTypeOverride: boolean;
  senderTypeSignals: SenderTypeSignal[];
  secondarySenderTypes: ContactWikiSenderType[];
  summary: string;
  recentContext: string[];
  openLoops: string[];
  replyStyle: string[];
  relationshipProfile: string;
  activeProjects: string[];
  preferences: string[];
  commitments: string[];
  unresolvedQuestions: string[];
  lastInteractionSummary: string;
  userInsights: ContactWikiInsight[];
  engagementProfile: string[];
  valueForUser: ContactWikiInsight[];
  confidence: {
    score: number;
    level: ContactWikiConfidenceLevel;
  };
  evidenceQuality: string[];
  doNotOverfitSignals: string[];
  languageProfile: string[];
  subscriptionValue: string;
  promotionPattern: string;
  bestDealSoFar: string[];
  actionAdvice: string;
  replyNeeded: boolean | null;
  readingValue: string;
  frequency: string;
  contentStability: string;
  subscribeWorth: boolean | null;
  serviceType: string;
  userAction: string;
  riskAlert: string | null;
  feedbackThemes: string[];
  featureRequests: string[];
  criticisms: string[];
  praises: string[];
  suggestedNextActions: string[];
  replyEntry: string;
  wikiDiagnostics: WikiDiagnostics;
  syncReadiness: {
    deviceScoped: boolean;
    crossDeviceSyncEnabled: false;
    schemaVersion: number;
  };
  sourceMailCount: number;
  chunkCount: number;
  lastIndexedAt: string;
  stale: boolean;
  staleReason?: string;
  evidenceChangedAt?: string;
};

export type BuildContactWikiRequest = {
  accountId: number;
  contactEmail: string;
  contactName?: string;
  aliases?: string[];
  force?: boolean;
  targetLang?: string;
};

export type ReindexContactKnowledgeRequest = BuildContactWikiRequest;

export type ContactReplySuggestionRequest = {
  accountId: number;
  contactEmail: string;
  aliases?: string[];
  mailId: string;
  instruction?: string;
  targetLang?: string;
};

export type ContactKnowledgeStats = {
  accountId: number;
  contactCount: number;
  chunkCount: number;
  staleCount: number;
  contacts: Array<{
    contactEmail: string;
    sourceMailCount: number;
    chunkCount: number;
    lastIndexedAt: string;
    stale: boolean;
    staleReason?: string;
  }>;
};

export type ContactWikiFeedbackRequest = {
  accountId: number;
  contactEmail: string;
  target: 'wiki' | 'reply';
  rating: 'useful' | 'inaccurate' | 'not_relevant' | 'too_long' | 'too_formal' | 'too_short';
  reason?: string;
};

export type ContactBehaviorEventType =
  | 'open'
  | 'dwell_bucket'
  | 'scroll_bucket'
  | 'link_domain_click'
  | 'remote_images_shown'
  | 'attachment_action'
  | 'reply_started'
  | 'archived'
  | 'deleted'
  | 'starred';

export type ContactMailInteractionRequest = {
  eventId?: string;
  accountId: number;
  mailId: string;
  contactEmail?: string;
  contactEmailHash?: string;
  deviceId?: string;
  eventType: ContactBehaviorEventType;
  eventValue?: Record<string, unknown>;
  createdAt?: string;
};

type CachedContactMailRow = {
  id: string;
  uid: number;
  from: string;
  from_name: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  folder: string;
  account_id: number;
  body_text?: string | null;
  body_html?: string | null;
  delivery_state?: string | null;
};

type StoredChunkRow = {
  chunk_id: string;
  mail_id: string;
  subject: string;
  date: string;
  text: string;
  embedding_json: string;
  embedding_model?: string | null;
  embedding_dim?: number | null;
  content_hash?: string | null;
  mail_date?: string | null;
  chunk_kind?: ContactKnowledgeChunkKind | null;
  direction?: ContactKnowledgeMailDirection | null;
  search_terms?: string | null;
  language_hint?: ContactKnowledgeLanguageHint | null;
};

type EmbeddingResult = {
  embedding: number[];
  model: string;
};

function createLocalEmbedding(input: string): EmbeddingResult {
  const vector = new Array<number>(LOCAL_EMBEDDING_DIM).fill(0);
  const tokens = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((token) => token.length > 1)
    .slice(0, 1200);

  for (const token of tokens) {
    const digest = crypto.createHash('sha256').update(token).digest();
    const index = digest.readUInt16BE(0) % LOCAL_EMBEDDING_DIM;
    const sign = digest[2] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return {
    embedding: magnitude > 0 ? vector.map((value) => value / magnitude) : vector,
    model: LOCAL_EMBEDDING_MODEL,
  };
}

function contactHash(contactEmail: string): string {
  return crypto.createHash('sha256').update(normalizeContactEmail(contactEmail)).digest('hex').slice(0, 12);
}

function assertEnabled(): void {
  if (!getContactKnowledgeSettings().enabled) {
    throw new Error('Contact knowledge is disabled. Enable historical mail knowledge in AI settings first.');
  }
}

function validateAccountId(accountId: number): number {
  const normalized = Number(accountId);
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error('Invalid account id.');
  return Math.floor(normalized);
}

function validateContactEmail(contactEmail: string): string {
  const normalized = normalizeContactEmail(contactEmail || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error('Invalid contact email.');
  return normalized;
}

function ensureContactKnowledgeTables(): void {
  const db = getMailCacheDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_knowledge_chunks (
      chunk_id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      contact_email TEXT NOT NULL,
      mail_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      embedding_model TEXT,
      embedding_dim INTEGER,
      content_hash TEXT,
      indexed_at TEXT,
      mail_date TEXT,
      chunk_kind TEXT NOT NULL DEFAULT 'message_body',
      direction TEXT NOT NULL DEFAULT 'inbound',
      search_terms TEXT NOT NULL DEFAULT '',
      language_hint TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  for (const sql of [
    'ALTER TABLE contact_knowledge_chunks ADD COLUMN embedding_model TEXT',
    'ALTER TABLE contact_knowledge_chunks ADD COLUMN embedding_dim INTEGER',
    'ALTER TABLE contact_knowledge_chunks ADD COLUMN content_hash TEXT',
    'ALTER TABLE contact_knowledge_chunks ADD COLUMN indexed_at TEXT',
    'ALTER TABLE contact_knowledge_chunks ADD COLUMN mail_date TEXT',
    "ALTER TABLE contact_knowledge_chunks ADD COLUMN chunk_kind TEXT NOT NULL DEFAULT 'message_body'",
    "ALTER TABLE contact_knowledge_chunks ADD COLUMN direction TEXT NOT NULL DEFAULT 'inbound'",
    "ALTER TABLE contact_knowledge_chunks ADD COLUMN search_terms TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE contact_knowledge_chunks ADD COLUMN language_hint TEXT NOT NULL DEFAULT 'unknown'",
  ]) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contact_knowledge_chunks_contact
    ON contact_knowledge_chunks(account_id, contact_email, date DESC)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contact_knowledge_chunks_hash
    ON contact_knowledge_chunks(account_id, contact_email, chunk_id, content_hash, embedding_model)
  `);
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS contact_knowledge_chunks_fts
      USING fts5(chunk_id UNINDEXED, subject, text, tokenize='unicode61')
    `);
  } catch (error) {
    log.warn('[contactKnowledge] FTS unavailable; falling back to keyword scoring', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_knowledge_wikis (
      account_id INTEGER NOT NULL,
      contact_email TEXT NOT NULL,
      contact_name TEXT,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      recent_context_json TEXT NOT NULL DEFAULT '[]',
      open_loops_json TEXT NOT NULL DEFAULT '[]',
      reply_style_json TEXT NOT NULL DEFAULT '[]',
      structured_profile_json TEXT NOT NULL DEFAULT '{}',
      source_mail_count INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      last_indexed_at TEXT NOT NULL,
      stale INTEGER NOT NULL DEFAULT 0,
      stale_reason TEXT,
      evidence_hash TEXT,
      evidence_changed_at TEXT,
      last_build_attempt_at TEXT,
      build_backoff_until TEXT,
      PRIMARY KEY (account_id, contact_email)
    )
  `);
  for (const sql of [
    "ALTER TABLE contact_knowledge_wikis ADD COLUMN aliases_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE contact_knowledge_wikis ADD COLUMN structured_profile_json TEXT NOT NULL DEFAULT '{}'",
    'ALTER TABLE contact_knowledge_wikis ADD COLUMN stale_reason TEXT',
    'ALTER TABLE contact_knowledge_wikis ADD COLUMN evidence_hash TEXT',
    'ALTER TABLE contact_knowledge_wikis ADD COLUMN evidence_changed_at TEXT',
    'ALTER TABLE contact_knowledge_wikis ADD COLUMN last_build_attempt_at TEXT',
    'ALTER TABLE contact_knowledge_wikis ADD COLUMN build_backoff_until TEXT',
  ]) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_knowledge_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      contact_email TEXT NOT NULL,
      target TEXT NOT NULL,
      rating TEXT NOT NULL,
      reason_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contact_knowledge_feedback_contact
    ON contact_knowledge_feedback(account_id, contact_email, created_at DESC)
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_knowledge_interactions (
      event_id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      mail_id TEXT NOT NULL,
      contact_email_hash TEXT NOT NULL,
      device_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_value_json TEXT NOT NULL DEFAULT '{}',
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      aggregated_at TEXT
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contact_knowledge_interactions_contact
    ON contact_knowledge_interactions(account_id, contact_email_hash, created_at DESC)
  `);
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function clampString(value: unknown, maxLength: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function clampStringArray(value: unknown, limit: number, maxLength = 180): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clampString(item, maxLength)).filter(Boolean).slice(0, limit);
}

function normalizeConfidence(value: unknown): ContactWikiConfidenceLevel {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function normalizeSenderType(value: unknown): ContactWikiSenderType {
  return value === 'personal'
    || value === 'work_contact'
    || value === 'marketing'
    || value === 'newsletter'
    || value === 'vendor'
    || value === 'system_notification'
    || value === 'community_feedback'
    || value === 'unknown'
    ? value
    : 'unknown';
}

function clampInsightArray(value: unknown, limit: number): ContactWikiInsight[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') {
      return { text: clampString(item, 220), confidence: 'low' as const, confidenceScore: 0.35, evidenceIds: [] };
    }
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const score = Math.max(0, Math.min(1, Number(record.confidenceScore ?? 0.35)));
    return {
      text: clampString(record.text || record.value || record.summary, 220),
      confidence: normalizeConfidence(record.confidence || contactWikiConfidenceLevel(score)),
      confidenceScore: Number(score.toFixed(4)),
      evidenceIds: clampStringArray(record.evidenceIds, 6, 80),
    };
  }).filter((item) => item.text).slice(0, limit);
}

function clampSenderTypeSignals(value: unknown, limit = 8): SenderTypeSignal[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const score = Math.max(0, Math.min(1, Number(record.score || 0)));
    const strength: SenderTypeSignal['strength'] = record.strength === 'hard' || record.strength === 'strong' || record.strength === 'medium' || record.strength === 'weak'
      ? record.strength
      : 'weak';
    return {
      type: normalizeSenderType(record.type),
      score: Number(score.toFixed(4)),
      source: clampString(record.source, 80),
      strength,
      reasonCode: clampString(record.reasonCode, 80),
    };
  }).filter((item) => item.type !== 'unknown' && item.source && item.reasonCode).slice(0, limit);
}

function clampSenderTypeArray(value: unknown, limit = 4): ContactWikiSenderType[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ContactWikiSenderType>();
  const result: ContactWikiSenderType[] = [];
  for (const item of value) {
    const type = normalizeSenderType(item);
    if (type === 'unknown' || seen.has(type)) continue;
    seen.add(type);
    result.push(type);
    if (result.length >= limit) break;
  }
  return result;
}

function clampWikiDiagnostics(value: unknown): WikiDiagnostics {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const canonical = clampString(record.canonicalSummaryField, 80);
  return {
    fallbackReasons: clampStringArray(record.fallbackReasons, 8, 120),
    strippedFields: clampStringArray(record.strippedFields, 16, 80),
    ...(canonical ? { canonicalSummaryField: canonical } : {}),
    summaryReplaced: Boolean(record.summaryReplaced),
  };
}

function parseStructuredProfile(value: string | null | undefined): Pick<ContactWiki,
  'senderType' | 'senderTypeConfidence' | 'senderTypeSource' | 'senderTypeUncertain' | 'manualSenderTypeOverride' |
  'senderTypeSignals' | 'secondarySenderTypes' |
  'relationshipProfile' | 'activeProjects' | 'preferences' | 'commitments' | 'unresolvedQuestions' | 'lastInteractionSummary' |
  'userInsights' | 'engagementProfile' | 'valueForUser' | 'confidence' | 'evidenceQuality' | 'doNotOverfitSignals' |
  'languageProfile' | 'subscriptionValue' | 'promotionPattern' | 'bestDealSoFar' | 'actionAdvice' | 'replyNeeded' |
  'readingValue' | 'frequency' | 'contentStability' | 'subscribeWorth' | 'serviceType' | 'userAction' | 'riskAlert' |
  'feedbackThemes' | 'featureRequests' | 'criticisms' | 'praises' | 'suggestedNextActions' | 'replyEntry' | 'wikiDiagnostics' |
  'syncReadiness'
> {
  const fallback = {
    senderType: 'unknown' as const,
    senderTypeConfidence: 0,
    senderTypeSource: 'fallback',
    senderTypeUncertain: true,
    manualSenderTypeOverride: false,
    senderTypeSignals: [],
    secondarySenderTypes: [],
    relationshipProfile: '',
    activeProjects: [],
    preferences: [],
    commitments: [],
    unresolvedQuestions: [],
    lastInteractionSummary: '',
    userInsights: [],
    engagementProfile: [],
    valueForUser: [],
    confidence: { score: 0, level: 'low' as const },
    evidenceQuality: [],
    doNotOverfitSignals: [],
    languageProfile: [],
    subscriptionValue: '',
    promotionPattern: '',
    bestDealSoFar: [],
    actionAdvice: '',
    replyNeeded: null,
    readingValue: '',
    frequency: '',
    contentStability: '',
    subscribeWorth: null,
    serviceType: '',
    userAction: '',
    riskAlert: null,
    feedbackThemes: [],
    featureRequests: [],
    criticisms: [],
    praises: [],
    suggestedNextActions: [],
    replyEntry: '',
    wikiDiagnostics: { fallbackReasons: [], strippedFields: [], summaryReplaced: false },
    syncReadiness: { deviceScoped: true, crossDeviceSyncEnabled: false as const, schemaVersion: BEHAVIOR_SCHEMA_VERSION },
  };
  if (!value) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const confidenceScore = Math.max(0, Math.min(1, Number((parsed.confidence as Record<string, unknown> | undefined)?.score || 0)));
    const senderType = normalizeSenderType(parsed.senderType);
    const senderTypeConfidence = Math.max(0, Math.min(1, Number(parsed.senderTypeConfidence || 0)));
    return {
      senderType,
      senderTypeConfidence: Number(senderTypeConfidence.toFixed(4)),
      senderTypeSource: clampString(parsed.senderTypeSource, 80) || 'stored',
      senderTypeUncertain: Boolean(parsed.senderTypeUncertain),
      manualSenderTypeOverride: Boolean(parsed.manualSenderTypeOverride),
      senderTypeSignals: clampSenderTypeSignals(parsed.senderTypeSignals),
      secondarySenderTypes: clampSenderTypeArray(parsed.secondarySenderTypes),
      relationshipProfile: clampString(parsed.relationshipProfile, 500),
      activeProjects: clampStringArray(parsed.activeProjects, 5),
      preferences: clampStringArray(parsed.preferences, 5),
      commitments: clampStringArray(parsed.commitments, 5),
      unresolvedQuestions: clampStringArray(parsed.unresolvedQuestions, 5),
      lastInteractionSummary: clampString(parsed.lastInteractionSummary, 500),
      userInsights: clampInsightArray(parsed.userInsights, 5),
      engagementProfile: clampStringArray(parsed.engagementProfile, 5),
      valueForUser: clampInsightArray(parsed.valueForUser, 5),
      confidence: {
        score: Number(confidenceScore.toFixed(4)),
        level: normalizeConfidence((parsed.confidence as Record<string, unknown> | undefined)?.level || contactWikiConfidenceLevel(confidenceScore)),
      },
      evidenceQuality: clampStringArray(parsed.evidenceQuality, 5),
      doNotOverfitSignals: clampStringArray(parsed.doNotOverfitSignals, 5),
      languageProfile: clampStringArray(parsed.languageProfile, 5),
      subscriptionValue: clampString(parsed.subscriptionValue, 180),
      promotionPattern: clampString(parsed.promotionPattern, 300),
      bestDealSoFar: clampStringArray(parsed.bestDealSoFar, 5, 180),
      actionAdvice: clampString(parsed.actionAdvice, 300),
      replyNeeded: typeof parsed.replyNeeded === 'boolean' ? parsed.replyNeeded : null,
      readingValue: clampString(parsed.readingValue, 300),
      frequency: clampString(parsed.frequency, 80),
      contentStability: clampString(parsed.contentStability, 120),
      subscribeWorth: typeof parsed.subscribeWorth === 'boolean' ? parsed.subscribeWorth : null,
      serviceType: clampString(parsed.serviceType, 220),
      userAction: clampString(parsed.userAction, 300),
      riskAlert: parsed.riskAlert === null ? null : (clampString(parsed.riskAlert, 220) || null),
      feedbackThemes: clampStringArray(parsed.feedbackThemes, 5, 220),
      featureRequests: clampStringArray(parsed.featureRequests, 5, 220),
      criticisms: clampStringArray(parsed.criticisms, 5, 220),
      praises: clampStringArray(parsed.praises, 5, 220),
      suggestedNextActions: clampStringArray(parsed.suggestedNextActions, 5, 220),
      replyEntry: clampString(parsed.replyEntry, 240),
      wikiDiagnostics: clampWikiDiagnostics(parsed.wikiDiagnostics),
      syncReadiness: { deviceScoped: true, crossDeviceSyncEnabled: false, schemaVersion: BEHAVIOR_SCHEMA_VERSION },
    };
  } catch {
    return fallback;
  }
}

function parseWikiPayload(content: string): Pick<ContactWiki,
  'senderType' | 'senderTypeConfidence' | 'senderTypeSource' | 'senderTypeUncertain' | 'manualSenderTypeOverride' |
  'senderTypeSignals' | 'secondarySenderTypes' |
  'summary' | 'recentContext' | 'openLoops' | 'replyStyle' | 'relationshipProfile' |
  'activeProjects' | 'preferences' | 'commitments' | 'unresolvedQuestions' | 'lastInteractionSummary' |
  'userInsights' | 'engagementProfile' | 'valueForUser' | 'confidence' | 'evidenceQuality' | 'doNotOverfitSignals' |
  'languageProfile' | 'subscriptionValue' | 'promotionPattern' | 'bestDealSoFar' | 'actionAdvice' | 'replyNeeded' |
  'readingValue' | 'frequency' | 'contentStability' | 'subscribeWorth' | 'serviceType' | 'userAction' | 'riskAlert' |
  'feedbackThemes' | 'featureRequests' | 'criticisms' | 'praises' | 'suggestedNextActions' | 'replyEntry' | 'wikiDiagnostics' |
  'syncReadiness'
> {
  const cleaned = extractJsonObjectPayload(content);
  const fallback = {
    senderType: 'unknown' as const,
    senderTypeConfidence: 0,
    senderTypeSource: 'fallback',
    senderTypeUncertain: true,
    manualSenderTypeOverride: false,
    senderTypeSignals: [],
    secondarySenderTypes: [],
    summary: '暂时没有足够可靠的信息生成联系人 Wiki。',
    recentContext: [],
    openLoops: [],
    replyStyle: [],
    relationshipProfile: '',
    activeProjects: [],
    preferences: [],
    commitments: [],
    unresolvedQuestions: [],
    lastInteractionSummary: '',
    userInsights: [],
    engagementProfile: [],
    valueForUser: [],
    confidence: { score: 0, level: 'low' as const },
    evidenceQuality: ['AI output could not be parsed safely.'],
    doNotOverfitSignals: ['Treat this wiki as low confidence until rebuilt.'],
    languageProfile: [],
    subscriptionValue: '',
    promotionPattern: '',
    bestDealSoFar: [],
    actionAdvice: '',
    replyNeeded: null,
    readingValue: '',
    frequency: '',
    contentStability: '',
    subscribeWorth: null,
    serviceType: '',
    userAction: '',
    riskAlert: null,
    feedbackThemes: [],
    featureRequests: [],
    criticisms: [],
    praises: [],
    suggestedNextActions: [],
    replyEntry: '',
    wikiDiagnostics: { fallbackReasons: ['parse_failed'], strippedFields: [], summaryReplaced: false },
    syncReadiness: { deviceScoped: true, crossDeviceSyncEnabled: false as const, schemaVersion: BEHAVIOR_SCHEMA_VERSION },
  };
  try {
    if (!cleaned) return fallback;
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const structured = parseStructuredProfile(JSON.stringify(parsed));
    return {
      summary: clampString(parsed.summary, 500) || fallback.summary,
      recentContext: clampStringArray(parsed.recentContext, 5),
      openLoops: clampStringArray(parsed.openLoops, 5),
      replyStyle: clampStringArray(parsed.replyStyle, 4),
      ...structured,
    };
  } catch {
    return fallback;
  }
}

function prepareCloudPromptInput(value: string): { value: string; redactionMap: RedactionMapEntry[] } {
  if (getSetting('ai_privacy_mode') !== 'cloud_redacted') return { value, redactionMap: [] };
  const result = redactSensitiveEntities(value);
  return { value: result.redactedText, redactionMap: result.redactionMap };
}

function restoreCloudAiResponse(response: AIResponse, redactionMap: RedactionMapEntry[]): AIResponse {
  if (!response.success || redactionMap.length === 0) return response;
  const restoreValue = (value: unknown): unknown => {
    if (typeof value === 'string') return restoreSensitiveEntities(value, redactionMap);
    if (Array.isArray(value)) return value.map(restoreValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, restoreValue(item)])
      );
    }
    return value;
  };
  return {
    ...response,
    content: response.content ? restoreSensitiveEntities(response.content, redactionMap) : response.content,
    metadata: response.metadata ? restoreValue(response.metadata) as AIResponseMetadata : response.metadata,
  };
}

function toMailLike(row: CachedContactMailRow): ContactKnowledgeMailLike {
  return {
    id: row.id,
    accountId: row.account_id,
    from: row.from,
    fromName: row.from_name,
    to: row.to,
    subject: row.subject,
    date: row.date,
    snippet: row.snippet,
    bodyText: row.body_text || undefined,
    bodyHtml: row.body_html || undefined,
    folder: row.folder,
    deliveryState: row.delivery_state || undefined,
  };
}

function loadContactMails(accountId: number, contactEmail: string, aliases: string[] = []): ContactKnowledgeMailLike[] {
  const db = getMailCacheDb();
  const stmt = db.prepare(`
    SELECT id, uid, "from", from_name, "to", subject, date, snippet, folder, account_id, body_text, body_html, delivery_state
    FROM mail_cache
    WHERE account_id = ?
      AND (body_text IS NOT NULL OR body_html IS NOT NULL OR COALESCE(snippet, '') != '')
    ORDER BY datetime(date) DESC
    LIMIT ?
    OFFSET ?
  `);
  const matched: ContactKnowledgeMailLike[] = [];
  for (let offset = 0; offset < MAX_CONTACT_MAIL_SCAN_ROWS && matched.length < MAX_SOURCE_MAILS; offset += CONTACT_MAIL_SCAN_PAGE_SIZE) {
    const rows = stmt.all(accountId, CONTACT_MAIL_SCAN_PAGE_SIZE, offset) as CachedContactMailRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const mail = toMailLike(row);
      if (mailMatchesAnyContact(mail, accountId, contactEmail, aliases)) matched.push(mail);
      if (matched.length >= MAX_SOURCE_MAILS) break;
    }
    if (rows.length < CONTACT_MAIL_SCAN_PAGE_SIZE) break;
  }
  return matched;
}

async function createEmbedding(input: string): Promise<EmbeddingResult> {
  const config = getAIModelProfileConfigForTask('embedding');
  if (!config) {
    remoteEmbeddingDisabledReason = remoteEmbeddingDisabledReason || 'missing-config';
    return createLocalEmbedding(input);
  }
  if (remoteEmbeddingDisabledReason) {
    return createLocalEmbedding(input);
  }
  const endpoint = normalizeOpenAICompatibleEmbeddingEndpoint(config.baseUrl);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, input }),
    });
  } catch (error) {
    remoteEmbeddingDisabledReason = 'network-error';
    log.warn('[contactKnowledge] Remote embeddings unavailable; using local fallback', {
      status: remoteEmbeddingDisabledReason,
      model: config.model,
      error: error instanceof Error ? error.message : String(error),
    });
    return createLocalEmbedding(input);
  }
  if (!response.ok) {
    remoteEmbeddingDisabledReason = `http-${response.status}`;
    log.warn('[contactKnowledge] Remote embeddings unavailable; using local fallback', {
      status: remoteEmbeddingDisabledReason,
      model: config.model,
    });
    return createLocalEmbedding(input);
  }
  const data = await response.json() as { data?: Array<{ embedding?: unknown }> };
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    remoteEmbeddingDisabledReason = 'invalid-response';
    log.warn('[contactKnowledge] Remote embeddings returned invalid response; using local fallback', {
      status: remoteEmbeddingDisabledReason,
      model: config.model,
    });
    return createLocalEmbedding(input);
  }
  return {
    embedding: embedding.map((value) => Number(value)).filter((value) => Number.isFinite(value)),
    model: config.model,
  };
}

async function embedChunks(
  chunks: ContactKnowledgeChunk[],
  existingRows: Map<string, StoredChunkRow> = new Map(),
  force = false,
): Promise<Array<ContactKnowledgeChunk & { embedding: number[]; embeddingModel: string }>> {
  const embedded: Array<ContactKnowledgeChunk & { embedding: number[]; embeddingModel: string }> = [];
  let embeddingModel = '';
  for (const chunk of chunks) {
    const existing = existingRows.get(chunk.id);
    if (
      !force
      && existing?.content_hash === chunk.contentHash
      && existing.embedding_json
      && existing.embedding_model
    ) {
      try {
        const parsed = JSON.parse(existing.embedding_json);
        const embedding = Array.isArray(parsed) ? parsed.map(Number).filter((value) => Number.isFinite(value)) : [];
        if (embedding.length > 0) {
          embedded.push({ ...chunk, embedding, embeddingModel: existing.embedding_model });
          continue;
        }
      } catch {
        // Re-embed malformed rows.
      }
    }

    const result = await createEmbedding(chunk.text);
    embeddingModel = result.model;
    embedded.push({ ...chunk, embedding: result.embedding, embeddingModel: result.model });
  }
  if (!embeddingModel && embedded[0]?.embeddingModel) embeddingModel = embedded[0].embeddingModel;
  return embedded;
}

function loadExistingChunkRows(accountId: number, contactEmail: string): Map<string, StoredChunkRow> {
  ensureContactKnowledgeTables();
  const rows = getMailCacheDb().prepare(`
    SELECT chunk_id, mail_id, subject, date, text, embedding_json, embedding_model, embedding_dim,
           content_hash, mail_date, chunk_kind, direction, search_terms, language_hint
    FROM contact_knowledge_chunks
    WHERE account_id = ? AND contact_email = ?
  `).all(accountId, contactEmail) as StoredChunkRow[];
  return new Map(rows.map((row) => [row.chunk_id, row]));
}

function syncChunkFts(chunkId: string, subject: string, text: string): void {
  try {
    const db = getMailCacheDb();
    db.prepare('DELETE FROM contact_knowledge_chunks_fts WHERE chunk_id = ?').run(chunkId);
    db.prepare('INSERT INTO contact_knowledge_chunks_fts (chunk_id, subject, text) VALUES (?, ?, ?)').run(chunkId, subject, text);
  } catch {
    // FTS is an optional accelerator.
  }
}

function deleteChunkFts(chunkId: string): void {
  try {
    getMailCacheDb().prepare('DELETE FROM contact_knowledge_chunks_fts WHERE chunk_id = ?').run(chunkId);
  } catch {
    // FTS is an optional accelerator.
  }
}

function storeChunks(accountId: number, contactEmail: string, chunks: Array<ContactKnowledgeChunk & { embedding: number[]; embeddingModel: string }>): void {
  const db = getMailCacheDb();
  const replace = db.prepare(`
    INSERT OR REPLACE INTO contact_knowledge_chunks
      (chunk_id, account_id, contact_email, mail_id, subject, date, text, embedding_json,
       embedding_model, embedding_dim, content_hash, indexed_at, mail_date, chunk_kind, direction, search_terms, language_hint, created_at)
    VALUES
      (@chunkId, @accountId, @contactEmail, @mailId, @subject, @date, @text, @embeddingJson,
       @embeddingModel, @embeddingDim, @contentHash, @indexedAt, @mailDate, @chunkKind, @direction, @searchTerms, @languageHint, @createdAt)
  `);
  const now = new Date().toISOString();
  const nextChunkIds = new Set(chunks.map((chunk) => chunk.id));
  const transaction = db.transaction(() => {
    const staleRows = db.prepare(`
      SELECT chunk_id FROM contact_knowledge_chunks
      WHERE account_id = ? AND contact_email = ?
    `).all(accountId, contactEmail) as Array<{ chunk_id: string }>;
    for (const row of staleRows) {
      if (!nextChunkIds.has(row.chunk_id)) {
        db.prepare('DELETE FROM contact_knowledge_chunks WHERE chunk_id = ?').run(row.chunk_id);
        deleteChunkFts(row.chunk_id);
      }
    }
    for (const chunk of chunks) {
      replace.run({
        chunkId: chunk.id,
        accountId,
        contactEmail,
        mailId: chunk.mailId,
        subject: chunk.subject,
        date: chunk.date,
        text: chunk.text,
        embeddingJson: JSON.stringify(chunk.embedding),
        embeddingModel: chunk.embeddingModel,
        embeddingDim: chunk.embedding.length,
        contentHash: chunk.contentHash,
        indexedAt: now,
        mailDate: chunk.date,
        chunkKind: chunk.chunkKind,
        direction: chunk.direction,
        searchTerms: chunk.searchTerms,
        languageHint: chunk.languageHint,
        createdAt: now,
      });
      syncChunkFts(chunk.id, chunk.subject, chunk.text);
    }
  });
  transaction();
}

function computeEvidenceHash(chunks: Array<Pick<ContactKnowledgeChunk, 'id' | 'contentHash' | 'date'>>, behaviorHash = ''): string {
  return crypto
    .createHash('sha256')
    .update(chunks.map((chunk) => `${chunk.id}:${chunk.contentHash}:${chunk.date}`).sort().join('|'))
    .update(`|behavior:${behaviorHash}`)
    .digest('hex');
}

function computeEvidenceConfidence(input: {
  accountId: number;
  mails: ContactKnowledgeMailLike[];
  behaviorSampleCount: number;
  contactEmail: string;
}): { score: number; level: ContactWikiConfidenceLevel } {
  const dates = input.mails
    .map((mail) => new Date(mail.date).getTime())
    .filter((time) => Number.isFinite(time));
  const minDate = dates.length ? Math.min(...dates) : Date.now();
  const maxDate = dates.length ? Math.max(...dates) : Date.now();
  const feedbackRows = getMailCacheDb().prepare(`
    SELECT rating FROM contact_knowledge_feedback
    WHERE account_id = ? AND contact_email = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 30
  `).all(input.accountId, input.contactEmail) as Array<{ rating: string }>;
  const score = calculateContactWikiConfidence({
    sourceMailCount: input.mails.length,
    timespanDays: Math.max(0, (maxDate - minDate) / 86_400_000),
    latestEvidenceAt: dates.length ? new Date(maxDate).toISOString() : null,
    behaviorSampleCount: input.behaviorSampleCount,
    usefulFeedbackCount: feedbackRows.filter((row) => row.rating === 'useful').length,
    negativeFeedbackCount: feedbackRows.filter((row) => row.rating === 'inaccurate' || row.rating === 'not_relevant').length,
    languageCoverage: 0.6,
  });
  return { score, level: contactWikiConfidenceLevel(score) };
}

function signalScore(signal: SenderTypeSignal): number {
  const multiplier = signal.strength === 'hard' ? 1 : signal.strength === 'strong' ? 0.9 : signal.strength === 'medium' ? 0.72 : 0.5;
  return Math.max(0, Math.min(1, signal.score * multiplier));
}

function scoreSenderTypeSignals(signals: SenderTypeSignal[]): Map<ContactWikiSenderType, number> {
  const scores = new Map<ContactWikiSenderType, number>();
  for (const signal of signals) {
    if (signal.type === 'unknown') continue;
    scores.set(signal.type, Math.min(0.95, (scores.get(signal.type) || 0) + signalScore(signal)));
  }
  return scores;
}

function makeSenderTypeSignal(
  type: ContactWikiSenderType,
  score: number,
  source: string,
  strength: SenderTypeSignal['strength'],
  reasonCode: string,
): SenderTypeSignal {
  return {
    type,
    score: Number(Math.max(0, Math.min(1, score)).toFixed(4)),
    source,
    strength,
    reasonCode,
  };
}

function inferSenderType(contactEmail: string, mails: ContactKnowledgeMailLike[]): SenderTypeProfile {
  const email = normalizeContactEmail(contactEmail);
  const localPart = email.split('@')[0] || '';
  const domain = email.split('@')[1] || '';
  const subjects = mails.map((mail) => mail.subject || '').join(' ').toLowerCase();
  const textHints = mails.slice(0, 12).map((mail) => `${mail.subject || ''} ${mail.snippet || ''}`).join(' ').toLowerCase();
  const outboundCount = mails.filter((mail) => inferContactMailDirection(mail, email) === 'outbound').length;
  const inboundCount = mails.length - outboundCount;

  const marketingAddress = /^(news|newsletter|promo|promos|offers|deals|marketing|digest|updates|campaign|sale|sales)$/i.test(localPart)
    || /^(news|newsletter|promo|offers|deals|marketing|digest|updates)[._-]/i.test(localPart)
    || /(^|\.)((send|mail|em|em\d+|sg|mailchimp|mailchi|klaviyo|constantcontact|campaign)\.)/i.test(domain)
    || /mailchi\.mp$/i.test(domain);
  const marketingContent = /\b(discount|coupon|deal|sale|off|bundle|promo|limited time|black friday|cyber monday)\b|折扣|优惠|促销|限时|大促/.test(textHints);
  const newsletterContent = /\b(newsletter|digest|daily brief|weekly brief|roundup)\b|新闻|简报|周报|日报/.test(textHints);
  const systemContent = /\b(statement|invoice|receipt|security alert|security|verification|verify|password|transaction|billing|login|sign-?in|new location|ip address|reset your password)\b|账单|结单|发票|验证码|密码|交易|安全提醒|安全|登录|登入|驗證|验证/.test(textHints);
  const forumContent = hasForumRelayContext(textHints)
    || /^mails\./i.test(domain)
    || /(?:^|\.)mails\./i.test(domain);
  const noReplyAddress = /^no-?reply$/i.test(localPart) || /^no-?reply[._-]/i.test(localPart);
  const securityOrBillingAddress = /^(security|billing|statements?|receipts?|invoices?)$/i.test(localPart)
    || /^(alerts?|billing|statements?)[._-]/i.test(localPart);
  const genericNotificationAddress = /^(notifications?|alerts?)$/i.test(localPart) || /^(notifications?|alerts?)[._-]/i.test(localPart);
  const vendorContent = /\b(invoice|contract|subscription|account|service|order|shipping|payment|invite|invitation)\b|合同|订单|服务|付款|账户|邀请/.test(subjects);
  const signals: SenderTypeSignal[] = [];

  if (forumContent) signals.push(makeSenderTypeSignal('community_feedback', 0.92, 'address_subject_rules', 'hard', 'community_forum_relay'));
  if (marketingAddress) signals.push(makeSenderTypeSignal('marketing', 0.55, 'address_rules', 'medium', 'marketing_address'));
  if (marketingContent) signals.push(makeSenderTypeSignal('marketing', 0.42, 'subject_snippet_rules', 'medium', 'promotion_content'));
  if (newsletterContent) signals.push(makeSenderTypeSignal('newsletter', 0.76, 'subject_snippet_rules', 'strong', 'newsletter_digest_content'));
  if (noReplyAddress && !forumContent) signals.push(makeSenderTypeSignal('system_notification', 0.9, 'address_rules', 'hard', 'no_reply_address'));
  if (securityOrBillingAddress) signals.push(makeSenderTypeSignal('system_notification', 0.84, 'address_rules', 'strong', 'system_address'));
  if (genericNotificationAddress) signals.push(makeSenderTypeSignal('system_notification', 0.48, 'address_rules', 'medium', 'generic_notification_address'));
  if (systemContent) signals.push(makeSenderTypeSignal('system_notification', 0.74, 'subject_snippet_rules', 'strong', 'system_content'));
  if (outboundCount > 0 && inboundCount > 0) {
    const freeMailDomain = /^(gmail|outlook|hotmail|icloud|yahoo|proton|qq|163|126)\./i.test(domain);
    signals.push(makeSenderTypeSignal(freeMailDomain ? 'personal' : 'work_contact', 0.74, 'bidirectional_stats', 'strong', 'bidirectional_mail'));
  }
  if (vendorContent) signals.push(makeSenderTypeSignal('vendor', 0.78, 'subject_rules', 'strong', 'vendor_service_subject'));

  const scores = scoreSenderTypeSignals(signals);
  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, score]) => ({ type, score }));
  const hardRanked = ranked
    .filter((item) => signals.some((signal) => signal.type === item.type && signal.strength === 'hard') && item.score >= 0.85);
  const top = hardRanked[0] || ranked[0];
  const second = (hardRanked.length > 0 ? hardRanked : ranked).find((item) => item.type !== top?.type);
  const hardConflict = hardRanked.length >= 2 && top && second && top.score - second.score < 0.15;
  const confidentNonHard = top && top.score >= 0.65 && (!second || top.score - second.score >= 0.15);
  const primary = top && (hardRanked.length > 0 ? !hardConflict : confidentNonHard)
    ? top.type
    : 'unknown';
  const confidence = primary === 'unknown' ? Math.min(0.49, top?.score || 0.35) : top?.score || 0.35;
  const topSignal = primary === 'unknown'
    ? signals[0]
    : signals.find((signal) => signal.type === primary);
  const secondarySenderTypes = ranked
    .filter((item) => item.type !== primary && item.score >= 0.45)
    .map((item) => item.type)
    .slice(0, 4);
  return {
    senderType: primary,
    senderTypeConfidence: Number(confidence.toFixed(4)),
    senderTypeSource: primary === 'unknown'
      ? 'scored_conflict_or_low_confidence'
      : `scored:${topSignal?.reasonCode || 'signal'}`,
    senderTypeUncertain: primary === 'unknown' || confidence < 0.7 || secondarySenderTypes.length > 0,
    manualSenderTypeOverride: false,
    senderTypeSignals: signals.slice(0, 8),
    secondarySenderTypes,
  };
}

function buildWikiSchemaForSenderType(senderType: ContactWikiSenderType, allowUserInsights: boolean): string {
  const shared = '"summary": string <=500 chars, "recentContext": string[] <=5, "openLoops": string[] <=5, "replyStyle": string[] <=4, "evidenceQuality": string[] <=5, "doNotOverfitSignals": string[] <=5, "languageProfile": string[] <=5';
  if (senderType === 'marketing') {
    return `{ "senderType": "marketing", "senderTypeConfidence": number, ${shared}, "subscriptionValue": string, "promotionPattern": string, "bestDealSoFar": string[] <=5, "actionAdvice": string, "replyNeeded": false }`;
  }
  if (senderType === 'newsletter') {
    return `{ "senderType": "newsletter", "senderTypeConfidence": number, ${shared}, "readingValue": string, "frequency": string, "contentStability": string, "subscribeWorth": boolean, "replyNeeded": false }`;
  }
  if (senderType === 'community_feedback') {
    return `{ "senderType": "community_feedback", "senderTypeConfidence": number, ${shared}, "feedbackThemes": string[] <=5, "featureRequests": string[] <=5, "criticisms": string[] <=5, "praises": string[] <=5, "suggestedNextActions": string[] <=5, "replyEntry": string, "replyNeeded": false }`;
  }
  if (senderType === 'vendor' || senderType === 'system_notification') {
    return `{ "senderType": "${senderType}", "senderTypeConfidence": number, ${shared}, "serviceType": string, "userAction": string, "riskAlert": string|null, "replyNeeded": false }`;
  }
  const relationship = `${shared}, "valueForUser": [{"text": string, "confidence": "low"|"medium"|"high", "confidenceScore": number, "evidenceIds": string[]}], "relationshipProfile": string, "activeProjects": string[] <=5, "commitments": string[] <=5, "unresolvedQuestions": string[] <=5, "lastInteractionSummary": string`;
  if (!allowUserInsights) {
    return `{ "senderType": "${senderType}", "senderTypeConfidence": number, ${relationship} }`;
  }
  return `{ "senderType": "${senderType}", "senderTypeConfidence": number, ${relationship}, "preferences": string[] <=5, "userInsights": [{"text": string, "confidence": "low"|"medium"|"high", "confidenceScore": number, "evidenceIds": string[]}], "engagementProfile": string[] <=5 }`;
}

function uniqueScenarioLines(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = clampString(value, 180);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

function scenarioSignalToLine(item: ScenarioEvidenceItem): string {
  return [item.date, item.signal].filter(Boolean).join(' | ');
}

function uniqueScenarioItems(values: ScenarioEvidenceItem[], limit: number): ScenarioEvidenceItem[] {
  const seen = new Set<string>();
  const result: ScenarioEvidenceItem[] = [];
  const sorted = [...values].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const item of sorted) {
    const signal = clampString(item.signal, 180);
    const date = clampString(item.date, 20);
    const key = `${item.kind}:${date}:${signal}`.toLowerCase();
    if (!signal || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, date, signal });
    if (result.length >= limit) break;
  }
  return result;
}

function isScenarioEvidenceLine(line: string, senderType: ContactWikiSenderType): boolean {
  const value = line.replace(/\s+/g, ' ').trim();
  if (!value) return false;
  if (/^\[?https?:\/\/\S+\.(?:png|jpe?g|gif|svg|webp)(?:[?#]\S*)?\]?$/i.test(value)) return false;
  if (isForumRelayBoilerplateLine(value)) return false;
  if (senderType === 'marketing') {
    return /(?:[$€£]\s?\d|\d{1,3}(?:\.\d+)?\s*%).{0,80}(?:discount|deal|sale|offer|coupon|bundle|promo|off|save|折扣|优惠|促销|限时|大促)|(?:discount|deal|sale|offer|coupon|bundle|promo|off|save|折扣|优惠|促销|限时|大促).{0,80}(?:[$€£]\s?\d|\d{1,3}(?:\.\d+)?\s*%)|截止|到期|频率|每[日周月]|近期 \d+ 条/i.test(value);
  }
  if (senderType === 'newsletter') {
    return /\b(?:new|launch(?:ed)?|released|added|introducing|update[ds]?|integration|available|coming soon|mcp|datastore|basecamp|onedrive|monday|monthly|weekly|daily|pro\+?)\b|新增|上线|发布|更新|变更|集成|上新|新功能|即将推出|月度|每月|每周|每日|VR|Horizon\+/i.test(value);
  }
  if (senderType === 'vendor' || senderType === 'system_notification') {
    return /\b(?:statement|invoice|receipt|security|verification|transaction|billing|policy|account|service|deadline|expires?|forum|community|topic|thread|reply|feedback|missing-feature|early-use)\b|账单|结单|发票|验证|交易|安全|政策|账户|服务|截止|到期|风险|论坛|論壇|话题|話題|回复|回覆|讨论|討論|正文反馈|功能缺口|初体验反馈|建議|建议/i.test(value);
  }
  if (senderType === 'community_feedback') {
    return /\b(?:forum|community|topic|thread|reply|feedback|missing-feature|early-use|suggestion|criticism|praise)\b|论坛|論壇|话题|話題|回复|回覆|讨论|討論|正文反馈|功能缺口|初体验反馈|建議|建议|批评|批評|表扬|表揚/i.test(value);
  }
  return false;
}

function isSystemNotificationBoilerplateLine(line: string): boolean {
  const value = line.replace(/\s+/g, ' ').trim();
  if (!value) return true;
  if (/\[email\].{0,24}(?:backup|recovery|備援|备用|副本|copy)|(?:backup|recovery|備援|备用|副本|copy).{0,24}\[email\]/i.test(value)) return true;
  if (/(?:針對|针对|for)\s*\[email\].{0,30}(?:安全|security).{0,20}(?:警示|alert)/i.test(value)) return true;
  if (/(?:前往|查看|go to|visit).{0,24}(?:\[url\]|網址|网址|url|link)/i.test(value)) return true;
  return false;
}

function buildScenarioEvidence(chunks: ContactKnowledgeChunk[], senderType: ContactWikiSenderType): ScenarioEvidence {
  if (SUPPORTS_USER_INSIGHTS[senderType]) {
    return { dealSignals: [], changeSignals: [], deadlineSignals: [], patternSignals: [] };
  }
  const dealSignals = extractMarketingDealEvidence(chunks);
  const changeSignals: ScenarioEvidenceItem[] = [];
  const deadlineSignals: ScenarioEvidenceItem[] = [];
  const dates = chunks.map((chunk) => new Date(chunk.date).getTime()).filter((time) => Number.isFinite(time));
  const latestDate = dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : '';
  if (senderType === 'community_feedback') {
    changeSignals.push(...extractForumFeedbackSignals(chunks, 'English').map((signal) => ({
      date: latestDate,
      signal,
      kind: 'feedback' as const,
    })));
  }
  for (const chunk of chunks) {
    const cleaned = cleanScenarioEvidenceText(`${chunk.subject}\n${chunk.text}`);
    const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const safeLine = redactContactKnowledgeEvidenceText(line);
      if ((senderType === 'vendor' || senderType === 'system_notification') && isSystemNotificationBoilerplateLine(safeLine)) {
        continue;
      }
      const dated = { date: chunk.date.slice(0, 10), signal: safeLine };
      if (senderType === 'marketing' && isScenarioEvidenceLine(safeLine, 'marketing')) {
        dealSignals.push({ ...dated, kind: 'deal' });
        continue;
      }
      if (/\b(?:deadline|expires?|until|ends?)\b|截止|到期|限时/i.test(safeLine)) {
        deadlineSignals.push({ ...dated, kind: 'deadline' });
        continue;
      }
      if (isScenarioEvidenceLine(safeLine, senderType)) {
        changeSignals.push({ ...dated, kind: senderType === 'community_feedback' ? 'feedback' : 'change' });
      }
    }
  }
  const patternSignals: ScenarioEvidenceItem[] = [];
  if (chunks.length >= 2 && dates.length >= 2) {
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const days = Math.max(1, Math.ceil((maxDate - minDate) / 86_400_000) + 1);
    patternSignals.push({
      date: new Date(maxDate).toISOString().slice(0, 10),
      signal: `${chunks.length} messages over ${days} days`,
      kind: 'pattern',
    });
  }
  return {
    dealSignals: uniqueScenarioItems(dealSignals, 6),
    changeSignals: uniqueScenarioItems(changeSignals, 8),
    deadlineSignals: uniqueScenarioItems(deadlineSignals, 5),
    patternSignals: uniqueScenarioItems(patternSignals, 3),
  };
}

function scenarioEvidenceToPrompt(senderType: ContactWikiSenderType, evidence: ScenarioEvidence): string {
  if (SUPPORTS_USER_INSIGHTS[senderType]) return '';
  return [
    'Scenario evidence only. Use this instead of raw email text.',
    JSON.stringify(evidence, null, 2),
    'If a field is empty, say there is no important actionable signal instead of summarizing marketing copy.',
  ].join('\n');
}

function isChineseTarget(targetLang: string): boolean {
  return /chinese|zh|中文|繁體|简体/i.test(targetLang);
}

function inferServiceSignalKind(wiki: Pick<ContactWiki, 'serviceType' | 'riskAlert'>, chunks: ContactKnowledgeChunk[]): 'forum' | 'security' | 'billing' | 'verification' | 'account' | 'service' {
  const text = [
    wiki.serviceType,
    wiki.riskAlert || '',
    ...chunks.slice(0, 12).map((chunk) => `${chunk.subject} ${chunk.text}`),
  ].join('\n');
  if (hasForumRelayContext(text)) return 'forum';
  if (/\b(?:security|login|password|recovery|verify suspicious|alert)\b|安全|登入|登录|密碼|密码|備援|备用|警示|驗證|验证/i.test(text)) return 'security';
  if (/\b(?:invoice|billing|payment|statement|receipt|balance)\b|账单|帳單|结单|結單|发票|發票|付款|收据|收據|余额|餘額/i.test(text)) return 'billing';
  if (/\b(?:verification|verify|code|otp)\b|验证码|驗證碼|验证|驗證/i.test(text)) return 'verification';
  if (/\b(?:account|profile|subscription)\b|账户|帳戶|账号|帳號|订阅|訂閱/i.test(text)) return 'account';
  return 'service';
}

function hasUsefulRelationshipSummary(summary: string, wiki: Pick<ContactWiki, 'serviceType' | 'userAction' | 'riskAlert'>): boolean {
  return relationshipSummaryFallbackReason(summary, wiki) === null;
}

function inferSenderRoleLabel(contactEmail: string, senderType: ContactWikiSenderType, kind: ReturnType<typeof inferServiceSignalKind>, targetLang: string): string {
  const email = normalizeContactEmail(contactEmail);
  const localPart = email.split('@')[0] || '';
  const domain = email.split('@')[1] || email;
  const zh = isChineseTarget(targetLang);
  if (/accounts\.google\.com$/i.test(domain) || /google/i.test(domain)) {
    return zh ? 'Google 账号系统通知渠道' : 'Google account system notification channel';
  }
  if (senderType === 'community_feedback') {
    return zh ? `${domain} 的论坛/社区邮件网关` : `${domain} forum/community mail relay`;
  }
  if (senderType === 'vendor') {
    if (kind === 'forum') return zh ? `${domain} 的论坛/社区邮件网关` : `${domain} forum/community mail relay`;
    return zh ? `${domain} 的服务通知联系人` : `${domain} service notification contact`;
  }
  if (kind === 'security') return zh ? `${domain} 的账号安全通知渠道` : `${domain} account-security notification channel`;
  if (kind === 'billing') return zh ? `${domain} 的账单/结单通知渠道` : `${domain} billing or statement notification channel`;
  if (localPart && !/^no-?reply$/i.test(localPart)) return zh ? `${domain} 的 ${localPart} 通知渠道` : `${domain} ${localPart} notification channel`;
  return zh ? `${domain} 的系统通知渠道` : `${domain} system notification channel`;
}

function summarizeSenderActionPattern(kind: ReturnType<typeof inferServiceSignalKind>, chunks: ContactKnowledgeChunk[], targetLang: string): string {
  const zh = isChineseTarget(targetLang);
  const inboundCount = chunks.filter((chunk) => chunk.direction !== 'outbound').length;
  const prefix = zh ? `对方平时主要发送 ${inboundCount || chunks.length} 类/封` : `The sender usually sends ${inboundCount || chunks.length}`;
  if (kind === 'forum') return zh ? `${prefix}论坛话题回复、讨论更新或用户反馈通知` : `${prefix} forum topic replies, discussion updates, or user-feedback notifications`;
  if (kind === 'security') return zh ? `${prefix}账号安全警示、恢复邮箱副本或账号活动提醒` : `${prefix} account-security alerts, recovery-email copies, or account-activity notices`;
  if (kind === 'billing') return zh ? `${prefix}账单、结单、余额或付款状态通知` : `${prefix} billing, statement, balance, or payment-status notices`;
  if (kind === 'verification') return zh ? `${prefix}验证码或账号验证通知` : `${prefix} verification-code or account-verification notices`;
  return zh ? `${prefix}账户/服务状态通知` : `${prefix} account or service-status notices`;
}

function summarizeUserReplyPattern(chunks: ContactKnowledgeChunk[], targetLang: string): string {
  const zh = isChineseTarget(targetLang);
  const outbound = chunks.filter((chunk) => chunk.direction === 'outbound');
  if (outbound.length === 0) {
    return zh ? '用户暂无向该发件方回复或主动发信记录' : 'The user has no observed replies or outbound mail to this sender';
  }
  const recentSubjects = outbound
    .map((chunk) => redactContactKnowledgeEvidenceText(chunk.subject || ''))
    .filter(Boolean)
    .slice(0, 3)
    .join('；');
  return zh
    ? `用户曾向该发件方回复/发信 ${outbound.length} 次，主要围绕：${recentSubjects || '账户或服务事项'}`
    : `The user has replied or sent mail to this sender ${outbound.length} times, mainly about: ${recentSubjects || 'account or service matters'}`;
}

function buildServiceNotificationRelationshipSummary(
  senderType: ContactWikiSenderType,
  wiki: Pick<ContactWiki, 'summary' | 'serviceType' | 'userAction' | 'riskAlert'>,
  chunks: ContactKnowledgeChunk[],
  contactEmail: string,
  targetLang: string,
): string {
  if (hasUsefulRelationshipSummary(wiki.summary, wiki)) return wiki.summary;
  const kind = inferServiceSignalKind(wiki, chunks);
  const zh = isChineseTarget(targetLang);
  const senderRole = inferSenderRoleLabel(contactEmail, senderType, kind, targetLang);
  const senderPattern = summarizeSenderActionPattern(kind, chunks, targetLang);
  const userPattern = summarizeUserReplyPattern(chunks, targetLang);
  if (kind === 'forum') {
    const feedbackSignals = extractForumFeedbackSignals(chunks, targetLang).slice(0, 2);
    const feedbackText = feedbackSignals.length > 0
      ? (zh ? `本轮正文反馈集中在：${feedbackSignals.join('；')}。` : `Current body feedback focuses on: ${feedbackSignals.join('; ')}. `)
      : '';
    return zh
      ? `${senderRole}，不是单个个人联系人；它把论坛话题回复、讨论更新或用户反馈转发到邮箱。${feedbackText}${userPattern}。`
      : `${senderRole}; it is not a single personal contact, but a relay for forum topic replies, discussion updates, or user feedback. ${feedbackText}${userPattern}.`;
  }
  return zh
    ? `${senderRole}，和用户的关系是单向的账号/服务状态告知。${senderPattern}；${userPattern}。`
    : `${senderRole}; its relationship to the user is a mostly one-way account/service status channel. ${senderPattern}; ${userPattern}.`;
}

function formatDateRange(chunks: ContactKnowledgeChunk[]): { start: string; end: string } | null {
  const times = chunks
    .map((chunk) => new Date(chunk.date).getTime())
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) return null;
  const start = new Date(Math.min(...times)).toISOString().slice(0, 10);
  const end = new Date(Math.max(...times)).toISOString().slice(0, 10);
  return { start, end };
}

function buildServiceNotificationRecentContext(
  senderType: ContactWikiSenderType,
  evidence: ScenarioEvidence,
  fallback: string[],
  wiki: Pick<ContactWiki, 'serviceType' | 'userAction' | 'riskAlert'>,
  chunks: ContactKnowledgeChunk[],
  targetLang: string,
): string[] {
  if (senderType !== 'vendor' && senderType !== 'system_notification') return [];
  const zh = isChineseTarget(targetLang);
  const kind = inferServiceSignalKind(wiki, chunks);
  const range = formatDateRange(chunks);
  const rows: string[] = [];
  if (kind === 'forum') {
    const feedbackRows = extractForumFeedbackSignals(chunks, targetLang);
    if (feedbackRows.length > 0) {
      const userPattern = summarizeUserReplyPattern(chunks, targetLang);
      return uniqueScenarioLines([...feedbackRows, userPattern], 5);
    }
  }
  if (chunks.length >= 2 && range) {
    const dateText = range.start === range.end ? range.start : `${range.start} 至 ${range.end}`;
    rows.push(zh
      ? `对方近期发送 ${chunks.length} 封${kind === 'forum' ? '论坛讨论/话题回复' : kind === 'security' ? '账号安全' : kind === 'billing' ? '账单/结单' : '服务'}通知，集中在 ${dateText}。`
      : `${chunks.length} recent ${kind === 'forum' ? 'forum discussion/topic-reply' : kind === 'security' ? 'account-security' : kind === 'billing' ? 'billing/statement' : 'service'} notifications around ${dateText}.`);
  }
  if (kind === 'forum') {
    rows.push(zh
      ? '对方常见动作：转发论坛用户对相关话题的回复、讨论或产品反馈。'
      : 'Sender pattern: relays forum-user replies, discussions, or product feedback for related topics.');
  } else if (kind === 'security') {
    rows.push(zh
      ? '对方常见动作：发送安全警示、恢复邮箱副本或账号活动提醒。'
      : 'Sender pattern: sends security alerts, recovery-email copies, or account-activity notices.');
  } else if (kind === 'billing') {
    rows.push(zh
      ? '对方常见动作：发送账单、结单、余额或付款状态通知。'
      : 'Sender pattern: sends billing, statement, balance, or payment-status notices.');
  }
  rows.push(summarizeUserReplyPattern(chunks, targetLang));
  const signalRows = [...evidence.deadlineSignals, ...evidence.changeSignals]
    .map(scenarioSignalToLine)
    .filter((line) => isScenarioEvidenceLine(line, senderType))
    .filter((line) => !isSystemNotificationBoilerplateLine(line))
    .map(redactContactKnowledgeEvidenceText)
    .slice(0, Math.max(0, 5 - rows.length));
  const combined = uniqueScenarioLines([...rows, ...signalRows], 5);
  if (combined.length > 0) return combined;
  const safeFallback = fallback
    .map(redactContactKnowledgeEvidenceText)
    .filter((line) => isScenarioEvidenceLine(line, senderType) && !isSystemNotificationBoilerplateLine(line))
    .slice(0, 5);
  return safeFallback.length > 0 ? safeFallback : [zh ? '暂无需要行动的重要变化' : 'No important actionable changes'];
}

function selectScenarioRecentContext(senderType: ContactWikiSenderType, evidence: ScenarioEvidence, fallback: string[]): string[] {
  const candidate = senderType === 'marketing'
    ? [...evidence.dealSignals, ...evidence.deadlineSignals, ...evidence.patternSignals]
    : senderType === 'newsletter'
      ? [...evidence.changeSignals, ...evidence.deadlineSignals, ...evidence.patternSignals]
      : [...evidence.changeSignals, ...evidence.deadlineSignals, ...evidence.patternSignals];
  const filtered = candidate.map(scenarioSignalToLine).filter((line) => isScenarioEvidenceLine(line, senderType)).slice(0, 5);
  if (filtered.length > 0) return filtered;
  const safeFallback = fallback.filter((line) => isScenarioEvidenceLine(line, senderType)).slice(0, 5);
  return safeFallback.length > 0 ? safeFallback : ['暂无需要行动的重要变化'];
}

function isThirdPartyMarketPriceContext(value: string): boolean {
  return /\b(?:stock|shares?|ticker|nasdaq|nyse|price target|analyst|earnings|market cap|portfolio)\b|股票|股价|股價|美股|港股|目标价|目標價|分析师|分析師/i.test(value)
    && !/\b(?:coupon|discount|off|save|checkout|cart|bundle|original price|was|now only)\b|折扣|优惠|優惠|原价|原價|现价|現價|促销|促銷|大促/i.test(value);
}

function extractMarketingDealEvidence(chunks: ContactKnowledgeChunk[]): ScenarioEvidenceItem[] {
  const rows: ScenarioEvidenceItem[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const text = `${chunk.subject} ${chunk.text}`.replace(/\s+/g, ' ');
    if (isThirdPartyMarketPriceContext(text)) continue;
    const hasPromotionContext = /\b(discount|coupon|deal|sale|offer|bundle|promo|off|save|was|now|only)\b|折扣|优惠|促销|限时|大促|原价|现价/i.test(text);
    if (!hasPromotionContext) continue;
    const discount = text.match(/(?:save|discount|off|折扣|优惠)[^\d]{0,20}(\d{2,3}(?:\.\d+)?)\s*%|(\d{2,3}(?:\.\d+)?)\s*%\s*(?:off|折扣|优惠)/i);
    const priceMatches = Array.from(text.matchAll(/[$€£]\s?\d+(?:\.\d{1,2})?/g)).map((match) => match[0].replace(/\s+/g, ''));
    if (priceMatches.length === 0 && !discount) continue;
    const subject = clampString(chunk.subject.replace(/\[[^\]]+\]/g, ''), 80) || 'Promotion';
    const prices = priceMatches.slice(0, 2).join(' / ');
    const discountText = discount ? `-${discount[1] || discount[2]}%` : '';
    const row = [subject, prices, discountText, chunk.date.slice(0, 10)].filter(Boolean).join(' | ');
    if (!seen.has(row)) {
      seen.add(row);
      rows.push({ date: chunk.date.slice(0, 10), signal: [subject, prices, discountText].filter(Boolean).join(' | '), kind: 'deal' });
    }
    if (rows.length >= 5) break;
  }
  return rows;
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, '').replace(/[，。；;:：,.!！?？\-—–]/g, '').toLowerCase();
}

function appendUnique(values: string[], additions: string[], limit: number): string[] {
  const seen = new Set(values.map((value) => value.toLowerCase()));
  const result = [...values];
  for (const addition of additions) {
    const cleaned = clampString(addition, 140);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

function appendDiagnostic(diagnostics: WikiDiagnostics, update: Partial<WikiDiagnostics>): WikiDiagnostics {
  return {
    fallbackReasons: appendUnique(diagnostics.fallbackReasons, update.fallbackReasons || [], 8),
    strippedFields: appendUnique(diagnostics.strippedFields, update.strippedFields || [], 16),
    canonicalSummaryField: update.canonicalSummaryField || diagnostics.canonicalSummaryField,
    summaryReplaced: diagnostics.summaryReplaced || Boolean(update.summaryReplaced),
  };
}

function relationshipSummaryFallbackReason(summary: string, wiki: Pick<ContactWiki, 'serviceType' | 'userAction' | 'riskAlert'>): string | null {
  const value = summary.replace(/\s+/g, ' ').trim();
  if (!value) return 'empty_summary';
  const joined = [wiki.serviceType, wiki.userAction, wiki.riskAlert].filter(Boolean).join('；').replace(/\s+/g, ' ').trim();
  if (joined && value === joined) return 'summary_repeats_service_fields';
  if (value.split(/[;；]/).length >= 3 && value.length <= joined.length + 8) return 'summary_is_field_concatenation';
  if (/^(?:帳戶安全|账户安全|account security)[;；,， ]*(?:檢查|检查|check)/i.test(value)) return 'generic_account_security_summary';
  const hasRelationshipShape = /(?:发件方|發件方|联系人|聯絡人|通知渠道|通知來源|关系|關係|通常|平时|平時|对方|對方|用户|使用者|sender|relationship|usually|typically|pattern)/i.test(value)
    && value.length >= 24;
  return hasRelationshipShape ? null : 'missing_sender_relationship_pattern';
}

function chooseScenarioSummary(
  current: string,
  canonical: string,
  senderType: ContactWikiSenderType,
): { summary: string; replaced: boolean } {
  const normalizedCurrent = normalizeComparableText(current);
  const normalizedCanonical = normalizeComparableText(canonical);
  if (!canonical) return { summary: current, replaced: false };
  if (!current || normalizedCurrent === normalizedCanonical) return { summary: canonical, replaced: current !== canonical };
  const looksLikeBiography = senderType === 'marketing' || senderType === 'newsletter'
    ? /\b(?:is a|company|provides?|offers?)\b|是一家|公司|提供|主要销售|主要銷售/i.test(current)
    : false;
  const tooShortOrGeneric = current.length < 18 || /^(?:中等|低|高|服务|通知|账户|帳戶)[;；,， ]/i.test(current);
  if (looksLikeBiography || tooShortOrGeneric) return { summary: canonical, replaced: true };
  return { summary: current, replaced: false };
}

function summarizeCommunityFeedback(
  chunks: ContactKnowledgeChunk[],
  contactEmail: string,
  targetLang: string,
  feedbackSignals: string[],
): string {
  const zh = isChineseTarget(targetLang);
  const domain = normalizeContactEmail(contactEmail).split('@')[1] || normalizeContactEmail(contactEmail);
  const userPattern = summarizeUserReplyPattern(chunks, targetLang);
  if (feedbackSignals.length === 0) {
    return zh
      ? `${domain} 是论坛/社区邮件网关，转发话题回复、讨论更新或用户反馈；${userPattern}。`
      : `${domain} is a forum/community mail relay for topic replies, discussion updates, or user feedback; ${userPattern}.`;
  }
  return zh
    ? `${domain} 是论坛/社区邮件网关，重点价值是汇总社区正文反馈。本轮反馈集中在：${feedbackSignals.slice(0, 2).join('；')}。${userPattern}。`
    : `${domain} is a forum/community mail relay whose value is summarizing community body feedback. Current feedback focuses on: ${feedbackSignals.slice(0, 2).join('; ')}. ${userPattern}.`;
}

type SelectedPriorContext = {
  commitments: string[];
  unresolvedQuestions: string[];
  bestDealSoFar: string[];
  feedbackThemes: string[];
  featureRequests: string[];
  criticisms: string[];
  praises: string[];
};

function selectedPriorContext(existing: ContactWiki | null, senderType: ContactWikiSenderType): SelectedPriorContext | null {
  if (!existing) return null;
  const prior: SelectedPriorContext = {
    commitments: SUPPORTS_USER_INSIGHTS[senderType] ? (existing.commitments || []).slice(0, 5) : [],
    unresolvedQuestions: SUPPORTS_USER_INSIGHTS[senderType] ? (existing.unresolvedQuestions || []).slice(0, 5) : [],
    bestDealSoFar: senderType === 'marketing' ? (existing.bestDealSoFar || []).slice(0, 5) : [],
    feedbackThemes: senderType === 'community_feedback' ? (existing.feedbackThemes || []).slice(0, 5) : [],
    featureRequests: senderType === 'community_feedback' ? (existing.featureRequests || []).slice(0, 5) : [],
    criticisms: senderType === 'community_feedback' ? (existing.criticisms || []).slice(0, 5) : [],
    praises: senderType === 'community_feedback' ? (existing.praises || []).slice(0, 5) : [],
  };
  return Object.values(prior).some((items) => items.length > 0) ? prior : null;
}

function enforceUserInsightPolicy<T extends Pick<ContactWiki,
  'senderType' | 'senderTypeConfidence' | 'senderTypeSource' | 'senderTypeUncertain' | 'manualSenderTypeOverride' |
  'senderTypeSignals' | 'secondarySenderTypes' |
  'summary' | 'recentContext' | 'openLoops' | 'replyStyle' | 'relationshipProfile' | 'activeProjects' | 'preferences' |
  'commitments' | 'unresolvedQuestions' | 'lastInteractionSummary' | 'userInsights' | 'engagementProfile' |
  'valueForUser' | 'subscriptionValue' | 'promotionPattern' | 'bestDealSoFar' | 'actionAdvice' | 'replyNeeded' |
  'readingValue' | 'frequency' | 'contentStability' | 'subscribeWorth' | 'serviceType' | 'userAction' | 'riskAlert' |
  'feedbackThemes' | 'featureRequests' | 'criticisms' | 'praises' | 'suggestedNextActions' | 'replyEntry' |
  'doNotOverfitSignals' | 'wikiDiagnostics'
>>(wiki: T, senderProfile: SenderTypeProfile, behaviorSampleCount: number, chunks: ContactKnowledgeChunk[] = [], scenarioEvidence: ScenarioEvidence = buildScenarioEvidence(chunks, senderProfile.senderType), contactEmail = '', targetLang = 'English', priorContext: SelectedPriorContext | null = null): T {
  wiki.senderType = senderProfile.senderType;
  wiki.senderTypeConfidence = senderProfile.senderTypeConfidence;
  wiki.senderTypeSource = senderProfile.senderTypeSource;
  wiki.senderTypeUncertain = senderProfile.senderTypeUncertain;
  wiki.manualSenderTypeOverride = senderProfile.manualSenderTypeOverride;
  wiki.senderTypeSignals = senderProfile.senderTypeSignals;
  wiki.secondarySenderTypes = senderProfile.secondarySenderTypes;
  wiki.wikiDiagnostics = wiki.wikiDiagnostics || { fallbackReasons: [], strippedFields: [], summaryReplaced: false };
  const supportsUserInsights = SUPPORTS_USER_INSIGHTS[senderProfile.senderType] === true;
  const hasEnoughBehavior = behaviorSampleCount >= MIN_USER_INSIGHT_BEHAVIOR_SAMPLES;
  if (!supportsUserInsights || !hasEnoughBehavior) {
    wiki.userInsights = [];
    wiki.engagementProfile = [];
  }
  if (!supportsUserInsights) {
    wiki.wikiDiagnostics = appendDiagnostic(wiki.wikiDiagnostics, {
      strippedFields: [
        'openLoops',
        'replyStyle',
        'relationshipProfile',
        'activeProjects',
        'commitments',
        'unresolvedQuestions',
        'lastInteractionSummary',
        'preferences',
        'valueForUser',
        'userInsights',
        'engagementProfile',
      ],
    });
    wiki.openLoops = [];
    wiki.replyStyle = [];
    wiki.relationshipProfile = '';
    wiki.activeProjects = [];
    wiki.commitments = [];
    wiki.unresolvedQuestions = [];
    wiki.lastInteractionSummary = '';
    wiki.preferences = [];
    wiki.valueForUser = [];
    wiki.replyNeeded = false;
    if (senderProfile.senderType === 'marketing') {
      const deals = scenarioEvidence.dealSignals.length > 0 ? scenarioEvidence.dealSignals : extractMarketingDealEvidence(chunks);
      if (deals.length > 0) wiki.bestDealSoFar = wiki.bestDealSoFar.length > 0 ? wiki.bestDealSoFar : deals.map(scenarioSignalToLine);
      if (wiki.bestDealSoFar.length === 0 && priorContext?.bestDealSoFar.length) wiki.bestDealSoFar = priorContext.bestDealSoFar;
      wiki.subscriptionValue = wiki.subscriptionValue || '中等 - 促销常态化，只有正好需要相关软件时才值得查看。';
      wiki.promotionPattern = wiki.promotionPattern || (deals.length >= 2
        ? `近期 ${deals.length} 条促销证据，折扣/低价重复出现，倾向于常态促销而非必须立即购买。`
        : '促销证据有限，先按普通营销邮件处理。');
      wiki.actionAdvice = wiki.actionAdvice || '不需要立即行动；除非当前正好有相关摄影或视频软件需求，否则可忽略。';
      const summaryChoice = chooseScenarioSummary(wiki.summary, wiki.subscriptionValue, senderProfile.senderType);
      wiki.summary = summaryChoice.summary;
      wiki.wikiDiagnostics = appendDiagnostic(wiki.wikiDiagnostics, {
        canonicalSummaryField: 'subscriptionValue',
        summaryReplaced: summaryChoice.replaced,
      });
      wiki.recentContext = selectScenarioRecentContext(senderProfile.senderType, scenarioEvidence, wiki.recentContext);
    } else if (senderProfile.senderType === 'newsletter') {
      wiki.readingValue = wiki.readingValue || (scenarioEvidence.changeSignals.length > 0
        ? '中 - 有明确更新信号时值得扫一眼。'
        : '低 - 暂无需要行动的重要变化。');
      wiki.frequency = wiki.frequency || (scenarioEvidence.patternSignals[0] ? scenarioSignalToLine(scenarioEvidence.patternSignals[0]) : '');
      wiki.contentStability = wiki.contentStability || '只保留上新、服务变更和周期信号。';
      wiki.subscribeWorth = typeof wiki.subscribeWorth === 'boolean' ? wiki.subscribeWorth : null;
      const summaryChoice = chooseScenarioSummary(wiki.summary, wiki.readingValue, senderProfile.senderType);
      wiki.summary = summaryChoice.summary;
      wiki.wikiDiagnostics = appendDiagnostic(wiki.wikiDiagnostics, {
        canonicalSummaryField: 'readingValue',
        summaryReplaced: summaryChoice.replaced,
      });
      wiki.recentContext = selectScenarioRecentContext(senderProfile.senderType, scenarioEvidence, wiki.recentContext);
    } else if (senderProfile.senderType === 'community_feedback') {
      const feedbackSignals = extractForumFeedbackSignals(chunks, targetLang);
      const featureFeedback = feedbackSignals.filter((line) => /功能缺口|缺少|找不到|missing|feature/i.test(line)).slice(0, 5);
      const criticismFeedback = feedbackSignals.filter((line) => /初体验|早期|框架|不完整|criticism|early/i.test(line)).slice(0, 5);
      wiki.feedbackThemes = wiki.feedbackThemes.length > 0 ? wiki.feedbackThemes : (feedbackSignals.slice(0, 5).length > 0 ? feedbackSignals.slice(0, 5) : priorContext?.feedbackThemes || []);
      wiki.featureRequests = wiki.featureRequests.length > 0
        ? wiki.featureRequests
        : (featureFeedback.length > 0 ? featureFeedback : priorContext?.featureRequests || []);
      wiki.criticisms = wiki.criticisms.length > 0
        ? wiki.criticisms
        : (criticismFeedback.length > 0 ? criticismFeedback : priorContext?.criticisms || []);
      wiki.praises = wiki.praises.length > 0 ? wiki.praises : priorContext?.praises || [];
      wiki.suggestedNextActions = wiki.suggestedNextActions.length > 0
        ? wiki.suggestedNextActions
        : [feedbackSignals.length > 0 ? '优先查看社区正文反馈中的功能缺口、批评和建议。' : '暂无明确社区反馈主题，可按普通社区通知处理。'];
      wiki.replyEntry = wiki.replyEntry || '需要互动时访问话题或直接回复邮件；Wiki 的 replyEntry 只表示入口，不代表当前邮件必须回复。';
      wiki.summary = summarizeCommunityFeedback(chunks, contactEmail, targetLang, wiki.feedbackThemes);
      wiki.recentContext = uniqueScenarioLines([...wiki.feedbackThemes, summarizeUserReplyPattern(chunks, targetLang)], 5);
      wiki.wikiDiagnostics = appendDiagnostic(wiki.wikiDiagnostics, {
        canonicalSummaryField: 'feedbackThemes',
        summaryReplaced: true,
      });
    } else if (senderProfile.senderType === 'vendor' || senderProfile.senderType === 'system_notification') {
      const serviceKind = inferServiceSignalKind(wiki, chunks);
      if (serviceKind === 'forum') {
        const forumFeedback = extractForumFeedbackSignals(chunks, targetLang);
        wiki.serviceType = '论坛/社区邮件网关';
        wiki.userAction = wiki.userAction && !/system_notification|检查通知内容|檢查通知內容/i.test(wiki.userAction)
          ? wiki.userAction
          : (forumFeedback.length > 0
            ? '优先查看正文反馈里的功能缺口和建议；需要互动时再访问话题或邮件回复。'
            : '如需参与讨论，可访问话题或直接回复邮件；无关则归档。');
      } else {
        wiki.serviceType = wiki.serviceType || '服务/系统通知';
        wiki.userAction = wiki.userAction || (scenarioEvidence.deadlineSignals.length > 0 ? '查看是否有截止或账户动作。' : '暂无需要立即处理的动作。');
      }
      wiki.riskAlert = wiki.riskAlert || null;
      const fallbackReason = relationshipSummaryFallbackReason(wiki.summary, wiki);
      wiki.summary = buildServiceNotificationRelationshipSummary(senderProfile.senderType, wiki, chunks, contactEmail, targetLang);
      wiki.wikiDiagnostics = appendDiagnostic(wiki.wikiDiagnostics, {
        fallbackReasons: fallbackReason ? [fallbackReason] : [],
        canonicalSummaryField: 'serviceType',
        summaryReplaced: Boolean(fallbackReason),
      });
      wiki.recentContext = buildServiceNotificationRecentContext(senderProfile.senderType, scenarioEvidence, wiki.recentContext, wiki, chunks, targetLang);
    } else {
      wiki.summary = wiki.summary || '暂无需要行动的重要变化。';
      wiki.recentContext = selectScenarioRecentContext(senderProfile.senderType, scenarioEvidence, wiki.recentContext);
    }
    log.info('[contactKnowledge] sender type policy applied', {
      senderType: senderProfile.senderType,
      contactPolicy: supportsUserInsights ? 'relationship' : 'scenario',
      hasSubscriptionValue: Boolean(wiki.subscriptionValue),
      hasPromotionPattern: Boolean(wiki.promotionPattern),
      hasActionAdvice: Boolean(wiki.actionAdvice),
      bestDealCount: wiki.bestDealSoFar.length,
      summaryReplacedFromScenario: senderProfile.senderType === 'marketing' && wiki.summary === wiki.subscriptionValue,
      relationshipFieldsCleared: wiki.activeProjects.length === 0
        && !wiki.relationshipProfile
        && wiki.replyStyle.length === 0
        && wiki.openLoops.length === 0,
    });
    if (!wiki.doNotOverfitSignals.some((item) => /user insight|用户洞察|behavior/i.test(item))) {
      wiki.doNotOverfitSignals = [
        ...wiki.doNotOverfitSignals,
        'User insights are disabled for this sender type to avoid inferring preferences from sender content.',
      ].slice(0, 5);
    }
  } else if (!hasEnoughBehavior && !wiki.doNotOverfitSignals.some((item) => /behavior|行为/i.test(item))) {
    wiki.doNotOverfitSignals = [
      ...wiki.doNotOverfitSignals,
      `User insights require at least ${MIN_USER_INSIGHT_BEHAVIOR_SAMPLES} behavior or feedback samples.`,
    ].slice(0, 5);
  }
  if (supportsUserInsights && priorContext) {
    if (wiki.commitments.length === 0 && priorContext.commitments.length > 0) wiki.commitments = priorContext.commitments;
    if (wiki.unresolvedQuestions.length === 0 && priorContext.unresolvedQuestions.length > 0) wiki.unresolvedQuestions = priorContext.unresolvedQuestions;
  }
  return wiki;
}

function buildWikiPrompt(
  contactEmail: string,
  contactName: string | undefined,
  chunks: ContactKnowledgeChunk[],
  confidence: { score: number; level: ContactWikiConfidenceLevel },
  senderProfile: SenderTypeProfile,
  behaviorSampleCount: number,
  scenarioEvidence: ScenarioEvidence,
  priorContext: SelectedPriorContext | null,
  targetLang = 'English',
): string {
  const allowUserInsights = SUPPORTS_USER_INSIGHTS[senderProfile.senderType] === true
    && behaviorSampleCount >= MIN_USER_INSIGHT_BEHAVIOR_SAMPLES;
  const schema = buildWikiSchemaForSenderType(senderProfile.senderType, allowUserInsights);
  const scenarioContext = scenarioEvidenceToPrompt(senderProfile.senderType, scenarioEvidence);
  const priorBlock = priorContext
    ? [
      'Selected prior Wiki context. Treat each prior item as stale until supported by current evidence; decide whether to keep, update, close, or drop it.',
      JSON.stringify(priorContext, null, 2),
      'Do not copy prior summary, userInsights, or valueForUser. Preserve only still-useful commitments, unresolved questions, best deals, or community feedback themes.',
    ].join('\n')
    : '';
  const context = scenarioContext || chunks.slice(0, MAX_WIKI_CONTEXT_CHUNKS).map((chunk, index) => [
    `evidence-${index + 1} | ${chunk.date} | ${chunk.direction} | ${chunk.chunkKind} | ${chunk.languageHint}`,
    `Subject: ${chunk.subject}`,
    chunk.text,
  ].join('\n')).join('\n\n');
  return [
    `Contact: ${contactName || contactEmail}`,
    `Output language: ${targetLang}`,
    `Baseline confidence: ${confidence.level} (${confidence.score})`,
    `Sender type: ${senderProfile.senderType} (${senderProfile.senderTypeConfidence}, source: ${senderProfile.senderTypeSource})`,
    `Sender type signals: ${JSON.stringify(senderProfile.senderTypeSignals)}`,
    `Secondary sender types: ${senderProfile.secondarySenderTypes.join(', ') || 'None'}`,
    `Behavior sample count: ${behaviorSampleCount}`,
    priorBlock,
    '',
    'Create a private contact wiki for the USER of this email client, not for the sender.',
    'Extract only durable facts and useful abstractions that help the user decide what matters, summarize the relationship, and write better replies.',
    'Do not treat sender preferences as user preferences. Do not invent facts absent from evidence.',
    'For non-personal senders, do not describe what the sender provides. Answer what the user should do, whether it is worth attention, whether it is urgent, and whether any action is needed.',
    'For marketing/newsletter/vendor/system/community_feedback senders, summary must be a decision summary, not a company biography.',
    'For marketing/newsletter/vendor/system/community_feedback senders, use only the Scenario evidence block. Do not reconstruct omitted email copy.',
    'For marketing senders, recentContext should capture price/deal/frequency evidence only; omit product feature lists, company addresses, and generic subscription statements unless they affect action.',
    'For newsletter senders, recentContext should capture important launches, service changes, deadlines, or repeated frequency patterns. Do not copy headlines, CTA text, or single-email section titles.',
    'User insights are allowed only for personal/work_contact when there are at least 3 behavior or feedback samples.',
    'Do not infer user preferences from received mail content, sender product descriptions, promotion copy, newsletters, statements, or notifications.',
    allowUserInsights
      ? 'For userInsights, use only behavior/feedback evidence ids. Do not use mail content evidence ids for user preference claims.'
      : 'Do not output userInsights, engagementProfile, or preferences. These fields are not applicable for this sender type or behavior sample level.',
    senderProfile.senderType === 'marketing'
      ? 'For marketing senders, focus on subscription value, promotion pattern, best deal so far, action advice, and replyNeeded=false. Prefer conclusions like "not urgent", "normal discount level", or "wait unless needed" when evidence supports them. Drop ad copy that does not help the user decide.'
      : '',
    senderProfile.senderType === 'newsletter'
      ? 'For newsletter senders, focus on reading value, frequency, content stability, subscribeWorth, and replyNeeded=false.'
      : '',
    senderProfile.senderType === 'community_feedback'
      ? 'For community_feedback senders, focus on feedbackThemes, featureRequests, criticisms, praises, suggestedNextActions, replyEntry, and replyNeeded=false. Extract feedback from message body themes, not forum navigation or unsubscribe text. replyEntry describes an interaction route only; it does not mean the current email needs a reply.'
      : '',
    senderProfile.senderType === 'vendor' || senderProfile.senderType === 'system_notification'
      ? 'For vendor/system/forum notifications, summary must explain who this sender is to the user, the sender relationship, what the sender usually does, and what the user usually does if there is reply/outbound evidence. For forum mail relays such as Discourse, do not treat the no-reply address as a person; describe it as a forum/community mail relay carrying topic replies or user feedback. For forum relays, extract feedback themes, feature requests, criticism, praise, and suggestions from the message body; do not only count notifications. Do not interpret only the current email. Recent context must aggregate repeated sender/user patterns and omit recipient copies, backup-email explanations, raw account addresses, topic links, unsubscribe footers, and URL instructions.'
      : '',
    'Return one strict JSON object only. No markdown.',
    `All user-visible string values must be written in ${targetLang}. Keep JSON keys exactly as specified in English.`,
    `Schema: ${schema}`,
    'openLoops max 5. For personal/work_contact only, valueForUser max 5 and every valueForUser item must include confidence and evidenceIds.',
    'Low confidence insights are background only. Medium confidence requires conservative wording. High confidence may be directly useful.',
    '',
    context || '(No usable excerpts)',
  ].filter(Boolean).join('\n');
}

function buildReplyPrompt(params: {
  targetLang: string;
  wiki: ContactWiki;
  currentMail: ContactKnowledgeMailLike;
  retrieved: StoredChunkRow[];
  instruction?: string;
  feedbackGuidance?: string;
}): string {
  const includeUserInsights = SUPPORTS_USER_INSIGHTS[params.wiki.senderType] === true
    && (params.wiki.userInsights || []).length > 0;
  const retrieved = params.retrieved.map((chunk, index) => [
    `#${index + 1} ${chunk.date} · ${chunk.subject}`,
    chunk.text,
  ].join('\n')).join('\n\n');
  return [
    `Write sendable email reply candidates in ${params.targetLang}.`,
    'Return one strict JSON object only. No markdown.',
    'Use stable English JSON keys only: replyNeeded, candidates.',
    'Schema: { "replyNeeded": boolean, "candidates": [{ "style": "short"|"formal"|"best", "body": string }] }.',
    'Generate exactly 3 candidate reply drafts only when replyNeeded=true: short/direct, formal/complete, and best-fit for this contact.',
    'If the current email does not need a reply, return { "replyNeeded": false, "candidates": [] }.',
    'Use the contact wiki and retrieved historical excerpts as private context. Do not mention that a wiki or vector search was used.',
    params.feedbackGuidance ? `Local feedback guidance: ${params.feedbackGuidance}` : '',
    params.instruction ? `User instruction: ${params.instruction}` : '',
    '',
    'Contact wiki:',
    `Confidence: ${params.wiki.confidence.level} (${params.wiki.confidence.score}). Use high-confidence context directly, medium confidence conservatively, and low confidence only as background.`,
    `Sender type: ${params.wiki.senderType}`,
    `Summary: ${params.wiki.summary}`,
    `Value for user: ${params.wiki.valueForUser.map((item) => `${item.text} [${item.confidence}]`).join('; ') || 'None'}`,
    includeUserInsights ? `User insights: ${params.wiki.userInsights.map((item) => `${item.text} [${item.confidence}]`).join('; ')}` : '',
    includeUserInsights ? `Engagement profile: ${params.wiki.engagementProfile.join('; ') || 'None'}` : '',
    params.wiki.subscriptionValue ? `Subscription value: ${params.wiki.subscriptionValue}` : '',
    params.wiki.promotionPattern ? `Promotion pattern: ${params.wiki.promotionPattern}` : '',
    params.wiki.actionAdvice ? `Action advice: ${params.wiki.actionAdvice}` : '',
    params.wiki.readingValue ? `Reading value: ${params.wiki.readingValue}` : '',
    params.wiki.serviceType ? `Service type: ${params.wiki.serviceType}` : '',
    params.wiki.userAction ? `User action: ${params.wiki.userAction}` : '',
    params.wiki.riskAlert ? `Risk alert: ${params.wiki.riskAlert}` : '',
    `Recent context: ${params.wiki.recentContext.join('; ') || 'None'}`,
    `Open loops: ${params.wiki.openLoops.join('; ') || 'None'}`,
    `Reply style: ${params.wiki.replyStyle.join('; ') || 'None'}`,
    `Relationship profile: ${params.wiki.relationshipProfile || 'None'}`,
    `Active projects: ${params.wiki.activeProjects.join('; ') || 'None'}`,
    `Preferences: ${params.wiki.preferences.join('; ') || 'None'}`,
    `Commitments: ${params.wiki.commitments.join('; ') || 'None'}`,
    `Unresolved questions: ${params.wiki.unresolvedQuestions.join('; ') || 'None'}`,
    `Last interaction: ${params.wiki.lastInteractionSummary || 'None'}`,
    '',
    'Current email:',
    `Subject: ${params.currentMail.subject}`,
    cleanContactKnowledgeText(params.currentMail),
    '',
    'Relevant historical excerpts:',
    retrieved || 'None',
    '',
    'The final reply must not mention wiki, behavior learning, vector retrieval, rerank, confidence scores, or internal evidence ids.',
  ].filter(Boolean).join('\n');
}

function deriveCurrentMailReplyContext(mail: ContactKnowledgeMailLike): EmailAIContext {
  return deriveEmailAIContext({
    subject: mail.subject,
    from: mail.from,
    fromName: mail.fromName,
    to: mail.to,
    date: mail.date,
    snippet: mail.snippet,
    bodyText: mail.bodyText,
    bodyHtml: mail.bodyHtml,
  });
}

function wikiReplySuppressionCanBeOverridden(context: EmailAIContext): boolean {
  return context.replyNeeded &&
    (context.replyNeededReason === 'explicit request in message' ||
      context.replyNeededReason === 'human contact context' ||
      context.replyNeededReason === 'explicit true');
}

function extractContactReplyJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(first, last + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function parseContactReplyCandidates(raw: string): { replyNeeded: boolean; candidates: AIReplyCandidateMetadata[] } {
  const parsed = extractContactReplyJson(raw);
  const replyNeeded = parsed?.replyNeeded !== false;
  const candidates = Array.isArray(parsed?.candidates)
    ? parsed.candidates
        .map((item): AIReplyCandidateMetadata | null => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const style = record.style === 'short' || record.style === 'formal' || record.style === 'best'
            ? record.style
            : 'best';
          const body = String(record.body || '').trim();
          if (!body) return null;
          return { style, body };
        })
        .filter((item): item is AIReplyCandidateMetadata => Boolean(item))
        .slice(0, 3)
    : [];
  return { replyNeeded, candidates };
}

function localizedNoContactReplyMessage(targetLang = 'English'): string {
  const messages: Record<string, string> = {
    Chinese: '无需回复',
    English: 'No reply needed',
    Japanese: '返信は不要です',
    Korean: '답장이 필요하지 않습니다',
    Spanish: 'No hace falta responder',
    French: 'Aucune réponse nécessaire',
    German: 'Keine Antwort erforderlich',
    Russian: 'Ответ не требуется',
  };
  return messages[targetLang] || messages.English;
}

function loadFeedbackGuidance(accountId: number, contactEmail: string): string {
  const rows = getMailCacheDb().prepare(`
    SELECT rating FROM contact_knowledge_feedback
    WHERE account_id = ? AND contact_email = ? AND target = 'reply'
    ORDER BY datetime(created_at) DESC
    LIMIT 12
  `).all(accountId, contactEmail) as Array<{ rating: ContactWikiFeedbackRequest['rating'] }>;
  if (rows.length === 0) return '';
  const ratings = rows.map((row) => row.rating);
  if (ratings.filter((rating) => rating === 'too_long').length >= 2) return 'Prefer a shorter reply.';
  if (ratings.filter((rating) => rating === 'too_short').length >= 2) return 'Include more concrete context and detail.';
  if (ratings.filter((rating) => rating === 'too_formal').length >= 2) return 'Use a warmer and less formal tone.';
  if (ratings.filter((rating) => rating === 'inaccurate').length >= 2) return 'Use historical context conservatively and avoid unsupported details.';
  return '';
}

export function getContactKnowledgeSettings(): ContactKnowledgeSettings {
  return {
    enabled: getSetting(CONTACT_KNOWLEDGE_ENABLED_KEY) === 'true',
  };
}

export function saveContactKnowledgeSettings(settings: Partial<ContactKnowledgeSettings>): ContactKnowledgeSettings {
  if (settings.enabled !== undefined) {
    setSetting(CONTACT_KNOWLEDGE_ENABLED_KEY, String(Boolean(settings.enabled)));
  }
  return getContactKnowledgeSettings();
}

export function getContactBehaviorSettings(): ContactBehaviorSettings {
  return {
    enabled: getSetting(CONTACT_BEHAVIOR_LEARNING_ENABLED_KEY) === 'true',
    retentionDays: 180,
    deviceScoped: true,
  };
}

export function saveContactBehaviorSettings(settings: Partial<ContactBehaviorSettings>): ContactBehaviorSettings {
  if (settings.enabled !== undefined) {
    setSetting(CONTACT_BEHAVIOR_LEARNING_ENABLED_KEY, String(Boolean(settings.enabled)));
  }
  return getContactBehaviorSettings();
}

const ALLOWED_BEHAVIOR_EVENTS = new Set<ContactBehaviorEventType>([
  'open',
  'dwell_bucket',
  'scroll_bucket',
  'link_domain_click',
  'remote_images_shown',
  'attachment_action',
  'reply_started',
  'archived',
  'deleted',
  'starred',
]);

function validateBehaviorEventValue(eventType: ContactBehaviorEventType, value: unknown): Record<string, unknown> {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const serialized = JSON.stringify(record);
  if (serialized.length > 640) throw new Error('Interaction payload is too large.');
  if (/https?:\/\//i.test(serialized)) throw new Error('Interaction payload must not contain full URLs.');
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(serialized)) throw new Error('Interaction payload must not contain email addresses.');
  if (/Bearer\s+[A-Za-z0-9._~+/=-]+|api[_-]?key|token/i.test(serialized)) throw new Error('Interaction payload must not contain secrets.');
  if (/(\/Users\/|\/private\/|[A-Za-z]:\\|\\\\|file:\/\/)/.test(serialized)) throw new Error('Interaction payload must not contain file paths.');
  const allowedKeys = new Set(['bucket', 'count', 'domainHash', 'shown', 'action', 'state']);
  const safe: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(record)) {
    if (!allowedKeys.has(key)) throw new Error('Interaction payload contains an unsupported field.');
    if (typeof rawValue === 'string') {
      if (rawValue.length > 96) throw new Error('Interaction payload contains an oversized value.');
      if (key === 'domainHash' && !/^[a-f0-9]{8,64}$/i.test(rawValue)) throw new Error('Invalid domain hash.');
      if (key !== 'domainHash' && !/^[a-z0-9_.:-]+$/i.test(rawValue)) throw new Error('Invalid interaction value.');
      safe[key] = rawValue;
    } else if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue) || rawValue < 0 || rawValue > 100000) throw new Error('Invalid interaction count.');
      safe[key] = Math.floor(rawValue);
    } else if (typeof rawValue === 'boolean') {
      safe[key] = rawValue;
    } else {
      throw new Error('Invalid interaction value type.');
    }
  }
  if (eventType === 'link_domain_click' && typeof safe.domainHash !== 'string') throw new Error('Link click interactions require a domain hash.');
  return safe;
}

function safeEventId(input?: string): string {
  if (input && /^[a-zA-Z0-9_-]{8,80}$/.test(input)) return input;
  return crypto.randomUUID();
}

function safeDeviceId(input?: string): string {
  if (input && /^[a-zA-Z0-9_-]{4,80}$/.test(input)) return input;
  return stableDeviceId();
}

function stableDeviceId(): string {
  const key = 'contact_behavior_device_id_v1';
  const existing = getSetting(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  setSetting(key, next);
  return next;
}

export function recordContactMailInteraction(input: ContactMailInteractionRequest): { success: true } {
  ensureContactKnowledgeTables();
  if (!getContactBehaviorSettings().enabled) {
    throw new Error('Contact behavior learning is disabled. Enable it in AI settings first.');
  }
  const accountId = validateAccountId(input.accountId);
  const mailId = clampString(input.mailId, 120);
  if (!mailId) throw new Error('Invalid mail id.');
  if (!ALLOWED_BEHAVIOR_EVENTS.has(input.eventType)) throw new Error('Invalid interaction event type.');
  const contactEmailHash = input.contactEmail
    ? contactHash(validateContactEmail(input.contactEmail))
    : clampString(input.contactEmailHash, 96);
  if (!/^[a-f0-9]{8,64}$/i.test(contactEmailHash)) throw new Error('Invalid contact hash.');
  const eventValue = validateBehaviorEventValue(input.eventType, input.eventValue);
  const createdAt = input.createdAt && Number.isFinite(new Date(input.createdAt).getTime())
    ? new Date(input.createdAt).toISOString()
    : new Date().toISOString();
  getMailCacheDb().prepare(`
    DELETE FROM contact_knowledge_interactions
    WHERE datetime(created_at) < datetime('now', '-180 days')
  `).run();
  getMailCacheDb().prepare(`
    INSERT OR IGNORE INTO contact_knowledge_interactions
      (event_id, account_id, mail_id, contact_email_hash, device_id, event_type, event_value_json,
       schema_version, created_at, aggregated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    safeEventId(input.eventId),
    accountId,
    mailId,
    contactEmailHash,
    safeDeviceId(input.deviceId),
    input.eventType,
    JSON.stringify(eventValue),
    BEHAVIOR_SCHEMA_VERSION,
    createdAt,
  );
  if (input.contactEmail) {
    getMailCacheDb().prepare(`
      UPDATE contact_knowledge_wikis
      SET stale = 1, stale_reason = 'behavior_updated', evidence_changed_at = ?
      WHERE account_id = ? AND contact_email = ?
    `).run(new Date().toISOString(), accountId, validateContactEmail(input.contactEmail));
  }
  log.info('[contactKnowledge] interaction recorded', {
    accountId,
    mailIdHash: crypto.createHash('sha256').update(mailId).digest('hex').slice(0, 12),
    contactHash: contactEmailHash.slice(0, 12),
    eventType: input.eventType,
    status: 'stored',
  });
  return { success: true };
}

export function listContactBehaviorInsights(input: { accountId: number; contactEmail?: string; contactEmailHash?: string }): {
  accountId: number;
  contactEmailHash?: string;
  sampleCount: number;
  eventCounts: Record<string, number>;
  deviceScoped: true;
  crossDeviceSyncEnabled: false;
} {
  ensureContactKnowledgeTables();
  const accountId = validateAccountId(input.accountId);
  const contactEmailHash = input.contactEmail ? contactHash(validateContactEmail(input.contactEmail)) : input.contactEmailHash;
  const rows = getMailCacheDb().prepare(`
    SELECT event_type, COUNT(*) AS count
    FROM contact_knowledge_interactions
    WHERE account_id = ?
      AND (? IS NULL OR contact_email_hash = ?)
    GROUP BY event_type
  `).all(accountId, contactEmailHash || null, contactEmailHash || null) as Array<{ event_type: string; count: number }>;
  return {
    accountId,
    contactEmailHash,
    sampleCount: rows.reduce((sum, row) => sum + Number(row.count || 0), 0),
    eventCounts: Object.fromEntries(rows.map((row) => [row.event_type, Number(row.count || 0)])),
    deviceScoped: true,
    crossDeviceSyncEnabled: false,
  };
}

export function exportContactBehaviorSummary(input: { accountId: number; contactEmail?: string; contactEmailHash?: string }) {
  return {
    ...listContactBehaviorInsights(input),
    schemaVersion: BEHAVIOR_SCHEMA_VERSION,
    retentionDays: getContactBehaviorSettings().retentionDays,
    syncPolicy: 'event_id dedupe; aggregate merge by contact hash and time window; latest schema_version wins',
  };
}

export function clearContactBehaviorData(input: { accountId?: number; contactEmail?: string; contactEmailHash?: string }): { success: true; deletedCount: number } {
  ensureContactKnowledgeTables();
  const contactEmailHash = input.contactEmail ? contactHash(validateContactEmail(input.contactEmail)) : input.contactEmailHash;
  let result: { changes: number };
  if (input.accountId && contactEmailHash) {
    result = getMailCacheDb().prepare('DELETE FROM contact_knowledge_interactions WHERE account_id = ? AND contact_email_hash = ?')
      .run(validateAccountId(input.accountId), contactEmailHash) as { changes: number };
  } else if (input.accountId) {
    result = getMailCacheDb().prepare('DELETE FROM contact_knowledge_interactions WHERE account_id = ?')
      .run(validateAccountId(input.accountId)) as { changes: number };
  } else {
    result = getMailCacheDb().prepare('DELETE FROM contact_knowledge_interactions').run() as { changes: number };
  }
  return { success: true, deletedCount: Number(result.changes || 0) };
}

export function listContactKnowledgeStats(input: { accountId: number }): ContactKnowledgeStats {
  ensureContactKnowledgeTables();
  const accountId = validateAccountId(input.accountId);
  const rows = getMailCacheDb().prepare(`
    SELECT contact_email, source_mail_count, chunk_count, last_indexed_at, stale, stale_reason
    FROM contact_knowledge_wikis
    WHERE account_id = ?
    ORDER BY datetime(last_indexed_at) DESC
  `).all(accountId) as Array<{
    contact_email: string;
    source_mail_count: number;
    chunk_count: number;
    last_indexed_at: string;
    stale: number;
    stale_reason?: string | null;
  }>;
  return {
    accountId,
    contactCount: rows.length,
    chunkCount: rows.reduce((sum, row) => sum + Number(row.chunk_count || 0), 0),
    staleCount: rows.filter((row) => Boolean(row.stale)).length,
    contacts: rows.map((row) => ({
      contactEmail: row.contact_email,
      sourceMailCount: Number(row.source_mail_count || 0),
      chunkCount: Number(row.chunk_count || 0),
      lastIndexedAt: row.last_indexed_at,
      stale: Boolean(row.stale),
      staleReason: row.stale_reason || undefined,
    })),
  };
}

function sanitizeFeedbackReason(reason?: string): string | null {
  if (!reason) return null;
  return reason
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .slice(0, 240)
    .trim() || null;
}

export function saveContactWikiFeedback(input: ContactWikiFeedbackRequest): { success: true } {
  ensureContactKnowledgeTables();
  const accountId = validateAccountId(input.accountId);
  const contactEmail = validateContactEmail(input.contactEmail);
  const validTargets = new Set<ContactWikiFeedbackRequest['target']>(['wiki', 'reply']);
  const validRatings = new Set<ContactWikiFeedbackRequest['rating']>(['useful', 'inaccurate', 'not_relevant', 'too_long', 'too_formal', 'too_short']);
  if (!validTargets.has(input.target)) throw new Error('Invalid feedback target.');
  if (!validRatings.has(input.rating)) throw new Error('Invalid feedback rating.');
  getMailCacheDb().prepare(`
    INSERT INTO contact_knowledge_feedback (account_id, contact_email, target, rating, reason_summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(accountId, contactEmail, input.target, input.rating, sanitizeFeedbackReason(input.reason), new Date().toISOString());
  log.info('[contactKnowledge] feedback saved', {
    accountId,
    contactHash: contactHash(contactEmail),
    target: input.target,
    rating: input.rating,
  });
  return { success: true };
}

export function getContactWiki(input: { accountId: number; contactEmail: string }): ContactWiki | null {
  ensureContactKnowledgeTables();
  const accountId = validateAccountId(input.accountId);
  const contactEmail = validateContactEmail(input.contactEmail);
  const row = getMailCacheDb().prepare(`
    SELECT account_id, contact_email, contact_name, summary, recent_context_json, open_loops_json,
           reply_style_json, aliases_json, structured_profile_json, source_mail_count, chunk_count,
           last_indexed_at, stale, stale_reason, evidence_changed_at
    FROM contact_knowledge_wikis
    WHERE account_id = ? AND contact_email = ?
  `).get(accountId, contactEmail) as Record<string, unknown> | undefined;
  if (!row) return null;
  const structuredProfile = parseStructuredProfile(row.structured_profile_json as string);
  return {
    accountId: row.account_id as number,
    contactEmail: row.contact_email as string,
    contactName: row.contact_name as string | undefined,
    aliases: parseJsonArray(row.aliases_json as string),
    summary: row.summary as string,
    recentContext: parseJsonArray(row.recent_context_json as string),
    openLoops: parseJsonArray(row.open_loops_json as string),
    replyStyle: parseJsonArray(row.reply_style_json as string),
    ...structuredProfile,
    sourceMailCount: row.source_mail_count as number,
    chunkCount: row.chunk_count as number,
    lastIndexedAt: row.last_indexed_at as string,
    stale: Boolean(row.stale),
    staleReason: row.stale_reason as string | undefined,
    evidenceChangedAt: row.evidence_changed_at as string | undefined,
  };
}

export async function reindexContactKnowledge(input: ReindexContactKnowledgeRequest): Promise<{
  mails: ContactKnowledgeMailLike[];
  chunks: ContactKnowledgeChunk[];
  embedded: Array<ContactKnowledgeChunk & { embedding: number[]; embeddingModel: string }>;
}> {
  assertEnabled();
  ensureContactKnowledgeTables();
  const accountId = validateAccountId(input.accountId);
  const contactEmail = validateContactEmail(input.contactEmail);
  const aliases = normalizeContactAliases(contactEmail, input.aliases).filter((alias) => alias !== contactEmail);
  const mails = loadContactMails(accountId, contactEmail, aliases);
  const chunkInputs = mails.map((mail) => {
    const direction = inferContactMailDirection(mail, contactEmail, aliases);
    return {
      mailId: mail.id,
      subject: mail.subject,
      date: mail.date,
      text: cleanContactKnowledgeText(mail),
      direction,
      chunkKind: inferContactChunkKind(mail, direction),
    };
  });
  const chunks = buildContactKnowledgeChunks(chunkInputs);
  const existingRows = loadExistingChunkRows(accountId, contactEmail);
  const embedded = await embedChunks(chunks, existingRows, Boolean(input.force));
  storeChunks(accountId, contactEmail, embedded);

  getMailCacheDb().prepare(`
    UPDATE contact_knowledge_wikis
    SET aliases_json = ?, source_mail_count = ?, chunk_count = ?, last_indexed_at = ?, stale = 1,
        stale_reason = COALESCE(stale_reason, 'reindexed'), evidence_changed_at = COALESCE(evidence_changed_at, ?)
    WHERE account_id = ? AND contact_email = ?
  `).run(JSON.stringify(aliases), mails.length, embedded.length, new Date().toISOString(), new Date().toISOString(), accountId, contactEmail);

  log.info('[contactKnowledge] contact reindexed', {
    accountId,
    contactHash: contactHash(contactEmail),
    sourceMailCount: mails.length,
    chunkCount: embedded.length,
  });

  return { mails, chunks, embedded };
}

export async function buildContactWiki(input: BuildContactWikiRequest): Promise<ContactWiki> {
  assertEnabled();
  ensureContactKnowledgeTables();
  const accountId = validateAccountId(input.accountId);
  const contactEmail = validateContactEmail(input.contactEmail);
  const aliases = normalizeContactAliases(contactEmail, input.aliases).filter((alias) => alias !== contactEmail);
  const existing = getContactWiki({ accountId, contactEmail });
  if (existing && !input.force && !existing.stale) return existing;
  const buildState = getMailCacheDb().prepare(`
    SELECT evidence_hash, build_backoff_until
    FROM contact_knowledge_wikis
    WHERE account_id = ? AND contact_email = ?
  `).get(accountId, contactEmail) as { evidence_hash?: string | null; build_backoff_until?: string | null } | undefined;
  if (!input.force && buildState?.build_backoff_until && new Date(buildState.build_backoff_until).getTime() > Date.now()) {
    throw new Error('Contact wiki was rebuilt recently. Please wait before rebuilding again.');
  }
  getMailCacheDb().prepare(`
    UPDATE contact_knowledge_wikis
    SET last_build_attempt_at = ?, build_backoff_until = ?
    WHERE account_id = ? AND contact_email = ?
  `).run(new Date().toISOString(), new Date(Date.now() + WIKI_REBUILD_BACKOFF_MS).toISOString(), accountId, contactEmail);

  const { mails, chunks, embedded } = await reindexContactKnowledge({
    accountId,
    contactEmail,
    contactName: input.contactName,
    aliases,
    force: Boolean(input.force),
  });

  const behaviorSampleCount = getMailCacheDb().prepare(`
    SELECT COUNT(*) AS count FROM contact_knowledge_interactions
    WHERE account_id = ? AND contact_email_hash = ?
  `).get(accountId, contactHash(contactEmail)) as { count: number };
  const behaviorCount = Number(behaviorSampleCount.count || 0);
  const senderProfile = inferSenderType(contactEmail, mails);
  const scenarioEvidence = buildScenarioEvidence(chunks, senderProfile.senderType);
  const priorContext = selectedPriorContext(existing, senderProfile.senderType);
  const evidenceHash = computeEvidenceHash(chunks, `${behaviorCount}:${senderProfile.senderType}:${JSON.stringify(senderProfile.senderTypeSignals)}:${JSON.stringify(scenarioEvidence)}:${JSON.stringify(priorContext)}`);
  if (!input.force && existing && buildState?.evidence_hash === evidenceHash) {
    getMailCacheDb().prepare(`
      UPDATE contact_knowledge_wikis
      SET stale = 0, stale_reason = NULL, build_backoff_until = NULL, evidence_changed_at = COALESCE(evidence_changed_at, ?)
      WHERE account_id = ? AND contact_email = ?
    `).run(new Date().toISOString(), accountId, contactEmail);
    return { ...existing, stale: false, staleReason: undefined };
  }
  const evidenceConfidence = computeEvidenceConfidence({ accountId, mails, behaviorSampleCount: behaviorCount, contactEmail });
  const promptInput = buildWikiPrompt(contactEmail, input.contactName, chunks, evidenceConfidence, senderProfile, behaviorCount, scenarioEvidence, priorContext, input.targetLang || 'English');
  const prepared = prepareCloudPromptInput(promptInput);
  const response = restoreCloudAiResponse(await callAI({
    system: 'You create concise private contact knowledge wikis for an email client. Return JSON only.',
    prompt: prepared.value,
    temperature: 0.25,
    maxTokens: 900,
  }), prepared.redactionMap);
  if (!response.success || !response.content) throw new Error(response.error || 'Contact wiki generation failed.');
  const parsed = enforceUserInsightPolicy(parseWikiPayload(response.content), senderProfile, behaviorCount, chunks, scenarioEvidence, contactEmail, input.targetLang || 'English', priorContext);
  parsed.confidence = evidenceConfidence;
  const lastIndexedAt = new Date().toISOString();

  const wiki: ContactWiki = {
    accountId,
    contactEmail,
    contactName: input.contactName,
    aliases,
    ...parsed,
    sourceMailCount: mails.length,
    chunkCount: embedded.length,
    lastIndexedAt,
    stale: false,
  };

  getMailCacheDb().prepare(`
    INSERT OR REPLACE INTO contact_knowledge_wikis
      (account_id, contact_email, contact_name, aliases_json, summary, recent_context_json, open_loops_json,
       reply_style_json, structured_profile_json, source_mail_count, chunk_count, last_indexed_at, stale, stale_reason,
       evidence_hash, evidence_changed_at, last_build_attempt_at, build_backoff_until)
    VALUES
      (@accountId, @contactEmail, @contactName, @aliasesJson, @summary, @recentContextJson, @openLoopsJson,
       @replyStyleJson, @structuredProfileJson, @sourceMailCount, @chunkCount, @lastIndexedAt, 0, NULL,
       @evidenceHash, @evidenceChangedAt, @lastBuildAttemptAt, NULL)
  `).run({
    accountId,
    contactEmail,
    contactName: input.contactName || null,
    aliasesJson: JSON.stringify(aliases),
    summary: wiki.summary,
    recentContextJson: JSON.stringify(wiki.recentContext),
    openLoopsJson: JSON.stringify(wiki.openLoops),
    replyStyleJson: JSON.stringify(wiki.replyStyle),
    structuredProfileJson: JSON.stringify({
      relationshipProfile: wiki.relationshipProfile,
      senderType: wiki.senderType,
      senderTypeConfidence: wiki.senderTypeConfidence,
      senderTypeSource: wiki.senderTypeSource,
      senderTypeUncertain: wiki.senderTypeUncertain,
      manualSenderTypeOverride: wiki.manualSenderTypeOverride,
      senderTypeSignals: wiki.senderTypeSignals,
      secondarySenderTypes: wiki.secondarySenderTypes,
      activeProjects: wiki.activeProjects,
      preferences: wiki.preferences,
      commitments: wiki.commitments,
      unresolvedQuestions: wiki.unresolvedQuestions,
      lastInteractionSummary: wiki.lastInteractionSummary,
      userInsights: wiki.userInsights,
      engagementProfile: wiki.engagementProfile,
      valueForUser: wiki.valueForUser,
      confidence: wiki.confidence,
      evidenceQuality: wiki.evidenceQuality,
      doNotOverfitSignals: wiki.doNotOverfitSignals,
      languageProfile: wiki.languageProfile,
      subscriptionValue: wiki.subscriptionValue,
      promotionPattern: wiki.promotionPattern,
      bestDealSoFar: wiki.bestDealSoFar,
      actionAdvice: wiki.actionAdvice,
      replyNeeded: wiki.replyNeeded,
      readingValue: wiki.readingValue,
      frequency: wiki.frequency,
      contentStability: wiki.contentStability,
      subscribeWorth: wiki.subscribeWorth,
      serviceType: wiki.serviceType,
      userAction: wiki.userAction,
      riskAlert: wiki.riskAlert,
      feedbackThemes: wiki.feedbackThemes,
      featureRequests: wiki.featureRequests,
      criticisms: wiki.criticisms,
      praises: wiki.praises,
      suggestedNextActions: wiki.suggestedNextActions,
      replyEntry: wiki.replyEntry,
      wikiDiagnostics: wiki.wikiDiagnostics,
      syncReadiness: wiki.syncReadiness,
    }),
    sourceMailCount: wiki.sourceMailCount,
    chunkCount: wiki.chunkCount,
    lastIndexedAt,
    evidenceHash,
    evidenceChangedAt: lastIndexedAt,
    lastBuildAttemptAt: lastIndexedAt,
  });

  log.info('[contactKnowledge] wiki built', {
    accountId,
    contactHash: contactHash(contactEmail),
    sourceMailCount: mails.length,
    chunkCount: embedded.length,
  });

  return wiki;
}

function loadStoredChunks(accountId: number, contactEmail: string): StoredChunkRow[] {
  ensureContactKnowledgeTables();
  return getMailCacheDb().prepare(`
    SELECT chunk_id, mail_id, subject, date, text, embedding_json, embedding_model, embedding_dim,
           content_hash, mail_date, chunk_kind, direction, search_terms, language_hint
    FROM contact_knowledge_chunks
    WHERE account_id = ? AND contact_email = ?
    ORDER BY datetime(date) DESC
  `).all(accountId, contactEmail) as StoredChunkRow[];
}

function loadFtsScores(query: string): Map<string, number> {
  const tokens = query
    .toLowerCase()
    .replace(/["']/g, ' ')
    .replace(/[^\p{L}\p{N}_@.-]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 8);
  if (tokens.length === 0) return new Map();
  try {
    const rows = getMailCacheDb().prepare(`
      SELECT chunk_id, bm25(contact_knowledge_chunks_fts) AS rank
      FROM contact_knowledge_chunks_fts
      WHERE contact_knowledge_chunks_fts MATCH ?
      LIMIT 60
    `).all(tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' OR ')) as Array<{ chunk_id: string; rank: number }>;
    const scores = new Map<string, number>();
    for (const row of rows) {
      scores.set(row.chunk_id, Math.max(0, 1 / (1 + Math.abs(Number(row.rank) || 0))));
    }
    return scores;
  } catch {
    return new Map();
  }
}

function loadMailById(accountId: number, mailId: string): ContactKnowledgeMailLike | null {
  const row = getMailCacheDb().prepare(`
    SELECT id, uid, "from", from_name, "to", subject, date, snippet, folder, account_id, body_text, body_html, delivery_state
    FROM mail_cache
    WHERE account_id = ? AND id = ?
    LIMIT 1
  `).get(accountId, mailId) as CachedContactMailRow | undefined;
  return row ? toMailLike(row) : null;
}

async function retrieveRelevantChunks(accountId: number, contactEmail: string, query: string): Promise<StoredChunkRow[]> {
  const queryEmbedding = (await createEmbedding(query)).embedding;
  const querySubject = query.split('\n')[0] || '';
  const ftsScores = loadFtsScores(query);
  return loadStoredChunks(accountId, contactEmail)
    .map((chunk) => {
      let embedding: number[] = [];
      try {
        const parsed = JSON.parse(chunk.embedding_json);
        embedding = Array.isArray(parsed) ? parsed.map(Number).filter((value) => Number.isFinite(value)) : [];
      } catch {
        embedding = [];
      }
      const vectorScore = cosineSimilarity(queryEmbedding, embedding);
      const lexicalScore = Math.max(
        keywordOverlapScore(query, `${chunk.subject}\n${chunk.text}`),
        ftsScores.get(chunk.chunk_id) || 0,
      );
      const searchScore = searchTermOverlapScore(query, chunk.search_terms || buildContactKnowledgeSearchTerms(`${chunk.subject}\n${chunk.text}`));
      return {
        chunk,
        score: hybridContactChunkScore({
          vectorScore,
          keywordScore: lexicalScore,
          searchTermScore: searchScore,
          date: chunk.mail_date || chunk.date,
          subject: chunk.subject,
          querySubject,
          direction: chunk.direction || undefined,
          chunkKind: chunk.chunk_kind || undefined,
        }),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .slice(0, MAX_WIKI_CONTEXT_CHUNKS)
    .map((item) => item.chunk);
}

export async function suggestContactReply(input: ContactReplySuggestionRequest): Promise<AIResponse> {
  assertEnabled();
  ensureContactKnowledgeTables();
  const accountId = validateAccountId(input.accountId);
  const contactEmail = validateContactEmail(input.contactEmail);
  const aliases = normalizeContactAliases(contactEmail, input.aliases).filter((alias) => alias !== contactEmail);
  const currentMail = loadMailById(accountId, input.mailId);
  if (!currentMail) throw new Error('Mail not found.');
  const currentContext = deriveCurrentMailReplyContext(currentMail);
  const targetLang = input.targetLang || 'English';
  const noReplyResponse = (reason: string, senderType?: string): AIResponse => {
    const message = localizedNoContactReplyMessage(targetLang);
    return {
      success: true,
      content: message,
      metadata: {
        senderType,
        replyNeeded: false,
        replyNeededReason: reason,
        noReplyMessage: message,
        replyCandidates: [],
      },
    };
  };

  if (!currentContext.replyNeeded) {
    return noReplyResponse(currentContext.replyNeededReason, currentContext.senderType);
  }

  const wiki = getContactWiki({ accountId, contactEmail }) || await buildContactWiki({
    accountId,
    contactEmail,
    aliases,
    targetLang,
  });
  const wikiSuppressesReply = wiki.replyNeeded === false || SUPPORTS_USER_INSIGHTS[wiki.senderType] !== true;
  if (wikiSuppressesReply && !wikiReplySuppressionCanBeOverridden(currentContext)) {
    return noReplyResponse('contact wiki reply suppressed by non-interpersonal context', wiki.senderType);
  }

  const query = [currentMail.subject, cleanContactKnowledgeText(currentMail), input.instruction || ''].join('\n');
  const retrieved = await retrieveRelevantChunks(accountId, contactEmail, query);
  const prepared = prepareCloudPromptInput(buildReplyPrompt({
    targetLang,
    wiki,
    currentMail,
    retrieved,
    instruction: input.instruction,
    feedbackGuidance: loadFeedbackGuidance(accountId, contactEmail),
  }));
  const response = await callAI({
    system: 'You draft concise, sendable email replies. Return only the requested JSON object, with no markdown or explanations.',
    prompt: prepared.value,
    temperature: 0.65,
    maxTokens: 1000,
  });
  if (!response.success || !response.content) return restoreCloudAiResponse(response, prepared.redactionMap);
  const parsed = parseContactReplyCandidates(response.content);
  if (!parsed.replyNeeded || parsed.candidates.length === 0) {
    return noReplyResponse('model returned no reply needed', wiki.senderType);
  }
  const preferred = parsed.candidates.find((candidate) => candidate.style === 'best') || parsed.candidates[0];
  return restoreCloudAiResponse({
    ...response,
    content: preferred.body,
    metadata: {
      ...response.metadata,
      senderType: wiki.senderType,
      replyNeeded: true,
      replyNeededReason: currentContext.replyNeededReason,
      replyCandidates: parsed.candidates,
    },
  }, prepared.redactionMap);
}
