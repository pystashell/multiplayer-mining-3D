const PROTOCOL_VERSION = 1;
const STORAGE_PREFIX = "holo-sweeper.room.v1";
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 15000];
const SOCKET_OPEN_TIMEOUT_MS = 10000;
const WELCOME_TIMEOUT_MS = 6000;
const RECONNECT_WELCOME_TIMEOUT_MS = 8000;
const LOCAL_IP_HEDGE_DELAY_MS = 900;
const RESUME_PONG_TIMEOUT_MS = 3500;
let fallbackRequestIdCounter = 0;

function fillFallbackRequestBytes(bytes) {
  fallbackRequestIdCounter = (fallbackRequestIdCounter + 1) >>> 0;
  const now = Date.now();
  for (let index = 0; index < bytes.length; index += 1) {
    const timeByte = Math.floor(now / (2 ** ((index % 6) * 8))) & 0xff;
    const counterByte = (fallbackRequestIdCounter >>> ((index % 4) * 8)) & 0xff;
    bytes[index] = Math.floor(Math.random() * 256) ^ timeByte ^ counterByte;
  }
}

export function createClientRequestId(cryptoObject = globalThis.crypto) {
  if (typeof cryptoObject?.randomUUID === "function") {
    try { return cryptoObject.randomUUID(); } catch {}
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoObject?.getRandomValues === "function") {
    try { cryptoObject.getRandomValues(bytes); } catch { fillFallbackRequestBytes(bytes); }
  } else {
    fillFallbackRequestBytes(bytes);
  }

  // Preserve the UUID v4 shape even on insecure HTTP origins where Safari
  // exposes getRandomValues() but intentionally omits randomUUID().
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

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

function safeRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

function readSession(code) {
  try {
    const value = JSON.parse(safeGet(sessionKey(code)) ?? "null");
    return value?.code === code && value?.token && value?.playerId ? value : null;
  } catch {
    return null;
  }
}

export function isIpLiteralHost(value) {
  const hostname = String(value ?? "").replace(/^\[|\]$/g, "");
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return hostname.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
  }
  return hostname.includes(":");
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
  constructor({
    onSnapshot,
    onWelcome,
    onError,
    onStatus,
    socketOpenTimeoutMs = SOCKET_OPEN_TIMEOUT_MS,
    welcomeTimeoutMs = WELCOME_TIMEOUT_MS,
    reconnectWelcomeTimeoutMs = RECONNECT_WELCOME_TIMEOUT_MS,
    localIpHedgeDelayMs = LOCAL_IP_HEDGE_DELAY_MS,
    resumePongTimeoutMs = RESUME_PONG_TIMEOUT_MS,
    reconnectDelays = RECONNECT_DELAYS,
  } = {}) {
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
    this.openTimer = null;
    this.welcomeTimer = null;
    this.hedgeTimer = null;
    this.resumeProbeTimer = null;
    this.pingTimer = null;
    this.intentionalClose = false;
    this.hasWelcome = false;
    this.connectionGeneration = 0;
    this.connectionRace = null;
    this.socketOpenTimeoutMs = socketOpenTimeoutMs;
    this.welcomeTimeoutMs = welcomeTimeoutMs;
    this.reconnectWelcomeTimeoutMs = reconnectWelcomeTimeoutMs;
    this.localIpHedgeDelayMs = localIpHedgeDelayMs;
    this.resumePongTimeoutMs = resumePongTimeoutMs;
    this.reconnectDelays = reconnectDelays;
    this.handlePageShow = (event) => {
      if (event?.persisted) this.recoverConnection(true);
    };
    this.handleOnline = () => this.recoverConnection(true);
    this.handleVisibilityChange = () => {
      if (globalThis.document?.visibilityState === "visible") this.recoverConnection(false);
    };
    globalThis.addEventListener?.("pageshow", this.handlePageShow);
    globalThis.addEventListener?.("online", this.handleOnline);
    globalThis.document?.addEventListener?.("visibilitychange", this.handleVisibilityChange);
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

  connect(reconnecting = false) {
    if (!this.session) return false;
    this.intentionalClose = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.retireConnectionRace(this.connectionRace, 1000, "replaced");
    clearInterval(this.pingTimer);
    clearTimeout(this.resumeProbeTimer);
    this.pingTimer = null;
    this.resumeProbeTimer = null;
    this.hasWelcome = false;

    const race = {
      id: ++this.connectionGeneration,
      candidates: new Set(),
      joiningSocket: null,
      welcomed: false,
      reconnectScheduled: false,
      reconnecting: Boolean(reconnecting),
    };
    this.connectionRace = race;
    this.socket = null;
    this.onStatus?.(reconnecting ? "reconnecting" : "connecting");

    const primary = this.createSocketCandidate(race);
    if (!primary) {
      this.scheduleReconnect(race);
      return false;
    }
    this.armSocketOpenTimeout(race);
    if (this.shouldHedgeLocalIpConnection()) {
      this.hedgeTimer = setTimeout(() => {
        this.hedgeTimer = null;
        if (!this.isCurrentRace(race) || race.welcomed || race.joiningSocket || race.candidates.size >= 2) return;
        const stillConnecting = [...race.candidates]
          .some((candidate) => candidate.readyState === WebSocket.CONNECTING);
        if (stillConnecting) this.createSocketCandidate(race);
      }, this.localIpHedgeDelayMs);
    }
    return true;
  }

  shouldHedgeLocalIpConnection() {
    try { return isIpLiteralHost(new URL(location.href).hostname); } catch { return false; }
  }

  isCurrentRace(race) {
    return Boolean(race && this.connectionRace === race && !this.intentionalClose && this.session);
  }

  clearConnectionTimers() {
    clearTimeout(this.openTimer);
    clearTimeout(this.welcomeTimer);
    clearTimeout(this.hedgeTimer);
    clearTimeout(this.resumeProbeTimer);
    this.openTimer = null;
    this.welcomeTimer = null;
    this.hedgeTimer = null;
    this.resumeProbeTimer = null;
  }

  retireConnectionRace(race, code = 1000, reason = "connection retired") {
    this.clearConnectionTimers();
    if (race && this.connectionRace === race) this.connectionRace = null;
    const sockets = new Set(race?.candidates ?? []);
    if (this.socket) sockets.add(this.socket);
    race?.candidates.clear();
    if (race) race.joiningSocket = null;
    for (const candidate of sockets) {
      if (candidate?.readyState < WebSocket.CLOSING) {
        try { candidate.close(code, reason); } catch {}
      }
    }
    if (sockets.has(this.socket)) this.socket = null;
  }

  armSocketOpenTimeout(race) {
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      if (!this.isCurrentRace(race) || race.welcomed || race.joiningSocket) return;
      this.scheduleReconnect(race);
    }, this.socketOpenTimeoutMs);
  }

  createSocketCandidate(race) {
    if (!this.isCurrentRace(race) || race.welcomed) return null;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    let socket;
    try {
      socket = new WebSocket(`${protocol}//${location.host}/api/rooms/${this.session.code}/socket`);
    } catch {
      return null;
    }
    race.candidates.add(socket);
    socket.addEventListener("open", () => {
      if (!this.isCurrentRace(race) || !race.candidates.has(socket) || race.welcomed) {
        try { socket.close(1000, "stale connection"); } catch {}
        return;
      }
      if (!race.joiningSocket) this.beginSocketJoin(race, socket);
    });
    socket.addEventListener("message", (event) => {
      if (!this.isCurrentRace(race) || !race.candidates.has(socket)) return;
      if (socket === this.socket) {
        clearTimeout(this.resumeProbeTimer);
        this.resumeProbeTimer = null;
      }
      if (event.data === "pong") return;
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.v !== PROTOCOL_VERSION) return;
      if (message.type === "welcome") {
        if (socket === race.joiningSocket && !race.welcomed) this.acceptSocketWelcome(race, socket, message);
      } else if (message.type === "snapshot") {
        if (!race.welcomed || socket !== this.socket) return;
        this.onSnapshot?.(message.snapshot, false);
      } else if (message.type === "ack") {
        if (!race.welcomed || socket !== this.socket) return;
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          pending.resolve(message);
        }
      } else if (message.type === "error") {
        if (!race.welcomed || socket !== this.socket) return;
        const pending = message.id ? this.pending.get(message.id) : null;
        if (pending) {
          this.pending.delete(message.id);
          pending.reject(new RoomClientError(message.code || 'REQUEST_FAILED', message.message));
        }
        this.onError?.(new RoomClientError(message.code || 'REQUEST_FAILED', message.message));
      }
    });
    socket.addEventListener("close", (event) => {
      this.handleSocketCandidateFailure(race, socket, event);
    });
    socket.addEventListener("error", () => {
      this.handleSocketCandidateFailure(race, socket, null);
    });
    return socket;
  }

  beginSocketJoin(race, socket) {
    if (!this.isCurrentRace(race) || race.welcomed || race.joiningSocket || socket.readyState !== WebSocket.OPEN) return;
    race.joiningSocket = socket;
    this.socket = socket;
    clearTimeout(this.openTimer);
    clearTimeout(this.hedgeTimer);
    this.openTimer = null;
    this.hedgeTimer = null;
    try {
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "join", session: this.session }));
    } catch {
      this.handleSocketCandidateFailure(race, socket, null);
      return;
    }
    const welcomeTimeout = this.reconnectAttempt === 0
      ? this.welcomeTimeoutMs
      : this.reconnectWelcomeTimeoutMs;
    clearTimeout(this.welcomeTimer);
    this.welcomeTimer = setTimeout(() => {
      this.welcomeTimer = null;
      if (!this.isCurrentRace(race) || race.welcomed || race.joiningSocket !== socket) return;
      this.removeSocketCandidate(race, socket, 4000, "welcome timeout");
      this.promoteSocketCandidate(race);
    }, welcomeTimeout);
  }

  acceptSocketWelcome(race, socket, message) {
    race.welcomed = true;
    this.hasWelcome = true;
    this.clearConnectionTimers();
    this.socket = socket;
    this.reconnectAttempt = 0;
    for (const candidate of [...race.candidates]) {
      if (candidate === socket) continue;
      race.candidates.delete(candidate);
      if (candidate.readyState < WebSocket.CLOSING) {
        try { candidate.close(1000, "hedged connection settled"); } catch {}
      }
    }
    race.candidates = new Set([socket]);
    race.joiningSocket = socket;
    this.onStatus?.("connected");
    this.onWelcome?.(message);
    this.onSnapshot?.(message.snapshot, true);
    for (const pending of [...this.pending.values()].sort((a, b) => a.message.sequence - b.message.sequence)) {
      socket.send(JSON.stringify(pending.message));
    }
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.socket === socket && socket.readyState === WebSocket.OPEN) socket.send("ping");
    }, 25000);
  }

  removeSocketCandidate(race, socket, code = 4000, reason = "connection failed") {
    if (!race.candidates.has(socket)) return;
    race.candidates.delete(socket);
    if (race.joiningSocket === socket) race.joiningSocket = null;
    if (this.socket === socket) this.socket = null;
    if (socket.readyState < WebSocket.CLOSING) {
      try { socket.close(code, reason); } catch {}
    }
  }

  promoteSocketCandidate(race) {
    if (!this.isCurrentRace(race) || race.welcomed || race.joiningSocket) return;
    const openCandidate = [...race.candidates]
      .find((candidate) => candidate.readyState === WebSocket.OPEN);
    if (openCandidate) {
      this.beginSocketJoin(race, openCandidate);
      return;
    }
    if (race.candidates.size > 0) {
      this.armSocketOpenTimeout(race);
      return;
    }
    this.scheduleReconnect(race);
  }

  handleSocketCandidateFailure(race, socket, closeEvent) {
    if (!this.isCurrentRace(race) || !race.candidates.has(socket)) return;
    const wasWinner = race.welcomed && socket === this.socket;
    const wasJoining = socket === race.joiningSocket;
    const permanentClose = closeEvent && closeEvent.code >= 4400 && closeEvent.code <= 4499;
    this.removeSocketCandidate(race, socket);
    if (permanentClose && (wasWinner || wasJoining)) {
      this.retireConnectionRace(race, 1000, "server rejected connection");
      clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.hasWelcome = false;
      if ([4401, 4404].includes(closeEvent.code) && this.session) {
        safeRemove(sessionKey(this.session.code));
        safeRemove(sequenceKey(this.session));
        this.session = null;
      }
      this.onStatus?.("disconnected");
      this.onError?.(new RoomClientError(closeEvent.code === 4404 ? 'ROOM_NOT_FOUND' : 'SOCKET_CLOSED', closeEvent.reason));
      return;
    }
    if (wasWinner) {
      this.hasWelcome = false;
      clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.scheduleReconnect(race);
      return;
    }
    this.promoteSocketCandidate(race);
  }

  scheduleReconnect(race) {
    if (!this.isCurrentRace(race) || race.reconnectScheduled) return;
    race.reconnectScheduled = true;
    this.retireConnectionRace(race, 4000, "connection retry");
    clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.hasWelcome = false;
    this.onStatus?.("reconnecting");
    const delays = this.reconnectDelays.length ? this.reconnectDelays : RECONNECT_DELAYS;
    const delay = delays[Math.min(this.reconnectAttempt, delays.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(
      () => {
        this.reconnectTimer = null;
        this.connect(true);
      },
      Math.round(delay * (0.85 + Math.random() * 0.3)),
    );
  }

  retryNow() {
    if (!this.session || this.intentionalClose) return false;
    const race = this.connectionRace;
    if (this.isCurrentRace(race) && !race.welcomed) {
      this.onStatus?.("reconnecting");
      clearTimeout(this.hedgeTimer);
      this.hedgeTimer = null;
      if (race.candidates.size < 2) {
        const candidate = this.createSocketCandidate(race);
        if (!candidate && race.candidates.size === 0) this.scheduleReconnect(race);
      }
      return true;
    }
    this.connect(true);
    return true;
  }

  recoverConnection(force = false) {
    if (!this.session || this.intentionalClose) return false;
    if (force) {
      this.connect(true);
      return true;
    }
    const race = this.connectionRace;
    if (!race?.welcomed || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return this.retryNow();
    }
    const socket = this.socket;
    try { socket.send("ping"); } catch {
      this.connect(true);
      return true;
    }
    clearTimeout(this.resumeProbeTimer);
    this.resumeProbeTimer = setTimeout(() => {
      this.resumeProbeTimer = null;
      if (this.session && this.socket === socket && socket.readyState === WebSocket.OPEN) this.connect(true);
    }, this.resumePongTimeoutMs);
    return true;
  }

  async leave() {
    if (this.session && this.socket?.readyState === WebSocket.OPEN) {
      let timeoutId = null;
      try {
        await Promise.race([
          this.send({ op: 'leave' }),
          new Promise((resolve) => {
            timeoutId = setTimeout(resolve, 1200);
          }),
        ]);
      } catch {}
      clearTimeout(timeoutId);
    }
    this.disconnect({ forgetSession: true });
  }

  disconnect({ forgetSession = false } = {}) {
    const departingSession = this.session;
    this.intentionalClose = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.retireConnectionRace(this.connectionRace, 1000, "returned to lobby");
    clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.hasWelcome = false;

    const error = new RoomClientError('LEFT_ROOM');
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.session = null;
    this.sequence = 0;
    this.reconnectAttempt = 0;
    if (forgetSession && departingSession) {
      safeRemove(sessionKey(departingSession.code));
      safeRemove(sequenceKey(departingSession));
    }

    const url = new URL(location.href);
    url.searchParams.delete("room");
    history.replaceState(null, "", url);
    this.onStatus?.("disconnected");
  }

  send(command) {
    if (!this.session) return Promise.reject(new RoomClientError('NOT_JOINED'));
    this.sequence += 1;
    safeSet(sequenceKey(this.session), String(this.sequence));
    const message = {
      v: PROTOCOL_VERSION,
      type: "command",
      id: createClientRequestId(),
      sequence: this.sequence,
      command,
    };
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { message, resolve, reject });
      if (this.hasWelcome && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    });
  }

  inviteUrl() {
    const url = new URL(location.href);
    if (this.session) url.searchParams.set("room", this.session.code);
    return url.toString();
  }
}
