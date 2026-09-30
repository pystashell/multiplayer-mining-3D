// Game-specific helpers for the browser regression tests: boot the real page
// with a seeded Math.random and a frame clock the test controls, walk the lobby
// into a solo board, find where cubes are on screen, and read back pixels.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PUBLIC_DIRECTORY = fileURLToPath(new URL('../../public/', import.meta.url));
let browserCoverageFiles = 0;

const vendorManifest = JSON.parse(
  readFileSync(new URL('../../public/vendor/manifest.json', import.meta.url), 'utf8'),
);

// The page imports this exact URL, so a dynamic import in the page returns the
// same Three.js module instance the game uses.
export const THREE_MODULE_PATH = `/${vendorManifest.files.find((file) => /^vendor\/three-[^/]+\/build\/three\.module\.js$/.test(file))}`;
export const THREE_REVISION = String(Number(vendorManifest.packages.three.version.split('.')[1]));

// Browsers ask for /favicon.ico on their own; the game ships no icon, so the
// 404 is expected on every host, including production.
const EXPECTED_MISSING = [/\/favicon\.ico\b/];

// Three.js draws on Math.random for every object UUID, so how many numbers it
// consumes changes between releases. __holoReseed lets a test restart the
// sequence right before the first dig, which makes the mine layout depend on
// the seed alone.
function seededRandomScript(seed) {
  return `(() => {
  let state = ${Number(seed) >>> 0};
  Math.random = () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__holoReseed = (value) => { state = value >>> 0; };
})();`;
}

export const BOARD_SEED = 0x5eed2026;

// While frames are frozen, requestAnimationFrame callbacks wait in a queue and
// performance.now() can be pinned, so one frame can be rendered at a chosen
// time instead of whenever the browser schedules it.
const FRAME_CONTROL_SCRIPT = `(() => {
  const control = { frozen: false, now: null, queue: [] };
  const nativeRequest = window.requestAnimationFrame.bind(window);
  const nativeNow = performance.now.bind(performance);
  window.requestAnimationFrame = (callback) => {
    if (!control.frozen) return nativeRequest(callback);
    control.queue.push(callback);
    return 0;
  };
  performance.now = () => (control.now ?? nativeNow());
  control.release = () => {
    control.frozen = false;
    control.now = null;
    const queued = control.queue.splice(0);
    for (const callback of queued) nativeRequest(callback);
  };
  window.__holoFrames = control;
})();`;

const TEST_HOOK_SCRIPT = 'window.__holoSweeperTestHook = (game) => { window.__game = game; };';

function languageScript(language) {
  return `try { localStorage.setItem('holo-sweeper.language', ${JSON.stringify(language)}); } catch {}`;
}

// Under `npm run test:coverage` (NODE_V8_COVERAGE set), each page records V8
// block coverage and, when it closes, writes it next to Node's own coverage
// files with the served URLs mapped back to public/, so the report counts what
// the browser executed against the same source files.
async function writeBrowserCoverage(page, baseUrl, directory) {
  const scripts = await page.takeCoverage();
  const result = scripts.flatMap((script) => {
    if (!script.url.startsWith(`${baseUrl}/`)) return [];
    const { pathname } = new URL(script.url);
    const file = join(PUBLIC_DIRECTORY, decodeURIComponent(pathname));
    if (!file.startsWith(PUBLIC_DIRECTORY)) return [];
    return [{ ...script, url: pathToFileURL(file).href }];
  });
  mkdirSync(directory, { recursive: true });
  browserCoverageFiles += 1;
  writeFileSync(
    join(directory, `coverage-browser-${process.pid}-${Date.now()}-${browserCoverageFiles}.json`),
    JSON.stringify({ result }),
  );
}

export async function openGame(browser, baseUrl, {
  width = 1280,
  height = 720,
  mobile = false,
  touch = false,
  seed = 0x2f6b1a3d,
  language = 'en',
  path = '/',
  isolated = false,
  extraInitScripts = [],
  // Interaction tests may render at a lower resolution: picking and input use
  // CSS pixels, and software WebGL then keeps up. Leave null to keep the
  // production pixel ratio, as render and boot checks must.
  renderScale = null,
} = {}) {
  const page = await browser.newPage({
    width,
    height,
    mobile,
    touch,
    isolated,
    initScripts: [
      seededRandomScript(seed),
      FRAME_CONTROL_SCRIPT,
      TEST_HOOK_SCRIPT,
      ...(language ? [languageScript(language)] : []),
      ...extraInitScripts,
    ],
  });
  const coverageDirectory = process.env.NODE_V8_COVERAGE;
  if (coverageDirectory) {
    await page.startCoverage();
    const close = page.close.bind(page);
    page.close = async () => {
      try {
        await writeBrowserCoverage(page, baseUrl, coverageDirectory);
      } catch (error) {
        process.emitWarning(`Browser coverage was not recorded: ${error.message}`);
      }
      await close();
    };
  }
  await page.goto(`${baseUrl}${path}`);
  await page.waitFor(() => Boolean(window.__game?.renderer), { message: 'the game to boot' });
  if (renderScale !== null) {
    await page.evaluate((scale) => window.__game.renderer.setPixelRatio(scale), renderScale);
  }
  return page;
}

