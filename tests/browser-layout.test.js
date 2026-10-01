// Lays out the real page at the viewport sizes of the release UI review, in
// both languages, and checks spots the v4.1.2 review found broken:
// - the lobby's protocol label shares its top row with the settings and
//   language buttons pinned to the top-right corner, and ran under the
//   settings button on phones in English;
// - the slice bar's per-axis range labels ran into the next axis and under
//   Show All on desktop windows narrower than about 1300 px, and below
//   1000 px the bar ran over the side panels;
// - the bottom hint stack ran over the side panels on 1280 px desktops;
// - the volume labels broke mid-word in their narrow column, and the phone
//   status bar broke the flag count ("2 /" over "3") and its Chinese label.
// The board HUD is checked in a solo game, where it differs from the layout
// behind the lobby. The squad layout differs only through the side-panel
// rules keyed on body[data-game-mode], so it is checked by switching that
// attribute on the same page instead of starting a Worker. CSS transitions
// are turned off so each viewport is measured where it comes to rest.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from './support/browser.js';
import { startStaticServer } from './support/static-server.js';
import { acquireHeavySlot, disposeAll } from './support/heavy-slot.js';
import { openGame, startFreeplay } from './support/game-page.js';

const PHONES = Object.freeze({
  'mobile-standard': { width: 390, height: 844 },
  'mobile-small': { width: 360, height: 640 },
});
const CORNER_BUTTONS = Object.freeze(['btn-control-settings-lobby', 'btn-language-toggle-lobby']);
// Each desktop slice-bar layout (stacked, two rows, one row) and the edges
// between them, with the review's desktop-compact and desktop-wide sizes.
const DESKTOP_SIZES = Object.freeze([
  { width: 901, height: 700 },
  { width: 960, height: 720 },
  { width: 1024, height: 768 },
  { width: 1080, height: 800 },
  { width: 1120, height: 800 },
  { width: 1121, height: 800 },
  { width: 1280, height: 720 },
  { width: 1365, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]);
// From this width up there is room for the hint stack between the panels.
const HINT_STACK_FITS_FROM = 1080;
// Flag counts from a fresh hard board up to the largest custom board.
const FLAG_COUNTS = Object.freeze(['0 / 30', '10 / 30', '200 / 200']);

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

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// Starts a small solo board, the state the board HUD is designed for, with
// CSS transitions off.
async function openBoard(size, language, input = {}) {
  const page = await openGame(browser, server.url, { isolated: true, language, ...size, ...input });
  await startFreeplay(page, 'easy');
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.append(style);
  });
  return page;
}

