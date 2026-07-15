import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_ANIMATION_TIMING,
  revealAnimationTiming,
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
