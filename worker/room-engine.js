import {
  BEGINNER_TUTORIAL_START,
  createBeginnerTutorialLayout,
} from "./beginner-layout.js";

export { BEGINNER_TUTORIAL_START } from "./beginner-layout.js";

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PLAYERS = 8;
export const MAX_CHAT = 100;
export const MAX_ACTIVITY = 40;
export const MAX_RECEIPTS = 256;

export const RULESETS = Object.freeze({
  CLASSIC: "classic",
  SECTOR: "sector",
  REDUCTION: "reduction",
});

const DEFAULT_CONFIG = Object.freeze({
  width: 3,
  height: 3,
  depth: 3,
  mineCount: 3,
  ruleset: RULESETS.CLASSIC,
  autoPurge: false,
  reduction: false,
  campaign: false,
});

function normalizeMode(value) {
  return value === "solo" ? "solo" : "squad";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRuleset(value) {
  return Object.values(RULESETS).includes(value) ? value : RULESETS.CLASSIC;
}

export function normalizeConfig(value = {}) {
  const width = clamp(Number.parseInt(value.width, 10) || 3, 2, 15);
  const height = clamp(Number.parseInt(value.height, 10) || 3, 2, 15);
  const depth = clamp(Number.parseInt(value.depth, 10) || 3, 2, 15);
  const total = width * height * depth;
  const mineCount = clamp(Number.parseInt(value.mineCount, 10) || 1, 1, Math.floor(total * 0.6));
  const legacyRuleset = normalizeRuleset(value.ruleset);
  const autoPurge = typeof value.autoPurge === "boolean"
    ? value.autoPurge
    : legacyRuleset !== RULESETS.CLASSIC;
  const reduction = typeof value.reduction === "boolean"
    ? value.reduction
    : legacyRuleset === RULESETS.REDUCTION;
  const ruleset = reduction ? RULESETS.REDUCTION : (autoPurge ? RULESETS.SECTOR : RULESETS.CLASSIC);
  return {
    width,
    height,
    depth,
    mineCount,
    ruleset,
    autoPurge,
    reduction,
    campaign: value.campaign === true,
  };
}

function indexOf(config, x, y, z) {
  return (x * config.height + y) * config.depth + z;
}

function isBeginnerTutorialConfig(config) {
  return config.campaign === true
    && config.width === 3 && config.height === 3 && config.depth === 3 && config.mineCount === 3;
}

function pointOf(config, index) {
  const z = index % config.depth;
  const plane = (index - z) / config.depth;
  const y = plane % config.height;
  const x = (plane - y) / config.height;
  return { x, y, z };
}

function outerShellDistance(config, index) {
  const { x, y, z } = pointOf(config, index);
  return Math.min(
    x, config.width - 1 - x,
    y, config.height - 1 - y,
    z, config.depth - 1 - z,
  );
}

function outerFirst(config, indexes) {
  return [...indexes].sort((left, right) => (
    outerShellDistance(config, left) - outerShellDistance(config, right)
    || left - right
  ));
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

function faceNeighbors(config, index) {
  const { x, y, z } = pointOf(config, index);
  return [
    { x: x - 1, y, z }, { x: x + 1, y, z },
    { x, y: y - 1, z }, { x, y: y + 1, z },
    { x, y, z: z - 1 }, { x, y, z: z + 1 },
  ].filter((point) => validPoint(config, point)).map((point) => indexOf(config, point.x, point.y, point.z));
}

export function findPurgeableSectors({ config, mines = [], revealed = {}, flags = [], purged = [] }) {
  const mineSet = new Set(mines);
  if (!mineSet.size) return [];
  const flagSet = new Set(flags);
  const purgedSet = new Set(purged);
  const solid = new Set();
  const total = config.width * config.height * config.depth;
  for (let index = 0; index < total; index += 1) {
    if (!purgedSet.has(index) && revealed[index] === undefined) solid.add(index);
  }

  const visited = new Set();
  const sectors = [];
  for (const start of solid) {
    if (visited.has(start)) continue;
    const component = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      for (const next of faceNeighbors(config, current)) {
        if (!solid.has(next) || visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    if (!component.every((index) => flagSet.has(index) && mineSet.has(index))) continue;
    const clueSet = new Set();
    for (const mine of component) {
      for (const neighbor of neighbors(config, mine)) {
        if (!purgedSet.has(neighbor) && revealed[neighbor] !== undefined) clueSet.add(neighbor);
      }
    }
    const mineIndexes = [...component].sort((a, b) => a - b);
    const clueIndexes = [...clueSet].sort((a, b) => a - b);
    sectors.push({
      mineIndexes,
      clueIndexes,
      cellIndexes: mineIndexes,
    });
  }
  return sectors;
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

const REPLAY_CONFIG_KEYS = [
  "width", "height", "depth", "mineCount", "ruleset", "autoPurge", "reduction", "campaign",
];

function replayConfigMatches(left, right) {
  return REPLAY_CONFIG_KEYS.every((key) => left?.[key] === right?.[key]);
}

function createReplayDraft(config) {
  return {
    version: 1,
    runId: crypto.randomUUID(),
    config: { ...config },
    startedAt: null,
    steps: [],
    initialMineIndexes: [],
    shownCorrectFlagIndexes: [],
  };
}

function restoreReplayDraft(value, config) {
  if (!value || !replayConfigMatches(value.config, config)) return createReplayDraft(config);
  return {
    version: 1,
    runId: typeof value.runId === "string" && value.runId ? value.runId : crypto.randomUUID(),
    config: { ...config },
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : null,
    steps: Array.isArray(value.steps) ? value.steps : [],
    initialMineIndexes: Array.isArray(value.initialMineIndexes) ? value.initialMineIndexes : [],
    shownCorrectFlagIndexes: Array.isArray(value.shownCorrectFlagIndexes) ? value.shownCorrectFlagIndexes : [],
  };
}

export class RoomEngine {
  constructor(state, random = Math.random) {
    this.state = state;
    this.random = random;
  }

  static create({ code, hostId, hostName, tokenHash, mode = "squad", now = Date.now() }) {
    return new RoomEngine({
      version: 1,
      code,
      mode: normalizeMode(mode),
      hostId,
      members: [{ id: hostId, name: hostName, tokenHash, joinedAt: now, lastSequence: 0 }],
      config: { ...DEFAULT_CONFIG },
      phase: "ready",
      mines: [],
      revealed: {},
      flags: [],
      purged: [],
      sectorPurgedMineIndexes: [],
      lastPurge: null,
      lastReveal: null,
      pendingMine: null,
      pendingFailureKind: null,
      reviveEndsAt: null,
      reviveStartedBy: null,
      startedAt: null,
      revision: 1,
      chat: [],
      activity: [],
      receipts: [],
      replayDraft: createReplayDraft(DEFAULT_CONFIG),
      completedReplay: null,
      ultimateHack: null,
      expiresAt: now + ROOM_TTL_MS,
    });
  }

  static restore(state, random = Math.random) {
    const restored = structuredClone(state);
    restored.mode = normalizeMode(restored.mode);
    restored.config = normalizeConfig(restored.config);
    restored.reviveStartedBy ??= null;
    restored.purged ??= [];
    // Legacy Sector Purge physically erased every removed mine, so older
    // states can safely seed the cumulative feature counter from `purged`.
    restored.sectorPurgedMineIndexes ??= [...restored.purged];
    restored.lastPurge ??= null;
    restored.lastReveal ??= null;
    restored.pendingFailureKind ??= restored.pendingMine == null ? null : "mine";
    restored.replayDraft = restoreReplayDraft(restored.replayDraft, restored.config);
    restored.completedReplay ??= null;
    restored.ultimateHack ??= null;
    return new RoomEngine(restored, random);
  }

  serialize() {
    return structuredClone(this.state);
  }

  member(playerId) {
    return this.state.members.find((member) => member.id === playerId) ?? null;
  }

  reserveMember({ playerId, name, tokenHash, now = Date.now() }) {
    if (this.state.mode === "solo") throw new Error("SOLO_LOCKED");
    if (this.state.members.length >= MAX_PLAYERS) throw new Error("ROOM_FULL");
    if (this.state.members.some((member) => member.name.toLowerCase() === name.toLowerCase())) throw new Error("NAME_TAKEN");
    this.state.members.push({ id: playerId, name, tokenHash, joinedAt: now, lastSequence: 0 });
    if (!this.state.hostId || !this.member(this.state.hostId)) this.state.hostId = playerId;
    this.touch(now);
    this.addActivity("joined", { name }, now);
    return this.snapshot(now);
  }

  leaveRoom(playerId, now = Date.now()) {
    const memberIndex = this.state.members.findIndex((member) => member.id === playerId);
    if (memberIndex < 0) throw new Error("MEMBER_NOT_FOUND");
    const [member] = this.state.members.splice(memberIndex, 1);
    const wasHost = this.state.hostId === playerId;
    if (wasHost) this.state.hostId = this.state.members[0]?.id ?? null;
    if (this.state.reviveStartedBy === playerId) this.state.reviveStartedBy = null;
    if (this.state.ultimateHack?.startedBy === playerId && this.ultimateHackRunning()) {
      this.state.ultimateHack.status = "cancelled";
    }
    this.state.receipts = this.state.receipts.filter((receipt) => receipt.playerId !== playerId);
    this.addActivity("left", { name: member.name }, now);
    if (wasHost && this.state.hostId) {
      const nextHost = this.member(this.state.hostId);
      if (nextHost) this.addActivity("hostTransferred", { name: nextHost.name }, now);
    }
    return "已退出当前房间";
  }

  inspectSequence(playerId, id, sequence) {
    const member = this.member(playerId);
    if (!member) return { kind: "invalid" };
    const receipt = this.state.receipts.find((item) => item.playerId === playerId && item.id === id);
    if (receipt) return { kind: "duplicate", receipt };
    if (!Number.isSafeInteger(sequence) || sequence <= member.lastSequence) return { kind: "stale" };
    return { kind: "new", member };
  }

  ensureReplayDraft() {
    if (!this.state.replayDraft || !replayConfigMatches(this.state.replayDraft.config, this.state.config)) {
      this.state.replayDraft = createReplayDraft(this.state.config);
      this.state.completedReplay = null;
    }
    return this.state.replayDraft;
  }

  captureReplayState() {
    return {
      phase: this.state.phase,
      mines: [...this.state.mines],
      revealed: { ...this.state.revealed },
      flags: [...this.state.flags],
      purged: [...this.state.purged],
      lastRevealId: this.state.lastReveal?.id ?? null,
      lastPurgeId: this.state.lastPurge?.id ?? null,
    };
  }

  recordReplayTransition(playerId, command, before, now) {
    if (!before) return null;
    const draft = this.ensureReplayDraft();
    if (draft.startedAt === null && Number.isFinite(this.state.startedAt)) draft.startedAt = this.state.startedAt;

    const newPurge = this.state.lastPurge?.id && this.state.lastPurge.id !== before.lastPurgeId
      ? this.state.lastPurge
      : null;
    const knownMineIndexes = [...new Set([
      ...draft.initialMineIndexes,
      ...before.mines,
      ...this.state.mines,
      ...(newPurge?.mineIndexes || []),
    ])].sort((left, right) => left - right);
    draft.initialMineIndexes = knownMineIndexes;
    const knownMineSet = new Set(knownMineIndexes);
    const shownCorrectFlags = new Set(draft.shownCorrectFlagIndexes);
    const correctFlags = [];

    // The clean route shows a correct flag at most once. Safe-cell flags and
    // later flag removals are intentionally omitted.
    for (const index of this.state.flags) {
      if (!knownMineSet.has(index) || shownCorrectFlags.has(index)) continue;
      shownCorrectFlags.add(index);
      correctFlags.push(index);
    }
    const targetIndex = validPoint(this.state.config, command)
      ? indexOf(this.state.config, command.x, command.y, command.z)
      : null;
    const addedTargetFlag = command.op === "flag"
      && targetIndex !== null
      && !before.flags.includes(targetIndex);
    if (addedTargetFlag && knownMineSet.has(targetIndex) && !shownCorrectFlags.has(targetIndex)) {
      shownCorrectFlags.add(targetIndex);
      correctFlags.push(targetIndex);
    }
    draft.shownCorrectFlagIndexes = [...shownCorrectFlags].sort((left, right) => left - right);

    const newlyOpenedSet = new Set(
      Object.keys(this.state.revealed)
        .map(Number)
        .filter((index) => before.revealed[index] === undefined),
    );
    const newReveal = this.state.lastReveal?.id && this.state.lastReveal.id !== before.lastRevealId
      ? this.state.lastReveal
      : null;
    const waveByIndex = new Map((newReveal?.openedIndexes || []).map((index, position) => [
      index,
      Math.max(0, Number(newReveal.openedDepths?.[position]) || 0),
    ]));
    const orderedOpenedIndexes = [
      ...(newReveal?.openedIndexes || []).filter((index) => newlyOpenedSet.has(index)),
      ...[...newlyOpenedSet]
        .filter((index) => !waveByIndex.has(index))
        .sort((left, right) => left - right),
    ];
    const opened = orderedOpenedIndexes.map((index) => ({
      index,
      count: this.state.revealed[index],
      wave: waveByIndex.get(index) ?? 0,
    }));
    const updatedClues = Object.entries(this.state.revealed)
      .map(([index, count]) => ({ index: Number(index), count }))
      .filter(({ index, count }) => before.revealed[index] !== undefined && before.revealed[index] !== count)
      .sort((left, right) => left.index - right.index);
    const reductionMineIndexes = newPurge
      ? (newPurge.reductionMineIndexes || (newPurge.kind === RULESETS.REDUCTION ? newPurge.mineIndexes : []))
      : [];
    const purgedMineIndexes = newPurge
      ? (newPurge.purgedMineIndexes || (newPurge.kind !== RULESETS.REDUCTION ? newPurge.mineIndexes : []))
      : [];
    const cells = newPurge?.cellIndexes || [];

    const hasVisibleChange = correctFlags.length || opened.length || updatedClues.length
      || reductionMineIndexes.length || purgedMineIndexes.length || cells.length;
    if (!hasVisibleChange) return null;

    const member = this.member(playerId);
    const step = {
      id: crypto.randomUUID(),
      kind: newPurge?.kind ?? (command.op === "reduce" ? RULESETS.REDUCTION : command.op),
      targetIndex,
      actor: member ? { id: member.id, name: member.name } : null,
      flagIndexes: [...new Set(correctFlags)].sort((left, right) => left - right),
      opened,
      updatedClues,
      reductionMineIndexes: [...new Set(reductionMineIndexes)].sort((left, right) => left - right),
      purgedMineIndexes: [...new Set(purgedMineIndexes)].sort((left, right) => left - right),
      cellIndexes: [...new Set(cells)].sort((left, right) => left - right),
      leadFlagIndexes: [...new Set(newPurge?.leadFlagIndexes || [])].sort((left, right) => left - right),
      remainingMineCount: this.state.mines.length,
      sectorCount: Number(newPurge?.sectorCount) || 0,
      at: now,
    };
    draft.steps.push(step);
    return step;
  }

  finalizeReplay(now) {
    const draft = this.ensureReplayDraft();
    this.state.completedReplay = {
      version: 1,
      runId: draft.runId,
      config: { ...draft.config },
      startedAt: draft.startedAt,
      completedAt: now,
      steps: structuredClone(draft.steps),
    };
    return this.state.completedReplay;
  }

  publicReplay(replay) {
    if (!replay) return null;
    const config = replay.config;
    return {
      version: 1,
      runId: replay.runId,
      config: { ...config },
      startedAt: replay.startedAt,
      completedAt: replay.completedAt,
      steps: (replay.steps || []).map((step) => ({
        id: step.id,
        kind: step.kind,
        target: step.targetIndex === null ? null : pointOf(config, step.targetIndex),
        actor: step.actor ? { ...step.actor } : null,
        flags: (step.flagIndexes || []).map((index) => pointOf(config, index)),
        opened: (step.opened || []).map(({ index, count, wave }) => ({
          ...publicCell(config, index, count),
          wave,
        })),
        updatedClues: (step.updatedClues || []).map(({ index, count }) => publicCell(config, index, count)),
        reductionMines: (step.reductionMineIndexes || []).map((index) => pointOf(config, index)),
        purgedMines: (step.purgedMineIndexes || []).map((index) => pointOf(config, index)),
        leadFlags: (step.leadFlagIndexes || []).map((index) => pointOf(config, index)),
        cells: (step.cellIndexes || []).map((index) => pointOf(config, index)),
        remainingMineCount: step.remainingMineCount,
        sectorCount: step.sectorCount,
        at: step.at,
      })),
    };
  }

  ultimateHackRunning() {
    return this.state.ultimateHack?.status === "running";
  }

  assertUltimateHackController(playerId) {
    if (playerId !== this.state.hostId) throw new Error("HOST_ONLY");
    if (this.state.mode !== "solo") throw new Error("SOLO_ONLY");
  }

  startUltimateHack(playerId, now) {
    this.assertUltimateHackController(playerId);
    if (!["ready", "playing"].includes(this.state.phase)) throw new Error("WRONG_PHASE");
    if (this.ultimateHackRunning()) throw new Error("ULTIMATE_HACK_ACTIVE");

    // Flags placed before the first dig are guesses because no minefield exists
    // yet. On an in-progress board retain only flags that hidden truth confirms.
    if (this.state.phase === "ready") this.state.flags = [];
    else {
      const mineSet = new Set(this.state.mines);
      this.state.flags = this.state.flags.filter((index) => mineSet.has(index));
    }
    const mineSet = new Set(this.state.mines);
    this.state.ultimateHack = {
      runId: crypto.randomUUID(),
      status: "running",
      strategy: this.reductionEnabled() ? "compression" : "scan",
      step: 0,
      startedBy: playerId,
      hasVisibleFlag: this.state.flags.some((index) => mineSet.has(index)),
    };
    this.addActivity("ultimateHackStarted", { name: this.member(playerId).name }, now);
    return "终极骇客已启动";
  }

  nextUltimateHackCommand() {
    const config = this.state.config;
    const total = config.width * config.height * config.depth;
    const purgedSet = new Set(this.state.purged);
    const mineSet = new Set(this.state.mines);
    const flagSet = new Set(this.state.flags);
    const hiddenIndexes = outerFirst(config, Array.from({ length: total }, (_, index) => index)
      .filter((index) => !purgedSet.has(index) && this.state.revealed[index] === undefined));

    if (this.state.phase === "ready") {
      const target = hiddenIndexes.find((index) => !flagSet.has(index));
      return target === undefined ? null : { op: "dig", ...pointOf(config, target) };
    }

    if (this.reductionEnabled()) {
      const target = outerFirst(config, this.state.mines)
        .find((index) => !purgedSet.has(index) && this.state.revealed[index] === undefined);
      if (target !== undefined) return { op: "reduce", ...pointOf(config, target) };
    } else if (!this.state.ultimateHack.hasVisibleFlag) {
      // Force one server-confirmed flag to survive a full snapshot before any
      // later dig is allowed to trigger Auto-Purge.
      const target = outerFirst(config, this.state.mines)
        .find((index) => !purgedSet.has(index) && !flagSet.has(index) && this.state.revealed[index] === undefined);
      if (target !== undefined) return { op: "flag", ...pointOf(config, target) };
    }

    const target = hiddenIndexes.find((index) => !flagSet.has(index));
    if (target === undefined) return null;
    return { op: mineSet.has(target) ? "flag" : "dig", ...pointOf(config, target) };
  }

  stepUltimateHack(playerId, runId, now, expectedStep) {
    this.assertUltimateHackController(playerId);
    const hack = this.state.ultimateHack;
    if (!hack || hack.runId !== runId) throw new Error("STALE_ULTIMATE_HACK");
    // A reconnect or timer race may retry the same logical pull under a new
    // transport command id. Treat an observed-step mismatch as an idempotent
    // acknowledgement so that one rendered snapshot can advance at most once.
    if (expectedStep !== undefined && expectedStep !== hack.step) return "终极骇客进度已同步";
    if (hack.status !== "running") throw new Error("WRONG_PHASE");
    if (!["ready", "playing"].includes(this.state.phase)) throw new Error("WRONG_PHASE");

    const command = this.nextUltimateHackCommand();
    if (!command) {
      if (this.checkWin(now)) hack.status = "completed";
      else hack.status = "stalled";
      return hack.status === "completed" ? "终极骇客已完成" : "终极骇客无法继续";
    }

    const before = this.captureReplayState();
    if (command.op === "dig") this.dig(playerId, command, now);
    else if (command.op === "reduce") this.reduceCell(playerId, command, now);
    else if (command.op === "flag") {
      this.flag(playerId, command, now, { deferPurge: true });
      hack.hasVisibleFlag = true;
    }
    this.recordReplayTransition(playerId, command, before, now);
    hack.step += 1;
    if (this.state.phase === "won") {
      hack.status = "completed";
      this.addActivity("ultimateHackCompleted", { name: this.member(playerId).name, steps: hack.step }, now);
    }
    return hack.status === "completed" ? "终极骇客已完成" : "终极骇客步骤完成";
  }

  cancelUltimateHack(playerId, runId, now) {
    this.assertUltimateHackController(playerId);
    const hack = this.state.ultimateHack;
    if (!hack || hack.runId !== runId) throw new Error("STALE_ULTIMATE_HACK");
    if (hack.status !== "running") throw new Error("WRONG_PHASE");
    hack.status = "cancelled";
    this.addActivity("ultimateHackCancelled", { name: this.member(playerId).name, steps: hack.step }, now);
    return "终极骇客已中止";
  }

  apply(playerId, command, { id, sequence, now = Date.now() } = {}) {
    const decision = this.inspectSequence(playerId, id, sequence);
    if (decision.kind !== "new") return decision;
    if (this.ultimateHackRunning() && ["dig", "chord", "reduce", "flag"].includes(command.op)) {
      throw new Error("ULTIMATE_HACK_ACTIVE");
    }
    const replayBefore = ["dig", "chord", "reduce", "flag"].includes(command.op)
      ? this.captureReplayState()
      : null;
    let message = "";
    if (command.op === "restart") message = this.restart(playerId, command.config, now);
    else if (command.op === "dig") message = this.dig(playerId, command, now);
    else if (command.op === "chord") message = this.chord(playerId, command, now);
    else if (command.op === "reduce") message = this.reduceCell(playerId, command, now);
    else if (command.op === "flag") message = this.flag(playerId, command, now);
    else if (command.op === "chat") message = this.chat(playerId, command.content, now);
    else if (command.op === "rewind") message = this.rewind(playerId, now);
    else if (command.op === "watch_ad") message = this.watchAd(playerId, now);
    else if (command.op === "end_game") message = this.endGame(playerId, now);
    else if (command.op === "ultimate_hack_start") message = this.startUltimateHack(playerId, now);
    else if (command.op === "ultimate_hack_step") {
      message = this.stepUltimateHack(playerId, command.runId, now, command.expectedStep);
    }
    else if (command.op === "ultimate_hack_cancel") message = this.cancelUltimateHack(playerId, command.runId, now);
    else if (command.op === "leave") message = this.leaveRoom(playerId, now);
    else if (command.op === "sync") message = "同步完成";
    else throw new Error("UNKNOWN_COMMAND");
    this.recordReplayTransition(playerId, command, replayBefore, now);
    if (this.state.phase === "won" && !this.state.completedReplay) this.finalizeReplay(now);
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
    this.state.purged = [];
    this.state.sectorPurgedMineIndexes = [];
    this.state.lastPurge = null;
    this.state.lastReveal = null;
    this.state.pendingMine = null;
    this.state.pendingFailureKind = null;
    this.state.reviveEndsAt = null;
    this.state.reviveStartedBy = null;
    this.state.startedAt = null;
    this.state.replayDraft = createReplayDraft(this.state.config);
    this.state.completedReplay = null;
    this.state.ultimateHack = null;
    this.addActivity("restarted", { name: member.name }, now);
    return "矩阵已重新初始化";
  }

  triggerMine(playerId, index, now, failureKind = "mine") {
    this.state.phase = "revive";
    this.state.pendingMine = index;
    this.state.pendingFailureKind = failureKind;
    this.state.reviveEndsAt = null;
    this.state.reviveStartedBy = null;
    this.addActivity("mineTriggered", { name: this.member(playerId).name }, now);
    return "触发地雷";
  }

  revealSafeCells(startIndexes, mineSet, startingDepth = 0) {
    const purgedSet = new Set(this.state.purged);
    const queued = new Set(startIndexes);
    const queue = [...queued].map((index) => ({ index, depth: startingDepth }));
    const opened = [];
    let head = 0;
    while (head < queue.length) {
      const { index: current, depth } = queue[head];
      head += 1;
      if (purgedSet.has(current) || this.state.revealed[current] !== undefined || this.state.flags.includes(current) || mineSet.has(current)) continue;
      const count = mineCountAround(this.state.config, mineSet, current);
      this.state.revealed[current] = count;
      opened.push({ index: current, depth });
      if (count === 0) {
        for (const index of neighbors(this.state.config, current)) {
          if (queued.has(index)) continue;
          queued.add(index);
          queue.push({ index, depth: depth + 1 });
        }
      }
    }
    return opened;
  }

  recordReveal(kind, opened, now) {
    if (!opened.length) return null;
    this.state.lastReveal = {
      id: crypto.randomUUID(),
      kind,
      openedIndexes: opened.map(({ index }) => index),
      openedDepths: opened.map(({ depth }) => Math.max(0, Number(depth) || 0)),
      at: now,
    };
    return this.state.lastReveal;
  }

  appendPurgeCascade(opened, purgeEvent) {
    if (!purgeEvent) return opened;
    const openedIndexes = new Set(opened.map(({ index }) => index));
    const replacementCells = (purgeEvent.mineIndexes || [])
      .filter((index) => this.state.revealed[index] !== undefined && !openedIndexes.has(index))
      .map((index) => ({ index, depth: 0 }));
    const visibleOpened = [...opened, ...replacementCells];
    if (!purgeEvent.cascadeIndexes?.length) return visibleOpened;
    const depthOffset = visibleOpened.reduce((maximum, cell) => Math.max(maximum, cell.depth), 0);
    return [
      ...visibleOpened,
      ...purgeEvent.cascadeIndexes.map((index, position) => ({
        index,
        depth: depthOffset + Math.max(1, Number(purgeEvent.cascadeDepths?.[position]) || 1),
      })),
    ];
  }

  combinePurgeEvents(first, second, now) {
    if (!first) return second;
    if (!second) return first;
    const unique = (values) => [...new Set(values)].sort((left, right) => left - right);
    const reductionMines = unique([
      ...(first.reductionMineIndexes || (first.kind === RULESETS.REDUCTION ? first.mineIndexes : [])),
      ...(second.reductionMineIndexes || (second.kind === RULESETS.REDUCTION ? second.mineIndexes : [])),
    ]);
    const purgedMines = unique([
      ...(first.purgedMineIndexes || (first.kind !== RULESETS.REDUCTION ? first.mineIndexes : [])),
      ...(second.purgedMineIndexes || (second.kind !== RULESETS.REDUCTION ? second.mineIndexes : [])),
    ]);
    const clueIndexes = unique([...(first.clueIndexes || []), ...(second.clueIndexes || [])]);
    const firstCascade = (first.cascadeIndexes || []).map((index, position) => ({
      index,
      depth: Math.max(1, Number(first.cascadeDepths?.[position]) || 1),
    }));
    const combinedCascade = this.appendPurgeCascade(firstCascade, second);
    return {
      id: crypto.randomUUID(),
      kind: "combined",
      mineIndexes: unique([...reductionMines, ...purgedMines]),
      reductionMineIndexes: reductionMines,
      purgedMineIndexes: purgedMines,
      clueIndexes,
      updatedClues: clueIndexes.map((index) => ({ index, count: this.state.revealed[index] ?? 0 })),
      cascadeIndexes: combinedCascade.map(({ index }) => index),
      cascadeDepths: combinedCascade.map(({ depth }) => depth),
      cellIndexes: unique([...(first.cellIndexes || []), ...(second.cellIndexes || [])]),
      leadFlagIndexes: unique([...(first.leadFlagIndexes || []), ...(second.leadFlagIndexes || [])]),
      // Reduction is a cell operation, not an isolated sector. Only the
      // Sector-Purge half contributes to the island count in a combined event.
      sectorCount: [first, second].reduce((total, event) => (
        total + (event.kind === RULESETS.REDUCTION ? 0 : (Number(event.sectorCount) || 0))
      ), 0),
      at: now,
    };
  }

  checkWin(now) {
    if (this.state.phase !== "playing") return false;
    const activeCells = this.state.config.width * this.state.config.height * this.state.config.depth - this.state.purged.length;
    const safeCells = activeCells - this.state.mines.length;
    if (Object.keys(this.state.revealed).length !== safeCells) return false;
    this.state.phase = "won";
    this.addActivity("won", {}, now);
    return true;
  }

  ruleset() {
    const config = this.state.config;
    if (typeof config.reduction === "boolean" || typeof config.autoPurge === "boolean") {
      if (config.reduction === true) return RULESETS.REDUCTION;
      if (config.autoPurge === true) return RULESETS.SECTOR;
      return RULESETS.CLASSIC;
    }
    return normalizeRuleset(config.ruleset);
  }

  sectorPurgeEnabled() {
    return typeof this.state.config.autoPurge === "boolean"
      ? this.state.config.autoPurge
      : this.ruleset() !== RULESETS.CLASSIC;
  }

  reductionEnabled() {
    return typeof this.state.config.reduction === "boolean"
      ? this.state.config.reduction
      : this.ruleset() === RULESETS.REDUCTION;
  }

  purgeSolvedSectors(playerId, now, { leadFlagIndexes = [] } = {}) {
    if (!this.sectorPurgeEnabled() || this.state.phase !== "playing") return null;
    const sectors = findPurgeableSectors({
      config: this.state.config,
      mines: this.state.mines,
      revealed: this.state.revealed,
      flags: this.state.flags,
      purged: this.state.purged,
    });
    if (!sectors.length) return null;

    const mineIndexes = [...new Set(sectors.flatMap((sector) => sector.mineIndexes))].sort((a, b) => a - b);
    return this.purgeMines(playerId, mineIndexes, now, {
      kind: RULESETS.SECTOR,
      sectorCount: sectors.length,
      leadFlagIndexes,
    });
  }

  purgeMines(playerId, requestedMineIndexes, now, {
    kind,
    sectorCount = 1,
    leadFlagIndexes = [],
  } = {}) {
    const operationKind = kind ?? this.ruleset();
    const featureEnabled = operationKind === RULESETS.REDUCTION
      ? this.reductionEnabled()
      : this.sectorPurgeEnabled();
    if (!featureEnabled || this.state.phase !== "playing") return null;
    const isReduction = operationKind === RULESETS.REDUCTION;
    const currentMineSet = new Set(this.state.mines);
    const mineIndexes = [...new Set(requestedMineIndexes)]
      .filter((index) => currentMineSet.has(index))
      .sort((a, b) => a - b);
    if (!mineIndexes.length) return null;
    const mineIndexSet = new Set(mineIndexes);
    const confirmedLeadFlagIndexes = [...new Set(leadFlagIndexes)]
      .filter((index) => mineIndexSet.has(index))
      .sort((a, b) => a - b);
    const clueSet = new Set();
    for (const mine of mineIndexes) {
      for (const neighbor of neighbors(this.state.config, mine)) {
        if (!this.state.purged.includes(neighbor) && this.state.revealed[neighbor] !== undefined) clueSet.add(neighbor);
      }
    }
    // Removing a mine never removes its coordinate from the board. Both
    // features rewrite that position from the remaining minefield: n stays
    // visible as a clue, while 0 becomes an empty revealed cell and cascades.
    for (const mine of mineIndexes) clueSet.add(mine);
    const clueIndexes = [...clueSet].sort((a, b) => a - b);
    const cellIndexes = [...mineIndexes];
    const removedMineSet = new Set(mineIndexes);
    if (!isReduction) {
      this.state.sectorPurgedMineIndexes = [...new Set([
        ...(this.state.sectorPurgedMineIndexes || []),
        ...mineIndexes,
      ])].sort((a, b) => a - b);
    }
    this.state.mines = this.state.mines.filter((index) => !removedMineSet.has(index));
    this.state.flags = this.state.flags.filter((index) => !removedMineSet.has(index));
    const remainingMineSet = new Set(this.state.mines);
    const updatedClues = clueIndexes.map((index) => {
      const count = mineCountAround(this.state.config, remainingMineSet, index);
      this.state.revealed[index] = count;
      return { index, count };
    });
    const zeroClueSet = new Set(updatedClues.filter(({ count }) => count === 0).map(({ index }) => index));
    const targetZeroIndexes = mineIndexes.filter((index) => zeroClueSet.has(index));
    const zeroClueIndexes = [
      ...targetZeroIndexes,
      ...[...zeroClueSet].filter((index) => !targetZeroIndexes.includes(index)),
    ];
    const cascadeStarts = [...new Set(zeroClueIndexes.flatMap((index) => neighbors(this.state.config, index)))];
    const cascadeCells = this.revealSafeCells(cascadeStarts, remainingMineSet, 1);
    const cascadeIndexes = cascadeCells.map(({ index }) => index);
    const cascadeDepths = cascadeCells.map(({ depth }) => depth);
    this.state.lastPurge = {
      id: crypto.randomUUID(),
      kind: operationKind,
      mineIndexes,
      reductionMineIndexes: isReduction ? mineIndexes : [],
      purgedMineIndexes: isReduction ? [] : mineIndexes,
      clueIndexes,
      updatedClues,
      cascadeIndexes,
      cascadeDepths,
      cellIndexes,
      leadFlagIndexes: confirmedLeadFlagIndexes,
      sectorCount,
      at: now,
    };
    this.recordReveal(operationKind, [
      ...mineIndexes.map((index) => ({ index, depth: 0 })),
      ...cascadeCells,
    ], now);
    const member = this.member(playerId);
    this.addActivity("sectorPurged", {
      name: member?.name ?? "Silver Wolf",
      kind: operationKind,
      sectors: sectorCount,
      mines: mineIndexes.length,
      cells: cellIndexes.length,
      updated: updatedClues.length,
      opened: cascadeIndexes.length,
    }, now);
    return this.state.lastPurge;
  }

  dig(playerId, point, now) {
    if (!["ready", "playing"].includes(this.state.phase)) throw new Error("WRONG_PHASE");
    if (!validPoint(this.state.config, point)) throw new Error("INVALID_CELL");
    const index = indexOf(this.state.config, point.x, point.y, point.z);
    const isReadyBeginner = this.state.phase === "ready"
      && this.state.mode === "solo"
      && isBeginnerTutorialConfig(this.state.config);
    if (isReadyBeginner) {
      const tutorialStartIndex = indexOf(
        this.state.config,
        BEGINNER_TUTORIAL_START.x,
        BEGINNER_TUTORIAL_START.y,
        BEGINNER_TUTORIAL_START.z,
      );
      if (index !== tutorialStartIndex) throw new Error("TUTORIAL_FIRST_MOVE_REQUIRED");
    }
    if (this.state.purged.includes(index)) return "区块已经清除";
    if (this.state.flags.includes(index) || this.state.revealed[index] !== undefined) return "方块没有变化";
    if (this.state.phase === "ready") {
      this.state.mines = isReadyBeginner
        ? createBeginnerTutorialLayout(this.random)
        : createMines(this.state.config, index, this.random);
      this.state.phase = "playing";
      this.state.startedAt = now;
    }
    const mineSet = new Set(this.state.mines);
    const member = this.member(playerId);
    if (mineSet.has(index)) return this.triggerMine(playerId, index, now);
    const opened = this.revealSafeCells([index], mineSet);
    this.addActivity("dug", { name: member.name }, now);
    const purgeEvent = this.sectorPurgeEnabled() ? this.purgeSolvedSectors(playerId, now) : null;
    this.recordReveal("dig", this.appendPurgeCascade(opened, purgeEvent), now);
    this.checkWin(now);
    return "挖掘完成";
  }

  chord(playerId, point, now) {
    if (this.state.phase !== "playing") throw new Error("WRONG_PHASE");
    if (!validPoint(this.state.config, point)) throw new Error("INVALID_CELL");
    const index = indexOf(this.state.config, point.x, point.y, point.z);
    const clue = this.state.revealed[index];
    if (clue === undefined) return "数字没有展开";

    const purgedSet = new Set(this.state.purged);
    const adjacent = neighbors(this.state.config, index).filter((neighbor) => !purgedSet.has(neighbor));
    const flagSet = new Set(this.state.flags);
    const flaggedAround = adjacent.filter((neighbor) => flagSet.has(neighbor)).length;
    if (flaggedAround !== clue) return "相邻标记数不匹配";

    const candidates = adjacent.filter((neighbor) => !flagSet.has(neighbor) && this.state.revealed[neighbor] === undefined);
    if (!candidates.length) return "周围没有可展开方块";

    const mineSet = new Set(this.state.mines);
    const triggeredMine = candidates.find((candidate) => mineSet.has(candidate));
    if (triggeredMine !== undefined) return this.triggerMine(playerId, triggeredMine, now);

    const opened = candidates.length ? this.revealSafeCells(candidates, mineSet) : [];
    this.addActivity("chorded", { name: this.member(playerId).name }, now);
    const purgeEvent = this.sectorPurgeEnabled() ? this.purgeSolvedSectors(playerId, now) : null;
    this.recordReveal("chord", this.appendPurgeCascade(opened, purgeEvent), now);
    this.checkWin(now);
    return "快速展开完成";
  }

  reduceCell(playerId, point, now) {
    if (this.state.phase !== "playing") throw new Error("WRONG_PHASE");
    if (!validPoint(this.state.config, point)) throw new Error("INVALID_CELL");
    if (!this.reductionEnabled()) return "当前协议不支持熵域压缩";
    const index = indexOf(this.state.config, point.x, point.y, point.z);
    if (this.state.purged.includes(index)) return "方块已经消除";
    if (this.state.revealed[index] !== undefined) return "已展开的数字不能执行熵域压缩";

    const mineSet = new Set(this.state.mines);
    if (!mineSet.has(index)) return this.triggerMine(playerId, index, now, "reduction_miss");

    const reductionEvent = this.purgeMines(playerId, [index], now, { kind: RULESETS.REDUCTION, sectorCount: 0 });
    const reductionReveal = this.state.lastReveal ? (this.state.lastReveal.openedIndexes || []).map((openedIndex, position) => ({
      index: openedIndex,
      depth: Math.max(0, Number(this.state.lastReveal.openedDepths?.[position]) || 0),
    })) : [];
    const sectorEvent = this.sectorPurgeEnabled() ? this.purgeSolvedSectors(playerId, now) : null;
    if (sectorEvent) {
      this.recordReveal(RULESETS.REDUCTION, this.appendPurgeCascade(reductionReveal, sectorEvent), now);
      this.state.lastPurge = this.combinePurgeEvents(reductionEvent, sectorEvent, now);
    }
    this.checkWin(now);
    return "熵域压缩完成";
  }

  flag(playerId, point, now, { deferPurge = false } = {}) {
    if (!["ready", "playing"].includes(this.state.phase)) throw new Error("WRONG_PHASE");
    if (!validPoint(this.state.config, point)) throw new Error("INVALID_CELL");
    if (this.state.phase === "ready"
      && this.state.mode === "solo"
      && isBeginnerTutorialConfig(this.state.config)) {
      throw new Error("TUTORIAL_FIRST_MOVE_REQUIRED");
    }
    const index = indexOf(this.state.config, point.x, point.y, point.z);
    if (this.state.purged.includes(index)) return "区块已经清除";
    if (this.state.revealed[index] !== undefined) return "已揭开的方块不能标记";
    const position = this.state.flags.indexOf(index);
    if (position >= 0) this.state.flags.splice(position, 1);
    else this.state.flags.push(index);
    this.addActivity("flagged", { name: this.member(playerId).name }, now);
    if (position < 0 && this.sectorPurgeEnabled() && !deferPurge) {
      const purgeEvent = this.purgeSolvedSectors(playerId, now, { leadFlagIndexes: [index] });
      const cascade = this.appendPurgeCascade([], purgeEvent);
      if (cascade.length) this.recordReveal(RULESETS.SECTOR, cascade, now);
    }
    this.checkWin(now);
    return position >= 0 ? "已取消标记" : "已插旗";
  }

  chat(playerId, content, now) {
    const text = String(content ?? "").trim().slice(0, 300);
    if (!text) throw new Error("EMPTY_CHAT");
    this.state.chat.push({ id: crypto.randomUUID(), playerId, playerName: this.member(playerId).name, message: text, at: now });
    this.state.chat = this.state.chat.slice(-MAX_CHAT);
    return "消息已发送";
  }

  rewind(playerId, now) {
    if (this.state.mode !== "solo" || this.state.phase !== "revive" || this.state.pendingMine === null) throw new Error("WRONG_PHASE");
    this.state.phase = "playing";
    this.state.pendingMine = null;
    this.state.pendingFailureKind = null;
    this.state.reviveEndsAt = null;
    this.state.reviveStartedBy = null;
    this.addActivity("rewound", { name: this.member(playerId).name }, now);
    return "已回溯到踩雷前一步";
  }

  watchAd(playerId, now) {
    if (this.state.mode !== "squad" || this.state.phase !== "revive" || this.state.reviveEndsAt !== null) throw new Error("WRONG_PHASE");
    this.state.reviveEndsAt = now + 10_000;
    this.state.reviveStartedBy = playerId;
    this.addActivity("reviveStarted", { name: this.member(playerId).name }, now);
    return "量子回溯已启动";
  }

  endGame(playerId, now) {
    if (this.state.mode !== "squad" || this.state.phase !== "revive") throw new Error("WRONG_PHASE");
    this.state.phase = "lost";
    this.state.reviveEndsAt = null;
    this.state.reviveStartedBy = null;
    this.addActivity("gaveUp", { name: this.member(playerId).name }, now);
    return "矩阵已崩溃";
  }

  advance(now = Date.now()) {
    if (this.state.phase === "revive" && this.state.reviveEndsAt !== null && now >= this.state.reviveEndsAt) {
      this.state.phase = "playing";
      this.state.pendingMine = null;
      this.state.pendingFailureKind = null;
      this.state.reviveEndsAt = null;
      this.state.reviveStartedBy = null;
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
    const reviveStarter = this.member(this.state.reviveStartedBy);
    const isGuidedBeginner = this.state.mode === "solo" && isBeginnerTutorialConfig(config);
    const remainingMineCount = this.state.phase === "ready" ? config.mineCount : this.state.mines.length;
    const removedMineCount = this.state.phase === "ready" ? 0 : Math.max(0, config.mineCount - remainingMineCount);
    // Sector Purge and Reduction both rewrite removed mine positions as safe
    // clues. Track which feature removed each mine independently from the
    // legacy `purged` holes retained only for backwards-compatible restores.
    const purgedMineCount = Math.min(
      new Set(this.state.sectorPurgedMineIndexes || []).size,
      removedMineCount,
    );
    const reducedMineCount = Math.max(0, removedMineCount - purgedMineCount);
    const legacyPurgedMineCount = Math.min(this.state.purged.length, purgedMineCount);
    const purgedSafeCount = Math.max(0, this.state.purged.length - legacyPurgedMineCount);
    const updatedClues = this.state.lastPurge?.updatedClues
      ?? (this.state.lastPurge?.clueIndexes || []).map((index) => ({ index, count: this.state.revealed[index] ?? 0 }));
    const reductionMineIndexes = this.state.lastPurge?.reductionMineIndexes
      ?? (this.state.lastPurge?.kind === RULESETS.REDUCTION ? this.state.lastPurge.mineIndexes : []);
    const purgedMineIndexes = this.state.lastPurge?.purgedMineIndexes
      ?? (this.state.lastPurge?.kind !== RULESETS.REDUCTION ? this.state.lastPurge?.mineIndexes : []);
    const lastPurge = this.state.lastPurge ? {
      id: this.state.lastPurge.id,
      kind: this.state.lastPurge.kind ?? RULESETS.SECTOR,
      mines: this.state.lastPurge.mineIndexes.map((index) => pointOf(config, index)),
      reductionMines: reductionMineIndexes.map((index) => pointOf(config, index)),
      purgedMines: purgedMineIndexes.map((index) => pointOf(config, index)),
      leadFlags: (this.state.lastPurge.leadFlagIndexes || []).map((index) => pointOf(config, index)),
      clues: updatedClues.map(({ index, count }) => publicCell(config, index, count)),
      updatedClues: updatedClues.map(({ index, count }) => publicCell(config, index, count)),
      opened: (this.state.lastPurge.cascadeIndexes || []).map((index, position) => ({
        ...publicCell(config, index, this.state.revealed[index] ?? 0),
        wave: Math.max(1, Number(this.state.lastPurge.cascadeDepths?.[position]) || 1),
      })),
      cells: this.state.lastPurge.cellIndexes.map((index) => pointOf(config, index)),
      sectorCount: this.state.lastPurge.sectorCount,
      at: this.state.lastPurge.at,
    } : null;
    const lastReveal = this.state.lastReveal ? {
      id: this.state.lastReveal.id,
      kind: this.state.lastReveal.kind,
      opened: (this.state.lastReveal.openedIndexes || []).map((index, position) => ({
        ...publicCell(config, index, this.state.revealed[index] ?? 0),
        wave: Math.max(0, Number(this.state.lastReveal.openedDepths?.[position]) || 0),
      })),
      at: this.state.lastReveal.at,
    } : null;
    const replay = this.state.phase === "won" && this.state.completedReplay
      ? this.publicReplay(this.state.completedReplay)
      : null;
    const ultimateHackStarter = this.member(this.state.ultimateHack?.startedBy);
    const ultimateHack = this.state.ultimateHack ? {
      runId: this.state.ultimateHack.runId,
      status: this.state.ultimateHack.status,
      strategy: this.state.ultimateHack.strategy,
      step: this.state.ultimateHack.step,
      startedBy: ultimateHackStarter
        ? { id: ultimateHackStarter.id, name: ultimateHackStarter.name }
        : null,
    } : null;
    return {
      code: this.state.code,
      mode: this.state.mode,
      revision: this.state.revision,
      config: { ...config },
      phase: this.state.phase,
      revealed,
      flags: this.state.flags.map((index) => pointOf(config, index)),
      purged: this.state.purged.map((index) => pointOf(config, index)),
      remainingMineCount,
      purgedMineCount,
      reducedMineCount,
      purgedSafeCount,
      sectorPurgeEnabled: this.sectorPurgeEnabled(),
      reductionEnabled: this.reductionEnabled(),
      ruleset: this.ruleset(),
      lastPurge,
      lastReveal,
      mines: this.state.phase === "lost" ? this.state.mines.map((index) => pointOf(config, index)) : [],
      tutorialStart: isGuidedBeginner ? { ...BEGINNER_TUTORIAL_START } : null,
      tutorialMines: [],
      pendingMine: this.state.pendingMine === null ? null : pointOf(config, this.state.pendingMine),
      pendingFailureKind: this.state.pendingFailureKind,
      reviveEndsAt: this.state.reviveEndsAt,
      reviveStartedBy: reviveStarter ? { id: reviveStarter.id, name: reviveStarter.name } : null,
      startedAt: this.state.startedAt,
      players: this.state.members.map((member) => ({ id: member.id, name: member.name, isHost: member.id === this.state.hostId, connected: connectedIds.has(member.id) })),
      chat: structuredClone(this.state.chat),
      activity: structuredClone(this.state.activity),
      serverTime: now,
      ultimateHack,
      ...(replay ? { replay } : {}),
    };
  }
}
