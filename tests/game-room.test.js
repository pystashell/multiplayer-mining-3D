import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { ROOM_TTL_MS, RoomEngine } from '../worker/room-engine.js';
import {
  FakeSocket,
  commandMessage,
  createGameRoom,
  installWorkersRuntime,
  joinMessage,
  jsonRequest,
  socketRequest,
} from './support/workers-runtime.js';

after(installWorkersRuntime());

const CODE = 'ABC234';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function pointOf(config, index) {
  const z = index % config.depth;
  const plane = (index - z) / config.depth;
  const y = plane % config.height;
  return { x: (plane - y) / config.height, y, z };
}

async function roomWithMembers(names, { mode = 'squad' } = {}) {
  const now = Date.now();
  const members = names.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    token: `session-token-${index + 1}`,
  }));
  const engine = RoomEngine.create({
    code: CODE,
    hostId: members[0].id,
    hostName: members[0].name,
    tokenHash: sha256(members[0].token),
    mode,
    now,
  });
  for (const member of members.slice(1)) {
    engine.reserveMember({ playerId: member.id, name: member.name, tokenHash: sha256(member.token), now });
  }
  const { room, runtime } = await createGameRoom(engine.serialize());
  const sessions = members.map((member) => ({
    code: CODE,
    playerId: member.id,
    playerName: member.name,
    token: member.token,
  }));
  return { room, runtime, sessions };
}

async function openSocket(room, runtime) {
  const response = await room.fetch(socketRequest(CODE));
  assert.equal(response.status, 101);
  return runtime.sockets.at(-1);
}

async function joinSocket(room, runtime, session) {
  const socket = await openSocket(room, runtime);
  await room.webSocketMessage(socket, joinMessage(session));
  assert.equal(socket.last('welcome')?.identity.playerId, session.playerId);
  return socket;
}

function commandSender(room) {
  let sequence = 0;
  return (socket, command, extra) => {
    sequence += 1;
    return room.webSocketMessage(socket, commandMessage(`cmd-${sequence}`, sequence, command, extra));
  };
}

test('restores persisted room state before serving and answers ping frames without waking the room', async () => {
  const { room, runtime } = await roomWithMembers(['Host']);
  assert.equal(room.engine.state.code, CODE);
  assert.equal(runtime.state.autoResponse.request, 'ping');
  assert.equal(runtime.state.autoResponse.response, 'pong');

  const health = await room.fetch(new Request('https://room.internal/internal/health'));
  assert.deepEqual(await health.json(), { ok: true });
  const unknown = await room.fetch(new Request('https://room.internal/internal/unknown', { method: 'POST' }));
  assert.equal(unknown.status, 404);
});

test('initializes a room once, persists it, and schedules the expiry alarm', async () => {
  const { room, runtime } = await createGameRoom();
  assert.equal(room.engine, null);
  const body = {
    code: CODE,
    hostId: 'host',
    hostName: 'Host',
    tokenHash: sha256('token'),
    mode: 'squad',
    now: Date.now(),
  };

  const created = await room.fetch(jsonRequest('/internal/init', body));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).room.code, CODE);
  assert.equal(runtime.storage.get('room').code, CODE);
  assert.equal(runtime.alarm, runtime.storage.get('room').expiresAt);

  const again = await room.fetch(jsonRequest('/internal/init', { ...body, hostName: 'Intruder' }));
  assert.equal(again.status, 409);
  assert.equal(room.engine.state.members[0].name, 'Host');
});

test('reserves members through the internal join route and broadcasts the new roster', async () => {
  const empty = await createGameRoom();
  const missing = await empty.room.fetch(jsonRequest('/internal/join', { playerId: 'x', name: 'X', tokenHash: 'h' }));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'ROOM_NOT_FOUND');

  const { room, runtime, sessions } = await roomWithMembers(['Host']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const reserved = await room.fetch(jsonRequest('/internal/join', {
    playerId: 'player-2',
    name: 'Guest',
    tokenHash: sha256('guest-token'),
    now: Date.now(),
  }));
  assert.equal(reserved.status, 201);
  assert.deepEqual(host.last('snapshot').snapshot.players.map((player) => player.name), ['Host', 'Guest']);
  assert.equal(runtime.storage.get('room').members.length, 2);

  const taken = await room.fetch(jsonRequest('/internal/join', { playerId: 'player-3', name: 'guest', tokenHash: 'h' }));
  assert.equal(taken.status, 400);
  assert.equal((await taken.json()).code, 'NAME_TAKEN');
});

