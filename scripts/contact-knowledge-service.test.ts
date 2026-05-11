import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildContactKnowledgeChunks,
  buildContactKnowledgeSearchTerms,
  cleanScenarioEvidenceText,
  calculateContactWikiConfidence,
  cleanContactKnowledgeText,
  contactWikiConfidenceLevel,
  cosineSimilarity,
  hybridContactChunkScore,
  inferContactChunkKind,
  inferContactMailDirection,
  extractForumFeedbackSignals,
  extractJsonObjectPayload,
  hasForumRelayContext,
  isForumFeedbackEvidenceLine,
  isForumRelayBoilerplateLine,
  mailMatchesContact,
  mailMatchesAnyContact,
  redactContactKnowledgeEvidenceText,
  searchTermOverlapScore,
  isLowValueMarketingEvidenceLine,
} from '../src/shared/contactKnowledge';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testContactFilteringIncludesBothDirections() {
  const inbound = {
    accountId: 1,
    from: 'Alice <alice@example.com>',
    to: 'me@example.com',
  };
  const outbound = {
    accountId: 1,
    from: 'me@example.com',
    to: 'Alice <alice@example.com>',
  };
  const otherAccount = {
    accountId: 2,
    from: 'Alice <alice@example.com>',
    to: 'me@example.com',
  };

  assert.equal(mailMatchesContact(inbound, 1, 'alice@example.com'), true);
  assert.equal(mailMatchesContact(outbound, 1, 'alice@example.com'), true);
  assert.equal(mailMatchesContact(otherAccount, 1, 'alice@example.com'), false);
  assert.equal(mailMatchesAnyContact(outbound, 1, 'alice@work.example.com', ['alice@example.com']), true);
  assert.equal(inferContactMailDirection(inbound, 'alice@example.com'), 'inbound');
  assert.equal(inferContactMailDirection(outbound, 'alice@example.com'), 'outbound');
  assert.equal(inferContactChunkKind({ folder: 'Sent' }, 'outbound'), 'sent_message');
  assert.equal(inferContactChunkKind({ folder: 'Drafts' }, 'outbound'), 'draft');
}

function testCleanAndChunkKnowledgeText() {
  const cleaned = cleanContactKnowledgeText({
    bodyText: [
      'Please review the timeline.',
      '',
      'On Tuesday, Bob wrote:',
      '> Old quoted text',
      'unsubscribe',
    ].join('\n'),
  });
  assert.equal(cleaned, 'Please review the timeline.');

  const chunks = buildContactKnowledgeChunks([
    {
      mailId: 'mail-1',
      subject: 'Project plan',
      date: '2026-04-30T00:00:00.000Z',
      text: 'a'.repeat(2100),
    },
  ], { maxChars: 900, overlapChars: 100 });
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].id, 'mail-1:0');
  assert.equal(typeof chunks[0].contentHash, 'string');
  assert(chunks[0].searchTerms.includes('project'), 'Expected chunks to include language-independent search terms');
  assert.equal(chunks[0].languageHint, 'latin');
  assert(chunks.every((chunk) => chunk.tokenEstimate > 0));
}

function testCosineSimilarity() {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert(
    hybridContactChunkScore({
      vectorScore: 0.1,
      keywordScore: 1,
      searchTermScore: 1,
      date: new Date().toISOString(),
      subject: 'Budget review',
      querySubject: 'Budget review',
      direction: 'inbound',
      chunkKind: 'message_body',
    }) > hybridContactChunkScore({
      vectorScore: 0.1,
      keywordScore: 0,
      searchTermScore: 0,
      date: '2020-01-01T00:00:00.000Z',
      subject: 'Unrelated',
      querySubject: 'Budget review',
      direction: 'inbound',
      chunkKind: 'message_body',
    }),
    'Expected keyword/same-subject/recency rerank to beat unrelated vector-only candidates'
  );
}

