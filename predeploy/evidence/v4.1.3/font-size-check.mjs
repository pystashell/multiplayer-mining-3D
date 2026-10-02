// v4.1.3 defines --font-ui but must not change any text size. This loads the
// released site and the candidate side by side, starts the same solo board,
// and compares the computed font of every element matched by a rule that uses
// --font-ui, on desktop and phone, in both languages. Writes
// font-size-check.json next to this file; exits non-zero on a size change.
//
//   node predeploy/evidence/v4.1.3/font-size-check.mjs <released-url> <candidate-url>
import { writeFileSync } from 'node:fs';
import { launchBrowser } from '../../../tests/support/browser.js';
import { openGame, startFreeplay } from '../../../tests/support/game-page.js';

// Origins without a trailing slash: openGame appends the page path itself.
const [released, candidate] = process.argv.slice(2).map((url) => url?.replace(/\/+$/, ''));
if (!released || !candidate) throw new Error('usage: font-size-check.mjs <released-url> <candidate-url>');

// Selectors of every rule (at any @media level) whose body uses --font-ui.
function fontUiSelectors(css) {
  const selectors = new Set();
  const stack = [];
  let buffer = '';
  for (const char of css) {
    if (char === '{') {
      stack.push({ selector: buffer.trim(), body: '' });
      buffer = '';
    } else if (char === '}') {
      const block = stack.pop();
      if (block && !block.selector.startsWith('@') && /var\(--font-ui\)/.test(block.body + buffer)) {
        for (const part of block.selector.split(',')) selectors.add(part.trim().replace(/\s+/g, ' '));
      }
      buffer = '';
    } else {
      buffer += char;
      if (stack.length) stack[stack.length - 1].body += char;
    }
  }
  return [...selectors];
}

const selectors = fontUiSelectors(await (await fetch(new URL('/style.css', candidate))).text());
const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 390, height: 844, mobile: true, touch: true },
};

async function fonts(browser, url, language, size) {
  const page = await openGame(browser, url, { isolated: true, language, ...size });
  try {
    await startFreeplay(page, 'medium');
    return await page.evaluate((list) => {
      const out = {};
      for (const selector of list) {
        document.querySelectorAll(selector).forEach((element, index) => {
          const style = getComputedStyle(element);
          out[`${selector} #${index}`] = {
            size: style.fontSize,
            weight: style.fontWeight,
            family: style.fontFamily.split(',')[0].replace(/"/g, '').trim(),
            lineHeight: style.lineHeight,
          };
        });
      }
      return out;
    }, selectors);
  } finally {
    await page.close();
  }
}

const browser = await launchBrowser();
const report = { released, candidate, browser: browser.version.product, selectors: selectors.length, cases: {} };
let sizeChanges = 0;
try {
  for (const language of ['zh', 'en']) {
    for (const [name, size] of Object.entries(VIEWPORTS)) {
      const before = await fonts(browser, released, language, size);
      const after = await fonts(browser, candidate, language, size);
      const keys = Object.keys(before);
      const changedSize = keys.filter((key) => before[key].size !== after[key]?.size)
        .map((key) => ({ element: key, before: before[key].size, after: after[key]?.size }));
      const restyled = keys.filter((key) => before[key].size === after[key]?.size
        && (before[key].weight !== after[key].weight || before[key].family !== after[key].family || before[key].lineHeight !== after[key].lineHeight))
        .map((key) => ({ element: key, before: before[key], after: after[key] }));
      const sizes = {};
      for (const key of keys) sizes[before[key].size] = (sizes[before[key].size] ?? 0) + 1;
      sizeChanges += changedSize.length + keys.filter((key) => !after[key]).length;
      report.cases[`${language} ${name}`] = { elements: keys.length, sizes, sizeChanges: changedSize, restyled: restyled.length, restyledElements: restyled };
      console.log(`${language} ${name}: ${keys.length} elements, ${changedSize.length} size changes, ${restyled.length} restyled`);
    }
  }
} finally {
  await browser.close();
}
writeFileSync(new URL('font-size-check.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
if (sizeChanges) {
  console.error(`${sizeChanges} elements changed size`);
  process.exitCode = 1;
}
