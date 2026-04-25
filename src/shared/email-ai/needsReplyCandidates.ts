import type { RecommendedDepth, ScanPipelineResult } from './scanTypes';
import { deriveGenericPriorityFolders } from './smartFolderRouter';

export interface NeedsReplyCandidateKeyScores {
  importance_score: number;
  urgency_score: number;
  actionability_score: number;
  risk_score: number;
  density_score: number;
  relationship_score: number;
  total_light_score: number;
}

export interface NeedsReplyCandidateRecord {
  mail_id: string;
  subject?: string;
  from?: string;
  date?: string;
  preview_text: string;
  current_matched_folder?: string;
  key_scores: NeedsReplyCandidateKeyScores;
  top_reasons: string[];
  candidate_reasons: string[];
  why_candidate: string;
}

export interface NeedsReplyCandidateExport {
  generated_at: string;
  mail_count: number;
  candidates: NeedsReplyCandidateRecord[];
}

export interface NeedsReplyCandidateSource {
  id: string;
  routing: ScanPipelineResult;
  subject?: string;
  from?: string;
  date?: string;
  snippet?: string;
  body_text?: string;
}

interface BuildNeedsReplyCandidateExportArgs {
  sources?: NeedsReplyCandidateSource[];
  appLanguage?: string;
}

