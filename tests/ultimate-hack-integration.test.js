import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { RoomEngine } from '../worker/room-engine.js';

const ULTIMATE_CONFIG = Object.freeze({
  width: 9,
  height: 9,
  depth: 9,
  mineCount: 60,
  ruleset: 'reduction',
  autoPurge: true,
  reduction: true,
  campaign: false,
});

function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function createSoloEngine(config = ULTIMATE_CONFIG, seed = 1) {
  const engine = RoomEngine.create({
    code: 'ULT999',
    hostId: 'host',
    hostName: 'Host',
    tokenHash: 'hash',
    mode: 'solo',
    now: 1_000,
  });
  engine.random = seededRandom(seed);
  engine.apply('host', { op: 'restart', config }, {
    id: 'command-1', sequence: 1, now: 1_001,
  });
  return engine;
}

function apply(engine, sequence, command, options = {}) {
  return engine.apply('host', command, {
    id: options.id ?? `command-${sequence}`,
    sequence,
    now: options.now ?? 1_000 + sequence,
  });
}

function startUltimateHack(engine, sequence = 2) {
  const result = apply(engine, sequence, { op: 'ultimate_hack_start' });
  assert.equal(result.kind, 'applied');
  assert.equal(result.snapshot.ultimateHack.status, 'running');
  return result.snapshot.ultimateHack.runId;
}

function assertNoFutureTruth(snapshot) {
  assert.deepEqual(snapshot.mines, [], 'a live snapshot must not reveal the mine table');
  assert.deepEqual(snapshot.tutorialMines, [], 'the hidden run must not reuse tutorial truth');
  assert.deepEqual(
    Object.keys(snapshot.ultimateHack).sort(),
    ['runId', 'startedBy', 'status', 'step', 'strategy'].sort(),
    'the public run state must contain progress only, never a plan or next target',
  );
  for (const forbidden of ['mineIndexes', 'future', 'next', 'plan', 'queue', 'target', 'truth']) {
    assert.equal(
      Object.hasOwn(snapshot.ultimateHack, forbidden),
      false,
      `ultimateHack.${forbidden} would leak server-owned planning state`,
    );
  }
}

test('uses Reduction when enabled without exposing future targets or the mine table', () => {
  const engine = createSoloEngine();
  const runId = startUltimateHack(engine);

  const opening = apply(engine, 3, { op: 'ultimate_hack_step', runId }).snapshot;
  assert.equal(opening.phase, 'playing');
  assert.equal(opening.ultimateHack.step, 1);
  assertNoFutureTruth(opening);

  const reduction = apply(engine, 4, { op: 'ultimate_hack_step', runId }).snapshot;
  assert.equal(reduction.lastPurge.kind, 'reduction');
  assert.equal(reduction.lastPurge.reductionMines.length, 1);
  assert.deepEqual(reduction.flags, []);
  assert.equal(engine.state.replayDraft.steps.at(-1).kind, 'reduction');
  assertNoFutureTruth(reduction);
});

test('keeps the server runner available to ordinary Free Mode board configurations', () => {
  const engine = createSoloEngine({
    width: 3,
    height: 3,
    depth: 3,
    mineCount: 3,
    ruleset: 'classic',
    autoPurge: false,
    reduction: false,
    campaign: false,
  });
  const runId = startUltimateHack(engine);
  const snapshot = apply(engine, 3, { op: 'ultimate_hack_step', runId }).snapshot;

  assert.equal(snapshot.ultimateHack.status, 'running');
  assert.equal(snapshot.ultimateHack.strategy, 'scan');
  assert.equal(snapshot.ultimateHack.step, 1);
  assertNoFutureTruth(snapshot);
});

test('uses a correct visible flag for at least one full snapshot when Reduction is disabled', () => {
  const config = {
    ...ULTIMATE_CONFIG,
    ruleset: 'sector',
    reduction: false,
  };
  const engine = createSoloEngine(config);
  const runId = startUltimateHack(engine);

  apply(engine, 3, { op: 'ultimate_hack_step', runId });
  const flaggedSnapshot = apply(engine, 4, { op: 'ultimate_hack_step', runId }).snapshot;

  assert.equal(flaggedSnapshot.ultimateHack.strategy, 'scan');
  assert.equal(flaggedSnapshot.flags.length, 1, 'the server-confirmed flag must survive this snapshot');
  const [{ x, y, z }] = flaggedSnapshot.flags;
  const index = x * config.height * config.depth + y * config.depth + z;
  assert.equal(engine.state.mines.includes(index), true, 'the visible flag must be correct');
  assert.equal(engine.state.replayDraft.steps.at(-1).kind, 'flag');
  assertNoFutureTruth(flaggedSnapshot);
});

