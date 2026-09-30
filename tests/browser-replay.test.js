// Plays a free-mode board to a win in headless Chrome and drives the success
// replay: it must rebuild the board step by step, lock normal input, pause and
// resume without skipping steps, return to the completion dialogue with the
// finished board, and let Keep Exploring start exactly one fresh board.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from './support/browser.js';
import { startStaticServer } from './support/static-server.js';
import { acquireHeavySlot, disposeAll } from './support/heavy-slot.js';
import {
  cellCenterOnScreen,
  digFirstCell,
  openGame,
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

function replayState(page) {
  return page.evaluate(() => {
    const game = window.__game;
    const state = game.successReplay;
    return {
      active: Boolean(state),
      index: state?.index ?? null,
      total: state?.replay.steps.length ?? null,
      paused: state?.paused ?? null,
      finished: state?.finished ?? null,
      hudVisible: !document.getElementById('replay-hud').classList.contains('hidden'),
      progress: document.getElementById('replay-hud-progress').textContent,
      toggle: document.getElementById('replay-toggle-label').textContent,
      pressed: document.getElementById('btn-replay-pause').getAttribute('aria-pressed'),
      bodyClass: document.body.classList.contains('replay-active'),
      locked: game.isInteractionLocked,
      dialogueOpen: !document.getElementById('tutorial-overlay').classList.contains('hidden'),
      revealedCubes: game.grid.flat(2).filter((cell) => cell.isRevealed).length,
    };
  });
}

test('a free-mode win replays step by step, pauses and resumes in place, and returns to the finished board', { timeout: 240_000 }, async () => {
  const page = await openGame(browser, server.url, { isolated: true, renderScale: 0.5 });
  try {
    await startFreeplay(page, 'easy');
    const config = await page.evaluate(() => window.__game.roomSnapshot.config);
    assert.deepEqual([config.width, config.height, config.depth, config.mineCount], [3, 3, 3, 3]);

    await digFirstCell(page, await cellCenterOnScreen(page, { x: 2, y: 2, z: 2 }));
    await waitForBoardSettled(page);
    if ((await page.evaluate(() => window.__game.roomSnapshot.phase)) !== 'won') {
      await page.click('#btn-auto-survey-start');
      await page.waitFor(() => window.__game.roomSnapshot.phase === 'won', { timeoutMs: 60_000, message: 'the survey to clear the board' });
    }
    await page.waitFor(() => !document.getElementById('tutorial-overlay').classList.contains('hidden')
      && !document.getElementById('btn-tutorial-replay').classList.contains('hidden'),
    { timeoutMs: 20_000, message: 'the completion dialogue with a replay button' });
    const finished = await page.evaluate(() => ({
      revealed: window.__game.roomSnapshot.revealed.length,
      steps: window.__game.roomSnapshot.replay.steps.length,
      locked: window.__game.isInteractionLocked,
    }));
    assert.ok(finished.steps >= 1);

    // The replay advances on timers every few hundred milliseconds, so pause it
    // straight away to leave the widest margin before its last step.
    await page.click('#btn-tutorial-replay');
    await page.waitFor(() => Boolean(window.__game.successReplay), { message: 'the replay to start' });
    await page.click('#btn-replay-pause');
    const paused = await replayState(page);
    assert.equal(paused.paused, true, 'the replay pauses before it ends');
    assert.ok(paused.index < paused.total, `paused at step ${paused.index} of ${paused.total}`);
    assert.equal(paused.total, finished.steps);
    assert.equal(paused.hudVisible, true);
    assert.equal(paused.bodyClass, true);
    assert.equal(paused.dialogueOpen, false, 'the dialogue steps aside for the replay');
    assert.equal(paused.locked, true, 'normal input is locked during the replay');
    assert.equal(paused.revealedCubes <= finished.revealed, true, 'the board is rebuilt from the start');
    assert.match(paused.progress, /^Step \d+ \/ \d+$/);
    assert.equal(paused.pressed, 'true');
    assert.equal(paused.toggle, 'Resume');

    // A click on the board during the replay must not act on the game.
    const [target] = await visibleCellTargets(page);
    if (target) {
      await withFrozenFrames(page, () => page.mouseClick(target.point.x, target.point.y, { button: 'right' }));
      assert.equal(await page.evaluate(() => window.__game.roomSnapshot.flags.length), 0);
    }
    await sleep(1_500);
    assert.equal((await replayState(page)).index, paused.index, 'no step plays while paused');

    await page.click('#btn-replay-pause');
    const resumed = await replayState(page);
    assert.equal(resumed.paused, false);
    assert.equal(resumed.pressed, 'false');
    assert.equal(resumed.toggle, 'Pause');
    assert.equal(resumed.index, paused.index, 'resuming continues from the same step');
    await page.waitFor((from) => window.__game.successReplay?.index > from, { args: [paused.index], message: 'the next step' });
    await page.waitFor(() => window.__game.successReplay?.finished === true, { timeoutMs: 30_000, message: 'the replay to finish' });
    assert.equal((await replayState(page)).progress, 'Successful route replay complete');

    await page.click('#btn-replay-exit');
    await page.waitFor(() => !window.__game.successReplay, { message: 'the replay to close' });
    await waitForBoardSettled(page);
    const exited = await replayState(page);
    assert.equal(exited.hudVisible, false);
    assert.equal(exited.bodyClass, false);
    assert.equal(exited.locked, finished.locked, 'the input lock returns to its state before the replay');
    assert.equal(exited.dialogueOpen, true, 'exiting returns to the completion dialogue');
    assert.equal(exited.revealedCubes, finished.revealed, 'the finished board is restored');

    const revision = await page.evaluate(() => window.__game.roomSnapshot.revision);
    await page.click('#btn-tutorial-next');
    await page.waitFor(() => window.__game.roomSnapshot.phase === 'ready', { message: 'a fresh board' });
    await sleep(800);
    const fresh = await page.evaluate(() => ({
      phase: window.__game.roomSnapshot.phase,
      revealed: window.__game.roomSnapshot.revealed.length,
      config: window.__game.roomSnapshot.config,
      restarts: window.__game.roomSnapshot.activity.filter((entry) => entry.key === 'restarted' || entry.type === 'restarted').length,
      revision: window.__game.roomSnapshot.revision,
      dialogueOpen: !document.getElementById('tutorial-overlay').classList.contains('hidden'),
    }));
    assert.equal(fresh.phase, 'ready');
    assert.equal(fresh.revealed, 0);
    assert.deepEqual(fresh.config, config, 'the difficulty and add-ons carry over');
    assert.equal(fresh.revision, revision + 1, 'Keep Exploring starts exactly one new board');
    assert.equal(fresh.dialogueOpen, false);
    assert.deepEqual(unexpectedPageProblems(page), { consoleErrors: [], pageErrors: [], failedRequests: [] });
  } finally {
    await page.close();
  }
});
