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

function seededRandom(initial = 0x12345678) {
  let state = initial >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createSolo(config, random = seededRandom()) {
  const engine = RoomEngine.create({
    code: 'HACK99', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000,
  });
  engine.random = random;
  engine.apply('host', { op: 'restart', config }, { id: 'restart', sequence: 1, now: 1_100 });
  return engine;
}

function command(engine, sequence, value, playerId = 'host', now = 2_000 + sequence) {
  return engine.apply(playerId, value, { id: `${playerId}-${sequence}`, sequence, now });
}

const scanConfig = {
  width: 4, height: 4, depth: 4, mineCount: 8,
  ruleset: 'sector', autoPurge: true, reduction: false, campaign: false,
};

const compressionConfig = {
  ...scanConfig, ruleset: 'reduction', reduction: true,
};

test('allows only a solo host to control Ultimate Hacker and blocks manual board actions while running', () => {
  const squad = RoomEngine.create({
    code: 'SQUAD1', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'squad', now: 1_000,
  });
  squad.reserveMember({ playerId: 'guest', name: 'Guest', tokenHash: 'guest-hash', now: 1_100 });
  assert.throws(
    () => squad.apply('host', { op: 'ultimate_hack_start' }, { id: 'squad-host', sequence: 1, now: 1_200 }),
    /SOLO_ONLY/,
  );
  assert.throws(
    () => squad.apply('guest', { op: 'ultimate_hack_start' }, { id: 'squad-guest', sequence: 1, now: 1_300 }),
    /HOST_ONLY/,
  );

  const engine = createSolo(scanConfig);
  command(engine, 2, { op: 'ultimate_hack_start' });
  for (const [offset, op] of ['dig', 'chord', 'reduce', 'flag'].entries()) {
    assert.throws(
      () => command(engine, 3 + offset, { op, x: 0, y: 0, z: 0 }),
      /ULTIMATE_HACK_ACTIVE/,
    );
  }
  const chat = command(engine, 7, { op: 'chat', content: 'still connected' });
  assert.equal(chat.kind, 'applied');
});

test('uses the normal protected first dig and exposes no future target or hidden mine data', () => {
  const engine = createSolo(scanConfig);
  command(engine, 2, { op: 'ultimate_hack_start' });
  const startSnapshot = engine.snapshot();
  assert.deepEqual(Object.keys(startSnapshot.ultimateHack).sort(), ['runId', 'startedBy', 'status', 'step', 'strategy']);
  assert.equal(startSnapshot.ultimateHack.strategy, 'scan');
  assert.equal(startSnapshot.ultimateHack.step, 0);
  assert.deepEqual(startSnapshot.mines, []);
  assert.equal(startSnapshot.replay, undefined);

  const runId = startSnapshot.ultimateHack.runId;
  command(engine, 3, { op: 'ultimate_hack_step', runId });
  const snapshot = engine.snapshot();
  assert.equal(snapshot.ultimateHack.step, 1);
  assert.equal(engine.state.mines.includes(0), false);
  assert.equal(snapshot.revealed.some((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0), true);
  assert.deepEqual(snapshot.mines, []);
  assert.equal(snapshot.replay, undefined);
  assert.equal('target' in snapshot.ultimateHack, false);
  assert.equal('plan' in snapshot.ultimateHack, false);
  assert.equal('hasVisibleFlag' in snapshot.ultimateHack, false);
});

test('keeps a scan-strategy flag visible for one snapshot before a later dig may Auto-Purge it', () => {
  const config = {
    width: 3, height: 3, depth: 3, mineCount: 1,
    ruleset: 'sector', autoPurge: true, reduction: false, campaign: false,
  };
  const engine = createSolo(config);
  Object.assign(engine.state, {
    phase: 'playing',
    startedAt: 1_200,
    mines: [0],
    flags: [],
    revealed: revealedExcept(27, [0, 26]),
  });
  command(engine, 2, { op: 'ultimate_hack_start' });
  const runId = engine.state.ultimateHack.runId;

  command(engine, 3, { op: 'ultimate_hack_step', runId });
  let snapshot = engine.snapshot();
  assert.equal(snapshot.ultimateHack.strategy, 'scan');
  assert.deepEqual(snapshot.flags, [pointOf(config, 0)]);
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.phase, 'playing');

  command(engine, 4, { op: 'ultimate_hack_step', runId });
  snapshot = engine.snapshot();
  assert.equal(snapshot.phase, 'won');
  assert.equal(snapshot.ultimateHack.status, 'completed');
  assert.deepEqual(snapshot.purged, []);
  assert.equal(snapshot.revealed.some((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0 && cell.count === 0), true);
  assert.equal(snapshot.replay.steps.some((step) => step.flags.length > 0), true);
});

test('uses hidden truth for compression steps and finalizes the successful replay', () => {
  const config = {
    width: 2, height: 2, depth: 2, mineCount: 1,
    ruleset: 'reduction', autoPurge: false, reduction: true, campaign: false,
  };
  const engine = createSolo(config);
  Object.assign(engine.state, {
    phase: 'playing',
    startedAt: 1_200,
    mines: [0],
    flags: [],
    revealed: revealedExcept(8, [0, 1]),
  });
  command(engine, 2, { op: 'ultimate_hack_start' });
  const runId = engine.state.ultimateHack.runId;
  command(engine, 3, { op: 'ultimate_hack_step', runId });

  const snapshot = engine.snapshot();
  assert.equal(snapshot.phase, 'won');
  assert.equal(snapshot.ultimateHack.strategy, 'compression');
  assert.equal(snapshot.ultimateHack.status, 'completed');
  assert.equal(snapshot.ultimateHack.step, 1);
  assert.deepEqual(snapshot.replay.steps.at(-1).reductionMines, [pointOf(config, 0)]);
  assert.equal(snapshot.replay.steps.at(-1).kind, 'reduction');
});

test('cancels by run id, rejects stale pulls, permits manual play afterward, and restart clears status', () => {
  const engine = createSolo(scanConfig);
  command(engine, 2, { op: 'ultimate_hack_start' });
  const runId = engine.state.ultimateHack.runId;
  assert.throws(
    () => command(engine, 3, { op: 'ultimate_hack_cancel', runId: 'stale-run' }),
    /STALE_ULTIMATE_HACK/,
  );

  command(engine, 4, { op: 'ultimate_hack_cancel', runId });
  assert.equal(engine.snapshot().ultimateHack.status, 'cancelled');
  assert.throws(
    () => command(engine, 5, { op: 'ultimate_hack_step', runId }),
    /WRONG_PHASE/,
  );
  const manual = command(engine, 6, { op: 'dig', x: 0, y: 0, z: 0 });
  assert.equal(manual.kind, 'applied');

  command(engine, 7, { op: 'restart', config: scanConfig });
  assert.equal(engine.snapshot().ultimateHack, null);
});

test('serializes and restores an active pull session without exposing its private control fields', () => {
  const engine = createSolo(compressionConfig);
  command(engine, 2, { op: 'ultimate_hack_start' });
  const runId = engine.state.ultimateHack.runId;
  command(engine, 3, { op: 'ultimate_hack_step', runId });

  const restored = RoomEngine.restore(engine.serialize(), seededRandom(99));
  assert.equal(restored.state.ultimateHack.runId, runId);
  assert.equal(restored.state.ultimateHack.status, 'running');
  assert.equal(restored.state.ultimateHack.step, 1);
  assert.deepEqual(Object.keys(restored.snapshot().ultimateHack).sort(), ['runId', 'startedBy', 'status', 'step', 'strategy']);
  command(restored, 4, { op: 'ultimate_hack_step', runId });
  assert.equal(restored.state.ultimateHack.step, 2);

  const legacy = restored.serialize();
  delete legacy.ultimateHack;
  assert.equal(RoomEngine.restore(legacy).snapshot().ultimateHack, null);
});

test('de-duplicates the same observed Ultimate Hacker step across distinct transport commands', () => {
  const engine = createSolo(compressionConfig);
  command(engine, 2, { op: 'ultimate_hack_start' });
  const runId = engine.state.ultimateHack.runId;

  const first = command(engine, 3, { op: 'ultimate_hack_step', runId, expectedStep: 0 });
  assert.equal(first.kind, 'applied');
  assert.equal(engine.snapshot().ultimateHack.step, 1);

  const retryWithNewCommandId = command(engine, 4, {
    op: 'ultimate_hack_step', runId, expectedStep: 0,
  });
  assert.equal(retryWithNewCommandId.kind, 'applied');
  assert.equal(retryWithNewCommandId.snapshot.ultimateHack.step, 1);

  command(engine, 5, { op: 'ultimate_hack_step', runId, expectedStep: 1 });
  assert.equal(engine.snapshot().ultimateHack.step, 2);
});

for (const { label, config, expectedStrategy, seed } of [
  {
    label: 'scan with Auto-Purge',
    config: {
      width: 9, height: 9, depth: 9, mineCount: 60,
      ruleset: 'sector', autoPurge: true, reduction: false, campaign: false,
    },
    expectedStrategy: 'scan',
    seed: 0x11111111,
  },
  {
    label: 'compression with Auto-Purge',
    config: {
      width: 9, height: 9, depth: 9, mineCount: 60,
      ruleset: 'reduction', autoPurge: true, reduction: true, campaign: false,
    },
    expectedStrategy: 'compression',
    seed: 0x22222222,
  },
]) {
  test(`authoritatively completes a 9x9x9 ${label} board within one-cell progress bounds`, () => {
    const engine = createSolo(config, seededRandom(seed));
    command(engine, 2, { op: 'ultimate_hack_start' });
    const runId = engine.state.ultimateHack.runId;
    let sequence = 3;
    let sawVisibleFlag = false;

    while (engine.state.phase !== 'won' && sequence <= 732) {
      command(engine, sequence, { op: 'ultimate_hack_step', runId }, 'host', 3_000 + sequence);
      sawVisibleFlag ||= engine.snapshot().flags.length > 0;
      assert.notEqual(engine.state.phase, 'revive');
      sequence += 1;
    }

    const snapshot = engine.snapshot();
    assert.equal(snapshot.phase, 'won');
    assert.equal(snapshot.ultimateHack.status, 'completed');
    assert.equal(snapshot.ultimateHack.strategy, expectedStrategy);
    assert.ok(snapshot.ultimateHack.step <= 730);
    assert.equal(snapshot.replay.steps.length, snapshot.ultimateHack.step);
    assert.equal(snapshot.replay.steps.at(-1).id.length > 0, true);
    assert.deepEqual(snapshot.mines, []);
    if (expectedStrategy === 'scan') assert.equal(sawVisibleFlag, true);
  });
}
