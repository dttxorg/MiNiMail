import log from 'electron-log';
import { getSetting, setSetting } from '../database';
import {
  buildOpenAICompatibleRequestBody,
  buildSafeProviderDiagnostics,
  callAI,
  deleteModelProfile,
  deleteAIProviderProfile,
  fetchOpenAICompatibleModels,
  getAIConfig,
  getAIConfigSnapshot,
  getAIModelProfileConfigById,
  getAIModelProfileConfigForTask,
  getAIModelProfileSnapshot,
  getAIProviderAccountSnapshot,
  getAIProviderProfileSnapshot,
  getProviderAccountsWithModels,
  getProviderFriendlyMessage,
  initializeAISecretStorage,
  normalizeOpenAICompatibleEndpoint,
  normalizeOpenAICompatibleEmbeddingEndpoint,
  normalizeOpenAICompatibleModelListEndpoint,
  parseOpenAICompatibleModelList,
  parseOpenAICompatibleResponse,
  saveAIConfig,
  saveModelProfile,
  saveProviderAccount,
  saveAIProviderProfile,
  setDefaultModelProfile,
  setDefaultAIProviderProfile,
  summarizeOpenAICompatibleResponseStructure,
  summarizeProviderErrorForUi,
  testOpenAICompatibleConnection,
  type AIConfig,
  type AIConfigProfile,
  type AIConfigProfileId,
  type AIConfigSnapshot,
  type AIEmailSource,
  type AIProviderDiagnosticsOperation,
  type AIModelProfile,
  type AIModelProfileSnapshot,
  type AIProviderAccount,
  type AIProviderAccountWithModels,
  type AIProviderAccountsWithModelsSnapshot,
  type AIProviderAccountSnapshot,
  type AIProviderTestConnectionRequest,
  type AIProviderTestConnectionResult,
  type AIProviderModelListRequest,
  type AIProviderModelListResult,
  type AIProviderProfile,
  type AIProviderProfileSnapshot,
  type AIRequest,
  type AIResponse,
  type AIResponseMetadata,
  type AIActionSuggestionMetadata,
  type AIReplyCandidateMetadata,
  type AISummaryMetadata,
  type AITranslateSegmentsResponse,
  type SafeProviderDiagnostics,
  type SaveModelProfileInput,
  type SaveProviderAccountInput,
  type SaveProviderProfileInput,
} from './ai/index';
import {
  buildDeepScanPreview,
  type AiPrivacyMode,
  buildActionSuggestionsPrompt,
  buildKeyInfoPrompt,
  buildQuickRepliesPrompt,
  buildReplyPrompt,
  buildSummarizePrompt,
  buildTranslatePrompt,
  deriveEmailAIContext,
  type EmailAIContext,
  type EmailAIContextSource,
  type EmailAISenderType,
  resolveIntelligentScanMode,
  type RequestedScanMode,
  type ScanPipelineResult,
  redactGithubMailEntities,
  redactSensitiveEntities,
  runScanPipeline,
  restoreSensitiveEntities,
  type RedactionMapEntry,
} from '../../shared/email-ai';

export {
  buildOpenAICompatibleRequestBody,
  buildSafeProviderDiagnostics,
  callAI,
  deleteModelProfile,
  deleteAIProviderProfile,
  fetchOpenAICompatibleModels,
  getAIConfig,
  getAIConfigSnapshot,
  getAIModelProfileConfigById,
  getAIModelProfileConfigForTask,
  getAIModelProfileSnapshot,
  getAIProviderAccountSnapshot,
  getAIProviderProfileSnapshot,
  getProviderAccountsWithModels,
  getProviderFriendlyMessage,
  initializeAISecretStorage,
  normalizeOpenAICompatibleEndpoint,
  normalizeOpenAICompatibleEmbeddingEndpoint,
  normalizeOpenAICompatibleModelListEndpoint,
  parseOpenAICompatibleModelList,
  parseOpenAICompatibleResponse,
  saveAIConfig,
  saveModelProfile,
  saveProviderAccount,
  saveAIProviderProfile,
  setDefaultModelProfile,
  setDefaultAIProviderProfile,
  summarizeOpenAICompatibleResponseStructure,
  summarizeProviderErrorForUi,
  testOpenAICompatibleConnection,
};
export type {
  AIConfig,
  AIConfigProfile,
  AIConfigProfileId,
  AIConfigSnapshot,
  AIEmailSource,
  AIProviderDiagnosticsOperation,
  AIModelProfile,
  AIModelProfileSnapshot,
  AIProviderAccount,
  AIProviderAccountWithModels,
  AIProviderAccountsWithModelsSnapshot,
  AIProviderAccountSnapshot,
  AIProviderTestConnectionRequest,
  AIProviderTestConnectionResult,
  AIProviderModelListRequest,
  AIProviderModelListResult,
  AIProviderProfile,
  AIProviderProfileSnapshot,
  AIRequest,
  AIResponse,
  AITranslateSegmentsResponse,
  SafeProviderDiagnostics,
  SaveModelProfileInput,
  SaveProviderAccountInput,
  SaveProviderProfileInput,
};

// 鈹€鈹€鈹€ AI Settings 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export type ScanMode = RequestedScanMode;
export type LookbackRange = '3d' | '7d' | '1mo' | '6mo' | 'all';

export interface AISettings {
  autoSort: boolean;
  scanMode: ScanMode;
  lookback: LookbackRange;
  privacyMode: AiPrivacyMode;
}

export function getAISettings(): AISettings {
  const savedScanMode = getSetting('ai_scan_mode');
  const scanMode: ScanMode = savedScanMode === 'light' || savedScanMode === 'deep' || savedScanMode === 'smart'
    ? savedScanMode
    : 'smart';

  return {
    autoSort: getSetting('ai_auto_sort') === 'true',
    scanMode,
    lookback: (getSetting('ai_lookback') as LookbackRange) || '7d',
    privacyMode: (getSetting('ai_privacy_mode') as AiPrivacyMode) || 'cloud_redacted',
  };
}

export function saveAISettings(settings: Partial<AISettings>): void {
  if (settings.autoSort !== undefined) setSetting('ai_auto_sort', String(settings.autoSort));
  if (settings.scanMode !== undefined) setSetting('ai_scan_mode', settings.scanMode);
  if (settings.lookback !== undefined) setSetting('ai_lookback', settings.lookback);
  if (settings.privacyMode !== undefined) setSetting('ai_privacy_mode', settings.privacyMode);
  log.info('AI settings saved:', settings);
}

function getAiPrivacyMode(): AiPrivacyMode {
  return getAISettings().privacyMode;
}

