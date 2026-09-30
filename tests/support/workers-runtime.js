// In-memory stand-ins for the Cloudflare Workers runtime pieces used by
// worker/index.js: 101 upgrade responses, WebSocketPair, hibernatable socket
// attachments, and a Durable Object state with storage, alarms, and sockets.
import { GameRoom } from '../../worker/index.js';

export const ORIGIN = 'https://game.example';

const NativeResponse = globalThis.Response;

// Workers accepts `new Response(null, { status: 101, webSocket })`; Node's
// fetch implementation only allows 200-599, so keep the Workers shape here.
export class WorkersResponse extends NativeResponse {
  constructor(body, init = {}) {
    const upgrade = init?.status === 101;
    super(body, upgrade ? { ...init, status: 200 } : init);
    if (upgrade) Object.defineProperty(this, 'status', { value: 101 });
    this.webSocket = init?.webSocket ?? null;
  }
}

export class FakeSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor() {
    this.readyState = FakeSocket.OPEN;
    this.sent = [];
    this.closed = null;
    this.attachment = null;
    this.failSend = false;
    this.tags = null;
  }

  send(data) {
    if (this.failSend || this.readyState !== FakeSocket.OPEN) throw new Error('socket is not open');
    this.sent.push(JSON.parse(data));
  }

  // A server-initiated close stays CLOSING until the peer answers; meanwhile
  // the runtime may keep returning the socket from getWebSockets().
  close(code, reason) {
    if (this.readyState !== FakeSocket.OPEN) throw new Error('socket is already closing');
    this.readyState = FakeSocket.CLOSING;
    this.closed = { code, reason };
  }

  // The peer completed the close handshake (or closed first).
  disconnect() {
    this.readyState = FakeSocket.CLOSED;
  }

  serializeAttachment(value) {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment() {
    return this.attachment === null ? null : structuredClone(this.attachment);
  }

  messages(type) {
    return this.sent.filter((message) => message.type === type);
  }

  last(type) {
    return this.messages(type).at(-1);
  }
}

class FakeWebSocketPair {
  constructor() {
    this[0] = new FakeSocket();
    this[1] = new FakeSocket();
  }
}

class FakeAutoResponse {
  constructor(request, response) {
    this.request = request;
    this.response = response;
  }
}

export function installWorkersRuntime() {
  const keys = ['Response', 'WebSocketPair', 'WebSocketRequestResponsePair'];
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const define = (key, value) => Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
  define('Response', WorkersResponse);
  define('WebSocketPair', FakeWebSocketPair);
  define('WebSocketRequestResponsePair', FakeAutoResponse);
  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

export function createDurableObjectState(storedRoom) {
  const storage = new Map(storedRoom ? [['room', structuredClone(storedRoom)]] : []);
  const sockets = [];
  const alarmWrites = [];
  let alarm = null;
  // Durable Objects getAlarm() returns null while an alarm handler runs, unless
  // the handler has already called setAlarm() again.
  let runningAlarm = null;
  let ready = Promise.resolve();
  const state = {
    storage: {
      async get(key) {
        return storage.has(key) ? structuredClone(storage.get(key)) : undefined;
      },
      async put(key, value) {
        storage.set(key, structuredClone(value));
      },
      async deleteAll() {
        storage.clear();
      },
      async getAlarm() {
        return runningAlarm && !runningAlarm.rescheduled ? null : alarm;
      },
      async setAlarm(time) {
        alarm = Number(time);
        alarmWrites.push(alarm);
        if (runningAlarm) runningAlarm.rescheduled = true;
      },
    },
    autoResponse: null,
    setWebSocketAutoResponse(pair) {
      state.autoResponse = pair;
    },
    blockConcurrencyWhile(callback) {
      ready = callback();
      return ready;
    },
    acceptWebSocket(socket, tags) {
      socket.tags = tags;
      sockets.push(socket);
    },
    getWebSockets() {
      return sockets.filter((socket) => socket.readyState !== FakeSocket.CLOSED);
    },
  };
  async function runAlarmHandler(room) {
    runningAlarm = { rescheduled: false };
    try {
      await room.alarm();
    } finally {
      runningAlarm = null;
    }
  }
  return {
    state,
    storage,
    sockets,
    alarmWrites,
    get alarm() {
      return alarm;
    },
    ready: () => ready,
    // The runtime fires an alarm only once it is due, and consumes it before
    // the handler starts.
    async fireAlarm(room) {
      if (alarm === null) throw new Error('no alarm is scheduled');
      if (Date.now() < alarm) throw new Error(`alarm is not due until ${alarm}`);
      alarm = null;
      await runAlarmHandler(room);
    },
    // Alarms are delivered at least once: a retry runs the handler again.
    redeliverAlarm: runAlarmHandler,
    // With web_socket_auto_reply_to_close (on for this project's compatibility
    // date) the runtime answers a client close and marks the socket CLOSED
    // before calling webSocketClose().
    async clientClose(room, socket, code = 1000, reason = '') {
      socket.disconnect();
      await room.webSocketClose(socket, code, reason);
    },
  };
}

export async function createGameRoom(storedRoom) {
  const runtime = createDurableObjectState(storedRoom);
  const room = new GameRoom(runtime.state, {});
  await runtime.ready();
  return { room, runtime };
}

// Routes Durable Object stubs to real GameRoom instances, one per room name.
export function createRoomNamespace() {
  const rooms = new Map();
  const names = [];
  return {
    rooms,
    names,
    getByName(name) {
      names.push(name);
      if (!rooms.has(name)) {
        const runtime = createDurableObjectState();
        rooms.set(name, { room: new GameRoom(runtime.state, {}), runtime });
      }
      const entry = rooms.get(name);
      return {
        async fetch(request) {
          await entry.runtime.ready();
          return entry.room.fetch(request);
        },
      };
    },
  };
}

export function jsonRequest(pathname, body, { origin = ORIGIN, headers = {} } = {}) {
  return new Request(`${ORIGIN}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function socketRequest(code, { origin = ORIGIN, upgrade = 'websocket' } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (upgrade) headers.Upgrade = upgrade;
  return new Request(`${ORIGIN}/api/rooms/${code}/socket`, { headers });
}

export function joinMessage(session, overrides = {}) {
  return JSON.stringify({ v: 1, type: 'join', session, ...overrides });
}

export function commandMessage(id, sequence, command, extra = {}) {
  return JSON.stringify({ v: 1, type: 'command', id, sequence, command, ...extra });
}
