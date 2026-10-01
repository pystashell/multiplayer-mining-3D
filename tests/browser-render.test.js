// Compares what the game draws with fingerprints recorded from the shipped
// build (tests/fixtures/render-fingerprints.json). A library upgrade that
// shifts colour management, light units, or material shading changes these
// numbers even though nothing throws, so the upgrade has to reproduce the
// recorded look — or the visual change has to be reviewed and re-recorded
// with `npm run test:render-baseline`.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchBrowser } from './support/browser.js';
import { startStaticServer } from './support/static-server.js';
import { acquireHeavySlot, disposeAll } from './support/heavy-slot.js';
import { compareFingerprints } from './support/game-page.js';
import {
  RENDER_BASELINE_PATH,
  RENDER_SCENES,
  RENDER_VIEWPORT,
  captureRenderScenes,
} from './support/render-scenes.js';

const baseline = JSON.parse(readFileSync(RENDER_BASELINE_PATH, 'utf8'));

// Reruns on one machine differ by at most 0.2 in any block. Turning on sRGB
// output or physical light units — defaults Three.js changed after the
// recorded release — moves the mean by 0.7–4.8 and single blocks by 11–63.
const TOLERANCE = Object.freeze({ meanDelta: 0.6, maxDelta: 8 });

let browser;
let server;
let current;
let releaseSlot;

before(async () => {
  releaseSlot = await acquireHeavySlot();
  server = await startStaticServer();
  browser = await launchBrowser();
  current = await captureRenderScenes(browser, server.url);
}, { timeout: 25 * 60_000 });

after(() => disposeAll(
  () => browser?.close(),
  () => server?.close(),
  () => releaseSlot?.(),
), { timeout: 120_000 });

function describeDifference(name, comparison) {
  const { worst } = comparison;
  const channel = worst ? 'RGBA'[worst.channel] : '?';
  const block = worst ? `block ${worst.block} (row ${Math.floor(worst.block / 16)}, column ${worst.block % 16})` : 'n/a';
  return `${name} drifted from the recorded render: mean ${comparison.meanDelta.toFixed(2)} (limit ${TOLERANCE.meanDelta}), `
    + `max ${comparison.maxDelta.toFixed(1)} (limit ${TOLERANCE.maxDelta}) at ${block} ${channel} `
    + `${worst?.actual} vs ${worst?.expected}. Match the recorded look, or review the change and re-record it.`;
}

test('the recorded baseline covers every render scene with the board drawn', () => {
  assert.deepEqual(Object.keys(baseline.scenes), RENDER_SCENES);
  assert.deepEqual(baseline.viewport, RENDER_VIEWPORT);
  for (const [name, fingerprint] of Object.entries(baseline.scenes)) {
    // 256 blocks cover the board's bounds; an empty or blank capture would
    // make every comparison pass, so each scene must actually show the board.
    const drawn = fingerprint.blocks.filter((block) => block[3] > 0).length;
    assert.ok(drawn >= 50, `${name} baseline has only ${drawn} drawn blocks`);
  }
});

for (const name of RENDER_SCENES) {
  test(`the ${name} scene renders like the recorded baseline`, () => {
    const comparison = compareFingerprints(current.fingerprints[name], baseline.scenes[name]);
    assert.equal(comparison.comparable, true, `${name} must use the same viewport and on-screen board bounds`);
    assert.ok(
      comparison.meanDelta <= TOLERANCE.meanDelta && comparison.maxDelta <= TOLERANCE.maxDelta,
      describeDifference(name, comparison),
    );
  });
}

test('rendering the scenes logs no errors and loads every requested file', () => {
  assert.deepEqual(current.problems, { consoleErrors: [], pageErrors: [], failedRequests: [] });
});

test('the comparison notices a lighting change the size of the Three.js light-unit switch', { timeout: 240_000 }, async () => {
  // Scaling every light by π is the adjustment Three.js asked for when it
  // dropped legacy light units; the fingerprint must notice a shift that big.
  const brighterLights = `(() => {
    const record = window.__holoSweeperTestHook;
    window.__holoSweeperTestHook = (game) => {
      record(game);
      game.scene.traverse((object) => { if (object.isLight) object.intensity *= Math.PI; });
    };
  })();`;
  const changed = await captureRenderScenes(browser, server.url, {
    extraInitScripts: [brighterLights],
    only: ['fresh-matrix'],
  });
  const comparison = compareFingerprints(changed.fingerprints['fresh-matrix'], baseline.scenes['fresh-matrix']);
  assert.equal(comparison.comparable, true);
  assert.ok(comparison.maxDelta > TOLERANCE.maxDelta * 2,
    `a π× light change only moved the render by ${comparison.maxDelta.toFixed(1)}`);
});
