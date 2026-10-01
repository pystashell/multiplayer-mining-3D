// Lays out the real page at the viewport sizes of the release UI review, in
// both languages, and checks two spots the v4.1.2 review found broken:
// - the lobby's protocol label shares its top row with the settings and
//   language buttons pinned to the top-right corner, and ran under the
//   settings button on phones in English;
// - the slice bar's per-axis range labels ran into the next axis and under
//   Show All on desktop windows narrower than about 1300 px.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from './support/browser.js';
import { startStaticServer } from './support/static-server.js';
import { acquireHeavySlot, disposeAll } from './support/heavy-slot.js';
import { openGame } from './support/game-page.js';

const PHONES = Object.freeze({
  'mobile-standard': { width: 390, height: 844 },
  'mobile-small': { width: 360, height: 640 },
});
const CORNER_BUTTONS = Object.freeze(['btn-control-settings-lobby', 'btn-language-toggle-lobby']);
// Each desktop slice-bar layout (stacked, two rows, one row) and the edges
// between them, with the review's desktop-compact and desktop-wide sizes.
const DESKTOP_SIZES = Object.freeze([
  { width: 1024, height: 768 },
  { width: 1120, height: 800 },
  { width: 1121, height: 800 },
  { width: 1280, height: 720 },
  { width: 1365, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]);

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

// Every label, slider, and button of the slice bar, as drawn: text by its
// glyphs, controls by their boxes. The bar is laid out behind the lobby too.
function sliceBar(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const panel = document.getElementById('slicing-panel');
    const range = document.createRange();
    const glyphs = (element) => {
      range.selectNodeContents(element);
      const lines = [...range.getClientRects()];
      return lines.length ? {
        left: Math.min(...lines.map((line) => line.left)),
        right: Math.max(...lines.map((line) => line.right)),
        top: Math.min(...lines.map((line) => line.top)),
        bottom: Math.max(...lines.map((line) => line.bottom)),
      } : null;
    };
    const items = [...panel.querySelectorAll('.slice-panel-header strong, .slice-axis-label, output, input, button')]
      .filter((element) => element.getClientRects().length && getComputedStyle(element).display !== 'none')
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const box = ['INPUT', 'BUTTON'].includes(element.tagName)
          ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
          : glyphs(element);
        return box && { name: element.id || element.textContent.trim(), ...box };
      })
      .filter(Boolean);
    const { left, right, top, bottom } = panel.getBoundingClientRect();
    return { items, panel: { left, right, top, bottom } };
  });
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
  test(`keeps every slice-bar label and control apart and inside the bar at desktop widths in ${language}`, { timeout: 240_000 }, async () => {
    const page = await openGame(browser, server.url, { isolated: true, language, ...DESKTOP_SIZES[0] });
    try {
      for (const size of DESKTOP_SIZES) {
        await page.setViewport(size);
        const { items, panel } = await sliceBar(page);
        assert.equal(items.length, 14, `${size.width}px: title, three axes with two sliders and a range each, and Show All`);
        for (const item of items) {
          assert.ok(item.left >= panel.left - 0.5 && item.right <= panel.right + 0.5,
            `${size.width}px: ${item.name} sticks out of the slice bar: ${JSON.stringify({ item, panel })}`);
        }
        for (let first = 0; first < items.length; first += 1) {
          for (let second = first + 1; second < items.length; second += 1) {
            assert.ok(!overlaps(items[first], items[second]),
              `${size.width}px: ${items[first].name} overlaps ${items[second].name}: ${JSON.stringify([items[first], items[second]])}`);
          }
        }
      }
    } finally {
      await page.close();
    }
  });
}
