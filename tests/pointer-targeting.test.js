import test from 'node:test';
import assert from 'node:assert/strict';
import {
  intersectionHitsVisibleNumberPixel,
  mergeTwoButtonState,
  orderedTwoButtonTargets,
  resolveTwoButtonGestureTargets,
  resolveTwoButtonRayHits,
  targetFromFocusedCell,
  targetFromFocusedNumber,
} from '../public/pointer-targeting.js';

function fixture() {
  const cells = new Map();
  const add = ({ x, y, z, revealed, count = 0, purged = false, groupVisible = true }) => {
    const mesh = { visible: !revealed, userData: { x, y, z, type: 'cell' } };
    const sprite = revealed ? { visible: true, userData: { x, y, z, type: 'number' } } : null;
    const cell = {
      x, y, z,
      mesh,
      spriteInstance: sprite,
      isRevealed: revealed,
      neighborMines: count,
      isPurged: purged,
      group: { visible: groupVisible },
    };
    cells.set(`${x}:${y}:${z}`, cell);
    return cell;
  };
  return {
    add,
    getCell: (x, y, z) => cells.get(`${x}:${y}:${z}`),
  };
}

test('visible inner cubes win over invisible clue proxy shells', () => {
  const board = fixture();
  const frontClue = board.add({ x: 0, y: 0, z: 0, revealed: true, count: 2 });
  const innerCell = board.add({ x: 1, y: 1, z: 1, revealed: false });
  const target = resolveTwoButtonRayHits(
    [{ object: innerCell.mesh }],
    [{ object: frontClue.mesh }],
    board.getCell,
  );
  assert.deepEqual(target, { x: 1, y: 1, z: 1, type: 'cell' });
});

test('a real visible number sprite keeps priority by ray distance', () => {
  const board = fixture();
  const frontClue = board.add({ x: 0, y: 0, z: 0, revealed: true, count: 2 });
  const innerCell = board.add({ x: 1, y: 1, z: 1, revealed: false });
  const target = resolveTwoButtonRayHits(
    [{ object: frontClue.spriteInstance }, { object: innerCell.mesh }],
    [{ object: frontClue.mesh }],
    board.getCell,
  );
  assert.deepEqual(target, { x: 0, y: 0, z: 0, type: 'number' });
});

test('transparent number padding passes through while visible glyph pixels own the target', () => {
  const board = fixture();
  const frontClue = board.add({ x: 0, y: 0, z: 0, revealed: true, count: 2 });
  const innerCell = board.add({ x: 1, y: 1, z: 1, revealed: false });
  frontClue.spriteInstance.userData.numberHitMask = {
    width: 4,
    height: 4,
    alpha: Uint8Array.from([
      0, 0, 0, 0,
      0, 255, 255, 0,
      0, 255, 255, 0,
      0, 0, 0, 0,
    ]),
  };
  const transparentHit = { object: frontClue.spriteInstance, uv: { x: 0.05, y: 0.05 } };
  const glyphHit = { object: frontClue.spriteInstance, uv: { x: 0.4, y: 0.4 } };

  assert.equal(intersectionHitsVisibleNumberPixel(transparentHit), false);
  assert.equal(intersectionHitsVisibleNumberPixel(glyphHit), true);
  assert.deepEqual(resolveTwoButtonRayHits(
    [transparentHit, { object: innerCell.mesh }],
    [],
    board.getCell,
  ), { x: 1, y: 1, z: 1, type: 'cell' });
  assert.deepEqual(resolveTwoButtonRayHits(
    [glyphHit, { object: innerCell.mesh }],
    [],
    board.getCell,
  ), { x: 0, y: 0, z: 0, type: 'number' });
});

test('number hit testing samples the exact CanvasTexture row without mirrored false hits', () => {
  const board = fixture();
  const clue = board.add({ x: 0, y: 0, z: 0, revealed: true, count: 2 });
  clue.spriteInstance.userData.numberHitMask = {
    width: 2,
    height: 2,
    alpha: Uint8Array.from([
      0, 255,
      0, 0,
    ]),
  };
  clue.spriteInstance.material = { map: { flipY: true } };

  assert.equal(intersectionHitsVisibleNumberPixel({
    object: clue.spriteInstance,
    uv: { x: 0.75, y: 0.75 },
  }), true);
  assert.equal(intersectionHitsVisibleNumberPixel({
    object: clue.spriteInstance,
    uv: { x: 0.75, y: 0.25 },
  }), false);

  clue.spriteInstance.material.map.flipY = false;
  assert.equal(intersectionHitsVisibleNumberPixel({
    object: clue.spriteInstance,
    uv: { x: 0.75, y: 0.25 },
  }), true);
});

