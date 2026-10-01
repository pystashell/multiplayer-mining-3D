// Browser and workerd tests each keep several CPU cores busy (software WebGL
// renders every frame on the CPU). node:test starts every test file at once,
// and even two of these together on a 16-core machine slowed input and page
// loads past the game's own timing windows. Each heavy file therefore holds a
// machine-wide slot while it runs — one by default; set
// HOLO_SWEEPER_HEAVY_SLOTS to allow more.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SLOT_ROOT = path.join(tmpdir(), 'holo-sweeper-heavy-test-slots');

export function heavySlotCount(env = process.env) {
  const configured = Number.parseInt(env.HOLO_SWEEPER_HEAVY_SLOTS, 10);
  return Number.isInteger(configured) && configured > 0 ? configured : 1;
}

function ownerIsGone(lock) {
  let owner = Number.NaN;
  try {
    owner = Number.parseInt(readFileSync(path.join(lock, 'owner'), 'utf8'), 10);
  } catch {
    // A holder that died between creating the slot and naming itself.
    try {
      return Date.now() - statSync(lock).mtimeMs > 60_000;
    } catch {
      return false;
    }
  }
  try {
    process.kill(owner, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

export async function acquireHeavySlot({ slots = heavySlotCount(), timeoutMs = 20 * 60_000 } = {}) {
  mkdirSync(SLOT_ROOT, { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (let slot = 0; slot < slots; slot += 1) {
      const lock = path.join(SLOT_ROOT, `slot-${slot}`);
      try {
        mkdirSync(lock);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (ownerIsGone(lock)) rmSync(lock, { recursive: true, force: true });
        continue;
      }
      writeFileSync(path.join(lock, 'owner'), String(process.pid));
      let released = false;
      return () => {
        if (released) return;
        released = true;
        rmSync(lock, { recursive: true, force: true });
      };
    }
    if (Date.now() > deadline) throw new Error(`No heavy test slot became free within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// Runs every cleanup step even when an earlier one fails, then reports the
// failures. A skipped close leaves a server or socket holding the process open.
export async function disposeAll(...steps) {
  const failures = [];
  for (const step of steps) {
    try {
      await step?.();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Several cleanup steps failed');
}
