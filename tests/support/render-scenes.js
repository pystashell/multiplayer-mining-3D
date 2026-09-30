// Deterministic scenes for render fingerprints. One seeded free-mode board is
// walked through the states that exercise every material family the game
// draws: translucent cubes, edges, flags, hover highlights, number sprites,
// the number focus marker, and solver-hint markers with coordinate labels.
// Every capture renders one game frame at a pinned clock, so animated pulses
// and the pre-game drift are identical between runs.
import {
  boardState,
  cellCenterOnScreen,
  digFirstCell,
  openGame,
  renderFingerprint,
  startFreeplay,
  unexpectedPageProblems,
  visibleCellTargets,
  waitForBoardSettled,
  withFrozenFrames,
} from './game-page.js';

export const RENDER_BASELINE_PATH = new URL('../fixtures/render-fingerprints.json', import.meta.url);
export const RENDER_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
export const RENDER_SCENES = Object.freeze([
  'fresh-matrix',
  'flags-and-hover',
  'opened-matrix',
  'number-focus',
  'solver-hint',
]);

// A spot on the canvas that shows no cube in the default view.
const EMPTY_SPOT = Object.freeze({ x: 1150, y: 420 });

async function restPointer(page) {
  await withFrozenFrames(page, () => page.mouseMove(EMPTY_SPOT.x, EMPTY_SPOT.y));
  await page.waitFor(() => window.__game.hoveredCell === null && window.__game.hoveredNumberCell === null,
    { message: 'the pointer to leave the board' });
}

async function rightClick(page, point, expectFlagCount) {
  await withFrozenFrames(page, () => page.mouseClick(point.x, point.y, { button: 'right' }));
  await page.waitFor((count) => window.__game.roomSnapshot.flags.length === count,
    { args: [expectFlagCount], message: `${expectFlagCount} flags` });
}

// Captures the scenes in order on one page and returns their fingerprints.
// `extraInitScripts` lets a caller alter the page before it boots, which the
// tests use to prove the fingerprints notice real rendering changes; `only`
// stops once the listed scenes are captured.
export async function captureRenderScenes(browser, baseUrl, { extraInitScripts = [], only = RENDER_SCENES } = {}) {
  const page = await openGame(browser, baseUrl, { isolated: true, ...RENDER_VIEWPORT, extraInitScripts });
  const fingerprints = {};
  const done = () => only.every((name) => name in fingerprints);
  try {
    await startFreeplay(page, 'medium');
    await restPointer(page);
    fingerprints['fresh-matrix'] = await renderFingerprint(page);
    if (done()) return { fingerprints, problems: unexpectedPageProblems(page) };

    const targets = await visibleCellTargets(page);
    const [flagA, flagB, hovered] = [targets[5], targets[12], targets[8]];
    await rightClick(page, flagA.point, 1);
    await rightClick(page, flagB.point, 2);
    await withFrozenFrames(page, () => page.mouseMove(hovered.point.x, hovered.point.y));
    await page.waitFor((cell) => {
      const hover = window.__game.hoveredCell;
      return hover && hover.x === cell.x && hover.y === cell.y && hover.z === cell.z;
    }, { args: [hovered.cell], message: 'hover highlight' });
    fingerprints['flags-and-hover'] = await renderFingerprint(page);
    await rightClick(page, flagA.point, 1);
    await rightClick(page, flagB.point, 0);
    await restPointer(page);

    const corner = await cellCenterOnScreen(page, { x: 4, y: 4, z: 4 });
    await digFirstCell(page, corner);
    await page.waitFor(() => window.__game.roomSnapshot.phase === 'playing', { message: 'the first dig' });
    await waitForBoardSettled(page);
    await restPointer(page);
    fingerprints['opened-matrix'] = await renderFingerprint(page);

    // Number focus needs the pointer on an opaque pixel of the digit, so search
    // around each clue for a point the game itself resolves to that number.
    const numberPoint = await page.evaluate(() => {
      const game = window.__game;
      game.camera.updateMatrixWorld();
      const clues = game.grid.flat(2).filter((cell) => cell.spriteInstance && cell.group.visible);
      for (const cell of clues) {
        const ndc = cell.group.localToWorld(cell.spriteInstance.position.clone()).project(game.camera);
        const centre = { x: ((ndc.x + 1) / 2) * window.innerWidth, y: ((1 - ndc.y) / 2) * window.innerHeight };
        for (let radius = 0; radius <= 8; radius += 2) {
          for (let dx = -radius; dx <= radius; dx += 2) {
            for (let dy = -radius; dy <= radius; dy += 2) {
              const point = { clientX: centre.x + dx, clientY: centre.y + dy };
              const target = game.pickTwoButtonTargetAtPointer(point);
              if (target?.type === 'number' && target.x === cell.x && target.y === cell.y && target.z === cell.z) {
                return { x: point.clientX, y: point.clientY };
              }
            }
          }
        }
      }
      return null;
    });
    if (!numberPoint) throw new Error('No clue number on the opened board can take pointer focus');
    await withFrozenFrames(page, () => page.mouseMove(numberPoint.x, numberPoint.y));
    await page.waitFor(() => window.__game.hoveredNumberCell !== null, { message: 'number focus' });
    fingerprints['number-focus'] = await renderFingerprint(page);
    await restPointer(page);

    await page.click('#btn-request-solver-hint');
    await page.waitFor(() => Boolean(window.__game.solverHint?.target && window.__game.solverHintMarker),
      { timeoutMs: 30_000, message: 'a solver hint' });
    await restPointer(page);
    fingerprints['solver-hint'] = await renderFingerprint(page);

    const state = await boardState(page);
    if (state.phase !== 'playing') throw new Error(`Render scenes ended in phase ${state.phase}`);
    return { fingerprints, problems: unexpectedPageProblems(page) };
  } finally {
    await page.close();
  }
}
