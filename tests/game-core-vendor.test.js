import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workerEngine = readFileSync(new URL('../worker/room-engine.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const vendorEngine = readFileSync(new URL('../public/vendor/game-core/room-engine.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const workerBeginner = readFileSync(new URL('../worker/beginner-layout.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace('"../public/minesweeper-solver.js"', '"../../minesweeper-solver.js"');
const vendorBeginner = readFileSync(new URL('../public/vendor/game-core/beginner-layout.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the browser game core is the exact worker engine source', () => {
  assert.equal(vendorEngine, workerEngine);
});

test('the browser beginner layout differs only by its solver import path', () => {
  assert.equal(vendorBeginner, workerBeginner);
});