function isLikelyGitHubMailSource(value: string | AIEmailSource): boolean {
  if (typeof value === 'string') {
    return /github\.com|notifications@github\.com|noreply@github\.com|\[[^/\]]+\/[^/\]]+\]/i.test(value);
  }

  const haystack = [
    value.subject,
    value.from,
    value.from_name,
    value.body_text,
    value.snippet,
  ].filter(Boolean).join('\n');

  return /github\.com|notifications@github\.com|noreply@github\.com|\[[^/\]]+\/[^/\]]+\]/i.test(haystack);
}

function redactCloudText(text: string): string {
  return redactSensitiveEntities(text).redactedText;
}

function mergeRedactionMaps(...maps: RedactionMapEntry[][]): RedactionMapEntry[] {
  const merged: RedactionMapEntry[] = [];
  for (const map of maps) {
    for (const entry of map) {
      if (merged.some((item) => item.type === entry.type && item.placeholder === entry.placeholder && item.original === entry.original)) {
        continue;
      }
      merged.push(entry);
    }
  }
  return merged;
}

function applyRedactionMapToText(text: string, redactionMap: RedactionMapEntry[]): string {
  return redactionMap
    .filter((entry) => entry.original)
    .sort((a, b) => b.original.length - a.original.length)
    .reduce((value, entry) => value.split(entry.original).join(entry.placeholder), text);
}

function redactCloudTextDetailed(text: string): { text: string; redactionMap: RedactionMapEntry[] } {
  const result = redactSensitiveEntities(text);
  return {
    text: result.redactedText,
    redactionMap: result.redactionMap,
  };
}

function redactCloudDisplayNameDetailed(text: string): { text: string; redactionMap: RedactionMapEntry[] } {
  const result = redactCloudTextDetailed(text);
  if (!text.trim() || result.text !== text || result.redactionMap.length > 0) return result;
  return {
    text: '[PERSON_FROM_1]',
    redactionMap: [{ type: 'PERSON', original: text, placeholder: '[PERSON_FROM_1]' }],
  };
}

function redactCloudEmailSource(value: AIEmailSource): AIEmailSource {
  return redactCloudEmailSourceDetailed(value).value;
}

function redactCloudEmailSourceDetailed(value: AIEmailSource): { value: AIEmailSource; redactionMap: RedactionMapEntry[] } {
  const isGitHub = isLikelyGitHubMailSource(value);
  const mergedBody = [value.body_text, value.snippet].filter(Boolean).join('\n\n').trim();

  if (isGitHub) {
    const githubResult = redactGithubMailEntities({
      subject: value.subject || '',
      plainText: mergedBody || value.body_text || value.snippet || '',
    });

    const subjectResult = value.subject ? redactCloudTextDetailed(value.subject) : null;
    const fromResult = value.from ? redactCloudTextDetailed(value.from) : null;
    const fromNameResult = value.from_name ? redactCloudDisplayNameDetailed(value.from_name) : null;
    const baseRedactionMap = mergeRedactionMaps(
      subjectResult?.redactionMap ?? [],
      fromResult?.redactionMap ?? [],
      fromNameResult?.redactionMap ?? [],
      githubResult.redactionMap,
    );
    const contactWikiContextResult = value.contactWikiContext
      ? redactCloudTextDetailed(applyRedactionMapToText(value.contactWikiContext, baseRedactionMap))
      : null;

    return {
      value: {
        ...value,
        subject: subjectResult?.text ?? value.subject,
        from: fromResult?.text ?? value.from,
        from_name: fromNameResult?.text ?? value.from_name,
        body_html: undefined,
        body_text: githubResult.redactedText,
        snippet: githubResult.redactedText.slice(0, 240),
        contactWikiContext: contactWikiContextResult?.text ?? value.contactWikiContext,
      },
      redactionMap: mergeRedactionMaps(baseRedactionMap, contactWikiContextResult?.redactionMap ?? []),
    };
  }

  const subjectResult = value.subject ? redactCloudTextDetailed(value.subject) : null;
  const fromResult = value.from ? redactCloudTextDetailed(value.from) : null;
  const fromNameResult = value.from_name ? redactCloudDisplayNameDetailed(value.from_name) : null;
  const bodyResult = mergedBody ? redactCloudTextDetailed(mergedBody) : null;
  const snippetResult = value.snippet ? redactCloudTextDetailed(value.snippet) : null;
  const baseRedactionMap = mergeRedactionMaps(
    subjectResult?.redactionMap ?? [],
    fromResult?.redactionMap ?? [],
    fromNameResult?.redactionMap ?? [],
    bodyResult?.redactionMap ?? [],
    snippetResult?.redactionMap ?? [],
  );
  const contactWikiContextResult = value.contactWikiContext
    ? redactCloudTextDetailed(applyRedactionMapToText(value.contactWikiContext, baseRedactionMap))
    : null;

  return {
    value: {
      ...value,
      subject: subjectResult?.text ?? value.subject,
      from: fromResult?.text ?? value.from,
      from_name: fromNameResult?.text ?? value.from_name,
      body_html: undefined,
      body_text: bodyResult?.text ?? value.body_text,
      snippet: snippetResult?.text ?? value.snippet,
      contactWikiContext: contactWikiContextResult?.text ?? value.contactWikiContext,
    },
    redactionMap: mergeRedactionMaps(baseRedactionMap, contactWikiContextResult?.redactionMap ?? []),
  };
}

function maybeRedactForCloud(value: string | AIEmailSource): string | AIEmailSource {
  if (getAiPrivacyMode() !== 'cloud_redacted') {
    return value;
  }

  return typeof value === 'string' ? redactCloudText(value) : redactCloudEmailSource(value);
}

function prepareCloudPromptInput(value: string | AIEmailSource): { value: string | AIEmailSource; redactionMap: RedactionMapEntry[] } {
  if (getAiPrivacyMode() !== 'cloud_redacted') {
    return { value, redactionMap: [] };
  }

  if (typeof value === 'string') {
    const result = redactCloudTextDetailed(value);
    return { value: result.text, redactionMap: result.redactionMap };
  }

  return redactCloudEmailSourceDetailed(value);
}

