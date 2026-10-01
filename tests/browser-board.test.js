// Drives the real page in headless Chrome with WebGL. These tests protect the
// behaviour that depends on Three.js at runtime — building the board, picking
// cubes under the pointer, hover state, slicing, and camera controls — so a
// Three.js upgrade that changes any of it fails here instead of in players'
// hands. Picking is checked against a raster oracle (unique colour per cube),
// not against Three.js raycasting, so the check does not trust the code under test.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from './support/browser.js';
import { startStaticServer } from './support/static-server.js';
import { acquireHeavySlot, disposeAll } from './support/heavy-slot.js';
import {
  boardState,
  cellCenterOnScreen,
  clickCell,
  digFirstCell,
  openGame,
  rasterPickCells,
  settleCamera,
  sleep,
  startFreeplay,
  unexpectedPageProblems,
  visibleCellTargets,
  waitForBoardSettled,
  withFrozenFrames,
} from './support/game-page.js';

let browser;
let server;
let releaseSlot;

before(async () => {
  releaseSlot = await acquireHeavySlot();
  server = await startStaticServer();
  browser = await launchBrowser();
}, { timeout: 25 * 60_000 });

after(() => disposeAll(
  () => browser?.close(),
  () => server?.close(),
  () => releaseSlot?.(),
), { timeout: 120_000 });

const sameCell = (left, right) => Boolean(left && right)
  && left.x === right.x && left.y === right.y && left.z === right.z;

// Spread the probes across the visible cubes instead of testing only the front.
function spreadTargets(targets, count) {
  if (targets.length <= count) return targets;
  const step = (targets.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => targets[Math.round(index * step)]);
}

async function withFreeplayPage(options, fn) {
  const page = await openGame(browser, server.url, { isolated: true, renderScale: 0.5, ...options });
  try {
    await startFreeplay(page, options.mission ?? 'medium');
    await fn(page);
    assert.deepEqual(unexpectedPageProblems(page), { consoleErrors: [], pageErrors: [], failedRequests: [] });
  } finally {
    await page.close();
  }
}

function cellState(page, cell) {
  return page.evaluate(({ x, y, z }) => {
    const game = window.__game;
    const target = game.grid[x][y][z];
    return {
      flagged: target.isFlagged,
      flagMaterial: target.mesh.material === game.materials.cellFlagged
        || target.mesh.material === game.materials.cellFlaggedHovered,
      hasFlagMesh: Boolean(target.flagInstance && target.flagInstance.parent === target.group),
      revealed: target.isRevealed,
      meshVisible: target.mesh.visible,
    };
  }, cell);
}

async function setCameraPosition(page, position) {
  await page.evaluate(([x, y, z]) => {
    const game = window.__game;
    const damping = game.controls.enableDamping;
    game.controls.enableDamping = false;
    game.controls.target.set(0, 0, 0);
    game.camera.position.set(x, y, z);
    game.camera.lookAt(game.controls.target);
    game.controls.update();
    game.controls.enableDamping = damping;
  }, position);
}

const round = (values, digits = 3) => values.map((value) => Number(value.toFixed(digits)));

test('builds the free-mode matrix as one cube and one edge outline per cell, framed by the default camera', { timeout: 240_000 }, async () => {
  await withFreeplayPage({}, async (page) => {
    const scene = await page.evaluate(() => {
      const game = window.__game;
      const cells = game.grid.flat(2);
      game.camera.updateMatrixWorld();
      return {
        dimensions: [game.grid.length, game.grid[0].length, game.grid[0][0].length],
        cells: cells.length,
        groupsInScene: cells.every((cell) => cell.group.parent === game.scene && cell.group.visible),
        cubes: cells.every((cell) => cell.mesh.isMesh && cell.mesh.visible
          && cell.mesh.material === game.materials.cellUnrevealed
          && cell.mesh.userData.type === 'cell'),
        outlines: cells.every((cell) => cell.outline.isLineSegments && cell.outline.visible
          && cell.outline.material === game.materials.wireframe),
        onScreen: cells.every((cell) => {
          const ndc = cell.group.localToWorld(cell.mesh.position.clone()).project(game.camera);
          return Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9 && ndc.z < 1;
        }),
        camera: game.camera.position.toArray(),
        target: game.controls.target.toArray(),
      };
    });
    assert.deepEqual(scene.dimensions, [5, 5, 5]);
    assert.equal(scene.cells, 125);
    assert.equal(scene.groupsInScene, true);
    assert.equal(scene.cubes, true);
    assert.equal(scene.outlines, true);
    assert.equal(scene.onScreen, true, 'every cube centre projects inside the viewport');
    assert.deepEqual(round(scene.camera), [11, 9.9, 11]);
    assert.deepEqual(round(scene.target), [0, 0, 0]);

    // 61 cubes sit on the three faces toward the camera; from the default
    // corner view 40 of them show a clear patch around their own centre at
    // full resolution and 34 at the half resolution used here (the rest are
    // cut by neighbours along the silhouette diagonals).
    const visible = await visibleCellTargets(page);
    assert.ok(visible.length >= 30, `only ${visible.length} cubes are visible at their centre`);
    assert.ok(visible.every(({ cell }) => cell.x === 4 || cell.y === 4 || cell.z === 4),
      'only cubes on the camera-facing faces can be visible');
  });
});

