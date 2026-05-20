import {
  buildActionSuggestionsPrompt,
  buildKeyInfoPrompt,
  buildQuickRepliesPrompt,
  buildReplyPrompt,
  buildSummarizePrompt,
  buildTranslatePrompt,
} from '../src/shared/email-ai/aiPrompts';
import { deriveEmailAIContext } from '../src/shared/email-ai/aiContext';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testTranslatePromptUsesLatestReply() {
  const request = buildTranslatePrompt({
    subject: 'Re: Invoice reminder',
    from: 'billing@example.com',
    fromName: 'Billing Team',
    snippet: 'Please pay by 2026-04-30',
    bodyText: [
      'Please pay invoice INV-2026-88 before 2026-04-30.',
      '',
      'Best regards,',
      'Billing Team',
      '',
      'On Mon, you wrote:',
      '> Old quoted history',
    ].join('\n'),
  }, 'Chinese');

  assert(request.prompt.includes('Please pay invoice INV-2026-88 before 2026-04-30.'), 'Expected latest reply in translate prompt');
  assert(!request.prompt.includes('Old quoted history'), 'Expected quoted history to be excluded from translate prompt');
  assert(request.system.includes('Do not translate brand names'), 'Expected translation prompt to preserve proper nouns');
  assert(request.system.includes('Preserve tone and register'), 'Expected translation prompt to preserve tone');
}

function testSummarizePromptIncludesActionSignals() {
  const request = buildSummarizePrompt({
    subject: 'Invoice due',
    from: 'billing@example.com',
    fromName: 'Billing Team',
    snippet: 'Your invoice is due soon',
    bodyHtml: '<p>Please pay invoice INV-2026-88 before 2026-04-30.</p><p><a href="https://example.com/pay">Pay invoice</a></p><p>Total due: $88.00</p>',
  }, 'Chinese');

  assert(request.prompt.includes('2026-04-30'), 'Expected deadline in summary prompt');
  assert(request.prompt.includes('$88.00'), 'Expected amount in summary prompt');
  assert(request.prompt.includes('Please pay invoice INV-2026-88 before 2026-04-30.'), 'Expected latest reply in summary prompt');
  assert(request.system.includes('Chinese'), 'Expected summary prompt to enforce the target language');
  assert(request.system.includes('JSON object'), 'Expected summary prompt to request structured JSON');
  assert(request.system.includes('what, impact, action, keyFacts, urgency'), 'Expected summary schema keys');
}

function testReplyPromptKeepsQuotedContextSeparate() {
  const request = buildReplyPrompt({
    subject: 'Project update',
    from: 'alice@example.com',
    fromName: 'Alice',
    bodyText: [
      'Can you confirm the rollout by Friday?',
      '',
      'On Thu, Bob wrote:',
      '> We can ship after QA finishes.',
    ].join('\n'),
  }, 'Chinese');

  assert(request.prompt.includes('Suggested opening:'), 'Expected suggested opening section');
  assert(request.prompt.includes('Can you confirm the rollout by Friday?'), 'Expected latest reply in reply prompt');
  assert(request.prompt.includes('We can ship after QA finishes.'), 'Expected quoted context in reply prompt');
  assert(request.system.includes('Chinese'), 'Expected reply prompt to enforce the target language');
  assert(request.system.includes('Do not translate or summarize'), 'Expected reply prompt to generate an actual reply instead of translating');
  assert(request.system.includes('candidate reply drafts'), 'Expected reply prompt to produce candidate reply drafts');
  assert(request.system.includes('Never include analysis headings'), 'Expected reply prompt to forbid assistant-analysis sections in sendable replies');
  assert(request.system.includes('do not draft a polite acknowledgement'), 'Expected no-reply prompt to forbid polite acknowledgements');
}

