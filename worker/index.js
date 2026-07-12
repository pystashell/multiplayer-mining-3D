import { MAX_PLAYERS, RoomEngine } from "./room-engine.js";

const PROTOCOL_VERSION = 1;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_BODY_BYTES = 4 * 1024;
const MAX_MESSAGE_BYTES = 4 * 1024;
const MAX_SOCKETS = 16;
const STATE_KEY = "room";

function json(value, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

function normalizeName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ").slice(0, 16);
  return name || null;
}

function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte & 31]).join("");
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function readBody(request) {
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Response("Too large", { status: 413 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Response("Too large", { status: 413 });
  try {
    return JSON.parse(raw);
  } catch {
    throw new Response("Invalid JSON", { status: 400 });
  }
}

function allowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function enforceRateLimit(request, limiter, scope) {
  if (!limiter) return null;
  const address = request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("X-Forwarded-For")?.split(",", 1)[0]?.trim()
    ?? "local-development";
  const key = await hash(`${scope}:${address}`);
  const { success } = await limiter.limit({ key });
  return success ? null : json({ error: "请求太频繁，请稍后再试。" }, 429);
}

function errorMessage(code) {
  const messages = {
    ROOM_FULL: `房间最多允许 ${MAX_PLAYERS} 位玩家。`,
    NAME_TAKEN: "这个昵称已被使用。",
    HOST_ONLY: "只有房主可以重新初始化矩阵。",
    WRONG_PHASE: "当前游戏阶段不能执行这个操作。",
    INVALID_CELL: "方块坐标无效。",
    EMPTY_CHAT: "消息不能为空。",
    UNKNOWN_COMMAND: "无法识别这个操作。",
  };
  return messages[code] ?? "房间操作失败。";
}

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.engine = null;
    this.queue = Promise.resolve();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get(STATE_KEY);
      if (stored) this.engine = RoomEngine.restore(stored);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/internal/health") return json({ ok: true });
    if (request.method === "POST" && url.pathname === "/internal/init") return this.enqueueResponse(() => this.initialize(request));
    if (request.method === "POST" && url.pathname === "/internal/join") return this.enqueueResponse(() => this.reserve(request));
    if (request.method === "GET" && url.pathname.endsWith("/socket")) return this.enqueueResponse(() => this.openSocket(request));
    return json({ error: "Not found" }, 404);
  }

  async initialize(request) {
    if (this.engine) return json({ error: "Room exists" }, 409);
    const body = await readBody(request);
    this.engine = RoomEngine.create(body);
    await this.persistAndSchedule();
    return json({ room: this.snapshot() }, 201);
  }

  async reserve(request) {
    if (!this.engine) return json({ error: "没有找到这个房间。" }, 404);
    const body = await readBody(request);
    try {
      const room = this.engine.reserveMember(body);
      await this.persistAndSchedule();
      this.broadcast();
      return json({ room }, 201);
    } catch (error) {
      return json({ error: errorMessage(error.message), code: error.message }, error.message === "ROOM_FULL" ? 409 : 400);
    }
  }

  async openSocket(request) {
    if (!this.engine) return json({ error: "没有找到这个房间。" }, 404);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "需要 WebSocket。" }, 426);
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return json({ error: "房间连接已满。" }, 429);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ joined: false, connectionId: crypto.randomUUID(), playerId: null });
    this.ctx.acceptWebSocket(server, ["game-room"]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, raw) {
    if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
      this.close(socket, 4409, "Message too large");
      return;
    }
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      this.close(socket, 4400, "Invalid JSON");
      return;
    }
    await this.enqueue(async () => {
      const attachment = this.attachment(socket);
      if (!attachment.joined) await this.joinSocket(socket, attachment, message);
      else await this.handleCommand(socket, attachment, message);
    });
  }

  async joinSocket(socket, attachment, message) {
    if (!this.engine || message?.v !== PROTOCOL_VERSION || message?.type !== "join" || !message.session) {
      this.close(socket, 4401, "Join required");
      return;
    }
    const member = this.engine.member(message.session.playerId);
    const suppliedHash = typeof message.session.token === "string" ? await hash(message.session.token) : "";
    if (!member || message.session.code !== this.engine.state.code || !constantTimeEqual(member.tokenHash, suppliedHash)) {
      this.close(socket, 4401, "Invalid session");
      return;
    }
    for (const existing of this.ctx.getWebSockets()) {
      if (existing === socket) continue;
      const previous = this.attachment(existing);
      if (previous.joined && previous.playerId === member.id) this.close(existing, 4408, "Session replaced");
    }
    socket.serializeAttachment({ ...attachment, joined: true, playerId: member.id });
    this.engine.touch(Date.now(), false);
    await this.persistAndSchedule();
    this.send(socket, { v: PROTOCOL_VERSION, type: "welcome", identity: { playerId: member.id, playerName: member.name }, snapshot: this.snapshot() });
    this.broadcast(socket);
  }

  async handleCommand(socket, attachment, message) {
    if (message?.v !== PROTOCOL_VERSION || message?.type !== "command" || typeof message.id !== "string"
      || message.id.length > 128 || !Number.isSafeInteger(message.sequence) || !message.command || typeof message.command.op !== "string") {
      this.send(socket, { v: PROTOCOL_VERSION, type: "error", code: "INVALID_COMMAND", message: "命令格式无效。" });
      return;
    }
    const decision = this.engine.inspectSequence(attachment.playerId, message.id, message.sequence);
    if (decision.kind === "duplicate") {
      this.sendAck(socket, decision.receipt);
      return;
    }
    if (decision.kind !== "new") {
      this.send(socket, { v: PROTOCOL_VERSION, type: "error", id: message.id, code: "STALE_COMMAND", message: "命令序号已经过期。" });
      return;
    }
    try {
      const result = this.engine.apply(attachment.playerId, message.command, message);
      await this.persistAndSchedule();
      this.sendAck(socket, result.receipt);
      this.broadcast();
    } catch (error) {
      this.send(socket, { v: PROTOCOL_VERSION, type: "error", id: message.id, code: error.message, message: errorMessage(error.message) });
    }
  }

  async webSocketClose(socket, code, reason) {
    await this.enqueue(async () => {
      this.broadcast(socket);
      try { socket.close(code, reason); } catch {}
    });
  }

  async webSocketError(socket) {
    await this.enqueue(() => this.broadcast(socket));
  }

  async alarm() {
    await this.enqueue(async () => {
      if (!this.engine) return;
      const now = Date.now();
      if (now >= this.engine.state.expiresAt) {
        for (const socket of this.ctx.getWebSockets()) this.close(socket, 4404, "Room expired");
        this.engine = null;
        await this.ctx.storage.deleteAll();
        return;
      }
      if (this.engine.advance(now)) {
        await this.persistAndSchedule();
        this.broadcast();
      } else {
        await this.schedule();
      }
    });
  }

  snapshot(excluded) {
    const connected = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excluded) continue;
      const attachment = this.attachment(socket);
      if (attachment.joined) connected.add(attachment.playerId);
    }
    return this.engine.snapshot(Date.now(), connected);
  }

  broadcast(excluded) {
    if (!this.engine) return;
    const message = { v: PROTOCOL_VERSION, type: "snapshot", snapshot: this.snapshot(excluded) };
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== excluded && this.attachment(socket).joined) this.send(socket, message);
    }
  }

  async persistAndSchedule() {
    await this.ctx.storage.put(STATE_KEY, this.engine.serialize());
    await this.schedule();
  }

  async schedule() {
    if (!this.engine) return;
    const next = this.engine.nextAlarm();
    const current = await this.ctx.storage.getAlarm();
    if (current === null || Math.abs(current - next) > 500) await this.ctx.storage.setAlarm(next);
  }

  sendAck(socket, receipt) {
    this.send(socket, { v: PROTOCOL_VERSION, type: "ack", id: receipt.id, sequence: receipt.sequence, ok: true, message: receipt.message });
  }

  send(socket, value) {
    try { socket.send(JSON.stringify(value)); } catch {}
  }

  close(socket, code, reason) {
    try { socket.close(code, reason); } catch {}
  }

  attachment(socket) {
    return socket.deserializeAttachment() ?? { joined: false, connectionId: crypto.randomUUID(), playerId: null };
  }

  enqueue(operation) {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => {});
    return next;
  }

  enqueueResponse(operation) {
    return this.enqueue(operation).catch((error) => {
      console.error("Room request failed", error);
      return json({ error: "房间服务暂时不可用。" }, 500);
    });
  }
}