// Boxes of the protocol label's rendered text (not its padding), the corner
// buttons, and the lobby, once the bundled fonts have loaded.
function topRow(page, buttonIds) {
  return page.evaluate(async (ids) => {
    await document.fonts.ready;
    const box = ({ left, right, top, bottom }) => ({ left, right, top, bottom });
    const label = document.querySelector('#lobby-modal .lobby-protocol');
    const range = document.createRange();
    range.selectNodeContents(label);
    const lines = [...range.getClientRects()];
    return {
      text: label.textContent.trim(),
      label: lines.length ? {
        left: Math.min(...lines.map((line) => line.left)),
        right: Math.max(...lines.map((line) => line.right)),
        top: Math.min(...lines.map((line) => line.top)),
        bottom: Math.max(...lines.map((line) => line.bottom)),
      } : null,
      buttons: Object.fromEntries(ids.map((id) => [id, box(document.getElementById(id).getBoundingClientRect())])),
      lobby: box(document.getElementById('lobby-modal').getBoundingClientRect()),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  }, buttonIds);
}

// The desktop HUD as drawn: every slice-bar label, slider, and button (text
// by its glyphs, controls by their boxes), the bar, the bottom hint stack, the
// side panels, and how many lines each volume label takes.
function desktopHud(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const box = (element) => {
      const { left, right, top, bottom, width } = element.getBoundingClientRect();
      return { left, right, top, bottom, width };
    };
    const range = document.createRange();
    const glyphs = (element) => {
      range.selectNodeContents(element);
      const lines = [...range.getClientRects()];
      return lines.length ? {
        left: Math.min(...lines.map((line) => line.left)),
        right: Math.max(...lines.map((line) => line.right)),
        top: Math.min(...lines.map((line) => line.top)),
        bottom: Math.max(...lines.map((line) => line.bottom)),
        lines: new Set(lines.map((line) => Math.round(line.top))).size,
      } : null;
    };
    const panel = document.getElementById('slicing-panel');
    const items = [...panel.querySelectorAll('.slice-panel-header strong, .slice-axis-label, output, input, button')]
      .filter((element) => element.getClientRects().length && getComputedStyle(element).display !== 'none')
      .map((element) => {
        const shape = ['INPUT', 'BUTTON'].includes(element.tagName) ? box(element) : glyphs(element);
        return shape && { name: element.id || element.textContent.trim(), ...shape };
      })
      .filter(Boolean);
    return {
      items,
      slice: box(panel),
      stack: box(document.querySelector('.floating-assist-stack')),
      leftPanel: box(document.getElementById('control-panel')),
      rightPanel: box(document.getElementById('social-panel')),
      volumeLabels: [...document.querySelectorAll('.audio-volume-row > span')]
        .map((label) => ({ text: label.textContent.trim(), lines: glyphs(label)?.lines ?? 0 })),
    };
  });
}

// The phone status bar's middle cell with each flag count in turn: whether
// the count stays on one line, where the label breaks, and whether the cell
// holds its content. Also the lines each volume label takes in the drawer.
function phoneHud(page, counts) {
  return page.evaluate(async (values) => {
    await document.fonts.ready;
    const lineTops = (element) => {
      const text = element.firstChild;
      const range = document.createRange();
      const tops = [];
      for (let index = 0; index < text.length; index += 1) {
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const rect = range.getClientRects()[0];
        tops.push(rect ? Math.round(rect.top) : null);
      }
      return tops;
    };
    const lines = (element) => new Set(lineTops(element).filter((top) => top !== null)).size;
    // A line may only end next to a space: never inside a word.
    const wordBreaks = (element) => {
      const tops = lineTops(element);
      const text = element.textContent;
      const breaks = [];
      for (let index = 1; index < tops.length; index += 1) {
        if (tops[index] === null || tops[index - 1] === null || tops[index] === tops[index - 1]) continue;
        if (text[index] !== ' ' && text[index - 1] !== ' ') breaks.push(`${text.slice(0, index)}|${text.slice(index)}`);
      }
      return breaks;
    };
    const value = document.getElementById('mobile-stat-mines');
    const cell = value.parentElement;
    const label = cell.querySelector('span');
    const original = value.textContent;
    const results = values.map((count) => {
      value.textContent = count;
      const outer = cell.getBoundingClientRect();
      return {
        count,
        valueLines: lines(value),
        labelBreaksInsideWords: wordBreaks(label),
        contained: [...cell.children].every((child) => {
          const inner = child.getBoundingClientRect();
          return inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
        }),
      };
    });
    value.textContent = original;
    return {
      results,
      volumeLabels: [...document.querySelectorAll('.audio-volume-row > span')]
        .map((element) => ({ text: element.textContent.trim(), lines: lines(element) })),
    };
  }, counts);
}

for (const [profile, size] of Object.entries(PHONES)) {
  for (const language of ['en', 'zh']) {
    test(`keeps the lobby's protocol label clear of the corner buttons on ${profile} in ${language}`, { timeout: 240_000 }, async () => {
      const page = await openGame(browser, server.url, { isolated: true, language, ...size, mobile: true, touch: true });
      try {
        const row = await topRow(page, CORNER_BUTTONS);
        assert.ok(row.text && row.label, 'the lobby shows its protocol label');
        assert.ok(row.label.left >= row.lobby.left && row.label.right <= row.lobby.right, 'the label stays inside the lobby');
        for (const [id, button] of Object.entries(row.buttons)) {
          assert.ok(!overlaps(row.label, button), `#${id} covers "${row.text}": ${JSON.stringify({ label: row.label, button })}`);
        }
        assert.equal(row.horizontalOverflow, false, 'the page does not scroll sideways');
      } finally {
        await page.close();
      }
    });
  }
}

