import {
  extractSensitiveCandidates,
  mergeOverlappingEntities,
  normalizePlaceholderAssignment,
  redactSensitiveEntities,
  restoreSensitiveEntities,
  type RedactionCandidate,
} from '../src/shared/email-ai';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testBusinessEmailRedaction() {
  const text = 'Hi Alice Zhang,\nPlease contact me at alice@contoso.com or +1 (415) 555-0188.\nRegards,\nContoso Ltd';
  const result = redactSensitiveEntities(text, {
    subject: 'Invoice follow-up',
    from: [{ name: 'Alice Zhang', address: 'alice@contoso.com' }],
  });

  assert(result.redactedText.includes('[PERSON_1]'), 'Expected person placeholder');
  assert(result.redactedText.includes('[EMAIL_1]'), 'Expected email placeholder');
  assert(result.redactedText.includes('[PHONE_1]'), 'Expected phone placeholder');
  assert(result.redactedText.includes('[ORG_1]'), 'Expected org placeholder');
}

function testMixedLanguageRedaction() {
  const text = '\u5f20\u4e09\uff0c\u8bf7\u8054\u7cfb zhangsan@example.com\u3002\u5730\u5740\uff1a\u4e0a\u6d77\u5e02\u6d66\u4e1c\u65b0\u533a\u4e16\u7eaa\u5927\u9053100\u53f7\u3002';
  const result = redactSensitiveEntities(text, {
    from: [{ name: '\u5f20\u4e09', address: 'zhangsan@example.com' }],
  });

  assert(result.redactedText.includes('[PERSON_1]'), 'Expected Chinese person placeholder');
  assert(result.redactedText.includes('[EMAIL_1]'), 'Expected mixed-language email placeholder');
  assert(result.redactedText.includes('[ADDRESS_1]'), 'Expected Chinese address placeholder');
}

function testSignatureEmailRedaction() {
  const text = 'Best regards,\nOlivia Brown\nSenior Counsel\nAcme Legal LLC\nolivia@acmelegal.com';
  const result = redactSensitiveEntities(text);
  assert(result.redactedText.includes('[PERSON_1]'), 'Expected signature name redacted');
  assert(result.redactedText.includes('[ORG_1]'), 'Expected signature org redacted');
  assert(result.redactedText.includes('[EMAIL_1]'), 'Expected signature email redacted');
}

function testMultipleEmailsAndPhonesReusePlaceholders() {
  const text = 'Reach alice@example.com or alice@example.com. Backup line: +44 20 7946 0958, +44 20 7946 0958.';
  const result = redactSensitiveEntities(text);
  const emailEntities = result.entities.filter((entity) => entity.type === 'EMAIL');
  const phoneEntities = result.entities.filter((entity) => entity.type === 'PHONE');

  assert(emailEntities.length === 2, 'Expected repeated email entities to be tracked twice');
  assert(emailEntities[0].placeholder === emailEntities[1].placeholder, 'Expected same email placeholder reuse');
  assert(phoneEntities[0].placeholder === phoneEntities[1].placeholder, 'Expected same phone placeholder reuse');
}

function testOrderAndTicketIds() {
  const text = 'Order ID: ORD-2026-7781\nTicket: CASE-998812\nPR #42 should stay visible.';
  const result = redactSensitiveEntities(text);
  assert(result.redactedText.includes('[ID_1]'), 'Expected order id placeholder');
  assert(result.redactedText.includes('[ID_2]'), 'Expected ticket id placeholder');
  assert(result.redactedText.includes('PR #42'), 'Expected PR number preserved');
}

function testSensitiveUrlParams() {
  const text = 'Open https://example.com/reset?token=abc123&id=42&email=alice@example.com now.';
  const result = redactSensitiveEntities(text);
  assert(result.redactedText.includes('token=[SECRET_1]'), 'Expected token parameter redacted');
  assert(result.redactedText.includes('id=42'), 'Expected non-sensitive numeric query param preserved');
  assert(result.redactedText.includes('email=[SECRET_2]'), 'Expected sensitive query email redacted as secret');
}

function testAddressRedaction() {
  const text = 'Ship to 1234 Market Street, San Francisco, CA 94103 before Friday.';
  const result = redactSensitiveEntities(text);
  assert(result.redactedText.includes('[ADDRESS_1]'), 'Expected street address redacted');
  assert(result.redactedText.includes('before Friday'), 'Expected sentence structure preserved');
}

function testRestoreSensitiveEntities() {
  const text = 'Contact Alice via alice@example.com.';
  const result = redactSensitiveEntities(text);
  const restored = restoreSensitiveEntities(result.redactedText, result.redactionMap);
  assert(restored === text, 'Expected restored text to match original');
}

function testNormalizePlaceholderAssignmentAndMerge() {
  const candidates: RedactionCandidate[] = [
    { type: 'EMAIL', original: 'alice@example.com', normalized: 'alice@example.com', start: 10, end: 27, score: 0.98 },
    { type: 'PERSON', original: 'Alice', normalized: 'alice', start: 10, end: 15, score: 0.5 },
    { type: 'EMAIL', original: 'alice@example.com', normalized: 'alice@example.com', start: 50, end: 67, score: 0.98 },
  ];
  const merged = mergeOverlappingEntities(candidates);
  const assigned = normalizePlaceholderAssignment(merged);
  assert(merged.length === 2, `Expected merged candidates to drop overlap, got ${merged.length}`);
  assert(assigned[0].placeholder === assigned[1].placeholder, 'Expected repeated email to share placeholder');
}

function run() {
  testBusinessEmailRedaction();
  testMixedLanguageRedaction();
  testSignatureEmailRedaction();
  testMultipleEmailsAndPhonesReusePlaceholders();
  testOrderAndTicketIds();
  testSensitiveUrlParams();
  testAddressRedaction();
  testRestoreSensitiveEntities();
  testNormalizePlaceholderAssignmentAndMerge();
  console.log('email-redaction tests passed');
}

run();