function testChineseSearchTermsAndConfidenceFormula() {
  const terms = buildContactKnowledgeSearchTerms('客户确认了项目排期，下周三复盘 budget-2026');
  assert(searchTermOverlapScore('项目排期', terms) > 0, 'Expected CJK trigram search terms to match Chinese queries');
  assert(terms.includes('budget-2026'), 'Expected latin/numeric terms to survive mixed-language indexing');
  const low = calculateContactWikiConfidence({
    sourceMailCount: 1,
    timespanDays: 1,
    latestEvidenceAt: '2020-01-01T00:00:00.000Z',
    behaviorSampleCount: 0,
    usefulFeedbackCount: 0,
    negativeFeedbackCount: 2,
    languageCoverage: 0.2,
  }, new Date('2026-05-01T00:00:00.000Z'));
  const high = calculateContactWikiConfidence({
    sourceMailCount: 80,
    timespanDays: 180,
    latestEvidenceAt: '2026-04-30T00:00:00.000Z',
    behaviorSampleCount: 40,
    usefulFeedbackCount: 10,
    negativeFeedbackCount: 0,
    languageCoverage: 1,
  }, new Date('2026-05-01T00:00:00.000Z'));
  assert.equal(contactWikiConfidenceLevel(low), 'low');
  assert.equal(contactWikiConfidenceLevel(high), 'high');
}

function testScenarioEvidenceNoiseFiltering() {
  assert.equal(isLowValueMarketingEvidenceLine('探索沙盒巅峰之作'), true);
  assert.equal(isLowValueMarketingEvidenceLine('直面恐惧'), true);
  assert.equal(isLowValueMarketingEvidenceLine('是时候大展身手了！'), true);
  assert.equal(isLowValueMarketingEvidenceLine('立即购买'), true);
  assert.equal(isLowValueMarketingEvidenceLine('[https://wise.com/assets/check_with_trail.png]'), true);
  assert.equal(isLowValueMarketingEvidenceLine('新增 AI Applets 和 IFTTT MCP'), false);
  assert.equal(isLowValueMarketingEvidenceLine('Now available: DataStore and AI Applets'), false);
  assert.equal(isLowValueMarketingEvidenceLine('Added Basecamp, OneDrive, and monday.com services'), false);
  assert.equal(isLowValueMarketingEvidenceLine('Meta Horizon+ 四月新增内容'), false);
  assert.equal(isLowValueMarketingEvidenceLine('新增 VR 游戏和 Meta Horizon+ 四月上新'), false);
  assert.equal(isLowValueMarketingEvidenceLine('BLACK & WHITE projects 8 Pro $99.95 → $20 -80%'), false);
  const cleaned = cleanScenarioEvidenceText([
    '探索沙盒巅峰之作',
    '新增 AI Applets 和 IFTTT MCP',
    'Learn more',
    'Security alert for user@example.com: https://example.test/security',
    'Meta Horizon+ 四月新增内容',
  ].join('\n'));
  assert(!cleaned.includes('探索沙盒巅峰之作'), 'Expected marketing headline to be filtered');
  assert(!cleaned.includes('Learn more'), 'Expected CTA text to be filtered');
  assert(cleaned.includes('新增 AI Applets'), 'Expected service change signal to survive');
  assert(cleaned.includes('Meta Horizon+'), 'Expected newsletter launch signal to survive');
  assert(!cleaned.includes('user@example.com'), 'Expected scenario evidence to redact email addresses');
  assert(!cleaned.includes('https://example.test/security'), 'Expected scenario evidence to redact full URLs');
  assert.equal(redactContactKnowledgeEvidenceText('Check a@example.com at https://example.test/a'), 'Check [email] at [url]');
}