test('accepts hibernatable WebSockets only for live rooms, real upgrades, and below the socket cap', async () => {
  const empty = await createGameRoom();
  assert.equal((await empty.room.fetch(socketRequest(CODE))).status, 404);

  const { room, runtime } = await roomWithMembers(['Host']);
  assert.equal((await room.fetch(socketRequest(CODE, { upgrade: null }))).status, 426);
  assert.equal((await room.fetch(socketRequest(CODE, { upgrade: 'h2c' }))).status, 426);

  const upgraded = await room.fetch(socketRequest(CODE, { upgrade: 'WebSocket' }));
  assert.equal(upgraded.status, 101);
  assert.ok(upgraded.webSocket, 'the client end of the pair is returned to the Worker');
  const server = runtime.sockets.at(-1);
  assert.deepEqual(server.tags, ['game-room']);
  assert.equal(server.attachment.joined, false);
  assert.equal(server.attachment.playerId, null);
  assert.match(server.attachment.connectionId, /^[0-9a-f-]{36}$/);

  while (runtime.state.getWebSockets().length < 16) await openSocket(room, runtime);
  assert.equal((await room.fetch(socketRequest(CODE))).status, 429);
});

test('closes sockets that send binary, oversized, or malformed frames', async () => {
  const { room, runtime } = await roomWithMembers(['Host']);
  const frames = [
    [new ArrayBuffer(8), 4409],
    ['x'.repeat(4097), 4409],
    ['测'.repeat(1400), 4409],
    ['{"v":1,"type":', 4400],
  ];
  for (const [frame, code] of frames) {
    const socket = await openSocket(room, runtime);
    await room.webSocketMessage(socket, frame);
    assert.equal(socket.closed?.code, code);
    assert.deepEqual(socket.sent, []);
  }
});

test('requires a valid session join before any command and rejects forged sessions', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host']);
  const [host] = sessions;
  const attempts = [
    [commandMessage('c1', 1, { op: 'chat', content: 'hello' }), 'Join required'],
    [joinMessage(host, { v: 2 }), 'Join required'],
    [JSON.stringify({ v: 1, type: 'join' }), 'Join required'],
    [joinMessage({ ...host, token: 'forged-token' }), 'Invalid session'],
    [joinMessage({ ...host, token: 42 }), 'Invalid session'],
    [joinMessage({ ...host, code: 'ZZZZZZ' }), 'Invalid session'],
    [joinMessage({ ...host, playerId: 'ghost' }), 'Invalid session'],
  ];
  for (const [frame, reason] of attempts) {
    const socket = await openSocket(room, runtime);
    await room.webSocketMessage(socket, frame);
    assert.deepEqual(socket.closed, { code: 4401, reason }, frame);
    assert.deepEqual(socket.sent, []);
  }
  assert.deepEqual(room.engine.state.chat, []);
});

test('welcomes a joined player and replaces an older socket for the same session', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const welcome = host.last('welcome');
  assert.deepEqual(welcome.identity, { playerId: 'player-1', playerName: 'Host' });
  assert.deepEqual(
    welcome.snapshot.players.map((player) => [player.name, player.connected]),
    [['Host', true], ['Guest', false]],
  );

  const guest = await joinSocket(room, runtime, sessions[1]);
  assert.deepEqual(
    host.last('snapshot').snapshot.players.map((player) => [player.name, player.connected]),
    [['Host', true], ['Guest', true]],
    'teammates must see a newly joined or reconnected player as online',
  );
  assert.equal(guest.messages('snapshot').length, 0, 'a joining socket gets the welcome, not a duplicate broadcast');

  const replacement = await joinSocket(room, runtime, sessions[0]);
  assert.deepEqual(host.closed, { code: 4408, reason: 'Session replaced' });
  assert.equal(replacement.closed, null);
  assert.equal(guest.closed, null);
});

test('acknowledges each command once, replays duplicate acknowledgements, and rejects stale sequences', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const guest = await joinSocket(room, runtime, sessions[1]);

  await room.webSocketMessage(host, commandMessage('chat-1', 1, { op: 'chat', content: '  hello squad  ' }));
  const ack = host.last('ack');
  assert.equal(ack.id, 'chat-1');
  assert.equal(ack.sequence, 1);
  assert.equal(ack.ok, true);
  assert.equal(guest.last('snapshot').snapshot.chat.at(-1).message, 'hello squad');
  assert.equal(runtime.storage.get('room').members[0].lastSequence, 1);

  const acks = host.messages('ack').length;
  await room.webSocketMessage(host, commandMessage('chat-1', 1, { op: 'chat', content: 'hello squad' }));
  assert.equal(host.messages('ack').length, acks + 1);
  assert.deepEqual(host.last('ack'), ack);
  assert.equal(room.engine.state.chat.length, 1, 'a retried command must not apply twice');

  await room.webSocketMessage(host, commandMessage('chat-2', 1, { op: 'chat', content: 'late' }));
  assert.equal(host.last('error').code, 'STALE_COMMAND');
  assert.equal(host.last('error').id, 'chat-2');
  assert.equal(runtime.storage.get('room').chat.length, 1);
});