function testAssistantPromptsExposeStructuredAssistantSections() {
  const source = {
    subject: 'Verify your email address',
    from: 'account@example.com',
    fromName: 'Account',
    snippet: 'Please verify before noon. https://example.com/verify',
    bodyText: [
      'Please click the verification link before noon today.',
      'https://example.com/verify?token=abc123',
    ].join('\n'),
  };

  const actions = buildActionSuggestionsPrompt(source, 'Chinese');
  assert(actions.system.includes('JSON object'), 'Expected action suggestions to request structured JSON');
  assert(actions.system.includes('Action score'), 'Expected action suggestions to use deterministic action score');
  assert(actions.system.includes('Allowed intents'), 'Expected action suggestions to include intent limits');
  assert(actions.system.includes('evidence'), 'Expected action suggestions to require evidence');
  assert(actions.system.includes('generic advice'), 'Expected action prompt to explicitly avoid generic advice');
  assert(actions.system.includes('Do not output free-form High/Medium/Low priority labels'), 'Expected action prompt to avoid drifting priority labels');
  assert(actions.prompt.includes('Detected deadlines:'), 'Expected action prompt to include deadline context');
  assert(actions.prompt.includes('Detected amounts:'), 'Expected action prompt to include amount context');
  assert(actions.system.includes('Chinese'), 'Expected action prompt to enforce target language');

  const quickReplies = buildQuickRepliesPrompt({
    subject: 'Project rollout',
    from: 'alice@example.com',
    fromName: 'Alice',
    category: '工作/业务类',
    snippet: 'Can you confirm the rollout by Friday?',
    bodyText: 'Can you confirm the rollout by Friday?',
  }, 'Chinese');
  assert(quickReplies.system.includes('exactly 3'), 'Expected quick replies prompt to request three options');
  assert(quickReplies.system.includes('intent families'), 'Expected quick replies to request varied intents');
  assert(quickReplies.system.includes('clarify'), 'Expected quick replies to include a clarification variant');
  assert(quickReplies.prompt.includes('Latest reply:'), 'Expected quick replies prompt to include latest reply context');

  const keyInfo = buildKeyInfoPrompt(source, 'Chinese');
  assert(keyInfo.system.includes('Return all user-facing text in the current app language: Chinese.'), 'Expected key info prompt to bind output to current app language');
  assert(keyInfo.system.includes('JSON object'), 'Expected key info prompt to request stable JSON output');
  assert(keyInfo.system.includes('keyInfo'), 'Expected key info prompt to use stable keyInfo key');
  assert(keyInfo.system.includes('action'), 'Expected key info prompt to use stable action key');
  assert(keyInfo.system.includes('evidence'), 'Expected key info prompt to use stable evidence key');
  assert(keyInfo.system.includes('time'), 'Expected key info prompt to use stable time key');
  assert(keyInfo.system.includes('link'), 'Expected key info prompt to use stable link key');
  assert(keyInfo.system.includes('actionable facts'), 'Expected key info prompt to prioritize useful facts');
  assert(keyInfo.system.includes('Do not fill'), 'Expected key info prompt to avoid low-value metadata');
  assert(!keyInfo.system.includes('关键信息: 无明确可提取信息'), 'Expected key info prompt not to hardcode Chinese fallback text');
  assert(keyInfo.prompt.includes('Detected links:'), 'Expected key info prompt to include link context');
}

function testContactWikiContextFeedsAssistantPromptsAsBackground() {
  const source = {
    subject: 'Verify a login attempt from a new location',
    from: 'hello@example-app.test',
    fromName: 'Example App Team',
    snippet: 'Your account tried to login from this location. If this was not you, reset your password.',
    bodyText: [
      'Sign-In From a New Location',
      'Your account tried to login from this location:',
      'If you did not attempt to login from a new place, reset your password.',
    ].join('\n'),
    contactWikiContext: [
      'Sender type: system_notification',
      'Role summary: Example App account-security notification channel; usually sends login alerts.',
      'User action pattern: verify whether the login was yours; reset password only if abnormal.',
      'Risk alert: new-location login attempt.',
    ].join('\n'),
  };

  const summary = buildSummarizePrompt(source, 'Chinese');
  assert(summary.system.includes('Contact Wiki context'), 'Expected summary prompt to know how to use Wiki context');
  assert(summary.system.includes('current email evidence has priority'), 'Expected Wiki context to remain subordinate to current email');
  assert(summary.prompt.includes('Contact Wiki context'), 'Expected summary prompt to include Wiki context section');
  assert(summary.prompt.includes('account-security notification channel'), 'Expected summary prompt to include the Wiki role summary');

  const actions = buildActionSuggestionsPrompt(source, 'Chinese');
  assert(actions.prompt.includes('Contact Wiki context'), 'Expected action prompt to include Wiki context section');
  assert(actions.prompt.includes('new-location login attempt'), 'Expected action prompt to include Wiki risk context');

  const quickReplies = buildQuickRepliesPrompt(source, 'Chinese');
  assert(quickReplies.prompt.includes('Contact Wiki context'), 'Expected quick replies prompt to include Wiki context section');

  const keyInfo = buildKeyInfoPrompt(source, 'Chinese');
  assert(keyInfo.system.includes('For system/security senders'), 'Expected key info prompt to include scenario-specific Wiki guidance');
  assert(keyInfo.prompt.includes('Contact Wiki context'), 'Expected key info prompt to include Wiki context section');
  assert(keyInfo.prompt.includes('User action pattern'), 'Expected key info prompt to include Wiki action pattern');
}