function testJsonObjectExtractionToleratesModelWrapping() {
  assert.equal(
    extractJsonObjectPayload('```json\n{"summary":"ok","recentContext":[]}\n```'),
    '{"summary":"ok","recentContext":[]}',
    'Expected fenced JSON object to be extracted'
  );
  assert.equal(
    extractJsonObjectPayload('Here is the JSON:\n{"summary":"ok { literal }","recentContext":[]}\nThanks'),
    '{"summary":"ok { literal }","recentContext":[]}',
    'Expected leading/trailing model prose to be ignored while preserving braces inside strings'
  );
  assert.equal(extractJsonObjectPayload('no json here'), null, 'Expected non-JSON text to return null');
}

function testForumRelayFeedbackExtraction() {
  assert.equal(isForumRelayBoilerplateLine('[访问话题]([url])'), true);
  assert.equal(isForumRelayBoilerplateLine('要退订这些电子邮件，请点击此处。'), true);
  assert.equal(isForumFeedbackEvidenceLine('我找“快捷操作”功能，也没找到，同样是提高效率'), true);
  assert.equal(isForumFeedbackEvidenceLine('访问话题或者回复此电子邮件以进行回复。'), false);
  assert.equal(hasForumRelayContext('访问话题或者回复此电子邮件以进行回复。'), true);
  assert.equal(hasForumRelayContext('Project thread follow-up. Can you review the current email thread?'), false);
  assert.equal(hasForumRelayContext('New topic for the Q2 project review'), false);
  assert.equal(hasForumRelayContext('If you did not attempt this login, reply to this email to let support know.'), false);
  assert.equal(isForumFeedbackEvidenceLine('Your account tried to login from this location:'), false);

  const chunks = buildContactKnowledgeChunks([
    {
      mailId: 'forum-mail-1',
      subject: '[示例论坛] [讨论分享] 一个可以接入本地模型的邮箱客户端',
      date: '2026-04-30T10:02:00.000Z',
      text: [
        '我只花了10分钟左右安装体验。',
        '目前这个版本相当于只建立了一个框架，然后装了一个 AI 系统。',
        '我想设置一个信纸模板，发现找不到地方设置。',
        '我找快捷操作功能，也没找到。',
        '签名、定期发送这些都没看到。',
        '建议基础功能可以参考 Foxmail。',
        '访问话题或者回复此电子邮件以进行回复。',
        '要退订这些电子邮件，请点击此处。',
      ].join('\n'),
    },
  ], { maxChars: 900 });

  const signals = extractForumFeedbackSignals(chunks, '中文');
  const joined = signals.join('\n');
  assert(signals.length >= 3, 'Expected forum relay wiki to extract body feedback signals');
  assert(/框架|AI/.test(joined), 'Expected product-maturity feedback from body content');
  assert(/信纸模板|快捷操作|签名|定期发送/.test(joined), 'Expected missing-feature feedback from body content');
  assert(/Foxmail/.test(joined), 'Expected recommendation feedback from body content');
  assert(!/访问话题|退订|\[url\]/.test(joined), 'Expected forum boilerplate links to be filtered');

  const securityChunks = buildContactKnowledgeChunks([
    {
      mailId: 'security-mail-1',
      subject: 'Verify a login attempt from a new location',
      date: '2026-05-03T15:42:00.000Z',
      text: [
        'Sign-In From a New Location',
        'We need to confirm a recent sign-in attempt from a new IP address.',
        'Your account tried to login from this location:',
        'If you did not attempt to login from a new place, reply to this email to let us know, and reset your password.',
      ].join('\n'),
    },
  ], { maxChars: 900 });
  assert.deepEqual(
    extractForumFeedbackSignals(securityChunks, '中文'),
    [],
    'Security verification emails that mention reply-to-email must not be treated as forum feedback'
  );
}

