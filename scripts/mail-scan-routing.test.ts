import {
  parseEmailMessage,
  parseGitHubDedicatedResult,
  routeGitHubSmartFolder,
  runScanPipeline,
  resolveIntelligentScanMode,
  routeGenericSmartFolder,
  scanEmailLightweight,
} from '../src/shared/email-ai';
import { buildMailRoutingAdapter, type MailRoutingResultEntry } from '../src/renderer/utils/mailRoutingAdapter';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function parseRaw(source: string) {
  return parseEmailMessage({ kind: 'raw', source });
}

function testNewsletterShouldNotBeHighUrgency() {
  const result = scanEmailLightweight({
    subject: 'Weekly newsletter: top stories this week',
    from: 'news@insideapple.apple.com',
    from_name: 'Apple News',
    snippet: 'Here is what to read this weekend. Unsubscribe any time.',
    has_attachments: false,
  });

  assert(result.urgency_score < 35, `Expected newsletter urgency to stay low, got ${result.urgency_score}`);
  assert(result.recommended_depth === 'light', `Expected newsletter to remain light, got ${result.recommended_depth}`);
}

function testExplicitReviewApprovalReplyShouldBeHighlyActionable() {
  const result = scanEmailLightweight({
    subject: 'Please review and approve the contract today',
    from: 'legal@vendor.com',
    from_name: 'Vendor Legal',
    snippet: 'Please review, reply with approval, and sign before 5 PM today.',
    has_attachments: true,
  });

  assert(result.actionability_score >= 60, `Expected actionability to be high, got ${result.actionability_score}`);
  assert(result.recommended_depth !== 'light', `Expected non-light routing, got ${result.recommended_depth}`);
  const route = routeGenericSmartFolder(result);
  assert(route?.folder === 'Priority/Needs Reply' || route?.folder === 'Priority/Risk', `Expected explicit request mail to regain reply/risk routing, got ${route?.folder}`);
}

function testPreviewDoesNotAccidentallyBecomeNeedsReply() {
  const previewMail = {
    id: 'preview-mail',
    uid: 1,
    from: 'news@example.com',
    fromName: 'Newsletter',
    to: 'me@example.com',
    subject: 'Roadmap preview',
    date: new Date('2026-04-19T12:00:00Z'),
    snippet: 'Here is a preview of the roadmap update.',
    hasAttachments: false,
    isRead: false,
    isStarred: false,
    folder: 'INBOX',
    accountId: 1,
  };

  const adapter = buildMailRoutingAdapter({
    mails: [previewMail],
    routingResults: [
      {
        id: previewMail.id,
        routing: {
          kind: 'generic',
          light_scan: {
            importance_score: 12,
            urgency_score: 5,
            actionability_score: 0,
            risk_score: 0,
            density_score: 32,
            relationship_score: 4,
            total_light_score: 16,
            force_upgrade: false,
            recommended_depth: 'light',
            reasons: ['dense preview with enough context for deeper analysis'],
          },
          smart_folder: null,
        },
      } satisfies MailRoutingResultEntry,
    ],
    accountEmails: ['me@example.com'],
  });

  const membership = adapter.mailFolderMembership[previewMail.id] || [];
  assert(
    !membership.includes('Priority/Needs Reply'),
    `Expected preview mail not to hit Priority/Needs Reply, got ${membership.join(', ')}`
  );
}

function testWeakInteractionMailIsNotNeedsReply() {
  const result = scanEmailLightweight({
    subject: 'Monthly account update',
    from: 'updates@example.com',
    from_name: 'Account Updates',
    snippet: 'Please see the latest summary and let us know if you have questions.',
    has_attachments: false,
  });

  const route = routeGenericSmartFolder(result);
  assert(result.actionability_score < 60, `Expected weak interaction mail to stay below strong actionability, got ${result.actionability_score}`);
  assert(route?.folder !== 'Priority/Needs Reply', `Expected weak interaction mail not to route to Needs Reply, got ${route?.folder}`);
}

function testExplicitReplyRequestReturnsToNeedsReply() {
  const result = scanEmailLightweight({
    subject: 'Can you reply by tomorrow?',
    from: 'manager@example.com',
    from_name: 'Manager',
    snippet: 'Please reply with your confirmation by tomorrow noon.',
    body_text: 'Can you reply with your confirmation by tomorrow noon so we can finalize the agenda?',
  });

  const route = routeGenericSmartFolder(result);
  assert(result.actionability_score >= 42, `Expected explicit reply request to recover actionability, got ${result.actionability_score}`);
  assert(route?.folder === 'Priority/Needs Reply', `Expected explicit reply request to route to Needs Reply, got ${route?.folder}`);
}

