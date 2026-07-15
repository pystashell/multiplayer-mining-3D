import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findDeterministicInference,
  solveMinesweeperHint,
} from '../public/minesweeper-solver.js';

function constraint(cells, required, count, source) {
  return {
    cells,
    cellSet: new Set(cells),
    required,
    flagged: count - required,
    sources: [{ ...source, count }],
  };
}

test('derives safe cells from the overlapping 4-cell and 6-cell example', () => {
  const shared = ['0:0:0', '0:0:1', '0:1:0', '0:1:1'];
  const inference = findDeterministicInference([
    constraint(shared, 1, 1, { x: 0, y: 0, z: 2 }),
    constraint([...shared, '1:0:0', '1:0:1'], 1, 1, { x: 0, y: 1, z: 2 }),
  ]);
  assert.equal(inference.rule, 'subset-safe');
  assert.equal(inference.action, 'dig');
  assert.deepEqual(inference.target, { x: 1, y: 0, z: 0 });
  assert.equal(inference.details.difference, 2);
  assert.equal(inference.details.differenceMines, 0);
});

test('uses direct number rules before expensive enumeration', () => {
  const safe = findDeterministicInference([
    constraint(['0:1:0', '1:0:0'], 0, 1, { x: 0, y: 0, z: 0 }),
  ]);
  assert.equal(safe.rule, 'direct-safe');
  assert.equal(safe.details.flagged, 1);

  const mine = findDeterministicInference([
    constraint(['2:2:2'], 1, 3, { x: 1, y: 1, z: 1 }),
  ]);
  assert.equal(mine.rule, 'direct-mine');
  assert.equal(mine.action, 'flag');
});

test('prefers an outer-shell target when equally valid deductions are available', () => {
  const hint = findDeterministicInference([
    constraint(['2:2:2', '4:2:2'], 0, 1, { x: 3, y: 2, z: 2 }),
  ], { width: 5, height: 5, depth: 5 });
  assert.equal(hint.certainty, 'certain');
  assert.deepEqual(hint.target, { x: 4, y: 2, z: 2 });
});

test('enumerates every consistent layout to find globally certain cells', () => {
  const hint = solveMinesweeperHint({
    width: 1,
    height: 5,
    depth: 1,
    mineCount: 1,
    phase: 'playing',
    revealed: [
      { x: 0, y: 1, z: 0, count: 1 },
      { x: 0, y: 3, z: 0, count: 1 },
    ],
    flags: [],
  });
  assert.equal(hint.certainty, 'certain');
  assert.equal(hint.rule, 'enumeration-safe');
  assert.deepEqual(hint.target, { x: 0, y: 4, z: 0 });
  assert.equal(hint.details.totalWays, '1');
});

test('labels an unavoidable 50-50 choice as a guess with exact probability', () => {
  const hint = solveMinesweeperHint({
    width: 2,
    height: 2,
    depth: 1,
    mineCount: 1,
    phase: 'playing',
    revealed: [
      { x: 0, y: 0, z: 0, count: 1 },
      { x: 1, y: 1, z: 0, count: 1 },
    ],
    flags: [],
  });
  assert.equal(hint.rule, 'guess');
  assert.equal(hint.certainty, 'guess');
  assert.equal(hint.details.totalWays, '2');
  assert.equal(hint.details.mineProbability, 0.5);
  assert.equal(hint.details.safeProbability, 0.5);
});

test('returns an explicit fixed-rule guess when exact enumeration exceeds its budget', () => {
  const hint = solveMinesweeperHint({
    width: 2,
    height: 2,
    depth: 1,
    mineCount: 1,
    phase: 'playing',
    revealed: [{ x: 0, y: 0, z: 0, count: 1 }],
    flags: [],
    maxNodes: 1,
  });
  assert.equal(hint.status, 'hint');
  assert.equal(hint.rule, 'bounded-guess');
  assert.equal(hint.certainty, 'guess');
  assert.ok(hint.target);
  assert.equal(hint.details.hidden, 3);
  assert.equal(hint.details.remaining, 1);
});

test('uses an easy-to-tap outer corner as the protected first medium-board hint', () => {
  const hint = solveMinesweeperHint({
    width: 5, height: 5, depth: 5, mineCount: 10, phase: 'ready', revealed: [], flags: [],
  });
  assert.equal(hint.rule, 'first-move');
  assert.deepEqual(hint.target, { x: 4, y: 4, z: 4 });
});

test('supports the advanced 7x7x7 mission and starts from an outer corner', () => {
  const hint = solveMinesweeperHint({
    width: 7, height: 7, depth: 7, mineCount: 30, phase: 'ready', revealed: [], flags: [],
  });
  assert.equal(hint.rule, 'first-move');
  assert.equal(hint.certainty, 'certain');
  assert.deepEqual(hint.target, { x: 6, y: 6, z: 6 });
});

test('never suggests a cell that has already been removed by sector purge', () => {
  const hint = solveMinesweeperHint({
    width: 2,
    height: 2,
    depth: 1,
    mineCount: 1,
    phase: 'playing',
    revealed: [],
    flags: [],
    excluded: [{ x: 1, y: 1, z: 0 }],
  });
  assert.notDeepEqual(hint.target, { x: 1, y: 1, z: 0 });
});
