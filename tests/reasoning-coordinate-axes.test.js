import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('shows a labeled 3D coordinate axis only while reasoning is active', () => {
  assert.match(appSource, /createReasoningCoordinateAxes\(\)/);
  assert.match(appSource, /label: 'X'.*label: 'Y'.*label: 'Z'/s);
  assert.match(appSource, /chooseFloatingAxisPlacement/);
  assert.match(appSource, /const originWorld = new THREE\.Vector3\(-offsetX, -offsetY, -offsetZ\)/);
  assert.doesNotMatch(appSource, /reasoning-coordinate-origin-leader/);
  assert.doesNotMatch(appSource, /reasoning-coordinate-real-origin/);
  assert.match(appSource, /reasoningCoordinateAxes\.position\.copy\(floatingWorld\)/);
  assert.match(appSource, /if \(this\.guidedTutorialTarget \|\| this\.solverHint\?\.target\) this\.positionReasoningCoordinateAxes\(\)/);
  assert.match(appSource, /this\.positionReasoningCoordinateAxes\(true\);\s*\n\s*this\.resetCamera\(\)/);
  assert.match(appSource, /onWindowResize\(\)[\s\S]*?this\.positionReasoningCoordinateAxes\(\)/);
});

test('hides solver axes after the suggested target action is completed', () => {
  assert.match(appSource, /isSolverHintCompleted\(snapshot, hint = this\.solverHint\)/);
  assert.match(appSource, /hint\.action === 'flag'[\s\S]*snapshot\.flags \|\| \[\][\s\S]*snapshot\.revealed \|\| \[\][\s\S]*snapshot\.purged \|\| \[\]/);
  assert.match(appSource, /previous\?\.revision !== snapshot\.revision && this\.isSolverHintCompleted\(snapshot\)/);
  assert.match(appSource, /clearSolverHint\(\)[\s\S]*?this\.syncReasoningCoordinateAxes\(\)/);
});

test('hides guided axes when the current teaching deduction ends', () => {
  assert.match(appSource, /if \(snapshot\.phase === 'won'\) \{\s*this\.stopGuidedTutorial\(\);/s);
  assert.match(appSource, /stopGuidedTutorial\(\)[\s\S]*?this\.clearGuidedTarget\(\)/);
  assert.match(appSource, /clearGuidedTarget\(\)[\s\S]*?this\.guidedTutorialTarget = null;[\s\S]*?this\.syncReasoningCoordinateAxes\(\)/);
});