function restoreCloudAiResponse(response: AIResponse, redactionMap: RedactionMapEntry[]): AIResponse {
  if (!response.success || redactionMap.length === 0) {
    return response;
  }

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

function removeAssistantAnalysisFromReply(response: AIResponse): AIResponse {
  if (!response.success || !response.content) return response;

  const forbiddenHeading = /^(邮件总结|行动建议|快速回复|关键信息|Email summary|Action suggestions|Quick replies|Key information|Priority|Reason|Timing)\s*[:：]/i;
  const lines = response.content
    .split(/\r?\n/)
    .filter((line) => !forbiddenHeading.test(line.trim()));
  const content = lines.join('\n').trim();
  return content ? { ...response, content } : response;
}

function stripJsonFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObjectPayload(raw: string): string {
  const cleaned = stripJsonFence(raw);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(extractJsonObjectPayload(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function coerceUrgency(value: unknown): 'now' | 'today' | 'later' | 'none' {
  return value === 'now' || value === 'today' || value === 'later' || value === 'none'
    ? value
    : 'none';
}

function localizedNoReplyMessage(targetLang = 'English'): string {
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

function noReplyAIResponse(context: EmailAIContext, targetLang = 'English'): AIResponse {
  const message = localizedNoReplyMessage(targetLang);
  const noReplyContext: EmailAIContext = {
    ...context,
    replyNeeded: false,
    overlays: {
      ...context.overlays,
      replyNeeded: false,
    },
  };
  return {
    success: true,
    content: message,
    metadata: {
      ...contextMetadata(noReplyContext),
      senderType: noReplyContext.senderType,
      replyNeeded: false,
      replyNeededReason: noReplyContext.replyNeededReason,
      noReplyMessage: message,
      quickReplies: [],
      replyCandidates: [],
    },
  };
}

function contextMetadata(context: EmailAIContext): Pick<AIResponseMetadata, 'senderType' | 'inboxClass' | 'messageScenario' | 'overlays' | 'replyNeeded' | 'replyNeededReason'> {
  return {
    senderType: context.senderType,
    inboxClass: context.inboxClass,
    messageScenario: context.messageScenario,
    overlays: context.overlays,
    replyNeeded: context.replyNeeded,
    replyNeededReason: context.replyNeededReason,
  };
}

function localizedNoActionSuggestionMessage(targetLang = 'English'): string {
  const messages: Record<string, string> = {
    Chinese: '暂无明确行动建议',
    English: 'No clear action suggestions',
    Japanese: '明確なアクション提案はありません',
    Korean: '명확한 작업 제안이 없습니다',
    Spanish: 'No hay sugerencias de acción claras',
    French: 'Aucune suggestion d’action claire',
    German: 'Keine klaren Handlungsvorschläge',
    Russian: 'Нет четких рекомендаций к действию',
  };
  return messages[targetLang] || messages.English;
}

function parseSummaryMetadata(raw: string): AISummaryMetadata {
  const parsed = parseJsonObject(raw);
  const keyFacts = Array.isArray(parsed?.keyFacts)
    ? parsed.keyFacts.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
    : [];
  return {
    what: String(parsed?.what || raw).trim().slice(0, 800),
    impact: typeof parsed?.impact === 'string' && parsed.impact.trim() ? parsed.impact.trim().slice(0, 600) : null,
    action: typeof parsed?.action === 'string' && parsed.action.trim() ? parsed.action.trim().slice(0, 500) : null,
    keyFacts,
    urgency: coerceUrgency(parsed?.urgency),
  };
}

function formatSummaryMetadata(summary: AISummaryMetadata, targetLang = 'English'): string {
  const labels: Record<string, { what: string; impact: string; action: string; keyFacts: string }> = {
    Chinese: { what: '邮件内容', impact: '对我的意义', action: '建议动作', keyFacts: '关键信息' },
    English: { what: 'What', impact: 'Impact', action: 'Action', keyFacts: 'Key facts' },
    Japanese: { what: '内容', impact: '自分への影響', action: '推奨対応', keyFacts: '重要情報' },
    Korean: { what: '내용', impact: '나에게 미치는 영향', action: '권장 조치', keyFacts: '핵심 정보' },
    Spanish: { what: 'Qué dice', impact: 'Impacto', action: 'Acción', keyFacts: 'Datos clave' },
    French: { what: 'Contenu', impact: 'Impact', action: 'Action', keyFacts: 'Infos clés' },
    German: { what: 'Inhalt', impact: 'Auswirkung', action: 'Aktion', keyFacts: 'Wichtige Fakten' },
    Russian: { what: 'Суть', impact: 'Значение', action: 'Действие', keyFacts: 'Ключевые факты' },
  };
  const label = labels[targetLang] || labels.English;
  return [
    `${label.what}: ${summary.what}`,
    summary.impact ? `${label.impact}: ${summary.impact}` : '',
    summary.action ? `${label.action}: ${summary.action}` : '',
    summary.keyFacts.length > 0 ? `${label.keyFacts}: ${summary.keyFacts.join('; ')}` : '',
  ].filter(Boolean).join('\n');
}

function parseActionMetadata(raw: string, context: EmailAIContext): { actions: AIActionSuggestionMetadata[]; urgency: 'now' | 'today' | 'later' | 'none'; parseStatus: 'parsed' | 'fallback' } {
  const parsed = parseJsonObject(raw);
  const allowed = new Set(context.allowedActionIntents);
  const actions = Array.isArray(parsed?.actions)
    ? parsed.actions
        .map((item): AIActionSuggestionMetadata | null => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const intent = typeof record.intent === 'string' && allowed.has(record.intent as AIActionSuggestionMetadata['intent'])
            ? record.intent as AIActionSuggestionMetadata['intent']
            : null;
          const type = record.type === 'primary' || record.type === 'secondary' || record.type === 'dismiss'
            ? record.type
            : 'secondary';
          const label = String(record.label || '').trim();
          if (!label || !intent) return null;
          return {
            label: label.slice(0, 160),
            type,
            intent,
            evidence: String(record.evidence || '').trim().slice(0, 240),
          };
        })
        .filter((item): item is AIActionSuggestionMetadata => Boolean(item))
        .slice(0, 4)
    : [];
  return {
    actions,
    urgency: coerceUrgency(parsed?.urgency),
    parseStatus: parsed && Array.isArray(parsed.actions) && actions.length > 0 ? 'parsed' : 'fallback',
  };
}

function formatActionMetadata(actions: AIActionSuggestionMetadata[], fallback: string): string {
  if (actions.length === 0) return fallback.trim();
  return actions.map((action) => {
    const detail = action.evidence ? ` — ${action.evidence}` : '';
    return `${action.label}${detail}`;
  }).join('\n');
}

function parseReplyCandidates(raw: string): { replyNeeded: boolean; candidates: AIReplyCandidateMetadata[] } {
  const parsed = parseJsonObject(raw);
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
  if (candidates.length === 0 && raw.trim() && replyNeeded) {
    candidates.push({ style: 'best', body: stripJsonFence(raw).trim() });
  }
  return { replyNeeded, candidates };
}

function parseQuickReplyArray(raw: string): string[] {
  const cleaned = extractJsonArrayPayload(raw);
  const normalizeItem = (item: unknown): string => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const value = record.text ?? record.reply ?? record.body ?? record.content ?? record.label ?? record.value;
      return typeof value === 'string' ? value.trim() : '';
    }
    return '';
  };
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeItem).filter(Boolean).slice(0, 3);
    }
  } catch {
    // Fall back to the previous plain-line behavior.
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildClassificationBodyPreview(email: {
  subject: string;
  from: string;
  from_name: string;
  body_html?: string;
  body_text?: string;
  snippet: string;
}): string {
  return buildDeepScanPreview({
    subject: email.subject,
    from: email.from,
    fromName: email.from_name,
    bodyHtml: email.body_html,
    bodyText: email.body_text,
    snippet: email.snippet,
  });
}

// 鈹€鈹€鈹€ 6-Category Parser 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const CATEGORIES = [
  '通知类',
  '广告/营销类',
  '账单/财务类',
  '社交/个人类',
  '工作/业务类',
  '安全/风险类',
] as const;

