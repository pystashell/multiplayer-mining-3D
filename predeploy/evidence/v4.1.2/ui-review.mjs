// v4.1.2 web UI review probes. Each part drives the real page in headless
// Chrome (SwiftShader WebGL) through the scenarios of
// config/predeploy-ui-checklist.json, records its assertions in results.json,
// and saves viewport screenshots next to this file for visual review.
//
//   node predeploy/evidence/v4.1.2/ui-review.mjs <base-url> <part> [...parts]
//
// The base URL is a local `wrangler dev` server on the release sources. The
// pages load the browser-test init scripts from tests/support/game-page.js:
// a seeded Math.random, a render-loop pause used only while input is sent,
// and a hook exposing the running game as window.__game. Board actions use
// real mouse, touch, and keyboard input; the few setup steps that go through
// the game's own room client instead are named in README.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { launchBrowser } from '../../../tests/support/browser.js';
import {
  cellCenterOnScreen,
  clickCell,
  digFirstCell,
  openGame,
  rasterPickCells,
  settleCamera,
  startFreeplay,
  visibleCellTargets,
  waitForBoardSettled,
  withFrozenFrames,
} from '../../../tests/support/game-page.js';
import { GUIDE_ART, guideCharacterText } from '../../../public/guide-character.js';

const HERE = new URL('./', import.meta.url);
const RESULTS = new URL('results.json', HERE);
export const VIEWPORTS = Object.freeze({
  'desktop-wide': { width: 1440, height: 900 },
  'desktop-compact': { width: 1280, height: 720 },
  'mobile-standard': { width: 390, height: 844, mobile: true, touch: true },
  'mobile-small': { width: 360, height: 640, mobile: true, touch: true },
});

const [baseUrl, ...parts] = process.argv.slice(2);
if (!baseUrl || !parts.length) throw new Error('usage: ui-review.mjs <base-url> <part> [...parts]');
const ORIGIN = new URL(baseUrl).origin;

// The project's retired-identity rules, applied to what the dialogue shows.
const CONTENT_POLICY = JSON.parse(readFileSync(new URL('../../../config/content-policy.json', import.meta.url), 'utf8'));
const FORBIDDEN = CONTENT_POLICY.forbiddenRules.map((rule) => ({ id: rule.id, pattern: new RegExp(rule.expression, rule.flags ?? 'iu') }));
const retiredTerms = (text) => FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id);

const results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function scenario(id) {
  results[id] ??= { checks: [], screenshots: [] };
  const entry = results[id];
  return {
    check(name, pass, detail = null) {
      entry.checks = entry.checks.filter((existing) => existing.name !== name);
      entry.checks.push({ name, pass: Boolean(pass), ...(detail === null ? {} : { detail }) });
      if (!pass) console.log(`  FAIL ${id}: ${name} ${detail === null ? '' : JSON.stringify(detail).slice(0, 600)}`);
    },
    note(name, value) {
      entry.notes ??= {};
      entry.notes[name] = value;
    },
    async shot(page, name) {
      const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
      writeFileSync(new URL(`${name}.jpg`, HERE), Buffer.from(data, 'base64'));
      if (!entry.screenshots.includes(`${name}.jpg`)) entry.screenshots.push(`${name}.jpg`);
    },
  };
}

// Runs one review case; an exception fails that case instead of the run.
async function runCase(id, name, fn) {
  try {
    await fn();
    scenario(id).check(`${name}: completed without an exception`, true);
  } catch (error) {
    scenario(id).check(`${name}: completed without an exception`, false, String(error?.stack ?? error).slice(0, 1200));
  }
}

// Every page a part opens goes through here, and its console, network, and
// WebSocket traffic is audited for console-network-clean when it closes.
async function open(browser, label, profile, options = {}) {
  const page = await openGame(browser, baseUrl, { isolated: true, ...VIEWPORTS[profile], ...options });
  page.label = label;
  page.sockets = [];
  page.connection.on((message) => {
    if (message.sessionId !== page.sessionId) return;
    if (message.method === 'Network.webSocketCreated') page.sockets.push({ url: message.params.url, frames: [] });
    if (message.method === 'Network.webSocketFrameReceived') page.sockets.at(-1)?.frames.push(message.params.response.payloadData);
    if (message.method === 'Network.webSocketFrameError') page.failedRequests.push(`websocket: ${message.params.errorMessage}`);
  });
  return page;
}

async function closeAudited(page) {
  const record = scenario('console-network-clean');
  const label = page.label;
  const urls = page.responses.map((response) => response.url);
  const external = urls.filter((url) => /^(https?|wss?):/.test(url) && new URL(url).origin !== ORIGIN);
  const secretPattern = /token|secret|api[_-]?key|password|authorization|bearer/i;
  const exposed = [...urls, ...page.sockets.map((socket) => socket.url), ...page.consoleErrors, ...page.consoleWarnings]
    .filter((text) => secretPattern.test(text));
  record.check(`${label}: no uncaught exceptions`, page.pageErrors.length === 0, page.pageErrors);
  record.check(`${label}: no console errors or warnings`, !page.consoleErrors.length && !page.consoleWarnings.length,
    { errors: page.consoleErrors, warnings: page.consoleWarnings });
  record.check(`${label}: no failed requests`, page.failedRequests.length === 0, page.failedRequests);
  record.check(`${label}: no third-party runtime requests`, external.length === 0, external);
  record.check(`${label}: no keys or tokens in URLs or logs`, exposed.length === 0, exposed);
  if (page.sockets.length) {
    // The public snapshot lists mines only once a squad has lost (the final
    // reveal); before that the layout stays on the server.
    const frames = page.sockets.flatMap((socket) => socket.frames);
    const leaks = frames.filter((payload) => {
      try {
        const { snapshot } = JSON.parse(payload);
        return Boolean(snapshot?.mines?.length) && snapshot.phase !== 'lost';
      } catch {
        return false;
      }
    });
    record.check(`${label}: room socket stays same-origin and never sends the mine layout`,
      page.sockets.every((socket) => new URL(socket.url).host === new URL(ORIGIN).host) && leaks.length === 0,
      { sockets: page.sockets.map((socket) => socket.url), frames: frames.length, leaks: leaks.length });
  }
  const counts = results['console-network-clean'].notes?.requests ?? {};
  counts[label] = urls.length;
  record.note('requests', counts);
  await page.close();
}

const SHIFT = 8;
const KEY_CODES = Object.freeze({ Tab: 9, Enter: 13, Escape: 27, Space: 32 });
async function key(page, name, { shift = false } = {}) {
  const event = {
    key: name === 'Space' ? ' ' : name,
    code: name,
    windowsVirtualKeyCode: KEY_CODES[name],
    nativeVirtualKeyCode: KEY_CODES[name],
    modifiers: shift ? SHIFT : 0,
  };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event });
  if (name === 'Enter' || name === 'Space') {
    await page.send('Input.dispatchKeyEvent', { type: 'char', ...event, text: name === 'Space' ? ' ' : '\r' });
  }
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
}

function focused(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return { id: 'body', name: '', visible: false, ring: false };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const name = (element.getAttribute('aria-label') || element.labels?.[0]?.innerText || element.innerText
      || element.getAttribute('title') || element.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ');
    return {
      id: element.id || `${element.tagName.toLowerCase()}.${element.className}`.slice(0, 60),
      name: name.slice(0, 60),
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
      ring: (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none',
    };
  });
}

async function focusStaysIn(page, selector, forward = 16, backward = 6) {
  const escapes = [];
  for (let step = 0; step < forward + backward; step += 1) {
    await key(page, 'Tab', { shift: step >= forward });
    const inside = await page.evaluate((css) => document.querySelector(css).contains(document.activeElement), selector);
    if (!inside) escapes.push({ step: step + 1, focus: await focused(page) });
  }
  return { steps: forward + backward, escapes };
}

async function tabTo(page, selector, { limit = 60 } = {}) {
  const path = [];
  for (let step = 0; step < limit; step += 1) {
    await key(page, 'Tab');
    path.push((await focused(page)).id);
    if (await page.evaluate((css) => document.activeElement?.matches(css) ?? false, selector)) return path;
  }
  throw new Error(`Tab never reached ${selector}: ${path.join(' > ')}`);
}

const hidden = (page, id) => page.evaluate((elementId) => document.getElementById(elementId).classList.contains('hidden'), id);

// Facts about whatever the lobby currently shows.
function lobbyFacts(page) {
  return page.evaluate(() => {
    const visible = (element) => element && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden';
    const lobby = document.getElementById('lobby-modal');
    const text = lobby.innerText;
    const controls = [...lobby.querySelectorAll('button, input')].filter(visible);
    const outside = controls.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > window.innerWidth + 1;
    }).map((element) => element.id || element.textContent.trim().slice(0, 24));
    const clipped = [...lobby.querySelectorAll('button, h1, h2, h3, p, span, strong, small, label')]
      .filter(visible)
      .filter((element) => {
        const style = getComputedStyle(element);
        const hides = ['hidden', 'clip'].includes(style.overflowX) || style.textOverflow === 'ellipsis';
        return hides && element.scrollWidth > element.clientWidth + 1;
      })
      .map((element) => element.id || element.textContent.trim().slice(0, 24));
    // Text (not padding) of the protocol label against the corner buttons.
    const range = document.createRange();
    range.selectNodeContents(lobby.querySelector('.lobby-protocol'));
    const labelBoxes = [...range.getClientRects()];
    const coveredBy = ['btn-control-settings-lobby', 'btn-language-toggle-lobby'].filter((id) => {
      const button = document.getElementById(id).getBoundingClientRect();
      return labelBoxes.some((box) => box.left < button.right && button.left < box.right
        && box.top < button.bottom && button.top < box.bottom);
    });
    const toggles = ['btn-language-toggle-lobby'].map((id) => document.getElementById(id)?.innerText ?? '');
    let cjkOutsideToggle = text;
    for (const label of toggles) cjkOutsideToggle = cjkOutsideToggle.replace(label, '');
    return {
      lang: document.documentElement.lang,
      title: document.getElementById('lobby-title')?.innerText.trim(),
      text,
      templateMarkers: /\{\{|\}\}|guide\./.test(text),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      controlsOutsideViewport: outside,
      clippedText: clipped,
      protocolLabelCoveredBy: coveredBy,
      cjkCharacters: (cjkOutsideToggle.match(/[㐀-鿿]/g) ?? []).length,
    };
  });
}