function testJapaneseAssistantPromptsForbidEnglishLabels() {
  const source = {
    subject: 'Security alert',
    from: 'security@example.com',
    fromName: 'Security Team',
    snippet: 'Please verify this login today.',
    bodyText: 'Please verify this login today. https://example.com/verify',
  };

  const actions = buildActionSuggestionsPrompt(source, 'Japanese');
  assert(actions.system.includes('Japanese'), 'Expected action prompt to target Japanese');
  assert(actions.system.includes('Do not use English labels'), 'Expected Japanese action prompt to forbid English labels');
  assert(actions.system.includes('対応レベル'), 'Expected Japanese action prompt to provide localized label guidance');

  const quickReplies = buildQuickRepliesPrompt(source, 'Japanese');
  assert(quickReplies.system.includes('Do not use English labels'), 'Expected Japanese quick replies prompt to forbid English labels');

  const keyInfo = buildKeyInfoPrompt(source, 'Japanese');
  assert(keyInfo.system.includes('Return all user-facing text in the current app language: Japanese.'), 'Expected Japanese key info prompt to bind output to Japanese');
  assert(keyInfo.system.includes('Do not translate JSON keys'), 'Expected key info prompt to keep JSON keys stable');
}

function testKeyInfoPromptHandlesBounceRecipientsSafely() {
  const request = buildKeyInfoPrompt({
    subject: 'Undelivered Mail Returned to Sender',
    from: 'mailer-daemon@zoho.com.cn',
    fromName: 'MAILER-DAEMON',
    snippet: 'Final-Recipient: rfc822; account@nvidia.com Diagnostic-Code: smtp; 550 Access denied',
    bodyText: [
      'This message was created automatically by mail delivery software.',
      'Final-Recipient: rfc822; account@nvidia.com',
      'Diagnostic-Code: smtp; 550 5.4.1 Recipient address rejected: Access denied.',
    ].join('\n'),
  }, 'English');

  assert(request.system.includes('Final-Recipient'), 'Expected bounce prompt to mention Final-Recipient');
  assert(request.system.includes('Original-Recipient'), 'Expected bounce prompt to mention Original-Recipient');
  assert(request.system.includes('Diagnostic-Code'), 'Expected bounce prompt to mention Diagnostic-Code');
  assert(request.system.includes('MAILER-DAEMON'), 'Expected bounce prompt to explicitly exclude MAILER-DAEMON as target recipient');
  assert(request.system.includes('postmaster'), 'Expected bounce prompt to explicitly exclude postmaster as target recipient');
  assert(request.system.includes('check the original recipient address'), 'Expected fallback guidance when failed recipient is unavailable');
}

function testActionSuggestionsUseAiCategoryAndStableScoringForMarketing() {
  const request = buildActionSuggestionsPrompt({
    subject: 'Get going in 30 seconds',
    from: 'hello@browserbase.com',
    fromName: 'Browserbase',
    category: '广告/营销类',
    snippet: 'Launch the Playground and try a browser session.',
    bodyText: 'No code, no setup required. Launch the Playground to try Browserbase.',
  }, 'Chinese');

  assert(request.prompt.includes('AI category: 广告/营销类'), 'Expected action prompt to include the existing AI category');
  assert(request.prompt.includes('Category guidance:'), 'Expected action prompt to include category-aware guidance');
  assert(request.prompt.includes('Action score:'), 'Expected action prompt to include deterministic action score context');
  assert(request.prompt.includes('Marketing email'), 'Expected marketing category to constrain action suggestions');
  assert(request.system.includes('read, archive, unsubscribe'), 'Expected marketing actions to be intent-limited');
  assert(!request.system.includes('Each line must include: priority'), 'Expected old priority-based action format to be removed');
  assert(!request.system.includes('Each line must include: handling level'), 'Expected handling level to stop repeating on every action line');
}