type Category = typeof CATEGORIES[number];

function normalizeCategory(raw: string): Category {
  const lower = raw.toLowerCase().trim();

  // Direct matches
  if (lower.includes('通知')) return '通知类';
  if (lower.includes('广告') || lower.includes('营销') || lower.includes('promotion') || lower.includes('促销')) return '广告/营销类';
  if (lower.includes('账单') || lower.includes('财务') || lower.includes('发票') || lower.includes('billing')) return '账单/财务类';
  if (lower.includes('社交') || lower.includes('个人') || lower.includes('social') || lower.includes('朋友') || lower.includes('生日') || lower.includes('婚礼')) return '社交/个人类';
  if (lower.includes('工作') || lower.includes('业务') || lower.includes('project') || lower.includes('合同') || lower.includes('客户') || lower.includes('审批')) return '工作/业务类';
  if (lower.includes('安全') || lower.includes('风险') || lower.includes('钓鱼') || lower.includes('诈骗') || lower.includes('异常登录') || lower.includes('spam')) return '安全/风险类';

  return '通知类';
}

function parseCategory(raw: string): Category {
  if (!raw || typeof raw !== 'string') return '通知类';

  const trimmed = raw.trim();

  // Attempt 1: direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    const vals = Object.values(parsed);
    for (const v of vals) {
      if (typeof v === 'string') {
        const cat = normalizeCategory(v);
        if (CATEGORIES.includes(cat as Category)) return cat as Category;
      }
    }
    // Also try nested id+category pairs in arrays
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === 'object') {
          const vals2 = Object.values(item);
          for (const v of vals2) {
            if (typeof v === 'string') {
              const cat = normalizeCategory(v);
              if (CATEGORIES.includes(cat as Category)) return cat as Category;
            }
          }
        }
      }
    }
  } catch {
    // not JSON, continue with regex
  }

  // Attempt 2: regex JSON extraction 鈥?find category value
  const patterns = [
    /"category"\s*:\s*"([^"]+)"/,
    /"label"\s*:\s*"([^"]+)"/,
    /category["\s:]+([^",\s}]+)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const cat = normalizeCategory(match[1]);
      if (CATEGORIES.includes(cat as Category)) return cat as Category;
    }
  }

  // Attempt 3: fuzzy keyword fallback
  return normalizeCategory(trimmed.slice(0, 50));
}

// 鈹€鈹€鈹€ Batch Classification 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export interface BatchClassifyResult {
  id: string;
  category: Category;
  senderType?: EmailAISenderType;
  inboxClass?: string;
  messageScenario?: string;
  replyNeeded?: boolean;
  confidence?: number;
  source?: 'local_rule' | 'llm' | 'github';
}

export interface BatchScanRoutingResult {
  id: string;
  routing: ScanPipelineResult;
}

function categoryFromSenderType(senderType: EmailAISenderType, fallback: Category = '通知类'): Category {
  switch (senderType) {
    case 'marketing':
    case 'newsletter':
      return '广告/营销类';
    case 'community_feedback':
      return '通知类';
    case 'personal':
      return '社交/个人类';
    case 'work_contact':
      return '工作/业务类';
    case 'vendor':
      return /invoice|billing|payment|账单|财务|发票/i.test(fallback) ? '账单/财务类' : '通知类';
    case 'system_notification':
      return '通知类';
    default:
      return fallback;
  }
}

function localPreClassifyEmail(email: {
  id: string;
  subject: string;
  from: string;
  from_name: string;
  headers?: Record<string, string | string[] | undefined>;
  body_text?: string;
  body_html?: string;
  snippet: string;
}): BatchClassifyResult | null {
  const context = deriveEmailAIContext({
    subject: email.subject,
    from: email.from,
    fromName: email.from_name,
    headers: email.headers,
    bodyText: email.body_text || email.snippet,
    bodyHtml: email.body_html,
    snippet: email.snippet,
  });
  const fromBlob = `${email.from_name || ''} ${email.from || ''}`;
  const headerBlob = Object.entries(email.headers || {})
    .map(([key, value]) => `${key}:${Array.isArray(value) ? value.join(',') : value || ''}`)
    .join('\n');
  const strongLocalSignal =
    /\bno-?reply\b|mailer-daemon|postmaster/i.test(fromBlob) ||
    /list-unsubscribe|list-id/i.test(headerBlob) ||
    ((context.senderType === 'marketing' || context.senderType === 'newsletter') &&
      (context.senderTypeSource === 'address' || context.senderTypeSource === 'headers')) ||
    (context.senderType === 'system_notification' &&
      context.senderTypeSource === 'address' &&
      context.senderTypeConfidence >= 0.72);

  if (!strongLocalSignal) return null;
  return {
    id: email.id,
    category: categoryFromSenderType(context.senderType),
    senderType: context.senderType,
    inboxClass: context.inboxClass,
    messageScenario: context.messageScenario,
    replyNeeded: context.replyNeeded,
    confidence: context.senderTypeConfidence,
    source: 'local_rule',
  };
}

