import assert from 'node:assert/strict';

const base = process.env.HOLO_SWEEPER_URL || 'http://127.0.0.1:8787';
const wsBase = base.replace(/^http/, 'ws');

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
}

function waitFor(socket, predicate, timeout = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message')), timeout);
    const listener = (event) => {
      if (event.data === 'pong') return;
      const value = JSON.parse(String(event.data));
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.removeEventListener('message', listener);
      resolve(value);
    };
    socket.addEventListener('message', listener);
  });
}

async function connect(session) {
  const socket = new WebSocket(`${wsBase}/api/rooms/${session.code}/socket`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const welcome = waitFor(socket, (message) => message.type === 'welcome');
  socket.send(JSON.stringify({ v: 1, type: 'join', session }));
  return { socket, welcome: await welcome };
}

function command(socket, sequence, value) {
  const id = crypto.randomUUID();
  const ack = waitFor(socket, (message) => message.type === 'ack' && message.id === id);
  socket.send(JSON.stringify({ v: 1, type: 'command', id, sequence, command: value }));
  return ack;
}

const created = await post('/api/rooms', { v: 1, name: 'Alice' });
assert.match(created.roomCode, /^[A-HJ-NP-Z2-9]{6}$/);
const joined = await post(`/api/rooms/${created.roomCode}`, { v: 1, name: 'Bob' });

const alice = await connect(created.session);
const bob = await connect(joined.session);
assert.equal(bob.welcome.snapshot.players.length, 2);

const bobSnapshot = waitFor(bob.socket, (message) => message.type === 'snapshot' && message.snapshot.revealed.length > 0);
await command(alice.socket, 1, { op: 'dig', x: 1, y: 1, z: 1 });
const synchronized = await bobSnapshot;
assert.equal(synchronized.snapshot.mines.length, 0);
assert.ok(synchronized.snapshot.revealed.length > 0);

const chordAck = await command(alice.socket, 2, { op: 'chord', x: 1, y: 1, z: 1 });
assert.equal(chordAck.ok, true);

bob.socket.close(1000, 'reconnect test');
const reconnected = await connect(joined.session);
assert.equal(reconnected.welcome.identity.playerName, 'Bob');
assert.ok(reconnected.welcome.snapshot.revealed.length > 0);

const transferredHost = waitFor(
  reconnected.socket,
  (message) => message.type === 'snapshot'
    && message.snapshot.players.length === 1
    && message.snapshot.players[0].id === joined.session.playerId
    && message.snapshot.players[0].isHost,
);
await command(alice.socket, 3, { op: 'leave' });
await transferredHost;

alice.socket.close();
reconnected.socket.close();
console.log(`LIVE_ROOM_TEST=PASS room=${created.roomCode}`);
