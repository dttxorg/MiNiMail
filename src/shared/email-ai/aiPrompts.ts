import { buildEmailAiSnapshot, type MailLikeForAi } from './fromBodies';
import { deriveEmailAIContext, type EmailAIContext, type EmailAIContextSource } from './aiContext';

export type EmailAiPromptSource = MailLikeForAi;

export interface BuiltAiPrompt {
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

function buildSnapshot(source: EmailAiPromptSource) {
  return buildEmailAiSnapshot(source);
}

function buildContext(source: EmailAiPromptSource): EmailAIContext {
  return deriveEmailAIContext(source as EmailAIContextSource);
}

function contactWikiSystemInstruction(): string {
  return 'Contact Wiki context, when supplied, is private background memory about the sender relationship and past patterns. The current email evidence has priority: never use Wiki context to override the current email, invent missing facts, or decide that an action exists when the current email does not support it.';
}

function formatContactWikiContext(source: EmailAiPromptSource): string {
  return (source.contactWikiContext || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 14)
    .join('\n') || 'None';
}

function formatLinks(source: ReturnType<typeof buildSnapshot>['actionView']['links']): string {
  return source
    .map((link) => [link.text, link.url].filter(Boolean).join(' - '))
    .filter(Boolean)
    .join('\n');
}

function strictTargetLanguageInstruction(targetLang: string): string {
  const localizedLabels: Record<string, string> = {
    Chinese: '处理级别, 行动, 依据, 时间, 邮件总结, 行动建议, 快速回复, 关键信息',
    English: 'handling level, action, evidence, timing, email summary, action suggestions, quick replies, key information',
    Japanese: '対応レベル, 対応, 根拠, 期限, メール要約, アクション提案, クイック返信, 重要情報',
    Korean: '처리 수준, 조치, 근거, 기한, 메일 요약, 작업 제안, 빠른 답장, 핵심 정보',
    Spanish: 'nivel de gestión, acción, evidencia, plazo, resumen del correo, sugerencias de acción, respuestas rápidas, información clave',
    French: 'niveau de traitement, action, preuve, délai, résumé du mail, suggestions d’action, réponses rapides, informations clés',
    German: 'Bearbeitungsstufe, Aktion, Beleg, Zeitpunkt, E-Mail-Zusammenfassung, Handlungsvorschläge, Schnellantworten, wichtige Informationen',
    Russian: 'уровень обработки, действие, основание, срок, сводка письма, рекомендации, быстрые ответы, ключевая информация',
  };

  const labels = localizedLabels[targetLang] || localizedLabels.English;
  return `All user-facing output must be natural ${targetLang}. Do not use English labels unless ${targetLang} is English. Use localized labels such as ${labels}. Do not mix languages except for original names, product names, code, URLs, or quoted text from the email.`;
}

function keyInfoJsonInstruction(targetLang: string): string {
  return [
    `Return all user-facing text in the current app language: ${targetLang}.`,
    'Return one JSON object only. Do not wrap it in markdown.',
    'Use these stable English JSON keys only: keyInfo, action, evidence, time, link.',
    'Do not translate JSON keys. Translate only the values.',
    'If a field is not available, use an empty string for that field.',
  ].join(' ');
}

function getHandlingLevel(score: number, targetLang: string): string {
  const labels: Record<string, [string, string, string, string]> = {
    Chinese: ['无需处理', '可稍后处理', '需要跟进', '需要尽快处理'],
    English: ['No action', 'Optional later', 'Follow up', 'Act soon'],
    Japanese: ['対応不要', '後で対応可', 'フォローが必要', '早めに対応'],
    Korean: ['조치 불필요', '나중에 처리 가능', '후속 조치 필요', '빠른 처리 필요'],
    Spanish: ['Sin acción', 'Opcional más tarde', 'Seguimiento necesario', 'Actuar pronto'],
    French: ['Aucune action', 'Optionnel plus tard', 'Suivi requis', 'Agir bientôt'],
    German: ['Keine Aktion', 'Später optional', 'Nachfassen', 'Bald handeln'],
    Russian: ['Действий не нужно', 'Можно позже', 'Нужно уточнить', 'Действовать скоро'],
  };
  const selected = labels[targetLang] || labels.English;
  if (score <= 2) return selected[0];
  if (score <= 5) return selected[1];
  if (score <= 8) return selected[2];
  return selected[3];
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function buildActionScoringContext(source: EmailAiPromptSource, snapshot: ReturnType<typeof buildSnapshot>, targetLang: string) {
  const category = source.category || 'Unclassified';
  const scanResult = source.scanResult || 'None';
  const combined = [
    source.subject,
    source.from,
    source.fromName,
    source.snippet,
    snapshot.actionView.latestReply,
    snapshot.parsed.plainText,
  ].filter(Boolean).join('\n').toLowerCase();

  const isMarketing = /广告|营销|ads|marketing|promotion|newsletter|unsubscribe/i.test(category) ||
    includesAny(combined, [/\bunsubscribe\b/i, /\bnewsletter\b/i, /\bpromotion\b/i]);
  const isSecurity = /安全|风险|security|risk/i.test(category) ||
    includesAny(combined, [/\bsecurity\b/i, /\bsuspicious\b/i, /\bverify\b/i, /\boauth\b/i, /\bssh key\b/i]);
  const isFinance = /账单|财务|billing|finance/i.test(category) ||
    snapshot.actionView.amounts.length > 0 ||
    includesAny(combined, [/\binvoice\b/i, /\bpayment\b/i, /\bbilling\b/i]);
  const hasExplicitRequest = snapshot.actionView.actions.length > 0 ||
    includesAny(combined, [
      /\bplease\s+(reply|respond|confirm|approve|review|sign|verify|pay|submit)\b/i,
      /\baction required\b/i,
      /\brequires?\s+(your\s+)?(response|approval|confirmation|review|signature)\b/i,
    ]);
  const hasDeadline = snapshot.actionView.deadlines.length > 0 ||
    includesAny(combined, [/\btoday\b/i, /\btomorrow\b/i, /\basap\b/i, /\bby\s+\d{1,2}(:\d{2})?\b/i]);
  const hasActionLink = snapshot.actionView.links.length > 0 ||
    includesAny(combined, [/\bhttps?:\/\//i, /\[url_\d+\]/i, /\[link_\d+\]/i]);
  const senderLooksPersonal = Boolean(source.from) &&
    !includesAny(String(source.from), [/\bno-?reply\b/i, /\bnewsletter\b/i, /\bmarketing\b/i]);

  const scoreParts = {
    explicit_request: hasExplicitRequest ? 3 : 0,
    deadline_or_time_pressure: hasDeadline ? 2 : 0,
    security_or_account_risk: isSecurity ? 2 : 0,
    financial_or_transactional_impact: isFinance ? 2 : 0,
    sender_relationship_signal: senderLooksPersonal && !isMarketing ? 1 : 0,
    actionable_link_or_placeholder: hasActionLink ? 1 : 0,
    marketing_passive_penalty: isMarketing && !isSecurity && !isFinance && !hasExplicitRequest ? -2 : 0,
  };
  const score = Math.max(0, Math.min(10, Object.values(scoreParts).reduce((sum, value) => sum + value, 0)));

  const categoryGuidance = isMarketing
    ? 'Marketing email: default to no action or optional later unless there is a real account, billing, security, deadline, or user-requested task.'
    : isSecurity
      ? 'Security/risk email: verify whether the account action is legitimate before suggesting any risky action.'
      : isFinance
        ? 'Billing/finance email: focus on payment state, amount, due date, and account impact.'
        : 'Use the existing AI category as context; do not override it unless the email evidence clearly contradicts it.';

  return {
    category,
    scanResult,
    score,
    level: getHandlingLevel(score, targetLang),
    categoryGuidance,
    scoreBreakdown: Object.entries(scoreParts)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n'),
  };
}
/**
 * Build a translation request using the newest meaningful mail content instead of raw thread text.
 */
export function buildTranslatePrompt(source: EmailAiPromptSource, targetLang: string): BuiltAiPrompt {
  const snapshot = buildSnapshot(source);
  const focusText = snapshot.summaryView.latestReply || snapshot.parsed.plainText || source.snippet || '';

  return {
    system: [
      `You are a professional translator. Translate the email content into ${targetLang}.`,
      'Preserve paragraphs, list structure, dates, amounts, link text, placeholders, and quoted formatting.',
      'Do not translate brand names, product names, company names, order/ticket/invoice/reference numbers, URLs, code, email addresses, phone numbers, or placeholders such as [LINK_1], [URL_1], [EMAIL_1], [PHONE_1], [NAME_1].',
      'Preserve tone and register: if the original is formal, translate formally; if it is casual, translate casually. Do not upgrade or downgrade the relationship tone.',
      'Only provide the translation.',
    ].join(' '),
    prompt: [
      `Subject: ${source.subject || '(No subject)'}`,
      '',
      'Email content:',
      focusText,
    ].join('\n'),
    temperature: 0.2,
    maxTokens: 2000,
  };
}

/**
 * Build a summary request that emphasizes the newest reply and preserves action context.
 */
export function buildSummarizePrompt(source: EmailAiPromptSource, targetLang = 'English'): BuiltAiPrompt {
  const snapshot = buildSnapshot(source);
  const context = buildContext(source);

  return {
    system: [
      `You are a professional email summarizer. Return one strict JSON object only in ${targetLang}. No markdown.`,
      strictTargetLanguageInstruction(targetLang),
      contactWikiSystemInstruction(),
      'Use stable English JSON keys only: what, impact, action, keyFacts, urgency.',
      'Schema: { "what": string, "impact": string|null, "action": string|null, "keyFacts": string[] <=6, "urgency": "now"|"today"|"later"|"none" }.',
      'For long threads, summarize the latest progress first instead of retelling the whole thread.',
      'For marketing/newsletter emails, impact must answer whether it is worth reading, and action may only be read/ignore/unsubscribe in natural language.',
      'For system notifications, focus on account/service impact and concrete user action. If no action is needed, set action to null.',
      'Ignore signature, disclaimer, unsubscribe footer, CTA copy, and redundant quoted history unless it adds essential context.',
      'Do not invent actions, facts, dates, amounts, or urgency.',
    ].join(' '),
    prompt: [
      `Subject: ${source.subject || '(No subject)'}`,
      `Sender type: ${context.senderType}`,
      `Reply needed: ${context.replyNeeded ? 'yes' : 'no'} (${context.replyNeededReason})`,
      '',
      'Contact Wiki context (background, not current email evidence):',
      formatContactWikiContext(source),
      '',
      'Latest reply:',
      snapshot.summaryView.latestReply || snapshot.parsed.plainText || source.snippet || '(No body)',
      '',
      'Action items:',
      snapshot.actionView.actions.join('\n') || 'None',
      '',
      'Deadlines:',
      snapshot.actionView.deadlines.join('\n') || 'None',
      '',
      'Amounts:',
      snapshot.actionView.amounts.join('\n') || 'None',
      '',
      'Quoted context:',
      snapshot.replyView.quotedHistory || 'None',
    ].join('\n'),
    temperature: 0.3,
    maxTokens: 600,
  };
}

/**
 * Build a reply-suggestion request that keeps newest content separate from quoted history.
 */
export function buildReplyPrompt(source: EmailAiPromptSource, targetLang = 'English'): BuiltAiPrompt {
  const snapshot = buildSnapshot(source);
  const context = buildContext(source);

  return {
    system: [
      `You are an AI assistant helping draft email replies. Return one strict JSON object only in ${targetLang}. No markdown.`,
      strictTargetLanguageInstruction(targetLang),
      contactWikiSystemInstruction(),
      'Use stable English JSON keys only: replyNeeded, candidates.',
      'Schema: { "replyNeeded": boolean, "candidates": [{ "style": "short"|"formal"|"best", "body": string }] }.',
      'Generate exactly 3 candidate reply drafts only when replyNeeded=true: short/direct (<=60 characters when possible), formal/complete, and best-fit for the sender type and scene.',
      'Do not translate or summarize the incoming email. Draft actual replies that the user could send.',
      'Never include analysis headings or assistant sections such as email summary, action suggestions, quick replies, key information, priority, reason, timing, or bullet-point triage notes.',
      'Use the quoted history only as supporting context. Address concrete requests, deadlines, links, approvals, or questions from the latest message.',
      'If Reply needed is no, do not draft a polite acknowledgement. Return { "replyNeeded": false, "candidates": [] }.',
      'For work_contact, best-fit should focus on commitments and dates. For personal, best-fit should be warm but not over-familiar.',
    ].join(' '),
    prompt: [
      `Subject: ${source.subject || '(No subject)'}`,
      `From: ${source.fromName || source.from || '(Unknown sender)'}`,
      `Sender type: ${context.senderType}`,
      `Reply needed: ${context.replyNeeded ? 'yes' : 'no'} (${context.replyNeededReason})`,
      '',
      'Contact Wiki context (background, not current email evidence):',
      formatContactWikiContext(source),
      '',
      'Suggested opening:',
      snapshot.replyView.suggestedOpening,
      '',
      'Latest reply:',
      snapshot.replyView.latestReply || snapshot.parsed.plainText || source.snippet || '(No body)',
      '',
      'Quoted history:',
      snapshot.replyView.quotedHistory || 'None',
      '',
      'Action items to consider:',
      snapshot.actionView.actions.join('\n') || 'None',
    ].join('\n'),
    temperature: 0.7,
    maxTokens: 1000,
  };
}

export function buildActionSuggestionsPrompt(source: EmailAiPromptSource, targetLang = 'English'): BuiltAiPrompt {
  const snapshot = buildSnapshot(source);
  const actionContext = buildActionScoringContext(source, snapshot, targetLang);
  const context = buildContext(source);

  return {
    system: [
      `You are a senior email triage assistant. Return one strict JSON object only in ${targetLang}. No markdown.`,
      strictTargetLanguageInstruction(targetLang),
      contactWikiSystemInstruction(),
      'Use the supplied deterministic Action score and handling level. Stable mapping: 0-2 no action, 3-5 optional later, 6-8 follow up, 9-10 act soon.',
      'Use stable English JSON keys only: actions, urgency.',
      'Schema: { "actions": [{ "label": string, "type": "primary"|"secondary"|"dismiss", "intent": "reply"|"archive"|"unsubscribe"|"read"|"external_link"|"none", "evidence": string }], "urgency": "now"|"today"|"later"|"none" }.',
      'Return 1-4 actions. Labels and evidence must be concise and user-facing.',
      `Allowed intents for this email: ${context.allowedActionIntents.join(', ')}. Do not output any other intent.`,
      context.replyNeeded ? '' : 'Reply intent is forbidden because replyNeeded=false.',
      'Do not output free-form High/Medium/Low priority labels. Do not re-score differently from the supplied Action score unless the email evidence is explicitly contradictory.',
      'Avoid generic advice such as "read the email" or "reply if needed". If no real action is needed, say that clearly and explain why.',
      'Use the email context, link placeholders, deadlines, security/billing signals, and sender relationship. If a URL is redacted to a placeholder, treat it as a real actionable link but do not guess the hidden URL.',
      'Do not invent actions that are not supported by the email.',
    ].join(' '),
    prompt: [
      `Subject: ${source.subject || '(No subject)'}`,
      `From: ${source.fromName || source.from || '(Unknown sender)'}`,
      source.date ? `Date: ${new Date(source.date).toISOString()}` : '',
      `AI category: ${actionContext.category}`,
      `Stored scan result: ${actionContext.scanResult}`,
      `Sender type: ${context.senderType}`,
      `Reply needed: ${context.replyNeeded ? 'yes' : 'no'} (${context.replyNeededReason})`,
      `Action score: ${actionContext.score}/10`,
      `Handling level: ${actionContext.level}`,
      '',
      'Contact Wiki context (background, not current email evidence):',
      formatContactWikiContext(source),
      'Score breakdown:',
      actionContext.scoreBreakdown,
      'Category guidance:',
      actionContext.categoryGuidance,
      '',
      'Latest reply:',
      snapshot.actionView.latestReply || snapshot.parsed.plainText || source.snippet || '(No body)',
      '',
      'Detected action items:',
      snapshot.actionView.actions.join('\n') || 'None',
      '',
      'Detected deadlines:',
      snapshot.actionView.deadlines.join('\n') || 'None',
      '',
      'Detected amounts:',
      snapshot.actionView.amounts.join('\n') || 'None',
      '',
      'Detected links:',
      formatLinks(snapshot.actionView.links) || 'None',
    ].join('\n'),
    temperature: 0.25,
    maxTokens: 500,
  };
}

export function buildQuickRepliesPrompt(source: EmailAiPromptSource, targetLang = 'English'): BuiltAiPrompt {
  const snapshot = buildSnapshot(source);
  const context = buildContext(source);
  const intentInstruction = context.allowedQuickReplyIntents.length > 0
    ? `Use exactly these intent families once each when possible: ${context.allowedQuickReplyIntents.join(', ')}.`
    : 'No quick replies are allowed for this email. Return an empty JSON array.';

  return {
    system: [
      `You are an email assistant. Return one strict JSON array only in ${targetLang}. No markdown.`,
      strictTargetLanguageInstruction(targetLang),
      contactWikiSystemInstruction(),
      'Each item must be one ready-to-send quick reply string, without numbering or markdown.',
      'Generate exactly 3 distinct options only when quick replies are allowed.',
      intentInstruction,
      'Do not reuse the same generic wording across emails. Reflect the sender, request, deadline, and risk level from the email.',
      'For marketing/newsletter/system notification/no-reply senders, return [] and do not draft replies.',
    ].join(' '),
    prompt: [
      `Subject: ${source.subject || '(No subject)'}`,
      `From: ${source.fromName || source.from || '(Unknown sender)'}`,
      source.date ? `Date: ${new Date(source.date).toISOString()}` : '',
      `Sender type: ${context.senderType}`,
      `Reply needed: ${context.replyNeeded ? 'yes' : 'no'} (${context.replyNeededReason})`,
      '',
      'Contact Wiki context (background, not current email evidence):',
      formatContactWikiContext(source),
      '',
      'Latest reply:',
      snapshot.replyView.latestReply || snapshot.parsed.plainText || source.snippet || '(No body)',
      '',
      'Quoted context:',
      snapshot.replyView.quotedHistory || 'None',
      '',
      'Action items to address:',
      snapshot.actionView.actions.join('\n') || 'None',
      '',
      'Deadlines and amounts:',
      [
        ...snapshot.actionView.deadlines.map((item) => `Deadline: ${item}`),
        ...snapshot.actionView.amounts.map((item) => `Amount: ${item}`),
      ].join('\n') || 'None',
    ].join('\n'),
    temperature: 0.55,
    maxTokens: 500,
  };
}

export function buildKeyInfoPrompt(source: EmailAiPromptSource, targetLang = 'English'): BuiltAiPrompt {
  const snapshot = buildSnapshot(source);

  return {
    system: [
      `You extract high-signal key information from emails.`,
      keyInfoJsonInstruction(targetLang),
      contactWikiSystemInstruction(),
      'Prioritize actionable facts: required action, deadline, account or service affected, security/billing risk, amount, order/reference id, link purpose, project/repo, assignee, or decision needed.',
      'Use Contact Wiki context only to interpret sender role and recurring patterns. For system/security senders, extract the affected account/service, risk, required verification, and safe next action. For community feedback senders, extract feedback theme, missing feature, criticism/praise, and suggested next action from the current email body. For marketing/newsletter senders, extract deal/deadline/reading value only when present, and do not turn sender copy into user preference.',
      'Do not fill the output with obvious metadata like subject or received time unless it is the actual key event. If there is no meaningful key information, set keyInfo to a natural-language "no meaningful key information" message in the target language and keep other unavailable fields empty.',
      'For bounce or delivery-failure emails, never treat mailer-daemon, postmaster, or MAILER-DAEMON as the original target recipient. Extract the failed recipient from Final-Recipient, Original-Recipient, Diagnostic-Code, failed recipient, or recipient address rejected fields. If it cannot be found, say to check the original recipient address.',
      'Do not invent fields.',
    ].join(' '),
    prompt: [
      `Subject: ${source.subject || '(No subject)'}`,
      `From: ${source.fromName || source.from || '(Unknown sender)'}`,
      source.to ? `To: ${source.to}` : '',
      source.date ? `Date: ${new Date(source.date).toISOString()}` : '',
      '',
      'Contact Wiki context (background, not current email evidence):',
      formatContactWikiContext(source),
      '',
      'Email content:',
      snapshot.summaryView.latestReply || snapshot.parsed.plainText || source.snippet || '(No body)',
      '',
      'Detected deadlines:',
      snapshot.actionView.deadlines.join('\n') || 'None',
      '',
      'Detected amounts:',
      snapshot.actionView.amounts.join('\n') || 'None',
      '',
      'Detected links:',
      formatLinks(snapshot.actionView.links) || 'None',
    ].join('\n'),
    temperature: 0.2,
    maxTokens: 500,
  };
}