const CLASSIFY_SYSTEM = `You are an email classification assistant. Classify each email into EXACTLY ONE of the following 6 categories ONLY:

- 通知类: System upgrades, password resets, meeting reminders, shipping updates, policy changes
- 广告/营销类: Promotions, discounts, new product announcements, newsletters, event invitations
- 账单/财务类: Invoices, payment reminders, payslips, subscription charges, tax notices
- 社交/个人类: Friend greetings, birthday wishes, wedding invitations, personal updates
- 工作/业务类: Project updates, contract signing, client inquiries, internal approvals
- 安全/风险类: Suspected phishing, abnormal login alerts, scam risk warnings

Also return senderType and replyNeeded when the evidence is clear. senderType must be one of: personal, work_contact, marketing, newsletter, vendor, system_notification, unknown.
Set replyNeeded=false for no-reply, marketing, newsletter, community/forum relays, bulk list, delivery failures, and pure system notifications. Do not create a polite-reply need for those messages.
When useful, also return inboxClass and messageScenario. inboxClass must be one of: primary, transactions, updates, promotions, community, other. messageScenario must be one of: human_request, security_alert, verification, billing_statement, receipt_or_order, shipping_or_travel, calendar_scheduling, promotion_deal, newsletter_update, community_feedback, delivery_failure, dev_notification, generic_update.

You MUST return ONLY a valid JSON array. No markdown formatting, no explanations, no conversational text. Example: [{"id":"1","category":"工作/业务类","senderType":"work_contact","replyNeeded":true,"confidence":0.72,"inboxClass":"primary","messageScenario":"human_request"},{"id":"2","category":"通知类","senderType":"system_notification","replyNeeded":false,"confidence":0.84,"inboxClass":"transactions","messageScenario":"security_alert"}]`;

const CLASSIFY_USER_LIGHT = (emails: Array<{ id: string; subject: string; from: string; from_name: string; has_attachment: boolean; header_signals?: string }>) => {
  const list = emails.map(e =>
    `id: ${e.id} | Subject: ${e.subject} | From: ${e.from_name} <${e.from}> | Attachment: ${e.has_attachment ? 'Yes' : 'No'} | Header signals: ${e.header_signals || 'None'}`
  ).join('\n');
  return `Classify each email below into one of the 6 categories. Return a JSON array with id and category fields:\n${list}`;
};

const CLASSIFY_USER_DEEP = (emails: Array<{ id: string; subject: string; from: string; from_name: string; has_attachment: boolean; header_signals?: string; body: string }>) => {
  const list = emails.map(e =>
    `id: ${e.id} | Subject: ${e.subject} | From: ${e.from_name} <${e.from}> | Attachment: ${e.has_attachment ? 'Yes' : 'No'} | Header signals: ${e.header_signals || 'None'}\nBody preview: ${e.body}`
  ).join('\n\n---\n\n');
  return `Classify each email below into one of the 6 categories. Return a JSON array with id and category fields:\n${list}`;
};

export async function batchClassifyMails(
  emails: Array<{
    id: string;
    subject: string;
    from: string;
    from_name: string;
    has_attachment: boolean;
    headers?: Record<string, string | string[] | undefined>;
    body_html?: string;
    body_text?: string;
    snippet: string;
  }>,
  scanMode: ScanMode = 'light',
): Promise<{ success: boolean; results?: BatchClassifyResult[]; routingResults?: BatchScanRoutingResult[]; failedIds?: string[]; error?: string }> {
  if (emails.length === 0) return { success: true, results: [] };

  const routingResults: BatchScanRoutingResult[] = [];

  const githubCompatibilityResults: BatchClassifyResult[] = [];
  const localRuleResults: BatchClassifyResult[] = [];
  const genericEmails = emails.filter((email) => {
    const routing = runScanPipeline({
      subject: email.subject,
      from: email.from,
      fromName: email.from_name,
      snippet: email.snippet,
      bodyHtml: email.body_html,
      bodyText: email.body_text,
      hasAttachments: email.has_attachment,
      headers: email.headers,
    });

    routingResults.push({ id: email.id, routing });
    if (routing.kind !== 'github') {
      const local = localPreClassifyEmail(email);
      if (local) {
        localRuleResults.push(local);
        return false;
      }
      return true;
    }

    let category: Category = '通知类';
    if (routing.github.event_type === 'security_alert') {
      category = '安全/风险类';
    } else if (
      routing.github.event_type === 'review_requested' ||
      routing.github.event_type === 'assigned_issue' ||
      routing.github.event_type === 'mention' ||
      routing.github.event_type === 'pull_request_update' ||
      routing.github.event_type === 'issue_update'
    ) {
      category = '工作/业务类';
    } else if (routing.github.event_type === 'workflow_failure') {
      category = '工作/业务类';
    }

    githubCompatibilityResults.push({
      id: email.id,
      category,
      senderType: 'system_notification',
      inboxClass: 'updates',
      messageScenario: routing.github.event_type === 'security_alert' ? 'security_alert' : 'dev_notification',
      replyNeeded: false,
      confidence: 0.9,
      source: 'github',
    });
    return false;
  });

  if (genericEmails.length === 0) {
    return { success: true, results: [...githubCompatibilityResults, ...localRuleResults], routingResults };
  }

  const privacyMode = getAiPrivacyMode();
  const allResults: BatchClassifyResult[] = [...githubCompatibilityResults, ...localRuleResults];
  const failedIds: string[] = [];

  const genericEmailModes = genericEmails.map((email) => {
    const routing = routingResults.find((entry) => entry.id === email.id)?.routing;
    return {
      email,
      effectiveMode: routing ? resolveIntelligentScanMode(routing, scanMode) : scanMode,
    };
  });

  const groupedGenericEmails = {
    light: genericEmailModes.filter((entry) => entry.effectiveMode === 'light').map((entry) => entry.email),
    deep: genericEmailModes.filter((entry) => entry.effectiveMode === 'deep').map((entry) => entry.email),
  } as const;

  const buildPreparedEmails = (
    emailsForMode: typeof genericEmails,
    mode: 'light' | 'deep',
  ) => emailsForMode.map((e) => {
    const body = mode === 'deep'
      ? buildClassificationBodyPreview(e)
      : '';
    const redactedSource = privacyMode === 'cloud_redacted'
      ? redactCloudEmailSource({
          subject: e.subject,
          from: e.from,
          from_name: e.from_name,
          body_html: e.body_html,
          body_text: e.body_text,
          snippet: e.snippet,
        })
      : null;

    return {
      id: e.id,
      subject: redactedSource?.subject || e.subject,
      from: redactedSource?.from || e.from,
      from_name: redactedSource?.from_name || e.from_name,
      has_attachment: e.has_attachment,
      header_signals: [
        e.headers?.['list-unsubscribe'] || e.headers?.['List-Unsubscribe'] ? 'list-unsubscribe' : '',
        e.headers?.['list-id'] || e.headers?.['List-ID'] ? 'list-id' : '',
        e.headers?.precedence || e.headers?.Precedence ? `precedence=${e.headers?.precedence || e.headers?.Precedence}` : '',
        e.headers?.['reply-to'] || e.headers?.['Reply-To'] ? 'reply-to' : '',
      ].filter(Boolean).join(', '),
      body: mode === 'deep' ? (redactedSource?.body_text || body) : '',
    };
  });

  const processChunks = async (
    preparedEmails: ReturnType<typeof buildPreparedEmails>,
    mode: 'light' | 'deep',
  ) => {
    const batchSize = mode === 'deep' ? 10 : 50;
    const chunks: typeof preparedEmails[] = [];
    for (let i = 0; i < preparedEmails.length; i += batchSize) {
      chunks.push(preparedEmails.slice(i, i + batchSize));
    }

    log.info(`[batchClassifyMails] processing ${preparedEmails.length} generic emails in ${chunks.length} chunks (mode=${mode}, batch=${batchSize})`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const userPrompt = mode === 'deep'
        ? CLASSIFY_USER_DEEP(chunk as Array<{ id: string; subject: string; from: string; from_name: string; has_attachment: boolean; body: string }>)
        : CLASSIFY_USER_LIGHT(chunk as Array<{ id: string; subject: string; from: string; from_name: string; has_attachment: boolean }>);

      let response = await callAI({
        system: CLASSIFY_SYSTEM,
        prompt: userPrompt,
        temperature: 0.1,
        maxTokens: 2000,
      });

      if (!response.success || !response.content) {
        log.warn(`[batchClassifyMails] ${mode} chunk ${i + 1}/${chunks.length} failed, retrying: ${response.error}`);
        await new Promise(r => setTimeout(r, 1000));
        response = await callAI({
          system: CLASSIFY_SYSTEM,
          prompt: userPrompt,
          temperature: 0.1,
          maxTokens: 2000,
        });
      }

      if (!response.success || !response.content) {
        log.warn(`[batchClassifyMails] ${mode} chunk ${i + 1}/${chunks.length} permanently failed after retry: ${response.error}`);
        failedIds.push(...chunk.map(c => c.id));
        continue;
      }

      const raw = response.content.trim();
      const { results: parsedResults, missingIds } = extractCategoryResults(raw, chunk.map(c => c.id));
      allResults.push(...parsedResults);
      if (missingIds.length > 0) {
        failedIds.push(...missingIds);
      }
      log.info(`[batchClassifyMails] ${mode} chunk ${i + 1}/${chunks.length}: parsed ${parsedResults.length} results, ${missingIds.length} missing`);
    }
  };

  log.info(
    `[batchClassifyMails] ${genericEmails.length} generic emails + ${githubCompatibilityResults.length} github emails ` +
      `鈫?light=${groupedGenericEmails.light.length}, deep=${groupedGenericEmails.deep.length} (requested=${scanMode})`
  );

  await processChunks(buildPreparedEmails(groupedGenericEmails.light, 'light'), 'light');
  await processChunks(buildPreparedEmails(groupedGenericEmails.deep, 'deep'), 'deep');

  return { success: true, results: allResults, routingResults, failedIds: failedIds.length > 0 ? failedIds : undefined };
}

