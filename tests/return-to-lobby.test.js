import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RoomClient } from '../public/room-client.js';
import { translate } from '../public/i18n.js';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../public/room-client.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');

test('shows one always-available localized main-menu return control on desktop and mobile', () => {
  assert.match(indexSource, /id="btn-return-lobby"[^>]*data-i18n-aria-label="navigation\.backToLobby"/);
  assert.equal(translate('zh', 'navigation.backToLobby'), '返回主界面');
  assert.equal(translate('en', 'navigation.backToLobby'), 'Back to Main Menu');
  assert.match(styleSource, /\.return-lobby-button\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*230/s);
  assert.match(styleSource, /body\.in-room \.return-lobby-button\s*\{\s*display:\s*flex/);
  assert.match(styleSource, /@media \(min-width: 901px\)\s*\{[\s\S]*?\.return-lobby-button\s*\{[^}]*left:\s*auto[^}]*right:\s*20px[^}]*transform:\s*none/s);
  assert.match(styleSource, /body\[data-game-mode="multiplayer"\] #social-panel\s*\{[^}]*margin-top:\s*52px[^}]*max-height:\s*calc\(100vh - 92px\)/s);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*\.return-lobby-button\s*\{[^}]*left:\s*10px[^}]*min-height:\s*42px/s);
  assert.match(styleSource, /body\.in-room \.mobile-statusbar\s*\{\s*left:\s*60px/);
});

test('returns from either game mode by clearing stale room and presentation state', () => {
  assert.match(appSource, /btn-return-lobby'\)\.addEventListener\('click', \(\) => this\.returnToLobby\(\)\)/);
  assert.match(appSource, /async returnToLobby\(\)[\s\S]*await this\.roomClient\.leave\(\)/);
  assert.match(appSource, /returnToLobby\(\)[\s\S]*this\.roomSnapshot = null[\s\S]*this\.currentPlayerId = null/);
  assert.match(appSource, /returnToLobby\(\)[\s\S]*this\.roomSnapshot = null[\s\S]*this\.currentPlayerId = null[\s\S]*this\.updateSolverHintVisibility\(null\)/);
  assert.match(appSource, /classList\.remove\('in-room', 'replay-active', 'ultimate-hack-active', 'mobile-panel-active'\)/);
  assert.match(appSource, /getElementById\('lobby-overlay'\)\.classList\.remove\('hidden'\)/);
  assert.match(appSource, /handleRoomWelcome\(message\)[\s\S]*document\.body\.classList\.add\('in-room'\)/);
  assert.match(clientSource, /if \(!this\.isCurrentRace\(race\) \|\| !race\.candidates\.has\(socket\)\) return/);
  assert.match(workerSource, /message\.command\.op === "leave"[\s\S]*joined: false, playerId: null/);
});

test('RoomClient disconnect stops reconnection, clears the room URL, and rejects stale commands', async () => {
  const originalDescriptors = new Map(
    ['location', 'history', 'localStorage', 'WebSocket'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  let currentUrl = new URL('http://127.0.0.1:8790/?room=ABC234&v=test');
  const storage = new Map([
    ['holo-sweeper.room.v1.session.ABC234', 'stored-session'],
    ['holo-sweeper.room.v1.sequence.ABC234.player-1', '7'],
  ]);
  const statuses = [];
  const closeCalls = [];

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      get href() { return currentUrl.toString(); },
      get protocol() { return currentUrl.protocol; },
      get host() { return currentUrl.host; },
    },
  });
  Object.defineProperty(globalThis, 'history', {
    configurable: true,
    value: { replaceState(_state, _title, next) { currentUrl = new URL(String(next)); } },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: { OPEN: 1, CLOSING: 2 },
  });

  try {
    const client = new RoomClient({ onStatus: (status) => statuses.push(status) });
    client.session = { code: 'ABC234', playerId: 'player-1', playerName: 'Player', token: 'token' };
    client.sequence = 7;
    client.socket = { readyState: 1, close: (...args) => closeCalls.push(args) };
    client.reconnectTimer = setTimeout(() => {}, 10_000);
    client.pingTimer = setInterval(() => {}, 10_000);
    const pending = new Promise((resolve, reject) => {
      client.pending.set('pending-command', { message: {}, resolve, reject });
    });

    client.disconnect({ forgetSession: true });

    await assert.rejects(pending, (error) => error.code === 'LEFT_ROOM');
    assert.equal(client.intentionalClose, true);
    assert.equal(client.socket, null);
    assert.equal(client.session, null);
    assert.deepEqual(closeCalls, [[1000, 'returned to lobby']]);
    assert.equal(currentUrl.searchParams.has('room'), false);
    assert.equal(currentUrl.searchParams.get('v'), 'test');
    assert.equal(storage.has('holo-sweeper.room.v1.session.ABC234'), false);
    assert.equal(storage.has('holo-sweeper.room.v1.sequence.ABC234.player-1'), false);
    assert.equal(statuses.at(-1), 'disconnected');
  } finally {
    for (const [key, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('RoomClient leave notifies the room before clearing its local session', async () => {
  const client = new RoomClient({});
  client.session = { code: 'ABC234', playerId: 'player-1', playerName: 'Player', token: 'token' };
  client.socket = { readyState: 1 };
  const commands = [];
  client.send = async (command) => commands.push(command);
  let disconnectOptions = null;
  client.disconnect = (options) => { disconnectOptions = options; };

  const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: { OPEN: 1 } });
  try {
    await client.leave();
  } finally {
    if (originalWebSocket) Object.defineProperty(globalThis, 'WebSocket', originalWebSocket);
    else delete globalThis.WebSocket;
  }

  assert.deepEqual(commands, [{ op: 'leave' }]);
  assert.deepEqual(disconnectOptions, { forgetSession: true });
});
