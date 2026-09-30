// Two isolated browser profiles play one squad against the real Worker
// (`wrangler dev --local`), so the browser WebSocket client, the multiplayer
// interface, and the Durable Object are exercised together the way players
// meet them. This is the automated form of the manual two-client revive check.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from './support/browser.js';
import { startWranglerDev } from './support/wrangler-dev.js';
import { acquireHeavySlot, disposeAll } from './support/heavy-slot.js';
import {
  clickCell,
  openGame,
  unexpectedPageProblems,
  visibleCellTargets,
  waitForBoardSettled,
} from './support/game-page.js';

const ONLINE_DOT = 'rgb(41, 231, 255)';

let dev;
let browser;
let releaseSlot;

before(async () => {
  releaseSlot = await acquireHeavySlot();
  dev = await startWranglerDev();
  browser = await launchBrowser();
}, { timeout: 25 * 60_000 });

after(() => disposeAll(
  () => browser?.close(),
  () => dev?.close(),
  () => releaseSlot?.(),
), { timeout: 120_000 });

function squadList(page) {
  return page.evaluate((onlineColour) => [...document.querySelectorAll('#player-list-ul > li')].map((item) => ({
    name: item.textContent.replace(/^●\s*/, '').replace(/\s*👑$/, ''),
    online: item.firstChild.style.color === onlineColour,
    host: item.textContent.endsWith('👑'),
  })), ONLINE_DOT);
}

function reviveDialog(page) {
  return page.evaluate(() => ({
    open: !document.getElementById('ad-modal-overlay').classList.contains('hidden'),
    title: document.getElementById('ad-modal-title').textContent,
    message: document.getElementById('ad-modal-message').textContent,
    button: document.getElementById('btn-watch-ad').innerText,
    buttonDisabled: document.getElementById('btn-watch-ad').disabled,
    endVisible: document.getElementById('btn-ad-die').style.display !== 'none',
    phase: window.__game.roomSnapshot.phase,
  }));
}

test('two browsers share a squad: the joiner is online at once and one revive countdown locks both until the alarm ends it', { timeout: 240_000 }, async () => {
  const host = await openGame(browser, dev.url, { isolated: true, seed: 11, renderScale: 0.5 });
  let guest;
  try {
    await host.click('#btn-lobby-multiplayer');
    await host.click('#btn-create-room');
    const code = await host.waitFor(() => window.__game.roomSnapshot?.mode === 'squad' && window.__game.roomSnapshot.code,
      { message: 'the squad room' });
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(await host.evaluate(() => new URL(location.href).searchParams.get('room')), code);

    guest = await openGame(browser, dev.url, { isolated: true, seed: 22, renderScale: 0.5, path: `/?room=${code}` });
    assert.equal(await guest.evaluate(() => document.getElementById('input-room').value), code, 'the invite link fills the code');
    await guest.click('#btn-join-room');
    await guest.waitFor(() => window.__game.roomSnapshot?.players?.length === 2, { message: 'the guest to join' });

    // Both interfaces list both players as online without anyone acting first.
    for (const page of [host, guest]) {
      await page.waitFor(() => document.querySelectorAll('#player-list-ul > li').length === 2, { message: 'two squad members' });
      const members = await squadList(page);
      assert.deepEqual(members.map(({ online }) => online), [true, true], JSON.stringify(members));
      assert.deepEqual(members.map(({ host: isHost }) => isHost), [true, false]);
    }
    const [hostName, guestName] = (await squadList(host)).map(({ name }) => name);
    assert.notEqual(hostName, guestName);

    // A dense board makes the second dig almost certainly hit a mine.
    await host.evaluate(() => window.__game.roomClient.send({
      op: 'restart',
      config: { width: 3, height: 3, depth: 3, mineCount: 16, autoPurge: false, reduction: false },
    }));
    for (const page of [host, guest]) {
      await page.waitFor(() => window.__game.roomSnapshot.config.mineCount === 16 && window.__game.grid.length === 3,
        { message: 'the dense board' });
      await waitForBoardSettled(page);
    }
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const revision = await host.evaluate(() => window.__game.roomSnapshot.revision);
      const [target] = await visibleCellTargets(host);
      await clickCell(host, target.point);
      await host.waitFor((previous) => window.__game.roomSnapshot.revision !== previous,
        { args: [revision], message: 'the dig to land' });
      if ((await host.evaluate(() => window.__game.roomSnapshot.phase)) === 'revive') break;
      await waitForBoardSettled(host);
    }

    for (const page of [host, guest]) {
      await page.waitFor(() => !document.getElementById('ad-modal-overlay').classList.contains('hidden'),
        { message: 'the revive prompt' });
      const prompt = await reviveDialog(page);
      assert.equal(prompt.phase, 'revive');
      assert.equal(prompt.title, 'Revive with an Ad?');
      assert.equal(prompt.buttonDisabled, false);
      assert.equal(prompt.endVisible, true);
    }

    await guest.click('#btn-watch-ad');
    const seen = new Map();
    for (const page of [host, guest]) {
      await page.waitFor(() => /Ad playing \(\d+\)/.test(document.getElementById('btn-watch-ad').innerText),
        { message: 'the shared countdown' });
      const countdown = await reviveDialog(page);
      assert.equal(countdown.title, 'SQUAD AD SYNC');
      assert.equal(countdown.buttonDisabled, true);
      assert.equal(countdown.endVisible, false, 'nobody can end the game during the countdown');
      seen.set(page, Number(countdown.button.match(/\((\d+)\)/)[1]));
      const covered = await page.evaluate(() => {
        const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        return hit?.tagName !== 'CANVAS';
      });
      assert.equal(covered, true, 'the dialog covers the board while the squad watches');
    }
    assert.match((await reviveDialog(guest)).message, /^You chose to watch the ad/);
    assert.equal((await reviveDialog(host)).message.includes(guestName), true, 'the host sees who started the ad');
    for (const seconds of seen.values()) assert.ok(seconds >= 1 && seconds <= 10, `countdown shows ${seconds}`);

    const started = Date.now();
    for (const page of [host, guest]) {
      await page.waitFor(() => document.getElementById('ad-modal-overlay').classList.contains('hidden')
        && window.__game.roomSnapshot.phase === 'playing', { timeoutMs: 20_000, message: 'the revive to finish' });
    }
    assert.ok(Date.now() - started >= 6_000, 'the countdown ran instead of ending at once');
    for (const page of [host, guest]) {
      const board = await page.evaluate(() => ({
        pendingMine: window.__game.roomSnapshot.pendingMine,
        locked: window.__game.isInteractionLocked || window.__game.isGameOver,
      }));
      assert.deepEqual(board, { pendingMine: null, locked: false }, 'both players can act again');
      assert.deepEqual(unexpectedPageProblems(page), { consoleErrors: [], pageErrors: [], failedRequests: [] });
    }
  } finally {
    await guest?.close();
    await host.close();
  }
});
