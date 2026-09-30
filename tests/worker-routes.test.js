import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import worker from '../worker/index.js';
import { MAX_PLAYERS } from '../worker/room-engine.js';
import {
  ORIGIN,
  createRoomNamespace,
  installWorkersRuntime,
  jsonRequest,
  socketRequest,
} from './support/workers-runtime.js';

after(installWorkersRuntime());

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function recordingLimiter({ allow = true } = {}) {
  const keys = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      return { success: allow };
    },
  };
}

async function createRoom(env, body = { name: 'Alpha', mode: 'squad' }) {
  const response = await worker.fetch(jsonRequest('/api/rooms', body), env);
  return { response, payload: await response.json() };
}

test('creates a room with a normalized nickname, a random room code, and a hashed session token', async () => {
  const namespace = createRoomNamespace();
  const { response, payload } = await createRoom(
    { GAME_ROOMS: namespace },
    { name: '  Survey   Lead With Extra Words ', mode: 'squad' },
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(payload.roomCode, ROOM_CODE);
  assert.equal(payload.session.code, payload.roomCode);
  assert.equal(payload.session.playerName, 'Survey Lead With');
  assert.equal(payload.session.mode, 'squad');
  assert.match(payload.session.token, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    payload.room.players.map(({ name, isHost }) => ({ name, isHost })),
    [{ name: 'Survey Lead With', isHost: true }],
  );

  const stored = namespace.rooms.get(payload.roomCode).runtime.storage.get('room');
  assert.equal(stored.members[0].tokenHash, sha256(payload.session.token));
  assert.equal(JSON.stringify(stored).includes(payload.session.token), false, 'the raw token must never be persisted');
});

test('rejects a room request without a usable nickname before touching Durable Objects', async () => {
  const namespace = createRoomNamespace();
  for (const name of ['   ', 42, null]) {
    const { response, payload } = await createRoom({ GAME_ROOMS: namespace }, { name, mode: 'squad' });
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'INVALID_NAME');
  }
  assert.deepEqual(namespace.names, []);
});

test('retries room-code collisions and gives up with 503 after twelve attempts', async () => {
  const attempts = [];
  const collidingNamespace = {
    getByName(name) {
      attempts.push(name);
      return { fetch: async () => Response.json({ error: 'Room exists' }, { status: 409 }) };
    },
  };
  const { response } = await createRoom({ GAME_ROOMS: collidingNamespace });
  assert.equal(response.status, 503);
  assert.equal(attempts.length, 12);
  assert.ok(attempts.every((code) => ROOM_CODE.test(code)));

  const namespace = createRoomNamespace();
  let collisions = 2;
  const eventuallyFree = {
    getByName(name) {
      if (collisions > 0) {
        collisions -= 1;
        return { fetch: async () => Response.json({ error: 'Room exists' }, { status: 409 }) };
      }
      return namespace.getByName(name);
    },
  };
  const retried = await createRoom({ GAME_ROOMS: eventuallyFree });
  assert.equal(retried.response.status, 201);
  assert.deepEqual([...namespace.rooms.keys()], [retried.payload.roomCode]);
});

test('reports a Durable Object initialization failure with its status and no session', async () => {
  const failing = {
    getByName: () => ({ fetch: async () => Response.json({ error: 'internal detail' }, { status: 500 }) }),
  };
  const { response, payload } = await createRoom({ GAME_ROOMS: failing });
  assert.equal(response.status, 500);
  assert.equal(payload.session, undefined);
  assert.equal(JSON.stringify(payload).includes('internal detail'), false);
});

test('joins an existing room and maps room errors to stable codes and HTTP statuses', async () => {
  const namespace = createRoomNamespace();
  const env = { GAME_ROOMS: namespace };
  const { payload: created } = await createRoom(env);
  const join = (code, name) => worker.fetch(jsonRequest(`/api/rooms/${code}`, { name }), env);

  const joined = await join(created.roomCode, 'Bravo');
  assert.equal(joined.status, 201);
  const joinedPayload = await joined.json();
  assert.equal(joinedPayload.session.code, created.roomCode);
  assert.notEqual(joinedPayload.session.token, created.session.token);
  assert.deepEqual(joinedPayload.room.players.map((player) => player.name), ['Alpha', 'Bravo']);

  const duplicate = await join(created.roomCode, 'alpha');
  assert.equal(duplicate.status, 400);
  assert.equal((await duplicate.json()).code, 'NAME_TAKEN');

  const missing = await join('ZZZZZZ', 'Charlie');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'ROOM_NOT_FOUND');

  for (let index = 2; index < MAX_PLAYERS; index += 1) {
    assert.equal((await join(created.roomCode, `Player ${index}`)).status, 201);
  }
  const full = await join(created.roomCode, 'One Too Many');
  assert.equal(full.status, 409);
  assert.equal((await full.json()).code, 'ROOM_FULL');

  const { payload: solo } = await createRoom(env, { name: 'Solo Host', mode: 'solo' });
  assert.equal(solo.session.mode, 'solo');
  const locked = await join(solo.roomCode, 'Visitor');
  assert.equal(locked.status, 409);
  assert.equal((await locked.json()).code, 'SOLO_LOCKED');
});

