import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomEngine, findPurgeableSectors } from '../worker/room-engine.js';

const config = { width: 3, height: 3, depth: 3, mineCount: 1, ruleset: 'sector', campaign: false };

function revealedExcept(excluded) {
  const blocked = new Set(excluded);
  return Object.fromEntries(Array.from({ length: 27 }, (_, index) => index)
    .filter((index) => !blocked.has(index))
    .map((index) => [index, 1]));
}

test('finds a fully flagged mine island and identifies the clues that need recalculation', () => {
  const sectors = findPurgeableSectors({
    config,
    mines: [13],
    flags: [13],
    revealed: revealedExcept([13]),
  });

  assert.equal(sectors.length, 1);
  assert.deepEqual(sectors[0].mineIndexes, [13]);
  assert.equal(sectors[0].clueIndexes.length, 26);
  assert.deepEqual(sectors[0].cellIndexes, [13]);
});

test('tracks recursive depth from all zero-clue fronts with one multi-source BFS', () => {
  const engine = RoomEngine.create({ code: 'WAVE01', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
  engine.state.config = { width: 5, height: 2, depth: 2, mineCount: 1, ruleset: 'reduction', autoPurge: false, reduction: true, campaign: false };
  engine.state.phase = 'playing';
  engine.state.mines = [];
  engine.state.revealed = { 0: 0, 16: 0 };
  engine.state.flags = [];

  const opened = engine.revealSafeCells([4, 12], new Set(), 1);
  const depths = new Map(opened.map(({ index, depth }) => [index, depth]));
  assert.equal(depths.get(4), 1);
  assert.equal(depths.get(12), 1);
  assert.equal(depths.get(8), 2);
});

test('does not purge a flagged mine while it is still face-connected to an unknown cube', () => {
  const sectors = findPurgeableSectors({
    config,
    mines: [13],
    flags: [13],
    revealed: revealedExcept([13, 14]),
  });

  assert.deepEqual(sectors, []);
});

test('does not purge an island containing an incorrect flag', () => {
  const sectors = findPurgeableSectors({
    config,
    mines: [13],
    flags: [14],
    revealed: revealedExcept([14]),
  });

  assert.deepEqual(sectors, []);
});

test('automatically purges a solved squad sector and publishes the removal event', () => {
  const engine = RoomEngine.create({ code: 'PURGE1', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'squad', now: 1_000 });
  engine.state.config = { ...config };
  engine.state.phase = 'playing';
  engine.state.mines = [13];
  engine.state.revealed = revealedExcept([13]);
  engine.state.flags = [];
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'flag', x: 1, y: 1, z: 1 }, { id: 'purge', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  assert.equal(snapshot.phase, 'won');
  assert.equal(snapshot.purged.length, 0);
  assert.equal(snapshot.remainingMineCount, 0);
  assert.equal(snapshot.purgedMineCount, 1);
  assert.equal(snapshot.purgedSafeCount, 0);
  assert.equal(snapshot.flags.length, 0);
  assert.equal(snapshot.revealed.length, 27);
  assert.equal(snapshot.revealed.every((clue) => clue.count === 0), true);
  assert.equal(snapshot.lastPurge.mines.length, 1);
  assert.deepEqual(snapshot.lastPurge.leadFlags, [{ x: 1, y: 1, z: 1 }]);
  assert.equal(snapshot.lastPurge.clues.length, 27);
  assert.equal(snapshot.lastPurge.cells.length, 1);
  assert.equal(snapshot.activity.some((entry) => entry.key === 'sectorPurged'), true);
});

test('does not invent a lead flag for a purge started by another action', () => {
  const engine = RoomEngine.create({ code: 'PURGE2', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'squad', now: 1_000 });
  engine.state.config = { ...config };
  engine.state.phase = 'playing';
  engine.state.mines = [13];
  engine.state.revealed = revealedExcept([13]);
  engine.state.flags = [13];

  engine.purgeMines('host', [13], 2_000, { kind: 'sector', sectorCount: 1 });

  assert.deepEqual(engine.snapshot(2_001).lastPurge.leadFlags, []);
});

test('recalculates connected clues and keeps every non-zero number visible', () => {
  const engine = RoomEngine.create({ code: 'PURGE3', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'squad', now: 1_000 });
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 2, ruleset: 'sector', campaign: false };
  engine.state.phase = 'playing';
  engine.state.mines = [13, 26];
  engine.state.revealed = revealedExcept([13, 26]);
  engine.state.flags = [];
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'flag', x: 1, y: 1, z: 1 }, { id: 'recalculate', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  const zeroClue = snapshot.revealed.find((clue) => clue.x === 0 && clue.y === 0 && clue.z === 0);
  const retainedClue = snapshot.revealed.find((clue) => clue.x === 2 && clue.y === 2 && clue.z === 1);
  const replacementClue = snapshot.revealed.find((clue) => clue.x === 1 && clue.y === 1 && clue.z === 1);
  assert.deepEqual(snapshot.purged, []);
  assert.equal(zeroClue.count, 0);
  assert.equal(retainedClue.count, 1);
  assert.equal(replacementClue.count, 1);
  assert.equal(snapshot.lastPurge.updatedClues.length, 26);
  assert.equal(snapshot.lastPurge.cells.length, 1);
});

test('rewrites an Auto-Purged mine as the exact remaining adjacent mine count', () => {
  const engine = RoomEngine.create({ code: 'PURGEN', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'squad', now: 1_000 });
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 3, ruleset: 'sector', autoPurge: true, reduction: false, campaign: false };
  engine.state.phase = 'playing';
  engine.state.mines = [0, 2, 13];
  engine.state.revealed = revealedExcept([0, 2, 13]);
  engine.state.flags = [];
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'flag', x: 1, y: 1, z: 1 }, { id: 'replace-with-two', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  const replacementClue = snapshot.revealed.find((cell) => cell.x === 1 && cell.y === 1 && cell.z === 1);
  assert.equal(replacementClue?.count, 2);
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.remainingMineCount, 2);
  assert.equal(snapshot.purgedMineCount, 1);
  assert.equal(snapshot.reducedMineCount, 0);
});

