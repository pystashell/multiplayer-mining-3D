import test from 'node:test';
import assert from 'node:assert/strict';
import { findChordOpportunity, findNewChordOpportunity, isNewSuccessfulChord } from '../public/tutorial-triggers.js';

const config = { width: 3, height: 3, depth: 3 };

test('finds a revealed clue whose mines are fully flagged and still has hidden neighbors', () => {
  const opportunity = findChordOpportunity({
    config,
    revealed: [{ x: 1, y: 1, z: 1, count: 2 }],
    flags: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }],
  });

  assert.deepEqual(opportunity, { x: 1, y: 1, z: 1, count: 2, hiddenAround: 24 });
});

test('does not suggest auto-reveal before the clue has enough flags', () => {
  assert.equal(findChordOpportunity({
    config,
    revealed: [{ x: 1, y: 1, z: 1, count: 2 }],
    flags: [{ x: 0, y: 0, z: 0 }],
  }), null);
});

test('does not suggest auto-reveal when flags exceed the clue', () => {
  assert.equal(findChordOpportunity({
    config,
    revealed: [{ x: 1, y: 1, z: 1, count: 1 }],
    flags: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }],
  }), null);
});

test('does not suggest auto-reveal when no unopened unflagged neighbor remains', () => {
  const flags = [{ x: 0, y: 0, z: 0 }];
  const revealed = [{ x: 1, y: 1, z: 1, count: 1 }];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
    if (x === 1 && y === 1 && z === 1) continue;
    if (x === 0 && y === 0 && z === 0) continue;
    revealed.push({ x, y, z, count: 0 });
  }

  assert.equal(findChordOpportunity({ config, revealed, flags }), null);
});

test('detects a newly available auto-reveal clue without relying on total flag count', () => {
  const wideConfig = { width: 5, height: 5, depth: 5 };
  const previous = {
    config: wideConfig,
    revealed: [{ x: 2, y: 2, z: 2, count: 2 }],
    flags: [{ x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 }],
  };
  const snapshot = {
    config: wideConfig,
    revealed: [{ x: 2, y: 2, z: 2, count: 2 }],
    flags: [{ x: 1, y: 1, z: 1 }, { x: 3, y: 3, z: 3 }],
  };

  assert.deepEqual(findNewChordOpportunity(snapshot, previous), {
    x: 2,
    y: 2,
    z: 2,
    count: 2,
    hiddenAround: 24,
  });
  assert.equal(findNewChordOpportunity(snapshot, snapshot), null);
});

test('completes the lesson only for a new successful chord reveal', () => {
  const previous = { lastReveal: { id: 'reveal-1', kind: 'dig' } };

  assert.equal(isNewSuccessfulChord({ lastReveal: { id: 'reveal-2', kind: 'chord' } }, previous), true);
  assert.equal(isNewSuccessfulChord({ lastReveal: { id: 'reveal-1', kind: 'chord' } }, previous), false);
  assert.equal(isNewSuccessfulChord({ lastReveal: { id: 'reveal-2', kind: 'dig' } }, previous), false);
  assert.equal(isNewSuccessfulChord({ lastReveal: null }, previous), false);
});
