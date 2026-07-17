import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../public/i18n.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('keeps the advanced Reduction objective visible until one mine is truly removed', () => {
  const pendingStart = appSource.indexOf('  hardReductionObjectivePending(snapshot = this.roomSnapshot) {');
  const pendingEnd = appSource.indexOf('  updateSoloGuide() {', pendingStart);
  const pendingSource = appSource.slice(pendingStart, pendingEnd);
  assert.ok(pendingStart >= 0 && pendingEnd > pendingStart);
  assert.match(pendingSource, /this\.gameMode === 'solo'/);
  assert.match(pendingSource, /this\.taskFlow === 'campaign'/);
  assert.match(pendingSource, /this\.taskMission === 'hard'/);
  assert.match(pendingSource, /snapshot\?\.config\?\.reduction === true/);
  assert.match(pendingSource, /Number\(snapshot\.reducedMineCount \?\? 0\) === 0/);
  assert.match(pendingSource, /\['ready', 'playing', 'revive'\]\.includes\(snapshot\.phase\)/);
  assert.doesNotMatch(pendingSource, /lastPurge/);

  assert.match(appSource, /objective\.textContent = this\.hardReductionObjectivePending\(\)[\s\S]*task\.hard\.guide\.reduceOne/);
  assert.match(appSource, /!this\.dialogueState && this\.hardReductionObjectivePending\(\)[\s\S]*\? 'reduce'/);
  assert.match(appSource, /tutorial\.actionHint\.\$\{displayAction\}/);
  assert.match(appSource, /if \(action === 'reduce'\) return Number\(this\.roomSnapshot\?\.reducedMineCount \?\? 0\) > 0/);
  assert.match(appSource, /if \(Number\(this\.roomSnapshot\?\.reducedMineCount \?\? 0\) > 0\) this\.completeTutorialAction\('reduce'\)/);
  assert.equal((appSource.match(/titleKey: 'reduction\.tutorialTitle'/g) || []).length, 1);

  assert.match(i18nSource, /'task\.hard\.guide\.reduceOne': '消除一颗地雷'/);
  assert.match(i18nSource, /'tutorial\.actionHint\.reduce': '高级任务：消除一颗地雷。手机端：双击未开启格子；电脑端：将鼠标对准方块，同时按下左右键。'/);
  assert.match(i18nSource, /'task\.hard\.guide\.reduceOne': 'Eliminate one mine'/);
  assert.match(i18nSource, /'tutorial\.actionHint\.reduce': 'ADVANCED OBJECTIVE: eliminate one mine\.[^']*double-tap[^']*both mouse buttons together\.'/i);
});

test('keeps slice controls available without proactively teaching or highlighting them', () => {
  assert.match(indexSource, /id="slicing-panel"/);
  assert.match(indexSource, /id="btn-mobile-slices"/);
  assert.equal((indexSource.match(/type="range"/g) || []).length, 6);
  assert.match(appSource, /handleSliceChange\(axis, type\)/);
  assert.match(appSource, /updateGridVisibility\(\)/);
  assert.match(appSource, /resetSlices\(userInitiated = false\)/);
  assert.doesNotMatch(appSource, /tutorial\.slice|action:\s*'slice(?:Reset)?'|hasUsedSlices|hasResetSlices|focusSliceTutorial/);
  assert.doesNotMatch(appSource, /(?:slicing-panel|btn-mobile-slices|btn-reset-slices)[^\n]*tutorial-target/);
  assert.match(i18nSource, /切片分析/);
  assert.match(i18nSource, /3D slice analysis/i);
  assert.doesNotMatch(i18nSource, /'tutorial\.(?:slice|sliceReset)|'tutorial\.actionHint\.slice/);
  assert.match(styleSource, /\.slicing-panel/);
  assert.match(styleSource, /input\[type="range"\]/);
  assert.doesNotMatch(styleSource, /(?:slicing-panel|btn-mobile-slices|btn-reset-slices)\.tutorial-target/);
});