test('a right click flags exactly the cube drawn under the pointer from front, side, and underside views', { timeout: 240_000 }, async () => {
  await withFreeplayPage({}, async (page) => {
    const views = [[11, 9.9, 11], [-11, 9.9, 11], [9, -12, -8]];
    for (const view of views) {
      await setCameraPosition(page, view);
      const targets = spreadTargets(await visibleCellTargets(page), 6);
      assert.ok(targets.length >= 4, `view ${view} exposes too few cubes`);
      await withFrozenFrames(page, async () => {
        for (const { cell, point } of targets) {
          await page.mouseClick(point.x, point.y, { button: 'right' });
          await page.waitFor((expected) => window.__game.roomSnapshot.flags
            .some(({ x, y, z }) => x === expected.x && y === expected.y && z === expected.z),
          { args: [cell], message: `flag on ${JSON.stringify(cell)} from ${view}` });
          const flagged = await boardState(page);
          assert.deepEqual(flagged.flags, [cell], `only the cube under the pointer is flagged from ${view}`);
          assert.deepEqual(await cellState(page, cell), {
            flagged: true, flagMaterial: true, hasFlagMesh: true, revealed: false, meshVisible: true,
          });

          await page.mouseClick(point.x, point.y, { button: 'right' });
          await page.waitFor(() => window.__game.roomSnapshot.flags.length === 0, { message: 'flag removal' });
          const cleared = await cellState(page, cell);
          assert.equal(cleared.flagged, false);
          assert.equal(cleared.hasFlagMesh, false);
        }
      });
    }
    const hud = await page.evaluate(() => document.getElementById('stat-mines').textContent.trim());
    assert.match(hud, /^0\s*\/\s*10$/);
  });
});

test('a left click digs the cube drawn under the pointer, passing through revealed number sprites', { timeout: 240_000 }, async () => {
  await withFreeplayPage({}, async (page) => {
    const first = { x: 4, y: 4, z: 4 };
    const point = await cellCenterOnScreen(page, first);
    await digFirstCell(page, point);
    await page.waitFor(() => window.__game.roomSnapshot.phase === 'playing', { message: 'the first dig' });
    const opened = await boardState(page);
    assert.deepEqual(opened.lastOpened[0], first, 'the dig starts at the clicked cube');
    assert.ok(opened.revealed.length > 1);
    await waitForBoardSettled(page);

    const numbers = await page.evaluate(() => {
      const game = window.__game;
      const snapshot = game.roomSnapshot;
      return snapshot.revealed.map(({ x, y, z, count }) => {
        const cell = game.grid[x][y][z];
        return {
          count,
          cubeHidden: !cell.mesh.visible,
          sprite: Boolean(cell.spriteInstance?.isSprite && cell.spriteInstance.parent === cell.group
            && cell.spriteInstance.material.map?.image?.width > 0),
        };
      });
    });
    assert.ok(numbers.every(({ cubeHidden }) => cubeHidden), 'opened cubes are no longer drawn');
    assert.ok(numbers.every(({ count, sprite }) => sprite === count > 0), 'every clue, and only clues, shows a number');

    // Find an unopened cube whose centre ray first meets a number sprite, so the
    // click has to pass through the number to reach it.
    const targets = await visibleCellTargets(page);
    const behindNumbers = await page.evaluate((candidates) => {
      const game = window.__game;
      const sprites = game.grid.flat(2).filter((cell) => cell.spriteInstance && cell.group.visible)
        .map((cell) => cell.spriteInstance);
      return candidates.filter(({ point: screen }) => {
        game.mouse.set((screen.x / window.innerWidth) * 2 - 1, -(screen.y / window.innerHeight) * 2 + 1);
        game.raycaster.setFromCamera(game.mouse, game.camera);
        return game.raycaster.intersectObjects(sprites).length > 0;
      });
    }, targets);
    assert.ok(behindNumbers.length > 0, 'the opened board leaves cubes behind number sprites');
    const target = behindNumbers[0];
    await clickCell(page, target.point);
    await page.waitFor((cell) => {
      const snapshot = window.__game.roomSnapshot;
      const hit = snapshot.pendingMine ?? snapshot.lastReveal?.opened?.[0];
      return hit && hit.x === cell.x && hit.y === cell.y && hit.z === cell.z;
    }, { args: [target.cell], message: `a dig at ${JSON.stringify(target.cell)}` });
  });
});

