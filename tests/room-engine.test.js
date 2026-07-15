import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEGINNER_TUTORIAL_MINES,
  BEGINNER_TUTORIAL_START,
  RoomEngine,
  normalizeConfig,
} from '../worker/room-engine.js';

function createEngine(now = 1_000) {
  return RoomEngine.create({ code: 'ABC234', hostId: 'host', hostName: 'Host', tokenHash: 'hash', now });
}

function apply(engine, sequence, command, now = 1_000 + sequence) {
  return engine.apply('host', command, { id: `command-${sequence}`, sequence, now });
}

test('normalizes three-dimensional boards and enforces the 60 percent mine limit', () => {
  assert.deepEqual(normalizeConfig({ width: 99, height: 1, depth: 4, mineCount: 999 }), {
    width: 15,
    height: 2,
    depth: 4,
    mineCount: 72,
    ruleset: 'classic',
    autoPurge: false,
    reduction: false,
    campaign: false,
  });
});

test('normalizes Auto-Purge and Reduction independently while preserving legacy rulesets', () => {
  const featureState = (value) => {
    const normalized = normalizeConfig({
      width: 3,
      height: 3,
      depth: 3,
      mineCount: 3,
      ...value,
    });
    return {
      ruleset: normalized.ruleset,
      autoPurge: normalized.autoPurge,
      reduction: normalized.reduction,
    };
  };

  assert.deepEqual(featureState({ ruleset: 'classic', autoPurge: false, reduction: false }), {
    ruleset: 'classic', autoPurge: false, reduction: false,
  });
  assert.deepEqual(featureState({ ruleset: 'classic', autoPurge: true, reduction: false }), {
    ruleset: 'sector', autoPurge: true, reduction: false,
  });
  assert.deepEqual(featureState({ ruleset: 'classic', autoPurge: false, reduction: true }), {
    ruleset: 'reduction', autoPurge: false, reduction: true,
  });
  assert.deepEqual(featureState({ ruleset: 'classic', autoPurge: true, reduction: true }), {
    ruleset: 'reduction', autoPurge: true, reduction: true,
  });

  assert.deepEqual(featureState({ ruleset: 'classic' }), {
    ruleset: 'classic', autoPurge: false, reduction: false,
  });
  assert.deepEqual(featureState({ ruleset: 'sector' }), {
    ruleset: 'sector', autoPurge: true, reduction: false,
  });
  assert.deepEqual(featureState({ ruleset: 'reduction' }), {
    ruleset: 'reduction', autoPurge: true, reduction: true,
  });
});

test('restores a legacy Reduction room with both advanced features enabled', () => {
  const state = createEngine().serialize();
  state.config = {
    width: 7,
    height: 7,
    depth: 7,
    mineCount: 30,
    ruleset: 'reduction',
    campaign: true,
  };

  const restored = RoomEngine.restore(state);
  assert.equal(restored.state.config.ruleset, 'reduction');
  assert.equal(restored.state.config.autoPurge, true);
  assert.equal(restored.state.config.reduction, true);
  assert.equal(restored.snapshot().sectorPurgeEnabled, true);
  assert.equal(restored.snapshot().reductionEnabled, true);
});

test('keeps mines private, guarantees the first cell is safe, and reveals mines only after loss', () => {
  const engine = createEngine();
  apply(engine, 1, { op: 'restart', config: { width: 3, height: 3, depth: 3, mineCount: 3 } });
  apply(engine, 2, { op: 'dig', x: 1, y: 1, z: 1 });
  assert.equal(engine.state.mines.includes(13), false);
  assert.equal(engine.snapshot().mines.length, 0);
  assert.ok(engine.snapshot().revealed.length > 0);

  const mine = engine.state.mines[0];
  const z = mine % 3;
  const plane = (mine - z) / 3;
  const y = plane % 3;
  const x = (plane - y) / 3;
  apply(engine, 3, { op: 'dig', x, y, z });
  assert.equal(engine.state.phase, 'revive');
  assert.equal(engine.snapshot().mines.length, 0);
  apply(engine, 4, { op: 'end_game' });
  assert.equal(engine.snapshot().mines.length, 3);
});

