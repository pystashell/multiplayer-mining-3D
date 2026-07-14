const PROTOCOL_VERSION = 1;
const STORAGE_PREFIX = "holo-sweeper.room.v1";
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 15000];

export class RoomClientError extends Error {
  constructor(code, message = '') {
    super(message);
    this.name = 'RoomClientError';
    this.code = code;
  }
}

function normalizeCode(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
}

function sessionKey(code) {
  return `${STORAGE_PREFIX}.session.${code}`;
}

function sequenceKey(session) {
  return `${STORAGE_PREFIX}.sequence.${session.code}.${session.playerId}`;
}

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function readSession(code) {
  try {
    const value = JSON.parse(safeGet(sessionKey(code)) ?? "null");
    return value?.code === code && value?.token && value?.playerId ? value : null;
  } catch {
    return null;
  }
}

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new RoomClientError(payload.code || 'REQUEST_FAILED', payload.error || 'Room request failed.');
  return payload;
}

export class RoomClient {
  constructor({ onSnapshot, onWelcome, onError, onStatus }) {
    this.onSnapshot = onSnapshot;
    this.onWelcome = onWelcome;
    this.onError = onError;
    this.onStatus = onStatus;
    this.socket = null;
    this.session = null;
    this.sequence = 0;
    this.pending = new Map();
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.intentionalClose = false;
  }

  roomFromUrl() {
    return normalizeCode(new URL(location.href).searchParams.get("room"));
  }

  async create(name, mode = "squad") {
    this.onStatus?.("creating");
    const payload = await api("/api/rooms", { v: PROTOCOL_VERSION, name, mode });
    this.useSession(payload.session);
    this.connect(false);
    return payload;
  }

  async join(code, name) {
    const normalized = normalizeCode(code);
    if (normalized.length !== 6) throw new RoomClientError('ROOM_CODE');
    const stored = readSession(normalized);
    if (stored) {
      this.useSession(stored);
      this.connect(false);
      return { session: stored, resumed: true };
    }
    this.onStatus?.("joining");
    const payload = await api(`/api/rooms/${normalized}`, { v: PROTOCOL_VERSION, name });
    this.useSession(payload.session);
    this.connect(false);
    return payload;
  }

  resumeFromUrl() {
    const code = this.roomFromUrl();
    const session = code ? readSession(code) : null;
    if (!session) return false;
    this.useSession(session);
    this.connect(false);
    return true;
  }

  useSession(session) {
    this.session = session;
    safeSet(sessionKey(session.code), JSON.stringify(session));
    this.sequence = Number(safeGet(sequenceKey(session)) ?? 0) || 0;
    const url = new URL(location.href);
    url.searchParams.set("room", session.code);
    history.replaceState(null, "", url);
  }

  connect(reconnecting) {
    if (!this.session) return;
    this.intentionalClose = false;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, "replaced");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/api/rooms/${this.session.code}/socket`);
    this.socket = socket;
    this.onStatus?.(reconnecting ? "reconnecting" : "connecting");
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "join", session: this.session }));
    });
    socket.addEventListener("message", (event) => {
      if (event.data === "pong") return;
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.v !== PROTOCOL_VERSION) return;
      if (message.type === "welcome") {
        this.reconnectAttempt = 0;
        this.onStatus?.("connected");
        this.onWelcome?.(message);
        this.onSnapshot?.(message.snapshot, true);
        for (const pending of [...this.pending.values()].sort((a, b) => a.message.sequence - b.message.sequence)) {
          socket.send(JSON.stringify(pending.message));
        }
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send("ping");
        }, 25000);
      } else if (message.type === "snapshot") {
        this.onSnapshot?.(message.snapshot, false);
      } else if (message.type === "ack") {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          pending.resolve(message);
        }
      } else if (message.type === "error") {
        const pending = message.id ? this.pending.get(message.id) : null;
        if (pending) {
          this.pending.delete(message.id);
          pending.reject(new RoomClientError(message.code || 'REQUEST_FAILED', message.message));
        }
        this.onError?.(new RoomClientError(message.code || 'REQUEST_FAILED', message.message));
      }
    });
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      clearInterval(this.pingTimer);
      this.socket = null;
      if (this.intentionalClose || (event.code >= 4400 && event.code <= 4499)) {
        this.onStatus?.("disconnected");
        if (!this.intentionalClose) this.onError?.(new RoomClientError(event.code === 4404 ? 'ROOM_NOT_FOUND' : 'SOCKET_CLOSED', event.reason));
        return;
      }
      this.onStatus?.("reconnecting");
      const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
      this.reconnectAttempt += 1;
      this.reconnectTimer = setTimeout(() => this.connect(true), Math.round(delay * (0.85 + Math.random() * 0.3)));
    });
    socket.addEventListener("error", () => this.onStatus?.("reconnecting"));
  }

  send(command) {
    if (!this.session) return Promise.reject(new RoomClientError('NOT_JOINED'));
    this.sequence += 1;
    safeSet(sequenceKey(this.session), String(this.sequence));
    const message = {
      v: PROTOCOL_VERSION,
      type: "command",
      id: crypto.randomUUID(),
      sequence: this.sequence,
      command,
    };
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { message, resolve, reject });
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    });
  }

  inviteUrl() {
    const url = new URL(location.href);
    if (this.session) url.searchParams.set("room", this.session.code);
    return url.toString();
  }
}
