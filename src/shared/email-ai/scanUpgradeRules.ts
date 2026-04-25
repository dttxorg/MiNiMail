import type {
  ForceUpgradeEvaluation,
  ForceUpgradeReason,
  GithubDedicatedParseResult,
  LightScanInput,
  RecommendedDepth,
} from './scanTypes';

function toHaystack(input: LightScanInput): string {
  return [
    input.subject,
    input.from_name,
    input.from,
    input.snippet,
    input.body_text,
  ].filter(Boolean).join('\n').toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function senderMatchesImportantContact(input: LightScanInput): boolean {
  const important = (input.important_contacts || []).map(normalizeEmail);
  if (important.length === 0) return false;
  const sender = normalizeEmail(input.from || '');
  return important.some((entry) => sender.includes(entry) || entry.includes(sender));
}

function hasAnyKeyword(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function maxDepth(current: RecommendedDepth, next: RecommendedDepth): RecommendedDepth {
  const rank: Record<RecommendedDepth, number> = {
    light: 0,
    normal: 1,
    advanced: 2,
  };
  return rank[next] > rank[current] ? next : current;
}

function hasLegalContractSignal(text: string): boolean {
  const strongPatterns = [
    /\blegal notice\b/,
    /\bsignature required\b/,
    /\bplease sign\b/,
    /\brequires signature\b/,
    /\bfor signature\b/,
    /\bcountersign\b/,
    /\bcounter-sign\b/,
    /\bcontract attached\b/,
    /\bagreement attached\b/,
    /\bmaster services? agreement\b/,
    /\bnon-disclosure agreement\b/,
    /\bstatement of work\b/,
    /\bterms amendment\b/,
    /合同.*(签署|审批|盖章|附件)/,
    /协议.*(签署|审批|盖章|附件)/,
    /法律函|法务通知/,
  ];
  if (hasAnyKeyword(text, strongPatterns)) return true;

  const hasContractNoun = hasAnyKeyword(text, [
    /\bcontract\b/,
    /\bagreement\b/,
    /\bmsa\b/,
    /\bnda\b/,
    /\bsow\b/,
    /\bamendment\b/,
    /合同|协议|保密协议|补充协议/,
  ]);
  const hasActionVerb = hasAnyKeyword(text, [
    /\bsign\b/,
    /\bsignature\b/,
    /\bexecute\b/,
    /\bcountersign\b/,
    /\breturn signed\b/,
    /签署|执行|盖章|回传/,
  ]);

  return hasContractNoun && hasActionVerb;
}

function hasScheduleChangeSignal(text: string): boolean {
  const hasContext = hasAnyKeyword(text, [
    /\bmeeting\b/,
    /\bcall\b/,
    /\binterview\b/,
    /\bappointment\b/,
    /\bevent\b/,
    /\bcalendar\b/,
    /\breservation\b/,
    /\bbooking\b/,
    /\bflight\b/,
    /\btrain\b/,
    /\bitinerary\b/,
    /会议|日程|电话会议|面试|预约|预订|航班|行程/,
  ]);

  if (!hasContext) return false;

  return hasAnyKeyword(text, [
    /\brescheduled\b/,
    /\bpostponed\b/,
    /\bcancelled\b/,
    /\bmeeting moved\b/,
    /\bmeeting moved to\b/,
    /\btime changed\b/,
    /\bschedule changed\b/,
    /\bcalendar update\b/,
    /改期|改期通知|取消会议|时间变更|日程调整|会议改到/,
  ]);
}

export function evaluateForceUpgradeRules(
  input: LightScanInput,
  github?: GithubDedicatedParseResult | null,
): ForceUpgradeEvaluation {
  const text = toHaystack(input);
  const reasons: ForceUpgradeReason[] = [];
  let recommendedDepth: RecommendedDepth = 'light';

  if (senderMatchesImportantContact(input)) {
    reasons.push('important_contact');
    recommendedDepth = maxDepth(recommendedDepth, 'normal');
  }

  if (github?.is_github) {
    reasons.push('github_email');
    recommendedDepth = maxDepth(recommendedDepth, github.needs_user_action ? 'advanced' : 'normal');
  }

  if (hasAnyKeyword(text, [
    /\bsecurity alert\b/,
    /\bsuspicious\b/,
    /\bunusual login\b/,
    /\bbreach\b/,
    /\bpassword reset\b/,
    /异常登录|安全提醒|风险提示|账号风险/,
  ])) {
    reasons.push('security_alert');
    recommendedDepth = maxDepth(recommendedDepth, 'advanced');
  }

  if (hasAnyKeyword(text, [
    /\bfailed payment\b/,
    /\bchargeback\b/,
    /\bpayment failed\b/,
    /\binvoice mismatch\b/,
    /\bdispute\b/,
    /支付失败|账单异常|扣费异常|退款争议|发票异常/,
  ])) {
    reasons.push('billing_anomaly');
    recommendedDepth = maxDepth(recommendedDepth, 'advanced');
  }

  if (hasLegalContractSignal(text)) {
    reasons.push('legal_contract');
    recommendedDepth = maxDepth(recommendedDepth, 'advanced');
  }

  if (hasScheduleChangeSignal(text)) {
    reasons.push('schedule_change');
    recommendedDepth = maxDepth(recommendedDepth, 'normal');
  }

  return {
    force_upgrade: reasons.length > 0,
    recommended_depth: recommendedDepth,
    reasons,
  };
}
