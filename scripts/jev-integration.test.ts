import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildJevRequest,
  parseJevResponse,
  getChoiceAnswer,
  getScoreAnswer,
  getNoulAnswer,
} from '../src/shared/email-ai/jev/client';
import {
  classifyMailWithJev,
  buildClassifyState,
  buildTriageQuestions,
} from '../src/shared/email-ai/jev/classifier';
import {
  compactThreadWithJev,
  buildThreadCompactionState,
  buildThreadQuestions,
} from '../src/shared/email-ai/jev/threadCompactor';
import type {
  JevAsker,
  JevQuestions,
  JevResponse,
  JevState,
  JevThreadMailInput,
} from '../src/shared/email-ai/jev/types';

// ===========================================================================
// Test 1: Jev HTTP Request & Response parsing
// ===========================================================================

test('jev client: builds standard TypeSafe request envelope', () => {
  const req = buildJevRequest(
    { apiKey: 'ts_test_key_123', baseUrl: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest' },
    { context: 'test' },
    {
      q1: { type: 'noul', instructions: 'Is this active?' },
    },
  );

  assert.equal(req.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.authorization, 'Bearer ts_test_key_123');
  assert.equal(req.headers['content-type'], 'application/json');

  const body = JSON.parse(req.body);
  assert.equal(body.model, 'jev-latest');
  assert.deepEqual(body.state, { context: 'test' });
  assert.ok(body.questions.q1);
});

test('jev client: parses valid Jev response with primitives', () => {
  const rawJson = JSON.stringify({
    model: 'jev-latest',
    answers: {
      cat: { type: 'choice', choice: 'transactional', confidence: 0.95 },
      score: { type: 'score', score: 85, confidence: 0.9 },
      flag: { type: 'noul', noul: 0.88 },
    },
  });

  const parsed = parseJevResponse(200, true, rawJson);
  assert.equal(parsed.model, 'jev-latest');

  const cat = getChoiceAnswer(parsed.answers, 'cat', 'inbox');
  assert.equal(cat.choice, 'transactional');
  assert.equal(cat.confidence, 0.95);

  const score = getScoreAnswer(parsed.answers, 'score');
  assert.equal(score.score, 85);
  assert.equal(score.confidence, 0.9);

  const noul = getNoulAnswer(parsed.answers, 'flag');
  assert.equal(noul, 0.88);
});

test('jev client: rejects malformed or HTTP error response', () => {
  assert.throws(() => parseJevResponse(500, false, 'Internal Server Error'), /failed \(500\)/);
  assert.throws(() => parseJevResponse(200, true, 'not json'), /malformed JSON/);
  assert.throws(() => parseJevResponse(200, true, JSON.stringify({ wrong: true })), /missing answers/);
});

// ===========================================================================
// Test 2: Email Classification with Confidence Gating
// ===========================================================================

test('jev classifier: accurately classifies high-confidence email', async () => {
  const mockAsker: JevAsker = {
    async ask(_state: JevState, questions: JevQuestions): Promise<JevResponse> {
      assert.ok(questions['category_mail_1']);
      assert.ok(questions['priority_mail_1']);
      assert.ok(questions['action_mail_1']);
      assert.ok(questions['urgency_mail_1']);

      return {
        answers: {
          category_mail_1: { type: 'choice', choice: 'inbox', confidence: 0.92 },
          priority_mail_1: { type: 'choice', choice: 'high', confidence: 0.88 },
          action_mail_1: { type: 'noul', noul: 0.91 },
          urgency_mail_1: { type: 'score', score: 85, confidence: 0.85 },
        },
      };
    },
  };

  const result = await classifyMailWithJev(mockAsker, {
    id: 'mail_1',
    subject: 'Urgent: Contract sign-off required today',
    from: 'boss@company.com',
    snippet: 'Please review the updated agreement and approve by 5pm.',
    hasAttachment: true,
  }, { confidenceThreshold: 0.8 });

  assert.equal(result.mailId, 'mail_1');
  assert.equal(result.category, 'inbox');
  assert.equal(result.priority, 'high');
  assert.equal(result.actionRequired, true);
  assert.equal(result.urgencyScore, 85);
  assert.equal(result.isHighConfidence, true);
});

test('jev classifier: marks low-confidence decision for fallback', async () => {
  const mockAsker: JevAsker = {
    async ask(): Promise<JevResponse> {
      return {
        answers: {
          category_mail_2: { type: 'choice', choice: 'newsletter', confidence: 0.52 },
          priority_mail_2: { type: 'choice', choice: 'low', confidence: 0.60 },
          action_mail_2: { type: 'noul', noul: 0.2 },
          urgency_mail_2: { type: 'score', score: 10, confidence: 0.5 },
        },
      };
    },
  };

  const result = await classifyMailWithJev(mockAsker, {
    id: 'mail_2',
    subject: 'Ambiguous subject',
    from: 'someone@example.com',
    snippet: 'Just a short note with unclear context.',
  }, { confidenceThreshold: 0.8 });

  assert.equal(result.isHighConfidence, false);
});

// ===========================================================================
// Test 3: Thread Context Compaction (整理邮件脉络与噪音修剪)
// ===========================================================================

test('jev thread compactor: prunes conversational chatter and keeps core lineage', async () => {
  const threadMails: JevThreadMailInput[] = [
    {
      id: 'm1',
      from: 'alice@company.com',
      date: '2026-06-10T10:00:00Z',
      subject: 'New Website Launch Timeline',
      snippet: 'We must launch the website redesign by June 30. Can backend deliver the API by June 20?',
      bodyText: 'We must launch the website redesign by June 30. Can backend deliver the API by June 20?',
    },
    {
      id: 'm2',
      from: 'bob@company.com',
      date: '2026-06-10T10:05:00Z',
      subject: 'Re: New Website Launch Timeline',
      snippet: 'Thanks Alice, received!',
      bodyText: 'Thanks Alice, received! Will check with team.',
    },
    {
      id: 'm3',
      from: 'bob@company.com',
      date: '2026-06-11T09:00:00Z',
      subject: 'Re: New Website Launch Timeline',
      snippet: 'Backend commits to deliver API v2 staging on June 19.',
      bodyText: 'Backend commits to deliver API v2 staging on June 19. Needs security audit token by June 18.',
    },
    {
      id: 'm4',
      from: 'charlie@company.com',
      date: '2026-06-11T09:10:00Z',
      subject: 'Re: New Website Launch Timeline',
      snippet: 'Got it. +1',
      bodyText: 'Got it. +1',
    },
    // Recent 2 emails (pinned by default)
    {
      id: 'm5',
      from: 'david@company.com',
      date: '2026-06-12T14:00:00Z',
      subject: 'Re: New Website Launch Timeline',
      snippet: 'Security team will issue token on June 17.',
      bodyText: 'Security team will issue token on June 17.',
    },
    {
      id: 'm6',
      from: 'alice@company.com',
      date: '2026-06-12T15:00:00Z',
      subject: 'Re: New Website Launch Timeline',
      snippet: 'Great, all agreed. Proceeding with schedule.',
      bodyText: 'Great, all agreed. Proceeding with schedule.',
    },
  ];

  const mockAsker: JevAsker = {
    async ask(state: JevState, questions: JevQuestions): Promise<JevResponse> {
      // Questions asked only for candidate older emails m1..m4
      assert.ok(questions['keep_m1']);
      assert.ok(questions['keep_m2']);
      assert.ok(questions['keep_m3']);
      assert.ok(questions['keep_m4']);
      assert.equal(questions['keep_m5'], undefined); // recent preserved
      assert.equal(questions['keep_m6'], undefined); // recent preserved

      return {
        answers: {
          // m1: Core requirement + open loop
          keep_m1: { type: 'noul', noul: 0.95 },
          loop_m1: { type: 'noul', noul: 0.90 },
          commit_m1: { type: 'noul', noul: 0.10 },

          // m2: Superficial chatter "Thanks received" -> PRUNE
          keep_m2: { type: 'noul', noul: 0.12 },
          loop_m2: { type: 'noul', noul: 0.05 },
          commit_m2: { type: 'noul', noul: 0.02 },

          // m3: Critical commitment + open loop
          keep_m3: { type: 'noul', noul: 0.92 },
          loop_m3: { type: 'noul', noul: 0.75 },
          commit_m3: { type: 'noul', noul: 0.96 },

          // m4: Superficial chatter "Got it. +1" -> PRUNE
          keep_m4: { type: 'noul', noul: 0.08 },
          loop_m4: { type: 'noul', noul: 0.01 },
          commit_m4: { type: 'noul', noul: 0.01 },
        },
      };
    },
  };

  const result = await compactThreadWithJev(mockAsker, 'thread_website_launch', threadMails, {
    preserveRecentMails: 2,
    keepThreshold: 0.5,
  });

  assert.equal(result.originalMailCount, 6);
  // Kept: m1 (informative), m3 (informative), m5 (recent), m6 (recent). m2 and m4 pruned!
  assert.equal(result.keptMailCount, 4);

  const m2Decision = result.decisions.find((d) => d.mailId === 'm2');
  assert.equal(m2Decision?.kept, false);
  assert.equal(m2Decision?.reason, 'redundant_chatter');

  const m4Decision = result.decisions.find((d) => d.mailId === 'm4');
  assert.equal(m4Decision?.kept, false);
  assert.equal(m4Decision?.reason, 'redundant_chatter');

  const m1Decision = result.decisions.find((d) => d.mailId === 'm1');
  assert.equal(m1Decision?.kept, true);
  assert.equal(m1Decision?.reason, 'informative');

  // Check timeline extraction
  assert.deepEqual(
    result.compactedTimeline.map((t) => t.mailId),
    ['m1', 'm3', 'm5', 'm6'],
  );

  // Check commitments & open loops extracted
  assert.ok(result.commitments.some((c) => c.includes('Commitment stated')));
  assert.ok(result.openLoops.some((l) => l.includes('Follow-up item raised')));
});

// ===========================================================================
// Test 4: Privacy & Sanitization Integration
// ===========================================================================

test('jev privacy: redacts sensitive phone numbers and emails in state', () => {
  const sensitiveMail = {
    id: 'sec_1',
    subject: 'Secret client contact info: Call 13800138000',
    from: 'ceo@confidential.com',
    fromName: 'CEO Confidential',
    bodyText: 'Please send funds of $50,000 to card 6222021234567890123 for user alice@secret.org',
  };

  const state = buildClassifyState(sensitiveMail);
  const emailState = (state as any).email;

  // Sensitive card/phone/email should be redacted by redactSensitiveEntities
  assert.ok(!emailState.subject.includes('13800138000'));
  assert.ok(!emailState.snippet.includes('6222021234567890123'));
});
