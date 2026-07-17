import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

function sourceBetween(start, end) {
  const from = appSource.indexOf(start);
  const to = appSource.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing ${start}`);
  assert.ok(to > from, `missing ${end}`);
  return appSource.slice(from, to);
}

test('calibrates input mode before lobby click handlers and carries it through the SPA', () => {
  const constructorSource = sourceBetween('  constructor() {', '  // 绑定 HTML 交互元素');
  assert.match(constructorSource, /detectInitialInputMode\([\s\S]*matchMedia[\s\S]*maxTouchPoints/);
  assert.match(constructorSource, /document\.body\.dataset\.inputMode = this\.inputMode/);

  const bindSource = sourceBetween('  bindUI() {', '  handleConfiguredWheel(event) {');
  assert.match(bindSource, /this\.bindInputModeTracking\(\)/);
  assert.ok(bindSource.indexOf('this.bindInputModeTracking()') < bindSource.indexOf("btn-start-task"));

  const trackingSource = sourceBetween('  bindInputModeTracking() {', '  setInputMode(inputMode) {');
  assert.match(trackingSource, /document\.addEventListener\('pointerdown'/);
  assert.match(trackingSource, /capture:\s*true/);
  assert.match(trackingSource, /inputModeFromPointerType\(event\.pointerType, this\.inputMode\)/);
  assert.doesNotMatch(trackingSource, /innerWidth|screen\.width|userAgent/);
});

test('uses one input-aware translation path and refreshes every active instruction surface', () => {
  assert.match(appSource, /t\(key, params = \{\}\) \{\s*return translateForInput\(this\.language, key, this\.inputMode, params\)/);
  const refreshSource = sourceBetween('  refreshInputModeCopy() {', '  rollNickname() {');
  assert.match(refreshSource, /localizeDocumentElements\(\)/);
  assert.match(refreshSource, /updateControlCopy\(\)/);
  assert.match(refreshSource, /this\.dialogueState && !this\.waitingTutorialAction/);
  assert.match(refreshSource, /setTutorialActionHint/);
  assert.match(refreshSource, /renderGuidedHint/);
  assert.match(refreshSource, /renderSolverHint/);

  const guidedTargetSource = sourceBetween('  setGuidedTarget(target) {', '  createGuidedTargetMarker');
  assert.match(guidedTargetSource, /this\.inputMode === 'touch'/);
  assert.doesNotMatch(guidedTargetSource, /pointer:\s*coarse|innerWidth/);
});