export function unexpectedPageProblems(page) {
  const expected = (entry) => EXPECTED_MISSING.some((pattern) => pattern.test(entry));
  return {
    consoleErrors: page.consoleErrors.filter((entry) => !expected(entry)),
    pageErrors: page.pageErrors,
    failedRequests: page.failedRequests.filter((entry) => !expected(entry)),
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function dismissDialogues(page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const open = await page.evaluate(() => !document.getElementById('tutorial-overlay').classList.contains('hidden'));
    if (!open) return;
    await page.click('#btn-tutorial-next');
    await sleep(150);
  }
  throw new Error('Guide dialogue did not close');
}

export async function startFreeplay(page, mission = 'medium') {
  await page.click('#btn-lobby-task');
  await page.click('#btn-task-freeplay');
  await page.click(`.task-mission-option[data-mission="${mission}"]`);
  await page.click('#btn-start-task');
  await page.waitFor(() => window.__game.roomSnapshot?.mode === 'solo'
    && document.getElementById('lobby-overlay').classList.contains('hidden'), { message: 'the solo board' });
  await dismissDialogues(page);
  await waitForBoardSettled(page);
}

export async function waitForBoardSettled(page) {
  await page.waitFor(() => {
    const game = window.__game;
    return game.grid.length === game.width
      && performance.now() >= game.revealAnimationEndsAt
      && game.cellRevealAnimations.length === 0
      && game.sectorPurgeAnimations.length === 0
      && game.particles.particles.length === 0;
  }, { timeoutMs: 20_000, message: 'board animations to finish' });
}

export function boardState(page) {
  return page.evaluate(() => {
    const game = window.__game;
    const snapshot = game.roomSnapshot;
    return {
      phase: snapshot.phase,
      config: snapshot.config,
      revealed: snapshot.revealed.map(({ x, y, z, count }) => ({ x, y, z, count })),
      flags: snapshot.flags.map(({ x, y, z }) => ({ x, y, z })),
      lastOpened: snapshot.lastReveal?.opened?.map(({ x, y, z }) => ({ x, y, z })) ?? [],
      pendingMine: snapshot.pendingMine,
    };
  });
}

export function cellCenterOnScreen(page, cell) {
  return page.evaluate(({ x, y, z }) => {
    const game = window.__game;
    const target = game.grid[x][y][z];
    game.camera.updateMatrixWorld();
    const ndc = target.group.localToWorld(target.mesh.position.clone()).project(game.camera);
    return { x: ((ndc.x + 1) / 2) * window.innerWidth, y: ((1 - ndc.y) / 2) * window.innerHeight };
  }, cell);
}

// Renders every pickable cube in a unique flat colour and reports which cube
// the rasterizer shows around each screen point. This is an oracle that does
// not use Three.js raycasting, so clicks can be checked against what is
// actually drawn. A point counts only when the square of about ±radius CSS
// pixels around it shows one cube, which keeps edge pixels out of the
// comparison at any render scale.
export function rasterPickCells(page, points, { radius = 2 } = {}) {
  return page.evaluate(async (threePath, requested, cssRadius) => {
    const THREE = await import(threePath);
    const game = window.__game;
    const { renderer, scene, camera } = game;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const scale = size.x / window.innerWidth;
    const windowRadius = Math.max(1, Math.round(cssRadius * scale));
    const target = new THREE.WebGLRenderTarget(size.x, size.y);
    const cellsById = [null];
    const materials = [];
    const restoreMaterial = [];
    const restoreVisibility = [];
    scene.traverse((object) => {
      const data = object.userData;
      const pickable = data?.type === 'cell' && object.visible;
      if (pickable) {
        const id = cellsById.length;
        cellsById.push({ x: data.x, y: data.y, z: data.z });
        const material = new THREE.MeshBasicMaterial({ fog: false, toneMapped: false });
        material.color.setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, 0, THREE.LinearSRGBColorSpace);
        materials.push(material);
        restoreMaterial.push([object, object.material]);
        object.material = material;
      } else if ((object.isMesh || object.isLine || object.isPoints || object.isSprite) && object.visible) {
        restoreVisibility.push(object);
        object.visible = false;
      }
    });
    const previousTarget = renderer.getRenderTarget();
    const previousClearAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousFog = scene.fog;
    const previousBackground = scene.background;
    const results = [];
    try {
      scene.fog = null;
      scene.background = null;
      renderer.autoClear = true;
      renderer.setClearAlpha(0);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const side = windowRadius * 2 + 1;
      const pixels = new Uint8Array(side * side * 4);
      for (const point of requested) {
        const px = Math.round(point.x * scale);
        const py = Math.round(size.y - 1 - point.y * scale);
        renderer.readRenderTargetPixels(target, px - windowRadius, py - windowRadius, side, side, pixels);
        const ids = new Set();
        for (let offset = 0; offset < pixels.length; offset += 4) {
          ids.add(pixels[offset] + (pixels[offset + 1] << 8));
        }
        const [id] = ids;
        results.push({ point, uniform: ids.size === 1, cell: ids.size === 1 ? cellsById[id] ?? null : null });
      }
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearAlpha(previousClearAlpha);
      renderer.autoClear = previousAutoClear;
      scene.fog = previousFog;
      scene.background = previousBackground;
      for (const [object, material] of restoreMaterial) object.material = material;
      for (const object of restoreVisibility) object.visible = true;
      for (const material of materials) material.dispose();
      target.dispose();
    }
    return results;
  }, THREE_MODULE_PATH, points, radius);
}

