import test from 'node:test';
import assert from 'node:assert/strict';

import { HybridRoomClient, LocalRoomClient } from '../public/local-room-client.js';
import {
  BEGINNER_TUTORIAL_START,
  RoomEngine,
  cloneGameState,
  createRuntimeId,
} from '../public/vendor/game-core/room-engine.js';

class MemoryStorage {
  constructor({ throwOnSet = false } = {}) {
    this.values = new Map();
    this.throwOnSet = throwOnSet;
    this.setCalls = 0;
    this.removeCalls = 0;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (this.throwOnSet) throw new Error('storage unavailable');
    this.setCalls += 1;
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.removeCalls += 1;
    this.values.delete(key);
  }
}

function installBrowserHarness({ href = 'https://game.example/', storage = new MemoryStorage() } = {}) {
  const originals = new Map();
  for (const key of ['location', 'history', 'localStorage', 'fetch', 'WebSocket']) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  const location = { href };
  Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: location });
  Object.defineProperty(globalThis, 'history', {
    configurable: true,
    writable: true,
    value: {
      replaceState(_state, _title, value) {
        location.href = new URL(String(value), location.href).toString();
      },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: async () => { throw new Error('solo must not fetch'); },
  });
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: class ForbiddenWebSocket {
      constructor() { throw new Error('solo must not open a WebSocket'); }
    },
  });
  return {
    location,
    storage,
    restore() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

const EASY = {
  width: 3,
  height: 3,
  depth: 3,
  mineCount: 3,
  ruleset: 'classic',
  autoPurge: false,
  reduction: false,
  campaign: true,
};

const ULTIMATE = {
  width: 9,
  height: 9,
  depth: 9,
  mineCount: 60,
  ruleset: 'reduction',
  autoPurge: true,
  reduction: true,
  campaign: true,
};

test('new solo sessions run locally without fetch or WebSocket and clear their save on leave', async () => {
  const harness = installBrowserHarness();
  try {
    const snapshots = [];
    const welcomes = [];
    const client = new HybridRoomClient({
      onWelcome: (message) => welcomes.push(message),
      onSnapshot: (snapshot, initial) => snapshots.push({ snapshot, initial }),
    });

    await client.create('Local Player', 'solo');
    assert.equal(client.session.local, true);
    assert.equal(welcomes.length, 1);
    assert.equal(snapshots[0].initial, true);
    assert.equal(new URL(harness.location.href).searchParams.has('room'), false);
    const saveId = new URL(harness.location.href).searchParams.get('solo');
    assert.ok(saveId);

    // Do not await the restart before queuing the first move: the local client
    // must preserve the same ordered command contract as the server.
    const restart = client.send({ op: 'restart', config: EASY });
    const dig = client.send({ op: 'dig', ...BEGINNER_TUTORIAL_START });
    await Promise.all([restart, dig]);
    assert.equal(snapshots.at(-1).snapshot.phase, 'playing');
    assert.ok(snapshots.at(-1).snapshot.revealed.length > 0);
    assert.ok([...harness.storage.values.keys()].some((key) => key.endsWith(saveId)));

    await client.leave();
    assert.equal(client.session, null);
    assert.equal(new URL(harness.location.href).searchParams.has('solo'), false);
    assert.equal([...harness.storage.values.keys()].some((key) => key.endsWith(saveId)), false);
  } finally {
    harness.restore();
  }
});

test('a local solo board restores after refresh and continues with a monotonic sequence', async () => {
  const harness = installBrowserHarness();
  try {
    const firstSnapshots = [];
    const first = new LocalRoomClient({ onSnapshot: (snapshot) => firstSnapshots.push(snapshot) });
    await first.create('Resume Player');
    await first.send({ op: 'restart', config: EASY });
    await first.send({ op: 'dig', ...BEGINNER_TUTORIAL_START });
    const savedRevision = firstSnapshots.at(-1).revision;
    const savedSequence = first.sequence;
    assert.equal(harness.storage.setCalls, 1, 'commands should debounce storage serialization');
    first.handlePageHide();
    assert.equal(harness.storage.setCalls, 2, 'pagehide should flush the latest board');

    const restoredSnapshots = [];
    const second = new HybridRoomClient({ onSnapshot: (snapshot, initial) => restoredSnapshots.push({ snapshot, initial }) });
    assert.equal(second.resumeFromUrl(), true);
    assert.equal(second.session.local, true);
    assert.equal(restoredSnapshots[0].initial, true);
    assert.equal(restoredSnapshots[0].snapshot.revision, savedRevision);
    assert.deepEqual(restoredSnapshots[0].snapshot.revealed, firstSnapshots.at(-1).revealed);
    assert.ok(second.local.sequence >= savedSequence);

    await second.send({ op: 'flag', x: 0, y: 0, z: 0 });
    assert.ok(second.local.sequence > savedSequence);
  } finally {
    harness.restore();
  }
});

test('local solo preserves rewind, Ultimate Hacker, and the successful replay tape', async () => {
  const harness = installBrowserHarness();
  try {
    let snapshot = null;
    const client = new LocalRoomClient({ onSnapshot: (next) => { snapshot = next; } });
    await client.create('Campaign Player');
    await client.send({ op: 'restart', config: EASY });
    await client.send({ op: 'dig', ...BEGINNER_TUTORIAL_START });
    const mineIndex = client.engine.state.mines[0];
    const mine = {
      x: Math.floor(mineIndex / 9),
      y: Math.floor((mineIndex % 9) / 3),
      z: mineIndex % 3,
    };
    await client.send({ op: 'dig', ...mine });
    assert.equal(snapshot.phase, 'revive');
    await client.send({ op: 'rewind' });
    assert.equal(snapshot.phase, 'playing');

    await client.send({ op: 'restart', config: ULTIMATE });
    await client.send({ op: 'ultimate_hack_start' });
    let steps = 0;
    while (snapshot.ultimateHack?.status === 'running' && steps < 800) {
      await client.send({
        op: 'ultimate_hack_step',
        runId: snapshot.ultimateHack.runId,
        expectedStep: snapshot.ultimateHack.step,
      });
      steps += 1;
    }
    assert.equal(snapshot.phase, 'won');
    assert.equal(snapshot.ultimateHack.status, 'completed');
    assert.ok(snapshot.replay?.steps?.length > 0);
    assert.ok(steps < 800);
  } finally {
    harness.restore();
  }
});

test('expired local saves are removed instead of being resumed forever', async () => {
  const harness = installBrowserHarness();
  try {
    const first = new LocalRoomClient();
    await first.create('Expired Player');
    const saveId = new URL(harness.location.href).searchParams.get('solo');
    const key = [...harness.storage.values.keys()].find((candidate) => candidate.endsWith(saveId));
    const record = JSON.parse(harness.storage.getItem(key));
    record.engine.expiresAt = Date.now() - 1;
    harness.storage.setItem(key, JSON.stringify(record));

    const second = new LocalRoomClient();
    assert.equal(second.resumeFromUrl(), false);
    assert.equal(harness.storage.getItem(key), null);
    assert.equal(new URL(harness.location.href).searchParams.has('solo'), false);
  } finally {
    harness.restore();
  }
});

test('an old room URL keeps using the existing network transport, including legacy server solo rooms', () => {
  const harness = installBrowserHarness({ href: 'https://game.example/?room=ABC234&solo=ignored' });
  try {
    const client = new HybridRoomClient();
    let networkResumed = 0;
    let localResumed = 0;
    client.network.resumeFromUrl = () => { networkResumed += 1; return true; };
    client.local.resumeFromUrl = () => { localResumed += 1; return true; };
    assert.equal(client.resumeFromUrl(), true);
    assert.equal(networkResumed, 1);
    assert.equal(localResumed, 0);
    assert.equal(client.active, client.network);
  } finally {
    harness.restore();
  }
});

test('local play remains available when persistence is unavailable', async () => {
  const harness = installBrowserHarness({ storage: new MemoryStorage({ throwOnSet: true }) });
  try {
    const snapshots = [];
    const client = new LocalRoomClient({ onSnapshot: (snapshot) => snapshots.push(snapshot) });
    await client.create('Private Safari');
    await client.send({ op: 'restart', config: EASY });
    await client.send({ op: 'dig', ...BEGINNER_TUTORIAL_START });
    assert.equal(snapshots.at(-1).phase, 'playing');
  } finally {
    harness.restore();
  }
});

test('runtime IDs and state cloning work without randomUUID or structuredClone', () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const cloneDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
  try {
    let nextByte = 1;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues(bytes) {
          for (let index = 0; index < bytes.length; index += 1) bytes[index] = nextByte++ & 0xff;
          return bytes;
        },
      },
    });
    Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });

    assert.match(createRuntimeId(globalThis.crypto), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const original = { nested: { values: [1, 2, 3] } };
    const copy = cloneGameState(original);
    assert.deepEqual(copy, original);
    assert.notEqual(copy, original);

    const engine = RoomEngine.create({
      code: 'LOCAL',
      hostId: 'player',
      hostName: 'Safari',
      tokenHash: 'local-only',
      mode: 'solo',
      now: 1,
    });
    assert.ok(engine.state.replayDraft.runId);
    assert.deepEqual(RoomEngine.restore(engine.serialize()).state.config, engine.state.config);
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    else delete globalThis.crypto;
    if (cloneDescriptor) Object.defineProperty(globalThis, 'structuredClone', cloneDescriptor);
    else delete globalThis.structuredClone;
  }
});