test('rejects cross-origin and malformed-origin requests on every room entry point', async () => {
  const namespace = createRoomNamespace();
  const env = { GAME_ROOMS: namespace };
  for (const origin of ['https://attacker.example', 'not a url']) {
    const create = await worker.fetch(jsonRequest('/api/rooms', { name: 'Alpha' }, { origin }), env);
    const join = await worker.fetch(jsonRequest('/api/rooms/ABC234', { name: 'Alpha' }, { origin }), env);
    const socket = await worker.fetch(socketRequest('ABC234', { origin }), env);
    assert.deepEqual([create.status, join.status, socket.status], [403, 403, 403], origin);
  }
  assert.deepEqual(namespace.names, []);

  const withoutOrigin = await worker.fetch(jsonRequest('/api/rooms', { name: 'Script Client' }, { origin: null }), env);
  assert.equal(withoutOrigin.status, 201, 'non-browser clients without an Origin header are allowed');
});

test('enforces byte-based request body limits and JSON validity before creating rooms', async () => {
  const namespace = createRoomNamespace();
  const env = { GAME_ROOMS: namespace };

  const oversizedAscii = await worker.fetch(jsonRequest('/api/rooms', { name: 'A', padding: 'x'.repeat(5000) }), env);
  assert.equal(oversizedAscii.status, 413);

  // 1,400 CJK characters are only ~1.4k UTF-16 units but ~4.2 KB of UTF-8.
  const oversizedUtf8 = await worker.fetch(jsonRequest('/api/rooms', { name: 'A', padding: '测'.repeat(1400) }), env);
  assert.equal(oversizedUtf8.status, 413);

  const declaredTooLarge = await worker.fetch(
    jsonRequest('/api/rooms', { name: 'A' }, { headers: { 'Content-Length': '4097' } }),
    env,
  );
  assert.equal(declaredTooLarge.status, 413);

  const invalidJson = await worker.fetch(jsonRequest('/api/rooms', '{"name":'), env);
  assert.equal(invalidJson.status, 400);
  assert.equal(await invalidJson.text(), 'Invalid JSON');
  assert.deepEqual(namespace.names, []);
});

test('rate limits room creation, joins, and sockets per hashed client address and scope', async () => {
  const create = recordingLimiter({ allow: false });
  const join = recordingLimiter({ allow: false });
  const socket = recordingLimiter({ allow: false });
  const namespace = createRoomNamespace();
  const env = {
    GAME_ROOMS: namespace,
    ROOM_CREATE_LIMIT: create,
    ROOM_JOIN_LIMIT: join,
    ROOM_SOCKET_LIMIT: socket,
  };

  const limited = await worker.fetch(
    jsonRequest('/api/rooms', { name: 'Alpha' }, { headers: { 'CF-Connecting-IP': '198.51.100.7' } }),
    env,
  );
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, 'RATE_LIMITED');
  assert.deepEqual(create.keys, [sha256('create:198.51.100.7')]);

  await worker.fetch(
    jsonRequest('/api/rooms/ABC234', { name: 'Alpha' }, { headers: { 'X-Forwarded-For': '203.0.113.9, 10.0.0.1' } }),
    env,
  );
  assert.deepEqual(join.keys, [sha256('join:203.0.113.9')]);

  await worker.fetch(socketRequest('ABC234'), env);
  assert.deepEqual(socket.keys, [sha256('socket:local-development')]);
  assert.notEqual(sha256('create:198.51.100.7'), sha256('join:198.51.100.7'));
  assert.deepEqual(namespace.names, [], 'limited requests must not reach a Durable Object');

  env.ROOM_CREATE_LIMIT = recordingLimiter({ allow: true });
  const allowed = await worker.fetch(jsonRequest('/api/rooms', { name: 'Alpha' }), env);
  assert.equal(allowed.status, 201);
});

test('routes only well-formed room codes and returns JSON 404 for unknown API paths', async () => {
  const namespace = createRoomNamespace();
  const env = { GAME_ROOMS: namespace, ASSETS: { fetch: async () => new Response('asset') } };
  const cases = [
    jsonRequest('/api/rooms/abc234', { name: 'Alpha' }),
    jsonRequest('/api/rooms/ABCDE1', { name: 'Alpha' }),
    jsonRequest('/api/rooms/ABCDEFG', { name: 'Alpha' }),
    new Request(`${ORIGIN}/api/rooms`),
    new Request(`${ORIGIN}/api/rooms/ABC234`),
    new Request(`${ORIGIN}/api/unknown`),
  ];
  for (const request of cases) {
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 404, `${request.method} ${request.url}`);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  }
  assert.deepEqual(namespace.names, []);

  const asset = await worker.fetch(new Request(`${ORIGIN}/index.html`), env);
  assert.equal(await asset.text(), 'asset');
});

test('converts unexpected Worker failures into a generic 500 response', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const env = {
    GAME_ROOMS: {
      getByName() {
        throw new Error('binding unavailable');
      },
    },
  };
  const { response, payload } = await createRoom(env);
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(payload).includes('binding unavailable'), false);
  assert.equal(logged.mock.callCount(), 1);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