function testServiceHasPrivacyAndVectorGuards() {
  const service = read('src/main/services/contactKnowledgeService.ts');
  assert(service.includes('CONTACT_KNOWLEDGE_ENABLED_KEY'), 'Expected persisted contact knowledge setting');
  assert(service.includes('assertEnabled()'), 'Expected historical processing to check the explicit opt-in switch');
  assert(service.includes("getAIModelProfileConfigForTask('embedding')"), 'Expected embedding-specific model config');
  assert(service.includes('normalizeOpenAICompatibleEmbeddingEndpoint'), 'Expected OpenAI-compatible embeddings endpoint');
  assert(service.includes('LOCAL_EMBEDDING_MODEL'), 'Expected local embedding fallback when provider embeddings are unavailable');
  assert(service.includes('Remote embeddings unavailable; using local fallback'), 'Expected provider embedding failures to degrade to local fallback');
  assert(service.includes('content_hash'), 'Expected chunk content hash metadata for incremental indexing');
  assert(service.includes('embedding_model'), 'Expected embedding model metadata');
  assert(service.includes('contact_knowledge_chunks_fts'), 'Expected SQLite FTS hybrid retrieval table');
  assert(service.includes('hybridContactChunkScore'), 'Expected local hybrid rerank scoring');
  assert(service.includes('contact_knowledge_feedback'), 'Expected local feedback storage');
  assert(service.includes('contact_knowledge_interactions'), 'Expected opt-in behavior learning storage');
  assert(service.includes('validateBehaviorEventValue'), 'Expected main-process behavior schema validation');
  assert(service.includes('build_backoff_until'), 'Expected same-contact rebuild backoff');
  assert(service.includes('evidence_hash'), 'Expected evidence hash skip guard');
  assert(service.includes('search_terms'), 'Expected CJK/multilingual search terms stored with chunks');
  assert(service.includes('parseWikiPayload'), 'Expected strict wiki JSON parsing and clamping');
  assert(service.includes('extractJsonObjectPayload(content)'), 'Expected wiki JSON parsing to tolerate fenced or wrapped JSON');
  assert(service.includes('CONTACT_MAIL_SCAN_PAGE_SIZE'), 'Expected contact mail loading to scan in bounded pages after contact filtering');
  assert(service.includes('OFFSET ?'), 'Expected contact mail loading not to truncate before filtering the contact');
  assert(service.includes('targetLang'), 'Expected contact wiki generation to follow the app target language');
  assert(service.includes('All user-visible string values must be written'), 'Expected wiki prompt to constrain output language');
  assert(service.includes('SUPPORTS_USER_INSIGHTS'), 'Expected senderType to decide whether userInsights can exist');
  assert(service.includes('MIN_USER_INSIGHT_BEHAVIOR_SAMPLES = 3'), 'Expected conservative behavior sample threshold for user insights');
  assert(service.includes("'community_feedback'"), 'Expected forum/community relays to have an independent community_feedback sender type');
  assert(service.includes('senderTypeSignals'), 'Expected sender type scoring signals to be stored in structured profile');
  assert(service.includes('secondarySenderTypes'), 'Expected mixed sender type candidates to be preserved');
  assert(service.includes('wikiDiagnostics'), 'Expected wiki enforcement/fallback diagnostics to be stored');
  assert(service.includes('scoreSenderTypeSignals'), 'Expected senderType to use scored signals instead of early-return rules');
  assert(service.includes('buildWikiSchemaForSenderType'), 'Expected senderType-specific wiki schema selection');
  assert(service.includes('enforceUserInsightPolicy'), 'Expected main-process guard to remove invalid userInsights');
  assert(service.includes('Do not output userInsights, engagementProfile, or preferences'), 'Expected non-personal prompts to exclude user preference fields');
  assert(service.includes('User insights are allowed only for personal/work_contact'), 'Expected prompts to forbid content-inferred user preferences');
  assert(service.includes('do not describe what the sender provides'), 'Expected non-personal value to be decision-oriented instead of sender-oriented');
  assert(service.includes('summary must be a decision summary, not a company biography'), 'Expected marketing/newsletter/vendor summaries to avoid company bios');
  assert(service.includes('wiki.valueForUser = []'), 'Expected non-personal wikis to remove generic sender-oriented valueForUser');
  assert(service.includes('wiki.activeProjects = []'), 'Expected non-personal wikis to remove relationship-only active projects');
  assert(service.includes('extractMarketingDealEvidence'), 'Expected marketing wikis to have local deal evidence fallback');
  assert(service.includes('buildScenarioEvidence'), 'Expected non-personal wikis to use scenario evidence compression');
  assert(service.includes('scenarioEvidenceToPrompt'), 'Expected prompt to use scenario evidence instead of raw marketing chunks');
  assert(service.includes('isScenarioEvidenceLine'), 'Expected main-process recent context hard clipping');
  assert(service.includes('use only the Scenario evidence block'), 'Expected non-personal prompt to avoid raw email copy');
  assert(service.includes('Do not copy headlines, CTA text, or single-email section titles'), 'Expected newsletter prompt to filter headlines and CTA');
  assert(service.includes('buildServiceNotificationRelationshipSummary'), 'Expected system notification summaries to describe sender relationship and long-term pattern');
  assert(service.includes('buildServiceNotificationRecentContext'), 'Expected system notification recent context to aggregate repeated alerts');
  assert(service.includes('isSystemNotificationBoilerplateLine'), 'Expected recipient/backup-email boilerplate to be filtered from system notification evidence');
  assert(service.includes('who this sender is to the user'), 'Expected system notification prompt to focus on sender role instead of single-mail interpretation');
  assert(service.includes('forum/community mail relay'), 'Expected forum no-reply relays to be treated as discussion notification relays, not people');
  assert(service.includes('论坛/社区邮件网关'), 'Expected Chinese service type fallback for forum/community relays');
  assert(service.includes('extractForumFeedbackSignals'), 'Expected forum relays to extract body feedback instead of only sender statistics');
  assert(service.includes('"feedbackThemes": string[] <=5'), 'Expected community_feedback schema to use feedback-specific fields');
  assert(service.includes('selectedPriorContext'), 'Expected stable prior wiki fields to be injected during rebuild');
  assert(service.includes('date') && service.includes('ScenarioEvidenceItem'), 'Expected scenario evidence to preserve dated signal objects');
  assert(service.includes('summarizeUserReplyPattern'), 'Expected system notification wiki to mention user reply/action pattern when evidence exists');
  assert(service.includes('contactEmail'), 'Expected system notification fallback to use the sender address as identity context');
  assert(service.includes('redactContactKnowledgeEvidenceText'), 'Expected scenario evidence to redact emails and full URLs before wiki generation');
  assert(service.includes('canonicalSummaryField'), 'Expected scenario summaries to record their canonical source field');
  assert(service.includes('"subscriptionValue": string, "promotionPattern": string, "bestDealSoFar"'), 'Expected marketing schema to use subscription/deal/action fields instead of generic value');
  assert(service.includes('stale_reason'), 'Expected stale reason tracking');
  assert(service.includes('contactHash(contactEmail)'), 'Expected logs to avoid plain contact emails');
  assert(!service.includes('log.info(promptInput'), 'Service must not log raw prompts');
  const mailService = read('src/main/services/mailService.ts');
  assert(mailService.includes('markContactKnowledgeWikisStaleForMail'), 'Expected mail cache writes to mark contact wikis stale only');
  assert(!mailService.includes('buildContactWiki('), 'Mail cache writes must not auto-call AI wiki generation');
}

function run() {
  testContactFilteringIncludesBothDirections();
  testCleanAndChunkKnowledgeText();
  testCosineSimilarity();
  testChineseSearchTermsAndConfidenceFormula();
  testScenarioEvidenceNoiseFiltering();
  testJsonObjectExtractionToleratesModelWrapping();
  testForumRelayFeedbackExtraction();
  testServiceHasPrivacyAndVectorGuards();
  console.log('contact knowledge service tests passed');
}

run();