test('de-duplicates a repeated automatic step and rejects stale runs', () => {
  const engine = createSoloEngine();
  const runId = startUltimateHack(engine);
  const first = apply(engine, 3, { op: 'ultimate_hack_step', runId }, { id: 'same-step' });
  const stepAfterFirst = engine.snapshot().ultimateHack.step;
  const duplicate = apply(engine, 3, { op: 'ultimate_hack_step', runId }, { id: 'same-step', now: 2_000 });

  assert.equal(first.kind, 'applied');
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(engine.snapshot().ultimateHack.step, stepAfterFirst);
  assert.throws(
    () => apply(engine, 4, { op: 'ultimate_hack_step', runId: 'obsolete-run' }),
    /STALE_ULTIMATE_HACK/,
  );
  assert.equal(engine.snapshot().ultimateHack.step, stepAfterFirst);
});

test('cancels cleanly and allows ordinary play to resume', () => {
  const engine = createSoloEngine();
  const runId = startUltimateHack(engine);
  apply(engine, 3, { op: 'ultimate_hack_step', runId });
  const stepBeforeCancel = engine.snapshot().ultimateHack.step;

  const cancelled = apply(engine, 4, { op: 'ultimate_hack_cancel', runId }).snapshot;
  assert.equal(cancelled.ultimateHack.status, 'cancelled');
  assert.throws(
    () => apply(engine, 5, { op: 'ultimate_hack_step', runId }),
    /WRONG_PHASE/,
  );
  assert.equal(engine.snapshot().ultimateHack.step, stepBeforeCancel);

  const hiddenSafeIndex = Array.from({ length: 9 ** 3 }, (_, index) => index)
    .find((index) => engine.state.revealed[index] === undefined && !engine.state.mines.includes(index));
  assert.notEqual(hiddenSafeIndex, undefined);
  const z = hiddenSafeIndex % 9;
  const y = ((hiddenSafeIndex - z) / 9) % 9;
  const x = (hiddenSafeIndex - z - y * 9) / 81;
  const resumed = apply(engine, 5, { op: 'dig', x, y, z });
  assert.equal(resumed.kind, 'applied');
});

test('restores an in-progress run and still de-duplicates a pre-reconnect step', () => {
  const engine = createSoloEngine();
  const runId = startUltimateHack(engine);
  apply(engine, 3, { op: 'ultimate_hack_step', runId }, { id: 'before-reconnect' });
  const expectedStep = engine.snapshot().ultimateHack.step;

  const restored = RoomEngine.restore(engine.serialize(), seededRandom(99));
  assert.deepEqual(restored.snapshot().ultimateHack, engine.snapshot().ultimateHack);
  const duplicate = apply(restored, 3, { op: 'ultimate_hack_step', runId }, { id: 'before-reconnect' });
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(restored.snapshot().ultimateHack.step, expectedStep);

  const resumed = apply(restored, 4, { op: 'ultimate_hack_step', runId });
  assert.equal(resumed.kind, 'applied');
  assert.equal(resumed.snapshot.ultimateHack.runId, runId);
  assert.equal(resumed.snapshot.ultimateHack.step, expectedStep + 1);
  assertNoFutureTruth(resumed.snapshot);
});

test('completes the 9x9x9 / 60-mine hidden run within a bounded step and time budget', () => {
  const engine = createSoloEngine(ULTIMATE_CONFIG, 7);
  const runId = startUltimateHack(engine);
  let sequence = 3;
  const startedAt = performance.now();

  while (engine.snapshot().ultimateHack.status === 'running' && sequence <= 800) {
    const snapshot = apply(engine, sequence, { op: 'ultimate_hack_step', runId }).snapshot;
    if (snapshot.phase !== 'won') assertNoFutureTruth(snapshot);
    sequence += 1;
  }

  const elapsed = performance.now() - startedAt;
  const snapshot = engine.snapshot();
  assert.equal(snapshot.phase, 'won');
  assert.equal(snapshot.ultimateHack.status, 'completed');
  assert.ok(snapshot.ultimateHack.step <= 729, `expected at most one visible action per cell, got ${snapshot.ultimateHack.step}`);
  assert.ok(elapsed < 5_000, `9x9x9 clean run took ${elapsed.toFixed(1)}ms`);
  assert.ok(snapshot.replay.steps.length > 0);
  assert.ok(snapshot.replay.steps.every((step) => ['dig', 'flag', 'reduction', 'sector', 'combined'].includes(step.kind)));
});
