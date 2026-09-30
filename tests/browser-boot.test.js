// Boots the real page in headless Chrome under the production Content
// Security Policy and checks what a dependency upgrade could break before any
// gameplay: every vendored file loads with the right type, the vendored
// Three.js revision is the one running, nothing logs a warning or error, and
// the bundled fonts load with the metrics the layout was designed around.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchBrowser } from './support/browser.js';
import { startStaticServer } from './support/static-server.js';
import { acquireHeavySlot, disposeAll } from './support/heavy-slot.js';
import {
  THREE_MODULE_PATH,
  THREE_REVISION,
  clickCell,
  cellCenterOnScreen,
  digFirstCell,
  openGame,
  startFreeplay,
  unexpectedPageProblems,
  visibleCellTargets,
  waitForBoardSettled,
} from './support/game-page.js';

const vendorManifest = JSON.parse(readFileSync(new URL('../public/vendor/manifest.json', import.meta.url), 'utf8'));
const headersSource = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const productionPolicy = headersSource.match(/Content-Security-Policy:\s*(.+)/)[1].trim();

// Advance width of one sample string at 40 px, measured with the vendored
// @fontsource files. A font update that changes these by more than 1% changes
// line lengths across the interface and needs a layout review.
const SAMPLE_TEXT = 'ZERO//DOMAIN 0123456789 Sector Purge';
const FONT_WIDTHS = Object.freeze({
  'Orbitron 800': 978.16,
  'Orbitron 900': 979.28,
  'Share Tech Mono 400': 777.6,
  'Inter 400': 802.21,
  'Inter 600': 818.14,
  'Inter 700': 826.11,
  'Inter 800': 835.88,
});

let browser;
let server;
let page;
let releaseSlot;

before(async () => {
  releaseSlot = await acquireHeavySlot();
  server = await startStaticServer();
  browser = await launchBrowser();
  page = await openGame(browser, server.url, { isolated: true });
  // Take the game far enough to load every module and draw every kind of
  // board object once: lobby, solo room, first dig, numbers, and a flag.
  await startFreeplay(page, 'medium');
  const corner = await cellCenterOnScreen(page, { x: 4, y: 4, z: 4 });
  await digFirstCell(page, corner);
  await page.waitFor(() => window.__game.roomSnapshot.phase === 'playing', { message: 'the first dig' });
  await waitForBoardSettled(page);
  const [target] = await visibleCellTargets(page);
  await clickCell(page, target.point, { button: 'right' });
  await page.waitFor(() => window.__game.roomSnapshot.flags.length === 1, { message: 'a flag' });
}, { timeout: 25 * 60_000 });

after(() => disposeAll(
  () => page?.close(),
  () => browser?.close(),
  () => server?.close(),
  () => releaseSlot?.(),
), { timeout: 120_000 });

test('serves the page with the production Content Security Policy and logs no errors or warnings', () => {
  const document = page.responses.find((response) => response.type === 'Document');
  assert.equal(document.status, 200);
  assert.equal(document.headers['Content-Security-Policy'] ?? document.headers['content-security-policy'], productionPolicy);
  assert.deepEqual(unexpectedPageProblems(page), { consoleErrors: [], pageErrors: [], failedRequests: [] });
  assert.deepEqual(page.consoleWarnings, [], 'deprecated or misused library APIs warn in the console');
});

test('loads the vendored Three.js modules and every font face with the right content types', () => {
  const loaded = new Map(page.responses.map((response) => [new URL(response.url).pathname, response]));
  const expected = vendorManifest.files.filter((file) => /\.(js|woff2)$/.test(file) && !file.startsWith('vendor/game-core/'));
  assert.ok(expected.length >= 9, 'the manifest lists the Three.js modules and seven font faces');
  for (const file of expected) {
    const response = loaded.get(`/${file}`);
    assert.ok(response, `${file} was never requested`);
    assert.equal(response.status, 200, file);
    assert.equal(response.mimeType, file.endsWith('.js') ? 'text/javascript' : 'font/woff2', file);
  }
  for (const file of vendorManifest.files.filter((entry) => entry.startsWith('vendor/game-core/'))) {
    assert.equal(loaded.get(`/${file}`)?.status, 200, `${file} powers solo rooms`);
  }
});

test('runs the vendored Three.js revision on a WebGL2 context with the game settings', { timeout: 240_000 }, async () => {
  const runtime = await page.evaluate(async (threePath) => {
    const THREE = await import(threePath);
    const { renderer, controls, camera, scene } = window.__game;
    const gl = renderer.getContext();
    const attributes = gl.getContextAttributes();
    return {
      revision: THREE.REVISION,
      webgl2: gl instanceof WebGL2RenderingContext,
      antialias: attributes.antialias,
      alpha: attributes.alpha,
      shadowMap: renderer.shadowMap.enabled,
      pixelRatio: renderer.getPixelRatio(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      fog: scene.fog?.isFogExp2 === true && scene.fog.density,
      controls: {
        damping: controls.enableDamping,
        dampingFactor: controls.dampingFactor,
        minDistance: controls.minDistance,
        maxDistance: controls.maxDistance,
        maxPolarAngle: controls.maxPolarAngle,
        left: controls.mouseButtons.LEFT,
        right: controls.mouseButtons.RIGHT === THREE.MOUSE.ROTATE,
        middle: controls.mouseButtons.MIDDLE === THREE.MOUSE.ROTATE,
        oneFinger: controls.touches.ONE === THREE.TOUCH.ROTATE,
        twoFingers: controls.touches.TWO === THREE.TOUCH.DOLLY_PAN,
      },
    };
  }, THREE_MODULE_PATH);
  assert.equal(runtime.revision, THREE_REVISION, 'the page runs the Three.js build the vendor manifest records');
  assert.deepEqual(runtime, {
    revision: THREE_REVISION,
    webgl2: true,
    antialias: true,
    alpha: true,
    shadowMap: true,
    pixelRatio: 1,
    fov: 60,
    near: 0.1,
    far: 1000,
    fog: 0.02,
    controls: {
      damping: true,
      dampingFactor: 0.05,
      minDistance: 2,
      maxDistance: 40,
      maxPolarAngle: Math.PI,
      left: null,
      right: true,
      middle: true,
      oneFinger: true,
      twoFingers: true,
    },
  });
});

test('loads every bundled font face and keeps its recorded text metrics', { timeout: 240_000 }, async () => {
  const fonts = await page.evaluate(async (sample, faces) => {
    await document.fonts.ready;
    const context = document.createElement('canvas').getContext('2d');
    const widths = {};
    for (const face of faces) {
      const [family, weight] = [face.slice(0, face.lastIndexOf(' ')), face.slice(face.lastIndexOf(' ') + 1)];
      context.font = `${weight} 40px "${family}", monospace`;
      widths[face] = context.measureText(sample).width;
    }
    return {
      status: [...document.fonts].map((face) => `${face.family} ${face.weight} ${face.status}`).sort(),
      widths,
    };
  }, SAMPLE_TEXT, Object.keys(FONT_WIDTHS));
  assert.deepEqual(fonts.status, Object.keys(FONT_WIDTHS).map((face) => `${face} loaded`).sort());
  for (const [face, expected] of Object.entries(FONT_WIDTHS)) {
    const drift = Math.abs(fonts.widths[face] - expected) / expected;
    assert.ok(drift <= 0.01, `${face} sample width ${fonts.widths[face].toFixed(2)} is ${(drift * 100).toFixed(2)}% from ${expected}`);
  }
});
