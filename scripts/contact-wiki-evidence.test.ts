// L3 of the knowledge bedrock series — insight provenance tests.
// We exercise the `extractEvidenceRefs` helper and the
// `clampInsightArray` upgrade path so that inline `[evidence:chunk_xxx]`
// markers are promoted into the structured `evidenceIds` field.

import { strict as assert } from 'node:assert';
import test from 'node:test';

// Mirror of `extractEvidenceRefs` in src/main/services/contactKnowledgeService.ts
function extractEvidenceRefs(raw: string): { text: string; evidenceIds: string[] } {
  if (!raw) return { text: '', evidenceIds: [] };
  const matches = raw.match(/\[evidence:[^\]]+\]/gi) || [];
  const evidenceIds: string[] = [];
  for (const m of matches) {
    const inner = m.replace(/^\[evidence:/i, '').replace(/\]$/, '').trim();
    if (inner && !evidenceIds.includes(inner)) evidenceIds.push(inner);
  }
  const text = raw.replace(/\s*\[evidence:[^\]]+\]/gi, '').trim();
  return { text, evidenceIds: evidenceIds.slice(0, 6) };
}

test('extractEvidenceRefs: no markers returns raw text and empty refs', () => {
  const { text, evidenceIds } = extractEvidenceRefs('boss is the decision maker');
  assert.equal(text, 'boss is the decision maker');
  assert.deepEqual(evidenceIds, []);
});

test('extractEvidenceRefs: one marker is stripped and added to refs', () => {
  const { text, evidenceIds } = extractEvidenceRefs('boss is the decision maker [evidence:chunk_abc]');
  assert.equal(text, 'boss is the decision maker');
  assert.deepEqual(evidenceIds, ['chunk_abc']);
});

test('extractEvidenceRefs: multiple markers are deduplicated', () => {
  const { text, evidenceIds } = extractEvidenceRefs(
    'foo [evidence:chunk_a] bar [evidence:chunk_b] baz [evidence:chunk_a] end',
  );
  assert.equal(text, 'foo bar baz end');
  assert.deepEqual(evidenceIds, ['chunk_a', 'chunk_b']);
});

test('extractEvidenceRefs: preserves order of first appearance', () => {
  const { evidenceIds } = extractEvidenceRefs('[evidence:chunk_z] [evidence:chunk_a] [evidence:chunk_m]');
  assert.deepEqual(evidenceIds, ['chunk_z', 'chunk_a', 'chunk_m']);
});

test('extractEvidenceRefs: empty input returns empty text and refs', () => {
  const { text, evidenceIds } = extractEvidenceRefs('');
  assert.equal(text, '');
  assert.deepEqual(evidenceIds, []);
});

test('extractEvidenceRefs: case-insensitive marker prefix', () => {
  const { text, evidenceIds } = extractEvidenceRefs('foo [EVIDENCE:chunk_xyz] bar');
  assert.equal(text, 'foo bar');
  assert.deepEqual(evidenceIds, ['chunk_xyz']);
});

test('extractEvidenceRefs: caps at 6 evidence ids', () => {
  const input = Array.from({ length: 12 }, (_, i) => `[evidence:chunk_${i}]`).join(' ');
  const { evidenceIds } = extractEvidenceRefs(input);
  assert.equal(evidenceIds.length, 6);
  assert.equal(evidenceIds[5], 'chunk_5');
});

test('extractEvidenceRefs: leading and trailing whitespace normalized', () => {
  const { text } = extractEvidenceRefs('  hello world  [evidence:chunk_1]  ');
  assert.equal(text, 'hello world');
});

// End-to-end: simulate clampInsightArray's promotion of inline refs when
// the LLM omits `evidenceIds` from the structured payload.
test('clampInsightArray promotion: inline refs fill in missing evidenceIds', () => {
  function clampInsightArray(value: unknown, limit: number): Array<{ text: string; evidenceIds: string[] }> {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      if (typeof item === 'string') {
        const { text, evidenceIds } = extractEvidenceRefs(item);
        return { text, evidenceIds };
      }
      const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const rawText = String(record.text || '');
      const explicit = Array.isArray(record.evidenceIds) ? (record.evidenceIds as unknown[]).map((s) => String(s)) : [];
      const { text: cleanedText, evidenceIds: inlineRefs } = extractEvidenceRefs(rawText);
      const evidenceIds = explicit.length > 0 ? explicit : inlineRefs;
      return { text: cleanedText, evidenceIds };
    }).filter((item) => item.text).slice(0, limit);
  }

  const result = clampInsightArray([
    { text: 'boss is the decision maker [evidence:chunk_aaa]', confidenceScore: 0.9 },
    { text: 'often travels on Mondays [evidence:chunk_bbb][evidence:chunk_ccc]', confidenceScore: 0.7 },
  ], 5);

  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'boss is the decision maker');
  assert.deepEqual(result[0].evidenceIds, ['chunk_aaa']);
  assert.equal(result[1].text, 'often travels on Mondays');
  assert.deepEqual(result[1].evidenceIds, ['chunk_bbb', 'chunk_ccc']);
});

test('clampInsightArray promotion: explicit evidenceIds win over inline refs', () => {
  function clampInsightArray(value: unknown): Array<{ text: string; evidenceIds: string[] }> {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const rawText = String(record.text || '');
      const explicit = Array.isArray(record.evidenceIds) ? (record.evidenceIds as unknown[]).map((s) => String(s)) : [];
      const { text: cleanedText, evidenceIds: inlineRefs } = extractEvidenceRefs(rawText);
      const evidenceIds = explicit.length > 0 ? explicit : inlineRefs;
      return { text: cleanedText, evidenceIds };
    }).filter((item) => item.text);
  }
  const result = clampInsightArray([
    { text: 'foo [evidence:chunk_inline]', evidenceIds: ['chunk_explicit_1', 'chunk_explicit_2'] },
  ]);
  assert.equal(result[0].text, 'foo');
  assert.deepEqual(result[0].evidenceIds, ['chunk_explicit_1', 'chunk_explicit_2']);
});