function extractCategoryResults(raw: string, expectedIds: string[]): { results: BatchClassifyResult[]; missingIds: string[] } {
  const results: BatchClassifyResult[] = [];
  const foundIds = new Set<string>();
  const normalizeSenderType = (value: unknown): EmailAISenderType | undefined => {
    const raw = String(value || '').trim();
    return raw === 'personal' || raw === 'work_contact' || raw === 'marketing' || raw === 'newsletter' ||
      raw === 'vendor' || raw === 'system_notification' || raw === 'community_feedback' || raw === 'unknown'
      ? raw
      : undefined;
  };
  const normalizeInboxClass = (value: unknown): string | undefined => {
    const raw = String(value || '').trim();
    return raw === 'primary' || raw === 'transactions' || raw === 'updates' || raw === 'promotions' || raw === 'community' || raw === 'other'
      ? raw
      : undefined;
  };
  const normalizeMessageScenario = (value: unknown): string | undefined => {
    const raw = String(value || '').trim();
    return raw === 'human_request' || raw === 'security_alert' || raw === 'verification' || raw === 'billing_statement' ||
      raw === 'receipt_or_order' || raw === 'shipping_or_travel' || raw === 'calendar_scheduling' ||
      raw === 'promotion_deal' || raw === 'newsletter_update' || raw === 'community_feedback' ||
      raw === 'delivery_failure' || raw === 'dev_notification' || raw === 'generic_update'
      ? raw
      : undefined;
  };
  const pushResult = (idValue: unknown, categoryValue: unknown, item?: Record<string, unknown>) => {
    if (!idValue || !categoryValue) return;
    const id = String(idValue).trim();
    if (!id || foundIds.has(id)) return;
    const senderType = normalizeSenderType(item?.senderType ?? item?.sender_type);
    results.push({
      id,
      category: parseCategory(String(categoryValue)),
      senderType,
      inboxClass: normalizeInboxClass(item?.inboxClass ?? item?.inbox_class),
      messageScenario: normalizeMessageScenario(item?.messageScenario ?? item?.message_scenario),
      replyNeeded: typeof item?.replyNeeded === 'boolean'
        ? item.replyNeeded
        : typeof item?.reply_needed === 'boolean'
          ? item.reply_needed
          : undefined,
      confidence: typeof item?.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : undefined,
      source: 'llm',
    });
    foundIds.add(id);
  };

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const collections = Array.isArray(parsed)
      ? [parsed]
      : [parsed?.results, parsed?.items, parsed?.data].filter(Array.isArray);

    for (const collection of collections) {
      for (const item of collection as Array<{ id?: unknown; category?: unknown; label?: unknown }>) {
        if (!item || typeof item !== 'object') continue;
        pushResult(item.id, item.category ?? item.label, item as Record<string, unknown>);
      }
    }

    if (results.length > 0) {
      const missing = expectedIds.filter(id => !foundIds.has(id));
      return { results, missingIds: missing };
    }
  } catch {
    // not valid JSON, continue with fallback parsers
  }

  const pairs = cleaned.matchAll(/\{[^}]*?"id"\s*:\s*"?([^",}]+)"?[^}]*?"category"\s*:\s*"([^"]+)"[^}]*\}/g);
  for (const match of pairs) {
    pushResult(match[1], match[2]);
  }

  const linePairs = cleaned.matchAll(/id\s*[:=]\s*([^\s|,;]+)[\s|,;]+(?:category|label)\s*[:=]\s*([^\n|,;]+)/gi);
  for (const match of linePairs) {
    pushResult(match[1], match[2]);
  }

  const missing = expectedIds.filter(id => !foundIds.has(id));
  return { results, missingIds: missing };
}

