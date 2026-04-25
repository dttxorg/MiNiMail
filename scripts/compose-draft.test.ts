import {
  buildComposeQuotedOriginal,
  buildComposeTextBody,
  buildRecipientSuggestionsFromMails,
  filterRecipientSuggestions,
} from '../src/renderer/utils/composeDraft';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const htmlMail = {
  from: 'news@insideapple.apple.com',
  fromName: 'Apple',
  to: 'me@example.com',
  subject: 'Welcome to your new Mac mini.',
  date: new Date('2026-04-22T13:24:00+08:00'),
  snippet: 'Original snippet',
  bodyText: 'Plain fallback body',
  bodyHtml: '<div><img src="https://example.com/hero.png" /><table><tr><td>Welcome</td></tr></table></div>',
};

function testQuotedOriginalPrefersHtmlAndKeepsMetadata() {
  const quoted = buildComposeQuotedOriginal({ mode: 'forward', email: htmlMail });

  assert(quoted.html.includes('<img src="https://example.com/hero.png" />'), 'Expected quoted original HTML to keep original media');
  assert(quoted.html.includes('<table><tr><td>Welcome</td></tr></table>'), 'Expected quoted original HTML to keep original layout elements');
  assert(quoted.title === htmlMail.subject, 'Expected quoted original title to match subject');
  assert(quoted.meta.includes('Apple'), 'Expected quoted original metadata to include sender label');
}

function testTextBodyMergesEditableBodyAndQuotedOriginal() {
  const quoted = buildComposeQuotedOriginal({ mode: 'reply', email: htmlMail });
  const merged = buildComposeTextBody('Thanks, I received it.', quoted);

  assert(merged.includes('Thanks, I received it.'), 'Expected editable reply content at the top');
  assert(merged.includes('On '), 'Expected merged plain text body to include reply quote header');
}

function testRecipientSuggestionsUseRecentUniqueSenders() {
  const suggestions = buildRecipientSuggestionsFromMails([
    { from: 'account@nvidia.com', fromName: 'NVIDIA Accounts', date: new Date('2026-04-20T10:00:00Z') },
    { from: 'account@nvidia.com', fromName: 'NVIDIA Accounts', date: new Date('2026-04-21T10:00:00Z') },
    { from: 'news@insideapple.apple.com', fromName: 'Apple', date: new Date('2026-04-22T10:00:00Z') },
  ], ['me@example.com']);

  assert(suggestions.length === 2, `Expected 2 unique suggestions, got ${suggestions.length}`);
  assert(suggestions[0].label === 'Apple', 'Expected newest sender to appear first');
  assert(suggestions[1].email === 'account@nvidia.com', 'Expected deduplicated sender suggestion to remain');
}

function testRecipientSuggestionFilteringUsesLabelAndEmail() {
  const filtered = filterRecipientSuggestions([
    { email: 'account@nvidia.com', label: 'NVIDIA Accounts' },
    { email: 'news@insideapple.apple.com', label: 'Apple' },
  ], 'nv', []);

  assert(filtered.length === 1, `Expected one filtered suggestion, got ${filtered.length}`);
  assert(filtered[0].label === 'NVIDIA Accounts', 'Expected label matching to work for recipient suggestions');
}

function run() {
  testQuotedOriginalPrefersHtmlAndKeepsMetadata();
  testTextBodyMergesEditableBodyAndQuotedOriginal();
  testRecipientSuggestionsUseRecentUniqueSenders();
  testRecipientSuggestionFilteringUsesLabelAndEmail();
  console.log('compose-draft tests passed');
}

run();