function testEmailAiContextGatesBulkReplies() {
  const marketing = deriveEmailAIContext({
    subject: 'Save 80% today',
    from: 'news@send.projects-software.com',
    fromName: 'FRANZIS',
    headers: { 'list-unsubscribe': '<https://example.test/unsubscribe>' },
    snippet: 'Limited discount. Unsubscribe here.',
  });
  assert(marketing.senderType === 'marketing', 'Expected ESP/list mail to be marketing');
  assert(marketing.inboxClass === 'promotions', 'Expected marketing mail to map to promotions inbox class');
  assert(marketing.messageScenario === 'promotion_deal', 'Expected discount/list mail to use promotion_deal scenario');
  assert(marketing.replyNeeded === false, 'Expected marketing mail to be no-reply');
  assert(marketing.allowedQuickReplyIntents.length === 0, 'Expected marketing mail to disable quick replies');

  const work = deriveEmailAIContext({
    subject: 'Project rollout',
    from: 'alice@example.com',
    fromName: 'Alice',
    category: '工作/业务类',
    snippet: 'Can you confirm the rollout by Friday?',
  });
  assert(work.replyNeeded === true, 'Expected work request to need a reply');
  assert(work.inboxClass === 'primary', 'Expected work request to map to primary inbox class');
  assert(work.messageScenario === 'human_request', 'Expected work request to use human_request scenario');
  assert(work.allowedQuickReplyIntents.includes('clarify'), 'Expected work request to allow clarification quick replies');
}

function testEmailAiContextDoesNotSuppressSupportOrUnknownHumanMail() {
  const support = deriveEmailAIContext({
    subject: 'Need more details',
    from: 'support@example.com',
    fromName: 'Support Team',
    snippet: 'Please reply with a short description of the issue.',
  });
  assert(support.senderType !== 'system_notification', 'Expected support@ not to be treated as a pure system notification');
  assert(support.replyNeeded === true, 'Expected support@ with an explicit request to allow replies');

  const unknown = deriveEmailAIContext({
    subject: 'Question',
    from: 'person@example.com',
    fromName: 'Person',
    snippet: 'Can you check this when you have a moment?',
  });
  assert(unknown.replyNeeded === true, 'Expected unknown non-bulk human request not to be hard no-reply');
}

function testContentOnlyMarketingSignalsDoNotHardGateReplies() {
  const workDiscount = deriveEmailAIContext({
    subject: 'Project discount terms',
    from: 'alice@example.com',
    fromName: 'Alice',
    category: '工作/业务类',
    snippet: 'Can you confirm the discount terms for the client proposal?',
  });
  assert(workDiscount.senderType === 'work_contact', 'Expected work category to beat content-only discount wording');
  assert(workDiscount.replyNeeded === true, 'Expected work mail with discount wording to remain replyable');
}

function testForumNoReplyRelayCanStillBeReplyable() {
  const forum = deriveEmailAIContext({
    subject: '[Example Forum] New reply on your topic',
    from: 'noreply@mails.example.test',
    fromName: 'Forum User',
    snippet: 'Visit the topic or reply to this email to respond.',
    bodyText: 'A community member left feedback. Visit the topic or reply to this email to respond.',
  });
  assert(forum.senderType === 'community_feedback', 'Expected forum mail relay to use community_feedback sender type');
  assert(forum.inboxClass === 'community', 'Expected forum relay to map to community inbox class');
  assert(forum.messageScenario === 'community_feedback', 'Expected forum relay to use community_feedback scenario');
  assert(forum.replyNeeded === false, 'Expected forum relay route not to force quick replies by itself');
  assert(forum.allowedQuickReplyIntents.length === 0, 'Expected community relay to avoid sendable quick replies by default');
}

function testSecurityReplyToEmailDoesNotBecomeForumReply() {
  const security = deriveEmailAIContext({
    subject: 'Verify a login attempt from a new location',
    from: 'hello@example-app.test',
    fromName: 'Example App Team',
    snippet: 'If you did not attempt to login from a new place, reply to this email to let us know, and reset your password.',
    bodyText: [
      'Sign-In From a New Location',
      'We need to confirm a recent sign-in attempt from a new IP address.',
      'Your account tried to login from this location:',
      'If you did not attempt to login from a new place, reply to this email to let us know, and reset your password.',
    ].join('\n'),
  });
  assert(security.senderType === 'vendor' || security.senderType === 'system_notification', 'Expected login verification to stay account/security oriented');
  assert(security.messageScenario === 'security_alert', 'Expected login verification to use security_alert scenario');
  assert(security.overlays.securitySensitive === true, 'Expected login verification to be security sensitive');
  assert(security.replyNeeded === false, 'Expected account-security verification to avoid quick replies');
  assert(security.replyNeededReason !== 'forum notification supports reply', 'Expected reply-to-email wording not to trigger forum reply logic');
  assert(security.allowedQuickReplyIntents.length === 0, 'Expected security notification to disable quick replies');

  const projectThread = deriveEmailAIContext({
    subject: 'Project thread follow-up',
    from: 'alice@example.com',
    fromName: 'Alice',
    category: '工作/业务类',
    snippet: 'Can you review the current email thread?',
  });
  assert(projectThread.senderType === 'work_contact', 'Expected ordinary work thread wording to stay work_contact');
  assert(projectThread.replyNeeded === true, 'Expected ordinary work thread request to remain replyable');
}

