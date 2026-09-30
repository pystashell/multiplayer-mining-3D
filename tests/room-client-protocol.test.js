import test from 'node:test';
import assert from 'node:assert/strict';

import { RoomClient, RoomClientError } from '../public/room-client.js';

const SESSION = Object.freeze({
  code: 'ABC234',
  playerId: 'player-1',
  playerName: 'Protocol Player',
  token: 'session-token',
  mode: 'squad',
});
const SESSION_KEY = 'holo-sweeper.room.v1.session.ABC234';
const SEQUENCE_KEY = 'holo-sweeper.room.v1.sequence.ABC234.player-1';

function installBrowser({ url = 'https://game.example/', responses = [] } = {}) {
  const keys = [
    'location', 'history', 'localStorage', 'fetch', 'WebSocket', 'document',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  ];
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let currentUrl = new URL(url);
  let now = 0;
  let order = 0;
  const storage = new Map();
  const timers = [];
  const intervals = [];
  const sockets = [];
  const fetchCalls = [];
  const document = { visibilityState: 'visible', addEventListener() {} };

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(socketUrl) {
      this.url = socketUrl;
      this.readyState = FakeWebSocket.CONNECTING;
      this.listeners = new Map();
      this.sent = [];
      this.closeCalls = [];
      this.failSend = false;
      sockets.push(this);
    }

    addEventListener(type, listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.emit('open');
    }

    receive(message) {
      this.emit('message', { data: typeof message === 'string' ? message : JSON.stringify(message) });
    }

    serverClose(code, reason = '') {
      this.readyState = FakeWebSocket.CLOSED;
      this.emit('close', { code, reason });
    }

    send(message) {
      if (this.failSend || this.readyState !== FakeWebSocket.OPEN) throw new Error('socket is not open');
      this.sent.push(message);
    }

    close(...args) {
      this.closeCalls.push(args);
      this.readyState = FakeWebSocket.CLOSED;
    }

    commands() {
      return this.sent.filter((message) => message !== 'ping').map((message) => JSON.parse(message));
    }
  }

  const define = (key, value) => Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
  define('location', {
    get href() { return currentUrl.toString(); },
    get protocol() { return currentUrl.protocol; },
    get host() { return currentUrl.host; },
  });
  define('history', {
    replaceState(_state, _title, next) { currentUrl = new URL(String(next)); },
  });
  define('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  });
  define('fetch', async (path, options) => {
    fetchCalls.push({ path, body: JSON.parse(options.body) });
    const next = responses.shift() ?? { status: 201, body: { session: SESSION } };
    const body = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
    return new Response(body, { status: next.status, headers: { 'Content-Type': 'application/json' } });
  });
  define('WebSocket', FakeWebSocket);
  define('document', document);
  define('setTimeout', (callback, delay = 0) => {
    const timer = { callback, at: now + delay, order: order++, cleared: false };
    timers.push(timer);
    return timer;
  });
  define('clearTimeout', (timer) => {
    if (timer) timer.cleared = true;
  });
  define('setInterval', (callback, delay) => {
    const interval = { callback, delay, cleared: false };
    intervals.push(interval);
    return interval;
  });
  define('clearInterval', (interval) => {
    if (interval) interval.cleared = true;
  });

  const nextTimer = (limit = Infinity) => timers
    .filter((timer) => !timer.cleared && timer.at <= limit)
    .sort((left, right) => left.at - right.at || left.order - right.order)[0];

  return {
    storage,
    sockets,
    fetchCalls,
    intervals,
    document,
    get url() { return currentUrl; },
    pendingTimers: () => timers.filter((timer) => !timer.cleared).length,
    runNextTimer() {
      const timer = nextTimer();
      assert.ok(timer, 'expected a pending timer');
      timer.cleared = true;
      now = timer.at;
      timer.callback();
    },
    advance(milliseconds) {
      const target = now + milliseconds;
      for (let timer = nextTimer(target); timer; timer = nextTimer(target)) {
        timer.cleared = true;
        now = timer.at;
        timer.callback();
      }
      now = target;
    },
    restore() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

function welcome(snapshot = { code: 'ABC234', revision: 1 }) {
  return {
    v: 1,
    type: 'welcome',
    identity: { playerId: SESSION.playerId, playerName: SESSION.playerName },
    snapshot,
  };
}

function recordingClient(options = {}) {
  const events = { snapshots: [], welcomes: [], errors: [], statuses: [] };
  const client = new RoomClient({
    onSnapshot: (snapshot, initial) => events.snapshots.push({ snapshot, initial }),
    onWelcome: (message) => events.welcomes.push(message),
    onError: (error) => events.errors.push(error),
    onStatus: (status) => events.statuses.push(status),
    ...options,
  });
  return { client, events };
}

async function connectedClient(browser, options) {
  const { client, events } = recordingClient(options);
  await client.create(SESSION.playerName, 'squad');
  const socket = browser.sockets.at(-1);
  socket.open();
  socket.receive(welcome());
  return { client, events, socket };
}

async function settled(promise) {
  try {
    return { value: await promise };
  } catch (error) {
    return { error };
  }
}

test('normalizes room codes and rejects malformed codes before any network request', async () => {
  const browser = installBrowser();
  try {
    const { client } = recordingClient();
    for (const code of ['AB12', 'OI01AB', '', null]) {
      const { error } = await settled(client.join(code, 'Visitor'));
      assert.ok(error instanceof RoomClientError);
      assert.equal(error.code, 'ROOM_CODE');
    }
    assert.equal(browser.fetchCalls.length, 0);

    await client.join(' abc-2 34 ', 'Visitor');
    assert.deepEqual(browser.fetchCalls[0], { path: '/api/rooms/ABC234', body: { v: 1, name: 'Visitor' } });
    assert.equal(browser.url.searchParams.get('room'), 'ABC234');
    assert.equal(browser.sockets[0].url, 'wss://game.example/api/rooms/ABC234/socket');
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('resumes a stored room session without creating another membership', async () => {
  const browser = installBrowser({ url: 'https://game.example/?room=abc234' });
  try {
    const { client } = recordingClient();
    assert.equal(client.resumeFromUrl(), false, 'nothing to resume without a stored session');

    for (const invalid of ['{broken', JSON.stringify({ ...SESSION, code: 'ZZZZZZ' }), JSON.stringify({ ...SESSION, token: '' })]) {
      browser.storage.set(SESSION_KEY, invalid);
      assert.equal(client.resumeFromUrl(), false, invalid);
    }
    assert.equal(browser.sockets.length, 0);

    browser.storage.set(SESSION_KEY, JSON.stringify(SESSION));
    browser.storage.set(SEQUENCE_KEY, '7');
    assert.equal(client.resumeFromUrl(), true);
    assert.equal(client.sequence, 7, 'command sequences continue after a refresh');
    assert.equal(browser.sockets.length, 1);

    const joined = await client.join('abc234', 'Someone Else');
    assert.equal(joined.resumed, true);
    assert.deepEqual(joined.session, SESSION);
    assert.equal(browser.fetchCalls.length, 0);
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('reports HTTP failures with the server error code or a generic fallback', async () => {
  const browser = installBrowser({
    responses: [
      { status: 409, body: { code: 'ROOM_FULL', error: 'The squad is full.' } },
      { status: 502, body: '<html>bad gateway</html>' },
    ],
  });
  try {
    const { client } = recordingClient();
    const full = await settled(client.join('ABC234', 'Late Player'));
    assert.equal(full.error.code, 'ROOM_FULL');
    assert.equal(full.error.message, 'The squad is full.');

    const gateway = await settled(client.create('Unlucky Player'));
    assert.equal(gateway.error.code, 'REQUEST_FAILED');
    assert.equal(gateway.error.message, 'Room request failed.');
    assert.equal(client.session, null);
    assert.equal(browser.sockets.length, 0);
    assert.equal(browser.storage.size, 0);
  } finally {
    browser.restore();
  }
});

test('queues commands until welcome, then sends them in sequence and resolves them from acks', async () => {
  const browser = installBrowser();
  try {
    const { client, events } = recordingClient();
    assert.equal((await settled(client.send({ op: 'chat', content: 'too early' }))).error.code, 'NOT_JOINED');

    await client.create(SESSION.playerName);
    const socket = browser.sockets[0];
    const first = client.send({ op: 'chat', content: 'one' });
    const second = client.send({ op: 'chat', content: 'two' });
    assert.deepEqual(socket.sent, [], 'nothing is sent before the socket opens');
    assert.equal(browser.storage.get(SEQUENCE_KEY), '2');

    socket.open();
    assert.equal(socket.commands()[0].type, 'join');
    assert.equal(socket.commands().length, 1, 'commands wait for the welcome');
    socket.receive(welcome());
    assert.deepEqual(events.statuses.slice(-1), ['connected']);
    assert.deepEqual(events.snapshots[0], { snapshot: { code: 'ABC234', revision: 1 }, initial: true });

    const commands = socket.commands().filter((message) => message.type === 'command');
    assert.deepEqual(commands.map((message) => [message.sequence, message.command.content]), [[1, 'one'], [2, 'two']]);
    socket.receive({ v: 1, type: 'ack', id: commands[1].id, sequence: 2, ok: true });
    socket.receive({ v: 1, type: 'ack', id: commands[0].id, sequence: 1, ok: true });
    assert.equal((await second).id, commands[1].id);
    assert.equal((await first).id, commands[0].id);

    const third = client.send({ op: 'flag', x: 0, y: 0, z: 0 });
    const sent = socket.commands().at(-1);
    assert.equal(sent.sequence, 3, 'after welcome commands are sent immediately');
    socket.receive({ v: 1, type: 'ack', id: sent.id, sequence: 3, ok: true });
    await third;
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('routes server errors to the matching command and to the error handler', async () => {
  const browser = installBrowser();
  try {
    const { client, events, socket } = await connectedClient(browser);
    const pending = client.send({ op: 'dig', x: 0, y: 0, z: 0 });
    const { id } = socket.commands().at(-1);
    socket.receive({ v: 1, type: 'error', id, code: 'WRONG_PHASE', message: 'Unavailable now.' });
    const { error } = await settled(pending);
    assert.equal(error.code, 'WRONG_PHASE');
    assert.equal(error.message, 'Unavailable now.');

    socket.receive({ v: 1, type: 'error', message: 'Malformed command.' });
    assert.deepEqual(events.errors.map((item) => item.code), ['WRONG_PHASE', 'REQUEST_FAILED']);
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('forwards snapshots only from the welcomed socket and ignores pongs and foreign frames', async () => {
  const browser = installBrowser();
  try {
    const { client, events } = recordingClient();
    await client.create(SESSION.playerName);
    const socket = browser.sockets[0];
    socket.open();
    socket.receive({ v: 1, type: 'snapshot', snapshot: { revision: 0 } });
    assert.equal(events.snapshots.length, 0, 'snapshots before the welcome are ignored');

    socket.receive(welcome());
    for (const frame of ['pong', '{"v":1,"type":', { v: 2, type: 'snapshot', snapshot: { revision: 9 } }]) {
      socket.receive(frame);
    }
    socket.receive({ v: 1, type: 'snapshot', snapshot: { revision: 2 } });
    assert.deepEqual(events.snapshots.map(({ snapshot, initial }) => [snapshot.revision, initial]), [[1, true], [2, false]]);
    assert.equal(events.welcomes.length, 1);
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('forgets the stored session when the server rejects it permanently', async () => {
  for (const [code, expectedError, forgets] of [
    [4401, 'SOCKET_CLOSED', true],
    [4404, 'ROOM_NOT_FOUND', true],
    [4408, 'SOCKET_CLOSED', false],
  ]) {
    const browser = installBrowser();
    try {
      const { client, events, socket } = await connectedClient(browser);
      client.send({ op: 'chat', content: 'pending' }).catch(() => {});
      socket.serverClose(code, 'rejected');

      assert.equal(events.statuses.at(-1), 'disconnected', code);
      assert.equal(events.errors.at(-1).code, expectedError, code);
      assert.equal(browser.storage.has(SESSION_KEY), !forgets, code);
      assert.equal(browser.storage.has(SEQUENCE_KEY), !forgets, code);
      assert.equal(client.session === null, forgets, code);
      assert.equal(browser.pendingTimers(), 0, 'a rejected session is not retried');
      client.disconnect();
    } finally {
      browser.restore();
    }
  }
});

test('reconnects with backoff after an unexpected drop and resends unacknowledged commands', async () => {
  const browser = installBrowser();
  try {
    const { client, events, socket } = await connectedClient(browser, { reconnectDelays: [100, 400] });
    const pending = client.send({ op: 'chat', content: 'survive the drop' });
    const original = socket.commands().at(-1);

    socket.serverClose(1006, 'network lost');
    assert.equal(events.statuses.at(-1), 'reconnecting');
    browser.advance(80);
    assert.equal(browser.sockets.length, 1, 'the first retry waits for the jittered backoff');
    browser.advance(60);
    assert.equal(browser.sockets.length, 2);

    const replacement = browser.sockets[1];
    replacement.open();
    replacement.receive(welcome({ code: 'ABC234', revision: 5 }));
    const resent = replacement.commands().find((message) => message.type === 'command');
    assert.deepEqual(resent, original, 'the same id and sequence are resent for server-side dedupe');
    replacement.receive({ v: 1, type: 'ack', id: original.id, sequence: original.sequence, ok: true });
    assert.equal((await pending).id, original.id);
    assert.equal(browser.fetchCalls.length, 1, 'reconnecting never creates another room');
    assert.equal(client.reconnectAttempt, 0, 'a welcome resets the backoff');
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('retries the handshake when the server accepts the socket but never welcomes it', async () => {
  const browser = installBrowser();
  try {
    const { client, events } = recordingClient({ welcomeTimeoutMs: 50, reconnectDelays: [10] });
    await client.create(SESSION.playerName);
    browser.sockets[0].open();
    browser.advance(50);
    assert.deepEqual(browser.sockets[0].closeCalls.at(-1), [4000, 'welcome timeout']);
    assert.equal(events.statuses.at(-1), 'reconnecting');
    browser.advance(20);
    assert.equal(browser.sockets.length, 2);
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('hands the join to an already open parallel candidate when the joining socket fails', async () => {
  const browser = installBrowser({ url: 'http://192.168.1.20:8787/' });
  try {
    const { client, events } = recordingClient({ localIpHedgeDelayMs: 100 });
    await client.create(SESSION.playerName);
    browser.advance(100);
    const [first, second] = browser.sockets;
    assert.equal(second.url, 'ws://192.168.1.20:8787/api/rooms/ABC234/socket');

    first.open();
    second.open();
    assert.deepEqual(second.sent, [], 'only one candidate performs the join');
    first.emit('error', {});
    assert.equal(second.commands()[0].type, 'join');
    second.receive(welcome());
    assert.equal(client.socket, second);
    assert.equal(events.welcomes.length, 1);
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('waits for a connecting candidate after a failed join and retries when none opens in time', async () => {
  const browser = installBrowser({ url: 'http://192.168.1.20:8787/' });
  try {
    const { client, events } = recordingClient({
      localIpHedgeDelayMs: 100,
      socketOpenTimeoutMs: 1000,
      reconnectDelays: [10],
    });
    await client.create(SESSION.playerName);
    browser.advance(100);
    const [first] = browser.sockets;
    first.failSend = true;
    first.open();
    assert.deepEqual(first.closeCalls.at(-1), [4000, 'connection failed']);
    assert.notEqual(events.statuses.at(-1), 'reconnecting', 'the connecting hedge still gets its full open window');

    browser.advance(1000);
    assert.equal(events.statuses.at(-1), 'reconnecting');
    browser.advance(20);
    assert.equal(browser.sockets.length, 3);
    assert.equal(browser.fetchCalls.length, 1);
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('reconnects when a resume probe cannot be sent or the handshake is still pending', async () => {
  const browser = installBrowser();
  try {
    const { client } = recordingClient();
    await client.create(SESSION.playerName);
    assert.equal(client.recoverConnection(false), true);
    assert.equal(browser.sockets.length, 2, 'an unfinished handshake gets a parallel attempt');

    const winner = browser.sockets[1];
    winner.open();
    winner.receive(welcome());
    winner.failSend = true;
    assert.equal(client.recoverConnection(false), true);
    assert.equal(browser.sockets.length, 3, 'a socket that cannot send the probe is replaced immediately');
    client.disconnect();
  } finally {
    browser.restore();
  }
});

test('retryNow adds a parallel attempt while connecting and restarts a live session', async () => {
  const browser = installBrowser();
  try {
    const { client } = recordingClient();
    await client.create(SESSION.playerName);
    assert.equal(client.retryNow(), true);
    assert.equal(browser.sockets.length, 2, 'a second candidate races the stalled first one');
    assert.equal(client.retryNow(), true);
    assert.equal(browser.sockets.length, 2, 'never more than two concurrent candidates');

    browser.sockets[1].open();
    browser.sockets[1].receive(welcome());
    assert.deepEqual(browser.sockets[0].closeCalls.at(-1), [1000, 'hedged connection settled']);
    assert.equal(client.retryNow(), true);
    assert.equal(browser.sockets.length, 3);
    assert.deepEqual(browser.sockets[1].closeCalls.at(-1), [1000, 'replaced']);

    client.disconnect();
    assert.equal(client.retryNow(), false);
  } finally {
    browser.restore();
  }
});

test('probes a resumed page with a ping and reconnects only when no pong arrives', async () => {
  const browser = installBrowser();
  try {
    const { client, socket } = await connectedClient(browser, { resumePongTimeoutMs: 300 });
    client.handleVisibilityChange();
    assert.equal(socket.sent.at(-1), 'ping');
    socket.receive('pong');
    browser.advance(400);
    assert.equal(browser.sockets.length, 1, 'a pong proves the socket survived');

    browser.document.visibilityState = 'hidden';
    client.handleVisibilityChange();
    assert.equal(socket.sent.filter((message) => message === 'ping').length, 1, 'hidden pages are not probed');

    browser.document.visibilityState = 'visible';
    client.handleVisibilityChange();
    browser.advance(300);
    assert.equal(browser.sockets.length, 2, 'a silent socket is replaced');

    client.handlePageShow({ persisted: false });
    assert.equal(browser.sockets.length, 2);
    client.handlePageShow({ persisted: true });
    assert.equal(browser.sockets.length, 3, 'restoring from the back-forward cache reconnects');
    client.handleOnline();
    assert.equal(browser.sockets.length, 4);
    client.disconnect();
    assert.equal(client.recoverConnection(true), false);
  } finally {
    browser.restore();
  }
});

test('sends keepalive pings only on the current open socket', async () => {
  const browser = installBrowser();
  try {
    const { client, socket } = await connectedClient(browser);
    const keepalive = browser.intervals.at(-1);
    assert.equal(keepalive.delay, 25000);
    keepalive.callback();
    assert.equal(socket.sent.at(-1), 'ping');

    socket.readyState = WebSocket.CLOSED;
    const sentBefore = socket.sent.length;
    keepalive.callback();
    assert.equal(socket.sent.length, sentBefore);
    client.disconnect();
    assert.equal(keepalive.cleared, true);
  } finally {
    browser.restore();
  }
});

test('leaves with an acknowledged leave command and clears the session and URL', async () => {
  const browser = installBrowser();
  try {
    const { client, events, socket } = await connectedClient(browser);
    assert.equal(new URL(client.inviteUrl()).searchParams.get('room'), 'ABC234');
    const leaving = client.leave();
    const leave = socket.commands().at(-1);
    assert.deepEqual(leave.command, { op: 'leave' });
    socket.receive({ v: 1, type: 'ack', id: leave.id, sequence: leave.sequence, ok: true });
    await leaving;

    assert.equal(client.session, null);
    assert.equal(browser.storage.has(SESSION_KEY), false);
    assert.equal(browser.storage.has(SEQUENCE_KEY), false);
    assert.equal(browser.url.searchParams.has('room'), false);
    assert.equal(events.statuses.at(-1), 'disconnected');
    assert.equal(new URL(client.inviteUrl()).searchParams.has('room'), false);
  } finally {
    browser.restore();
  }
});

test('rejects outstanding commands when the player disconnects', async () => {
  const browser = installBrowser();
  try {
    const { client } = recordingClient();
    await client.create(SESSION.playerName);
    const pending = client.send({ op: 'chat', content: 'never delivered' });
    client.disconnect();
    const { error } = await settled(pending);
    assert.equal(error.code, 'LEFT_ROOM');
    assert.equal(client.session, null);
    assert.equal(browser.storage.has(SESSION_KEY), true, 'a plain disconnect keeps the session for a later resume');
    await client.leave();
    assert.equal(browser.sockets[0].closeCalls.length >= 1, true);
  } finally {
    browser.restore();
  }
});