test('the full-size clue proxy remains a fallback and ignores unavailable cells', () => {
  const board = fixture();
  const purged = board.add({ x: 0, y: 0, z: 0, revealed: true, count: 2, purged: true });
  const sliced = board.add({ x: 1, y: 0, z: 0, revealed: true, count: 1, groupVisible: false });
  const fallback = board.add({ x: 2, y: 0, z: 0, revealed: true, count: 3 });
  const target = resolveTwoButtonRayHits(
    [],
    [{ object: purged.mesh }, { object: sliced.mesh }, { object: fallback.mesh }],
    board.getCell,
  );
  assert.deepEqual(target, { x: 2, y: 0, z: 0, type: 'number' });
});

test('the first-button anchor owns a two-button gesture', () => {
  const anchor = { x: 2, y: 2, z: 2, type: 'cell' };
  const shifted = { x: 2, y: 2, z: 1, type: 'number' };
  assert.deepEqual(orderedTwoButtonTargets(anchor, shifted), [anchor, shifted]);
  assert.deepEqual(orderedTwoButtonTargets(anchor, { ...anchor }), [anchor]);
  assert.deepEqual(orderedTwoButtonTargets(anchor, null), [anchor]);
  assert.deepEqual(orderedTwoButtonTargets(null, shifted), [shifted]);
});

test('a glowing unopened cube owns the gesture even when a number sprite wins the new raycast', () => {
  const board = fixture();
  const focused = board.add({ x: 1, y: 1, z: 1, revealed: false });
  const frontNumber = board.add({ x: 0, y: 0, z: 0, revealed: true, count: 2 });
  const focusTarget = targetFromFocusedCell(focused);
  const numberTarget = { x: 0, y: 0, z: 0, type: 'number' };

  assert.deepEqual(resolveTwoButtonGestureTargets({
    focusTarget,
    anchorTarget: numberTarget,
    currentTarget: numberTarget,
    dragDistance: 0,
  }, board.getCell), [focusTarget]);
  assert.deepEqual(resolveTwoButtonGestureTargets({
    focusTarget,
    currentTarget: null,
    dragDistance: 4,
  }, board.getCell), [focusTarget]);
});

test('an absent number hover is null-safe while a visible clue becomes the focus target', () => {
  const board = fixture();
  const clue = board.add({ x: 2, y: 1, z: 0, revealed: true, count: 3 });

  assert.equal(targetFromFocusedNumber(null), null);
  assert.deepEqual(targetFromFocusedNumber(clue), { x: 2, y: 1, z: 0, type: 'number' });
  clue.spriteInstance.visible = false;
  assert.equal(targetFromFocusedNumber(clue), null);
});

test('an unavailable visual focus cancels instead of silently retargeting another cube', () => {
  const board = fixture();
  const focused = board.add({ x: 1, y: 1, z: 1, revealed: false });
  const fallback = board.add({ x: 0, y: 0, z: 0, revealed: false });
  const staleTarget = targetFromFocusedCell(focused);
  focused.group.visible = false;
  const fallbackTarget = targetFromFocusedCell(fallback);

  assert.deepEqual(resolveTwoButtonGestureTargets({
    focusTarget: staleTarget,
    currentTarget: fallbackTarget,
  }, board.getCell), []);
});

test('a focused cell without a live mesh is never considered actionable', () => {
  const board = fixture();
  const focused = board.add({ x: 1, y: 1, z: 1, revealed: false });
  const target = targetFromFocusedCell(focused);
  focused.mesh = null;

  assert.deepEqual(resolveTwoButtonGestureTargets({
    focusTarget: target,
  }, board.getCell), []);
});

test('a highlighted revealed number remains locked to the auto-open action', () => {
  const board = fixture();
  board.add({ x: 0, y: 0, z: 0, revealed: true, count: 2 });
  const behind = board.add({ x: 1, y: 1, z: 1, revealed: false });
  const numberTarget = { x: 0, y: 0, z: 0, type: 'number' };
  assert.deepEqual(resolveTwoButtonGestureTargets({
    focusTarget: numberTarget,
    currentTarget: targetFromFocusedCell(behind),
  }, board.getCell), [numberTarget]);
});

test('real camera drags cancel while small button jitter keeps the locked focus', () => {
  const board = fixture();
  const focused = board.add({ x: 1, y: 1, z: 1, revealed: false });
  const focusTarget = targetFromFocusedCell(focused);
  assert.deepEqual(resolveTwoButtonGestureTargets({ focusTarget, dragDistance: 9.99, dragThreshold: 10 }, board.getCell), [focusTarget]);
  assert.deepEqual(resolveTwoButtonGestureTargets({ focusTarget, dragDistance: 10, dragThreshold: 10 }, board.getCell), []);
  assert.deepEqual(resolveTwoButtonGestureTargets({ focusTarget, dragDistance: Number.POSITIVE_INFINITY, dragThreshold: 10 }, board.getCell), []);
});

test('button-state merging remembers the first button when a driver reports only the second', () => {
  assert.equal(mergeTwoButtonState(1, 2, 2), 3);
  assert.equal(mergeTwoButtonState(2, 1, 1), 3);
  assert.equal(mergeTwoButtonState(0, 0, 1), 1);
});
