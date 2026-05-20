import type { MailLikeForAi } from './fromBodies';
import { hasForumRelayContext } from '../contactKnowledge';

export type EmailAISenderType =
  | 'personal'
  | 'work_contact'
  | 'marketing'
  | 'newsletter'
  | 'vendor'
  | 'system_notification'
  | 'community_feedback'
  | 'unknown';

export type EmailAIInboxClass =
  | 'primary'
  | 'transactions'
  | 'updates'
  | 'promotions'
  | 'community'
  | 'other';

export type EmailAIMessageScenario =
  | 'human_request'
  | 'security_alert'
  | 'verification'
  | 'billing_statement'
  | 'receipt_or_order'
  | 'shipping_or_travel'
  | 'calendar_scheduling'
  | 'promotion_deal'
  | 'newsletter_update'
  | 'community_feedback'
  | 'delivery_failure'
  | 'dev_notification'
  | 'generic_update';

export interface EmailAIOverlays {
  replyNeeded: boolean;
  timeSensitive: boolean;
  securitySensitive: boolean;
  hasExternalAction: boolean;
  actionUrgency: 'now' | 'today' | 'later' | 'none';
}

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
  inboxClass: EmailAIInboxClass;
  messageScenario: EmailAIMessageScenario;
  overlays: EmailAIOverlays;
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
const DELIVERY_FAILURE_TEXT_RE = /\b(undelivered mail|delivery status notification|delivery failure|mail delivery failed|returned to sender|final-recipient|diagnostic-code|recipient address rejected|message was not delivered)\b|退信|投递失败|投遞失敗|发送失败|傳送失敗/i;
const CALENDAR_TEXT_RE = /\b(invitation|calendar|meeting invite|rsvp|accept or decline|reschedule|availability|appointment)\b|会议邀请|會議邀請|日程|日历|行程邀约|接受或拒绝/i;
const RECEIPT_ORDER_TEXT_RE = /\b(receipt|order confirmation|your order|purchase|refund|return request|subscription renewed|confirmation number)\b|收据|收據|订单|訂單|购买|購買|退款|续订|續訂/i;
const SHIPPING_TRAVEL_TEXT_RE = /\b(shipping|shipment|delivered|tracking|boarding pass|flight|hotel|booking|itinerary|reservation)\b|物流|快递|快遞|已送达|追踪|航班|酒店|预订|預訂|行程/i;
const DEV_NOTIFICATION_TEXT_RE = /\b(github|gitlab|bitbucket|jira|linear|pull request|merge request|issue|commit|workflow|ci|build failed|deployment|repository|repo)\b|代码库|合并请求|拉取请求|工单|构建失败|部署/i;
const PROMOTION_DEAL_TEXT_RE = /\b(discount|deal|promo|promotion|offer|sale|coupon|save\s+\d|%\s*off|off\s+today)\b|促销|折扣|优惠|限时|大促/i;
const DEADLINE_TEXT_RE = /\b(today|tomorrow|tonight|asap|urgent|immediately|deadline|due|expires?|ends?|by\s+\d{1,2}(?::\d{2})?)\b|今天|明天|今晚|尽快|儘快|立即|马上|馬上|截止|到期|过期|過期/i;

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