function normalizeAppLanguage(appLanguage?: string): 'zh' | 'en' {
  return (appLanguage || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function localize(appLanguage: 'zh' | 'en', zh: string, en: string): string {
  return appLanguage === 'zh' ? zh : en;
}

function buildPreviewText(source: NeedsReplyCandidateSource): string {
  const preview = source.snippet?.trim();
  if (preview) return preview;
  const body = (source.body_text || '').trim();
  return body.slice(0, 220);
}

function buildText(source: NeedsReplyCandidateSource): string {
  return [
    source.subject,
    source.snippet,
    (source.body_text || '').slice(0, 300),
  ].filter(Boolean).join('\n').toLowerCase();
}

function getCurrentMatchedFolder(source: NeedsReplyCandidateSource): string | undefined {
  if (source.routing.smart_folder?.folder) {
    return source.routing.smart_folder.folder;
  }
  if (source.routing.kind === 'generic') {
    return deriveGenericPriorityFolders(source.routing.light_scan)[0];
  }
  return undefined;
}

function isExcludedNoise(text: string): boolean {
  return [
    /\bnewsletter\b/i,
    /\bweekly digest\b/i,
    /\bunsubscribe\b/i,
    /\btop stories\b/i,
    /\bpromotion\b/i,
    /\bdiscount\b/i,
    /\bwelcome to\b/i,
    /\bverify your email\b/i,
    /\bverify your account\b/i,
    /\bnew login\b/i,
    /\bsecurity alert\b/i,
    /订阅|每周精选|推荐文章|营销|促销|退订|欢迎使用|验证邮箱|验证账号/,
  ].some((pattern) => pattern.test(text));
}

function getStrongReplySignals(text: string): string[] {
  const checks: Array<[RegExp, string]> = [
    [/\bplease\s+reply\b/i, '明确要求回复'],
    [/\bplease\s+review\b/i, '明确要求审核'],
    [/\bplease\s+confirm\b/i, '明确要求确认'],
    [/\bplease\s+approve\b/i, '明确要求审批'],
    [/\breply\s+(requested|required)\b/i, '要求回复'],
    [/\breview\s+(requested|required)\b/i, '要求审核'],
    [/\bapproval\s+required\b/i, '要求审批'],
    [/\bconfirmation\s+required\b/i, '要求确认'],
    [/\bcan you\s+(reply|review|confirm|approve)\b/i, '直接向你发出处理请求'],
    [/请(回复|确认|审批|审核|答复)/, '中文明确请求'],
  ];

  return checks.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

function getWeakReplySignals(text: string): string[] {
  const checks: Array<[RegExp, string]> = [
    [/\breply\b/i, '出现 reply'],
    [/\breview\b/i, '出现 review'],
    [/\bconfirm\b/i, '出现 confirm'],
    [/\bapprove\b/i, '出现 approve'],
    [/\brespond\b/i, '出现 respond'],
    [/\bsign\b/i, '出现 sign'],
    [/\bpay\b/i, '出现 pay'],
  ];

  return checks.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

function buildCandidateReasons(
  source: NeedsReplyCandidateSource,
  text: string,
): string[] {
  const reasons: string[] = [];
  const strongSignals = getStrongReplySignals(text);
  const weakSignals = getWeakReplySignals(text);
  const scores = source.routing.light_scan;

  reasons.push(...strongSignals);
  if (strongSignals.length === 0) {
    reasons.push(...weakSignals.slice(0, 2));
  }

  if (scores.relationship_score >= 18) reasons.push('关系分支撑');
  if (scores.importance_score >= 38) reasons.push('重要性支撑');
  if (scores.urgency_score >= 12) reasons.push('时效性支撑');

  return Array.from(new Set(reasons)).slice(0, 4);
}

function shouldIncludeAsNeedsReplyCandidate(source: NeedsReplyCandidateSource): boolean {
  if (source.routing.kind === 'github') return false;

  const text = buildText(source);
  if (!text) return false;
  if (isExcludedNoise(text)) return false;

  const scores = source.routing.light_scan;
  const strongSignals = getStrongReplySignals(text);
  const hasCanonicalReason = scores.reasons.includes('explicit review/reply/approval/pay action requested');
  const hasSupport = scores.relationship_score >= 18 || scores.importance_score >= 38 || scores.urgency_score >= 12;

  if (strongSignals.length > 0 && scores.actionability_score >= 34) {
    return true;
  }

  if (hasCanonicalReason && scores.actionability_score >= 42 && hasSupport) {
    return true;
  }

  return false;
}

function buildWhyCandidate(
  source: NeedsReplyCandidateSource,
  candidateReasons: string[],
  appLanguage: 'zh' | 'en',
): string {
  const score = source.routing.light_scan.actionability_score;
  const reasonText = candidateReasons.slice(0, 2).join('、');
  return localize(
    appLanguage,
    `这封邮件被视为 Needs Reply 候选，因为它包含较明确的回复/确认/审批请求信号，且 actionability_score 为 ${score}${reasonText ? `，主要依据是：${reasonText}` : ''}。`,
    `This mail is a Needs Reply candidate because it contains explicit reply/review/confirm signals, with actionability_score ${score}${reasonText ? `, mainly due to ${reasonText}` : ''}.`,
  );
}

export function buildNeedsReplyCandidateExport({
  sources = [],
  appLanguage,
}: BuildNeedsReplyCandidateExportArgs): NeedsReplyCandidateExport {
  const language = normalizeAppLanguage(appLanguage);
  const candidates: NeedsReplyCandidateRecord[] = [];

  for (const source of sources) {
    if (!shouldIncludeAsNeedsReplyCandidate(source)) continue;

    const text = buildText(source);
    const candidateReasons = buildCandidateReasons(source, text);
    const scores = source.routing.light_scan;

    candidates.push({
      mail_id: source.id,
      subject: source.subject,
      from: source.from,
      date: source.date,
      preview_text: buildPreviewText(source),
      current_matched_folder: getCurrentMatchedFolder(source),
      key_scores: {
        importance_score: scores.importance_score,
        urgency_score: scores.urgency_score,
        actionability_score: scores.actionability_score,
        risk_score: scores.risk_score,
        density_score: scores.density_score,
        relationship_score: scores.relationship_score,
        total_light_score: scores.total_light_score,
      },
      top_reasons: scores.reasons.slice(0, 3),
      candidate_reasons: candidateReasons,
      why_candidate: buildWhyCandidate(source, candidateReasons, language),
    });
  }

  return {
    generated_at: new Date().toISOString(),
    mail_count: candidates.length,
    candidates,
  };
}
