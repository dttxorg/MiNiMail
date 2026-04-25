import {
  buildActionView,
  buildProfileView,
  buildReplyView,
  buildSummaryView,
  parseEmailMessage,
  redactSensitiveEntities,
  sanitizeEmailHtml,
  splitEmailBlocks,
  normalizeEmailText,
} from '../src/shared/email-ai';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function testPlainTextEmail() {
  const parsed = await parseEmailMessage({
    kind: 'raw',
    source: [
      'Message-ID: <plain-1@example.com>',
      'Date: Sat, 18 Apr 2026 10:00:00 +0800',
      'From: Alice Example <alice@example.com>',
      'To: Bob Example <bob@example.com>',
      'Subject: Project update',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'Hello team,',
      '',
      'The deployment finished successfully.',
      '',
      'Best regards,',
      'Alice',
    ].join('\r\n'),
  });

  assert(parsed.messageId === '<plain-1@example.com>', 'Expected message-id to be parsed');
  assert(parsed.subject === 'Project update', 'Expected subject to be parsed');
  assert(parsed.plainText.includes('deployment finished successfully'), 'Expected normalized plain text');

  const blocks = splitEmailBlocks(parsed.plainText);
  assert(blocks.latest_reply.length > 0, 'Expected latest reply blocks for plain text mail');
  assert(blocks.signature.length > 0, 'Expected signature block to be separated');
}

async function testHtmlEmailAndSanitization() {
  const rawHtml = '<div><p>Hello <strong>World</strong></p><script>alert(1)</script><p><a href="https://example.com/bill">View bill</a></p></div>';
  const safeHtml = sanitizeEmailHtml(rawHtml);
  assert(!safeHtml.includes('<script'), 'Expected sanitizer to remove script tags');
  assert(safeHtml.includes('<strong>World</strong>'), 'Expected sanitizer to preserve safe formatting');

  const normalized = normalizeEmailText({ htmlBody: rawHtml });
  assert(normalized.plainText.includes('View bill'), 'Expected HTML link text to survive normalization');
  assert(
    normalized.links.some((link: { url: string }) => link.url === 'https://example.com/bill'),
    'Expected links to be collected'
  );
}

async function testMultiRoundReplySeparation() {
  const parsed = await parseEmailMessage({
    kind: 'raw',
    source: [
      'Message-ID: <reply-1@example.com>',
      'In-Reply-To: <root@example.com>',
      'References: <root@example.com> <mid@example.com>',
      'Date: Sat, 18 Apr 2026 11:00:00 +0800',
      'From: Bob Example <bob@example.com>',
      'To: Alice Example <alice@example.com>',
      'Subject: Re: Quarterly review',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'Sounds good, let’s ship it tomorrow.',
      '',
      'On Fri, Apr 17, 2026 at 5:30 PM Alice Example <alice@example.com> wrote:',
      '> Please review the budget table below.',
      '> We can ship on Monday if finance approves.',
    ].join('\r\n'),
  });

  const blocks = splitEmailBlocks(parsed.plainText);
  assert(blocks.latest_reply[0]?.text.includes('ship it tomorrow'), 'Expected newest reply content in latest_reply');
  assert(blocks.quoted_history[0]?.text.includes('Please review the budget table below'), 'Expected quoted history split out');

  const replyView = buildReplyView(parsed, blocks);
  assert(replyView.quotedHistory.includes('finance approves'), 'Expected reply view to retain quoted context');
  assert(replyView.references.length === 2, 'Expected references chain to survive parsing');
}