test('serializes concurrent commands from one socket in arrival order', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host']);
  const host = await joinSocket(room, runtime, sessions[0]);
  await Promise.all([
    room.webSocketMessage(host, commandMessage('first', 1, { op: 'chat', content: 'one' })),
    room.webSocketMessage(host, commandMessage('second', 2, { op: 'chat', content: 'two' })),
  ]);
  assert.deepEqual(host.messages('ack').map((message) => message.id), ['first', 'second']);
  assert.deepEqual(room.engine.state.chat.map((entry) => entry.message), ['one', 'two']);
  assert.equal(host.messages('error').length, 0);
});

test('validates command envelopes and reports engine rejections with stable error codes', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const malformed = [
    JSON.stringify({ v: 1, type: 'command', sequence: 1, command: { op: 'chat', content: 'hi' } }),
    commandMessage('x'.repeat(129), 1, { op: 'chat', content: 'hi' }),
    commandMessage('fractional', 1.5, { op: 'chat', content: 'hi' }),
    commandMessage('no-op', 1, { content: 'hi' }),
    commandMessage('no-command', 1, null),
    JSON.stringify({ v: 2, type: 'command', id: 'future', sequence: 1, command: { op: 'chat' } }),
  ];
  for (const frame of malformed) {
    await room.webSocketMessage(host, frame);
    assert.equal(host.last('error').code, 'INVALID_COMMAND', frame);
  }

  await room.webSocketMessage(host, commandMessage('outside', 1, { op: 'dig', x: 9, y: 9, z: 9 }));
  assert.deepEqual([host.last('error').id, host.last('error').code], ['outside', 'INVALID_CELL']);
  await room.webSocketMessage(host, commandMessage('blank', 2, { op: 'chat', content: '   ' }));
  assert.deepEqual([host.last('error').id, host.last('error').code], ['blank', 'EMPTY_CHAT']);
  await room.webSocketMessage(host, commandMessage('teleport', 3, { op: 'teleport' }));
  assert.deepEqual([host.last('error').id, host.last('error').code], ['teleport', 'UNKNOWN_COMMAND']);
  assert.ok(host.messages('error').every((message) => message.message.length > 0));
  assert.equal(host.messages('ack').length, 0);
  assert.equal(host.closed, null, 'command errors keep the session open');
});

test('lets a player leave by command and detaches the socket from the room', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const guest = await joinSocket(room, runtime, sessions[1]);

  await room.webSocketMessage(guest, commandMessage('bye', 1, { op: 'leave' }));
  assert.equal(guest.last('ack').id, 'bye');
  assert.equal(guest.attachment.joined, false);
  assert.equal(guest.attachment.playerId, null);
  assert.equal(room.engine.member('player-2'), null);
  assert.deepEqual(host.last('snapshot').snapshot.players.map((player) => player.name), ['Host']);

  await room.webSocketMessage(guest, commandMessage('again', 2, { op: 'chat', content: 'still here?' }));
  assert.deepEqual(guest.closed, { code: 4401, reason: 'Join required' });
});

function presenceSeenBy(socket) {
  return socket.last('snapshot').snapshot.players.map((player) => [player.name, player.connected]);
}

test('reports a disconnected player offline and keeps them offline on later broadcasts', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const guest = await joinSocket(room, runtime, sessions[1]);

  await runtime.clientClose(room, guest, 1001, 'navigated away');
  assert.deepEqual(presenceSeenBy(host), [['Host', true], ['Guest', false]]);
  await room.webSocketClose(guest, 1006, 'duplicate close event');
  await room.webSocketMessage(host, commandMessage('later', 1, { op: 'chat', content: 'anyone there?' }));
  assert.deepEqual(presenceSeenBy(host), [['Host', true], ['Guest', false]]);
});