// 鈹€鈹€鈹€ Other AI Helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export async function translateText(text: string, targetLang: string): Promise<AIResponse> {
  const prepared = prepareCloudPromptInput(text);
  const response = await callAI({
    system: [
      `You are a professional translator. Translate the following text to ${targetLang}.`,
      'Do not translate brand names, product names, company names, order/ticket/invoice/reference numbers, URLs, code, email addresses, phone numbers, or placeholders.',
      'Preserve tone and register. Only provide the translation.',
    ].join(' '),
    prompt: typeof prepared.value === 'string' ? prepared.value : text,
    temperature: 0.3,
    maxTokens: 2000,
  });
  return restoreCloudAiResponse(response, prepared.redactionMap);
}

function isStructuredEmailSource(value: string | AIEmailSource): value is AIEmailSource {
  return typeof value === 'object' && value !== null;
}

function toPromptSource(value: AIEmailSource) {
  return {
    subject: value.subject || '',
    from: value.from || '',
    fromName: value.from_name || '',
    to: value.to,
    cc: value.cc,
    date: value.date,
    messageId: value.messageId,
    inReplyTo: value.inReplyTo,
    references: value.references,
    headers: value.headers,
    bodyHtml: value.body_html,
    bodyText: value.body_text,
    snippet: value.snippet || '',
    category: value.category,
    scanResult: value.scan_result,
    senderType: value.senderType,
    replyNeeded: value.replyNeeded,
    contactWikiContext: value.contactWikiContext,
  };
}

function plainTextToEmailSource(text: string): AIEmailSource {
  return {
    subject: '',
    from: '',
    from_name: '',
    body_text: text,
    snippet: text.slice(0, 240),
  };
}

function deriveContextFromEmailSource(value: AIEmailSource): EmailAIContext {
  return deriveEmailAIContext(toPromptSource(value) as EmailAIContextSource);
}

function withDerivedContext(
  source: ReturnType<typeof toPromptSource>,
  context: EmailAIContext,
): ReturnType<typeof toPromptSource> {
  return {
    ...source,
    senderType: context.senderType,
    replyNeeded: context.replyNeeded,
  };
}

export async function translateTextInput(value: string | AIEmailSource, targetLang: string): Promise<AIResponse> {
  if (!isStructuredEmailSource(value)) {
    return translateText(value, targetLang);
  }

  const prepared = prepareCloudPromptInput(value);
  const response = await callAI(buildTranslatePrompt(toPromptSource(prepared.value as AIEmailSource), targetLang));
  return restoreCloudAiResponse(response, prepared.redactionMap);
}

function extractJsonArrayPayload(raw: string): string {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

export async function translateTextSegments(segments: string[], targetLang: string): Promise<AITranslateSegmentsResponse> {
  if (segments.length === 0) {
    return { success: true, translations: [] };
  }

  const serialized = JSON.stringify(segments);
  const prepared = prepareCloudPromptInput(serialized);
  const response = await callAI({
    system: [
      `You are a professional translator. Translate each item in the JSON array into ${targetLang}.`,
      'Return ONLY a valid JSON array of translated strings in the exact same order and same length.',
      'Preserve placeholders such as [LINK_1], [URL_1], [EMAIL_1], [PHONE_1], [NAME_1] exactly as-is.',
      'Do not translate brand names, product names, company names, order/ticket/invoice/reference numbers, URLs, code, email addresses, or phone numbers.',
      'Preserve the tone and register of each segment.',
      'Do not output markdown, explanations, or code fences.',
    ].join(' '),
    prompt: typeof prepared.value === 'string' ? prepared.value : serialized,
    temperature: 0.1,
    maxTokens: Math.max(1200, Math.min(4000, segments.join('\n').length * 3)),
  });

  if (!response.success || !response.content) {
    return { success: false, error: response.error || 'Segment translation failed' };
  }

  const cleaned = extractJsonArrayPayload(response.content);

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      return { success: false, error: 'Translated segment payload was not a JSON array' };
    }

    const translations = parsed.map((item) => String(item));
    if (translations.length !== segments.length) {
      return { success: false, error: 'Translated segment count mismatch' };
    }

    return {
      success: true,
      translations: translations.map((item) => restoreSensitiveEntities(item, prepared.redactionMap)),
    };
  } catch (error) {
    return { success: false, error: `Failed to parse translated segments: ${(error as Error).message}` };
  }
}

export async function summarizeText(text: string | AIEmailSource, targetLang = 'English'): Promise<AIResponse> {
  if (!isStructuredEmailSource(text)) {
    return summarizeText(plainTextToEmailSource(text), targetLang);
  }

  const context = deriveContextFromEmailSource(text);
  const prepared = prepareCloudPromptInput(text);
  const promptSource = withDerivedContext(toPromptSource(prepared.value as AIEmailSource), context);
  const response = await callAI(buildSummarizePrompt(promptSource, targetLang));
  if (!response.success || !response.content) return restoreCloudAiResponse(response, prepared.redactionMap);
  const summary = parseSummaryMetadata(response.content);
  return restoreCloudAiResponse({
    ...response,
    content: formatSummaryMetadata(summary, targetLang),
    metadata: {
      ...response.metadata,
      ...contextMetadata(context),
      summary,
    },
  }, prepared.redactionMap);
}

export async function suggestReply(emailContent: string | AIEmailSource, targetLang = 'English'): Promise<AIResponse> {
  if (!isStructuredEmailSource(emailContent)) {
    return suggestReply(plainTextToEmailSource(emailContent), targetLang);
  }

  const context = deriveContextFromEmailSource(emailContent);
  const prepared = prepareCloudPromptInput(emailContent);
  if (!context.replyNeeded) {
    return noReplyAIResponse(context, targetLang);
  }
  const promptSource = withDerivedContext(toPromptSource(prepared.value as AIEmailSource), context);
  const response = await callAI(buildReplyPrompt(promptSource, targetLang));
  if (!response.success || !response.content) return restoreCloudAiResponse(response, prepared.redactionMap);
  const parsed = parseReplyCandidates(response.content);
  if (!parsed.replyNeeded || parsed.candidates.length === 0) {
    return noReplyAIResponse({ ...context, replyNeeded: false, replyNeededReason: 'model returned no reply needed' }, targetLang);
  }
  const preferred = parsed.candidates.find((candidate) => candidate.style === 'best') || parsed.candidates[0];
  return removeAssistantAnalysisFromReply(restoreCloudAiResponse({
    ...response,
    content: preferred.body,
    metadata: {
      ...response.metadata,
      ...contextMetadata({ ...context, replyNeeded: true, overlays: { ...context.overlays, replyNeeded: true } }),
      replyCandidates: parsed.candidates,
    },
  }, prepared.redactionMap));
}

