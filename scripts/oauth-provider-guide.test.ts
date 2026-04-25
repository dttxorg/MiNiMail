import { getOauthProviderGuide, resolveOauthClientConfig } from '../src/renderer/utils/oauthProviderGuide';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testEmptyConfigClearsFields() {
  const resolved = resolveOauthClientConfig(undefined);
  assert(resolved.clientId === '', 'Expected missing client config to clear clientId');
  assert(resolved.clientSecret === '', 'Expected missing client config to clear clientSecret');
}

function testPartialConfigDoesNotReuseOldSecret() {
  const resolved = resolveOauthClientConfig({ clientId: 'abc123' });
  assert(resolved.clientId === 'abc123', 'Expected clientId to be preserved');
  assert(resolved.clientSecret === '', 'Expected absent clientSecret to stay blank');
}

function testLocalizedGuideContainsProviderLinks() {
  const guide = getOauthProviderGuide('gmail', 'zh');
  assert(guide.providerLabel === 'Google', 'Expected Gmail provider label');
  assert(guide.links.some((link) => link.url.includes('console.cloud.google.com')), 'Expected Google console link');
  assert(guide.guideTitle.length > 0, 'Expected localized guide title');
  assert(guide.steps.length >= 4, 'Expected detailed setup steps');
}

function testNonChineseGuideIsLocalized() {
  const guide = getOauthProviderGuide('outlook', 'ja');
  assert(guide.guideShow === '設定ガイドを表示', 'Expected Japanese guide label');
  assert(guide.steps[0].includes('Azure') || guide.steps[0].includes('Entra'), 'Expected Outlook-specific Japanese steps');
}

function run() {
  testEmptyConfigClearsFields();
  testPartialConfigDoesNotReuseOldSecret();
  testLocalizedGuideContainsProviderLinks();
  testNonChineseGuideIsLocalized();
  console.log('oauth-provider-guide tests passed');
}

run();