test('publishes recursive dig cells as ordered reveal waves', () => {
  const engine = createEngine();
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 1, ruleset: 'classic', campaign: false };
  engine.state.phase = 'playing';
  engine.state.mines = [26];
  engine.state.revealed = {};
  engine.state.flags = [];
  engine.state.startedAt = 900;

  apply(engine, 1, { op: 'dig', x: 0, y: 0, z: 0 });

  const reveal = engine.snapshot().lastReveal;
  assert.equal(reveal.kind, 'dig');
  assert.equal(reveal.opened.find((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0)?.wave, 0);
  assert.equal(reveal.opened.find((cell) => cell.x === 2 && cell.y === 2 && cell.z === 1)?.wave, 2);
});

test('chords every unflagged neighbor when the adjacent flag count matches the clue', () => {
  const engine = createEngine();
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 1 };
  engine.state.phase = 'playing';
  engine.state.mines = [0];
  engine.state.revealed = { 13: 1 };
  engine.state.flags = [0];
  engine.state.startedAt = 900;

  apply(engine, 1, { op: 'chord', x: 1, y: 1, z: 1 });

  const snapshot = engine.snapshot();
  assert.equal(engine.state.phase, 'won');
  assert.equal(snapshot.revealed.length + snapshot.purgedSafeCount, 26);
  assert.equal(engine.state.pendingMine, null);
  assert.equal(engine.state.activity.some((entry) => entry.key === 'chorded'), true);
  assert.equal(engine.state.activity.some((entry) => entry.key === 'sectorPurged'), false);
  assert.deepEqual(snapshot.flags, [{ x: 0, y: 0, z: 0 }]);
});

test('publishes chord candidates as one fast first wave before recursive expansion', () => {
  const engine = createEngine();
  engine.state.config = { width: 5, height: 5, depth: 5, mineCount: 1, ruleset: 'classic', campaign: false };
  engine.state.phase = 'playing';
  engine.state.mines = [31];
  engine.state.revealed = { 62: 1 };
  engine.state.flags = [31];
  engine.state.startedAt = 900;

  apply(engine, 1, { op: 'chord', x: 2, y: 2, z: 2 });

  const reveal = engine.snapshot().lastReveal;
  assert.equal(reveal.kind, 'chord');
  assert.equal(reveal.opened.find((cell) => cell.x === 3 && cell.y === 3 && cell.z === 3)?.wave, 0);
  assert.equal(reveal.opened.find((cell) => cell.x === 4 && cell.y === 4 && cell.z === 4)?.wave, 1);
});

test('does nothing when a chord clue does not have the same number of adjacent flags', () => {
  const engine = createEngine();
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 1 };
  engine.state.phase = 'playing';
  engine.state.mines = [0];
  engine.state.revealed = { 13: 1 };
  engine.state.flags = [];
  engine.state.startedAt = 900;

  apply(engine, 1, { op: 'chord', x: 1, y: 1, z: 1 });

  assert.equal(engine.state.phase, 'playing');
  assert.deepEqual(engine.state.revealed, { 13: 1 });
  assert.equal(engine.state.activity.some((entry) => entry.key === 'chorded'), false);
});

test('triggers a mine without revealing safe neighbors when chord flags are wrong', () => {
  const engine = createEngine();
  engine.state.config = { width: 3, height: 3, depth: 3, mineCount: 1 };
  engine.state.phase = 'playing';
  engine.state.mines = [0];
  engine.state.revealed = { 13: 1 };
  engine.state.flags = [1];
  engine.state.startedAt = 900;

  apply(engine, 1, { op: 'chord', x: 1, y: 1, z: 1 });

  assert.equal(engine.state.phase, 'revive');
  assert.equal(engine.state.pendingMine, 0);
  assert.equal(engine.state.pendingFailureKind, 'mine');
  assert.deepEqual(engine.state.revealed, { 13: 1 });
  assert.deepEqual(engine.state.flags, [1]);
});

test('acknowledges duplicate commands without applying them twice', () => {
  const engine = createEngine();
  const first = engine.apply('host', { op: 'flag', x: 0, y: 0, z: 0 }, { id: 'same', sequence: 1, now: 2_000 });
  const revision = engine.state.revision;
  const duplicate = engine.apply('host', { op: 'flag', x: 0, y: 0, z: 0 }, { id: 'same', sequence: 1, now: 2_001 });
  assert.equal(first.kind, 'applied');
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(engine.state.flags.length, 1);
  assert.equal(engine.state.revision, revision);
});

