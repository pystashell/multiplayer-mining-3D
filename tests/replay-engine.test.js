import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomEngine } from '../worker/room-engine.js';

function pointOf(config, index) {
  const z = index % config.depth;
  const plane = (index - z) / config.depth;
  const y = plane % config.height;
  const x = (plane - y) / config.height;
  return { x, y, z };
}

function revealedExcept(total, excluded, count = 1) {
  const blocked = new Set(excluded);
  return Object.fromEntries(
    Array.from({ length: total }, (_, index) => index)
      .filter((index) => !blocked.has(index))
      .map((index) => [index, count]),
  );
}

function createEngine(config, state = {}) {
  const engine = RoomEngine.create({
    code: 'REPLAY', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000,
  });
  engine.apply('host', { op: 'restart', config }, { id: 'restart', sequence: 1, now: 1_100 });
  Object.assign(engine.state, {
    phase: 'playing',
    startedAt: 1_200,
    mines: [],
    revealed: {},
    flags: [],
    purged: [],
    lastReveal: null,
    lastPurge: null,
    pendingMine: null,
    pendingFailureKind: null,
    ...state,
  });
  return engine;
}

function apply(engine, sequence, command, now = 2_000 + sequence) {
  return engine.apply('host', command, { id: `command-${sequence}`, sequence, now });
}

const classic2 = {
  width: 2, height: 2, depth: 2, mineCount: 1,
  ruleset: 'classic', autoPurge: false, reduction: false, campaign: false,
};