test('continuously derives and locks beginner actions to Silver Wolf’s certain solver target', () => {
  assert.match(appSource, /beginGuidedTutorial\(\)/);
  assert.doesNotMatch(appSource, /BEGINNER_TUTORIAL_ROUTE/);
  assert.match(appSource, /solveMinesweeperHint\(\{[\s\S]*?revealed: snapshot\.revealed[\s\S]*?flags: snapshot\.flags/);
  assert.match(appSource, /solverHint\.certainty !== 'certain'/);
  assert.match(appSource, /reseedGuidedBeginnerBoard\(\)/);
  assert.match(appSource, /snapshot\.phase === 'ready'[\s\S]*?snapshot\.revision !== this\.guidedRecoveryRevision/);
  assert.match(appSource, /guidedRecoveryRevision = this\.roomSnapshot\?\.revision \?\? null/);
  assert.match(appSource, /guidedRecoveryRevision = null;\s+if \(!this\.guidedTutorialActive\) return;/);
  assert.doesNotMatch(appSource, /send\(\{ op: 'restart', config: TASK_MISSIONS\.easy \}\)[\s\S]{0,300}?\.finally/);
  assert.match(appSource, /isGuidedActionAllowed\('dig', x, y, z\)/);
  assert.match(appSource, /isGuidedActionAllowed\('flag', x, y, z\)/);
  assert.match(appSource, /beginnerBoardInputLocked = true/);
  assert.match(appSource, /blockBeginnerBoardInput\(\)/);
  assert.doesNotMatch(appSource, /waitingTutorialAction \|\| 'observe'|action: 'observe'/);
  assert.match(appSource, /guidedPendingAction/);
  assert.match(appSource, /kind: solverHint\.action === 'flag' \? 'mine' : 'safe'/);
  assert.match(appSource, /createGuidedTargetMarker/);
  assert.match(appSource, /createGuidedEvidenceMarkers/);
  assert.match(appSource, /solver\.reason\.\$\{target\.solverHint\.rule\}/);
  assert.match(appSource, /solver\.action\.\$\{target\.action\}/);
  assert.match(indexSource, /guided-cell-reason-label/);
  assert.match(indexSource, /guided-cell-pointer-text/);
  const renderHintStart = appSource.indexOf('  renderGuidedHint(correction = false');
  const renderHintEnd = appSource.indexOf('  showGuidedCorrection()', renderHintStart);
  const renderHintSource = appSource.slice(renderHintStart, renderHintEnd);
  assert.match(renderHintSource, /this\.renderTutorialActionHint\(message\)/);
  assert.match(renderHintSource, /if \(pointer\) pointer\.title = message/);
  assert.doesNotMatch(renderHintSource, /\bhintText\b/);
});

test('pauses the beginner route after the first visible number and teaches neighbor inspection', () => {
  assert.match(appSource, /this\.guidedInspectExplained = false/);
  assert.match(appSource, /this\.guidedInspectLessonActive = false/);
  assert.match(appSource, /const inspectableNumber = \(snapshot\.revealed \|\| \[\]\)\.find\(\(point\) => Number\(point\.count\) > 0\)/);
  assert.match(appSource, /snapshot\.phase === 'playing' && inspectableNumber && !this\.guidedInspectExplained/);
  assert.match(appSource, /guidedInspectLessonActive\) \{[\s\S]*snapshot\.phase !== 'ready'[\s\S]*guidedInspectExplained = false/);
  assert.match(appSource, /guidedInspectLessonActive = true;[\s\S]*beginnerBoardInputLocked = true;[\s\S]*artKey: 'neighbors'[\s\S]*titleKey: 'tutorial\.beginnerInspectTitle'[\s\S]*action: 'inspect'[\s\S]*titleKey: 'tutorial\.beginnerReasoningTitle'[\s\S]*messageKey: 'tutorial\.beginnerReasoning'/);
  assert.match(appSource, /onComplete: \(\) => \{[\s\S]*guidedInspectLessonActive = false;[\s\S]*beginnerBoardInputLocked = false;[\s\S]*updateGuidedTutorial\(this\.roomSnapshot\)/);
  const inspectionStart = appSource.slice(
    appSource.indexOf('  startNeighborInspection(event)'),
    appSource.indexOf('  highlightNeighborsOn(', appSource.indexOf('  startNeighborInspection(event)')),
  );
  const highlightClear = appSource.slice(
    appSource.indexOf('  clearPointerHighlights('),
    appSource.indexOf('  handlePointerMove(', appSource.indexOf('  clearPointerHighlights(')),
  );
  assert.doesNotMatch(inspectionStart, /completeTutorialAction\('inspect'\)|hasInspectedNeighbors = true/);
  assert.match(highlightClear, /completeInspection && completedNeighborInspection[\s\S]*hasInspectedNeighbors = true;[\s\S]*completeTutorialAction\('inspect'\)/);
  assert.match(appSource, /clearPointerHighlights\(\{ completeInspection: true \}\)/);

  const mediumStart = appSource.indexOf("if (this.taskMission === 'medium') {");
  const mediumEnd = appSource.indexOf("if (this.taskMission === 'ultimate')", mediumStart);
  const mediumDialogue = appSource.slice(mediumStart, mediumEnd);
  assert.match(mediumDialogue, /task\.medium\.upgrade\.1'[\s\S]*task\.medium\.brief\.2'/);
  assert.doesNotMatch(mediumDialogue, /task\.medium\.upgrade\.scan|tutorial\.inspectTitle|action: 'scan'|action: 'inspect'/);
});

test('keeps Silver Wolf dialogue centered and moves the guided callout outside the board', () => {
  assert.match(appSource, /showSilverWolfDialogue\(steps, \{ allowSkip = false, allowReplay = false, onComplete = null \} = \{\}\)/);
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
  assert.match(appSource, /this\.mediumChordObjectiveActive = false/);
  assert.match(appSource, /this\.mediumChordObjectiveTarget = null/);
  assert.match(appSource, /maybeShowMediumChordTip\(snapshot, previous\)/);
  assert.match(appSource, /this\.taskFlow !== 'campaign'/);
  assert.match(appSource, /this\.taskMission !== 'medium'/);
  assert.match(appSource, /snapshot\.phase !== 'playing'/);
  assert.doesNotMatch(appSource, /snapshot\.flags\?\.length[\s\S]*?previous\.flags\?\.length/);
  assert.match(appSource, /const clue = findNewChordOpportunity\(snapshot, previous\)/);
  assert.match(appSource, /this\.mediumChordTipShown = true/);
  assert.match(appSource, /this\.mediumChordObjectiveActive = true/);
  assert.match(appSource, /this\.mediumChordObjectiveTarget = \{ \.\.\.clue \}/);
  assert.match(appSource, /this\.updateMissionGuide\(\);\s*this\.closeMobilePanels\(\);\s*this\.showSilverWolfDialogue/);
  assert.match(appSource, /chordTipTitle'/);
  assert.match(appSource, /buttonKey: 'tutorial\.tryChord'/);
  assert.match(appSource, /maybeCompleteMediumChordObjective\(snapshot, previous\)/);
  assert.match(appSource, /const boardRestarted = snapshot\?\.phase === 'ready' && previous\?\.phase !== 'ready'/);
  assert.match(appSource, /!this\.mediumChordObjectiveActive \|\| \(!boardRestarted && !isNewSuccessfulChord\(snapshot, previous\)\)/);
  assert.match(appSource, /this\.mediumChordObjectiveActive = false;\s*this\.mediumChordObjectiveTarget = null;/);
  assert.match(appSource, /this\.mediumChordObjectivePending\(\)[\s\S]*task\.medium\.guide\.chordOne/);
  assert.match(appSource, /this\.mediumChordObjectivePending\(\) \? 'chord' : null/);
  assert.match(appSource, /tutorial\.actionHint\.\$\{displayAction\}/);
  assert.match(i18nSource, /电脑把指针放在数字上，同时按下左右键/);
  assert.match(i18nSource, /单击未开启格继续加旗，双击已开启数字自动展开/);
  assert.match(i18nSource, /'task\.medium\.guide\.chordOne': '对数字 \{number\} 执行一次自动展开'/);
  assert.match(i18nSource, /'tutorial\.actionHint\.chord': '中级实操：数字 \{number\} 周围的旗子已经标够。[^']*同时按下左右键[^']*双击这个已开启数字/);
});
