import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomEngine, normalizeConfig } from '../worker/room-engine.js';

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
  });
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
  apply(engine, 1, { op: 'dig', x: 0, y: 0, z: 0 }, 2_000);
  const mine = engine.state.mines[0];
  const point = { x: Math.floor(mine / 9), y: Math.floor((mine % 9) / 3), z: mine % 3 };
  apply(engine, 2, { op: 'dig', ...point }, 2_100);
  apply(engine, 3, { op: 'watch_ad' }, 2_200);
  const restored = RoomEngine.restore(engine.serialize());
  assert.equal(restored.advance(12_199), false);
  assert.equal(restored.advance(12_200), true);
  assert.equal(restored.state.phase, 'playing');
  assert.equal(restored.state.pendingMine, null);
});

test('only the host can reconfigure a room', () => {
  const engine = createEngine();
  engine.reserveMember({ playerId: 'guest', name: 'Guest', tokenHash: 'guest-hash', now: 2_000 });
  assert.throws(() => engine.apply('guest', { op: 'restart', config: {} }, { id: 'guest-command', sequence: 1, now: 2_001 }), /HOST_ONLY/);
});
