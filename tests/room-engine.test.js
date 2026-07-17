import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMinesweeperHint } from '../public/minesweeper-solver.js';
import {
  BEGINNER_TUTORIAL_START,
  RoomEngine,
  normalizeConfig,
} from '../worker/room-engine.js';
import {
  createBeginnerTutorialLayout,
  enumerateBeginnerTutorialCandidates,
  isExplainableBeginnerHint,
  validateBeginnerTutorialLayout,
} from '../worker/beginner-layout.js';

function createEngine(now = 1_000) {
  return RoomEngine.create({ code: 'ABC234', hostId: 'host', hostName: 'Host', tokenHash: 'hash', now });
}

function apply(engine, sequence, command, now = 1_000 + sequence) {
  return engine.apply('host', command, { id: `command-${sequence}`, sequence, now });
}

function cellIndex(config, point) {
  return (point.x * config.height + point.y) * config.depth + point.z;
}

function pointFromIndex(config, index) {
  const z = index % config.depth;
  const plane = (index - z) / config.depth;
  const y = plane % config.height;
  const x = (plane - y) / config.height;
  return { x, y, z };
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
  apply(engine, 2, { op: 'dig', ...BEGINNER_TUTORIAL_START });
  const mine = engine.state.mines[0];
  const point = pointFromIndex(engine.state.config, mine);
  const flagIndex = Array.from({ length: 27 }, (_, index) => index)
    .find(index => !engine.state.mines.includes(index) && engine.state.revealed[index] === undefined);
  const flagPoint = pointFromIndex(engine.state.config, flagIndex);
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
  apply(engine, 9, { op: 'dig', ...BEGINNER_TUTORIAL_START });
  assert.equal(validateBeginnerTutorialLayout(engine.state.mines), true);
});

test('only the host can reconfigure a room', () => {
  const engine = createEngine();
  engine.reserveMember({ playerId: 'guest', name: 'Guest', tokenHash: 'guest-hash', now: 2_000 });
  assert.throws(() => engine.apply('guest', { op: 'restart', config: {} }, { id: 'guest-command', sequence: 1, now: 2_001 }), /HOST_ONLY/);
});

test('intentional leave removes a squad member and frees the seat', () => {
  const engine = createEngine();
  engine.reserveMember({ playerId: 'guest', name: 'Guest', tokenHash: 'guest-hash', now: 2_000 });

  engine.apply('guest', { op: 'leave' }, { id: 'guest-leave', sequence: 1, now: 2_100 });

  assert.equal(engine.member('guest'), null);
  assert.deepEqual(engine.snapshot().players.map((player) => player.id), ['host']);
  assert.equal(engine.state.activity.at(-1).key, 'left');
  assert.deepEqual(engine.state.activity.at(-1).params, { name: 'Guest' });
});

test('host leave transfers control to the earliest remaining squad member', () => {
  const engine = createEngine();
  engine.reserveMember({ playerId: 'guest-a', name: 'Guest A', tokenHash: 'guest-a-hash', now: 2_000 });
  engine.reserveMember({ playerId: 'guest-b', name: 'Guest B', tokenHash: 'guest-b-hash', now: 2_100 });

  apply(engine, 1, { op: 'leave' }, 2_200);

  assert.equal(engine.state.hostId, 'guest-a');
  assert.equal(engine.snapshot().players.find((player) => player.id === 'guest-a').isHost, true);
  assert.equal(engine.state.activity.at(-1).key, 'hostTransferred');
  assert.deepEqual(engine.state.activity.at(-1).params, { name: 'Guest A' });
  assert.doesNotThrow(() => engine.apply(
    'guest-a',
    { op: 'restart', config: { width: 3, height: 3, depth: 3, mineCount: 3 } },
    { id: 'new-host-restart', sequence: 1, now: 2_300 },
  ));
});

