import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseFloatingAxisPlacement, chooseGuidedCalloutPlacement } from '../public/guided-callout.js';

const board = { left: 280, top: 220, right: 720, bottom: 520 };
const safe = { left: 40, top: 80, right: 960, bottom: 680 };

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('places a guided callout entirely outside the projected board', () => {
  const placement = chooseGuidedCalloutPlacement({
    board,
    safe,
    target: { x: 500, y: 360 },
    width: 210,
    height: 72,
    gap: 22,
  });

  assert.ok(placement);
  assert.equal(overlaps(placement, board), false);
  assert.ok(placement.left >= safe.left);
  assert.ok(placement.right <= safe.right);
  assert.ok(placement.top >= safe.top);
  assert.ok(placement.bottom <= safe.bottom);
});

test('uses a side placement when there is no room above or below the board', () => {
  const placement = chooseGuidedCalloutPlacement({
    board: { left: 300, top: 90, right: 700, bottom: 610 },
    safe: { left: 20, top: 60, right: 980, bottom: 640 },
    target: { x: 650, y: 350 },
    width: 180,
    height: 70,
    gap: 20,
  });

  assert.ok(placement);
  assert.ok(['left', 'right'].includes(placement.side));
  assert.equal(overlaps(placement, { left: 300, top: 90, right: 700, bottom: 610 }), false);
});

test('returns null instead of covering the board when no safe space exists', () => {
  assert.equal(chooseGuidedCalloutPlacement({
    board: { left: 10, top: 10, right: 390, bottom: 790 },
    safe: { left: 10, top: 10, right: 390, bottom: 790 },
    target: { x: 200, y: 400 },
    width: 160,
    height: 60,
    gap: 16,
  }), null);
});

test('floats the coordinate axes outside the board on the side nearest the real origin', () => {
  const placement = chooseFloatingAxisPlacement({
    board,
    safe,
    target: { x: 300, y: 500 },
    width: 100,
    height: 100,
    gap: 12,
  });

  assert.ok(placement);
  assert.equal(overlaps(placement, board), false);
  assert.ok(['left', 'bottom'].includes(placement.side));
});

test('floating axes avoid an existing guided callout even when it is nearest the origin', () => {
  const placement = chooseFloatingAxisPlacement({
    board: { left: 100, right: 300, top: 180, bottom: 380 },
    safe: { left: 0, right: 400, top: 0, bottom: 520 },
    target: { x: 220, y: 390 },
    width: 80,
    height: 80,
    gap: 10,
    obstacles: [{ left: 150, right: 290, top: 390, bottom: 480 }],
  });

  assert.ok(placement);
  assert.notEqual(placement.side, 'bottom');
  assert.equal(overlaps(placement, { left: 150, right: 290, top: 390, bottom: 480 }), false);
});
