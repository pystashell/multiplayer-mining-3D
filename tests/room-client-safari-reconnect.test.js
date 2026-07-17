import test from 'node:test';
import assert from 'node:assert/strict';

import { isIpLiteralHost, RoomClient } from '../public/room-client.js';

function installBrowserHarness({
  url = 'http://192.168.0.175:8790/',
  stickyConnectingClose = false,
  constructorFailures = 0,
} = {}) {
  const keys = [
    'location',
    'history',
    'localStorage',
    'fetch',
    'WebSocket',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
  ];
  const originalDescriptors = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  let currentUrl = new URL(url);
  const storage = new Map();
  const timeoutQueue = [];
  const sockets = [];
  const fetchCalls = [];
  let currentTime = 0;
  let timerOrder = 0;
  let remainingConstructorFailures = constructorFailures;

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      if (remainingConstructorFailures > 0) {
        remainingConstructorFailures -= 1;
        throw new DOMException('WebSocket blocked', 'SecurityError');
      }
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.listeners = new Map();
      this.sent = [];
      this.closeCalls = [];
      sockets.push(this);
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.emit('open');
    }

    send(message) {
      this.sent.push(message);
    }

    close(...args) {
      this.closeCalls.push(args);
      if (stickyConnectingClose && this.readyState === FakeWebSocket.CONNECTING) return;
      this.readyState = FakeWebSocket.CLOSED;
      // Safari's failing path can emit `error` without a corresponding close
      // event. Keep close silent so the handshake watchdog must replace it.
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
    fetchCalls.push({ path, options });
    return new Response(JSON.stringify({
      session: {
        code: 'ABC234',
        playerId: 'player-1',
        playerName: 'Safari Player',
        token: 'session-token',
        mode: 'solo',
      },
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  define('WebSocket', FakeWebSocket);
  define('setTimeout', (callback, delay = 0) => {
    const timer = { callback, delay, at: currentTime + delay, order: timerOrder++, cleared: false };
    timeoutQueue.push(timer);
    return timer;
  });
  define('clearTimeout', (timer) => {
    if (timer) timer.cleared = true;
  });
  define('setInterval', () => ({ interval: true, cleared: false }));
  define('clearInterval', (timer) => {
    if (timer) timer.cleared = true;
  });

  return {
    sockets,
    fetchCalls,
    runNextTimeout() {
      const timer = timeoutQueue
        .filter((candidate) => !candidate.cleared)
        .sort((left, right) => left.at - right.at || left.order - right.order)[0];
      assert.ok(timer, 'expected a pending reconnect or handshake timeout');
      timer.cleared = true;
      currentTime = timer.at;
      timer.callback();
    },
    advanceTime(milliseconds) {
      const target = currentTime + milliseconds;
      while (true) {
        const timer = timeoutQueue
          .filter((candidate) => !candidate.cleared && candidate.at <= target)
          .sort((left, right) => left.at - right.at || left.order - right.order)[0];
        if (!timer) break;
        timer.cleared = true;
        currentTime = timer.at;
        timer.callback();
      }
      currentTime = target;
    },
    runPendingTimeoutsUntil(predicate, limit = 12) {
      for (let count = 0; count < limit && !predicate(); count += 1) {
        this.runNextTimeout();
      }
      assert.ok(predicate(), 'timers did not reach the expected connection state');
    },
    runAllPendingTimeouts(limit = 12) {
      for (let count = 0; count < limit; count += 1) {
        const timer = timeoutQueue
          .filter((candidate) => !candidate.cleared)
          .sort((left, right) => left.at - right.at || left.order - right.order)[0];
        if (!timer) return;
        timer.cleared = true;
        currentTime = timer.at;
        timer.callback();
      }
      assert.fail('unexpected repeating timeout loop');
    },
    restore() {
      for (const [key, descriptor] of originalDescriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('detects literal IPv4 and IPv6 hosts without hedging normal domains', () => {
  assert.equal(isIpLiteralHost('192.168.0.175'), true);
  assert.equal(isIpLiteralHost('127.0.0.1'), true);
  assert.equal(isIpLiteralHost('[fe80::1]'), true);
  assert.equal(isIpLiteralHost('silverwolf.local'), false);
  assert.equal(isIpLiteralHost('example.com'), false);
  assert.equal(isIpLiteralHost('999.168.0.1'), false);
});

function welcomeMessage() {
  return JSON.stringify({
    v: 1,
    type: 'welcome',
    identity: { playerId: 'player-1', playerName: 'Safari Player' },
    snapshot: { code: 'ABC234', mode: 'solo' },
  });
}

test('retries a stalled Safari WebSocket without creating a second room', async () => {
  const harness = installBrowserHarness();
  try {
    const welcomes = [];
    const client = new RoomClient({ onWelcome: (message) => welcomes.push(message) });

    await client.create('Safari Player', 'solo');
    assert.equal(harness.fetchCalls.length, 1);
    assert.equal(harness.sockets.length, 1);

    // Reproduce iOS Safari's LAN failure: the first socket reports an error,
    // never closes, and never produces the application-level welcome message.
    harness.sockets[0].emit('error', new Event('error'));
    harness.runPendingTimeoutsUntil(() => harness.sockets.length === 2);

    assert.equal(harness.fetchCalls.length, 1, 'retry must reuse the existing room session');
    assert.equal(harness.sockets.length, 2, 'a fresh WebSocket should replace the stalled attempt');
    assert.equal(harness.sockets[1].url, 'ws://192.168.0.175:8790/api/rooms/ABC234/socket');

    harness.sockets[1].open();
    harness.sockets[1].emit('message', { data: welcomeMessage() });
    assert.equal(welcomes.length, 1);
    client.disconnect();
  } finally {
    harness.restore();
  }
});

test('retries when Safari leaves the first WebSocket connecting without any event', async () => {
  const harness = installBrowserHarness();
  try {
    const client = new RoomClient({});

    await client.create('Silent Safari Player', 'solo');
    assert.equal(harness.fetchCalls.length, 1);
    assert.equal(harness.sockets.length, 1);

    // Some Safari failures neither welcome nor close. Advancing the client's
    // timers must still replace that attempt without another room POST.
    harness.runPendingTimeoutsUntil(() => harness.sockets.length === 2);

    assert.equal(harness.fetchCalls.length, 1);
    assert.equal(harness.sockets.length, 2);
    client.disconnect();
  } finally {
    harness.restore();
  }
});

test('hedges a stuck IP WebSocket in parallel and joins through the first candidate that opens', async () => {
  const harness = installBrowserHarness({ stickyConnectingClose: true });
  try {
    const welcomes = [];
    const client = new RoomClient({ onWelcome: (message) => welcomes.push(message) });

    await client.create('Hedged Safari Player', 'solo');
    assert.equal(harness.sockets.length, 1);
    harness.advanceTime(899);
    assert.equal(harness.sockets.length, 1);
    harness.advanceTime(1);
    assert.equal(harness.sockets.length, 2, 'the LAN fallback must coexist with the stuck first socket');
    assert.equal(harness.fetchCalls.length, 1, 'hedging must reuse the already-created room session');
    assert.equal(harness.sockets[0].readyState, 0);

    harness.sockets[1].open();
    assert.equal(harness.sockets[0].sent.length, 0, 'the stuck transport must never send a duplicate join');
    assert.match(harness.sockets[1].sent[0], /"type":"join"/);
    harness.sockets[1].emit('message', { data: welcomeMessage() });

    assert.equal(welcomes.length, 1);
    assert.equal(client.socket, harness.sockets[1]);
    assert.deepEqual(harness.sockets[0].closeCalls.at(-1), [1000, 'hedged connection settled']);

    harness.sockets[0].open();
    harness.sockets[0].emit('message', { data: welcomeMessage() });
    harness.runAllPendingTimeouts();
    assert.equal(welcomes.length, 1, 'a late loser must not re-enter the room');
    assert.equal(harness.sockets.length, 2, 'a loser event must not start a third connection');
    client.disconnect();
  } finally {
    harness.restore();
  }
});

test('does not kill a slow but healthy Safari welcome at the old 1600ms deadline', async () => {
  const harness = installBrowserHarness({ url: 'http://silverwolf.local:8790/' });
  try {
    const welcomes = [];
    const client = new RoomClient({ onWelcome: (message) => welcomes.push(message) });

    await client.create('Slow Safari Player', 'solo');
    harness.advanceTime(2500);
    assert.equal(harness.sockets.length, 1);
    harness.sockets[0].open();
    harness.advanceTime(2500);
    harness.sockets[0].emit('message', { data: welcomeMessage() });

    assert.equal(welcomes.length, 1);
    assert.equal(harness.sockets.length, 1, 'open and welcome have separate generous deadlines');
    client.disconnect();
  } finally {
    harness.restore();
  }
});

test('recovers when Safari throws synchronously while constructing the first WebSocket', async () => {
  const harness = installBrowserHarness({ constructorFailures: 1 });
  try {
    const client = new RoomClient({ reconnectDelays: [1] });
    await client.create('Security Error Safari Player', 'solo');
    assert.equal(harness.sockets.length, 0);

    harness.runPendingTimeoutsUntil(() => harness.sockets.length === 1);
    harness.sockets[0].open();
    harness.sockets[0].emit('message', { data: welcomeMessage() });
    assert.equal(client.socket, harness.sockets[0]);
    client.disconnect();
  } finally {
    harness.restore();
  }
});

test('does not reconnect when the first WebSocket reaches welcome normally', async () => {
  const harness = installBrowserHarness();
  try {
    const client = new RoomClient({});

    await client.create('Chrome Player', 'solo');
    assert.equal(harness.fetchCalls.length, 1);
    assert.equal(harness.sockets.length, 1);

    harness.sockets[0].open();
    harness.sockets[0].emit('message', { data: welcomeMessage() });
    harness.runAllPendingTimeouts();

    assert.equal(harness.fetchCalls.length, 1);
    assert.equal(harness.sockets.length, 1, 'successful handshake must cancel fallback reconnects');
    client.disconnect();
  } finally {
    harness.restore();
  }
});
