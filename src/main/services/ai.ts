import log from 'electron-log';
import {
  deleteSecureSetting,
  deleteSetting,
  getSecureSetting,
  getSetting,
  setSecureSetting,
  setSetting,
} from '../database';
import { isEncryptionAvailable } from './crypto';
import {
  buildDeepScanPreview,
  type AiPrivacyMode,
  buildActionSuggestionsPrompt,
  buildKeyInfoPrompt,
  buildQuickRepliesPrompt,
  buildReplyPrompt,
  buildSummarizePrompt,
  buildTranslatePrompt,
  resolveIntelligentScanMode,
  type RequestedScanMode,
  type ScanPipelineResult,
  redactGithubMailEntities,
  redactSensitiveEntities,
  runScanPipeline,
  restoreSensitiveEntities,
  type RedactionMapEntry,
} from '../../shared/email-ai';

export interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type AIConfigProfileId = 'primary' | 'secondary';

export interface AIConfigProfile extends AIConfig {
  id: AIConfigProfileId;
  label: string;
}

export interface AIConfigSnapshot {
  activeProfileId: AIConfigProfileId;
  profiles: Record<AIConfigProfileId, AIConfigProfile>;
}

export interface AIRequest {
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export interface AITranslateSegmentsResponse {
  success: boolean;
  translations?: string[];
  error?: string;
}

export interface AIEmailSource {
  subject?: string;
  from?: string;
  from_name?: string;
  to?: string;
  cc?: string;
  date?: string | Date;
  body_html?: string;
  body_text?: string;
  snippet?: string;
  category?: string;
  scan_result?: string;
}

const DEFAULT_CONFIG: AIConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

function normalizeAIConfigProfileId(value: string | null): AIConfigProfileId {
  return value === 'secondary' ? 'secondary' : 'primary';
}

function getAIProfileSettingKey(profileId: AIConfigProfileId, field: keyof AIConfig): string {
  if (profileId === 'primary') {
    if (field === 'baseUrl') return 'ai_base_url';
    if (field === 'apiKey') return 'ai_api_key';
    return 'ai_model';
  }
  if (field === 'baseUrl') return 'ai_secondary_base_url';
  if (field === 'apiKey') return 'ai_secondary_api_key';
  return 'ai_secondary_model';
}

function getAIProfileApiKeyKey(profileId: AIConfigProfileId): string {
  return getAIProfileSettingKey(profileId, 'apiKey');
}

function migrateLegacyAIApiKey(profileId: AIConfigProfileId): string | null {
  const key = getAIProfileApiKeyKey(profileId);
  const legacyApiKey = getSetting(key);
  if (!legacyApiKey) return null;

  if (!isEncryptionAvailable()) {
    log.warn('Legacy AI API key could not be migrated because secure storage is unavailable', { profileId });
    return legacyApiKey;
  }

  setSecureSetting(key, legacyApiKey);
  deleteSetting(key);
  log.info('Migrated legacy AI API key to secure storage', { profileId });
  return legacyApiKey;
}

function getAIProfileApiKey(profileId: AIConfigProfileId): string {
  const key = getAIProfileApiKeyKey(profileId);
  const secureApiKey = getSecureSetting(key);
  if (secureApiKey) return secureApiKey;
  return migrateLegacyAIApiKey(profileId) || '';
}

export function initializeAISecretStorage(): void {
  for (const profileId of ['primary', 'secondary'] as const) {
    try {
      migrateLegacyAIApiKey(profileId);
    } catch (error) {
      log.error('Failed to initialize AI secret storage', {
        profileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function getAIConfigForProfile(profileId: AIConfigProfileId): AIConfigProfile {
  const baseUrl = getSetting(getAIProfileSettingKey(profileId, 'baseUrl'));
  const apiKey = getAIProfileApiKey(profileId);
  const model = getSetting(getAIProfileSettingKey(profileId, 'model'));
  return {
    id: profileId,
    label: profileId === 'primary' ? 'Profile A' : 'Profile B',
    baseUrl: baseUrl || DEFAULT_CONFIG.baseUrl,
    apiKey: apiKey || '',
    model: model || DEFAULT_CONFIG.model,
  };
}

export function getAIConfigSnapshot(): AIConfigSnapshot {
  const activeProfileId = normalizeAIConfigProfileId(getSetting('ai_active_profile'));
  return {
    activeProfileId,
    profiles: {
      primary: getAIConfigForProfile('primary'),
      secondary: getAIConfigForProfile('secondary'),
    },
  };
}

export function getAIConfig(): AIConfig {
  const snapshot = getAIConfigSnapshot();
  const activeProfile = snapshot.profiles[snapshot.activeProfileId];
  return {
    baseUrl: activeProfile.baseUrl,
    apiKey: activeProfile.apiKey,
    model: activeProfile.model,
  };
}

export function saveAIConfig(config: Partial<AIConfig> & { profileId?: AIConfigProfileId; activeProfileId?: AIConfigProfileId }): void {
  const profileId = config.profileId ?? normalizeAIConfigProfileId(getSetting('ai_active_profile'));
  const apiKeyKey = getAIProfileApiKeyKey(profileId);

  if (config.apiKey !== undefined) {
    const trimmedApiKey = config.apiKey.trim();
    if (trimmedApiKey) {
      try {
        setSecureSetting(apiKeyKey, trimmedApiKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to save AI API key securely. ${message}`);
      }
    } else {
      deleteSecureSetting(apiKeyKey);
      deleteSetting(apiKeyKey);
    }
  }

  if (config.baseUrl !== undefined) setSetting(getAIProfileSettingKey(profileId, 'baseUrl'), config.baseUrl);
  if (config.model !== undefined) setSetting(getAIProfileSettingKey(profileId, 'model'), config.model);
  if (config.activeProfileId !== undefined) setSetting('ai_active_profile', config.activeProfileId);
  log.info('AI config saved', { profileId, activeProfileId: config.activeProfileId });
}

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

function redactCloudTextDetailed(text: string): { text: string; redactionMap: RedactionMapEntry[] } {
  const result = redactSensitiveEntities(text);
  return {
    text: result.redactedText,
    redactionMap: result.redactionMap,
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
    const fromNameResult = value.from_name ? redactCloudTextDetailed(value.from_name) : null;

    return {
      value: {
        ...value,
        subject: subjectResult?.text ?? value.subject,
        from: fromResult?.text ?? value.from,
        from_name: fromNameResult?.text ?? value.from_name,
        body_html: undefined,
        body_text: githubResult.redactedText,
        snippet: githubResult.redactedText.slice(0, 240),
      },
      redactionMap: mergeRedactionMaps(
        subjectResult?.redactionMap ?? [],
        fromResult?.redactionMap ?? [],
        fromNameResult?.redactionMap ?? [],
        githubResult.redactionMap,
      ),
    };
  }

  const subjectResult = value.subject ? redactCloudTextDetailed(value.subject) : null;
  const fromResult = value.from ? redactCloudTextDetailed(value.from) : null;
  const fromNameResult = value.from_name ? redactCloudTextDetailed(value.from_name) : null;
  const bodyResult = mergedBody ? redactCloudTextDetailed(mergedBody) : null;
  const snippetResult = value.snippet ? redactCloudTextDetailed(value.snippet) : null;

  return {
    value: {
      ...value,
      subject: subjectResult?.text ?? value.subject,
      from: fromResult?.text ?? value.from,
      from_name: fromNameResult?.text ?? value.from_name,
      body_html: undefined,
      body_text: bodyResult?.text ?? value.body_text,
      snippet: snippetResult?.text ?? value.snippet,
    },
    redactionMap: mergeRedactionMaps(
      subjectResult?.redactionMap ?? [],
      fromResult?.redactionMap ?? [],
      fromNameResult?.redactionMap ?? [],
      bodyResult?.redactionMap ?? [],
      snippetResult?.redactionMap ?? [],
    ),
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
  if (!response.success || !response.content || redactionMap.length === 0) {
    return response;
  }

  return {
    ...response,
    content: restoreSensitiveEntities(response.content, redactionMap),
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

// 鈹€鈹€鈹€ AI HTTP Call 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export async function callAI(request: AIRequest): Promise<AIResponse> {
  const config = getAIConfig();

  if (!config.apiKey) return { success: false, error: 'API key not configured. Please set your AI API key in Settings.' };
  if (!config.baseUrl) return { success: false, error: 'API base URL not configured.' };

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          ...(request.system ? [{ role: 'system' as const, content: request.system }] : []),
          { role: 'user' as const, content: request.prompt },
        ],
        temperature: request.temperature ?? 0.1,
        max_tokens: request.maxTokens ?? 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) return { success: false, error: data.error.message || 'AI error' };

    const content = data.choices?.[0]?.message?.content;
    if (!content) return { success: false, error: 'No content in AI response' };

    return { success: true, content };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// 鈹€鈹€鈹€ Batch Classification 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export interface BatchClassifyResult {
  id: string;
  category: Category;
}

export interface BatchScanRoutingResult {
  id: string;
  routing: ScanPipelineResult;
}

const CLASSIFY_SYSTEM = `You are an email classification assistant. Classify each email into EXACTLY ONE of the following 6 categories ONLY:

- 通知类: System upgrades, password resets, meeting reminders, shipping updates, policy changes
- 广告/营销类: Promotions, discounts, new product announcements, newsletters, event invitations
- 账单/财务类: Invoices, payment reminders, payslips, subscription charges, tax notices
- 社交/个人类: Friend greetings, birthday wishes, wedding invitations, personal updates
- 工作/业务类: Project updates, contract signing, client inquiries, internal approvals
- 安全/风险类: Suspected phishing, abnormal login alerts, scam risk warnings

You MUST return ONLY a valid JSON array. No markdown formatting, no explanations, no conversational text. Example: [{"id":"1","category":"工作/业务类"},{"id":"2","category":"通知类"}]`;

const CLASSIFY_USER_LIGHT = (emails: Array<{ id: string; subject: string; from: string; from_name: string; has_attachment: boolean }>) => {
  const list = emails.map(e =>
    `id: ${e.id} | Subject: ${e.subject} | From: ${e.from_name} <${e.from}> | Attachment: ${e.has_attachment ? 'Yes' : 'No'}`
  ).join('\n');
  return `Classify each email below into one of the 6 categories. Return a JSON array with id and category fields:\n${list}`;
};

const CLASSIFY_USER_DEEP = (emails: Array<{ id: string; subject: string; from: string; from_name: string; has_attachment: boolean; body: string }>) => {
  const list = emails.map(e =>
    `id: ${e.id} | Subject: ${e.subject} | From: ${e.from_name} <${e.from}> | Attachment: ${e.has_attachment ? 'Yes' : 'No'}\nBody preview: ${e.body}`
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
    body_html?: string;
    body_text?: string;
    snippet: string;
  }>,
  scanMode: ScanMode = 'light',
): Promise<{ success: boolean; results?: BatchClassifyResult[]; routingResults?: BatchScanRoutingResult[]; failedIds?: string[]; error?: string }> {
  if (emails.length === 0) return { success: true, results: [] };

  const routingResults: BatchScanRoutingResult[] = [];

  const githubCompatibilityResults: BatchClassifyResult[] = [];
  const genericEmails = emails.filter((email) => {
    const routing = runScanPipeline({
      subject: email.subject,
      from: email.from,
      fromName: email.from_name,
      snippet: email.snippet,
      bodyHtml: email.body_html,
      bodyText: email.body_text,
      hasAttachments: email.has_attachment,
    });

    routingResults.push({ id: email.id, routing });
    if (routing.kind !== 'github') {
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
    });
    return false;
  });

  if (genericEmails.length === 0) {
    return { success: true, results: githubCompatibilityResults, routingResults };
  }

  const privacyMode = getAiPrivacyMode();
  const allResults: BatchClassifyResult[] = [...githubCompatibilityResults];
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
  const pushResult = (idValue: unknown, categoryValue: unknown) => {
    if (!idValue || !categoryValue) return;
    const id = String(idValue).trim();
    if (!id || foundIds.has(id)) return;
    results.push({ id, category: parseCategory(String(categoryValue)) });
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
        pushResult(item.id, item.category ?? item.label);
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
    system: 'You are a professional translator. Translate the following text to ' + targetLang + '. Only provide the translation.',
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
    bodyHtml: value.body_html,
    bodyText: value.body_text,
    snippet: value.snippet || '',
    category: value.category,
    scanResult: value.scan_result,
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
    const prepared = prepareCloudPromptInput(text);
    const response = await callAI({
      system: `You are a professional summarizer. Provide a concise summary of the following text in 3-5 sentences in ${targetLang}. Only output the summary in ${targetLang}.`,
      prompt: typeof prepared.value === 'string' ? prepared.value : text,
      temperature: 0.3,
      maxTokens: 500,
    });
    return restoreCloudAiResponse(response, prepared.redactionMap);
  }

  const prepared = prepareCloudPromptInput(text);
  const response = await callAI(buildSummarizePrompt(toPromptSource(prepared.value as AIEmailSource), targetLang));
  return restoreCloudAiResponse(response, prepared.redactionMap);
}

export async function suggestReply(emailContent: string | AIEmailSource, targetLang = 'English'): Promise<AIResponse> {
  if (!isStructuredEmailSource(emailContent)) {
    const prepared = prepareCloudPromptInput(emailContent);
    const response = await callAI({
      system: `You are an AI assistant helping to compose email replies in ${targetLang}. Only output the sendable reply body in ${targetLang}. Do not include summaries, action suggestions, priority, reason, timing, headings, or analysis notes.`,
      prompt: `Received email:\n${typeof prepared.value === 'string' ? prepared.value : emailContent}\n\nSuggested reply in ${targetLang}:`,
      temperature: 0.7,
      maxTokens: 1000,
    });
    return removeAssistantAnalysisFromReply(restoreCloudAiResponse(response, prepared.redactionMap));
  }

  const prepared = prepareCloudPromptInput(emailContent);
  const response = await callAI(buildReplyPrompt(toPromptSource(prepared.value as AIEmailSource), targetLang));
  return removeAssistantAnalysisFromReply(restoreCloudAiResponse(response, prepared.redactionMap));
}

export async function suggestEmailActions(emailContent: string | AIEmailSource, targetLang = 'English'): Promise<AIResponse> {
  if (!isStructuredEmailSource(emailContent)) {
    const prepared = prepareCloudPromptInput(emailContent);
    const response = await callAI({
      system: `You are an email triage assistant. Extract practical action suggestions in ${targetLang}. Return 1-4 concise bullet lines only.`,
      prompt: typeof prepared.value === 'string' ? prepared.value : emailContent,
      temperature: 0.25,
      maxTokens: 500,
    });
    return restoreCloudAiResponse(response, prepared.redactionMap);
  }

  const prepared = prepareCloudPromptInput(emailContent);
  const response = await callAI(buildActionSuggestionsPrompt(toPromptSource(prepared.value as AIEmailSource), targetLang));
  return restoreCloudAiResponse(response, prepared.redactionMap);
}

export async function suggestQuickReplies(emailContent: string | AIEmailSource, targetLang = 'English'): Promise<AIResponse> {
  if (!isStructuredEmailSource(emailContent)) {
    const prepared = prepareCloudPromptInput(emailContent);
    const response = await callAI({
      system: `Generate exactly 3 short email quick replies in ${targetLang}. Each option must be one line, ready to send, without numbering or markdown.`,
      prompt: typeof prepared.value === 'string' ? prepared.value : emailContent,
      temperature: 0.55,
      maxTokens: 500,
    });
    return restoreCloudAiResponse(response, prepared.redactionMap);
  }

  const prepared = prepareCloudPromptInput(emailContent);
  const response = await callAI(buildQuickRepliesPrompt(toPromptSource(prepared.value as AIEmailSource), targetLang));
  return restoreCloudAiResponse(response, prepared.redactionMap);
}

export async function extractKeyInfo(emailContent: string | AIEmailSource, targetLang = 'English'): Promise<AIResponse> {
  if (!isStructuredEmailSource(emailContent)) {
    const prepared = prepareCloudPromptInput(emailContent);
    const response = await callAI({
      system: `Extract key information from this email in ${targetLang}. Return up to 6 lines using "Label: Value" format. Do not invent missing fields.`,
      prompt: typeof prepared.value === 'string' ? prepared.value : emailContent,
      temperature: 0.2,
      maxTokens: 500,
    });
    return restoreCloudAiResponse(response, prepared.redactionMap);
  }

  const prepared = prepareCloudPromptInput(emailContent);
  const response = await callAI(buildKeyInfoPrompt(toPromptSource(prepared.value as AIEmailSource), targetLang));
  return restoreCloudAiResponse(response, prepared.redactionMap);
}

export async function polishText(
  text: string,
  style: 'formal' | 'friendly' | 'shorter' | 'longer',
  targetLang?: string,
): Promise<AIResponse> {
  const map: Record<string, string> = {
    formal: 'Make this text formal and professional.',
    friendly: 'Make this text friendly and casual.',
    shorter: 'Rewrite shorter and more concise.',
    longer: 'Expand with more relevant details.',
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
