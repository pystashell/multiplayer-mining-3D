import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chordOpportunityAt,
  findChordOpportunity,
  findNewChordOpportunity,
  isNewSuccessfulChord,
} from '../public/tutorial-triggers.js';

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

test('revalidates one exact clue and returns its latest actionable hidden count', () => {
  const target = { x: 1, y: 1, z: 1 };
  const snapshot = {
    config,
    revealed: [
      { ...target, count: 1 },
      { x: 0, y: 0, z: 1, count: 0 },
    ],
    flags: [{ x: 0, y: 0, z: 0 }],
    purged: [{ x: 0, y: 1, z: 0 }],
  };

  assert.deepEqual(chordOpportunityAt(snapshot, target), {
    ...target,
    count: 1,
    hiddenAround: 23,
  });
  assert.equal(chordOpportunityAt(snapshot, { x: 2, y: 2, z: 2 }), null);
});

test('exact target revalidation expires after every actionable neighbor is opened or removed', () => {
  const target = { x: 1, y: 1, z: 1 };
  const flag = { x: 0, y: 0, z: 0 };
  const revealed = [{ ...target, count: 1 }];
  const purged = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
    if (x === target.x && y === target.y && z === target.z) continue;
    if (x === flag.x && y === flag.y && z === flag.z) continue;
    if (x === 2 && y === 2 && z === 2) purged.push({ x, y, z });
    else revealed.push({ x, y, z, count: 0 });
  }

  assert.equal(chordOpportunityAt({ config, revealed, flags: [flag], purged }, target), null);
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

test('does not trigger from an existing opportunity when the newly added flag is elsewhere', () => {
  const wideConfig = { width: 5, height: 5, depth: 5 };
  const clue = { x: 0, y: 0, z: 0, count: 1 };
  const existingFlag = { x: 0, y: 0, z: 1 };
  const unrelatedFlag = { x: 4, y: 4, z: 4 };
  const previous = {
    config: wideConfig,
    revealed: [clue],
    flags: [existingFlag],
  };
  const snapshot = {
    ...previous,
    flags: [existingFlag, unrelatedFlag],
  };

  assert.deepEqual(findChordOpportunity(snapshot), {
    ...clue,
    hiddenAround: 6,
  });
  assert.equal(findNewChordOpportunity(snapshot, previous), null);
});

test('does not trigger without a newly added flag', () => {
  const previous = {
    config,
    revealed: [{ x: 1, y: 1, z: 1, count: 2 }],
    flags: [{ x: 0, y: 0, z: 0 }],
  };
  const snapshot = {
    ...previous,
    revealed: [
      ...previous.revealed,
      { x: 2, y: 2, z: 1, count: 0 },
    ],
  };

  assert.equal(findNewChordOpportunity(snapshot, previous), null);
  assert.equal(findNewChordOpportunity(snapshot, null), null);
});

test('does not retrigger a clue that was already ready before a flag was moved', () => {
  const clue = { x: 1, y: 1, z: 1, count: 1 };
  const previous = {
    config,
    revealed: [clue],
    flags: [{ x: 0, y: 0, z: 0 }],
  };
  const snapshot = {
    ...previous,
    flags: [{ x: 2, y: 2, z: 2 }],
  };

  assert.equal(findNewChordOpportunity(snapshot, previous), null);
});

test('chooses deterministically between multiple clues completed by the same new flag', () => {
  const addedFlag = { x: 2, y: 2, z: 2 };
  const previous = {
    config: { width: 5, height: 5, depth: 5 },
    revealed: [
      { x: 2, y: 1, z: 2, count: 1 },
      { x: 1, y: 2, z: 2, count: 1 },
      { x: 1, y: 1, z: 1, count: 1 },
    ],
    flags: [],
  };
  const snapshot = {
    ...previous,
    flags: [addedFlag],
  };

  assert.deepEqual(findNewChordOpportunity(snapshot, previous), {
    x: 1,
    y: 1,
    z: 1,
    count: 1,
    hiddenAround: 23,
  });
});

test('does not trigger when the newly completed clue has no actionable hidden neighbor', () => {
  const flag = { x: 0, y: 0, z: 0 };
  const clue = { x: 1, y: 1, z: 1, count: 1 };
  const revealed = [clue];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
    if (x === 1 && y === 1 && z === 1) continue;
    if (x === 0 && y === 0 && z === 0) continue;
    revealed.push({ x, y, z, count: 0 });
  }
  const previous = { config, revealed, flags: [] };
  const snapshot = { ...previous, flags: [flag] };

  assert.equal(findNewChordOpportunity(snapshot, previous), null);
});

test('completes the lesson only for a new successful chord reveal', () => {
  const previous = { lastReveal: { id: 'reveal-1', kind: 'dig' } };

  assert.equal(isNewSuccessfulChord({ lastReveal: { id: 'reveal-2', kind: 'chord' } }, previous), true);
  assert.equal(isNewSuccessfulChord({ lastReveal: { id: 'reveal-1', kind: 'chord' } }, previous), false);
  assert.equal(isNewSuccessfulChord({ lastReveal: { id: 'reveal-2', kind: 'dig' } }, previous), false);
  assert.equal(isNewSuccessfulChord({ lastReveal: null }, previous), false);
});
