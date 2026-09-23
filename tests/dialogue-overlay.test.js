import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextModalTabStop } from '../public/modal-focus.js';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('ignores the compatibility click left behind by a mobile board gesture', () => {
  const bindStart = appSource.indexOf("    const tutorialOverlay = document.getElementById('tutorial-overlay');");
  const bindEnd = appSource.indexOf("    document.getElementById('btn-start-task')", bindStart);
  assert.ok(bindStart >= 0 && bindEnd > bindStart);
  const overlayBinding = appSource.slice(bindStart, bindEnd);

  assert.match(overlayBinding, /tutorialOverlay\.addEventListener\('pointerdown'/);
  assert.doesNotMatch(overlayBinding, /tutorialOverlay\.addEventListener\('click'/);
  assert.match(overlayBinding, /event\.button === 0/);
  assert.match(overlayBinding, /event\.isPrimary !== false/);
  assert.match(overlayBinding, /event\.target === tutorialOverlay/);
  assert.match(overlayBinding, /event\.preventDefault\(\)/);
  assert.match(overlayBinding, /this\.advanceGuideDialogue\(\)/);
});

test('cycles keyboard focus through visible dialog controls', () => {
  const controls = ['skip', 'replay', 'continue'];
  assert.equal(nextModalTabStop(controls, 'skip'), 'replay');
  assert.equal(nextModalTabStop(controls, 'continue'), 'skip');
  assert.equal(nextModalTabStop(controls, 'skip', true), 'continue');
  assert.equal(nextModalTabStop(controls, 'outside'), 'skip');
  assert.equal(nextModalTabStop(controls, 'outside', true), 'continue');
  assert.equal(nextModalTabStop([], 'outside'), null);
});
