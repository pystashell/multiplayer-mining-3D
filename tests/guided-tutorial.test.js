import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../public/i18n.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('keeps slice controls in every board and teaches them only in the intermediate mission', () => {
  assert.match(indexSource, /id="slicing-panel"/);
  assert.match(indexSource, /id="btn-mobile-slices"/);
  assert.equal((indexSource.match(/type="range"/g) || []).length, 6);
  assert.match(appSource, /handleSliceChange\(axis, type\)/);
  assert.match(appSource, /updateGridVisibility\(\)/);
  assert.match(appSource, /resetSlices\(userInitiated = false\)/);
  assert.match(appSource, /titleKey: 'tutorial\.sliceTitle'.*action: 'slice'/s);
  assert.match(appSource, /titleKey: 'tutorial\.sliceResetTitle'.*action: 'sliceReset'/s);
  const beginnerTutorial = appSource.match(/startSilverWolfTutorial\(\) \{[\s\S]*?\n  \}\n\n  showSilverWolfDialogue/)?.[0] || '';
  assert.doesNotMatch(beginnerTutorial, /slice/i);
  assert.match(i18nSource, /切片分析/);
  assert.match(i18nSource, /bottom dock on mobile/i);
  assert.match(styleSource, /\.slicing-panel/);
  assert.match(styleSource, /input\[type="range"\]/);
});

test('locks beginner interactions to Silver Wolf’s current highlighted target', () => {
  assert.match(appSource, /beginGuidedTutorial\(\)/);
  assert.match(appSource, /isGuidedActionAllowed\('dig', x, y, z\)/);
  assert.match(appSource, /isGuidedActionAllowed\('flag', x, y, z\)/);
  assert.match(appSource, /kind: 'mine'/);
  assert.match(appSource, /kind: 'safe'/);
  assert.match(appSource, /createGuidedTargetMarker/);
  assert.match(appSource, /createGuidedEvidenceMarkers/);
  assert.match(appSource, /reason: 'compareMine'/);
  assert.match(appSource, /reason: 'directSafe'/);
  assert.match(indexSource, /guided-cell-reason-label/);
  assert.match(indexSource, /guided-cell-pointer-text/);
});

test('keeps Silver Wolf dialogue centered and moves the guided callout outside the board', () => {
  assert.match(appSource, /showSilverWolfDialogue\(steps, \{ allowSkip = false, onComplete = null \} = \{\}\)/);
  assert.doesNotMatch(appSource, /avoidBoard|board-clear/);
  assert.doesNotMatch(styleSource, /board-clear/);
  assert.match(indexSource, /id="guided-cell-leader"/);
  assert.match(appSource, /guidedBoardScreenBounds\(\)/);
  assert.match(appSource, /chooseGuidedCalloutPlacement/);
  assert.match(appSource, /positionGuidedLeader/);
  assert.match(styleSource, /\.guided-cell-leader/);
});

test('shows the auto-reveal lesson once, only in intermediate after a new flag completes a clue', () => {
  assert.match(appSource, /this\.mediumChordTipShown = false/);
  assert.match(appSource, /maybeShowMediumChordTip\(snapshot, previous\)/);
  assert.match(appSource, /this\.taskMission !== 'medium'/);
  assert.match(appSource, /snapshot\.phase !== 'playing'/);
  assert.match(appSource, /snapshot\.flags\?\.length[\s\S]*?previous\.flags\?\.length/);
  assert.match(appSource, /const clue = findChordOpportunity\(snapshot\)/);
  assert.match(appSource, /this\.mediumChordTipShown = true/);
  assert.match(appSource, /chordTipTitle'/);
  assert.match(i18nSource, /电脑把指针放在数字上，同时按下左右键/);
  assert.match(i18nSource, /单击未开启格继续加旗，双击已开启数字自动展开/);
});