async function createRoom(request, env) {
  const body = await readBody(request);
  const name = normalizeName(body?.name);
  if (!name) return json({ error: "请输入昵称。" }, 400);
  const playerId = crypto.randomUUID();
  const sessionToken = token();
  const tokenHash = await hash(sessionToken);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = roomCode();
    const stub = env.GAME_ROOMS.getByName(code);
    const response = await stub.fetch(new Request(new URL("/internal/init", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, hostId: playerId, hostName: name, tokenHash, now: Date.now() }),
    }));
    if (response.status === 409) continue;
    if (!response.ok) return json({ error: "无法创建房间。" }, response.status);
    const payload = await response.json();
    return json({ roomCode: code, session: { code, playerId, playerName: name, token: sessionToken }, room: payload.room }, 201);
  }
  return json({ error: "暂时无法分配房间码。" }, 503);
}

async function joinRoom(request, env, code) {
  const body = await readBody(request);
  const name = normalizeName(body?.name);
  if (!name) return json({ error: "请输入昵称。" }, 400);
  const playerId = crypto.randomUUID();
  const sessionToken = token();
  const tokenHash = await hash(sessionToken);
  const stub = env.GAME_ROOMS.getByName(code);
  const response = await stub.fetch(new Request(new URL("/internal/join", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, name, tokenHash, now: Date.now() }),
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return json({ error: payload.error ?? "无法加入房间。", code: payload.code }, response.status);
  return json({ session: { code, playerId, playerName: name, token: sessionToken }, room: payload.room }, 201);
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return json({ ok: true, service: "3d-multiplayer-mining" });
      if (url.pathname === "/api/rooms" && request.method === "POST") {
        if (!allowedOrigin(request)) return json({ error: "请求来源不允许。" }, 403);
        const limited = await enforceRateLimit(request, env.ROOM_CREATE_LIMIT, "create");
        if (limited) return limited;
        return createRoom(request, env);
      }
      const socketMatch = /^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})\/socket$/.exec(url.pathname);
      if (socketMatch) {
        if (!allowedOrigin(request)) return json({ error: "请求来源不允许。" }, 403);
        const limited = await enforceRateLimit(request, env.ROOM_SOCKET_LIMIT, "socket");
        if (limited) return limited;
        return env.GAME_ROOMS.getByName(socketMatch[1]).fetch(request);
      }
      const joinMatch = /^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})$/.exec(url.pathname);
      if (joinMatch && request.method === "POST") {
        if (!allowedOrigin(request)) return json({ error: "请求来源不允许。" }, 403);
        const limited = await enforceRateLimit(request, env.ROOM_JOIN_LIMIT, "join");
        if (limited) return limited;
        return joinRoom(request, env, joinMatch[1]);
      }
      if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("Worker request failed", error);
      return json({ error: "服务暂时不可用。" }, 500);
    }
  },
};

export default worker;