function getHeader(headers: Record<string, string>, name: string): string {
  return headers[name.toLowerCase()] || '';
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

function allowedActionIntents(
  senderType: EmailAISenderType,
  replyNeeded: boolean,
  messageScenario: EmailAIMessageScenario,
): EmailAIActionIntent[] {
  if (senderType === 'marketing' || senderType === 'newsletter') return ['read', 'archive', 'unsubscribe'];
  if (senderType === 'community_feedback' || messageScenario === 'community_feedback') return ['external_link', 'read', 'archive', 'none'];
  if (messageScenario === 'delivery_failure') return ['read', 'archive', 'none'];
  if (senderType === 'system_notification') return ['external_link', 'archive', 'none'];
  if (!replyNeeded) return ['read', 'archive', 'none'];
  if (senderType === 'vendor') return ['reply', 'external_link', 'archive', 'none'];
  return ['reply', 'read', 'archive', 'none'];
}

function allowedQuickReplyIntents(
  senderType: EmailAISenderType,
  replyNeeded: boolean,
  messageScenario: EmailAIMessageScenario,
): EmailAIQuickReplyIntent[] {
  if (!replyNeeded) return [];
  if (
    senderType === 'marketing' ||
    senderType === 'newsletter' ||
    senderType === 'system_notification' ||
    senderType === 'community_feedback' ||
    messageScenario === 'delivery_failure' ||
    messageScenario === 'security_alert' ||
    messageScenario === 'verification' ||
    messageScenario === 'community_feedback'
  ) return [];
  if (senderType === 'personal' || senderType === 'work_contact' || senderType === 'unknown') return ['acknowledge', 'defer', 'clarify'];
  if (senderType === 'vendor') return ['support', 'done', 'forward'];
  return [];
}

function hasCalendarHeader(headers: Record<string, string>): boolean {
  const contentClass = getHeader(headers, 'content-class');
  const contentType = getHeader(headers, 'content-type');
  const method = getHeader(headers, 'method');
  return /calendarmessage|text\/calendar|method=request|method=reply/i.test([contentClass, contentType, method].join('\n'));
}

function hasExternalActionSignal(textBlob: string): boolean {
  return /https?:\/\/|\[(?:url|link)_?\d*\]|\b(?:click|tap|open|visit|view|approve|verify|pay|download|access)\b|点击|點擊|访问|訪問|查看|验证|驗證|支付|下载|下載/i.test(textBlob);
}

function deriveMessageScenario(input: {
  senderType: EmailAISenderType;
  textBlob: string;
  fromBlob: string;
  headers: Record<string, string>;
  hasListUnsubscribe: boolean;
  hasListId: boolean;
  hasExplicitReplyRequest: boolean;
  isForumNotification: boolean;
  hasSecuritySystemSignal: boolean;
  isBulkLike: boolean;
}): EmailAIMessageScenario {
  const {
    senderType,
    textBlob,
    fromBlob,
    headers,
    hasListUnsubscribe,
    hasListId,
    hasExplicitReplyRequest,
    isForumNotification,
    hasSecuritySystemSignal,
    isBulkLike,
  } = input;

  if (DELIVERY_FAILURE_TEXT_RE.test(textBlob) || /mailer-daemon|postmaster/i.test(fromBlob)) return 'delivery_failure';
  if (isForumNotification || senderType === 'community_feedback') return 'community_feedback';
  if (hasCalendarHeader(headers) || CALENDAR_TEXT_RE.test(textBlob)) return 'calendar_scheduling';
  if (hasSecuritySystemSignal && /\b(alert|suspicious|login|sign-?in|new location|ip address|reset your password|password)\b|安全|警示|異常|异常|登入|登录/i.test(textBlob)) return 'security_alert';
  if (/\b(verify|verification|otp|code|one-time|confirm your email|approve your new address)\b|验证码|驗證碼|验证|驗證/i.test(textBlob)) return 'verification';
  if (/\b(invoice|statement|billing|payment due|balance|tax|payslip)\b|账单|財務|财务|結單|结单|发票|付款|余额|餘額/i.test(textBlob)) return 'billing_statement';
  if (SHIPPING_TRAVEL_TEXT_RE.test(textBlob)) return 'shipping_or_travel';
  if (RECEIPT_ORDER_TEXT_RE.test(textBlob)) return 'receipt_or_order';
  if (DEV_NOTIFICATION_TEXT_RE.test(textBlob)) return 'dev_notification';
  if (senderType === 'marketing' || PROMOTION_DEAL_TEXT_RE.test(textBlob)) return 'promotion_deal';
  if (senderType === 'newsletter' || hasListId || hasListUnsubscribe || isBulkLike || NEWSLETTER_TEXT_RE.test(textBlob)) return 'newsletter_update';
  if (hasExplicitReplyRequest || senderType === 'personal' || senderType === 'work_contact') return 'human_request';
  return 'generic_update';
}

function deriveInboxClass(senderType: EmailAISenderType, messageScenario: EmailAIMessageScenario): EmailAIInboxClass {
  if (senderType === 'marketing' || messageScenario === 'promotion_deal') return 'promotions';
  if (senderType === 'community_feedback' || messageScenario === 'community_feedback') return 'community';
  if (messageScenario === 'human_request' || senderType === 'personal' || senderType === 'work_contact') return 'primary';
  if (
    messageScenario === 'security_alert' ||
    messageScenario === 'verification' ||
    messageScenario === 'billing_statement' ||
    messageScenario === 'receipt_or_order' ||
    messageScenario === 'shipping_or_travel' ||
    messageScenario === 'calendar_scheduling' ||
    messageScenario === 'delivery_failure'
  ) return 'transactions';
  if (senderType === 'newsletter' || messageScenario === 'newsletter_update' || messageScenario === 'dev_notification' || messageScenario === 'generic_update') return 'updates';
  return 'other';
}

function deriveActionUrgency(textBlob: string, messageScenario: EmailAIMessageScenario): EmailAIOverlays['actionUrgency'] {
  if (messageScenario === 'security_alert' || /\b(immediately|urgent|asap|right now)\b|立即|马上|馬上|紧急|緊急/i.test(textBlob)) return 'now';
  if (/\b(today|tonight)\b|今天|今晚/i.test(textBlob)) return 'today';
  if (messageScenario === 'verification' || messageScenario === 'calendar_scheduling' || DEADLINE_TEXT_RE.test(textBlob)) return 'later';
  return 'none';
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
  const fromLooksPromotionAddress = /^(promo|offers|deals|marketing)@|@(send\.|em\.|em\d+\.|sg\.|mailchimp|sendgrid|klaviyo)/i.test(fromBlob);
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
    senderType = 'community_feedback';
    senderTypeConfidence = 0.74;
    senderTypeSource = /noreply@mails\./i.test(fromBlob) ? 'address' : 'content';
  } else if (fromLooksMarketing || hasListUnsubscribe || hasListId) {
    senderType = PROMOTION_DEAL_TEXT_RE.test(textBlob) || fromLooksPromotionAddress ? 'marketing' : 'newsletter';
    senderTypeConfidence = hasListUnsubscribe ? 0.86 : 0.78;
    senderTypeSource = hasListUnsubscribe || hasListId ? 'headers' : 'address';
  } else if (fromLooksNoReply || fromLooksSystem) {
    senderType = 'system_notification';
    senderTypeConfidence = fromLooksNoReply ? 0.86 : 0.72;
    senderTypeSource = 'address';
  } else if (/安全|风险|security|risk/i.test(categoryBlob) || hasSecuritySystemSignal) {
    senderType = 'system_notification';
    senderTypeConfidence = /安全|风险|security|risk/i.test(categoryBlob) ? 0.7 : 0.66;
    senderTypeSource = /安全|风险|security|risk/i.test(categoryBlob) ? 'category' : 'content';
  } else if (/工作|业务|work|business/i.test(categoryBlob) || WORK_TEXT_RE.test(textBlob)) {
    senderType = 'work_contact';
    senderTypeConfidence = 0.62;
    senderTypeSource = /工作|业务|work|business/i.test(categoryBlob) ? 'category' : 'content';
  } else if (/社交|个人|personal|social/i.test(categoryBlob)) {
    senderType = 'personal';
    senderTypeConfidence = 0.62;
    senderTypeSource = 'category';
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

  const messageScenario = deriveMessageScenario({
    senderType,
    textBlob,
    fromBlob,
    headers,
    hasListUnsubscribe,
    hasListId,
    hasExplicitReplyRequest,
    isForumNotification,
    hasSecuritySystemSignal,
    isBulkLike,
  });

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
  } else if (messageScenario === 'delivery_failure') {
    replyNeeded = false;
    replyNeededReason = 'delivery failure notice';
  } else if (fromLooksNoReply) {
    replyNeeded = false;
    replyNeededReason = 'no-reply sender';
  } else if (senderTypeIsStrongBulk) {
    replyNeeded = false;
    replyNeededReason = 'bulk subscription sender';
  } else if (messageScenario === 'community_feedback') {
    replyNeeded = false;
    replyNeededReason = 'community relay background';
  } else if (senderType === 'system_notification' && (senderTypeSource === 'address' || hasSecuritySystemSignal)) {
    replyNeeded = false;
    replyNeededReason = 'system notification';
  } else if (messageScenario === 'security_alert' || messageScenario === 'verification') {
    replyNeeded = false;
    replyNeededReason = 'account or verification flow';
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

  const inboxClass = deriveInboxClass(senderType, messageScenario);
  const timeSensitive = DEADLINE_TEXT_RE.test(textBlob) ||
    messageScenario === 'calendar_scheduling' ||
    messageScenario === 'security_alert' ||
    messageScenario === 'verification';
  const overlays: EmailAIOverlays = {
    replyNeeded,
    timeSensitive,
    securitySensitive: messageScenario === 'security_alert' || hasSecuritySystemSignal,
    hasExternalAction: hasExternalActionSignal(textBlob),
    actionUrgency: deriveActionUrgency(textBlob, messageScenario),
  };

  return {
    senderType,
    senderTypeConfidence,
    senderTypeSource,
    senderTypeUncertain: senderTypeConfidence < 0.6,
    inboxClass,
    messageScenario,
    overlays,
    replyNeeded,
    replyNeededReason,
    isBulkLike,
    hasReplyTarget: (!fromLooksNoReply || hasReplyTo || isForumNotification) && messageScenario !== 'delivery_failure',
    allowedActionIntents: allowedActionIntents(senderType, replyNeeded, messageScenario),
    allowedQuickReplyIntents: allowedQuickReplyIntents(senderType, replyNeeded, messageScenario),
  };
}