test('cascades into hidden safe cells when a recalculated clue drops to zero', () => {
  const engine = RoomEngine.create({ code: 'PURGE4', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'squad', now: 1_000 });
  engine.state.config = { ...config };
  engine.state.phase = 'playing';
  engine.state.mines = [13];
  engine.state.revealed = revealedExcept([0, 13]);
  engine.state.flags = [];
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'flag', x: 1, y: 1, z: 1 }, { id: 'cascade', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  assert.equal(snapshot.phase, 'won');
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.revealed.length, 27);
  assert.equal(snapshot.revealed.find((cell) => cell.x === 1 && cell.y === 1 && cell.z === 1)?.count, 0);
  assert.deepEqual(snapshot.lastPurge.opened, [{ x: 0, y: 0, z: 0, count: 0, wave: 1 }]);
  assert.equal(snapshot.lastReveal.kind, 'sector');
  assert.deepEqual(snapshot.lastReveal.opened, [
    { x: 1, y: 1, z: 1, count: 0, wave: 0 },
    { x: 0, y: 0, z: 0, count: 0, wave: 1 },
  ]);
});

test('continues a direct reveal wave before a same-action Sector Purge cascade', () => {
  const engine = RoomEngine.create({ code: 'PURGE5', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'squad', now: 1_000 });
  const combined = engine.appendPurgeCascade(
    [{ index: 0, depth: 0 }, { index: 1, depth: 2 }],
    { cascadeIndexes: [2, 3], cascadeDepths: [1, 2] },
  );
  assert.deepEqual(combined, [
    { index: 0, depth: 0 },
    { index: 1, depth: 2 },
    { index: 2, depth: 3 },
    { index: 3, depth: 4 },
  ]);
});