test('hovering highlights the cube under the pointer and leaving the board restores it', { timeout: 240_000 }, async () => {
  await withFreeplayPage({}, async (page) => {
    const [{ cell, point }] = await visibleCellTargets(page);
    await page.mouseMove(point.x, point.y);
    await page.waitFor((expected) => {
      const game = window.__game;
      const hovered = game.hoveredCell;
      return hovered && hovered.x === expected.x && hovered.y === expected.y && hovered.z === expected.z
        && hovered.mesh.material === game.materials.cellHovered
        && hovered.outline.material === game.materials.wireframeHovered;
    }, { args: [cell], message: 'hover highlight' });

    await page.mouseMove(1150, 420);
    await page.waitFor((expected) => {
      const game = window.__game;
      const target = game.grid[expected.x][expected.y][expected.z];
      return game.hoveredCell === null
        && target.mesh.material === game.materials.cellUnrevealed
        && target.outline.material === game.materials.wireframe;
    }, { args: [cell], message: 'hover cleared' });
  });
});

test('slicing hides cubes outside the range and clicks reach the layer it uncovers', { timeout: 240_000 }, async () => {
  await withFreeplayPage({}, async (page) => {
    const before = await visibleCellTargets(page);
    await page.evaluate(() => document.getElementById('slice-x-max').focus());
    await page.press('ArrowLeft');
    await page.press('ArrowLeft');
    const sliced = await page.evaluate(() => {
      const game = window.__game;
      return {
        slice: [game.slice.xMin, game.slice.xMax],
        label: document.getElementById('val-slice-x').textContent,
        visibility: game.grid.flat(2).every((cell) => cell.group.visible === cell.x <= 2),
      };
    });
    assert.deepEqual(sliced.slice, [0, 2]);
    assert.equal(sliced.label, '1–3');
    assert.equal(sliced.visibility, true, 'only x = 0..2 stays visible');

    const after = await visibleCellTargets(page);
    assert.ok(after.every(({ cell }) => cell.x <= 2));
    const uncovered = after.find(({ cell }) => cell.x === 2
      && !before.some((previous) => sameCell(previous.cell, cell)));
    assert.ok(uncovered, 'removing two layers exposes cubes that were hidden before');
    await clickCell(page, uncovered.point, { button: 'right' });
    await page.waitFor(() => window.__game.roomSnapshot.flags.length === 1, { message: 'flag on uncovered cube' });
    assert.deepEqual((await boardState(page)).flags, [uncovered.cell]);

    // A click where a hidden cube is drawn in the full board reaches the cube
    // behind it or nothing — never the hidden cube.
    const hiddenCube = await cellCenterOnScreen(page, { x: 4, y: 4, z: 4 });
    const [oracle] = await rasterPickCells(page, [hiddenCube]);
    await clickCell(page, hiddenCube, { button: 'right' });
    await sleep(200);
    const flags = (await boardState(page)).flags;
    assert.ok(!flags.some(({ x }) => x > 2), 'hidden cubes cannot be flagged');
    if (oracle.uniform && oracle.cell) assert.ok(flags.some((flag) => sameCell(flag, oracle.cell)));

    await page.click('#btn-reset-slices');
    assert.equal(await page.evaluate(() => window.__game.grid.flat(2).every((cell) => cell.group.visible)), true);
  });
});