test('keeps failed and rewound attempts out of the completed successful route', () => {
  const engine = createEngine(classic2, {
    mines: [0],
    revealed: revealedExcept(8, [0, 1]),
  });

  apply(engine, 2, { op: 'dig', ...pointOf(classic2, 0) });
  assert.equal(engine.state.phase, 'revive');
  assert.equal(engine.state.replayDraft.steps.length, 0);
  assert.equal(engine.snapshot().replay, undefined);

  apply(engine, 3, { op: 'rewind' });
  apply(engine, 4, { op: 'dig', ...pointOf(classic2, 1) });

  const snapshot = engine.snapshot(3_000);
  assert.equal(snapshot.phase, 'won');
  assert.equal(snapshot.replay.version, 1);
  assert.equal(snapshot.replay.steps.length, 1);
  assert.equal(snapshot.replay.steps[0].kind, 'dig');
  assert.deepEqual(snapshot.replay.steps[0].target, pointOf(classic2, 1));
  assert.equal(snapshot.replay.steps[0].opened.some((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0), false);
  assert.equal(snapshot.replay.steps[0].at, 2_004);
});

test('omits incorrect flags and flag removals while de-duplicating a correct flag', () => {
  const engine = createEngine(classic2, { mines: [0] });
  const wrong = pointOf(classic2, 1);
  const correct = pointOf(classic2, 0);

  apply(engine, 2, { op: 'flag', ...wrong });
  apply(engine, 3, { op: 'flag', ...wrong });
  apply(engine, 4, { op: 'chord', ...wrong });
  assert.equal(engine.state.replayDraft.steps.length, 0);

  const first = engine.apply('host', { op: 'flag', ...correct }, { id: 'correct-flag', sequence: 5, now: 2_005 });
  const duplicate = engine.apply('host', { op: 'flag', ...correct }, { id: 'correct-flag', sequence: 5, now: 2_006 });
  assert.equal(first.kind, 'applied');
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(engine.state.replayDraft.steps.length, 1);
  assert.deepEqual(engine.publicReplay({
    version: 1,
    runId: engine.state.replayDraft.runId,
    config: engine.state.config,
    startedAt: engine.state.startedAt,
    completedAt: 2_006,
    steps: engine.state.replayDraft.steps,
  }).steps[0].flags, [correct]);

  apply(engine, 6, { op: 'flag', ...correct });
  apply(engine, 7, { op: 'flag', ...correct });
  assert.equal(engine.state.replayDraft.steps.length, 1);
  assert.equal(engine.snapshot().replay, undefined);
});

test('records a correct Reduction after a failed Reduction rewind, including clue updates and waves', () => {
  const reductionConfig = {
    ...classic2, ruleset: 'reduction', reduction: true,
  };
  const engine = createEngine(reductionConfig, {
    mines: [0],
    revealed: revealedExcept(8, [0, 1]),
  });

  apply(engine, 2, { op: 'reduce', ...pointOf(reductionConfig, 1) });
  assert.equal(engine.state.pendingFailureKind, 'reduction_miss');
  assert.equal(engine.state.replayDraft.steps.length, 0);
  apply(engine, 3, { op: 'rewind' });
  apply(engine, 4, { op: 'reduce', ...pointOf(reductionConfig, 0) });

  const step = engine.snapshot().replay.steps.at(-1);
  assert.equal(step.kind, 'reduction');
  assert.deepEqual(step.target, pointOf(reductionConfig, 0));
  assert.deepEqual(step.reductionMines, [pointOf(reductionConfig, 0)]);
  assert.deepEqual(step.purgedMines, []);
  assert.ok(step.updatedClues.length > 0);
  assert.equal(step.opened.some((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0 && cell.wave === 0), true);
  assert.equal(step.opened.some((cell) => cell.x === 0 && cell.y === 0 && cell.z === 1 && cell.wave >= 1), true);
  assert.equal(step.remainingMineCount, 0);
});

test('records an atomic Sector Purge with the correct flag, updated clues, and cascade wave', () => {
  const sectorConfig = {
    width: 3, height: 3, depth: 3, mineCount: 1,
    ruleset: 'sector', autoPurge: true, reduction: false, campaign: false,
  };
  const engine = createEngine(sectorConfig, {
    mines: [13],
    revealed: revealedExcept(27, [0, 13]),
  });

  apply(engine, 2, { op: 'flag', ...pointOf(sectorConfig, 13) });

  const snapshot = engine.snapshot();
  const step = snapshot.replay.steps.at(-1);
  assert.equal(step.kind, 'sector');
  assert.deepEqual(step.flags, [pointOf(sectorConfig, 13)]);
  assert.deepEqual(step.purgedMines, [pointOf(sectorConfig, 13)]);
  assert.deepEqual(step.reductionMines, []);
  assert.deepEqual(step.cells, [pointOf(sectorConfig, 13)]);
  assert.ok(step.updatedClues.length > 0);
  assert.deepEqual(step.opened, [{ ...pointOf(sectorConfig, 0), count: 0, wave: 1 }]);
  assert.equal(step.sectorCount, 1);
  assert.equal(snapshot.phase, 'won');
});

test('records both halves of a combined Reduction and Auto-Purge event', () => {
  const combinedConfig = {
    width: 3, height: 2, depth: 2, mineCount: 3,
    ruleset: 'reduction', autoPurge: true, reduction: true, campaign: false,
  };
  const engine = createEngine(combinedConfig, {
    mines: [0, 4, 11],
    flags: [0],
    revealed: revealedExcept(12, [0, 4, 8, 11]),
  });

  apply(engine, 2, { op: 'reduce', ...pointOf(combinedConfig, 4) });
  apply(engine, 3, { op: 'dig', ...pointOf(combinedConfig, 8) });

  const snapshot = engine.snapshot();
  const step = snapshot.replay.steps.find(({ kind }) => kind === 'combined');
  assert.equal(step.kind, 'combined');
  assert.deepEqual(step.reductionMines, [pointOf(combinedConfig, 4)]);
  assert.deepEqual(step.purgedMines, [pointOf(combinedConfig, 0)]);
  assert.deepEqual(step.cells, [pointOf(combinedConfig, 0), pointOf(combinedConfig, 4)]);
  assert.ok(step.updatedClues.length > 0);
  assert.ok(step.opened.length > 0);
  assert.ok(step.opened.every((cell) => Number.isInteger(cell.wave) && cell.wave >= 0));
  assert.equal(step.remainingMineCount, 1);
  assert.equal(step.sectorCount, 1);
  assert.equal(snapshot.phase, 'won');
});

test('persists an in-progress tape across restore, ignores duplicates, and includes the final winning step', () => {
  const engine = createEngine(classic2, {
    mines: [0],
    revealed: revealedExcept(8, [0, 1, 2]),
  });
  const firstPoint = pointOf(classic2, 1);
  const finalPoint = pointOf(classic2, 2);

  const first = engine.apply('host', { op: 'dig', ...firstPoint }, { id: 'first-dig', sequence: 2, now: 2_000 });
  const duplicate = engine.apply('host', { op: 'dig', ...firstPoint }, { id: 'first-dig', sequence: 2, now: 2_001 });
  assert.equal(first.kind, 'applied');
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(engine.state.replayDraft.steps.length, 1);
  const runId = engine.state.replayDraft.runId;

  const restored = RoomEngine.restore(engine.serialize());
  assert.equal(restored.state.replayDraft.runId, runId);
  assert.equal(restored.state.replayDraft.steps.length, 1);
  apply(restored, 3, { op: 'dig', ...finalPoint }, 3_000);

  const replay = restored.snapshot().replay;
  assert.equal(replay.runId, runId);
  assert.equal(replay.steps.length, 2);
  assert.deepEqual(replay.steps.at(-1).target, finalPoint);
  assert.equal(replay.steps.at(-1).at, 3_000);
  assert.equal(restored.state.phase, 'won');

  const restoredWinner = RoomEngine.restore(restored.serialize());
  assert.deepEqual(restoredWinner.snapshot().replay, replay);
});

test('restores legacy rooms without replay fields and restart creates a clean run', () => {
  const engine = createEngine(classic2, {
    mines: [0],
    revealed: revealedExcept(8, [0, 1, 2]),
  });
  apply(engine, 2, { op: 'dig', ...pointOf(classic2, 1) });
  const oldRunId = engine.state.replayDraft.runId;
  assert.equal(engine.state.replayDraft.steps.length, 1);

  apply(engine, 3, { op: 'restart', config: classic2 });
  assert.notEqual(engine.state.replayDraft.runId, oldRunId);
  assert.deepEqual(engine.state.replayDraft.steps, []);
  assert.equal(engine.state.completedReplay, null);
  assert.equal(engine.snapshot().replay, undefined);

  const legacy = engine.serialize();
  delete legacy.replayDraft;
  delete legacy.completedReplay;
  const restoredLegacy = RoomEngine.restore(legacy);
  assert.equal(restoredLegacy.state.replayDraft.version, 1);
  assert.deepEqual(restoredLegacy.state.replayDraft.steps, []);
  assert.equal(restoredLegacy.state.completedReplay, null);
});
