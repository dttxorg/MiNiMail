import type { LightScanInput, LightScanResult, RecommendedDepth } from './scanTypes';
import { evaluateForceUpgradeRules } from './scanUpgradeRules';

const HIGH_IMPORTANCE_KEYWORDS = [
  /\binvoice\b/i,
  /\bpayment\b/i,
  /\bsecurity\b/i,
  /\bcontract\b/i,
  /\bapproval\b/i,
  /\bdeadline\b/i,
  /发票|支付|安全|合同|审批|截止/,
];

const HIGH_URGENCY_KEYWORDS = [
  /\burgent\b/i,
  /\basap\b/i,
  /\bimmediately\b/i,
  /\btoday\b/i,
  /\btomorrow\b/i,
  /\boverdue\b/i,
  /\bdeadline\b/i,
  /\baction required\b/i,
  /紧急|尽快|今天|明天|截止|逾期|立即处理/,
];

const STRONG_ACTIONABILITY_KEYWORDS = [
  /\bplease\s+(review|reply|respond|confirm|approve)\b/i,
  /\bkindly\s+(review|reply|respond|confirm|approve)\b/i,
  /\bcan you\s+(review|reply|respond|confirm|approve)\b/i,
  /\b(review|reply|respond|confirm|approve)\s+(requested|required)\b/i,
  /\brequires?\s+(review|reply|response|approval|confirmation)\b/i,
  /\bneed(?:s)?\s+(your\s+)?(review|reply|response|approval|confirmation)\b/i,
  /\bawaiting\s+(your\s+)?(review|reply|response|approval|confirmation)\b/i,
  /\baction required\b/i,
  /请(回复|确认|审批|审核|答复)/,
];

const WEAK_ACTIONABILITY_KEYWORDS = [
  /\breview\b/i,
  /\bapprove\b/i,
  /\breply\b/i,
  /\brespond\b/i,
  /\bconfirm\b/i,
  /\bpay\b/i,
  /\bsign\b/i,
  /\bcomplete\b/i,
  /\btake action\b/i,
];

const RISK_KEYWORDS = [
  /\bsecurity alert\b/i,
  /\bfraud\b/i,
  /\bphishing\b/i,
  /\bsuspicious\b/i,
  /\bunusual\b/i,
  /\bfailed payment\b/i,
  /\blegal notice\b/i,
  /\bbreach\b/i,
  /风险|诈骗|异常登录|安全提醒|钓鱼|法律风险|违约/,
];

const DELIVERY_FAILURE_KEYWORDS = [
  /\bundelivered mail returned to sender\b/i,
  /\bmail delivery (?:failed|failure|subsystem)\b/i,
  /\bdelivery status notification\b/i,
  /\brecipient address rejected\b/i,
  /\bpermanent error\b/i,
  /\baction:\s*failed\b/i,
  /\bmessage that you sent could not be delivered\b/i,
];

const NEWSLETTER_KEYWORDS = [
  /\bnewsletter\b/i,
  /\bweekly digest\b/i,
  /\bread this week\b/i,
  /\bunsubscribe\b/i,
  /\btop stories\b/i,
  /\bpromotion\b/i,
  /\bdiscount\b/i,
  /订阅|每周精选|推荐文章|营销|促销|退订/,
];

