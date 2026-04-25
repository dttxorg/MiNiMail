import { buildMailAiSnapshot, extractReadableEmailText } from '../src/renderer/utils/emailContent';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testReadableTextExcludesQuotedAndSignatureNoise() {
  const text = extractReadableEmailText({
    subject: 'Re: Quarterly review',
    from: 'bob@example.com',
    fromName: 'Bob',
    to: 'alice@example.com',
    date: new Date('2026-04-18T10:00:00Z'),
    snippet: 'Thanks — see below',
    bodyText: [
      'Please approve the budget and confirm by 2026-04-21.',
      '',
      'Best regards,',
      'Bob',
      'Finance Team',
      '',
      'On Fri, Alice wrote:',
      '> Here is the original quote history.',
      '',
      'Unsubscribe | Manage preferences',
    ].join('\n'),
  }, { stripUrls: true });

  assert(text.includes('Please approve the budget'), 'Expected latest reply to remain');
  assert(!text.includes('On Fri, Alice wrote'), 'Expected quoted history to be excluded');
  assert(!text.includes('Unsubscribe'), 'Expected footer noise to be excluded');
}

function testMailSnapshotRetainsActionStructure() {
  const snapshot = buildMailAiSnapshot({
    subject: 'Invoice due',
    from: 'billing@example.com',
    fromName: 'Billing Team',
    to: 'me@example.com',
    date: new Date('2026-04-18T12:00:00Z'),
    snippet: 'Your invoice is due soon',
    bodyHtml: '<p>Please pay invoice INV-2026-88 before 2026-04-30.</p><p><a href="https://example.com/pay">Pay invoice</a></p><p>Total due: $88.00</p>',
  });

  assert(snapshot.actionView.deadlines.includes('2026-04-30'), 'Expected deadline extraction');
  assert(snapshot.actionView.amounts.includes('$88.00'), 'Expected amount extraction');
  assert(snapshot.actionView.links.some((link) => link.text.includes('Pay invoice')), 'Expected anchor text preservation');
}

function run() {
  testReadableTextExcludesQuotedAndSignatureNoise();
  testMailSnapshotRetainsActionStructure();
  console.log('email-ai-integration tests passed');
}

run();