// Scrolls the lobby to its end and reports whether the main actions can be
// reached and are not covered by anything.
function lobbyReach(page, ids) {
  return page.evaluate(async (wanted) => {
    const overlay = document.getElementById('lobby-overlay');
    const scrollers = [overlay, document.getElementById('lobby-modal'), document.scrollingElement]
      .filter((element) => element && element.scrollHeight > element.clientHeight + 1);
    for (const element of scrollers) element.scrollTop = element.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const reachable = {};
    for (const id of wanted) {
      const element = document.getElementById(id);
      if (!element || !element.getClientRects().length) { reachable[id] = 'hidden'; continue; }
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      reachable[id] = hit === element || element.contains(hit);
    }
    for (const element of scrollers) element.scrollTop = 0;
    return { scrollable: scrollers.map((element) => element.id || element.tagName), reachable };
  }, ids);
}

// Layout facts about the guide dialogue as it is drawn now.
function dialogueFacts(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById('tutorial-overlay');
    const game = window.__game;
    const inView = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.top >= -1
        && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    };
    const onTop = (element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 10));
      return Boolean(hit && (hit === element || element.contains(hit)));
    };
    const clips = (element) => element.scrollHeight > element.clientHeight + 1
      && !['auto', 'scroll'].includes(getComputedStyle(element).overflowY);
    const art = document.getElementById('tutorial-art');
    const message = document.getElementById('tutorial-message');
    const dialog = overlay.querySelector('.tutorial-dialog');
    const content = overlay.querySelector('.tutorial-content');
    const next = document.getElementById('btn-tutorial-next');
    const step = game.dialogueState?.steps?.[game.dialogueState.index];
    return {
      open: !overlay.classList.contains('hidden'),
      index: game.dialogueState?.index ?? null,
      steps: game.dialogueState?.steps?.length ?? null,
      explicit: Boolean(step?.requiresExplicit),
      waitingAction: game.waitingTutorialAction ?? null,
      kicker: document.getElementById('tutorial-kicker').textContent.trim(),
      title: document.getElementById('tutorial-title').textContent.trim(),
      message: message.textContent.trim(),
      art: art.getAttribute('src'),
      artLoaded: art.complete && art.naturalWidth > 0,
      role: overlay.getAttribute('role'),
      ariaModal: overlay.getAttribute('aria-modal'),
      labelledBy: overlay.getAttribute('aria-labelledby'),
      dialogInView: inView(dialog),
      nextInView: inView(next),
      nextOnTop: onTop(next),
      messageOnTop: onTop(message),
      textClipped: [message, content, dialog].some(clips),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      focusInside: overlay.contains(document.activeElement),
    };
  });
}

// Opening runs a 0.22 s fade and slide; measure only once it has finished.
async function waitDialogueOpen(page, timeoutMs = 30_000) {
  await page.waitFor(() => !document.getElementById('tutorial-overlay').classList.contains('hidden'),
    { timeoutMs, message: 'the guide dialogue' });
  await page.waitFor(() => {
    const art = document.getElementById('tutorial-art');
    const style = getComputedStyle(document.getElementById('tutorial-overlay'));
    return art.complete && art.naturalWidth > 0 && style.opacity === '1'
      && (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)');
  }, { message: 'the dialogue to finish opening' });
}

async function chooseCampaign(page, mission) {
  await page.click('#btn-lobby-task');
  await page.click('#btn-task-campaign');
  if (mission === 'ultimate') {
    // The Ultimate route unlocks after the Advanced mission; select it directly.
    await page.evaluate(() => window.__game.selectTaskMission('ultimate'));
  } else {
    await page.click(`#lobby-campaign-panel [data-mission="${mission}"]`);
  }
  return page.evaluate(() => getComputedStyle(document.getElementById('lobby-modal')).getPropertyValue('--story-lobby-art').trim());
}