test('keeps sector purge disabled during the fixed beginner tutorial', () => {
  const engine = RoomEngine.create({ code: 'PURGE2', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 3, ruleset: 'classic', campaign: true };
  engine.state.phase = 'playing';
  engine.state.mines = [13];
  engine.state.revealed = revealedExcept([13]);
  engine.state.flags = [13];

  assert.equal(engine.purgeSolvedSectors('host', 2_000), null);
  assert.deepEqual(engine.state.purged, []);
});

test('keeps classic flags on the board and never performs reduction', () => {
  const engine = RoomEngine.create({ code: 'CLASS1', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 1, ruleset: 'classic', campaign: false };
  engine.state.phase = 'playing';
  engine.state.mines = [0];
  engine.state.revealed = { 13: 1 };
  engine.state.flags = [0];
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'chord', x: 1, y: 1, z: 1 }, { id: 'classic-chord', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  assert.equal(snapshot.ruleset, 'classic');
  assert.deepEqual(snapshot.purged, []);
  assert.deepEqual(snapshot.flags, [{ x: 0, y: 0, z: 0 }]);
  assert.equal(snapshot.lastPurge, null);
});

test('keeps number auto-open separate from direct cell reduction', () => {
  const engine = RoomEngine.create({ code: 'REDUC1', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 2, ruleset: 'reduction', autoPurge: false, reduction: true, campaign: true };
  engine.state.phase = 'playing';
  engine.state.mines = [0, 26];
  engine.state.revealed = { 13: 2 };
  engine.state.flags = [0, 26];
  engine.state.startedAt = 900;

  assert.deepEqual(engine.snapshot(1_500).purged, []);
  engine.apply('host', { op: 'chord', x: 1, y: 1, z: 1 }, { id: 'reduction-chord', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  assert.equal(snapshot.ruleset, 'reduction');
  assert.equal(snapshot.remainingMineCount, 2);
  assert.equal(snapshot.flags.length, 2);
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.lastPurge, null);
});

test('direct reduction rewrites the removed mine as a clue when another mine is adjacent', () => {
  const engine = RoomEngine.create({ code: 'REDUC3', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 2, ruleset: 'reduction', autoPurge: false, reduction: true, campaign: true };
  engine.state.phase = 'playing';
  engine.state.mines = [0, 1];
  engine.state.revealed = { 13: 2 };
  engine.state.flags = [];
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'reduce', x: 0, y: 0, z: 0 }, { id: 'reduce-cell', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  assert.equal(snapshot.remainingMineCount, 1);
  assert.deepEqual(snapshot.flags, []);
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.lastPurge.kind, 'reduction');
  assert.equal(snapshot.lastPurge.mines.length, 1);
  assert.equal(snapshot.revealed.find((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0)?.count, 1);
  assert.equal(snapshot.revealed.find((cell) => cell.x === 1 && cell.y === 1 && cell.z === 1)?.count, 1);
  assert.equal(snapshot.lastPurge.opened.length, 0);
  assert.equal(snapshot.activity.some((entry) => entry.key === 'sectorPurged' && entry.params.kind === 'reduction'), true);
});

test('successive reductions recalculate an earlier rewritten mine clue and clear its flag', () => {
  const engine = RoomEngine.create({ code: 'REDUC5', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 2, ruleset: 'reduction', autoPurge: false, reduction: true, campaign: true };
  engine.state.phase = 'playing';
  engine.state.mines = [0, 1];
  engine.state.revealed = { 13: 2 };
  engine.state.flags = [0, 1];
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'reduce', x: 0, y: 0, z: 0 }, { id: 'reduce-first', sequence: 1, now: 2_000 });
  let snapshot = engine.snapshot(2_001);
  assert.equal(snapshot.revealed.find((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0)?.count, 1);
  assert.deepEqual(snapshot.flags, [{ x: 0, y: 0, z: 1 }]);

  engine.apply('host', { op: 'reduce', x: 0, y: 0, z: 1 }, { id: 'reduce-second', sequence: 2, now: 3_000 });
  snapshot = engine.snapshot(3_001);
  assert.equal(snapshot.remainingMineCount, 0);
  assert.equal(snapshot.phase, 'won');
  assert.deepEqual(snapshot.flags, []);
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.revealed.length, 27);
  assert.equal(snapshot.revealed.find((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0)?.count, 0);
  assert.equal(snapshot.revealed.find((cell) => cell.x === 0 && cell.y === 0 && cell.z === 1)?.count, 0);
});

test('direct reduction on a safe unopened cell triggers failure', () => {
  const engine = RoomEngine.create({ code: 'REDUC2', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 1, ruleset: 'reduction', autoPurge: false, reduction: true, campaign: true };
  engine.state.phase = 'playing';
  engine.state.mines = [0];
  engine.state.revealed = { 13: 1 };
  engine.state.flags = [];
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'reduce', x: 0, y: 0, z: 1 }, { id: 'wrong-reduction', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  assert.equal(snapshot.phase, 'revive');
  assert.deepEqual(snapshot.pendingMine, { x: 0, y: 0, z: 1 });
  assert.equal(snapshot.pendingFailureKind, 'reduction_miss');
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.lastPurge, null);
});

test('reduction recursively opens the safe region when recalculated clues drop to zero', () => {
  const engine = RoomEngine.create({ code: 'REDUC4', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 1, ruleset: 'reduction', autoPurge: false, reduction: true, campaign: true };
  engine.state.phase = 'playing';
  engine.state.mines = [0];
  engine.state.revealed = { 1: 1 };
  engine.state.flags = [];
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'reduce', x: 0, y: 0, z: 0 }, { id: 'reduce-cascade', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  assert.equal(snapshot.remainingMineCount, 0);
  assert.equal(snapshot.phase, 'won');
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.revealed.length, 27);
  assert.equal(snapshot.revealed.every((cell) => cell.count === 0), true);
  assert.equal(snapshot.lastPurge.updatedClues.find((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0)?.count, 0);
  assert.equal(snapshot.lastPurge.updatedClues.find((cell) => cell.x === 0 && cell.y === 0 && cell.z === 1)?.count, 0);
  assert.equal(snapshot.lastPurge.opened.length, 25);
  assert.deepEqual([...new Set(snapshot.lastPurge.opened.map((cell) => cell.wave))], [1, 2]);
  assert.equal(snapshot.lastPurge.opened.find((cell) => cell.x === 2 && cell.y === 2 && cell.z === 2)?.wave, 2);
  assert.equal(snapshot.lastReveal.kind, 'reduction');
  assert.equal(snapshot.lastReveal.opened.find((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0)?.wave, 0);
  assert.deepEqual([...new Set(snapshot.lastReveal.opened.map((cell) => cell.wave))], [0, 1, 2]);
});

for (const { label, autoPurge, reduction } of [
  { label: 'neither feature', autoPurge: false, reduction: false },
  { label: 'Auto-Purge only', autoPurge: true, reduction: false },
  { label: 'Reduction only', autoPurge: false, reduction: true },
  { label: 'Auto-Purge and Reduction together', autoPurge: true, reduction: true },
]) {
  test(`keeps feature behavior independent with ${label}`, () => {
    const flagEngine = RoomEngine.create({ code: 'FLAGS1', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
    flagEngine.state.config = {
      width: 3,
      height: 3,
      depth: 3,
      mineCount: 1,
      ruleset: reduction ? 'reduction' : (autoPurge ? 'sector' : 'classic'),
      autoPurge,
      reduction,
      campaign: false,
    };
    flagEngine.state.phase = 'playing';
    flagEngine.state.mines = [13];
    flagEngine.state.revealed = revealedExcept([13]);
    flagEngine.state.flags = [];
    flagEngine.state.startedAt = 900;

    flagEngine.apply('host', { op: 'flag', x: 1, y: 1, z: 1 }, { id: 'flag-feature', sequence: 1, now: 2_000 });
    let snapshot = flagEngine.snapshot(2_001);
    assert.equal(snapshot.sectorPurgeEnabled, autoPurge);
    assert.equal(snapshot.reductionEnabled, reduction);
    assert.equal(snapshot.purged.length, 0);
    assert.equal(snapshot.flags.length, autoPurge ? 0 : 1);

    const reductionEngine = RoomEngine.create({ code: 'REDMAT', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
    reductionEngine.state.config = { ...flagEngine.state.config };
    reductionEngine.state.phase = 'playing';
    reductionEngine.state.mines = [0];
    reductionEngine.state.revealed = { 1: 1 };
    reductionEngine.state.flags = [];
    reductionEngine.state.startedAt = 900;

    reductionEngine.apply('host', { op: 'reduce', x: 0, y: 0, z: 0 }, { id: 'reduce-feature', sequence: 1, now: 2_000 });
    snapshot = reductionEngine.snapshot(2_001);
    assert.equal(snapshot.remainingMineCount, reduction ? 0 : 1);
    assert.equal(snapshot.lastPurge?.kind ?? null, reduction ? 'reduction' : null);
    assert.equal(snapshot.revealed.some((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0), reduction);
  });
}

test('a Reduction bridge removal immediately Auto-Purges the newly isolated flagged mine', () => {
  const engine = RoomEngine.create({ code: 'BRIDGE', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000 });
  engine.state.config = {
    width: 3,
    height: 2,
    depth: 2,
    mineCount: 3,
    ruleset: 'reduction',
    autoPurge: true,
    reduction: true,
    campaign: false,
  };
  engine.state.phase = 'playing';
  engine.state.mines = [0, 4, 11];
  engine.state.flags = [0];
  engine.state.revealed = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => index)
      .filter((index) => ![0, 4, 8, 11].includes(index))
      .map((index) => [index, 1]),
  );
  engine.state.startedAt = 900;

  engine.apply('host', { op: 'reduce', x: 1, y: 0, z: 0 }, { id: 'bridge-reduction', sequence: 1, now: 2_000 });

  const snapshot = engine.snapshot(2_001);
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.revealed.some((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0), true);
  assert.equal(snapshot.remainingMineCount, 1);
  assert.equal(snapshot.purgedMineCount, 1);
  assert.equal(snapshot.reducedMineCount, 1);
  assert.equal(snapshot.lastPurge.kind, 'combined');
  assert.deepEqual(snapshot.lastPurge.reductionMines, [{ x: 1, y: 0, z: 0 }]);
  assert.deepEqual(snapshot.lastPurge.purgedMines, [{ x: 0, y: 0, z: 0 }]);
  assert.equal(snapshot.lastPurge.sectorCount, 1);
  assert.equal(snapshot.lastReveal.kind, 'reduction');
  assert.equal(snapshot.lastReveal.opened.some((cell) => (
    cell.x === 1 && cell.y === 0 && cell.z === 0 && cell.wave === 0
  )), true);
});