function testDeliveryFailureRoutesToHighPriority() {
  const pipeline = runScanPipeline({
    subject: 'Undelivered Mail Returned to Sender',
    from: 'mailer-daemon@zoho.com.cn',
    fromName: 'mailer-daemon',
    snippet: 'This message was created automatically by mail delivery software. Recipient address rejected: Access denied.',
    bodyText: [
      'This message was created automatically by mail delivery software.',
      'A message that you sent could not be delivered to one or more of its recipients. This is a permanent error.',
      'Recipient address rejected: Access denied.',
      'Action: failed',
    ].join('\n'),
  });

  assert(pipeline.kind === 'generic', `Expected delivery failure to stay generic, got ${pipeline.kind}`);
  assert(
    pipeline.smart_folder?.folder === 'Priority/High',
    `Expected delivery failure to route to Priority/High, got ${pipeline.smart_folder?.folder}`
  );
}

function testForceUpgradeTriggersForSecurityAndImportantContacts() {
  const security = runScanPipeline({
    subject: 'Security alert: unusual login detected',
    from: 'alerts@example.com',
    fromName: 'Security Team',
    snippet: 'Immediate action required to secure your account.',
  });

  assert(security.light_scan.force_upgrade, 'Expected security alert to force-upgrade');
  assert(security.light_scan.recommended_depth === 'advanced', 'Expected security alert to force advanced depth');

  const important = runScanPipeline({
    subject: 'Quick question',
    from: 'vip@example.com',
    fromName: 'VIP Contact',
    snippet: 'Can you reply today?',
    importantContacts: ['vip@example.com'],
  });

  assert(important.light_scan.force_upgrade, 'Expected important contact to force-upgrade');
  assert(important.light_scan.recommended_depth !== 'light', 'Expected important contact to upgrade depth');
}

async function testGitHubReviewRequestedRoutesToActionFolder() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [openai/codex] Re: Improve triage scoring (#42)',
    'Date: Sat, 18 Apr 2026 11:30:00 +0000',
    'Message-ID: <msg-pr-1@github.com>',
    'X-GitHub-Reason: review_requested',
    'X-GitHub-Recipient: user',
    'List-ID: openai/codex <codex.openai.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'alice requested your review on pull request #42.',
    'https://github.com/openai/codex/pull/42',
  ].join('\r\n'));

  const github = parseGitHubDedicatedResult(parsed);
  const route = routeGitHubSmartFolder(github);

  assert(
    route.folder === 'GitHub/Review Requests' || route.folder === 'GitHub/Needs Action',
    `Expected review requested route, got ${route.folder}`
  );
}

async function testGitHubSecurityAlertRoutesToSecurity() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [owner/repo] Dependabot alert',
    'Date: Sat, 18 Apr 2026 12:15:00 +0000',
    'Message-ID: <msg-security-1@github.com>',
    'X-GitHub-Reason: security_alert',
    'List-ID: owner/repo <repo.owner.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'A critical security vulnerability needs your attention.',
    'https://github.com/owner/repo/security/dependabot/42',
  ].join('\r\n'));

  const github = parseGitHubDedicatedResult(parsed);
  const route = routeGitHubSmartFolder(github);
  assert(route.folder === 'GitHub/Security', `Expected security route, got ${route.folder}`);
}

async function testGitHubAccountSecurityMailRoutesToSecurity() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [GitHub] Please verify your device',
    'Date: Sat, 18 Apr 2026 12:25:00 +0000',
    'Message-ID: <msg-gh-account-security@github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Please verify your device because we noticed a sign-in attempt to your GitHub account.',
    'https://github.com/sessions/verified-device',
  ].join('\r\n'));

  const github = parseGitHubDedicatedResult(parsed);
  const route = routeGitHubSmartFolder(github);
  assert(github.event_type === 'security_alert', `Expected GitHub account security mail to become security_alert, got ${github.event_type}`);
  assert(route.folder === 'GitHub/Security', `Expected GitHub account security mail to route to GitHub/Security, got ${route.folder}`);
}

function testNonGithubMailMentioningGithubDoesNotRouteGithub() {
  const pipeline = runScanPipeline({
    subject: 'Welcome to Honcho',
    from: 'vince@plasticlabs.ai',
    fromName: 'Honcho',
    snippet: 'Connect your GitHub account to import repositories later.',
    bodyText: 'You can connect GitHub or GitLab whenever you want. No action is required right now.',
  });

  assert(pipeline.kind === 'generic', `Expected non-GitHub onboarding mail to remain generic, got ${pipeline.kind}`);
}

function testLegalNewsletterDoesNotTriggerLegalContractUpgrade() {
  const pipeline = runScanPipeline({
    subject: 'Why startup contracts are changing venture investing',
    from: 'editor@newsletter.example.com',
    fromName: 'Market Briefing',
    snippet: 'This week we look at how AI startup contracts are changing investor behavior.',
    bodyText: 'Read our analysis of how startup contracts, pricing, and market signals affect investing this quarter.',
  });

  assert(
    !pipeline.light_scan.reasons.includes('force-upgrade:legal_contract'),
    `Expected legal/newsletter sample not to trigger legal_contract, got ${pipeline.light_scan.reasons.join(' | ')}`
  );
}