// One story route from the lobby through its opening dialogue to the board.
async function storyRoute(browser, { profile, language, mission, probeClicks = false, boardShot = false }) {
  const label = `${profile} ${language} ${mission}`;
  const mobile = profile.startsWith('mobile');
  const story = scenario('story-guide-consistency');
  const reading = scenario(mobile ? 'mobile-lobby-dialogue' : 'desktop-dialogue-readability');
  const expected = guideCharacterText(language);
  const page = await open(browser, `story ${label}`, profile, { language });
  try {
    await sleep(400);
    const lobbyArt = await chooseCampaign(page, mission);
    story.check(`${label}: lobby shows the route's story art`, lobbyArt === `url("${GUIDE_ART.story[mission]}")`, lobbyArt);
    await page.click('#btn-start-task');
    await waitDialogueOpen(page);
    await sleep(300);
    const first = await dialogueFacts(page);
    const mainArt = GUIDE_ART.dialogue[mission]?.main ?? GUIDE_ART.story[mission];
    story.check(`${label}: opening dialogue shows the route's main art`, first.art === mainArt && first.artLoaded, first.art);
    // Guide lines carry the guide's name; mission briefings carry the mission title.
    story.check(`${label}: dialogue heading names the configured guide or the mission`,
      first.title.includes(expected.name) || /^MISSION\b/.test(first.title), { kicker: first.kicker, title: first.title });
    story.check(`${label}: dialogue text has no template markers`, !/\{\{|\}\}/.test(`${first.title} ${first.message}`));
    reading.check(`${label}: dialogue is a labelled modal dialog with focus inside`,
      first.role === 'dialog' && first.ariaModal === 'true' && first.labelledBy === 'tutorial-title' && first.focusInside, first);
    await story.shot(page, `story-${profile}-${mission}-dialogue`);
    if (!mobile) {
      const focus = await focusStaysIn(page, '#tutorial-overlay');
      reading.check(`${label}: Tab and Shift+Tab stay inside the dialogue`, focus.escapes.length === 0, focus);
    }
    if (probeClicks && !first.explicit) {
      // A press on the portrait must not advance; one on the backdrop advances once.
      const art = await page.evaluate(() => {
        const rect = document.getElementById('tutorial-art').getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      await page.mouseClick(art.x, art.y);
      await sleep(400);
      const afterArt = await dialogueFacts(page);
      reading.check(`${label}: clicking the portrait does not advance the dialogue`, afterArt.index === first.index, { before: first.index, after: afterArt.index });
      await page.mouseClick(8, 8);
      await sleep(400);
      const afterBackdrop = await dialogueFacts(page);
      reading.check(`${label}: one click outside the dialogue advances exactly one page`,
        afterBackdrop.index === first.index + 1 || (!afterBackdrop.open && first.index + 1 === first.steps),
        { before: first.index, after: afterBackdrop.index, open: afterBackdrop.open });
    }

    const pages = [];
    let longest = null;
    for (let guard = 0; guard < 24; guard += 1) {
      const facts = await dialogueFacts(page);
      if (!facts.open) break;
      pages.push({ index: facts.index, title: facts.title, chars: facts.message.length, art: facts.art });
      const shown = `${facts.kicker} ${facts.title} ${facts.message}`;
      story.check(`${label} page ${facts.index}: no retired identity or unresolved template in the dialogue`,
        retiredTerms(shown).length === 0 && !/\{\{|\}\}/.test(shown), { title: facts.title, retired: retiredTerms(shown) });
      reading.check(`${label} page ${facts.index}: dialogue, text, and Continue are in view and uncovered`,
        facts.dialogInView && facts.nextInView && facts.nextOnTop && facts.messageOnTop && !facts.textClipped && !facts.horizontalOverflow,
        facts);
      story.check(`${label} page ${facts.index}: art belongs to the configured guide`,
        facts.artLoaded && Object.values(GUIDE_ART.dialogue[mission] ?? { main: mainArt }).concat(GUIDE_ART.story[mission]).includes(facts.art), facts.art);
      if (!longest || facts.message.length > longest.chars) {
        const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
        longest = { chars: facts.message.length, index: facts.index, data };
      }
      if (mobile) {
        const point = await page.evaluate(() => {
          const rect = document.getElementById('btn-tutorial-next').getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        });
        await page.tap(point.x, point.y);
      } else {
        await page.click('#btn-tutorial-next');
      }
      await sleep(450);
      const after = await dialogueFacts(page);
      if (after.open && after.index !== null) {
        reading.check(`${label} page ${facts.index}: one ${mobile ? 'tap' : 'click'} advances exactly one page`,
          after.index === facts.index + 1, { before: facts.index, after: after.index });
      }
    }
    story.note(`${label} pages`, pages);
    if (longest && longest.index !== 0) {
      writeFileSync(new URL(`story-${profile}-${mission}-longest.jpg`, HERE), Buffer.from(longest.data, 'base64'));
      const entry = results['story-guide-consistency'];
      if (!entry.screenshots.includes(`story-${profile}-${mission}-longest.jpg`)) entry.screenshots.push(`story-${profile}-${mission}-longest.jpg`);
    }

    const closed = await dialogueFacts(page);
    const focusAfter = await page.evaluate(() => {
      const overlay = document.getElementById('tutorial-overlay');
      return { inHiddenOverlay: overlay.classList.contains('hidden') && overlay.contains(document.activeElement), active: document.activeElement?.id || document.activeElement?.tagName };
    });
    reading.check(`${label}: focus leaves the dialogue when it closes`, !focusAfter.inHiddenOverlay, focusAfter);
    // When the guide hands over to the board, do the action it points at and
    // check that the next dialogue opens with focus inside.
    const pointer = await page.evaluate(() => {
      const element = document.getElementById('guided-cell-pointer');
      const rect = element?.getBoundingClientRect();
      const shown = element && !element.classList.contains('hidden') && getComputedStyle(element).visibility !== 'hidden';
      return shown && rect.width ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    });
    story.note(`${label} hand-over`, { waitingAction: closed.waitingAction, guidedPointer: Boolean(pointer) });
    {
      if (pointer) {
        await withFrozenFrames(page, () => (mobile ? page.tap(pointer.x, pointer.y) : page.mouseClick(pointer.x, pointer.y)));
        let reopened = false;
        try {
          await waitDialogueOpen(page, 20_000);
          reopened = true;
        } catch {}
        const resumed = reopened ? await dialogueFacts(page) : null;
        reading.check(`${label}: after the guided action the dialogue reopens with focus inside`,
          reopened && resumed.focusInside && resumed.dialogInView, { action: closed.waitingAction, resumed });
        if (reopened) await story.shot(page, `story-${profile}-${mission}-reopened`);
      }
    }
    if (boardShot) {
      for (let guard = 0; guard < 12 && !(await hidden(page, 'tutorial-overlay')); guard += 1) {
        await page.click('#btn-tutorial-next');
        await sleep(250);
      }
      await sleep(600);
      await story.shot(page, `story-${profile}-${mission}-board`);
    }
  } finally {
    await closeAudited(page);
  }
}

const rounded = (values) => values.map((value) => Math.round(value * 100) / 100);

// A point on the canvas with no cube under it, for drags that must not start
// on the board.
async function emptyCanvasPoint(page) {
  const candidates = await page.evaluate(() => {
    const points = [];
    for (const fx of [0.82, 0.18, 0.7, 0.3, 0.9, 0.1]) {
      for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const point = { x: Math.round(innerWidth * fx), y: Math.round(innerHeight * fy) };
        if (document.elementFromPoint(point.x, point.y)?.tagName === 'CANVAS') points.push(point);
      }
    }
    return points;
  });
  const picks = await rasterPickCells(page, candidates);
  const index = picks.findIndex((pick) => pick.uniform && pick.cell === null);
  if (index < 0) throw new Error('no empty canvas point');
  return candidates[index];
}

async function diggableTargets(page) {
  const targets = await visibleCellTargets(page);
  const flagged = await page.evaluate((cells) => cells.map(({ x, y, z }) => window.__game.grid[x][y][z].isFlagged), targets.map(({ cell }) => cell));
  return targets.filter((target, index) => !flagged[index]);
}

function boardCounts(page) {
  return page.evaluate(() => {
    const snapshot = window.__game.roomSnapshot;
    return {
      phase: snapshot.phase,
      revealed: snapshot.revealed.length,
      flags: snapshot.flags.length,
      revision: snapshot.revision,
      save: new URL(location.href).searchParams.get('solo'),
    };
  });
}

// A revealed number whose mines are flagged through the room client, pressed
// with both mouse buttons on its sprite: the chord must open its other cells.
async function chordWithBothButtons(page) {
  const options = await page.evaluate(() => {
    const game = window.__game;
    const { config, mines } = game.roomClient.local.engine.state;
    const index = ({ x, y, z }) => (x * config.height + y) * config.depth + z;
    const mineSet = new Set(mines);
    const revealed = new Set(game.roomSnapshot.revealed.map(index));
    game.camera.updateMatrixWorld();
    const list = [];
    for (const cell of game.roomSnapshot.revealed) {
      if (!cell.count) continue;
      const sprite = game.grid[cell.x][cell.y][cell.z].spriteInstance;
      if (!sprite?.visible) continue;
      const hiddenCells = game.getNeighbors(cell.x, cell.y, cell.z).filter((n) => !revealed.has(index(n)));
      const safe = hiddenCells.filter((n) => !mineSet.has(index(n)));
      if (!safe.length) continue;
      const world = sprite.getWorldPosition(sprite.position.clone());
      const ndc = world.clone().project(game.camera);
      if (Math.abs(ndc.x) > 0.9 || Math.abs(ndc.y) > 0.9) continue;
      list.push({
        cell: { x: cell.x, y: cell.y, z: cell.z },
        mines: hiddenCells.filter((n) => mineSet.has(index(n))).map(({ x, y, z }) => ({ x, y, z })),
        point: { x: ((ndc.x + 1) / 2) * innerWidth, y: ((1 - ndc.y) / 2) * innerHeight },
        distance: world.distanceTo(game.camera.position),
      });
    }
    return list.sort((a, b) => a.distance - b.distance);
  });
  for (const option of options) {
    const picked = await page.evaluate(({ x, y }) => {
      const target = window.__game.pickTwoButtonTargetAtPointer({ clientX: x, clientY: y, pointerType: 'mouse' });
      return target ? { type: target.type, x: target.x, y: target.y, z: target.z } : null;
    }, option.point);
    if (picked?.type !== 'number' || picked.x !== option.cell.x || picked.y !== option.cell.y || picked.z !== option.cell.z) continue;
    for (const mine of option.mines) {
      const flags = await page.evaluate(() => window.__game.roomSnapshot.flags.length);
      const already = await page.evaluate((m) => window.__game.roomSnapshot.flags.some((f) => f.x === m.x && f.y === m.y && f.z === m.z), mine);
      if (already) continue;
      await page.evaluate((m) => window.__game.roomClient.send({ op: 'flag', ...m }), mine);
      await page.waitFor((count) => window.__game.roomSnapshot.flags.length > count, { args: [flags], message: 'the setup flag' });
    }
    await waitForBoardSettled(page);
    const before = await boardCounts(page);
    const { x, y } = option.point;
    await withFrozenFrames(page, async () => {
      await page.mouseMove(x, y);
      await page.mouseDown(x, y, 'left');
      await page.mouseDown(x, y, 'right');
      await page.mouseUp(x, y, 'right');
      await page.mouseUp(x, y, 'left');
    });
    await page.waitFor((count) => window.__game.roomSnapshot.revealed.length > count, { args: [before.revealed], message: 'the chord to open cells' });
    const after = await boardCounts(page);
    return { cell: option.cell, flaggedMines: option.mines.length, revealedBefore: before.revealed, revealedAfter: after.revealed, phase: after.phase };
  }
  return null;
}

async function solverHint(page, record, label) {
  await page.click('#btn-request-solver-hint');
  await page.waitFor(() => !document.getElementById('solver-hint-result').classList.contains('hidden'), { timeoutMs: 20_000, message: 'the solver hint' });
  await sleep(400);
  const hint = await page.evaluate(() => {
    const panel = document.getElementById('solver-hint-panel').getBoundingClientRect();
    const onTop = (id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(hit && (hit.id === id || document.getElementById(id).contains(hit)));
    };
    return {
      reason: document.getElementById('solver-hint-reason').innerText.trim(),
      coordinate: document.getElementById('solver-hint-coordinate').innerText.trim(),
      inView: panel.left >= -1 && panel.right <= innerWidth + 1 && panel.top >= -1 && panel.bottom <= innerHeight + 1,
      closeOnTop: onTop('btn-close-solver-hint'),
      collapseOnTop: onTop('btn-collapse-solver-hint'),
    };
  });
  record.check(`${label}: reasoning hint explains a target and its panel is usable`,
    hint.reason.length > 20 && hint.inView && hint.closeOnTop && hint.collapseOnTop, hint);
  return hint;
}

async function closeSolverHint(page, record, label) {
  await page.click('#btn-collapse-solver-hint');
  const collapsed = await page.evaluate(() => document.getElementById('btn-collapse-solver-hint').getAttribute('aria-expanded'));
  await page.click('#btn-collapse-solver-hint');
  const expanded = await page.evaluate(() => document.getElementById('btn-collapse-solver-hint').getAttribute('aria-expanded'));
  await page.click('#btn-close-solver-hint');
  await page.waitFor(() => document.getElementById('solver-hint-result').classList.contains('hidden'), { message: 'the hint to close' });
  record.check(`${label}: hint collapses, expands, and exits reasoning`, collapsed === 'false' && expanded === 'true', { collapsed, expanded });
}

async function desktopControls(browser, profile, language) {
  const record = scenario('desktop-gameplay-controls');
  const label = `${profile} ${language}`;
  const page = await open(browser, `controls ${label}`, profile, { language });
  const done = [];
  try {
    await startFreeplay(page, 'medium');
    await digFirstCell(page, await cellCenterOnScreen(page, { x: 4, y: 4, z: 4 }));
    await waitForBoardSettled(page);
    const opened = await boardCounts(page);
    record.check(`${label}: the first click digs the corner cube`, opened.phase === 'playing' && opened.revealed > 0, opened);
    done.push('dig');

    const [target] = await visibleCellTargets(page);
    await page.mouseMove(target.point.x, target.point.y);
    let hover = null;
    try {
      await page.waitFor((expected) => {
        const hovered = window.__game.hoveredCell;
        return hovered && hovered.x === expected.x && hovered.y === expected.y && hovered.z === expected.z
          && hovered.mesh.material === window.__game.materials.cellHovered;
      }, { args: [target.cell], message: 'the hover highlight' });
      hover = target.cell;
    } catch {
      hover = await page.evaluate(() => {
        const hovered = window.__game.hoveredCell;
        return hovered ? { x: hovered.x, y: hovered.y, z: hovered.z } : null;
      });
    }
    record.check(`${label}: the highlighted cube is the cube under the pointer`,
      hover && hover.x === target.cell.x && hover.y === target.cell.y && hover.z === target.cell.z, { hover, target: target.cell });
    const minesLabel = () => page.evaluate(() => document.getElementById('stat-mines').textContent.trim());
    const minesBefore = await minesLabel();
    await clickCell(page, target.point, { button: 'right' });
    await page.waitFor(() => window.__game.roomSnapshot.flags.length === 1, { message: 'a flag' });
    const flagged = await page.evaluate(() => window.__game.roomSnapshot.flags[0]);
    record.check(`${label}: a right click flags that same cube and the HUD counter follows`,
      flagged.x === target.cell.x && flagged.y === target.cell.y && flagged.z === target.cell.z && (await minesLabel()) !== minesBefore,
      { flagged, minesBefore, minesAfter: await minesLabel() });
    done.push('flag');
    await clickCell(page, target.point, { button: 'right' });
    await page.waitFor(() => window.__game.roomSnapshot.flags.length === 0, { message: 'the flag removal' });
    await waitForBoardSettled(page);

    const chord = await chordWithBothButtons(page);
    record.check(`${label}: pressing both buttons on a number opens its unflagged neighbours`, Boolean(chord) && chord.revealedAfter > chord.revealedBefore, chord);
    if (chord) done.push('two-button chord');
    await waitForBoardSettled(page);

    if ((await boardCounts(page)).phase === 'playing') {
      await solverHint(page, record, label);
      await scenario('desktop-gameplay-controls').shot(page, `controls-${profile}-hint`);
      await closeSolverHint(page, record, label);
      done.push('reasoning hint');
    }

    const view = await settleCamera(page);
    const empty = await emptyCanvasPoint(page);
    await withFrozenFrames(page, () => page.mouseDrag(empty, { x: empty.x - 160, y: empty.y + 40 }, { button: 'right', steps: 16 }));
    const rotated = await settleCamera(page);
    await withFrozenFrames(page, () => page.mouseWheel(empty.x, empty.y, 240));
    const zoomed = await settleCamera(page);
    record.check(`${label}: right-drag orbits around the fixed centre and the wheel zooms`,
      rounded(rotated.position).join() !== rounded(view.position).join()
        && rounded(rotated.target).join() === rounded(view.target).join() && zoomed.distance > rotated.distance + 0.5,
      { view, rotated, zoomed });
    done.push('rotate', 'zoom');

    // Movable centre: right-drag pans the matrix, then Center View returns it.
    await page.click('#btn-control-settings');
    await page.waitFor(() => !document.getElementById('control-settings-overlay').classList.contains('hidden'), { message: 'settings' });
    const settingsFocus = await focusStaysIn(page, '#control-settings-overlay', 18, 6);
    record.check(`${label}: settings dialog keeps keyboard focus inside`, settingsFocus.escapes.length === 0, settingsFocus);
    await record.shot(page, `controls-${profile}-settings`);
    await page.click('#control-center-mode-toggle');
    await page.click('#btn-control-settings-save');
    await page.waitFor(() => document.getElementById('control-settings-overlay').classList.contains('hidden'), { message: 'settings to close' });
    const settingsReturn = await page.evaluate(() => document.activeElement?.id);
    record.check(`${label}: saving settings returns focus to the settings button`, settingsReturn === 'btn-control-settings', settingsReturn);
    const centreMode = await page.evaluate(() => window.__game.controlSettings.centerMode);
    const panStart = await emptyCanvasPoint(page);
    await withFrozenFrames(page, () => page.mouseDrag(panStart, { x: panStart.x - 90, y: panStart.y + 50 }, { button: 'right', steps: 16 }));
    const panned = await settleCamera(page);
    record.check(`${label}: with a movable centre, right-drag pans the matrix`,
      centreMode === 'movable' && rounded(panned.target).join() !== rounded(zoomed.target).join(),
      { centreMode, before: zoomed.target, after: panned.target });
    await page.click('#btn-reset-camera');
    const reset = await settleCamera(page);
    record.check(`${label}: Reset View brings the panned centre and the camera back to the default view`,
      rounded(reset.position).join() === '11,9.9,11' && rounded(reset.target).join() === '0,0,0', reset);
    done.push('pan', 'reset view', 'settings');
    await page.click('#btn-control-settings');
    await page.click('#control-center-mode-toggle');
    await page.click('#btn-control-settings-save');
    await page.waitFor(() => document.getElementById('control-settings-overlay').classList.contains('hidden')
      && document.activeElement?.id === 'btn-control-settings', { message: 'settings to close and return focus' });
    await sleep(300);

    await page.evaluate(() => document.getElementById('slice-x-max').focus());
    await page.press('ArrowLeft');
    await page.press('ArrowLeft');
    const sliced = await page.evaluate(() => ({
      slice: [window.__game.slice.xMin, window.__game.slice.xMax],
      visibility: window.__game.grid.flat(2).every((cell) => cell.group.visible === cell.x <= 2),
    }));
    await page.click('#btn-reset-slices');
    const unsliced = await page.evaluate(() => window.__game.grid.flat(2).every((cell) => cell.group.visible));
    record.check(`${label}: slicing from the keyboard hides layers and Reset brings them back`,
      sliced.slice.join() === '0,2' && sliced.visibility && unsliced, { sliced, unsliced });
    done.push('slice');

    const layout = await page.evaluate(() => {
      const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      const panels = ['control-panel', 'social-panel', 'btn-return-lobby'].map((id) => {
        const rect = document.getElementById(id).getBoundingClientRect();
        return { id, inView: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1 };
      });
      // Controls the side panel shows without scrolling must be reachable at
      // their centre, even where the bottom hint bar overlaps the panel.
      const panel = document.getElementById('control-panel');
      const panelBox = panel.getBoundingClientRect();
      const covered = [...panel.querySelectorAll('button, input, [role="switch"], label')]
        .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          if (y < panelBox.top || y > Math.min(panelBox.bottom, innerHeight) || rect.width === 0) return false;
          const at = document.elementFromPoint(x, y);
          return at && !element.contains(at) && !at.contains(element) && !panel.contains(at);
        })
        .map((element) => element.id || element.textContent.trim().slice(0, 30));
      return { centre: hit?.tagName, panels, covered, comms: document.getElementById('mission-dialogue').innerText.trim().slice(0, 80) };
    });
    record.check(`${label}: HUD and guide comms panels stay in view and leave the board centre clear`,
      layout.centre === 'CANVAS' && layout.panels.every((panel) => panel.inView) && layout.comms.length > 0, layout);
    record.check(`${label}: every control the side panel shows can be clicked at its centre`, layout.covered.length === 0, layout.covered);
    await record.shot(page, `controls-${profile}-board`);

    await page.click('#btn-return-lobby');
    await page.waitFor(() => !document.getElementById('lobby-overlay').classList.contains('hidden'), { message: 'the lobby' });
    record.check(`${label}: Return to Lobby leaves the room`, await page.evaluate(() => !document.body.classList.contains('in-room')));
    done.push('return to lobby');
    record.note(`${label} actions`, done);
  } finally {
    await closeAudited(page);
  }
}

