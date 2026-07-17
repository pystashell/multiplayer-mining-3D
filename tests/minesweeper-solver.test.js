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

test('prefers certain mines across deterministic rule levels only when requested', () => {
  const constraints = [
    constraint(['0:0:0'], 0, 1, { x: 0, y: 1, z: 0 }),
    constraint(['1:0:0'], 0, 1, { x: 1, y: 1, z: 0 }),
    constraint(['1:0:0', '2:0:0'], 1, 1, { x: 2, y: 1, z: 0 }),
  ];
  const classic = findDeterministicInference(constraints, { width: 3, height: 2, depth: 1 });
  const reduction = findDeterministicInference(
    constraints,
    { width: 3, height: 2, depth: 1 },
    { preferMines: true },
  );
  assert.equal(classic.action, 'dig');
  assert.equal(classic.rule, 'direct-safe');
  assert.equal(reduction.action, 'flag');
  assert.equal(reduction.rule, 'subset-mine');
  assert.deepEqual(reduction.target, { x: 2, y: 0, z: 0 });
});

test('prefers an outer-shell target when equally valid deductions are available', () => {
  const hint = findDeterministicInference([
    constraint(['2:2:2', '4:2:2'], 0, 1, { x: 3, y: 2, z: 2 }),
  ], { width: 5, height: 5, depth: 5 });
  assert.equal(hint.certainty, 'certain');
  assert.deepEqual(hint.target, { x: 4, y: 2, z: 2 });
});

test('explains a generalized set-cover deduction with labeled human-readable clues', () => {
  const first = ['0:0:0', '0:0:1', '0:1:0', '0:1:1'];
  const second = ['1:0:0', '1:0:1', '1:1:0', '1:1:1'];
  const remainder = ['2:0:0', '2:0:1'];
  const inference = findDeterministicInference([
    constraint([...first, ...second, ...remainder], 2, 2, { x: 4, y: 4, z: 4 }),
    constraint(first, 1, 1, { x: 3, y: 3, z: 3 }),
    constraint(second, 1, 1, { x: 2, y: 2, z: 2 }),
  ]);

  assert.equal(inference.rule, 'cover-safe');
  assert.equal(inference.action, 'dig');
  assert.equal(inference.details.difference, 2);
  assert.equal(inference.details.differenceMines, 0);
  assert.equal(inference.details.proof.kind, 'set-cover');
  assert.deepEqual(inference.details.proof.clues.map((clue) => clue.id), ['A', 'B', 'C']);
  assert.deepEqual(inference.evidence, inference.details.proof.clues.map((clue) => clue.source));
  assert.deepEqual(inference.details.proof.relations.at(-1), {
    kind: 'subtract-covered',
    from: 'A',
    subtract: ['B', 'C'],
    coveredMines: 2,
    otherHidden: 2,
    otherRemaining: 0,
  });
  assert.equal(inference.details.proof.conclusion.targetValue, 'safe');
  assert.deepEqual(inference.details.proof.conclusion.differenceCells, remainder.map((key) => {
    const [x, y, z] = key.split(':').map(Number);
    return { x, y, z };
  }));
});

test('turns the former 64-layout beginner hint into a three-gold-clue proof', () => {
  const hint = solveMinesweeperHint({
    width: 3,
    height: 3,
    depth: 3,
    mineCount: 3,
    phase: 'playing',
    flags: [],
    revealed: [
      { x: 2, y: 0, z: 0, count: 0 },
      { x: 1, y: 0, z: 0, count: 1 },
      { x: 1, y: 0, z: 1, count: 2 },
      { x: 1, y: 1, z: 0, count: 2 },
      { x: 1, y: 1, z: 1, count: 3 },
      { x: 2, y: 0, z: 1, count: 1 },
      { x: 2, y: 1, z: 0, count: 1 },
      { x: 2, y: 1, z: 1, count: 2 },
    ],
  });

  assert.equal(hint.rule, 'cover-safe');
  assert.deepEqual(hint.target, { x: 2, y: 2, z: 2 });
  assert.deepEqual(hint.details.proof.clues.map(({ id, number, hidden, remaining }) => (
    { id, number, hidden, remaining }
  )), [
    { id: 'A', number: 2, hidden: 10, remaining: 2 },
    { id: 'B', number: 1, hidden: 4, remaining: 1 },
    { id: 'C', number: 1, hidden: 4, remaining: 1 },
  ]);
  assert.equal(hint.details.proof.relations.some((relation) => relation.kind === 'pairwise-disjoint'), true);
  assert.equal(hint.details.proof.conclusion.differenceCells.length, 2);
  assert.equal(hint.details.proof.conclusion.differenceMines, 0);
});

