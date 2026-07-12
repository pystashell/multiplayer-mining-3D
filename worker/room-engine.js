export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PLAYERS = 8;
export const MAX_CHAT = 100;
export const MAX_ACTIVITY = 40;
export const MAX_RECEIPTS = 256;

const DEFAULT_CONFIG = Object.freeze({ width: 3, height: 3, depth: 3, mineCount: 3 });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeConfig(value = {}) {
  const width = clamp(Number.parseInt(value.width, 10) || 3, 2, 15);
  const height = clamp(Number.parseInt(value.height, 10) || 3, 2, 15);
  const depth = clamp(Number.parseInt(value.depth, 10) || 3, 2, 15);
  const total = width * height * depth;
  const mineCount = clamp(Number.parseInt(value.mineCount, 10) || 1, 1, Math.floor(total * 0.6));
  return { width, height, depth, mineCount };
}

function indexOf(config, x, y, z) {
  return (x * config.height + y) * config.depth + z;
}

function pointOf(config, index) {
  const z = index % config.depth;
  const plane = (index - z) / config.depth;
  const y = plane % config.height;
  const x = (plane - y) / config.height;
  return { x, y, z };
}

function validPoint(config, point) {
  return point && Number.isInteger(point.x) && Number.isInteger(point.y) && Number.isInteger(point.z)
    && point.x >= 0 && point.x < config.width
    && point.y >= 0 && point.y < config.height
    && point.z >= 0 && point.z < config.depth;
}

function neighbors(config, index) {
  const { x, y, z } = pointOf(config, index);
  const result = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const next = { x: x + dx, y: y + dy, z: z + dz };
        if (validPoint(config, next)) result.push(indexOf(config, next.x, next.y, next.z));
      }
    }
  }
  return result;
}

function createMines(config, firstIndex, random = Math.random) {
  const total = config.width * config.height * config.depth;
  const first = pointOf(config, firstIndex);
  const safe = new Set([firstIndex]);
  if (total > 27) {
    for (const neighbor of neighbors(config, firstIndex)) safe.add(neighbor);
  }
  const candidates = [];
  for (let index = 0; index < total; index += 1) {
    if (!safe.has(index)) candidates.push(index);
  }
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
  }
  void first;
  return candidates.slice(0, config.mineCount).sort((a, b) => a - b);
}

function mineCountAround(config, mines, index) {
  const mineSet = mines instanceof Set ? mines : new Set(mines);
  return neighbors(config, index).filter((neighbor) => mineSet.has(neighbor)).length;
}

function publicCell(config, index, count) {
  return { ...pointOf(config, index), count };
}

export class RoomEngine {
  constructor(state, random = Math.random) {
    this.state = state;
    this.random = random;
  }

  static create({ code, hostId, hostName, tokenHash, now = Date.now() }) {
    return new RoomEngine({
      version: 1,
      code,
      hostId,
      members: [{ id: hostId, name: hostName, tokenHash, joinedAt: now, lastSequence: 0 }],
      config: { ...DEFAULT_CONFIG },
      phase: "ready",
      mines: [],
      revealed: {},
      flags: [],
      pendingMine: null,
      reviveEndsAt: null,
      startedAt: null,
      revision: 1,
      chat: [],
      activity: [],
      receipts: [],
      expiresAt: now + ROOM_TTL_MS,
    });
  }

  static restore(state, random = Math.random) {
    return new RoomEngine(structuredClone(state), random);
  }

  serialize() {
    return structuredClone(this.state);
  }

  member(playerId) {
    return this.state.members.find((member) => member.id === playerId) ?? null;
  }

  reserveMember({ playerId, name, tokenHash, now = Date.now() }) {
    if (this.state.members.length >= MAX_PLAYERS) throw new Error("ROOM_FULL");
    if (this.state.members.some((member) => member.name.toLowerCase() === name.toLowerCase())) throw new Error("NAME_TAKEN");
    this.state.members.push({ id: playerId, name, tokenHash, joinedAt: now, lastSequence: 0 });
    this.touch(now);
    this.addActivity("joined", { name }, now);
    return this.snapshot(now);
  }

  inspectSequence(playerId, id, sequence) {
    const member = this.member(playerId);
    if (!member) return { kind: "invalid" };
    const receipt = this.state.receipts.find((item) => item.playerId === playerId && item.id === id);
    if (receipt) return { kind: "duplicate", receipt };
    if (!Number.isSafeInteger(sequence) || sequence <= member.lastSequence) return { kind: "stale" };
    return { kind: "new", member };
  }

  apply(playerId, command, { id, sequence, now = Date.now() } = {}) {
    const decision = this.inspectSequence(playerId, id, sequence);
    if (decision.kind !== "new") return decision;
    let message = "";
    if (command.op === "restart") message = this.restart(playerId, command.config, now);
    else if (command.op === "dig") message = this.dig(playerId, command, now);
    else if (command.op === "flag") message = this.flag(playerId, command, now);
    else if (command.op === "chat") message = this.chat(playerId, command.content, now);
    else if (command.op === "watch_ad") message = this.watchAd(playerId, now);
    else if (command.op === "end_game") message = this.endGame(playerId, now);
    else if (command.op === "sync") message = "同步完成";
    else throw new Error("UNKNOWN_COMMAND");
    decision.member.lastSequence = sequence;
    const receipt = { playerId, id, sequence, ok: true, message, at: now };
    this.state.receipts.push(receipt);
    this.state.receipts = this.state.receipts.slice(-MAX_RECEIPTS);
    this.touch(now, command.op !== "sync");
    return { kind: "applied", receipt, snapshot: this.snapshot(now) };
  }

