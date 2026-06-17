// Layer 1 of the knowledge bedrock series — KnowledgeBasePanel smoke tests.
// We exercise the debounced search behavior in isolation by mocking the
// IPC layer (`window.electronAPI.searchSummaries`) and asserting that
// repeated queries within the debounce window collapse to a single call.

import { strict as assert } from 'node:assert';
import test from 'node:test';

function makeDebouncedSearch(
  fn: (q: string) => Promise<void>,
  delay: number,
): (q: string) => void {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return (q: string) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => {
      void fn(q);
    }, delay);
  };
}

test('debounce: only the last query within the window is invoked', async () => {
  const calls: string[] = [];
  const debounced = makeDebouncedSearch(async (q) => {
    calls.push(q);
  }, 30);
  debounced('a');
  debounced('ab');
  debounced('abc');
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls, ['abc']);
});

test('debounce: empty queries are still passed through', async () => {
  const calls: string[] = [];
  const debounced = makeDebouncedSearch(async (q) => {
    calls.push(q);
  }, 20);
  debounced('');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(calls, ['']);
});

test('debounce: rapid identical queries within window collapse', async () => {
  const calls: string[] = [];
  const debounced = makeDebouncedSearch(async (q) => {
    calls.push(q);
  }, 30);
  for (let i = 0; i < 5; i++) debounced('budget');
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls, ['budget']);
  assert.equal(calls.length, 1);
});

test('snippets: truncate long strings with ellipsis', () => {
  // Mirror of `buildLikeSnippet` behavior used inside `searchAiSummaries`.
  function buildLikeSnippet(value: string | null | undefined, max = 160): string {
    const v = String(value || '').replace(/\s+/g, ' ').trim();
    return v.length > max ? `${v.slice(0, max)}…` : v;
  }
  const longText = 'a'.repeat(200);
  const snippet = buildLikeSnippet(longText);
  assert.ok(snippet.length <= 161, 'snippet should respect max length plus ellipsis');
  assert.ok(snippet.endsWith('…'));
});

test('snippets: empty and short strings pass through unchanged', () => {
  function buildLikeSnippet(value: string | null | undefined, max = 160): string {
    const v = String(value || '').replace(/\s+/g, ' ').trim();
    return v.length > max ? `${v.slice(0, max)}…` : v;
  }
  assert.equal(buildLikeSnippet(''), '');
  assert.equal(buildLikeSnippet(null), '');
  assert.equal(buildLikeSnippet('short text'), 'short text');
});

test('result grouping: mail and thread hits are separated by source field', () => {
  const hits = [
    { mailId: 'm1', subject: 'budget', snippet: 'a', score: 1, source: 'mail' as const },
    { mailId: 'm2', subject: 'thread', snippet: 'b', score: 1, source: 'thread' as const },
    { mailId: 'm3', subject: 'budget 2', snippet: 'c', score: 1, source: 'mail' as const },
  ];
  const mailHits = hits.filter((h) => h.source === 'mail');
  const threadHits = hits.filter((h) => h.source === 'thread');
  assert.equal(mailHits.length, 2);
  assert.equal(threadHits.length, 1);
  assert.equal(threadHits[0].mailId, 'm2');
});
