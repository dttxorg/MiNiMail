import { useState, useCallback } from 'react';

export interface AIConfig {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  activeProfileId?: 'primary' | 'secondary';
  profiles?: Record<'primary' | 'secondary', {
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
  }>;
}

export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: AIResponseMetadata;
}

export interface AISummaryMetadata {
  what: string;
  impact: string | null;
  action: string | null;
  keyFacts: string[];
  urgency: 'now' | 'today' | 'later' | 'none';
}

export interface AIActionSuggestionMetadata {
  label: string;
  type: 'primary' | 'secondary' | 'dismiss';
  intent: 'reply' | 'archive' | 'unsubscribe' | 'read' | 'external_link' | 'none';
  evidence: string;
}

export interface AIReplyCandidateMetadata {
  style: 'short' | 'formal' | 'best';
  body: string;
}

export interface AIResponseMetadata {
  senderType?: string;
  replyNeeded?: boolean | null;
  replyNeededReason?: string;
  noReplyMessage?: string;
  parseStatus?: 'parsed' | 'fallback';
  summary?: AISummaryMetadata;
  actions?: AIActionSuggestionMetadata[];
  urgency?: 'now' | 'today' | 'later' | 'none';
  quickReplies?: string[];
  replyCandidates?: AIReplyCandidateMetadata[];
  classificationSource?: string;
  confidence?: number;
}

export interface AISegmentsResponse {
  success: boolean;
  translations?: string[];
  error?: string;
}

export interface AIEmailSourcePayload {
  subject?: string;
  from?: string;
  from_name?: string;
  to?: string;
  cc?: string;
  date?: string | Date;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string | string[] | undefined>;
  body_html?: string;
  body_text?: string;
  snippet?: string;
  category?: string;
  scan_result?: string;
  senderType?: string;
  replyNeeded?: boolean | null;
}

export type PolishStyle = 'formal' | 'friendly' | 'shorter' | 'longer' | 'proofread' | 'simplify' | 'bullet_points';

export interface ContactKnowledgeSettings {
  enabled: boolean;
}

export interface ContactWiki {
  accountId: number;
  contactEmail: string;
  contactName?: string;
  aliases: string[];
  senderType?: 'personal' | 'work_contact' | 'marketing' | 'newsletter' | 'vendor' | 'system_notification' | 'community_feedback' | 'unknown';
  senderTypeConfidence?: number;
  senderTypeSource?: string;
  senderTypeUncertain?: boolean;
  manualSenderTypeOverride?: boolean;
  senderTypeSignals?: Array<{ type: string; score: number; source: string; strength: string; reasonCode: string }>;
  secondarySenderTypes?: string[];
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
  userInsights?: Array<{ text: string; confidence: 'low' | 'medium' | 'high'; confidenceScore: number; evidenceIds: string[] }>;
  engagementProfile?: string[];
  valueForUser?: Array<{ text: string; confidence: 'low' | 'medium' | 'high'; confidenceScore: number; evidenceIds: string[] }>;
  confidence?: { score: number; level: 'low' | 'medium' | 'high' };
  evidenceQuality?: string[];
  doNotOverfitSignals?: string[];
  languageProfile?: string[];
  subscriptionValue?: string;
  promotionPattern?: string;
  bestDealSoFar?: string[];
  actionAdvice?: string;
  replyNeeded?: boolean | null;
  readingValue?: string;
  frequency?: string;
  contentStability?: string;
  subscribeWorth?: boolean | null;
  serviceType?: string;
  userAction?: string;
  riskAlert?: string | null;
  feedbackThemes?: string[];
  featureRequests?: string[];
  criticisms?: string[];
  praises?: string[];
  suggestedNextActions?: string[];
  replyEntry?: string;
  wikiDiagnostics?: {
    fallbackReasons: string[];
    strippedFields: string[];
    canonicalSummaryField?: string;
    summaryReplaced: boolean;
  };
  sourceMailCount: number;
  chunkCount: number;
  lastIndexedAt: string;
  stale: boolean;
  staleReason?: string;
}

export interface ContactBehaviorSettings {
  enabled: boolean;
  retentionDays: number;
  deviceScoped: true;
}

export interface ContactKnowledgeStats {
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
}

