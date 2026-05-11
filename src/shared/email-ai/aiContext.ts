import type { MailLikeForAi } from './fromBodies';
import { hasForumRelayContext } from '../contactKnowledge';

export type EmailAISenderType =
  | 'personal'
  | 'work_contact'
  | 'marketing'
  | 'newsletter'
  | 'vendor'
  | 'system_notification'
  | 'unknown';

export type EmailAIActionIntent =
  | 'reply'
  | 'archive'
  | 'unsubscribe'
  | 'read'
  | 'external_link'
  | 'none';

export type EmailAIQuickReplyIntent =
  | 'acknowledge'
  | 'clarify'
  | 'defer'
  | 'support'
  | 'done'
  | 'forward';

export interface EmailAIContext {
  senderType: EmailAISenderType;
  senderTypeConfidence: number;
  senderTypeSource: 'explicit' | 'headers' | 'address' | 'category' | 'content' | 'default';
  senderTypeUncertain: boolean;
  replyNeeded: boolean;
  replyNeededReason: string;
  isBulkLike: boolean;
  hasReplyTarget: boolean;
  allowedActionIntents: EmailAIActionIntent[];
  allowedQuickReplyIntents: EmailAIQuickReplyIntent[];
}

export interface EmailAIContextSource extends MailLikeForAi {
  senderType?: EmailAISenderType;
  replyNeeded?: boolean | null;
}

const MARKETING_ADDRESS_PATTERNS = [
  /^(news|newsletter|promo|offers|deals|marketing|digest|updates?)@/i,
  /@(send\.|mail\.|em\.|em\d+\.|sg\.|mailchi\.mp|sendgrid|mailchimp|constantcontact|klaviyo)/i,
];

const SYSTEM_ADDRESS_PATTERNS = [
  /^(no-?reply|notifications?|alerts?|security|billing|mailer-daemon|postmaster)@/i,
  /@(accounts?|security|billing|notify|notifications?)\./i,
];

const MARKETING_TEXT_RE = /\b(discount|deal|promo|promotion|offer|sale|coupon|unsubscribe|newsletter)\b|促销|折扣|优惠|退订|订阅/i;
const NEWSLETTER_TEXT_RE = /\b(newsletter|digest|weekly|daily|roundup|top stories|news)\b|简报|日报|周报|精选|新闻/i;
const WORK_TEXT_RE = /\b(project|contract|client|invoice|proposal|meeting|approval|review)\b|项目|合同|客户|会议|审批|审核/i;
const SYSTEM_SECURITY_TEXT_RE = /\b(password|verify|verification|otp|security|login|sign-?in|new location|ip address|reset your password|suspicious|alert)\b|验证|验证码|密碼|密码|登录|登入|安全|警示|提醒/i;
const VENDOR_SERVICE_TEXT_RE = /\b(receipt|statement|balance|invoice|billing|payment|account|subscription)\b|账单|結單|结单|余额|餘額|发票|付款|账户|帳戶|订阅|訂閱/i;
const EXPLICIT_REPLY_RE = /\b(please|kindly)\s+(reply|respond|confirm|approve|review|sign|send|answer)\b|\b(can you|could you|would you)\s+(reply|respond|confirm|approve|review|send|check)\b|\brequires?\s+(your\s+)?(reply|response|approval|confirmation|review)\b|\bawaiting\s+(your\s+)?(reply|response|approval|confirmation)\b|请(回复|确认|审批|审核|答复|处理)/i;

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return value || '';
}

export function normalizeEmailAIHeaders(headers?: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), normalizeHeaderValue(value)])
  );
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Boolean(headers[name.toLowerCase()]?.trim());
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function buildTextBlob(source: EmailAIContextSource): string {
  return [
    source.subject,
    source.from,
    source.fromName,
    source.snippet,
    source.category,
    source.scanResult,
    source.bodyText?.slice(0, 1200),
  ].filter(Boolean).join('\n');
}

function allowedActionIntents(senderType: EmailAISenderType, replyNeeded: boolean): EmailAIActionIntent[] {
  if (senderType === 'marketing' || senderType === 'newsletter') return ['read', 'archive', 'unsubscribe'];
  if (senderType === 'system_notification') return ['external_link', 'archive', 'none'];
  if (!replyNeeded) return ['read', 'archive', 'none'];
  if (senderType === 'vendor') return ['reply', 'external_link', 'archive', 'none'];
  return ['reply', 'read', 'archive', 'none'];
}

function allowedQuickReplyIntents(senderType: EmailAISenderType, replyNeeded: boolean): EmailAIQuickReplyIntent[] {
  if (!replyNeeded) return [];
  if (senderType === 'personal' || senderType === 'work_contact' || senderType === 'unknown') return ['acknowledge', 'defer', 'clarify'];
  if (senderType === 'vendor') return ['support', 'done', 'forward'];
  return [];
}

