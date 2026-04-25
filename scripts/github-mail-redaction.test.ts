import { redactGithubMailEntities, redactSensitiveUrlParams } from '../src/shared/email-ai';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testPullRequestReviewRequested() {
  const result = redactGithubMailEntities({
    subject: '[openai/codex] Review requested on #42',
    plainText: 'alice requested your review on openai/codex#42. Contact Alice Smith via alice@private.dev.',
    metadata: { repo: 'openai/codex', entityType: 'pull_request', number: 42, reasonForRecipient: 'review_requested' },
  });
  assert(result.redactedText.includes('openai/codex#42'), 'Expected repo and PR number preserved');
  assert(result.redactedText.includes('[PERSON_1]'), 'Expected private name redacted');
  assert(result.redactedText.includes('[EMAIL_1]'), 'Expected private email redacted');
}

function testIssueCommentMail() {
  const result = redactGithubMailEntities({
    subject: '[owner/repo] New comment on issue #88',
    plainText: 'bob commented on owner/repo#88. See https://github.com/owner/repo/issues/88',
    metadata: { repo: 'owner/repo', entityType: 'issue', number: 88 },
  });
  assert(result.redactedText.includes('owner/repo#88'), 'Expected issue identity preserved');
}

function testWorkflowFailedMail() {
  const result = redactGithubMailEntities({
    subject: '[owner/repo] Workflow failed',
    plainText: 'Workflow failed for owner/repo. Triggered by ci-bot.',
    metadata: { repo: 'owner/repo', entityType: 'workflow' },
  });
  assert(result.preservedGithubSemantics.workflowStatusTokens.includes('failed'), 'Expected workflow status preserved');
}

function testSecurityAlertMail() {
  const result = redactGithubMailEntities({
    subject: '[owner/repo] Dependabot alert',
    plainText: 'Security alert in owner/repo due to CVE-2026-9999.',
    metadata: { repo: 'owner/repo', entityType: 'security', reasonForRecipient: 'security_alert' },
  });
  assert(result.redactedText.includes('CVE-2026-9999'), 'Expected vulnerability identifier preserved');
}

function testPrivateSignatureInGithubMail() {
  const result = redactGithubMailEntities({
    subject: '[owner/repo] Review requested',
    plainText: 'Please review.\n\nBest,\nAlice Johnson\nalice@gmail.com\n+1 212 555 0177',
    metadata: { repo: 'owner/repo', entityType: 'pull_request', number: 5 },
  });
  assert(result.redactedText.includes('[PERSON_1]'), 'Expected signature name redacted');
  assert(result.redactedText.includes('[PHONE_1]'), 'Expected signature phone redacted');
}

function testTokenLinksPreservePath() {
  const url = 'https://example.internal/path/to/review?token=abc123&id=42&signature=sig987';
  const result = redactSensitiveUrlParams(url);
  assert(result.redactedText.includes('/path/to/review'), 'Expected URL path preserved');
  assert(result.redactedText.includes('token=[SECRET_1]'), 'Expected token query redacted');
  assert(result.redactedText.includes('signature=[SECRET_2]'), 'Expected signature query redacted');
}

function testPublicRepoMode() {
  const result = redactGithubMailEntities({
    subject: '[vercel/next.js] Mentioned you',
    plainText: 'You were mentioned on vercel/next.js#1000 by timneutkens.',
    metadata: { repo: 'vercel/next.js', entityType: 'issue', number: 1000 },
  });
  assert(result.redactedText.includes('vercel/next.js#1000'), 'Expected public repo preserved by default');
  assert(result.redactedText.includes('timneutkens'), 'Expected public username preserved by default');
}

function testPrivateRepoMode() {
  const result = redactGithubMailEntities({
    subject: '[internal/roadmap] Review requested',
    plainText: 'Review requested on internal/roadmap#71. See https://git.company.local/internal/roadmap/pull/71?token=abc123',
    metadata: {
      repo: 'internal/roadmap',
      entityType: 'pull_request',
      number: 71,
      url: 'https://git.company.local/internal/roadmap/pull/71?token=abc123',
    },
  }, {
    maskRepositories: true,
    maskInternalDomains: true,
    internalDomains: ['git.company.local'],
  });
  assert(result.redactedText.includes('[REPO_1]#71'), 'Expected private repo masked while PR number stays visible');
  assert(result.redactedText.includes('[DOMAIN_1]'), 'Expected internal domain masked');
  assert(!result.redactedText.includes('token=abc123'), 'Expected token value redacted');
}

function testCodeSnippetSecretsAreRedacted() {
  const result = redactGithubMailEntities({
    subject: '[owner/repo] Review requested',
    plainText: [
      'Please review the latest diff for owner/repo#55.',
      'diff --git a/.env b/.env',
      '+ OPENAI_API_KEY=sk-abcdef1234567890ABCDEFGH',
      '+ GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz123456',
      '+ Authorization: Bearer secret-token-123456',
      '+ INTERNAL_PATH=C:\\Users\\alice\\secrets\\prod.env',
    ].join('\n'),
    metadata: { repo: 'owner/repo', entityType: 'pull_request', number: 55 },
  });

  assert(result.redactedText.includes('owner/repo#55'), 'Expected repo reference preserved');
  assert(result.redactedText.includes('[SECRET_1]') || result.redactedText.includes('[SECRET_2]'), 'Expected at least one secret placeholder in code diff');
  assert(!result.redactedText.includes('sk-abcdef1234567890ABCDEFGH'), 'Expected OpenAI key redacted');
  assert(!result.redactedText.includes('ghp_abcdefghijklmnopqrstuvwxyz123456'), 'Expected GitHub token redacted');
  assert(!result.redactedText.includes('secret-token-123456'), 'Expected bearer token redacted');
  assert(result.redactedText.includes('[ADDRESS_1]') || result.redactedText.includes('[ID_1]') || result.redactedText.includes('[SECRET_'), 'Expected sensitive local path masked');
}