test('right-dragging orbits the camera, the wheel zooms within limits, and reset restores the default view', { timeout: 240_000 }, async () => {
  await withFreeplayPage({}, async (page) => {
    const start = await settleCamera(page);
    const empty = { x: 1150, y: 420 };
    const [probe] = await rasterPickCells(page, [empty]);
    assert.equal(probe.cell, null, 'the drag starts on empty space');

    // Drags and wheel notches act inside their event handlers, so they run with
    // the render loop paused; settleCamera then plays out the damping.
    await withFrozenFrames(page, () => page.mouseDrag(empty, { x: empty.x - 180, y: empty.y + 40 }, { button: 'right', steps: 16 }));
    const orbited = await settleCamera(page);
    const angle = await page.evaluate(([a, b]) => {
      const [ax, ay, az] = a;
      const [bx, by, bz] = b;
      const dot = (ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz));
      return Math.acos(Math.min(1, Math.max(-1, dot)));
    }, [start.position, orbited.position]);
    assert.ok(angle > 0.3, `the camera orbited by ${angle.toFixed(3)} rad`);
    assert.ok(Math.abs(orbited.distance - start.distance) < 0.05, 'orbiting keeps the distance');
    assert.deepEqual(round(orbited.target), [0, 0, 0], 'the fixed centre does not pan');
    assert.equal((await boardState(page)).flags.length, 0, 'a right drag is not a right click');

    // One wheel notch is capped at 240 px and scales the distance by e^(±0.324),
    // so 8 notches in reach the 2-unit minimum from ~18.4 and 11 out reach the
    // 40-unit maximum from 2.
    await withFrozenFrames(page, () => page.mouseWheel(empty.x, empty.y, -240));
    const zoomedIn = await settleCamera(page);
    assert.ok(Math.abs(zoomedIn.distance / orbited.distance - Math.exp(-0.324)) < 0.01,
      `one notch zooms in by e^-0.324 (${zoomedIn.distance} from ${orbited.distance})`);
    await withFrozenFrames(page, async () => {
      for (let step = 0; step < 8; step += 1) await page.mouseWheel(empty.x, empty.y, -240);
    });
    assert.ok(Math.abs((await settleCamera(page)).distance - 2) < 1e-6, 'zoom stops at the minimum distance');
    await withFrozenFrames(page, async () => {
      for (let step = 0; step < 11; step += 1) await page.mouseWheel(empty.x, empty.y, 240);
    });
    assert.ok(Math.abs((await settleCamera(page)).distance - 40) < 1e-6, 'zoom stops at the maximum distance');

    await page.click('#btn-reset-camera');
    const reset = await settleCamera(page);
    assert.deepEqual(round(reset.position), [11, 9.9, 11]);
    assert.deepEqual(round(reset.target), [0, 0, 0]);
  });
});

test('resetting the view while the camera still eases after a drag lands exactly on the default view', { timeout: 240_000 }, async () => {
  await withFreeplayPage({}, async (page) => {
    const empty = { x: 1150, y: 420 };
    // With the render loop paused, the eased motion OrbitControls keeps after a
    // drag is still pending when Reset is pressed, as it is for a player who
    // resets right after flicking the board.
    await withFrozenFrames(page, async () => {
      await page.mouseDrag(empty, { x: empty.x - 220, y: empty.y + 60 }, { button: 'right', steps: 16 });
      await page.click('#btn-reset-camera');
    });
    const reset = await settleCamera(page);
    assert.deepEqual(round(reset.position), [11, 9.9, 11]);
    assert.deepEqual(round(reset.target), [0, 0, 0]);
  });
});

test('on a touch phone a tap digs the tapped cube once the double-tap window closes', { timeout: 240_000 }, async () => {
  await withFreeplayPage({ width: 390, height: 844, mobile: true, touch: true }, async (page) => {
    assert.equal(await page.evaluate(() => document.body.dataset.inputMode), 'touch');
    const first = { x: 4, y: 4, z: 4 };
    const [oracle] = await rasterPickCells(page, [await cellCenterOnScreen(page, first)]);
    assert.deepEqual(oracle.cell, first, 'the corner cube is drawn at its centre on the phone layout');
    const point = await cellCenterOnScreen(page, first);
    const tapped = Date.now();
    await digFirstCell(page, point, { touch: true });
    assert.ok(Date.now() - tapped >= 300, 'the first tap waits for a possible second tap');
    await page.waitFor(() => window.__game.roomSnapshot.phase === 'playing', { message: 'tap dig' });
    assert.deepEqual((await boardState(page)).lastOpened[0], first);
  });
});