// Cubes whose own centre is visibly theirs on screen, ordered front to back.
export async function visibleCellTargets(page, { unrevealedOnly = true } = {}) {
  const candidates = await page.evaluate((onlyHidden) => {
    const game = window.__game;
    game.camera.updateMatrixWorld();
    const list = [];
    for (let x = 0; x < game.width; x += 1) {
      for (let y = 0; y < game.height; y += 1) {
        for (let z = 0; z < game.depth; z += 1) {
          const cell = game.grid[x][y][z];
          if (!cell.group.visible || !cell.mesh.visible || (onlyHidden && cell.isRevealed)) continue;
          const world = cell.group.localToWorld(cell.mesh.position.clone());
          const ndc = world.clone().project(game.camera);
          if (Math.abs(ndc.x) > 0.95 || Math.abs(ndc.y) > 0.95) continue;
          list.push({
            cell: { x, y, z },
            point: { x: ((ndc.x + 1) / 2) * window.innerWidth, y: ((1 - ndc.y) / 2) * window.innerHeight },
            distance: world.distanceTo(game.camera.position),
          });
        }
      }
    }
    return list.sort((a, b) => a.distance - b.distance);
  }, unrevealedOnly);
  const picks = await rasterPickCells(page, candidates.map(({ point }) => point));
  return candidates.filter((candidate, index) => {
    const seen = picks[index].cell;
    return picks[index].uniform && seen
      && seen.x === candidate.cell.x && seen.y === candidate.cell.y && seen.z === candidate.cell.z;
  });
}

export async function withFrozenFrames(page, fn, ...args) {
  await page.evaluate(() => { window.__holoFrames.frozen = true; });
  // Let the frame the browser already scheduled run once so the render loop
  // parks its next request in the queue.
  await page.waitFor(() => window.__holoFrames.queue.length > 0, { message: 'the render loop to park' });
  try {
    return await fn(...args);
  } finally {
    await page.evaluate(() => window.__holoFrames.release());
  }
}

// Software WebGL renders the board at a few frames per second, and browsers
// hold pointer moves until the next frame. Pausing the render loop while the
// input is sent keeps it at the pace a player gets from a real GPU, and keeps
// the pre-game cube drift still between locating a cube and clicking it.
export function clickCell(page, point, { button = 'left' } = {}) {
  return withFrozenFrames(page, () => page.mouseClick(point.x, point.y, { button }));
}

// The first dig places the mines. Reseeding inside the paused frame means
// nothing else can draw random numbers between the reseed and the placement.
export function digFirstCell(page, point, { seed = BOARD_SEED, touch = false } = {}) {
  return withFrozenFrames(page, async () => {
    await page.evaluate((value) => window.__holoReseed(value), seed);
    if (touch) await page.tap(point.x, point.y);
    else await page.mouseClick(point.x, point.y);
    // A tap digs only after the double-tap window, so keep the loop paused
    // until the room has placed its mines.
    await page.waitFor(() => window.__game.roomSnapshot.phase !== 'ready', { message: 'the first dig' });
  });
}