const RELATIONSHIP_HINTS = [
  /\bthanks\b/i,
  /\bfollowing up\b/i,
  /\bper our conversation\b/i,
  /\bas discussed\b/i,
  /感谢|跟进|如前所述|按照我们讨论/,
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function normalizeText(input: LightScanInput): string {
  return [
    input.subject,
    input.from_name,
    input.from,
    input.snippet,
    input.body_text,
  ].filter(Boolean).join('\n').toLowerCase();
}

function normalizeList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function buildActionabilityText(input: LightScanInput): string {
  return [
    input.subject,
    input.snippet,
    (input.body_text || '').slice(0, 240),
  ].filter(Boolean).join('\n').toLowerCase();
}

function scoreImportance(input: LightScanInput, text: string): number {
  let score = 8;
  score += countMatches(text, HIGH_IMPORTANCE_KEYWORDS) * 16;
  score += countMatches(text, DELIVERY_FAILURE_KEYWORDS) * 22;
  if (input.has_attachments) score += 8;
  if ((input.subject || '').length > 0) score += 4;
  return clamp(score);
}

function scoreUrgency(text: string): number {
  let score = countMatches(text, HIGH_URGENCY_KEYWORDS) * 20;
  if (/\b\d{1,2}:\d{2}\b/.test(text) || /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(text)) {
    score += 8;
  }
  if (countMatches(text, NEWSLETTER_KEYWORDS) > 0) {
    score -= 18;
  }
  return clamp(score);
}

function scoreActionability(input: LightScanInput): number {
  const text = buildActionabilityText(input);
  const strongMatches = countMatches(text, STRONG_ACTIONABILITY_KEYWORDS);
  const weakMatches = countMatches(text, WEAK_ACTIONABILITY_KEYWORDS);
  const deliveryFailureMatches = countMatches(text, DELIVERY_FAILURE_KEYWORDS);
  let score = strongMatches * 28 + weakMatches * 6 + deliveryFailureMatches * 18;
  if (strongMatches > 0 && weakMatches > 0) score += 10;
  if (strongMatches >= 2) score += 6;
  if (deliveryFailureMatches > 0) score += 12;
  if (/\?$/.test(text.trim())) score += 8;
  if (countMatches(text, NEWSLETTER_KEYWORDS) > 0 && strongMatches === 0) {
    score -= 22;
  }
  return clamp(score);
}

function scoreRisk(text: string): number {
  let score = countMatches(text, RISK_KEYWORDS) * 22;
  if (/\b(alert|warning|notice)\b/i.test(text)) score += 6;
  return clamp(score);
}

function scoreDensity(input: LightScanInput, text: string): number {
  const body = input.body_text || input.snippet || '';
  let score = 0;
  if (body.length > 280) score += 18;
  else if (body.length > 140) score += 12;
  else if (body.length > 60) score += 6;
  if ((body.match(/\n/g) || []).length >= 4) score += 12;
  if ((body.match(/\bhttps?:\/\//g) || []).length >= 2) score += 6;
  if (countMatches(text, STRONG_ACTIONABILITY_KEYWORDS) > 0 || countMatches(text, WEAK_ACTIONABILITY_KEYWORDS) > 0) score += 8;
  return clamp(score);
}

function scoreRelationship(input: LightScanInput, text: string): number {
  const senders = [input.from, input.from_name].filter(Boolean).map((value) => String(value).toLowerCase());
  const related = (input.relationship_contacts || input.important_contacts || []).map((value) => value.toLowerCase());
  let score = 8;
  if (senders.some((sender) => related.some((contact) => sender.includes(contact) || contact.includes(sender)))) {
    score += 40;
  }
  if (countMatches(text, RELATIONSHIP_HINTS) > 0) score += 12;
  if (normalizeList(input.to).length > 0) score += 8;
  return clamp(score);
}

function scoreTotal(scores: Omit<LightScanResult, 'total_light_score' | 'force_upgrade' | 'recommended_depth' | 'reasons'>): number {
  return clamp(
    (
      scores.importance_score * 0.24 +
      scores.urgency_score * 0.18 +
      scores.actionability_score * 0.22 +
      scores.risk_score * 0.18 +
      scores.density_score * 0.08 +
      scores.relationship_score * 0.10
    ) * 2,
  );
}

function depthFromScore(score: number): RecommendedDepth {
  if (score < 35) return 'light';
  if (score < 65) return 'normal';
  return 'advanced';
}

function buildReasons(scores: {
  importance_score: number;
  urgency_score: number;
  actionability_score: number;
  risk_score: number;
  density_score: number;
  relationship_score: number;
}, text: string): string[] {
  const reasons: string[] = [];
  if (scores.importance_score >= 55) reasons.push('importance signals from sender/topic');
  if (scores.urgency_score >= 45) reasons.push('urgent timing or deadline language detected');
  if (scores.actionability_score >= 40) reasons.push('explicit review/reply/approval/pay action requested');
  if (scores.risk_score >= 45) reasons.push('security, fraud, payment, or legal risk language detected');
  if (scores.density_score >= 30) reasons.push('dense preview with enough context for deeper analysis');
  if (scores.relationship_score >= 35) reasons.push('sender appears relationship-relevant');
  if (countMatches(text, DELIVERY_FAILURE_KEYWORDS) > 0) reasons.push('delivery failure needs sender attention');
  if (countMatches(text, NEWSLETTER_KEYWORDS) > 0) reasons.push('newsletter/promotional signals reduce urgency');
  return reasons;
}

export function scanEmailLightweight(input: LightScanInput): LightScanResult {
  const text = normalizeText(input);
  const baseScores = {
    importance_score: scoreImportance(input, text),
    urgency_score: scoreUrgency(text),
    actionability_score: scoreActionability(input),
    risk_score: scoreRisk(text),
    density_score: scoreDensity(input, text),
    relationship_score: scoreRelationship(input, text),
  };

  const total_light_score = scoreTotal(baseScores);
  const upgrade = evaluateForceUpgradeRules(input, null);
  const recommended_depth = upgrade.force_upgrade
    ? upgrade.recommended_depth
    : depthFromScore(total_light_score);

  return {
    ...baseScores,
    total_light_score,
    force_upgrade: upgrade.force_upgrade,
    recommended_depth,
    reasons: [
      ...buildReasons(baseScores, text),
      ...upgrade.reasons.map((reason) => `force-upgrade:${reason}`),
    ],
  };
}
