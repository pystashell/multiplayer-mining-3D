// Runs the Worker under `wrangler dev --local`, i.e. the real workerd runtime
// with Durable Objects, alarms, hibernatable WebSockets, and Workers Static
// Assets. The other Worker tests use in-memory stand-ins that encode what the
// runtime did when they were written; these tests notice when a Wrangler or
// workerd upgrade changes it. Room creation is rate limited to six a minute,
// so the file creates three rooms.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startWranglerDev } from './support/wrangler-dev.js';
import { acquireHeavySlot, disposeAll } from './support/heavy-slot.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const vendorManifest = JSON.parse(readFileSync(new URL('../public/vendor/manifest.json', import.meta.url), 'utf8'));
const productionPolicy = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
  .match(/Content-Security-Policy:\s*(.+)/)[1].trim();

let dev;
let releaseSlot;

before(async () => {
  releaseSlot = await acquireHeavySlot();
  dev = await startWranglerDev();
}, { timeout: 25 * 60_000 });

after(() => disposeAll(
  () => dev?.close(),
  () => releaseSlot?.(),
), { timeout: 120_000 });

async function post(path, body, { origin = dev.url, raw = null } = {}) {
  const response = await fetch(`${dev.url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: raw ?? JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function createRoom(name) {
  const created = await post('/api/rooms', { v: 1, name });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body;
}

// Buffers every message so a test can wait for one that already arrived.
function openSocket(code) {
  const socket = new WebSocket(`${dev.url.replace(/^http/, 'ws')}/api/rooms/${code}/socket`);
  const messages = [];
  const waiters = new Set();
  const closed = new Promise((resolve) => {
    socket.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason }));
  });
  socket.addEventListener('message', (event) => {
    const data = String(event.data);
    const message = data === 'pong' ? { type: 'pong' } : JSON.parse(data);
    messages.push(message);
    for (const waiter of [...waiters]) waiter(message);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error(`socket to ${code} failed`)), { once: true });
  });
  const next = (predicate, timeoutMs = 5_000) => new Promise((resolve, reject) => {
    const found = messages.find(predicate);
    if (found) {
      resolve(found);
      return;
    }
    const timer = setTimeout(() => {
      waiters.delete(waiter);
      reject(new Error(`timed out waiting for a message on room ${code}`));
    }, timeoutMs);
    const waiter = (message) => {
      if (!predicate(message)) return;
      clearTimeout(timer);
      waiters.delete(waiter);
      resolve(message);
    };
    waiters.add(waiter);
  });
  // Waits for a message that arrives after this call, ignoring older ones.
  const upcoming = (predicate, timeoutMs = 5_000) => {
    const seen = messages.length;
    return next((message) => messages.indexOf(message) >= seen && predicate(message), timeoutMs);
  };
  return { socket, messages, opened, closed, next, upcoming };
}

async function join(session) {
  const client = openSocket(session.code);
  await client.opened;
  client.socket.send(JSON.stringify({ v: 1, type: 'join', session }));
  client.welcome = await client.next((message) => message.type === 'welcome');
  client.sequence = 0;
  // Resolves with the snapshot the room broadcasts right after acknowledging
  // the command; the server always sends the ack first on the same socket.
  client.command = async (command, { awaitSnapshot = true } = {}) => {
    client.sequence += 1;
    const id = crypto.randomUUID();
    const reply = client.upcoming((message) => message.id === id && (message.type === 'ack' || message.type === 'error'));
    client.socket.send(JSON.stringify({ v: 1, type: 'command', id, sequence: client.sequence, command }));
    const answer = await reply;
    if (answer.type === 'error') throw new Error(`${command.op} failed: ${answer.code}`);
    if (!awaitSnapshot) return null;
    const acknowledged = client.messages.indexOf(answer);
    const broadcast = await client.next((message) => message.type === 'snapshot'
      && client.messages.indexOf(message) > acknowledged);
    return broadcast.snapshot;
  };
  return client;
}

const presence = (snapshot) => Object.fromEntries(snapshot.players.map((player) => [player.name, player.connected]));
const snapshotWhere = (predicate) => (message) => message.type === 'snapshot' && predicate(message.snapshot);

test('serves the game and its vendored files through Workers Static Assets with the production headers', { timeout: 240_000 }, async () => {
  const page = await fetch(`${dev.url}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.equal(page.headers.get('content-security-policy'), productionPolicy);
  assert.equal(page.headers.get('cache-control'), 'no-cache');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await page.text(), /<canvas|canvas-container/);

  const vendored = vendorManifest.files.filter((file) => /three\.module\.js$|\.woff2$/.test(file));
  for (const file of vendored) {
    const response = await fetch(`${dev.url}/${file}`);
    assert.equal(response.status, 200, file);
    assert.match(response.headers.get('content-type'), file.endsWith('.js') ? /^text\/javascript/ : /^font\/woff2/, file);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable', file);
    await response.arrayBuffer();
  }

  for (const [path, type] of [['/favicon.ico', /^image\//], ['/favicon.svg', /^image\/svg\+xml/]]) {
    const icon = await fetch(`${dev.url}${path}`);
    assert.equal(icon.status, 200, path);
    assert.match(icon.headers.get('content-type'), type, path);
    await icon.arrayBuffer();
  }

  const version = await fetch(`${dev.url}/version.json`);
  assert.equal((await version.json()).version, packageJson.version);
  assert.equal((await fetch(`${dev.url}/definitely-missing.txt`)).status, 404);
  const health = await fetch(`${dev.url}/api/health`);
  assert.deepEqual(await health.json(), { ok: true, service: '3d-multiplayer-mining' });
  const unknownApi = await fetch(`${dev.url}/api/unknown`);
  assert.equal(unknownApi.status, 404);
  assert.equal(unknownApi.headers.get('x-content-type-options'), 'nosniff');
});

test('refuses cross-origin and oversized room requests before any room is created', { timeout: 240_000 }, async () => {
  assert.equal((await post('/api/rooms', { v: 1, name: 'Eve' }, { origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await post('/api/rooms', null, { raw: JSON.stringify({ v: 1, name: 'x'.repeat(5_000) }) })).status, 413);
  const socket = await fetch(`${dev.url}/api/rooms/ABCDEF/socket`, {
    headers: { Origin: 'https://elsewhere.example' },
  });
  assert.equal(socket.status, 403);
});

test('two players stay in sync over hibernatable WebSockets, see each other online, and resume sessions', { timeout: 240_000 }, async () => {
  const created = await createRoom('Alice');
  const joined = await post(`/api/rooms/${created.roomCode}`, { v: 1, name: 'Bob' });
  assert.equal(joined.status, 201, JSON.stringify(joined.body));

  const alice = await join(created.session);
  const bob = await join(joined.body.session);
  assert.deepEqual(presence(bob.welcome.snapshot), { Alice: true, Bob: true }, 'the joiner is online at once');
  await alice.next(snapshotWhere((snapshot) => presence(snapshot).Bob === true));

  const synced = bob.upcoming(snapshotWhere((snapshot) => snapshot.revealed.length > 0));
  await alice.command({ op: 'dig', x: 1, y: 1, z: 1 });
  const { snapshot } = await synced;
  assert.ok(snapshot.revealed.some(({ x, y, z }) => x === 1 && y === 1 && z === 1));
  assert.deepEqual(snapshot.mines, [], 'mine positions never reach clients');

  const chat = alice.upcoming(snapshotWhere((state) => state.chat.some((entry) => entry.message === 'ready'
    && entry.playerName === 'Bob')));
  await bob.command({ op: 'chat', content: 'ready' });
  await chat;

  const pong = bob.upcoming((message) => message.type === 'pong');
  bob.socket.send('ping');
  await pong;

  const offline = alice.upcoming(snapshotWhere((state) => presence(state).Bob === false));
  bob.socket.close(1000, 'reload');
  await offline;

  const resumed = await join(joined.body.session);
  assert.equal(resumed.welcome.identity.playerName, 'Bob');
  assert.ok(resumed.welcome.snapshot.revealed.length > 0, 'the board survives the reconnect');
  await alice.next(snapshotWhere((state) => presence(state).Bob === true));

  // Opening the same session in another tab retires the older socket.
  const replaced = resumed.closed;
  const newest = await join(joined.body.session);
  assert.deepEqual(await replaced, { code: 4408, reason: 'Session replaced' });

  const host = newest.upcoming(snapshotWhere((state) => state.players.length === 1 && state.players[0].name === 'Bob'
    && state.players[0].isHost));
  await alice.command({ op: 'leave' }, { awaitSnapshot: false });
  await host;
  alice.socket.close();
  newest.socket.close();
});

test('protocol violations close the socket with the documented close codes', { timeout: 240_000 }, async () => {
  const created = await createRoom('Mallory');
  const expectClose = async (send, expected) => {
    const client = openSocket(created.roomCode);
    await client.opened;
    send(client.socket);
    assert.deepEqual(await client.closed, expected);
  };
  await expectClose((socket) => socket.send('{not json'), { code: 4400, reason: 'Invalid JSON' });
  await expectClose((socket) => socket.send(JSON.stringify({ padding: 'x'.repeat(5_000) })),
    { code: 4409, reason: 'Message too large' });
  await expectClose((socket) => socket.send(JSON.stringify({ v: 1, type: 'command', id: 'a', sequence: 1, command: { op: 'sync' } })),
    { code: 4401, reason: 'Join required' });
  await expectClose((socket) => socket.send(JSON.stringify({ v: 1, type: 'join', session: { ...created.session, token: '0'.repeat(64) } })),
    { code: 4401, reason: 'Invalid session' });

  const owner = await join(created.session);
  assert.equal(owner.welcome.identity.playerName, 'Mallory', 'rejected sockets never affected the room');
  owner.socket.close();
});

test('a watched ad revives the squad when the Durable Object alarm fires ten seconds later', { timeout: 240_000 }, async () => {
  const created = await createRoom('Carol');
  const carol = await join(created.session);
  // On boards of 27 cells or fewer only the first dig is protected, so 16
  // mines make the second dig almost certainly explode.
  await carol.command({ op: 'restart', config: { width: 3, height: 3, depth: 3, mineCount: 16, autoPurge: false, reduction: false } });
  let state = await carol.command({ op: 'dig', x: 1, y: 1, z: 1 });
  assert.equal(state.phase, 'playing', 'the first dig is always safe');
  for (let index = 0; index < 27 && state.phase === 'playing'; index += 1) {
    const cell = { x: Math.floor(index / 9), y: Math.floor(index / 3) % 3, z: index % 3 };
    if (state.revealed.some(({ x, y, z }) => x === cell.x && y === cell.y && z === cell.z)) continue;
    state = await carol.command({ op: 'dig', ...cell });
  }
  const phase = state.phase;
  assert.equal(phase, 'revive', 'a mine was hit');

  const countdown = carol.upcoming(snapshotWhere((state) => state.reviveEndsAt !== null));
  const startedAt = Date.now();
  await carol.command({ op: 'watch_ad' });
  const { snapshot: watching } = await countdown;
  assert.equal(watching.reviveStartedBy.name, 'Carol');
  assert.ok(Math.abs(watching.reviveEndsAt - watching.serverTime - 10_000) < 1_000, 'the countdown lasts ten seconds');

  const revived = await carol.upcoming(snapshotWhere((state) => state.phase === 'playing'), 20_000);
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= 9_000, `the alarm must not fire early (${elapsed} ms)`);
  assert.equal(revived.snapshot.pendingMine, null);
  assert.equal(revived.snapshot.reviveEndsAt, null);
  carol.socket.close();
});
