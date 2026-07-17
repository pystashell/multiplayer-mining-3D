import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  assert.match(overlayBinding, /this\.advanceSilverWolfDialogue\(\)/);
});