test('persists an ad revival deadline and advances it authoritatively', () => {
  const engine = createEngine();
  engine.reserveMember({ playerId: 'guest', name: 'Guest', tokenHash: 'guest-hash', now: 1_500 });
  apply(engine, 1, { op: 'dig', x: 0, y: 0, z: 0 }, 2_000);
  const mine = engine.state.mines[0];
  const point = { x: Math.floor(mine / 9), y: Math.floor((mine % 9) / 3), z: mine % 3 };
  apply(engine, 2, { op: 'dig', ...point }, 2_100);
  engine.apply('guest', { op: 'watch_ad' }, { id: 'guest-ad', sequence: 1, now: 2_200 });
  assert.deepEqual(engine.snapshot().reviveStartedBy, { id: 'guest', name: 'Guest' });
  const restored = RoomEngine.restore(engine.serialize());
  assert.deepEqual(restored.snapshot().reviveStartedBy, { id: 'guest', name: 'Guest' });
  assert.equal(restored.advance(12_199), false);
  assert.equal(restored.advance(12_200), true);
  assert.equal(restored.state.phase, 'playing');
  assert.equal(restored.state.pendingMine, null);
  assert.equal(restored.state.pendingFailureKind, null);
  assert.equal(restored.snapshot().reviveStartedBy, null);
});

test('task rewind only undoes the mine hit and preserves the current minefield', () => {
  const engine = RoomEngine.create({
    code: 'SOLO24', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000,
  });
  engine.random = () => 0;
  apply(engine, 1, { op: 'restart', config: { width: 3, height: 3, depth: 3, mineCount: 3, ruleset: 'classic', campaign: true } });
  apply(engine, 2, { op: 'dig', x: 1, y: 1, z: 1 });
  const mine = engine.state.mines[0];
  const point = { x: Math.floor(mine / 9), y: Math.floor((mine % 9) / 3), z: mine % 3 };
  const flagIndex = Array.from({ length: 27 }, (_, index) => index)
    .find(index => !engine.state.mines.includes(index) && engine.state.revealed[index] === undefined);
  const flagPoint = { x: Math.floor(flagIndex / 9), y: Math.floor((flagIndex % 9) / 3), z: flagIndex % 3 };
  apply(engine, 3, { op: 'flag', ...flagPoint });
  const minesBefore = [...engine.state.mines];
  const revealedBefore = { ...engine.state.revealed };
  const flagsBefore = [...engine.state.flags];
  apply(engine, 4, { op: 'dig', ...point });
  assert.equal(engine.state.phase, 'revive');
  assert.equal(engine.state.reviveEndsAt, null);
  assert.equal(engine.snapshot().mines.length, 0);
  assert.throws(() => apply(engine, 5, { op: 'watch_ad' }), /WRONG_PHASE/);
  assert.throws(() => apply(engine, 6, { op: 'end_game' }), /WRONG_PHASE/);
  apply(engine, 7, { op: 'rewind' });
  assert.equal(engine.state.phase, 'playing');
  assert.equal(engine.state.pendingMine, null);
  assert.equal(engine.state.pendingFailureKind, null);
  assert.deepEqual(engine.state.mines, minesBefore);
  assert.deepEqual(engine.state.revealed, revealedBefore);
  assert.deepEqual(engine.state.flags, flagsBefore);

  apply(engine, 8, { op: 'restart', config: { width: 3, height: 3, depth: 3, mineCount: 3, ruleset: 'classic', campaign: true } });
  assert.equal(engine.state.phase, 'ready');
  assert.deepEqual(engine.state.mines, []);
  assert.deepEqual(engine.state.revealed, {});
  assert.deepEqual(engine.state.flags, []);
  engine.random = () => 0.999999;
  apply(engine, 9, { op: 'dig', x: 1, y: 1, z: 1 });
  assert.deepEqual(engine.state.mines, minesBefore);
});

test('only the host can reconfigure a room', () => {
  const engine = createEngine();
  engine.reserveMember({ playerId: 'guest', name: 'Guest', tokenHash: 'guest-hash', now: 2_000 });
  assert.throws(() => engine.apply('guest', { op: 'restart', config: {} }, { id: 'guest-command', sequence: 1, now: 2_001 }), /HOST_ONLY/);
});

test('stores semantic activity data so every client can localize it', () => {
  const engine = createEngine();
  engine.reserveMember({ playerId: 'guest', name: 'Guest', tokenHash: 'guest-hash', now: 2_000 });
  assert.deepEqual(engine.state.activity.at(-1), {
    id: engine.state.activity.at(-1).id,
    key: 'joined',
    params: { name: 'Guest' },
    at: 2_000,
  });
});