export async function suggestEmailActions(emailContent: string | AIEmailSource, targetLang = 'English'): Promise<AIResponse> {
  if (!isStructuredEmailSource(emailContent)) {
    return suggestEmailActions(plainTextToEmailSource(emailContent), targetLang);
  }

  const context = deriveContextFromEmailSource(emailContent);
  const prepared = prepareCloudPromptInput(emailContent);
  const promptSource = withDerivedContext(toPromptSource(prepared.value as AIEmailSource), context);
  const response = await callAI(buildActionSuggestionsPrompt(promptSource, targetLang));
  if (!response.success || !response.content) return restoreCloudAiResponse(response, prepared.redactionMap);
  const parsed = parseActionMetadata(response.content, context);
  const fallback = localizedNoActionSuggestionMessage(targetLang);
  return restoreCloudAiResponse({
    ...response,
    content: formatActionMetadata(parsed.actions, fallback),
    metadata: {
      ...response.metadata,
      ...contextMetadata(context),
      actions: parsed.actions,
      urgency: parsed.urgency,
      parseStatus: parsed.parseStatus,
    },
  }, prepared.redactionMap);
}

export async function suggestQuickReplies(emailContent: string | AIEmailSource, targetLang = 'English'): Promise<AIResponse> {
  if (!isStructuredEmailSource(emailContent)) {
    return suggestQuickReplies(plainTextToEmailSource(emailContent), targetLang);
  }

  const context = deriveContextFromEmailSource(emailContent);
  const prepared = prepareCloudPromptInput(emailContent);
  if (!context.replyNeeded || context.allowedQuickReplyIntents.length === 0) {
    return noReplyAIResponse(context, targetLang);
  }
  const promptSource = withDerivedContext(toPromptSource(prepared.value as AIEmailSource), context);
  const response = await callAI(buildQuickRepliesPrompt(promptSource, targetLang));
  if (!response.success || !response.content) return restoreCloudAiResponse(response, prepared.redactionMap);
  const quickReplies = parseQuickReplyArray(response.content);
  return restoreCloudAiResponse({
    ...response,
    content: quickReplies.join('\n'),
    metadata: {
      ...response.metadata,
      ...contextMetadata(context),
      quickReplies,
    },
  }, prepared.redactionMap);
}

function keyInfoJsonSystemInstruction(targetLang: string): string {
  return [
    `Return all user-facing text in the current app language: ${targetLang}.`,
    'Return one JSON object only. Do not wrap it in markdown.',
    'Use these stable English JSON keys only: keyInfo, action, evidence, time, link.',
    'Do not translate JSON keys. Translate only the values.',
    'If a field is unavailable, use an empty string for that field.',
    'For bounce or delivery-failure emails, never treat mailer-daemon, postmaster, or MAILER-DAEMON as the original target recipient. Extract the failed recipient from Final-Recipient, Original-Recipient, Diagnostic-Code, failed recipient, or recipient address rejected fields. If it cannot be found, say to check the original recipient address.',
  ].join(' ');
}

function keyInfoLooksChinese(value: string): boolean {
  return /关键信息|行动|依据|时间|链接|[\u4e00-\u9fff]/.test(value);
}

function shouldCorrectKeyInfoLanguage(response: AIResponse, targetLang: string): response is AIResponse & { content: string } {
  return response.success
    && Boolean(response.content?.trim())
    && targetLang !== 'Chinese'
    && keyInfoLooksChinese(response.content || '');
}

async function correctKeyInfoLanguageIfNeeded(response: AIResponse, targetLang: string): Promise<AIResponse> {
  if (!shouldCorrectKeyInfoLanguage(response, targetLang)) return response;

  const corrected = await callAI({
    system: [
      keyInfoJsonSystemInstruction(targetLang),
      'Rewrite the provided key-information JSON values into the current app language.',
      'Preserve facts exactly. Do not add new facts. Do not translate JSON keys.',
    ].join(' '),
    prompt: response.content,
    temperature: 0.1,
    maxTokens: 500,
  });

  return corrected.success && corrected.content?.trim() ? corrected : response;
}

export async function extractKeyInfo(emailContent: string | AIEmailSource, targetLang = 'English'): Promise<AIResponse> {
  if (!isStructuredEmailSource(emailContent)) {
    const prepared = prepareCloudPromptInput(emailContent);
    const response = await callAI({
      system: [
        'You extract high-signal key information from emails.',
        keyInfoJsonSystemInstruction(targetLang),
        'Prioritize required action, failed recipient, deadline, account or service affected, security/billing risk, amount, order/reference id, link purpose, project/repo, assignee, or decision needed.',
        'Do not invent missing fields.',
      ].join(' '),
      prompt: typeof prepared.value === 'string' ? prepared.value : emailContent,
      temperature: 0.2,
      maxTokens: 500,
    });
    const corrected = await correctKeyInfoLanguageIfNeeded(response, targetLang);
    return restoreCloudAiResponse(corrected, prepared.redactionMap);
  }

  const context = deriveContextFromEmailSource(emailContent);
  const prepared = prepareCloudPromptInput(emailContent);
  const promptSource = withDerivedContext(toPromptSource(prepared.value as AIEmailSource), context);
  const response = await callAI(buildKeyInfoPrompt(promptSource, targetLang));
  const corrected = await correctKeyInfoLanguageIfNeeded(response, targetLang);
  return restoreCloudAiResponse({
    ...corrected,
    metadata: {
      ...corrected.metadata,
      ...contextMetadata(context),
    },
  }, prepared.redactionMap);
}

export async function polishText(
  text: string,
  style: 'formal' | 'friendly' | 'shorter' | 'longer' | 'proofread' | 'simplify' | 'bullet_points',
  targetLang?: string,
): Promise<AIResponse> {
  const map: Record<string, string> = {
    formal: 'Make this text formal and professional.',
    friendly: 'Make this text friendly and casual.',
    shorter: 'Rewrite shorter and more concise.',
    longer: 'Expand only using information already present in the text. Do not add new facts, assumptions, examples, dates, names, or commitments.',
    proofread: 'Proofread only: fix spelling, grammar, punctuation, and obvious typos without changing meaning, tone, structure, or facts.',
    simplify: 'Simplify the wording and reduce sentence complexity while preserving all facts, tone, and commitments.',
    bullet_points: 'Rewrite the text as clear bullet points while preserving all facts and not adding new information.',
  };
  const languageInstruction = targetLang
    ? `Write the rewritten email in ${targetLang}.`
    : 'Preserve the original language of the input. Do not switch languages.';
  const prepared = prepareCloudPromptInput(text);
  const response = await callAI({
    system: `You are an AI assistant improving email writing. ${map[style]} ${languageInstruction} Only output the rewritten text.`,
    prompt: typeof prepared.value === 'string' ? prepared.value : text,
    temperature: 0.7,
    maxTokens: 2000,
  });
  return restoreCloudAiResponse(response, prepared.redactionMap);
}
