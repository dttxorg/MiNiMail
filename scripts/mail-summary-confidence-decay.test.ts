// L5 of the knowledge bedrock series — confidence decay tests.
// Mirrors the `computeEffectiveConfidence` helper in
// src/main/services/mailSummaryService.ts. The function returns a value
// in (0, 1] representing how much a stored AI summary should still count
// toward search ranking. 180-day half-life: a 6-month-old summary keeps
// 50% of its original confidence; a 1-year-old summary keeps ~25%.

import { strict as assert } from 'node:assert';
import test from 'node:test';

const DECAY_HALF_LIFE_DAYS = 180;

function computeEffectiveConfidence(updatedAt: string, now: Date = new Date()): number {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return 1;
  const ageDays = Math.max(0, (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
  return Math.pow(2, -ageDays / DECAY_HALF_LIFE_DAYS);
}

test('decay: same-day summary keeps full confidence', () => {
  const now = new Date('2026-06-17T00:00:00Z');
  const sameDay = '2026-06-17T00:00:00Z';
  assert.ok(Math.abs(computeEffectiveConfidence(sameDay, now) - 1) < 1e-9);
});

test('decay: 30-day-old summary keeps ~88% confidence', () => {
  const now = new Date('2026-06-17T00:00:00Z');
  const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const c = computeEffectiveConfidence(month, now);
  assert.ok(c > 0.85 && c < 0.95, `expected ~0.89, got ${c}`);
});

test('decay: 180-day-old summary keeps exactly 50% confidence', () => {
  const now = new Date('2026-06-17T00:00:00Z');
  const halfLife = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const c = computeEffectiveConfidence(halfLife, now);
  assert.ok(Math.abs(c - 0.5) < 1e-9, `expected 0.5, got ${c}`);
});

test('decay: 365-day-old summary keeps ~25% confidence', () => {
  const now = new Date('2026-06-17T00:00:00Z');
  const year = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const c = computeEffectiveConfidence(year, now);
  assert.ok(c > 0.22 && c < 0.28, `expected ~0.25, got ${c}`);
});

test('decay: future-dated summary keeps full confidence (no negative age)', () => {
  const now = new Date('2026-06-17T00:00:00Z');
  const future = '2027-06-17T00:00:00Z';
  // ageDays clamped to 0 → exponent 0 → 1.0
  assert.equal(computeEffectiveConfidence(future, now), 1);
});

test('decay: invalid date string returns 1 (defensive default)', () => {
  const c = computeEffectiveConfidence('not-a-date');
  assert.equal(c, 1);
});

test('decay: monotonically decreasing over time', () => {
  const now = new Date('2026-06-17T00:00:00Z');
  let prev = 1;
  for (let days = 30; days <= 720; days += 30) {
    const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const c = computeEffectiveConfidence(past, now);
    assert.ok(c < prev, `confidence should decrease: day ${days} got ${c}, prev was ${prev}`);
    prev = c;
  }
});

test('decay: bounds stay in (0, 1]', () => {
  const now = new Date('2026-06-17T00:00:00Z');
  for (const years of [0, 1, 5, 10, 50]) {
    const past = new Date(now.getTime() - years * 365 * 24 * 60 * 60 * 1000).toISOString();
    const c = computeEffectiveConfidence(past, now);
    assert.ok(c > 0 && c <= 1, `confidence should be in (0, 1] for ${years} years, got ${c}`);
  }
});

// Ranking test: two summaries match the same query, one fresh and one old.
// The fresh one should outrank after decay.
test('decay ranking: fresh summary outranks 6-month-old summary', () => {
  const now = new Date('2026-06-17T00:00:00Z');
  const fresh = { mailId: 'fresh', bm25: 1.0, updatedAt: now.toISOString() };
  const stale = {
    mailId: 'stale',
    bm25: 1.0,
    updatedAt: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const ranked = [fresh, stale]
    .map((r) => ({ ...r, effective: r.bm25 * computeEffectiveConfidence(r.updatedAt, now) }))
    .sort((a, b) => b.effective - a.effective);
  assert.equal(ranked[0].mailId, 'fresh');
  assert.equal(ranked[1].mailId, 'stale');
});