async function testSignatureAndDisclaimerDetection() {
  const parsed = await parseEmailMessage({
    kind: 'raw',
    source: [
      'Message-ID: <disclaimer@example.com>',
      'Date: Sat, 18 Apr 2026 12:00:00 +0800',
      'From: Finance Team <finance@example.com>',
      'To: Bob Example <bob@example.com>',
      'Subject: Invoice follow-up',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'Please approve invoice INV-2026-009 before 2026-04-21.',
      '',
      'Best regards,',
      'Olivia',
      'Finance Team',
      '+1 415 555 0188',
      '',
      'This message and any attachment are confidential and intended only for the recipient.',
    ].join('\r\n'),
  });

  const blocks = splitEmailBlocks(parsed.plainText);
  assert(blocks.signature.length > 0, 'Expected signature to be detected');
  assert(blocks.disclaimer.length > 0, 'Expected disclaimer to be detected');

  const profileView = buildProfileView(parsed, blocks);
  assert(profileView.phones.includes('+1 415 555 0188'), 'Expected phone number extraction for profile view');
}

async function testMarketingFooterAndActionView() {
  const parsed = await parseEmailMessage({
    kind: 'raw',
    source: [
      'Message-ID: <marketing@example.com>',
      'Date: Sat, 18 Apr 2026 13:00:00 +0800',
      'From: Shop Team <shop@example.com>',
      'To: Bob Example <bob@example.com>',
      'Subject: Special offer ending soon',
      'Content-Type: text/html; charset=UTF-8',
      '',
      '<html><body><p>Your renewal amount is $49.99 and the deadline is 2026-04-25.</p><ul><li>Confirm renewal</li><li>Update payment method</li></ul><p><a href="https://example.com/account">Manage subscription</a></p><p>Unsubscribe | Manage preferences | View in browser</p></body></html>',
    ].join('\r\n'),
  });

  const blocks = splitEmailBlocks(parsed.plainText);
  assert(blocks.footer.length > 0, 'Expected marketing footer block');
  assert(blocks.link_list.length > 0, 'Expected link_list block for action links');

  const actionView = buildActionView(parsed, blocks);
  assert(actionView.amounts.includes('$49.99'), 'Expected amount extraction');
  assert(actionView.deadlines.includes('2026-04-25'), 'Expected deadline extraction');
  assert(
    actionView.links.some((link: { text: string }) => link.text.includes('Manage subscription')),
    'Expected actionable link text'
  );
}

async function testMixedLanguageAndRedaction() {
  const parsed = await parseEmailMessage({
    kind: 'raw',
    source: [
      'Message-ID: <mixed@example.com>',
      'Date: Sat, 18 Apr 2026 14:00:00 +0800',
      'From: 张三 <zhangsan@contoso.com>',
      'To: Bob Example <bob@example.com>',
      'Cc: support@contoso.com',
      'Subject: 发票 Invoice 2026-2048',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      '你好 Bob，',
      '',
      'Please review order ORD-2026-2048 before 2026-05-01.',
      '地址：上海市浦东新区世纪大道100号',
      '联系电话：13800138000',
      '',
      '谢谢,',
      'Contoso 财务团队',
    ].join('\r\n'),
  });

  const blocks = splitEmailBlocks(parsed.plainText);
  const summaryView = buildSummaryView(parsed, blocks);
  assert(summaryView.latestReply.includes('Please review order'), 'Expected summary view to keep bilingual body');

  const redacted = redactSensitiveEntities(parsed, {
    names: true,
    companies: true,
    emails: true,
    phones: true,
    addresses: true,
    orderIds: true,
  });

  assert(redacted.redactionMap.length >= 5, 'Expected multiple redaction entries');
  assert(!JSON.stringify(redacted.redacted).includes('zhangsan@contoso.com'), 'Expected email to be redacted');
  assert(!JSON.stringify(redacted.redacted).includes('13800138000'), 'Expected phone to be redacted');
}

async function run() {
  await testPlainTextEmail();
  await testHtmlEmailAndSanitization();
  await testMultiRoundReplySeparation();
  await testSignatureAndDisclaimerDetection();
  await testMarketingFooterAndActionView();
  await testMixedLanguageAndRedaction();
  console.log('email-ai-preprocess tests passed');
}

void run();