for (const language of ['en', 'zh']) {
  test(`keeps the slice bar, hint stack, side panels, and volume labels apart at desktop widths in ${language}`, { timeout: 240_000 }, async () => {
    const page = await openBoard(DESKTOP_SIZES[0], language);
    try {
      for (const mode of ['task', 'multiplayer']) {
        await page.evaluate((value) => { document.body.dataset.gameMode = value; }, mode);
        for (const size of DESKTOP_SIZES) {
          await page.setViewport(size);
          const hud = await desktopHud(page);
          const at = `${mode} ${size.width}px`;
          assert.equal(hud.items.length, 14, `${at}: title, three axes with two sliders and a range each, and Show All`);
          for (const item of hud.items) {
            assert.ok(item.left >= hud.slice.left - 0.5 && item.right <= hud.slice.right + 0.5,
              `${at}: ${item.name} sticks out of the slice bar: ${JSON.stringify({ item, slice: hud.slice })}`);
          }
          for (let first = 0; first < hud.items.length; first += 1) {
            for (let second = first + 1; second < hud.items.length; second += 1) {
              assert.ok(!overlaps(hud.items[first], hud.items[second]),
                `${at}: ${hud.items[first].name} overlaps ${hud.items[second].name}: ${JSON.stringify([hud.items[first], hud.items[second]])}`);
            }
          }
          for (const side of [hud.leftPanel, hud.rightPanel]) {
            assert.ok(!overlaps(hud.slice, side), `${at}: the slice bar runs over a side panel: ${JSON.stringify({ slice: hud.slice, side })}`);
          }
          // Squads show no hints and keep the volume controls in the same panel.
          if (mode !== 'task') continue;
          assert.ok(hud.stack.width >= 359.5 && hud.stack.width <= 720.5, `${at}: the hint stack is ${hud.stack.width}px wide`);
          if (size.width >= HINT_STACK_FITS_FROM) {
            assert.ok(hud.stack.left >= hud.leftPanel.right && hud.stack.right <= hud.rightPanel.left,
              `${at}: the hint stack runs over a side panel: ${JSON.stringify({ stack: hud.stack, left: hud.leftPanel, right: hud.rightPanel })}`);
          }
          for (const label of hud.volumeLabels) {
            assert.equal(label.lines, 1, `${at}: "${label.text}" takes ${label.lines} lines`);
          }
        }
      }
    } finally {
      await page.close();
    }
  });

  test(`keeps phone status-bar counts and volume labels whole in ${language}`, { timeout: 240_000 }, async () => {
    const page = await openBoard(PHONES['mobile-standard'], language, { mobile: true, touch: true });
    try {
      const huds = {};
      for (const [profile, size] of Object.entries(PHONES)) {
        await page.setViewport({ ...size, mobile: true, touch: true });
        huds[profile] = await phoneHud(page, FLAG_COUNTS);
      }
      for (const [profile, hud] of Object.entries(huds)) {
        for (const result of hud.results) {
          const at = `${profile} "${result.count}"`;
          assert.equal(result.valueLines, 1, `${at}: the flag count wraps`);
          assert.deepEqual(result.labelBreaksInsideWords, [], `${at}: the flag label breaks inside a word`);
          assert.equal(result.contained, true, `${at}: the flag cell spills into its neighbour`);
        }
      }
      for (const [profile, hud] of Object.entries(huds)) {
        for (const label of hud.volumeLabels) {
          assert.equal(label.lines, 1, `${profile}: "${label.text}" takes ${label.lines} lines`);
        }
      }
    } finally {
      await page.close();
    }
  });
}