test('retires a socket after a transport error so presence and commands stay consistent', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const guest = await joinSocket(room, runtime, sessions[1]);

  await room.webSocketError(guest, new Error('protocol violation'));
  assert.equal(logged.mock.callCount(), 1);
  assert.deepEqual(guest.closed, { code: 1011, reason: 'Socket error' });
  assert.equal(guest.attachment.joined, false);
  assert.deepEqual(presenceSeenBy(host), [['Host', true], ['Guest', false]]);

  // Later broadcasts must not flip the player back online...
  await room.webSocketMessage(host, commandMessage('after-error', 1, { op: 'chat', content: 'still here' }));
  assert.deepEqual(presenceSeenBy(host), [['Host', true], ['Guest', false]]);
  // ...and the retired socket must not keep acting for the player.
  const chat = room.engine.state.chat.length;
  await room.webSocketMessage(guest, commandMessage('late', 1, { op: 'chat', content: 'from a dead socket' }));
  assert.equal(room.engine.state.chat.length, chat);

  // The client reconnects with its session and is online again.
  await joinSocket(room, runtime, sessions[1]);
  assert.deepEqual(presenceSeenBy(host), [['Host', true], ['Guest', true]]);
});

test('a replaced connection stops counting and acting while its close handshake is pending', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const stale = await joinSocket(room, runtime, sessions[0]);
  const guest = await joinSocket(room, runtime, sessions[1]);
  const fresh = await joinSocket(room, runtime, sessions[0]);

  assert.deepEqual(stale.closed, { code: 4408, reason: 'Session replaced' });
  assert.equal(stale.readyState, FakeSocket.CLOSING);
  assert.ok(runtime.state.getWebSockets().includes(stale), 'the runtime may still list a closing socket');
  assert.equal(stale.attachment.joined, false);
  assert.deepEqual(presenceSeenBy(guest), [['Host', true], ['Guest', true]]);

  const chat = room.engine.state.chat.length;
  await room.webSocketMessage(stale, commandMessage('late', 99, { op: 'chat', content: 'from the old tab' }));
  assert.equal(room.engine.state.chat.length, chat, 'a late frame from the replaced tab is not applied');
  assert.deepEqual(stale.messages('ack'), []);

  await runtime.clientClose(room, fresh, 1001, 'tab closed');
  assert.deepEqual(
    presenceSeenBy(guest),
    [['Host', false], ['Guest', true]],
    'a still-closing replaced socket must not keep the player online',
  );
  stale.disconnect();
  assert.equal(runtime.state.getWebSockets().includes(stale), false);
});

test('closes a joined socket that breaks the protocol and shows the player leaving', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const guest = await joinSocket(room, runtime, sessions[1]);

  await room.webSocketMessage(guest, '{"v":1,"type":');
  assert.deepEqual(guest.closed, { code: 4400, reason: 'Invalid JSON' });
  assert.deepEqual(presenceSeenBy(host), [['Host', true], ['Guest', false]]);
});

test('drops sends to a failing socket without breaking the broadcast to everyone else', async () => {
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const guest = await joinSocket(room, runtime, sessions[1]);
  host.failSend = true;
  const delivered = host.messages('snapshot').length;

  await room.webSocketMessage(guest, commandMessage('hello', 1, { op: 'chat', content: 'hi' }));
  assert.equal(guest.last('ack').id, 'hello');
  assert.equal(guest.last('snapshot').snapshot.chat.at(-1).message, 'hi');
  assert.equal(host.messages('snapshot').length, delivered, 'sends to a failed socket are dropped, not thrown');
});

test('expires an idle room when its alarm fires and deletes every stored record', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const { room, runtime, sessions } = await roomWithMembers(['Host']);
  const host = await joinSocket(room, runtime, sessions[0]);
  assert.equal(runtime.alarm, room.engine.state.expiresAt);

  t.mock.timers.tick(ROOM_TTL_MS);
  await runtime.fireAlarm(room);
  assert.deepEqual(host.closed, { code: 4404, reason: 'Room expired' });
  assert.equal(room.engine, null);
  assert.equal(runtime.storage.size, 0);
  assert.equal(runtime.alarm, null, 'an expired room schedules nothing further');
  assert.equal((await room.fetch(socketRequest(CODE))).status, 404);
  await runtime.redeliverAlarm(room);
  assert.equal(room.engine, null, 'a redelivered alarm after expiry is a no-op');
});

test('keeps an unchanged pending alarm when commands reschedule outside the alarm handler', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const { room, runtime, sessions } = await roomWithMembers(['Host']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const pending = runtime.alarm;
  const writes = runtime.alarmWrites.length;

  t.mock.timers.tick(400);
  await room.webSocketMessage(host, commandMessage('near', 1, { op: 'chat', content: 'same deadline' }));
  assert.equal(runtime.alarm, pending, 'expiry moves by less than the 500 ms tolerance');
  assert.equal(runtime.alarmWrites.length, writes);

  t.mock.timers.tick(1_000);
  await room.webSocketMessage(host, commandMessage('later', 2, { op: 'chat', content: 'new deadline' }));
  assert.equal(runtime.alarm, room.engine.state.expiresAt);
  assert.equal(runtime.alarmWrites.length, writes + 1);
});