// Touch gestures run with the render loop paused, so a slow software frame
// cannot stretch or shorten the hold the game measures.
function touchHold(page, point, { holdMs = 900, moveTo = null } = {}) {
  return withFrozenFrames(page, async () => {
    const start = [{ x: point.x, y: point.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: start });
    await sleep(holdMs);
    const during = await page.evaluate(() => ({
      inspecting: window.__game.touchInspectionActive,
      highlightCentre: window.__game.activeHighlightCenter,
      panning: window.__game.touchPanActive,
    }));
    if (moveTo) {
      for (let step = 1; step <= 8; step += 1) {
        const x = point.x + ((moveTo.x - point.x) * step) / 8;
        const y = point.y + ((moveTo.y - point.y) * step) / 8;
        await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
      }
    }
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(200);
    return during;
  });
}

function pinch(page, centre, spread) {
  const at = (offset) => [
    { x: centre.x - offset, y: centre.y, id: 1, radiusX: 1, radiusY: 1, force: 1 },
    { x: centre.x + offset, y: centre.y, id: 2, radiusX: 1, radiusY: 1, force: 1 },
  ];
  return withFrozenFrames(page, async () => {
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(30) });
    for (let step = 1; step <= 8; step += 1) {
      await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(30 + (spread * step) / 8) });
    }
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(200);
  });
}

// A tap acts only after the double-tap window, so wait for the room to answer.
async function tapCell(page, point) {
  const revision = await page.evaluate(() => window.__game.roomSnapshot.revision);
  await withFrozenFrames(page, () => page.tap(point.x, point.y));
  await page.waitFor((previous) => window.__game.roomSnapshot.revision !== previous, { args: [revision], timeoutMs: 15_000, message: 'the tap to act' });
  await waitForBoardSettled(page);
}

