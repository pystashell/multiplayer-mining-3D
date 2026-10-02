// Checks the stylesheet's custom properties. A var() whose property is never
// defined (and has no fallback) does not fail loudly: the browser drops the
// whole declaration at computed-value time. Until v4.1.3, --font-ui was read
// by 38 font shorthands and never defined, so all of that text inherited its
// font, and --text-secondary did the same to two button colours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('every custom property the stylesheet reads is defined in it or has a fallback', () => {
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const missing = [...css.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)]
    .filter(([, name, next]) => next === ')' && !defined.has(name))
    .map(([, name]) => name);
  assert.deepEqual([...new Set(missing)], []);
});

// Players only ever saw these texts at the size they inherit, and the owner
// chose to keep those sizes when --font-ui was finally defined: the rules set
// weight, line height, and family, and leave the size at 1em.
test('interface text that uses --font-ui keeps the font size it inherits', () => {
  const declarations = [...css.matchAll(/font:\s*([^;]*var\(--font-ui\)[^;]*);/g)].map((match) => match[1].trim());
  assert.ok(declarations.length >= 30, `found ${declarations.length} --font-ui font declarations`);
  const sized = declarations.filter((value) => !/(?:^|\s)1em(?:\/|\s)/.test(value));
  assert.deepEqual(sized, [], 'these --font-ui declarations set their own size instead of 1em');
});