function testEmailAiContextDerivesMainstreamScenarioRules() {
  const bounce = deriveEmailAIContext({
    subject: 'Undelivered Mail Returned to Sender',
    from: 'mailer-daemon@example.test',
    fromName: 'MAILER-DAEMON',
    snippet: 'Final-Recipient: rfc822; teammate@example.test Diagnostic-Code: 550 rejected',
    bodyText: 'This is an automatically generated Delivery Status Notification. Delivery to the following recipient failed permanently.',
  });
  assert(bounce.messageScenario === 'delivery_failure', 'Expected mailer-daemon mail to use delivery_failure scenario');
  assert(bounce.inboxClass === 'transactions', 'Expected delivery failure to map to transactions inbox class');
  assert(bounce.replyNeeded === false, 'Expected delivery failure not to need a reply');

  const calendar = deriveEmailAIContext({
    subject: 'Invitation: Product review @ Thu May 21',
    from: 'calendar@example.test',
    fromName: 'Calendar',
    headers: { 'content-class': 'urn:content-classes:calendarmessage' },
    snippet: 'Please RSVP to this meeting invitation.',
    bodyText: 'When: Thu May 21 10:00 AM. Please accept or decline.',
  });
  assert(calendar.messageScenario === 'calendar_scheduling', 'Expected calendar invite to use calendar_scheduling scenario');
  assert(calendar.overlays.timeSensitive === true, 'Expected calendar invite to be time sensitive');

  const newsletter = deriveEmailAIContext({
    subject: 'Weekly product updates',
    from: 'digest@example.test',
    fromName: 'Example Digest',
    headers: { 'list-id': 'digest.example.test' },
    snippet: 'This week: new integrations and product updates.',
  });
  assert(newsletter.messageScenario === 'newsletter_update', 'Expected list digest without deal language to use newsletter_update scenario');
  assert(newsletter.inboxClass === 'updates', 'Expected digest newsletter to map to updates inbox class');
  assert(newsletter.replyNeeded === false, 'Expected digest newsletter not to need replies');
}

function testScenarioGuidanceIsIncludedInPrompts() {
  const source = {
    subject: 'Verify a login attempt from a new location',
    from: 'hello@example-app.test',
    fromName: 'Example App Team',
    snippet: 'Your account tried to login from this location. If this was not you, reset your password.',
    bodyText: [
      'Sign-In From a New Location',
      'Your account tried to login from this location:',
      'If you did not attempt to login from a new place, reply to this email to let us know, and reset your password.',
    ].join('\n'),
  };
  const summary = buildSummarizePrompt(source, 'Chinese');
  assert(summary.prompt.includes('Message scenario: security_alert'), 'Expected summary prompt to include message scenario');
  assert(summary.prompt.includes('Inbox class: transactions'), 'Expected summary prompt to include inbox class');
  assert(summary.system.includes('Scenario-specific rules'), 'Expected summary prompt to include scenario-specific rules');

  const actions = buildActionSuggestionsPrompt(source, 'Chinese');
  assert(actions.prompt.includes('Security sensitive: yes'), 'Expected action prompt to expose security overlay');
  assert(actions.system.includes('For security_alert'), 'Expected action prompt to include security-specific action guidance');

  const keyInfo = buildKeyInfoPrompt(source, 'Chinese');
  assert(keyInfo.prompt.includes('Message scenario: security_alert'), 'Expected key info prompt to include scenario');
  assert(keyInfo.system.includes('For security_alert'), 'Expected key info prompt to include scenario-specific extraction guidance');
}

function run() {
  testTranslatePromptUsesLatestReply();
  testSummarizePromptIncludesActionSignals();
  testReplyPromptKeepsQuotedContextSeparate();
  testAssistantPromptsExposeStructuredAssistantSections();
  testContactWikiContextFeedsAssistantPromptsAsBackground();
  testJapaneseAssistantPromptsForbidEnglishLabels();
  testKeyInfoPromptHandlesBounceRecipientsSafely();
  testActionSuggestionsUseAiCategoryAndStableScoringForMarketing();
  testEmailAiContextGatesBulkReplies();
  testEmailAiContextDoesNotSuppressSupportOrUnknownHumanMail();
  testContentOnlyMarketingSignalsDoNotHardGateReplies();
  testForumNoReplyRelayCanStillBeReplyable();
  testSecurityReplyToEmailDoesNotBecomeForumReply();
  testEmailAiContextDerivesMainstreamScenarioRules();
  testScenarioGuidanceIsIncludedInPrompts();
  console.log('ai-prompts tests passed');
}

run();