// OrbitControls damping advances once per rendered frame, which takes many
// seconds at software-rendering frame rates. Advance it directly until the
// camera stops, then report where it came to rest.
export function settleCamera(page) {
  return page.evaluate(() => {
    const { camera, controls } = window.__game;
    const previous = camera.position.clone();
    for (let frame = 0; frame < 5_000; frame += 1) {
      controls.update();
      if (camera.position.distanceToSquared(previous) < 1e-18) break;
      previous.copy(camera.position);
    }
    return {
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      distance: camera.position.distanceTo(controls.target),
    };
  });
}

// Runs one game frame at a fixed clock and summarizes what it drew as the mean
// RGBA of each block in a columns × rows grid laid over the board's on-screen
// bounds (plus a margin for markers and labels). Blocks of roughly 16 px keep
// antialiasing and font rasterization noise small while colour, lighting, and
// material changes still move the numbers. Values are premultiplied RGBA from
// the WebGL drawing buffer, before the page composites it.
export function renderFingerprint(page, { columns = 16, rows = 16, now = 100_000, margin = 0.12 } = {}) {
  return withFrozenFrames(page, () => page.evaluate((gridColumns, gridRows, frameTime, extra) => {
    const game = window.__game;
    const frames = window.__holoFrames;
    frames.now = frameTime;
    game.clock.getDelta();
    // Run every waiting callback, as one browser frame would: the interface
    // schedules its own layout work alongside the game's render loop.
    for (const callback of frames.queue.splice(0)) callback(frameTime);
    const gl = game.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Board bounds in drawing-buffer pixels, measured from the cube corners.
    let left = Infinity; let right = -Infinity; let top = Infinity; let bottom = -Infinity;
    const corner = game.camera.position.clone();
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corner.set(sx * game.width / 2, sy * game.height / 2, sz * game.depth / 2).project(game.camera);
          const px = ((corner.x + 1) / 2) * width;
          const py = ((1 - corner.y) / 2) * height;
          left = Math.min(left, px); right = Math.max(right, px);
          top = Math.min(top, py); bottom = Math.max(bottom, py);
        }
      }
    }
    const padX = (right - left) * extra;
    const padY = (bottom - top) * extra;
    const region = {
      x0: Math.max(0, Math.floor(left - padX)),
      x1: Math.min(width, Math.ceil(right + padX)),
      y0: Math.max(0, Math.floor(top - padY)),
      y1: Math.min(height, Math.ceil(bottom + padY)),
    };
    const blocks = [];
    for (let row = 0; row < gridRows; row += 1) {
      for (let column = 0; column < gridColumns; column += 1) {
        const x0 = region.x0 + Math.floor((column * (region.x1 - region.x0)) / gridColumns);
        const x1 = region.x0 + Math.floor(((column + 1) * (region.x1 - region.x0)) / gridColumns);
        const top0 = region.y0 + Math.floor((row * (region.y1 - region.y0)) / gridRows);
        const top1 = region.y0 + Math.floor(((row + 1) * (region.y1 - region.y0)) / gridRows);
        const sum = [0, 0, 0, 0];
        for (let y = top0; y < top1; y += 1) {
          // readPixels rows start at the bottom of the drawing buffer.
          const bufferRow = height - 1 - y;
          for (let x = x0; x < x1; x += 1) {
            const offset = (bufferRow * width + x) * 4;
            for (let channel = 0; channel < 4; channel += 1) sum[channel] += pixels[offset + channel];
          }
        }
        const count = Math.max(1, (x1 - x0) * (top1 - top0));
        blocks.push(sum.map((value) => Math.round((value / count) * 10) / 10));
      }
    }
    return { width, height, region, columns: gridColumns, rows: gridRows, blocks };
  }, columns, rows, now, margin));
}

export function compareFingerprints(actual, expected) {
  const sameRegion = ['x0', 'x1', 'y0', 'y1'].every((key) => actual.region?.[key] === expected.region?.[key]);
  if (actual.columns !== expected.columns || actual.rows !== expected.rows
    || actual.width !== expected.width || actual.height !== expected.height || !sameRegion) {
    return { comparable: false, meanDelta: Infinity, maxDelta: Infinity, worst: null };
  }
  let total = 0;
  let count = 0;
  let maxDelta = 0;
  let worst = null;
  actual.blocks.forEach((block, index) => {
    block.forEach((value, channel) => {
      const delta = Math.abs(value - expected.blocks[index][channel]);
      total += delta;
      count += 1;
      if (delta > maxDelta) {
        maxDelta = delta;
        worst = { block: index, channel, actual: value, expected: expected.blocks[index][channel] };
      }
    });
  });
  return { comparable: true, meanDelta: total / count, maxDelta, worst };
}