export function useAI() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await window.electronAPI.invoke('ai:getConfig') as { success: boolean; data?: AIConfig };
      if (response.success && response.data) {
        setConfig(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch AI config:', err);
    }
  }, []);

  const saveConfig = useCallback(async (newConfig: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    profileId?: 'primary' | 'secondary';
    activeProfileId?: 'primary' | 'secondary';
  }): Promise<boolean> => {
    try {
      const response = await window.electronAPI.invoke('ai:saveConfig', newConfig) as { success: boolean; error?: string };
      if (response.success) {
        await fetchConfig();
        return true;
      }
      setError(response.error || 'Failed to save config');
      return false;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, [fetchConfig]);

  const translate = useCallback(async (text: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:translate', text, targetLang) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Translation failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const translateSegments = useCallback(async (segments: string[], targetLang: string): Promise<string[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:translateSegments', segments, targetLang) as AISegmentsResponse;
      if (response.success && response.translations) {
        return response.translations;
      }
      throw new Error(response.error || 'Segment translation failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const summarizeDetailed = useCallback(async (text: string | AIEmailSourcePayload, targetLang: string): Promise<AIResponse> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:summarize', text, targetLang) as AIResponse;
      if (response.success && response.content !== undefined) return response;
      throw new Error(response.error || 'Summarization failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const summarize = useCallback(async (text: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    const response = await summarizeDetailed(text, targetLang);
    return response.content || '';
  }, [summarizeDetailed]);

  const suggestReplyDetailed = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<AIResponse> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:suggestReply', emailContent, targetLang) as AIResponse;
      if (response.success && response.content !== undefined) return response;
      throw new Error(response.error || 'Reply suggestion failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const suggestReply = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    const response = await suggestReplyDetailed(emailContent, targetLang);
    return response.content || '';
  }, [suggestReplyDetailed]);

  const suggestActionsDetailed = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<AIResponse> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:suggestActions', emailContent, targetLang) as AIResponse;
      if (response.success && response.content !== undefined) return response;
      throw new Error(response.error || 'Action suggestion failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const suggestActions = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    const response = await suggestActionsDetailed(emailContent, targetLang);
    return response.content || '';
  }, [suggestActionsDetailed]);

  const suggestQuickRepliesDetailed = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<AIResponse> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:suggestQuickReplies', emailContent, targetLang) as AIResponse;
      if (response.success && response.content !== undefined) return response;
      throw new Error(response.error || 'Quick replies failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const suggestQuickReplies = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    const response = await suggestQuickRepliesDetailed(emailContent, targetLang);
    return response.content || '';
  }, [suggestQuickRepliesDetailed]);

  const extractKeyInfo = useCallback(async (emailContent: string | AIEmailSourcePayload, targetLang: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:extractKeyInfo', emailContent, targetLang) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Key info extraction failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const polish = useCallback(async (
    text: string,
    style: PolishStyle,
    targetLang?: string,
  ): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.invoke('ai:polish', text, style, targetLang) as AIResponse;
      if (response.success && response.content) {
        return response.content;
      }
      throw new Error(response.error || 'Text polishing failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const getContactKnowledgeSettings = useCallback(async (): Promise<ContactKnowledgeSettings> => {
    const response = await window.electronAPI.invoke('ai:getContactKnowledgeSettings') as {
      success: boolean;
      data?: ContactKnowledgeSettings;
      error?: string;
    };
    if (response.success && response.data) return response.data;
    throw new Error(response.error || 'Failed to load contact knowledge settings');
  }, []);

  const saveContactKnowledgeSettings = useCallback(async (settings: Partial<ContactKnowledgeSettings>): Promise<ContactKnowledgeSettings> => {
    const response = await window.electronAPI.invoke('ai:saveContactKnowledgeSettings', settings) as {
      success: boolean;
      data?: ContactKnowledgeSettings;
      error?: string;
    };
    if (response.success && response.data) return response.data;
    throw new Error(response.error || 'Failed to save contact knowledge settings');
  }, []);

  const getContactWiki = useCallback(async (request: { accountId: number; contactEmail: string }): Promise<ContactWiki | null> => {
    const response = await window.electronAPI.invoke('ai:getContactWiki', request) as {
      success: boolean;
      data?: ContactWiki | null;
      error?: string;
    };
    if (response.success) return response.data ?? null;
    throw new Error(response.error || 'Failed to load contact wiki');
  }, []);

  const buildContactWiki = useCallback(async (request: {
    accountId: number;
    contactEmail: string;
    contactName?: string;
    aliases?: string[];
    force?: boolean;
    targetLang?: string;
  }): Promise<ContactWiki> => {
    const response = await window.electronAPI.invoke('ai:buildContactWiki', request) as {
      success: boolean;
      data?: ContactWiki;
      error?: string;
    };
    if (response.success && response.data) return response.data;
    throw new Error(response.error || 'Failed to build contact wiki');
  }, []);

  const reindexContactKnowledge = useCallback(async (request: {
    accountId: number;
    contactEmail: string;
    contactName?: string;
    aliases?: string[];
    force?: boolean;
    targetLang?: string;
  }): Promise<{ sourceMailCount: number; chunkCount: number }> => {
    const response = await window.electronAPI.invoke('ai:reindexContactKnowledge', request) as {
      success: boolean;
      data?: { sourceMailCount: number; chunkCount: number };
      error?: string;
    };
    if (response.success && response.data) return response.data;
    throw new Error(response.error || 'Failed to reindex contact knowledge');
  }, []);

  const listContactKnowledgeStats = useCallback(async (request: { accountId: number }): Promise<ContactKnowledgeStats> => {
    const response = await window.electronAPI.invoke('ai:listContactKnowledgeStats', request) as {
      success: boolean;
      data?: ContactKnowledgeStats;
      error?: string;
    };
    if (response.success && response.data) return response.data;
    throw new Error(response.error || 'Failed to load contact knowledge stats');
  }, []);

  const saveContactWikiFeedback = useCallback(async (request: {
    accountId: number;
    contactEmail: string;
    target: 'wiki' | 'reply';
    rating: 'useful' | 'inaccurate' | 'not_relevant' | 'too_long' | 'too_formal' | 'too_short';
    reason?: string;
  }): Promise<void> => {
    const response = await window.electronAPI.invoke('ai:saveContactWikiFeedback', request) as {
      success: boolean;
      error?: string;
    };
    if (!response.success) throw new Error(response.error || 'Failed to save contact wiki feedback');
  }, []);

  const suggestContactReplyDetailed = useCallback(async (request: {
    accountId: number;
    contactEmail: string;
    mailId: string;
    aliases?: string[];
    instruction?: string;
    targetLang?: string;
  }): Promise<AIResponse> => {
    const response = await window.electronAPI.invoke('ai:contactReplySuggestion', request) as AIResponse;
    if (response.success && response.content !== undefined) return response;
    throw new Error(response.error || 'Contact reply suggestion failed');
  }, []);

  const suggestContactReply = useCallback(async (request: {
    accountId: number;
    contactEmail: string;
    mailId: string;
    aliases?: string[];
    instruction?: string;
    targetLang?: string;
  }): Promise<string> => {
    const response = await suggestContactReplyDetailed(request);
    return response.content || '';
  }, [suggestContactReplyDetailed]);

  const getContactBehaviorSettings = useCallback(async (): Promise<ContactBehaviorSettings> => {
    const response = await window.electronAPI.invoke('ai:getContactBehaviorSettings') as {
      success: boolean;
      data?: ContactBehaviorSettings;
      error?: string;
    };
    if (response.success && response.data) return response.data;
    throw new Error(response.error || 'Failed to load contact behavior settings');
  }, []);

  const saveContactBehaviorSettings = useCallback(async (settings: Partial<ContactBehaviorSettings>): Promise<ContactBehaviorSettings> => {
    const response = await window.electronAPI.invoke('ai:saveContactBehaviorSettings', settings) as {
      success: boolean;
      data?: ContactBehaviorSettings;
      error?: string;
    };
    if (response.success && response.data) return response.data;
    throw new Error(response.error || 'Failed to save contact behavior settings');
  }, []);

  const recordContactMailInteraction = useCallback(async (request: {
    accountId: number;
    mailId: string;
    contactEmail?: string;
    contactEmailHash?: string;
    eventType: string;
    eventValue?: Record<string, unknown>;
  }): Promise<void> => {
    const response = await window.electronAPI.invoke('ai:recordContactMailInteraction', request) as {
      success: boolean;
      error?: string;
    };
    if (!response.success) throw new Error(response.error || 'Failed to record contact interaction');
  }, []);

  return {
    config,
    loading,
    error,
    fetchConfig,
    saveConfig,
    translate,
    translateSegments,
    summarizeDetailed,
    summarize,
    suggestReplyDetailed,
    suggestReply,
    suggestActionsDetailed,
    suggestActions,
    suggestQuickRepliesDetailed,
    suggestQuickReplies,
    extractKeyInfo,
    polish,
    getContactKnowledgeSettings,
    saveContactKnowledgeSettings,
    getContactWiki,
    buildContactWiki,
    reindexContactKnowledge,
    listContactKnowledgeStats,
    saveContactWikiFeedback,
    suggestContactReplyDetailed,
    suggestContactReply,
    getContactBehaviorSettings,
    saveContactBehaviorSettings,
    recordContactMailInteraction,
  };
}