async function mobileControls(browser, profile, language) {
  const record = scenario('mobile-gameplay-controls');
  const label = `${profile} ${language}`;
  const size = VIEWPORTS[profile];
  const page = await open(browser, `controls ${label}`, profile, { language });
  const done = [];
  try {
    await startFreeplay(page, 'medium');
    await digFirstCell(page, await cellCenterOnScreen(page, { x: 4, y: 4, z: 4 }), { touch: true });
    await waitForBoardSettled(page);
    const opened = await boardCounts(page);
    record.check(`${label}: a tap digs the tapped cube`, opened.phase === 'playing' && opened.revealed > 0, opened);
    done.push('tap dig');

    const dock = await page.evaluate(() => {
      const ids = ['btn-mobile-controls', 'btn-mobile-slices', 'btn-mobile-dig', 'btn-mobile-flag', 'btn-mobile-mission'];
      const rects = ids.map((id) => ({ id, ...document.getElementById(id).getBoundingClientRect().toJSON() }));
      const overlapping = [];
      for (let a = 0; a < rects.length; a += 1) {
        for (let b = a + 1; b < rects.length; b += 1) {
          const r = rects[a];
          const s = rects[b];
          if (r.left < s.right - 1 && s.left < r.right - 1 && r.top < s.bottom - 1 && s.top < r.bottom - 1) overlapping.push([r.id, s.id]);
        }
      }
      const onTop = rects.filter(({ id, left, top, width, height }) => {
        const hit = document.elementFromPoint(left + width / 2, top + height / 2);
        return hit && (hit.id === id || document.getElementById(id).contains(hit));
      }).map(({ id }) => id);
      return {
        inView: rects.every((r) => r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 && r.height >= 40),
        overlapping,
        onTop,
        statusbar: document.getElementById('mobile-statusbar').getBoundingClientRect().toJSON(),
      };
    });
    record.check(`${label}: all five dock buttons are in view, at least 40 px tall, uncovered, and apart`,
      dock.inView && dock.overlapping.length === 0 && dock.onTop.length === 5, dock);
    await record.shot(page, `controls-${profile}-dock`);

    await page.click('#btn-mobile-flag');
    const flagMode = await page.evaluate(() => window.__game.activeMode);
    const [flagTarget] = await visibleCellTargets(page);
    await tapCell(page, flagTarget.point);
    const flagged = await page.evaluate(() => window.__game.roomSnapshot.flags.map(({ x, y, z }) => ({ x, y, z })));
    record.check(`${label}: in flag mode a tap flags the tapped cube`,
      flagMode === 'flag' && flagged.length === 1 && flagged[0].x === flagTarget.cell.x && flagged[0].y === flagTarget.cell.y && flagged[0].z === flagTarget.cell.z,
      { flagMode, flagged, target: flagTarget.cell });
    await record.shot(page, `controls-${profile}-flag`);
    await page.click('#btn-mobile-dig');
    done.push('flag mode tap');

    // Hold a visible number: neighbour inspection, and nothing dug or flagged.
    const number = await page.evaluate(() => {
      const game = window.__game;
      game.camera.updateMatrixWorld();
      for (const cell of game.roomSnapshot.revealed) {
        if (!cell.count) continue;
        const sprite = game.grid[cell.x][cell.y][cell.z].spriteInstance;
        if (!sprite?.visible) continue;
        const ndc = sprite.getWorldPosition(sprite.position.clone()).project(game.camera);
        if (Math.abs(ndc.x) > 0.8 || Math.abs(ndc.y) > 0.8) continue;
        const point = { x: ((ndc.x + 1) / 2) * innerWidth, y: ((1 - ndc.y) / 2) * innerHeight };
        const target = game.pickTwoButtonTargetAtPointer({ clientX: point.x, clientY: point.y, pointerType: 'touch' }, { includeClueProxy: true });
        if (target?.type === 'number' && target.x === cell.x && target.y === cell.y && target.z === cell.z) return { cell: { x: cell.x, y: cell.y, z: cell.z }, point };
      }
      return null;
    });
    if (number) {
      const before = await boardCounts(page);
      const during = await touchHold(page, number.point);
      const after = await boardCounts(page);
      record.check(`${label}: holding a number inspects its neighbours without digging or flagging`,
        during.inspecting === true && after.revealed === before.revealed && after.flags === before.flags,
        { number: number.cell, during, before, after });
      done.push('long-press number inspection');
    } else {
      record.check(`${label}: a revealed number is visible for the long-press check`, false);
    }

    // Movable centre: hold then drag pans; a two-finger pinch zooms; neither acts on the board.
    await page.click('#btn-mobile-controls');
    await sleep(600);
    await page.click('#btn-control-settings');
    await page.waitFor(() => !document.getElementById('control-settings-overlay').classList.contains('hidden'), { message: 'settings' });
    await record.shot(page, `controls-${profile}-settings`);
    await page.click('#control-center-mode-toggle');
    await page.click('#btn-control-settings-save');
    await page.waitFor(() => document.getElementById('control-settings-overlay').classList.contains('hidden'), { message: 'settings to close' });
    if (await page.evaluate(() => document.getElementById('control-panel').classList.contains('mobile-open'))) await page.click('#btn-mobile-controls');
    const empty = await emptyCanvasPoint(page);
    const beforePan = await settleCamera(page);
    const boardBeforeGestures = await boardCounts(page);
    const hold = await touchHold(page, empty, { moveTo: { x: empty.x + 60, y: empty.y + 40 } });
    const afterPan = await settleCamera(page);
    await pinch(page, { x: size.width / 2, y: size.height / 2 }, 70);
    const afterPinch = await settleCamera(page);
    const boardAfterGestures = await boardCounts(page);
    record.check(`${label}: hold-then-drag pans the matrix`,
      hold.panning === true && rounded(afterPan.target).join() !== rounded(beforePan.target).join(), { hold, beforePan, afterPan });
    record.check(`${label}: a two-finger pinch zooms`, Math.abs(afterPinch.distance - afterPan.distance) > 0.5, { afterPan, afterPinch });
    record.check(`${label}: pan and pinch gestures leave the board untouched`,
      boardAfterGestures.revealed === boardBeforeGestures.revealed && boardAfterGestures.flags === boardBeforeGestures.flags,
      { boardBeforeGestures, boardAfterGestures });
    await page.click('#btn-center-camera');
    const recentred = await settleCamera(page);
    record.check(`${label}: the centre button puts the panned matrix back in the middle`, rounded(recentred.target).join() === '0,0,0', recentred);
    done.push('hold-drag pan', 'pinch zoom', 'centre button');

    for (const [button, panel] of [['btn-mobile-controls', 'control-panel'], ['btn-mobile-slices', 'slicing-panel'], ['btn-mobile-mission', 'social-panel']]) {
      await page.click(`#${button}`);
      await sleep(600);
      const state = await page.evaluate((id) => {
        const element = document.getElementById(id);
        const rect = element.getBoundingClientRect();
        return { open: element.classList.contains('mobile-open'), inView: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1, top: rect.top };
      }, panel);
      record.check(`${label}: ${button} opens ${panel} inside the screen`, state.open && state.inView, state);
      await record.shot(page, `controls-${profile}-${panel}`);
      if (panel === 'slicing-panel') await page.click('#btn-close-slices');
      else await page.click(`#${button}`);
      await sleep(600);
      const closed = await page.evaluate((id) => !document.getElementById(id).classList.contains('mobile-open'), panel);
      record.check(`${label}: ${panel} closes again`, closed);
    }
    done.push('controls drawer', 'slices drawer', 'mission drawer');

    if ((await boardCounts(page)).phase === 'playing') {
      await solverHint(page, record, label);
      await record.shot(page, `controls-${profile}-hint`);
      await closeSolverHint(page, record, label);
      done.push('reasoning hint and exit');
    }

    const beforeTurn = await boardCounts(page);
    await page.setViewport({ width: size.height, height: size.width, mobile: true, touch: true });
    await sleep(800);
    const landscape = await page.evaluate(() => ({ inRoom: document.body.classList.contains('in-room'), overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
    await record.shot(page, `controls-${profile}-landscape`);
    await page.setViewport({ width: size.width, height: size.height, mobile: true, touch: true });
    await sleep(800);
    const afterTurn = await boardCounts(page);
    record.check(`${label}: rotating to landscape and back keeps the game and its state`,
      landscape.inRoom && !landscape.overflow && afterTurn.revealed === beforeTurn.revealed && afterTurn.flags === beforeTurn.flags && afterTurn.save === beforeTurn.save,
      { landscape, beforeTurn, afterTurn });
    const [again] = await diggableTargets(page);
    if (again) {
      await tapCell(page, again.point);
      const after = await boardCounts(page);
      record.check(`${label}: the board still takes a tap after rotating`, after.revision !== afterTurn.revision, { afterTurn, after });
    }
    done.push('rotation');
    await record.shot(page, `controls-${profile}-board`);
    record.note(`${label} actions`, done);
  } finally {
    await closeAudited(page);
  }
}

// On phones the survey button lives in the controls drawer, which stays laid
// out off-screen while closed.
async function startAutoSurvey(page) {
  const drawerClosed = await page.evaluate(() => !document.getElementById('control-panel').classList.contains('mobile-open'));
  if (page.touch && drawerClosed) {
    await page.click('#btn-mobile-controls');
    await sleep(600);
  }
  await page.click('#btn-auto-survey-start');
}

function squadList(page) {
  return page.evaluate(() => [...document.querySelectorAll('#player-list-ul > li')].map((item) => item.innerText.replace(/\s+/g, ' ').trim()));
}

function setNickname(page, name) {
  return page.evaluate((value) => {
    const input = document.getElementById('input-nickname');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
}

async function sameBoard(host, guest) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const [a, b] = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const snapshot = window.__game.roomSnapshot;
      return JSON.stringify({ revision: snapshot.revision, revealed: snapshot.revealed.length, flags: snapshot.flags.length, phase: snapshot.phase });
    })));
    if (a === b) return JSON.parse(a);
    await sleep(250);
  }
  throw new Error('the two clients never showed the same board');
}

