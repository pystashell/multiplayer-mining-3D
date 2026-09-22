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

function startAutoSurvey(engine, sequence = 2) {
  const result = apply(engine, sequence, { op: 'auto_survey_start' });
  assert.equal(result.kind, 'applied');
  assert.equal(result.snapshot.autoSurvey.status, 'running');
  return result.snapshot.autoSurvey.runId;
}

function assertNoFutureTruth(snapshot) {
  assert.deepEqual(snapshot.mines, [], 'a live snapshot must not reveal the mine table');
  assert.deepEqual(snapshot.tutorialMines, [], 'the hidden run must not reuse tutorial truth');
  assert.deepEqual(
    Object.keys(snapshot.autoSurvey).sort(),
    ['runId', 'startedBy', 'status', 'step', 'strategy'].sort(),
    'the public run state must contain progress only, never a plan or next target',
  );
  for (const forbidden of ['mineIndexes', 'future', 'next', 'plan', 'queue', 'target', 'truth']) {
    assert.equal(
      Object.hasOwn(snapshot.autoSurvey, forbidden),
      false,
      `autoSurvey.${forbidden} would leak server-owned planning state`,
    );
  }
}

test('uses Reduction when enabled without exposing future targets or the mine table', () => {
  const engine = createSoloEngine();
  const runId = startAutoSurvey(engine);

  const opening = apply(engine, 3, { op: 'auto_survey_step', runId }).snapshot;
  assert.equal(opening.phase, 'playing');
  assert.equal(opening.autoSurvey.step, 1);
  assertNoFutureTruth(opening);

  const reduction = apply(engine, 4, { op: 'auto_survey_step', runId }).snapshot;
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
  const runId = startAutoSurvey(engine);
  const snapshot = apply(engine, 3, { op: 'auto_survey_step', runId }).snapshot;

  assert.equal(snapshot.autoSurvey.status, 'running');
  assert.equal(snapshot.autoSurvey.strategy, 'scan');
  assert.equal(snapshot.autoSurvey.step, 1);
  assertNoFutureTruth(snapshot);
});

test('uses a correct visible flag for at least one full snapshot when Reduction is disabled', () => {
  const config = {
    ...ULTIMATE_CONFIG,
    ruleset: 'sector',
    reduction: false,
  };
  const engine = createSoloEngine(config);
  const runId = startAutoSurvey(engine);

  apply(engine, 3, { op: 'auto_survey_step', runId });
  const flaggedSnapshot = apply(engine, 4, { op: 'auto_survey_step', runId }).snapshot;

  assert.equal(flaggedSnapshot.autoSurvey.strategy, 'scan');
  assert.equal(flaggedSnapshot.flags.length, 1, 'the server-confirmed flag must survive this snapshot');
  const [{ x, y, z }] = flaggedSnapshot.flags;
  const index = x * config.height * config.depth + y * config.depth + z;
  assert.equal(engine.state.mines.includes(index), true, 'the visible flag must be correct');
  assert.equal(engine.state.replayDraft.steps.at(-1).kind, 'flag');
  assertNoFutureTruth(flaggedSnapshot);
});

test('de-duplicates a repeated automatic step and rejects stale runs', () => {
  const engine = createSoloEngine();
  const runId = startAutoSurvey(engine);
  const first = apply(engine, 3, { op: 'auto_survey_step', runId }, { id: 'same-step' });
  const stepAfterFirst = engine.snapshot().autoSurvey.step;
  const duplicate = apply(engine, 3, { op: 'auto_survey_step', runId }, { id: 'same-step', now: 2_000 });

  assert.equal(first.kind, 'applied');
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(engine.snapshot().autoSurvey.step, stepAfterFirst);
  assert.throws(
    () => apply(engine, 4, { op: 'auto_survey_step', runId: 'obsolete-run' }),
    /STALE_AUTO_SURVEY/,
  );
  assert.equal(engine.snapshot().autoSurvey.step, stepAfterFirst);
});

test('cancels cleanly and allows ordinary play to resume', () => {
  const engine = createSoloEngine();
  const runId = startAutoSurvey(engine);
  apply(engine, 3, { op: 'auto_survey_step', runId });
  const stepBeforeCancel = engine.snapshot().autoSurvey.step;

  const cancelled = apply(engine, 4, { op: 'auto_survey_cancel', runId }).snapshot;
  assert.equal(cancelled.autoSurvey.status, 'cancelled');
  assert.throws(
    () => apply(engine, 5, { op: 'auto_survey_step', runId }),
    /WRONG_PHASE/,
  );
  assert.equal(engine.snapshot().autoSurvey.step, stepBeforeCancel);

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
  const runId = startAutoSurvey(engine);
  apply(engine, 3, { op: 'auto_survey_step', runId }, { id: 'before-reconnect' });
  const expectedStep = engine.snapshot().autoSurvey.step;

  const restored = RoomEngine.restore(engine.serialize(), seededRandom(99));
  assert.deepEqual(restored.snapshot().autoSurvey, engine.snapshot().autoSurvey);
  const duplicate = apply(restored, 3, { op: 'auto_survey_step', runId }, { id: 'before-reconnect' });
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(restored.snapshot().autoSurvey.step, expectedStep);

  const resumed = apply(restored, 4, { op: 'auto_survey_step', runId });
  assert.equal(resumed.kind, 'applied');
  assert.equal(resumed.snapshot.autoSurvey.runId, runId);
  assert.equal(resumed.snapshot.autoSurvey.step, expectedStep + 1);
  assertNoFutureTruth(resumed.snapshot);
});

test('completes the 9x9x9 / 60-mine hidden run within a bounded step and time budget', () => {
  const engine = createSoloEngine(ULTIMATE_CONFIG, 7);
  const runId = startAutoSurvey(engine);
  let sequence = 3;
  const startedAt = performance.now();

  while (engine.snapshot().autoSurvey.status === 'running' && sequence <= 800) {
    const snapshot = apply(engine, sequence, { op: 'auto_survey_step', runId }).snapshot;
    if (snapshot.phase !== 'won') assertNoFutureTruth(snapshot);
    sequence += 1;
  }

  const elapsed = performance.now() - startedAt;
  const snapshot = engine.snapshot();
  assert.equal(snapshot.phase, 'won');
  assert.equal(snapshot.autoSurvey.status, 'completed');
  assert.ok(snapshot.autoSurvey.step <= 729, `expected at most one visible action per cell, got ${snapshot.autoSurvey.step}`);
  assert.ok(elapsed < 5_000, `9x9x9 clean run took ${elapsed.toFixed(1)}ms`);
  assert.ok(snapshot.replay.steps.length > 0);
  assert.ok(snapshot.replay.steps.every((step) => ['dig', 'flag', 'reduction', 'sector', 'combined'].includes(step.kind)));
});