function testGithubSecurityMailSensitiveDataIsRedacted() {
  const result = redactGithubMailEntities({
    subject: '[GitHub] A third-party OAuth application has been added to your account',
    plainText: [
      'A third-party OAuth application has been added to your account.',
      'App: Internal Deploy Dashboard',
      'Linked email: alice-private@users.noreply.github.com',
      'Location: Hong Kong',
      'Review this change: https://github.com/settings/applications?code=oauth-code-123&token=oauth-token-456',
      'Device verification token: ghs_abcdefghijklmnopqrstuvwxyz123456',
    ].join('\n'),
    headers: {
      'x-github-reason': 'security_alert',
      'x-github-recipient': 'alice-private',
    },
    metadata: { entityType: 'security', reasonForRecipient: 'security_alert' },
  });

  assert(result.redactedText.includes('[EMAIL_1]'), 'Expected linked email redacted');
  assert(result.redactedText.includes('https://github.com/settings/applications?code=[SECRET_1]&token=[SECRET_2]'), 'Expected GitHub security link query params redacted');
  assert(!result.redactedText.includes('oauth-code-123'), 'Expected OAuth code hidden');
  assert(!result.redactedText.includes('oauth-token-456'), 'Expected OAuth token hidden');
  assert(!result.redactedText.includes('ghs_abcdefghijklmnopqrstuvwxyz123456'), 'Expected GitHub security token redacted');
}

function testGithubUserMetadataIsRedactedButRepoSemanticsStayVisible() {
  const result = redactGithubMailEntities({
    subject: '[owner/repo] alice-private requested your review',
    plainText: [
      'alice-private requested your review on owner/repo#17.',
      'Reach out to Alice Private via alice-private@private.dev.',
      'Mentioned handle: @alice-private',
    ].join('\n'),
    headers: {
      'x-github-recipient': 'alice-private',
    },
    metadata: { repo: 'owner/repo', entityType: 'pull_request', number: 17, reasonForRecipient: 'review_requested' },
  }, {
    preservePublicUsernames: false,
  });

  assert(result.redactedText.includes('owner/repo#17'), 'Expected PR identity preserved');
  assert(result.redactedText.includes('[EMAIL_1]'), 'Expected private email redacted');
  assert(result.redactedText.includes('[PERSON_1]') || result.redactedText.includes('[PERSON_2]'), 'Expected real name redacted');
  assert(!result.redactedText.includes('@alice-private'), 'Expected private handle redacted when public username preservation is disabled');
}

function testAttachmentMetadataIsRedacted() {
  const result = redactGithubMailEntities({
    subject: '[owner/repo] Review requested',
    plainText: 'See the attached files for owner/repo#91.',
    metadata: { repo: 'owner/repo', entityType: 'pull_request', number: 91 },
    attachments: [
      {
        filename: 'C:\\Users\\alice\\Desktop\\prod-secrets.env',
        contentType: 'text/plain',
        size: 1204,
        contentId: 'oauth-token-abcdef123456',
        attachmentId: 'ghp_abcdefghijklmnopqrstuvwxyz123456',
      },
      {
        filename: 'alice-private@private.dev-review-notes.pdf',
        contentType: 'application/pdf',
        size: 2048,
      },
    ],
  });

  assert(Array.isArray(result.redactedAttachments), 'Expected redacted attachments to be returned');
  assert(result.redactedAttachments?.length === 2, 'Expected two redacted attachments');
  assert(!result.redactedAttachments?.[0].filename.includes('C:\\Users\\alice\\Desktop\\prod-secrets.env'), 'Expected path-like filename redacted');
  assert(!result.redactedAttachments?.[0].contentId?.includes('oauth-token-abcdef123456'), 'Expected attachment contentId redacted');
  assert(!result.redactedAttachments?.[0].attachmentId?.includes('ghp_abcdefghijklmnopqrstuvwxyz123456'), 'Expected attachmentId token redacted');
  assert(!result.redactedAttachments?.[1].filename.includes('alice-private@private.dev'), 'Expected filename email redacted');
}

function run() {
  testPullRequestReviewRequested();
  testIssueCommentMail();
  testWorkflowFailedMail();
  testSecurityAlertMail();
  testPrivateSignatureInGithubMail();
  testTokenLinksPreservePath();
  testPublicRepoMode();
  testPrivateRepoMode();
  testCodeSnippetSecretsAreRedacted();
  testGithubSecurityMailSensitiveDataIsRedacted();
  testGithubUserMetadataIsRedactedButRepoSemanticsStayVisible();
  testAttachmentMetadataIsRedacted();
  console.log('github-mail-redaction tests passed');
}

run();
