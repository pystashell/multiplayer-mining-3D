import { solveMinesweeperHint } from "../../minesweeper-solver.js";

const CONFIG = Object.freeze({ width: 3, height: 3, depth: 3, mineCount: 3 });
export const BEGINNER_TUTORIAL_START = Object.freeze({ x: 2, y: 0, z: 0 });
const TOTAL_CELLS = CONFIG.width * CONFIG.height * CONFIG.depth;
const SAFE_CELL_COUNT = TOTAL_CELLS - CONFIG.mineCount;
const MAX_SHADOW_STEPS = TOTAL_CELLS * 2;

function indexOf(point) {
  return (point.x * CONFIG.height + point.y) * CONFIG.depth + point.z;
}

function pointOf(index) {
  const z = index % CONFIG.depth;
  const plane = (index - z) / CONFIG.depth;
  const y = plane % CONFIG.height;
  const x = (plane - y) / CONFIG.height;
  return { x, y, z };
}

function neighborsOf(index) {
  const point = pointOf(index);
  const neighbors = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const next = { x: point.x + dx, y: point.y + dy, z: point.z + dz };
        if (next.x < 0 || next.x >= CONFIG.width
          || next.y < 0 || next.y >= CONFIG.height
          || next.z < 0 || next.z >= CONFIG.depth) continue;
        neighbors.push(indexOf(next));
      }
    }
  }
  return neighbors;
}

function manhattanDistance(left, right) {
  const a = pointOf(left);
  const b = pointOf(right);
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

function isVisuallyValid(layout) {
  if (!Array.isArray(layout) || layout.length !== CONFIG.mineCount) return false;
  if (new Set(layout).size !== CONFIG.mineCount || layout.some((index) => !Number.isInteger(index) || index < 0 || index >= TOTAL_CELLS)) return false;
  if (layout.includes(indexOf(BEGINNER_TUTORIAL_START))) return false;
  if (new Set(layout.map((index) => pointOf(index).z)).size !== CONFIG.depth) return false;
  for (let left = 0; left < layout.length; left += 1) {
    for (let right = left + 1; right < layout.length; right += 1) {
      if (manhattanDistance(layout[left], layout[right]) < 3) return false;
    }
  }
  return true;
}

/**
 * Constructs the complete visual candidate space at runtime. This is not a
 * curated solvable-layout pool: every candidate must still pass the public
 * solver shadow run before RoomEngine may use it.
 */
export function enumerateBeginnerTutorialCandidates() {
  const layers = Array.from({ length: CONFIG.depth }, (_, z) => (
    Array.from({ length: TOTAL_CELLS }, (_, index) => index).filter((index) => pointOf(index).z === z)
  ));
  const candidates = [];
  for (const first of layers[0]) {
    for (const second of layers[1]) {
      for (const third of layers[2]) {
        const layout = [first, second, third].sort((left, right) => left - right);
        if (isVisuallyValid(layout)) candidates.push(layout);
      }
    }
  }
  return candidates;
}

function revealFrom(startIndexes, mineSet, revealed, flags) {
  const queued = new Set(startIndexes);
  const queue = [...queued];
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    if (revealed.has(index) || flags.has(index) || mineSet.has(index)) continue;
    const count = neighborsOf(index).filter((neighbor) => mineSet.has(neighbor)).length;
    revealed.set(index, count);
    if (count !== 0) continue;
    for (const neighbor of neighborsOf(index)) {
      if (queued.has(neighbor)) continue;
      queued.add(neighbor);
      queue.push(neighbor);
    }
  }
}

function publicRevealed(revealed) {
  return [...revealed].map(([index, count]) => ({ ...pointOf(index), count }));
}

export function isExplainableBeginnerHint(hint) {
  return hint?.status === "hint"
    && hint.certainty === "certain"
    && Boolean(hint.target)
    && hint.rule !== "enumeration-safe"
    && hint.rule !== "enumeration-mine";
}

/**
 * Replays a board in isolated shadow state using exactly the hint algorithm
 * shipped to the client. A board is accepted only when no guess is ever
 * needed and the solver teaches all three true flags before opening all 24
 * safe cells.
 */
export function validateBeginnerTutorialLayout(layout) {
  const normalized = [...(layout || [])].sort((left, right) => left - right);
  if (!isVisuallyValid(normalized)) return false;

  const mineSet = new Set(normalized);
  const revealed = new Map();
  const flags = new Set();
  revealFrom([indexOf(BEGINNER_TUTORIAL_START)], mineSet, revealed, flags);

  for (let step = 0; step < MAX_SHADOW_STEPS; step += 1) {
    if (revealed.size === SAFE_CELL_COUNT) {
      return flags.size === CONFIG.mineCount
        && [...flags].every((index) => mineSet.has(index));
    }

    const hint = solveMinesweeperHint({
      ...CONFIG,
      phase: "playing",
      revealed: publicRevealed(revealed),
      flags: [...flags].map(pointOf),
      excluded: [],
    });
    if (!isExplainableBeginnerHint(hint)) return false;

    const target = indexOf(hint.target);
    if (hint.action === "flag") {
      if (!mineSet.has(target) || flags.has(target) || revealed.has(target)) return false;
      flags.add(target);
    } else if (hint.action === "dig") {
      if (mineSet.has(target) || flags.has(target) || revealed.has(target)) return false;
      revealFrom([target], mineSet, revealed, flags);
    } else {
      return false;
    }
  }
  return false;
}

function fallbackUnit(index) {
  // Deterministic, bounded fallback for broken/throwing RNG implementations.
  // It only changes candidate order; it never bypasses solver validation.
  let value = (0x9e3779b9 ^ index) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0x1_0000_0000;
}

function readUnit(random, index) {
  try {
    const value = Number(random());
    if (Number.isFinite(value)) return ((value % 1) + 1) % 1;
  } catch {
    // Fall through to a deterministic permutation; validation stays strict.
  }
  return fallbackUnit(index);
}

export function createBeginnerTutorialLayout(random = Math.random) {
  const candidates = enumerateBeginnerTutorialCandidates();
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(readUnit(random, index) * (index + 1));
    [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
  }
  for (const candidate of candidates) {
    if (validateBeginnerTutorialLayout(candidate)) return [...candidate];
  }
  // Fail closed rather than ever presenting a board that could force a guess.
  throw new Error("NO_CERTAIN_BEGINNER_LAYOUT");
}
