import {
  buildActionSuggestionsPrompt,
  buildKeyInfoPrompt,
  buildQuickRepliesPrompt,
  buildReplyPrompt,
  buildSummarizePrompt,
  buildTranslatePrompt,
} from '../src/shared/email-ai/aiPrompts';

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
  assert(request.system.includes('Draft the actual reply'), 'Expected reply prompt to produce sendable reply content');
  assert(request.system.includes('Never include analysis headings'), 'Expected reply prompt to forbid assistant-analysis sections in sendable replies');
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
  assert(actions.system.includes('bullet'), 'Expected action suggestions to request concise bullet output');
  assert(actions.system.includes('Action score'), 'Expected action suggestions to use deterministic action score');
  assert(actions.system.includes('handling level'), 'Expected action suggestions to require a stable handling level');
  assert(actions.system.includes('evidence'), 'Expected action suggestions to require evidence');
  assert(actions.system.includes('Line 1 must be the overall handling level'), 'Expected action prompt to separate the overall handling level from action lines');
  assert(actions.system.includes('Do not repeat the handling level on every action line'), 'Expected action prompt to forbid repeating the handling level on every bullet');
  assert(actions.system.includes('generic advice'), 'Expected action prompt to explicitly avoid generic advice');
  assert(actions.system.includes('Do not output free-form High/Medium/Low priority labels'), 'Expected action prompt to avoid drifting priority labels');
  assert(actions.prompt.includes('Detected deadlines:'), 'Expected action prompt to include deadline context');
  assert(actions.prompt.includes('Detected amounts:'), 'Expected action prompt to include amount context');
  assert(actions.system.includes('Chinese'), 'Expected action prompt to enforce target language');

  const quickReplies = buildQuickRepliesPrompt(source, 'Chinese');
  assert(quickReplies.system.includes('exactly 3'), 'Expected quick replies prompt to request three options');
  assert(quickReplies.system.includes('different intent'), 'Expected quick replies to request varied intents');
  assert(quickReplies.system.includes('clarification'), 'Expected quick replies to include a clarification variant');
  assert(quickReplies.prompt.includes('Latest reply:'), 'Expected quick replies prompt to include latest reply context');

  const keyInfo = buildKeyInfoPrompt(source, 'Chinese');
  assert(keyInfo.system.includes('标签: 值'), 'Expected key info prompt to request localized label/value format');
  assert(keyInfo.system.includes('actionable facts'), 'Expected key info prompt to prioritize useful facts');
  assert(keyInfo.system.includes('Do not fill'), 'Expected key info prompt to avoid low-value metadata');
  assert(keyInfo.prompt.includes('Detected links:'), 'Expected key info prompt to include link context');
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
  assert(actions.system.includes('対応レベル'), 'Expected Japanese action prompt to provide localized handling-level guidance');

  const quickReplies = buildQuickRepliesPrompt(source, 'Japanese');
  assert(quickReplies.system.includes('Do not use English labels'), 'Expected Japanese quick replies prompt to forbid English labels');

  const keyInfo = buildKeyInfoPrompt(source, 'Japanese');
  assert(keyInfo.system.includes('ラベル: 値'), 'Expected Japanese key info prompt to request localized label format');
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
  assert(!request.system.includes('Each line must include: priority'), 'Expected old priority-based action format to be removed');
  assert(!request.system.includes('Each line must include: handling level'), 'Expected handling level to stop repeating on every action line');
}

function run() {
  testTranslatePromptUsesLatestReply();
  testSummarizePromptIncludesActionSignals();
  testReplyPromptKeepsQuotedContextSeparate();
  testAssistantPromptsExposeStructuredAssistantSections();
  testJapaneseAssistantPromptsForbidEnglishLabels();
  testActionSuggestionsUseAiCategoryAndStableScoringForMarketing();
  console.log('ai-prompts tests passed');
}

run();