test('a new member becomes host when reusing an empty squad room', () => {
  const engine = createEngine();
  apply(engine, 1, { op: 'leave' }, 2_000);
  assert.equal(engine.state.hostId, null);
  assert.deepEqual(engine.snapshot().players, []);

  engine.reserveMember({ playerId: 'replacement', name: 'Replacement', tokenHash: 'replacement-hash', now: 2_100 });
  assert.equal(engine.state.hostId, 'replacement');
  assert.equal(engine.snapshot().players[0].isHost, true);
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

test('constructs the complete dispersed three-layer beginner candidate space at runtime', () => {
  const candidates = enumerateBeginnerTutorialCandidates();
  assert.equal(candidates.length, 186);
  assert.equal(new Set(candidates.map((layout) => layout.join(','))).size, candidates.length);
  const config = { width: 3, height: 3, depth: 3 };
  const startIndex = cellIndex(config, BEGINNER_TUTORIAL_START);
  for (const layout of candidates) {
    assert.equal(layout.length, 3);
    assert.equal(new Set(layout).size, 3);
    assert.equal(layout.includes(startIndex), false);
    assert.deepEqual([...layout].sort((left, right) => left - right), layout);
    assert.equal(new Set(layout.map((index) => pointFromIndex(config, index).z)).size, 3);
    for (let left = 0; left < layout.length; left += 1) {
      for (let right = left + 1; right < layout.length; right += 1) {
        const a = pointFromIndex(config, layout[left]);
        const b = pointFromIndex(config, layout[right]);
        const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
        assert.ok(distance >= 3, `${layout.join(',')} keeps its mines visibly dispersed`);
      }
    }
  }
});

test('shadow validation accepts a no-guess route and rejects a visually valid forced guess', () => {
  assert.equal(validateBeginnerTutorialLayout([0, 5, 16]), true);
  assert.equal(validateBeginnerTutorialLayout([1, 15, 23]), false);
});

test('beginner shadow validation only accepts certain rules with a directly explainable proof', () => {
  const base = { status: 'hint', certainty: 'certain', target: { x: 0, y: 0, z: 0 } };
  assert.equal(isExplainableBeginnerHint({ ...base, rule: 'direct-safe' }), true);
  assert.equal(isExplainableBeginnerHint({ ...base, rule: 'subset-mine' }), true);
  assert.equal(isExplainableBeginnerHint({ ...base, rule: 'cover-safe' }), true);
  assert.equal(isExplainableBeginnerHint({ ...base, rule: 'enumeration-safe' }), false);
  assert.equal(isExplainableBeginnerHint({ ...base, rule: 'enumeration-mine' }), false);
  assert.equal(isExplainableBeginnerHint({ ...base, certainty: 'guess', rule: 'guess' }), false);
});

test('gates the beginner first action without initializing or leaking the selected mine layout', () => {
  const solo = RoomEngine.create({
    code: 'SOLO24', hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000,
  });
  let randomCalls = 0;
  solo.random = () => {
    randomCalls += 1;
    return 0;
  };
  apply(solo, 1, { op: 'restart', config: { width: 3, height: 3, depth: 3, mineCount: 3, ruleset: 'classic', campaign: true } });

  assert.deepEqual(solo.snapshot().tutorialStart, BEGINNER_TUTORIAL_START);
  assert.deepEqual(solo.snapshot().tutorialMines, []);
  assert.throws(() => apply(solo, 2, { op: 'dig', x: 0, y: 0, z: 0 }), /TUTORIAL_FIRST_MOVE_REQUIRED/);
  assert.throws(() => apply(solo, 3, { op: 'flag', ...BEGINNER_TUTORIAL_START }), /TUTORIAL_FIRST_MOVE_REQUIRED/);
  assert.equal(randomCalls, 0);
  assert.equal(solo.state.phase, 'ready');
  assert.deepEqual(solo.state.mines, []);
  assert.deepEqual(solo.state.flags, []);
  assert.deepEqual(solo.state.revealed, {});
  assert.equal(solo.state.startedAt, null);

  apply(solo, 4, { op: 'dig', ...BEGINNER_TUTORIAL_START });
  assert.ok(randomCalls > 0 && randomCalls <= 185);
  assert.equal(validateBeginnerTutorialLayout(solo.state.mines), true);
  assert.deepEqual(solo.snapshot().tutorialMines, []);
  assert.deepEqual(solo.snapshot().mines, []);

  const squad = createEngine();
  assert.equal(squad.snapshot().tutorialStart, null);
  assert.deepEqual(squad.snapshot().tutorialMines, []);
  assert.doesNotThrow(() => apply(squad, 1, { op: 'flag', x: 0, y: 0, z: 0 }));

  apply(solo, 5, { op: 'restart', config: { width: 5, height: 5, depth: 5, mineCount: 10, ruleset: 'sector', campaign: true } });
  assert.equal(solo.snapshot().tutorialStart, null);
  assert.deepEqual(solo.snapshot().tutorialMines, []);
});

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

test('selects varied solver-verified beginner layouts from seeded random candidate orders', () => {
  const layouts = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const layout = createBeginnerTutorialLayout(seededRandom(seed));
    assert.equal(validateBeginnerTutorialLayout(layout), true, `seed ${seed}`);
    layouts.add(layout.join(','));
  }
  assert.ok(layouts.size >= 10, `expected varied generated layouts, received ${layouts.size}`);
});

test('pathological random sources remain bounded and can never bypass shadow validation', () => {
  for (const brokenRandom of [() => 0, () => Number.NaN, () => { throw new Error('rng failed'); }]) {
    let calls = 0;
    const layout = createBeginnerTutorialLayout(() => {
      calls += 1;
      return brokenRandom();
    });
    assert.ok(calls <= 185, `shuffle stayed bounded at ${calls} calls`);
    assert.equal(validateBeginnerTutorialLayout(layout), true);
  }
});

test('the public solver completes generated beginner layouts with certain moves and all three flags', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const solo = RoomEngine.create({
      code: `LAY${seed}`, hostId: 'host', hostName: 'Host', tokenHash: 'hash', mode: 'solo', now: 1_000,
    });
    solo.random = seededRandom(seed);
    let sequence = 1;
    apply(solo, sequence++, { op: 'restart', config: { width: 3, height: 3, depth: 3, mineCount: 3, ruleset: 'classic', campaign: true } });
    apply(solo, sequence++, { op: 'dig', ...BEGINNER_TUTORIAL_START });
    assert.equal(validateBeginnerTutorialLayout(solo.state.mines), true, `seed ${seed} server layout`);

    let flagMoves = 0;
    for (let step = 0; step < 64 && solo.state.phase === 'playing'; step += 1) {
      const snapshot = solo.snapshot();
      assert.deepEqual(snapshot.tutorialMines, []);
      assert.deepEqual(snapshot.mines, []);
      const hint = solveMinesweeperHint({
        ...snapshot.config,
        phase: snapshot.phase,
        revealed: snapshot.revealed,
        flags: snapshot.flags,
        excluded: snapshot.purged,
        maxMs: 1_000,
      });
      assert.equal(hint.status, 'hint', `seed ${seed} solver status`);
      assert.equal(hint.certainty, 'certain', `seed ${seed} must never guess`);
      assert.equal(isExplainableBeginnerHint(hint), true, `seed ${seed} must use a teachable rule`);

      const targetIndex = cellIndex(snapshot.config, hint.target);
      if (hint.action === 'flag') {
        flagMoves += 1;
        assert.equal(solo.state.mines.includes(targetIndex), true, `seed ${seed} flags only real mines`);
      } else {
        assert.equal(hint.action, 'dig');
        assert.equal(solo.state.mines.includes(targetIndex), false, `seed ${seed} digs only safe cells`);
      }
      apply(solo, sequence++, { op: hint.action, ...hint.target });
      assert.notEqual(solo.state.phase, 'revive');
    }

    assert.equal(solo.state.phase, 'won', `seed ${seed} reaches a win`);
    assert.equal(flagMoves, 3, `seed ${seed} teaches all three flags`);
    assert.equal(solo.state.flags.length, 3);
    assert.deepEqual([...solo.state.flags].sort((left, right) => left - right), [...solo.state.mines]);
    assert.equal(solo.snapshot().revealed.length, 24);
    assert.deepEqual(solo.snapshot().tutorialMines, []);
  }
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
