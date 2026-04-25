import { normalizeMailSettingsSnapshot } from '../src/renderer/utils/mailSettings';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testGithubViewDefaultsToEnabledWhenUnset() {
  const snapshot = normalizeMailSettingsSnapshot({});
  assert(snapshot.githubNotificationsViewEnabled === true, 'Expected GitHub notifications view to default enabled when unset');
}

function testGithubViewCanBeExplicitlyDisabled() {
  const snapshot = normalizeMailSettingsSnapshot({ githubNotificationsViewEnabled: 'false' });
  assert(snapshot.githubNotificationsViewEnabled === false, 'Expected explicit false setting to disable GitHub view');
}

function testGithubViewCanBeExplicitlyEnabled() {
  const snapshot = normalizeMailSettingsSnapshot({ githubNotificationsViewEnabled: 'true' });
  assert(snapshot.githubNotificationsViewEnabled === true, 'Expected explicit true setting to enable GitHub view');
}

function run() {
  testGithubViewDefaultsToEnabledWhenUnset();
  testGithubViewCanBeExplicitlyDisabled();
  testGithubViewCanBeExplicitlyEnabled();
  console.log('mail-settings tests passed');
}

run();