  restart(playerId, rawConfig, now) {
    if (playerId !== this.state.hostId) throw new Error("HOST_ONLY");
    const member = this.member(playerId);
    this.state.config = normalizeConfig(rawConfig);
    this.state.phase = "ready";
    this.state.mines = [];
    this.state.revealed = {};
    this.state.flags = [];
    this.state.pendingMine = null;
    this.state.reviveEndsAt = null;
    this.state.startedAt = null;
    this.addActivity("restarted", { name: member.name }, now);
    return "矩阵已重新初始化";
  }

  dig(playerId, point, now) {
    if (!["ready", "playing"].includes(this.state.phase)) throw new Error("WRONG_PHASE");
    if (!validPoint(this.state.config, point)) throw new Error("INVALID_CELL");
    const index = indexOf(this.state.config, point.x, point.y, point.z);
    if (this.state.flags.includes(index) || this.state.revealed[index] !== undefined) return "方块没有变化";
    if (this.state.phase === "ready") {
      this.state.mines = createMines(this.state.config, index, this.random);
      this.state.phase = "playing";
      this.state.startedAt = now;
    }
    const mineSet = new Set(this.state.mines);
    const member = this.member(playerId);
    if (mineSet.has(index)) {
      this.state.phase = "revive";
      this.state.pendingMine = index;
      this.state.reviveEndsAt = null;
      this.addActivity("mineTriggered", { name: member.name }, now);
      return "触发地雷";
    }
    const queue = [index];
    while (queue.length) {
      const current = queue.shift();
      if (this.state.revealed[current] !== undefined || this.state.flags.includes(current) || mineSet.has(current)) continue;
      const count = mineCountAround(this.state.config, mineSet, current);
      this.state.revealed[current] = count;
      if (count === 0) queue.push(...neighbors(this.state.config, current));
    }
    this.addActivity("dug", { name: member.name }, now);
    const safeCells = this.state.config.width * this.state.config.height * this.state.config.depth - this.state.config.mineCount;
    if (Object.keys(this.state.revealed).length === safeCells) {
      this.state.phase = "won";
      this.addActivity("won", {}, now);
    }
    return "挖掘完成";
  }

  flag(playerId, point, now) {
    if (!["ready", "playing"].includes(this.state.phase)) throw new Error("WRONG_PHASE");
    if (!validPoint(this.state.config, point)) throw new Error("INVALID_CELL");
    const index = indexOf(this.state.config, point.x, point.y, point.z);
    if (this.state.revealed[index] !== undefined) return "已揭开的方块不能标记";
    const position = this.state.flags.indexOf(index);
    if (position >= 0) this.state.flags.splice(position, 1);
    else this.state.flags.push(index);
    this.addActivity("flagged", { name: this.member(playerId).name }, now);
    return position >= 0 ? "已取消标记" : "已插旗";
  }

  chat(playerId, content, now) {
    const text = String(content ?? "").trim().slice(0, 300);
    if (!text) throw new Error("EMPTY_CHAT");
    this.state.chat.push({ id: crypto.randomUUID(), playerId, playerName: this.member(playerId).name, message: text, at: now });
    this.state.chat = this.state.chat.slice(-MAX_CHAT);
    return "消息已发送";
  }

  watchAd(playerId, now) {
    if (this.state.phase !== "revive" || this.state.reviveEndsAt !== null) throw new Error("WRONG_PHASE");
    this.state.reviveEndsAt = now + 10_000;
    this.addActivity("reviveStarted", { name: this.member(playerId).name }, now);
    return "量子回溯已启动";
  }

  endGame(playerId, now) {
    if (this.state.phase !== "revive") throw new Error("WRONG_PHASE");
    this.state.phase = "lost";
    this.state.reviveEndsAt = null;
    this.addActivity("gaveUp", { name: this.member(playerId).name }, now);
    return "矩阵已崩溃";
  }

  advance(now = Date.now()) {
    if (this.state.phase === "revive" && this.state.reviveEndsAt !== null && now >= this.state.reviveEndsAt) {
      this.state.phase = "playing";
      this.state.pendingMine = null;
      this.state.reviveEndsAt = null;
      this.addActivity("revived", {}, now);
      this.touch(now);
      return true;
    }
    return false;
  }

  nextAlarm() {
    return this.state.reviveEndsAt === null ? this.state.expiresAt : Math.min(this.state.reviveEndsAt, this.state.expiresAt);
  }

  touch(now, increment = true) {
    if (increment) this.state.revision += 1;
    this.state.expiresAt = now + ROOM_TTL_MS;
  }

  addActivity(key, params, now) {
    this.state.activity.push({ id: crypto.randomUUID(), key, params, at: now });
    this.state.activity = this.state.activity.slice(-MAX_ACTIVITY);
  }

  snapshot(now = Date.now(), connectedIds = new Set()) {
    const config = this.state.config;
    const revealed = Object.entries(this.state.revealed).map(([index, count]) => publicCell(config, Number(index), count));
    return {
      code: this.state.code,
      revision: this.state.revision,
      config: { ...config },
      phase: this.state.phase,
      revealed,
      flags: this.state.flags.map((index) => pointOf(config, index)),
      mines: this.state.phase === "lost" ? this.state.mines.map((index) => pointOf(config, index)) : [],
      pendingMine: this.state.pendingMine === null ? null : pointOf(config, this.state.pendingMine),
      reviveEndsAt: this.state.reviveEndsAt,
      startedAt: this.state.startedAt,
      players: this.state.members.map((member) => ({ id: member.id, name: member.name, isHost: member.id === this.state.hostId, connected: connectedIds.has(member.id) })),
      chat: structuredClone(this.state.chat),
      activity: structuredClone(this.state.activity),
      serverTime: now,
    };
  }
}