test('fires the revive alarm only when due, re-arms room expiry, and tolerates repeated delivery', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const guest = await joinSocket(room, runtime, sessions[1]);
  const send = commandSender(room);

  await send(host, { op: 'restart', config: { width: 2, height: 2, depth: 2, mineCount: 4 } });
  await send(host, { op: 'dig', x: 0, y: 0, z: 0 });
  assert.equal(room.engine.state.phase, 'playing');
  await send(guest, { op: 'dig', ...pointOf(room.engine.state.config, room.engine.state.mines[0]) });
  assert.equal(room.engine.state.phase, 'revive');

  await send(guest, { op: 'watch_ad' });
  const deadline = 1_800_000_010_000;
  assert.equal(room.engine.state.reviveEndsAt, deadline);
  assert.equal(runtime.alarm, deadline, 'the alarm follows the earlier revive deadline');
  assert.equal(host.last('snapshot').snapshot.reviveStartedBy.name, 'Guest');
  await assert.rejects(runtime.fireAlarm(room), /not due/, 'the runtime never fires an alarm early');

  // A retried delivery that runs before the deadline must neither revive early
  // nor lose the deadline: the running alarm was consumed, so it is re-armed.
  t.mock.timers.tick(9_999);
  await runtime.redeliverAlarm(room);
  assert.equal(room.engine.state.phase, 'revive');
  assert.equal(runtime.alarm, deadline);

  t.mock.timers.tick(1);
  await runtime.fireAlarm(room);
  assert.equal(room.engine.state.phase, 'playing');
  assert.equal(host.last('snapshot').snapshot.phase, 'playing');
  assert.equal(guest.last('snapshot').snapshot.phase, 'playing');
  assert.equal(runtime.storage.get('room').phase, 'playing');
  assert.equal(runtime.alarm, room.engine.state.expiresAt, 'the handler re-arms the room expiry');

  // Alarms are delivered at least once; a duplicate run changes nothing.
  const settled = structuredClone(runtime.storage.get('room'));
  const snapshots = host.messages('snapshot').length;
  await runtime.redeliverAlarm(room);
  assert.deepEqual(runtime.storage.get('room'), settled);
  assert.equal(host.messages('snapshot').length, snapshots);
  assert.equal(runtime.alarm, room.engine.state.expiresAt);
});

test('derives command timestamps from the server clock instead of the client envelope', async (t) => {
  const serverNow = 1_800_000_000_000;
  t.mock.timers.enable({ apis: ['Date'], now: serverNow });
  const { room, runtime, sessions } = await roomWithMembers(['Host', 'Guest']);
  const host = await joinSocket(room, runtime, sessions[0]);
  const guest = await joinSocket(room, runtime, sessions[1]);
  const send = commandSender(room);

  await send(host, { op: 'chat', content: 'hello' }, { now: serverNow + 1000 * ROOM_TTL_MS });
  assert.equal(room.engine.state.chat.at(-1).at, serverNow);
  assert.equal(room.engine.state.expiresAt, serverNow + ROOM_TTL_MS, 'a client cannot keep a room alive indefinitely');
  assert.equal(runtime.alarm, serverNow + ROOM_TTL_MS);

  await send(host, { op: 'restart', config: { width: 2, height: 2, depth: 2, mineCount: 4 } }, { now: 0 });
  await send(host, { op: 'dig', x: 0, y: 0, z: 0 }, { now: 0 });
  assert.equal(room.engine.state.startedAt, serverNow, 'the run timer starts at server time');
  await send(guest, { op: 'dig', ...pointOf(room.engine.state.config, room.engine.state.mines[0]) });
  await send(guest, { op: 'watch_ad' }, { now: 0 });
  assert.equal(room.engine.state.reviveEndsAt, serverNow + 10_000, 'a forged clock cannot skip the revive countdown');

  await runtime.redeliverAlarm(room);
  assert.equal(room.engine.state.phase, 'revive');
});

test('keeps processing queued room operations after a failed request', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const { room } = await createGameRoom();

  const failed = await room.fetch(jsonRequest('/internal/init', '{"code":'));
  assert.equal(failed.status, 500);
  assert.equal(logged.mock.callCount(), 1);

  const recovered = await room.fetch(jsonRequest('/internal/init', {
    code: CODE,
    hostId: 'host',
    hostName: 'Host',
    tokenHash: sha256('token'),
    now: Date.now(),
  }));
  assert.equal(recovered.status, 201);
});
