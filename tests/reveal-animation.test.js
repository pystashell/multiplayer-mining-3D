import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_ANIMATION_TIMING,
  revealAnimationTiming,
  sectorPurgeAnimationTiming,
} from '../public/reveal-animation.js';

test('opens every player-selected first wave with one fast consistent timing', () => {
  const first = revealAnimationTiming(0);
  assert.deepEqual(first, {
    delayMs: 0,
    durationMs: 110,
    isPrimary: true,
    isCascade: false,
  });
  assert.equal(first.durationMs, BOARD_ANIMATION_TIMING.primaryRevealDurationMs);
});

test('paces recursive cells as overlapping outward wave fronts', () => {
  assert.deepEqual(revealAnimationTiming(1), {
    delayMs: 150,
    durationMs: 420,
    isPrimary: false,
    isCascade: true,
  });
  assert.equal(revealAnimationTiming(2).delayMs, 290);
  assert.equal(revealAnimationTiming(3).delayMs, 430);
  assert.equal(revealAnimationTiming(99).delayMs, BOARD_ANIMATION_TIMING.cascadeMaxDelayMs);
});

test('keeps non-action snapshot reconciliation on the neutral reveal timing', () => {
  assert.deepEqual(revealAnimationTiming(null), {
    delayMs: 0,
    durationMs: 220,
    isPrimary: false,
    isCascade: false,
  });
});

test('holds a newly placed purge flag through its rise before the island dissolves', () => {
  const preview = sectorPurgeAnimationTiming(1, { flagPreview: true });
  assert.equal(BOARD_ANIMATION_TIMING.flagRiseDurationMs, 210);
  assert.equal(preview.leadInMs, 420);
  assert.ok(preview.leadInMs >= BOARD_ANIMATION_TIMING.flagRiseDurationMs * 2);
  assert.equal(preview.staggerMs, 0);
  assert.equal(preview.durationMs, 650);
  assert.equal(preview.totalMs, 1070);

  const ordinary = sectorPurgeAnimationTiming(3);
  assert.equal(ordinary.leadInMs, 0);
  assert.equal(ordinary.staggerMs, 96);
  assert.equal(ordinary.totalMs, 746);
});