test('uses the same cover relation to prove every remaining cell is a mine', () => {
  const first = ['0:0:0', '0:0:1', '0:1:0', '0:1:1'];
  const second = ['1:0:0', '1:0:1', '1:1:0', '1:1:1'];
  const remainder = ['2:0:0', '2:0:1'];
  const inference = findDeterministicInference([
    constraint([...first, ...second, ...remainder], 4, 4, { x: 4, y: 4, z: 4 }),
    constraint(first, 1, 1, { x: 3, y: 3, z: 3 }),
    constraint(second, 1, 1, { x: 2, y: 2, z: 2 }),
  ]);

  assert.equal(inference.rule, 'cover-mine');
  assert.equal(inference.action, 'flag');
  assert.equal(inference.details.differenceMines, 2);
  assert.equal(inference.details.proof.conclusion.targetValue, 'mine');
});

test('enumerates every consistent layout to find globally certain cells', () => {
  const board = {
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
  };
  const hint = solveMinesweeperHint(board);
  assert.equal(hint.certainty, 'certain');
  assert.equal(hint.rule, 'enumeration-safe');
  assert.deepEqual(hint.target, { x: 0, y: 4, z: 0 });
  assert.equal(hint.details.totalWays, '1');
  assert.equal(hint.details.proof.kind, 'contradiction-enumeration');
  assert.equal(hint.details.proof.clueScope, 'key-constraints');
  assert.equal(hint.details.proof.assumption, 'mine');
  assert.equal(hint.details.proof.oppositeWays, '0');
  assert.equal(hint.details.proof.validWays, hint.details.totalWays);
  assert.ok(hint.details.proof.clues.length > 0 && hint.details.proof.clues.length <= 4);
  assert.deepEqual(hint.evidence, hint.details.proof.clues.map((clue) => clue.source));
  hint.details.proof.clues.forEach((clue, index) => {
    assert.deepEqual(clue.source, hint.evidence[index]);
    assert.equal(clue.number, clue.source.count);
    assert.equal(typeof clue.flagged, 'number');
    assert.equal(typeof clue.remaining, 'number');
    assert.equal(clue.hidden, clue.unknownCells.length);
    assert.equal(clue.otherHidden, clue.hidden - Number(clue.containsTarget));
    assert.equal(clue.otherRemaining, clue.remaining - Number(clue.containsTarget));
  });

  const reductionHint = solveMinesweeperHint({ ...board, preferMines: true });
  assert.equal(reductionHint.certainty, 'certain');
  assert.equal(reductionHint.action, 'flag');
  assert.equal(reductionHint.rule, 'enumeration-mine');
  assert.deepEqual(reductionHint.target, { x: 0, y: 2, z: 0 });
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

test('records the rejected safe assumption when enumeration proves a mine', () => {
  const hint = solveMinesweeperHint({
    width: 1,
    height: 5,
    depth: 1,
    mineCount: 3,
    phase: 'playing',
    revealed: [{ x: 0, y: 1, z: 0, count: 1 }],
    flags: [],
  });

  assert.equal(hint.rule, 'enumeration-mine');
  assert.equal(hint.action, 'flag');
  assert.equal(hint.details.proof.assumption, 'safe');
  assert.equal(hint.details.proof.oppositeWays, '0');
  assert.equal(hint.details.proof.validWays, hint.details.totalWays);
  assert.ok(hint.details.proof.clues.length <= 4);
  assert.deepEqual(hint.evidence, hint.details.proof.clues.map((clue) => clue.source));
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