export function deriveEmailAIContext(source: EmailAIContextSource): EmailAIContext {
  const headers = normalizeEmailAIHeaders(source.headers);
  const textBlob = buildTextBlob(source);
  const fromBlob = [source.from, source.fromName].filter(Boolean).join(' ');
  const categoryBlob = [source.category, source.scanResult].filter(Boolean).join('\n');
  const hasListUnsubscribe = hasHeader(headers, 'list-unsubscribe');
  const hasListId = hasHeader(headers, 'list-id');
  const precedence = headers.precedence || '';
  const hasReplyTo = hasHeader(headers, 'reply-to');
  const fromLooksNoReply = /\bno-?reply\b|mailer-daemon|postmaster/i.test(fromBlob);
  const fromLooksMarketing = includesAny(fromBlob, MARKETING_ADDRESS_PATTERNS);
  const fromLooksSystem = includesAny(fromBlob, SYSTEM_ADDRESS_PATTERNS);
  const isBulkLike = hasListUnsubscribe || hasListId || /\bbulk|list|junk\b/i.test(precedence) || fromLooksMarketing;
  const hasExplicitReplyRequest = EXPLICIT_REPLY_RE.test(textBlob);
  const isForumNotification = hasForumRelayContext(textBlob) || /noreply@mails\./i.test(fromBlob);
  const hasSecuritySystemSignal = SYSTEM_SECURITY_TEXT_RE.test(textBlob);

  let senderType: EmailAISenderType = 'unknown';
  let senderTypeConfidence = 0.35;
  let senderTypeSource: EmailAIContext['senderTypeSource'] = 'default';

  if (source.senderType) {
    senderType = source.senderType;
    senderTypeConfidence = 0.95;
    senderTypeSource = 'explicit';
  } else if (isForumNotification) {
    senderType = 'vendor';
    senderTypeConfidence = 0.74;
    senderTypeSource = /noreply@mails\./i.test(fromBlob) ? 'address' : 'content';
  } else if (fromLooksMarketing || hasListUnsubscribe || hasListId) {
    senderType = MARKETING_TEXT_RE.test(textBlob) || fromLooksMarketing ? 'marketing' : 'newsletter';
    senderTypeConfidence = hasListUnsubscribe ? 0.86 : 0.78;
    senderTypeSource = hasListUnsubscribe || hasListId ? 'headers' : 'address';
  } else if (fromLooksNoReply || fromLooksSystem) {
    senderType = 'system_notification';
    senderTypeConfidence = fromLooksNoReply ? 0.86 : 0.72;
    senderTypeSource = 'address';
  } else if (/工作|业务|work|business/i.test(categoryBlob) || WORK_TEXT_RE.test(textBlob)) {
    senderType = 'work_contact';
    senderTypeConfidence = 0.62;
    senderTypeSource = /工作|业务|work|business/i.test(categoryBlob) ? 'category' : 'content';
  } else if (/社交|个人|personal|social/i.test(categoryBlob)) {
    senderType = 'personal';
    senderTypeConfidence = 0.62;
    senderTypeSource = 'category';
  } else if (/安全|风险|security|risk/i.test(categoryBlob) || hasSecuritySystemSignal) {
    senderType = 'system_notification';
    senderTypeConfidence = /安全|风险|security|risk/i.test(categoryBlob) ? 0.7 : 0.66;
    senderTypeSource = /安全|风险|security|risk/i.test(categoryBlob) ? 'category' : 'content';
  } else if (/账单|财务|billing|finance|invoice|statement/i.test(categoryBlob) || VENDOR_SERVICE_TEXT_RE.test(textBlob)) {
    senderType = 'vendor';
    senderTypeConfidence = 0.62;
    senderTypeSource = /账单|财务|billing|finance/i.test(categoryBlob) ? 'category' : 'content';
  } else if (/广告|营销|promotion|newsletter/i.test(categoryBlob) || MARKETING_TEXT_RE.test(textBlob)) {
    senderType = NEWSLETTER_TEXT_RE.test(textBlob) && !/\bdiscount|deal|sale|coupon\b|折扣|促销|优惠/i.test(textBlob)
      ? 'newsletter'
      : 'marketing';
    senderTypeConfidence = 0.68;
    senderTypeSource = /广告|营销|promotion|newsletter/i.test(categoryBlob) ? 'category' : 'content';
  }

  let replyNeeded = false;
  let replyNeededReason = 'no strong reply signal';
  const senderTypeIsStrongBulk =
    (senderType === 'marketing' || senderType === 'newsletter') &&
    (isBulkLike || senderTypeSource === 'headers' || senderTypeSource === 'address');

  if (source.replyNeeded === false) {
    replyNeeded = false;
    replyNeededReason = 'explicit false';
  } else if (source.replyNeeded === true) {
    replyNeeded = true;
    replyNeededReason = 'explicit true';
  } else if (isForumNotification && (hasReplyTo || /回复此电子邮件|回覆此電子郵件|reply to this email/i.test(textBlob))) {
    replyNeeded = true;
    replyNeededReason = 'forum notification supports reply';
  } else if (fromLooksNoReply) {
    replyNeeded = false;
    replyNeededReason = 'no-reply sender';
  } else if (senderTypeIsStrongBulk) {
    replyNeeded = false;
    replyNeededReason = 'bulk subscription sender';
  } else if (senderType === 'system_notification' && (senderTypeSource === 'address' || hasSecuritySystemSignal)) {
    replyNeeded = false;
    replyNeededReason = 'system notification';
  } else if (hasExplicitReplyRequest && !fromLooksNoReply) {
    replyNeeded = true;
    replyNeededReason = 'explicit request in message';
  } else if ((senderType === 'personal' || senderType === 'work_contact') && !isBulkLike) {
    replyNeeded = true;
    replyNeededReason = 'human contact context';
  } else if (senderType === 'vendor' && hasReplyTo && hasExplicitReplyRequest) {
    replyNeeded = true;
    replyNeededReason = 'vendor request with reply target';
  } else if (!isBulkLike && !fromLooksNoReply && senderType !== 'system_notification') {
    replyNeeded = true;
    replyNeededReason = 'replyable sender by default';
  }

  return {
    senderType,
    senderTypeConfidence,
    senderTypeSource,
    senderTypeUncertain: senderTypeConfidence < 0.6,
    replyNeeded,
    replyNeededReason,
    isBulkLike,
    hasReplyTarget: !fromLooksNoReply || hasReplyTo || isForumNotification,
    allowedActionIntents: allowedActionIntents(senderType, replyNeeded),
    allowedQuickReplyIntents: allowedQuickReplyIntents(senderType, replyNeeded),
  };
}