test('keeps task mode private and exposes the selected mode in snapshots', () => {
  const engine = RoomEngine.create({
    code: 'SOLO24', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000,
  });
  assert.equal(engine.snapshot().mode, 'solo');
  assert.throws(
    () => engine.reserveMember({ playerId: 'guest', name: 'Guest', tokenHash: 'guest-hash', now: 2_000 }),
    /SOLO_LOCKED/,
  );
  assert.equal(engine.snapshot().players.length, 1);
});

test('uses a fixed solution only for the guided beginner mission', () => {
  const solo = RoomEngine.create({
    code: 'SOLO24', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000,
  });
  apply(solo, 1, { op: 'restart', config: { width: 3, height: 3, depth: 3, mineCount: 3, ruleset: 'classic', campaign: true } });
  assert.deepEqual(solo.snapshot().tutorialStart, BEGINNER_TUTORIAL_START);
  assert.deepEqual(solo.snapshot().tutorialMines, BEGINNER_TUTORIAL_MINES);

  apply(solo, 2, { op: 'dig', ...BEGINNER_TUTORIAL_START });
  assert.deepEqual(solo.snapshot().tutorialMines, BEGINNER_TUTORIAL_MINES);
  const startIndex = (BEGINNER_TUTORIAL_START.x * 3 + BEGINNER_TUTORIAL_START.y) * 3 + BEGINNER_TUTORIAL_START.z;
  assert.equal(solo.state.mines.includes(startIndex), false);
  assert.ok(solo.snapshot().revealed.some((cell) => cell.x === BEGINNER_TUTORIAL_START.x && cell.y === BEGINNER_TUTORIAL_START.y && cell.z === BEGINNER_TUTORIAL_START.z));

  assert.equal(new Set(BEGINNER_TUTORIAL_MINES.map((mine) => mine.z)).size, 3, 'the tutorial places one mine in every depth layer');
  for (let left = 0; left < BEGINNER_TUTORIAL_MINES.length; left++) {
    for (let right = left + 1; right < BEGINNER_TUTORIAL_MINES.length; right++) {
      const a = BEGINNER_TUTORIAL_MINES[left];
      const b = BEGINNER_TUTORIAL_MINES[right];
      const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
      assert.ok(distance >= 3, 'tutorial mines remain visibly dispersed');
    }
  }

  const squad = createEngine();
  assert.equal(squad.snapshot().tutorialStart, null);
  assert.deepEqual(squad.snapshot().tutorialMines, []);

  apply(solo, 3, { op: 'restart', config: { width: 5, height: 5, depth: 5, mineCount: 10, ruleset: 'sector', campaign: true } });
  assert.equal(solo.snapshot().tutorialStart, null);
  assert.deepEqual(solo.snapshot().tutorialMines, []);
});

test('the fixed beginner route safely guides the player through the full board', () => {
  const solo = RoomEngine.create({
    code: 'SOLO24', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000,
  });
  apply(solo, 1, { op: 'restart', config: { width: 3, height: 3, depth: 3, mineCount: 3, ruleset: 'classic', campaign: true } });
  const guidedCommands = [
    { op: 'dig', ...BEGINNER_TUTORIAL_START },
    { op: 'flag', x: 0, y: 0, z: 0 },
    { op: 'dig', x: 0, y: 1, z: 0 },
    { op: 'dig', x: 0, y: 2, z: 0 },
    { op: 'dig', x: 0, y: 2, z: 2 },
    { op: 'flag', x: 0, y: 2, z: 1 },
    { op: 'flag', x: 2, y: 2, z: 2 },
    { op: 'dig', x: 1, y: 2, z: 2 },
  ];
  guidedCommands.forEach((command, index) => {
    apply(solo, index + 2, command);
    assert.notEqual(solo.state.phase, 'revive');
  });

  assert.equal(solo.state.phase, 'won');
  assert.equal(solo.snapshot().revealed.length, 24);
  assert.deepEqual(solo.snapshot().flags, BEGINNER_TUTORIAL_MINES);
});

test('restores legacy rooms as multiplayer squad rooms', () => {
  const engine = createEngine();
  const legacy = engine.serialize();
  delete legacy.mode;
  delete legacy.reviveStartedBy;
  const restored = RoomEngine.restore(legacy).snapshot();
  assert.equal(restored.mode, 'squad');
  assert.equal(restored.reviveStartedBy, null);
});