function testBillingSuspensionMailDoesNotTriggerScheduleChange() {
  const pipeline = runScanPipeline({
    subject: 'Action required: your billing account 0131B7 is past due',
    from: 'googlecloud-noreply@google.com',
    fromName: 'Google Cloud',
    snippet: 'Your project is at risk of suspension if payment is not resolved.',
    bodyText: 'Your project is at risk of suspension because the billing account is past due. Resolve payment to avoid service disruption.',
  });

  assert(
    !pipeline.light_scan.reasons.includes('force-upgrade:schedule_change'),
    `Expected billing suspension sample not to trigger schedule_change, got ${pipeline.light_scan.reasons.join(' | ')}`
  );
}

async function testGitHubRoutineUpdateShouldNotRouteToNeedsAction() {
  const parsed = await parseRaw([
    'From: GitHub <notifications@github.com>',
    'To: User <user@example.com>',
    'Subject: [owner/repo] Release v1.4.0 is now available',
    'Date: Sat, 18 Apr 2026 12:20:00 +0000',
    'Message-ID: <msg-release-1@github.com>',
    'X-GitHub-Reason: subscribed',
    'List-ID: owner/repo <repo.owner.github.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'A new release is available for owner/repo.',
    'https://github.com/owner/repo/releases/tag/v1.4.0',
  ].join('\r\n'));

  const github = parseGitHubDedicatedResult(parsed);
  const route = routeGitHubSmartFolder(github);
  assert(route.folder !== 'GitHub/Needs Action', `Expected routine update not to enter Needs Action, got ${route.folder}`);
}

function testThresholdRouting() {
  const low = scanEmailLightweight({
    subject: 'Weekend reads',
    from: 'newsletter@example.com',
    snippet: 'Top stories and newsletter digest.',
  });
  assert(low.total_light_score < 35, `Expected low total score, got ${low.total_light_score}`);
  assert(low.recommended_depth === 'light', `Expected light routing, got ${low.recommended_depth}`);

  const normal = scanEmailLightweight({
    subject: 'Please review the updated project plan and reply by tomorrow',
    from: 'ops@example.com',
    snippet: 'Please review the updated project plan, confirm the agenda, and reply by tomorrow 10:00.',
    has_attachments: true,
  });
  assert(normal.total_light_score >= 35 && normal.total_light_score < 65, `Expected normal band score, got ${normal.total_light_score}`);
  assert(normal.recommended_depth === 'normal', `Expected normal routing, got ${normal.recommended_depth}`);

  const advanced = scanEmailLightweight({
    subject: 'Urgent contract approval required today',
    from: 'legal@example.com',
    snippet: 'Please review, approve, sign, and return the agreement today. Security notice attached.',
    has_attachments: true,
  });
  assert(advanced.recommended_depth === 'advanced', `Expected advanced routing, got ${advanced.recommended_depth}`);
}

function testLowLightScoreEscalatesToDeepScan() {
  const routing = runScanPipeline({
    subject: 'Weekend reads',
    from: 'newsletter@example.com',
    snippet: 'Top stories and newsletter digest.',
  });

  const effectiveMode = resolveIntelligentScanMode(routing, 'smart');
  assert(routing.light_scan.total_light_score < 35, `Expected low score sample to stay under 35, got ${routing.light_scan.total_light_score}`);
  assert(effectiveMode === 'deep', `Expected low-score mail to escalate to deep scan, got ${effectiveMode}`);
}

function testExplicitLightScanDoesNotEscalate() {
  const routing = runScanPipeline({
    subject: 'Weekend reads',
    from: 'newsletter@example.com',
    fromName: 'Newsletter',
    snippet: 'A calm digest with articles to read later.',
  });

  const effectiveMode = resolveIntelligentScanMode(routing, 'light');
  assert(effectiveMode === 'light', `Expected explicit light mode to stay light, got ${effectiveMode}`);
}

async function run() {
  testNewsletterShouldNotBeHighUrgency();
  testExplicitReviewApprovalReplyShouldBeHighlyActionable();
  testPreviewDoesNotAccidentallyBecomeNeedsReply();
  testWeakInteractionMailIsNotNeedsReply();
  testExplicitReplyRequestReturnsToNeedsReply();
  testDeliveryFailureRoutesToHighPriority();
  testForceUpgradeTriggersForSecurityAndImportantContacts();
  testThresholdRouting();
  testLowLightScoreEscalatesToDeepScan();
  testExplicitLightScanDoesNotEscalate();
  await testGitHubReviewRequestedRoutesToActionFolder();
  await testGitHubSecurityAlertRoutesToSecurity();
  await testGitHubAccountSecurityMailRoutesToSecurity();
  await testGitHubRoutineUpdateShouldNotRouteToNeedsAction();
  testNonGithubMailMentioningGithubDoesNotRouteGithub();
  testLegalNewsletterDoesNotTriggerLegalContractUpgrade();
  testBillingSuspensionMailDoesNotTriggerScheduleChange();
  console.log('mail-scan-routing tests passed');
}

void run();