const PARTS = {
  // desktop-lobby-bilingual and the lobby half of mobile-lobby-dialogue.
  async lobby(browser) {
    for (const [profile, viewport] of Object.entries(VIEWPORTS)) {
      const id = profile.startsWith('desktop') ? 'desktop-lobby-bilingual' : 'mobile-lobby-dialogue';
      const record = scenario(id);
      for (const language of ['zh', 'en']) {
        const page = await open(browser, `lobby ${profile} ${language}`, profile, { language });
        try {
          await sleep(600);
          const expected = guideCharacterText(language);
          const facts = await lobbyFacts(page);
          const label = `${profile} ${language}`;
          record.check(`${label}: page language`, facts.lang.startsWith(language), facts.lang);
          // The mission view names the guide; the squad view carries the
          // codename ("<codename> Survey Squad"); the role appears in game.
          record.check(`${label}: mission view names the configured guide`, facts.text.includes(expected.name));
          record.check(`${label}: no template markers`, !facts.templateMarkers);
          record.check(`${label}: no horizontal overflow`, !facts.horizontalOverflow);
          record.check(`${label}: no control outside the viewport`, facts.controlsOutsideViewport.length === 0, facts.controlsOutsideViewport);
          record.check(`${label}: no clipped label`, facts.clippedText.length === 0, facts.clippedText);
          record.check(`${label}: protocol label clear of the corner buttons`, facts.protocolLabelCoveredBy.length === 0, facts.protocolLabelCoveredBy);
          if (language === 'en') record.check(`${label}: no Chinese text in English mode`, facts.cjkCharacters === 0, facts.cjkCharacters);
          await record.shot(page, `lobby-${profile}-${language}`);
          for (const mode of ['btn-lobby-task', 'btn-lobby-multiplayer']) {
            await page.click(`#${mode}`);
            await sleep(250);
            const actions = mode === 'btn-lobby-task'
              ? ['btn-task-campaign', 'btn-task-freeplay', 'btn-start-task']
              : ['input-nickname', 'input-room', 'btn-create-room', 'btn-join-room'];
            const reach = await lobbyReach(page, actions);
            record.check(`${label}: ${mode} actions reachable`, Object.values(reach.reachable).every((value) => value === true), reach);
          }
          const squad = await lobbyFacts(page);
          record.check(`${label}: squad view carries the configured codename`, squad.text.includes(expected.squad), expected.squad);
          record.check(`${label}: squad view has no template markers or clipped labels`,
            !squad.templateMarkers && squad.clippedText.length === 0 && !squad.horizontalOverflow, squad.clippedText);
          await record.shot(page, `lobby-${profile}-${language}-multiplayer`);
          await page.click('#btn-language-toggle-lobby');
          await page.waitFor((from) => !document.documentElement.lang.startsWith(from), { args: [language], message: 'the language switch' });
          const switched = await lobbyFacts(page);
          record.check(`${label}: the language toggle switches the lobby`, switched.title !== squad.title && !switched.templateMarkers,
            { from: squad.title, to: switched.title });
        } finally {
          await closeAudited(page);
        }
      }
    }
  },

  // story-guide-consistency, desktop-dialogue-readability, and the dialogue
  // half of mobile-lobby-dialogue.
  async story(browser) {
    const routes = [
      { profile: 'desktop-wide', language: 'en', mission: 'easy', probeClicks: true, boardShot: true },
      { profile: 'desktop-wide', language: 'zh', mission: 'medium', boardShot: true },
      { profile: 'desktop-wide', language: 'en', mission: 'hard', boardShot: true },
      { profile: 'desktop-wide', language: 'zh', mission: 'ultimate' },
      { profile: 'desktop-compact', language: 'zh', mission: 'easy', probeClicks: true },
      { profile: 'desktop-compact', language: 'en', mission: 'medium' },
      { profile: 'mobile-standard', language: 'zh', mission: 'easy', boardShot: true },
      { profile: 'mobile-small', language: 'en', mission: 'easy', boardShot: true },
      { profile: 'mobile-small', language: 'zh', mission: 'medium' },
    ];
    for (const route of routes) {
      await runCase('story-guide-consistency', `${route.profile} ${route.language} ${route.mission}`, () => storyRoute(browser, route));
    }
    // Every guide image side by side, for the face, hair, outfit, and colour comparison.
    const page = await open(browser, 'story art sheet', 'desktop-wide', { language: 'en' });
    try {
      const sources = [...new Set([
        ...Object.values(GUIDE_ART.story),
        ...Object.values(GUIDE_ART.dialogue).flatMap((set) => Object.values(set)),
      ])];
      const images = await page.evaluate(async (list) => {
        const sheet = document.createElement('div');
        sheet.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#05030f;display:grid;'
          + 'grid-template-columns:repeat(5,1fr);grid-auto-rows:1fr;gap:6px;padding:6px;';
        const items = list.map((src) => {
          const figure = document.createElement('figure');
          figure.style.cssText = 'margin:0;display:flex;flex-direction:column;min-height:0;color:#9fe;font:11px monospace;';
          const img = document.createElement('img');
          img.src = src;
          img.style.cssText = 'flex:1;min-height:0;width:100%;object-fit:contain;background:#111;';
          const caption = document.createElement('figcaption');
          caption.textContent = src.replace('assets/', '');
          figure.append(img, caption);
          sheet.append(figure);
          return img;
        });
        document.body.append(sheet);
        await Promise.all(items.map((img) => img.decode().catch(() => null)));
        return items.map((img) => ({ src: img.getAttribute('src'), size: `${img.naturalWidth}x${img.naturalHeight}` }));
      }, sources);
      const record = scenario('story-guide-consistency');
      record.check('every configured guide image loads', images.every((image) => image.size !== '0x0'), images);
      record.note('guide images', images);
      await record.shot(page, 'story-art-sheet');
    } finally {
      await closeAudited(page);
    }
  },

  async controls(browser) {
    await runCase('desktop-gameplay-controls', 'desktop-wide en', () => desktopControls(browser, 'desktop-wide', 'en'));
    await runCase('desktop-gameplay-controls', 'desktop-compact zh', () => desktopControls(browser, 'desktop-compact', 'zh'));
    await runCase('mobile-gameplay-controls', 'mobile-standard zh', () => mobileControls(browser, 'mobile-standard', 'zh'));
    await runCase('mobile-gameplay-controls', 'mobile-small en', () => mobileControls(browser, 'mobile-small', 'en'));
  },

  async multiplayer(browser) {
    const record = scenario('multiplayer-two-client');
    const story = scenario('story-guide-consistency');
    let host;
    let guest;
    await runCase('multiplayer-two-client', 'desktop host zh with mobile guest en', async () => {
      host = await open(browser, 'squad host desktop-wide zh', 'desktop-wide', { language: 'zh', seed: 11 });
      await sleep(400);
      await host.click('#btn-lobby-multiplayer');
      const squadArt = await host.evaluate(() => getComputedStyle(document.getElementById('lobby-modal')).getPropertyValue('--story-lobby-art').trim());
      story.check('squad lobby shows the squad story art', squadArt === `url("${GUIDE_ART.story.squad}")`, squadArt);
      await record.shot(host, 'squad-lobby');
      // Latin nicknames, so each client's activity text shows only its own language.
      await setNickname(host, 'Release Host');
      await host.click('#btn-create-room');
      const code = await host.waitFor(() => window.__game.roomSnapshot?.mode === 'squad' && window.__game.roomSnapshot.code, { message: 'the squad room' });
      record.note('room', { code, testedAt: new Date().toISOString() });
      const hostUrl = await host.evaluate(() => location.search);
      record.check('creating a squad puts the room code in the page URL', hostUrl.includes(`room=${code}`), hostUrl);
      if (!(await hidden(host, 'tutorial-overlay'))) {
        await waitDialogueOpen(host);
        const briefing = await dialogueFacts(host);
        story.check('squad briefing uses the squad art and the configured guide', briefing.artLoaded
          && Object.values(GUIDE_ART.story).includes(briefing.art) && `${briefing.kicker} ${briefing.title}`.includes(guideCharacterText('zh').name), briefing);
        await story.shot(host, 'story-desktop-wide-squad-dialogue');
        for (let guard = 0; guard < 12 && !(await hidden(host, 'tutorial-overlay')); guard += 1) {
          await host.click('#btn-tutorial-next');
          await sleep(250);
        }
      }

      guest = await open(browser, 'squad guest mobile-standard en', 'mobile-standard', { language: 'en', seed: 22, path: `/?room=${code}` });
      const invited = await guest.evaluate(() => document.getElementById('input-room').value);
      record.check('the invite link fills in the room code', invited === code, invited);
      await setNickname(guest, 'Release Guest');
      await guest.click('#btn-join-room');
      for (const page of [host, guest]) {
        await page.waitFor(() => document.querySelectorAll('#player-list-ul > li').length === 2, { timeoutMs: 20_000, message: 'two squad members' });
      }
      for (let guard = 0; guard < 12 && !(await hidden(guest, 'tutorial-overlay')); guard += 1) {
        await guest.click('#btn-tutorial-next');
        await sleep(250);
      }
      const members = { host: await squadList(host), guest: await squadList(guest) };
      record.check('both clients list the same two members', members.host.length === 2 && members.guest.length === 2, members);

      await host.evaluate(() => {
        const input = document.getElementById('input-chat');
        input.value = 'v4.1.2 release sync';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await host.click('#btn-send-chat');
      await guest.waitFor(() => document.getElementById('chat-messages').innerText.includes('v4.1.2 release sync'), { message: 'the chat line' });
      record.check('a chat line reaches the other client', true);

      // Host digs, guest flags, guest digs, host flags: one action each, in turn.
      const [hostDig] = await visibleCellTargets(host);
      await clickCell(host, hostDig.point);
      await host.waitFor(() => window.__game.roomSnapshot.phase === 'playing', { message: 'the first squad dig' });
      let board = await sameBoard(host, guest);
      record.check('the host dig shows on both clients', board.revealed > 0, board);
      await waitForBoardSettled(guest);
      await guest.click('#btn-mobile-flag');
      const [guestFlag] = await visibleCellTargets(guest);
      await tapCell(guest, guestFlag.point);
      board = await sameBoard(host, guest);
      record.check('the guest flag shows on both clients', board.flags === 1, board);
      await guest.click('#btn-mobile-dig');
      const beforeGuestDig = board;
      const [guestDig] = await diggableTargets(guest);
      await tapCell(guest, guestDig.point);
      board = await sameBoard(host, guest);
      record.check('the guest dig shows on both clients',
        board.revision !== beforeGuestDig.revision && (board.revealed > beforeGuestDig.revealed || board.phase === 'revive'), { beforeGuestDig, board });
      if (board.phase === 'revive') {
        // The server places the mines, so the guest's dig can hit one. Both
        // clients then get the shared revive prompt; watching the ad revives
        // the squad after its countdown.
        record.note('guest dig', 'hit a mine; the squad revive prompt took over');
        for (const page of [host, guest]) {
          await page.waitFor(() => !document.getElementById('ad-modal-overlay').classList.contains('hidden'), { message: 'the revive prompt' });
        }
        await guest.click('#btn-watch-ad');
        for (const page of [host, guest]) {
          await page.waitFor(() => document.getElementById('ad-modal-overlay').classList.contains('hidden')
            && window.__game.roomSnapshot.phase === 'playing', { timeoutMs: 30_000, message: 'the squad revive' });
        }
        board = await sameBoard(host, guest);
        record.check('a mine hit opens the revive prompt on both clients and the countdown revives the squad', board.phase === 'playing', board);
      }
      if (board.phase === 'playing') {
        await waitForBoardSettled(host);
        const [hostFlag] = await diggableTargets(host);
        const flagsBefore = board.flags;
        await clickCell(host, hostFlag.point, { button: 'right' });
        await host.waitFor((revision) => window.__game.roomSnapshot.revision !== revision, { args: [board.revision], message: 'the host flag' });
        board = await sameBoard(host, guest);
        record.check('the host flag shows on both clients', board.flags === flagsBefore + 1, board);
      }
      const activity = await Promise.all([host, guest].map((page) => page.evaluate(() => document.getElementById('chat-messages').innerText)));
      record.check('each client describes the same activity in its own language',
        /[㐀-鿿]/.test(activity[0]) && !/[㐀-鿿]/.test(activity[1].replace(/v4\.1\.2 release sync/g, '')),
        { host: activity[0].slice(-400), guest: activity[1].slice(-400) });
      await record.shot(host, 'squad-host');
      await record.shot(guest, 'squad-guest');

      // The guest reloads: it rejoins as the same member, with no ghost copy.
      const guestUrl = await guest.evaluate(() => location.href);
      await guest.goto(guestUrl);
      await guest.waitFor(() => Boolean(window.__game?.renderer), { message: 'the reloaded game' });
      await guest.waitFor(() => window.__game.roomSnapshot?.mode === 'squad' && document.querySelectorAll('#player-list-ul > li').length === 2,
        { timeoutMs: 30_000, message: 'the guest to rejoin' });
      await sleep(800);
      const afterReload = { host: await squadList(host), guest: await squadList(guest) };
      record.check('a reload rejoins the same squad without a duplicate or ghost member',
        afterReload.host.length === 2 && afterReload.guest.length === 2 && JSON.stringify(afterReload.host) === JSON.stringify(members.host), afterReload);
      board = await sameBoard(host, guest);
      record.check('the reloaded client restores the shared board', board.revealed > 0, board);

      // The host leaves: the guest becomes host and the host's URL drops the room.
      await host.click('#btn-return-lobby');
      await host.waitFor(() => !document.getElementById('lobby-overlay').classList.contains('hidden'), { message: 'the host lobby' });
      await guest.waitFor(() => document.querySelectorAll('#player-list-ul > li').length === 1, { timeoutMs: 20_000, message: 'the host to leave' });
      const transferred = await squadList(guest);
      const hostAfter = await host.evaluate(() => location.search);
      record.check('when the host leaves, the remaining member becomes host', transferred.length === 1 && transferred[0].includes('👑'), transferred);
      record.check('leaving clears the room from the URL', !hostAfter.includes('room='), hostAfter);
      await guest.click('#btn-return-lobby');
      await guest.waitFor(() => !document.getElementById('lobby-overlay').classList.contains('hidden'), { message: 'the guest lobby' });
      const guestAfter = await guest.evaluate(() => location.search);
      record.check('the last member leaves cleanly', !guestAfter.includes('room='), guestAfter);
    });
    if (guest) await closeAudited(guest);
    if (host) await closeAudited(host);
  },

  async replay(browser) {
    const record = scenario('failure-replay-recovery');
    await runCase('failure-replay-recovery', 'desktop-wide zh solo loss', async () => {
      const page = await open(browser, 'loss desktop-wide zh', 'desktop-wide', { language: 'zh' });
      try {
        await startFreeplay(page, 'medium');
        await digFirstCell(page, await cellCenterOnScreen(page, { x: 4, y: 4, z: 4 }));
        await waitForBoardSettled(page);
        const before = await boardCounts(page);
        const beforeProgress = await page.evaluate(() => document.getElementById('stat-progress-percent').textContent.trim());
        // Setup: find a mine the camera can see and click it for real.
        const mine = await page.evaluate(() => {
          const game = window.__game;
          const { config, mines } = game.roomClient.local.engine.state;
          return mines.map((index) => ({
            x: Math.floor(index / (config.height * config.depth)),
            y: Math.floor(index / config.depth) % config.height,
            z: index % config.depth,
          }));
        });
        const targets = await visibleCellTargets(page);
        const visibleMine = targets.find((target) => mine.some((m) => m.x === target.cell.x && m.y === target.cell.y && m.z === target.cell.z));
        if (visibleMine) await clickCell(page, visibleMine.point);
        else await page.evaluate((m) => window.__game.roomClient.send({ op: 'dig', ...m }), mine[0]);
        record.note('loss trigger', visibleMine ? 'real click on a visible mine' : 'dig sent through the room client');
        await page.waitFor(() => !document.getElementById('modal-overlay').classList.contains('hidden'), { timeoutMs: 20_000, message: 'the failure dialog' });
        await sleep(900);
        const loss = await page.evaluate(() => ({
          phase: window.__game.roomSnapshot.phase,
          title: document.getElementById('modal-title').innerText.trim(),
          message: document.getElementById('modal-message').innerText.trim(),
          rewind: document.getElementById('btn-modal-restart').innerText.trim(),
          focusInside: document.getElementById('modal-overlay').contains(document.activeElement),
        }));
        const sound = page.responses.find((response) => response.url.includes('audio/sfx/mine-hit-cartoon-pop.wav'));
        record.check('desktop zh: a mine hit opens the failure dialog with a rewind action and focus inside',
          loss.phase === 'revive' && loss.title.length > 0 && loss.rewind.length > 0 && loss.focusInside, loss);
        record.check('desktop zh: the mine hit loads the new blast sample', sound?.status === 200 || sound?.status === 206, sound ?? null);
        const focus = await focusStaysIn(page, '#modal-overlay', 10, 4);
        record.check('desktop zh: Tab stays inside the failure dialog', focus.escapes.length === 0, focus);
        await record.shot(page, 'failure-desktop-wide-loss');
        await page.click('#btn-modal-restart');
        await page.waitFor(() => window.__game.roomSnapshot.phase === 'playing'
          && document.getElementById('modal-overlay').classList.contains('hidden'), { timeoutMs: 15_000, message: 'the rewind' });
        await waitForBoardSettled(page);
        const rewound = await boardCounts(page);
        const rewoundProgress = await page.evaluate(() => document.getElementById('stat-progress-percent').textContent.trim());
        record.check('desktop zh: rewinding returns to the board just before the mine', rewound.revealed === before.revealed && rewoundProgress === beforeProgress,
          { before, rewound, beforeProgress, rewoundProgress });
        await record.shot(page, 'failure-desktop-wide-rewound');
        await page.click('#btn-return-lobby');
        await page.waitFor(() => !document.getElementById('lobby-overlay').classList.contains('hidden'), { message: 'the lobby' });
        await startFreeplay(page, 'easy');
        await sleep(800);
        const fresh = await page.evaluate(() => ({
          phase: window.__game.roomSnapshot.phase,
          revealed: window.__game.roomSnapshot.revealed.length,
          modal: !document.getElementById('modal-overlay').classList.contains('hidden'),
          adModal: !document.getElementById('ad-modal-overlay').classList.contains('hidden'),
          hint: !document.getElementById('solver-hint-result').classList.contains('hidden'),
          replay: document.body.classList.contains('replay-active'),
        }));
        record.check('desktop zh: the next task starts clean, with no leftover dialog, hint, or replay',
          fresh.phase === 'ready' && fresh.revealed === 0 && !fresh.modal && !fresh.adModal && !fresh.hint && !fresh.replay, fresh);
        await record.shot(page, 'failure-desktop-wide-new-task');
      } finally {
        await closeAudited(page);
      }
    });
    for (const [profile, language] of [['desktop-wide', 'en'], ['mobile-standard', 'zh'], ['mobile-small', 'en']]) {
      await runCase('failure-replay-recovery', `${profile} ${language} win and replay`, async () => {
        const label = `${profile} ${language}`;
        const touch = profile.startsWith('mobile');
        const page = await open(browser, `replay ${label}`, profile, { language });
        try {
          await startFreeplay(page, 'easy');
          await digFirstCell(page, await cellCenterOnScreen(page, { x: 2, y: 2, z: 2 }), { touch });
          await waitForBoardSettled(page);
          if ((await page.evaluate(() => window.__game.roomSnapshot.phase)) !== 'won') {
            await startAutoSurvey(page);
            await page.waitFor(() => window.__game.roomSnapshot.phase === 'won', { timeoutMs: 60_000, message: 'the survey to clear the board' });
          }
          await page.waitFor(() => !document.getElementById('tutorial-overlay').classList.contains('hidden')
            && !document.getElementById('btn-tutorial-replay').classList.contains('hidden'), { timeoutMs: 20_000, message: 'the completion dialogue' });
          await sleep(600);
          const won = await dialogueFacts(page);
          record.check(`${label}: the win dialogue offers the success replay and is fully in view`, won.dialogInView && won.nextOnTop && !won.textClipped, won);
          await record.shot(page, `replay-${profile}-won`);
          await page.click('#btn-tutorial-replay');
          await page.waitFor(() => Boolean(window.__game.successReplay), { message: 'the replay' });
          await page.click('#btn-replay-pause');
          await sleep(300);
          const paused = await page.evaluate(() => {
            const onTop = (id) => {
              const rect = document.getElementById(id).getBoundingClientRect();
              const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
              return Boolean(hit && (hit.id === id || document.getElementById(id).contains(hit)));
            };
            const hud = document.getElementById('replay-hud').getBoundingClientRect();
            const lobbyButton = document.getElementById('btn-return-lobby');
            return {
              paused: window.__game.successReplay?.paused,
              pressed: document.getElementById('btn-replay-pause').getAttribute('aria-pressed'),
              locked: window.__game.isInteractionLocked,
              hudInView: hud.left >= -1 && hud.right <= innerWidth + 1 && hud.top >= -1 && hud.bottom <= innerHeight + 1,
              pauseOnTop: onTop('btn-replay-pause'),
              exitOnTop: onTop('btn-replay-exit'),
              lobbyButtonShown: lobbyButton.getClientRects().length > 0 && getComputedStyle(lobbyButton).visibility !== 'hidden',
              progress: document.getElementById('replay-hud-progress').textContent.trim(),
            };
          });
          record.check(`${label}: the paused replay HUD is in view, usable, and locks board input`,
            paused.paused === true && paused.pressed === 'true' && paused.locked && paused.hudInView && paused.pauseOnTop && paused.exitOnTop, paused);
          if (touch) record.check(`${label}: the lobby button stays hidden behind the replay HUD`, !paused.lobbyButtonShown, paused);
          await record.shot(page, `replay-${profile}-paused`);
          await page.click('#btn-replay-pause');
          await page.waitFor(() => window.__game.successReplay?.finished === true, { timeoutMs: 40_000, message: 'the replay to finish' });
          await page.click('#btn-replay-exit');
          await page.waitFor(() => !window.__game.successReplay, { message: 'the replay to close' });
          await sleep(400);
          const back = await page.evaluate(() => ({
            dialogue: !document.getElementById('tutorial-overlay').classList.contains('hidden'),
            phase: window.__game.roomSnapshot.phase,
            hud: !document.getElementById('replay-hud').classList.contains('hidden'),
          }));
          record.check(`${label}: exiting the replay returns to the finished board and its dialogue`, back.dialogue && back.phase === 'won' && !back.hud, back);
          await page.click('#btn-tutorial-next');
          await page.waitFor(() => window.__game.roomSnapshot.phase === 'ready', { message: 'a fresh board' });
          await sleep(800);
          const fresh = await page.evaluate(() => ({
            revealed: window.__game.roomSnapshot.revealed.length,
            dialogue: !document.getElementById('tutorial-overlay').classList.contains('hidden'),
            replay: document.body.classList.contains('replay-active'),
            modal: !document.getElementById('modal-overlay').classList.contains('hidden'),
          }));
          record.check(`${label}: Keep Exploring opens one fresh board with nothing left over`, fresh.revealed === 0 && !fresh.dialogue && !fresh.replay && !fresh.modal, fresh);
          await record.shot(page, `replay-${profile}-fresh`);
        } finally {
          await closeAudited(page);
        }
      });
    }
  },

  async keyboard(browser) {
    const record = scenario('accessibility-keyboard');
    await runCase('accessibility-keyboard', 'desktop-wide en keyboard only', async () => {
      const page = await open(browser, 'keyboard desktop-wide en', 'desktop-wide', { language: 'en' });
      const path = [];
      try {
        await sleep(500);
        const lobbyFocus = await focusStaysIn(page, '#lobby-overlay', 24, 8);
        record.check('lobby: Tab and Shift+Tab stay inside the lobby dialog', lobbyFocus.escapes.length === 0, lobbyFocus);
        const order = [];
        for (let step = 0; step < 14; step += 1) {
          await key(page, 'Tab');
          order.push(await focused(page));
        }
        record.note('lobby tab order', order.map(({ id, name }) => `${id} (${name})`));
        record.check('lobby: every focused control is visible, named, and shows a focus ring',
          order.every((focus) => focus.visible && focus.name.length > 0 && focus.ring), order.filter((focus) => !(focus.visible && focus.name && focus.ring)));

        path.push(...(await tabTo(page, '#btn-language-toggle-lobby')));
        await key(page, 'Enter');
        await page.waitFor(() => document.documentElement.lang.startsWith('zh'), { message: 'Chinese' });
        await key(page, 'Enter');
        await page.waitFor(() => document.documentElement.lang.startsWith('en'), { message: 'English' });
        record.check('lobby: Enter on the language button switches the language both ways', true);

        path.push(...(await tabTo(page, '#btn-control-settings-lobby')));
        await key(page, 'Enter');
        await page.waitFor(() => !document.getElementById('control-settings-overlay').classList.contains('hidden'), { message: 'settings' });
        const settingsFocus = await page.evaluate(() => document.getElementById('control-settings-overlay').contains(document.activeElement));
        await key(page, 'Escape');
        await page.waitFor(() => document.getElementById('control-settings-overlay').classList.contains('hidden'), { message: 'settings to close' });
        const settingsReturn = await page.evaluate(() => document.activeElement?.id);
        record.check('settings: opens from the keyboard with focus inside, Escape closes it and returns focus',
          settingsFocus && settingsReturn === 'btn-control-settings-lobby', { settingsFocus, settingsReturn });

        path.push(...(await tabTo(page, '#btn-lobby-task')));
        await key(page, 'Enter');
        path.push(...(await tabTo(page, '#btn-task-campaign')));
        await key(page, 'Space');
        path.push(...(await tabTo(page, '#btn-start-task')));
        await record.shot(page, 'keyboard-lobby-focus');
        await key(page, 'Enter');
        await waitDialogueOpen(page);
        await sleep(300);
        const dialogue = await dialogueFacts(page);
        record.check('dialogue: starting a mission with Enter moves focus into the guide dialogue', dialogue.focusInside, dialogue);
        await record.shot(page, 'keyboard-dialogue-focus');
        let presses = 0;
        for (; presses < 16 && !(await hidden(page, 'tutorial-overlay')); presses += 1) {
          const onNext = await page.evaluate(() => document.activeElement?.id === 'btn-tutorial-next');
          if (!onNext) path.push(...(await tabTo(page, '#btn-tutorial-next', { limit: 8 })));
          await key(page, 'Enter');
          await sleep(300);
        }
        const afterDialogue = await page.evaluate(() => ({
          closed: document.getElementById('tutorial-overlay').classList.contains('hidden'),
          focusInHidden: document.getElementById('tutorial-overlay').contains(document.activeElement),
        }));
        record.check('dialogue: Enter reads through the dialogue and focus does not stay on the closed dialogue',
          afterDialogue.closed && !afterDialogue.focusInHidden, { presses, ...afterDialogue });

        const hud = [];
        for (let step = 0; step < 80; step += 1) {
          await key(page, 'Tab');
          const focus = await focused(page);
          hud.push(focus);
          if (focus.id === 'btn-return-lobby') break;
        }
        record.note('in-game tab order', hud.map(({ id, name }) => `${id} (${name})`));
        // "body" is the end of the page's tab order: focus passes to the
        // browser's own controls once, then starts again at the top.
        const stops = hud.filter((focus) => focus.id !== 'body');
        record.check('in game: Tab reaches Return to Lobby through visible, named controls',
          hud.at(-1)?.id === 'btn-return-lobby' && stops.every((focus) => focus.visible && focus.name.length > 0)
            && hud.filter((focus) => focus.id === 'body').length <= 1,
          stops.filter((focus) => !(focus.visible && focus.name)));
        await key(page, 'Enter');
        await page.waitFor(() => !document.getElementById('lobby-overlay').classList.contains('hidden'), { message: 'the lobby' });
        const lobbyAgain = await page.evaluate(() => document.getElementById('lobby-overlay').contains(document.activeElement));
        record.check('in game: Enter on Return to Lobby reopens the lobby with focus inside', lobbyAgain);

        // Replay controls: win a small board, then drive the replay with the keyboard.
        path.push(...(await tabTo(page, '#btn-task-freeplay')));
        await key(page, 'Space');
        path.push(...(await tabTo(page, '#lobby-freeplay-panel .task-mission-option[data-mission="easy"], .task-mission-option[data-mission="easy"]')));
        await key(page, 'Space');
        path.push(...(await tabTo(page, '#btn-start-task')));
        await key(page, 'Enter');
        await page.waitFor(() => window.__game.roomSnapshot?.mode === 'solo' && document.getElementById('lobby-overlay').classList.contains('hidden'), { message: 'free mode' });
        await waitForBoardSettled(page);
        await digFirstCell(page, await cellCenterOnScreen(page, { x: 2, y: 2, z: 2 }));
        await waitForBoardSettled(page);
        if ((await page.evaluate(() => window.__game.roomSnapshot.phase)) !== 'won') {
          path.push(...(await tabTo(page, '#btn-auto-survey-start', { limit: 80 })));
          await key(page, 'Enter');
          await page.waitFor(() => window.__game.roomSnapshot.phase === 'won', { timeoutMs: 60_000, message: 'the win' });
        }
        await page.waitFor(() => !document.getElementById('btn-tutorial-replay').classList.contains('hidden')
          && !document.getElementById('tutorial-overlay').classList.contains('hidden'), { timeoutMs: 20_000, message: 'the win dialogue' });
        await sleep(400);
        path.push(...(await tabTo(page, '#btn-tutorial-replay', { limit: 8 })));
        await key(page, 'Enter');
        await page.waitFor(() => Boolean(window.__game.successReplay), { message: 'the replay' });
        path.push(...(await tabTo(page, '#btn-replay-pause', { limit: 40 })));
        await key(page, 'Space');
        const replayPaused = await page.evaluate(() => window.__game.successReplay?.paused === true);
        await record.shot(page, 'keyboard-replay-focus');
        // The dimmed side-panel buttons stay in the tab order during the
        // replay; activating one must not touch the board.
        const lockedBefore = await page.evaluate(() => ({ phase: window.__game.roomSnapshot.phase, revision: window.__game.roomSnapshot.revision }));
        path.push(...(await tabTo(page, '#btn-restart', { limit: 40 })));
        await key(page, 'Enter');
        await sleep(800);
        const lockedAfter = await page.evaluate(() => ({
          phase: window.__game.roomSnapshot.phase,
          revision: window.__game.roomSnapshot.revision,
          replay: Boolean(window.__game.successReplay),
        }));
        record.check('replay: Enter on Reinitialize Minefield during the replay leaves the board and the replay alone',
          lockedAfter.replay && lockedAfter.phase === lockedBefore.phase && lockedAfter.revision === lockedBefore.revision, { lockedBefore, lockedAfter });
        path.push(...(await tabTo(page, '#btn-replay-exit', { limit: 40 })));
        await key(page, 'Enter');
        await page.waitFor(() => !window.__game.successReplay, { message: 'the replay to close' });
        record.check('replay: Space pauses and Enter exits the replay from the keyboard', replayPaused);
        record.note('keyboard path', path);

        const tree = await page.send('Accessibility.getFullAXTree');
        const buttons = tree.nodes.filter((node) => node.role?.value === 'button' && !node.ignored);
        const unnamed = buttons.filter((node) => !String(node.name?.value ?? '').trim());
        record.check('accessibility tree: every exposed button has a name', unnamed.length === 0, { buttons: buttons.length, unnamed: unnamed.length });
        const dialogs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((element) => ({
          id: element.id,
          modal: element.getAttribute('aria-modal'),
          label: document.getElementById(element.getAttribute('aria-labelledby') ?? '')?.textContent.trim() ?? element.getAttribute('aria-label') ?? '',
        })));
        record.check('every dialog is modal and labelled', dialogs.length >= 4 && dialogs.every((dialog) => dialog.modal === 'true' && dialog.label.length > 0), dialogs);
        record.note('accessibility tree buttons', buttons.map((node) => node.name?.value).slice(0, 80));
      } finally {
        await closeAudited(page);
      }
    });
  },
};

const browser = await launchBrowser();
try {
  results.browser = browser.version.product;
  for (const part of parts) {
    if (!PARTS[part]) throw new Error(`unknown part ${part}`);
    console.log(`part ${part}`);
    await PARTS[part](browser);
  }
} finally {
  await browser.close();
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 2)}\n`);
}
const failures = Object.entries(results)
  .filter(([, entry]) => entry?.checks)
  .flatMap(([id, entry]) => entry.checks.filter((check) => !check.pass).map((check) => `${id}: ${check.name}`));
console.log(failures.length ? `${failures.length} failing checks` : 'all recorded checks pass');
