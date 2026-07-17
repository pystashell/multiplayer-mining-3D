import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../public/i18n.js', import.meta.url), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing start marker: ${start}`);
  assert.ok(endIndex > startIndex, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('keeps the 9x9x9 ultimate mission hidden while giving it an exact campaign identity', () => {
  assert.match(
    appSource,
    /ultimate:\s*Object\.freeze\(\{[^}]*width:\s*9[^}]*height:\s*9[^}]*depth:\s*9[^}]*mineCount:\s*60[^}]*ruleset:\s*'reduction'[^}]*autoPurge:\s*true[^}]*reduction:\s*true[^}]*campaign:\s*true/s,
  );

  const missionSource = sourceBetween(appSource, '  missionFromConfig(config) {', '  configMatchesMission(');
  assert.match(missionSource, /config\?\.campaign === true/);
  assert.match(missionSource, /config\?\.width === 9[\s\S]*config\?\.height === 9[\s\S]*config\?\.depth === 9[\s\S]*config\?\.mineCount === 60[\s\S]*return 'ultimate'/);
  assert.doesNotMatch(indexSource, /data-mission="ultimate"/);

  const campaignPanel = sourceBetween(indexSource, 'id="lobby-campaign-panel"', 'id="lobby-freeplay-panel"');
  const freeplayPanel = sourceBetween(indexSource, 'id="lobby-freeplay-panel"', 'id="btn-start-task"');
  assert.equal((campaignPanel.match(/class="task-mission-option/g) || []).length, 3);
  assert.equal((freeplayPanel.match(/class="task-mission-option/g) || []).length, 3);
  assert.match(indexSource, /id="btn-task-freeplay"/);
});

test('routes hard completion into the hidden mission and only ultimate completion into Free Mode', () => {
  const completionSource = sourceBetween(appSource, '  showTaskCompletion() {', '  enterFreeModeAfterCampaign() {');
  assert.match(completionSource, /mission === 'ultimate'[\s\S]*task\.ultimate\.completeTitle[\s\S]*tutorial\.enterFreeplay[\s\S]*onComplete:\s*\(\) => this\.enterFreeModeAfterCampaign\(\)/);
  assert.match(completionSource, /mission === 'hard'[\s\S]*buttonKey:\s*'tutorial\.enterUltimate'/);
  assert.match(completionSource, /mission === 'hard' \? 'ultimate' : null/);
  assert.doesNotMatch(completionSource, /mission === 'hard' \? \(\) => this\.enterFreeModeAfterCampaign\(\)/);

  const experienceSource = sourceBetween(appSource, '  maybeStartTaskExperience(snapshot) {', '  maybeShowMediumChordTip(');
  assert.match(experienceSource, /\['ready', 'playing'\]\.includes\(snapshot\.phase\)/);
  assert.match(experienceSource, /this\.taskMission === 'ultimate'[\s\S]*task\.ultimate\.brief\.1[\s\S]*task\.ultimate\.trojanTitle[\s\S]*requiresExplicit:\s*true[\s\S]*onComplete:\s*\(\) => this\.startUltimateHack\(\)/);
  assert.match(appSource, /currentDialogueRequiresExplicitAction\(\)[\s\S]*requiresExplicit/);
  assert.match(appSource, /event\.target === tutorialOverlay && !this\.currentDialogueRequiresExplicitAction\(\)/);
});

test('keeps Ultimate Hack separate from Add-ons and exposes a dedicated live HUD', () => {
  const customStart = indexSource.indexOf('id="custom-toggle"');
  const pickerStart = indexSource.indexOf('id="ruleset-picker"');
  const pickerEnd = indexSource.indexOf('id="ultimate-hack-launch"');
  const launchEnd = indexSource.indexOf('class="panel-section action-section"');
  assert.ok(customStart >= 0 && pickerStart > customStart && pickerEnd > pickerStart && launchEnd > pickerEnd);
  const pickerSource = indexSource.slice(pickerStart, pickerEnd);
  assert.equal((pickerSource.match(/data-feature=/g) || []).length, 2);
  assert.match(indexSource.slice(pickerEnd, launchEnd), /id="btn-ultimate-hack-start"/);
  assert.doesNotMatch(indexSource.slice(pickerEnd, launchEnd), /data-feature=/);

  for (const id of [
    'ultimate-hack-hud',
    'ultimate-hack-stage',
    'ultimate-hack-step',
    'ultimate-hack-progress',
    'btn-ultimate-hack-cancel',
  ]) assert.match(indexSource, new RegExp(`id="${id}"`));

  assert.match(appSource, /ultimateHackStrategy\(snapshot[\s\S]*strategy === 'scan'[\s\S]*config\?\.reduction === false \? 'scan' : 'entropy'/);
  assert.match(appSource, /ultimateHack\.stage\.\$\{strategy\}/);
  assert.match(appSource, /currentBoardProgress\(snapshot\)\.percent/);
});

test('starts only on supported solo surfaces and uses the authoritative three-command protocol', () => {
  const startSource = sourceBetween(appSource, '  startUltimateHack() {', '  cancelUltimateHack() {');
  assert.match(startSource, /this\.gameMode === 'solo'/);
  assert.match(startSource, /this\.taskFlow === 'freeplay'[\s\S]*this\.taskFlow === 'campaign' && this\.taskMission === 'ultimate'/);
  assert.match(startSource, /\['ready', 'playing'\]\.includes\(snapshot\.phase\)/);
  assert.match(startSource, /op:\s*'ultimate_hack_start'/);

  const cancelSource = sourceBetween(appSource, '  cancelUltimateHack() {', '  beginUltimateHackClient(');
  assert.match(cancelSource, /client\.cancelPending = true[\s\S]*clearTimeout\(this\.ultimateHackStepTimer\)[\s\S]*client\.scheduledStepKey = null/);
  assert.match(cancelSource, /op:\s*'ultimate_hack_cancel',\s*runId:\s*hack\.runId/);
  assert.match(cancelSource, /catch[\s\S]*cancelPending = false[\s\S]*scheduleUltimateHackStep/);

  const scheduleSource = sourceBetween(appSource, '  scheduleUltimateHackStep(', '  showTaskCompletion() {');
  assert.match(scheduleSource, /op:\s*'ultimate_hack_step'/);
  assert.match(scheduleSource, /runId:\s*hack\.runId/);
  assert.match(scheduleSource, /expectedStep:\s*Number\(hack\.step\)/);
});

test('deduplicates each observed step, waits for all live wave animations, and resumes from snapshots', () => {
  const snapshotSource = sourceBetween(appSource, '  applyRoomSnapshot(snapshot, initial = false) {', '  missionFromConfig(config) {');
  assert.match(snapshotSource, /this\.syncUltimateHack\(snapshot, previous\)/);

  const syncSource = sourceBetween(appSource, '  syncUltimateHack(snapshot, previous = null) {', '  updateUltimateHackLaunchAvailability(');
  assert.match(syncSource, /this\.ultimateHackClient\?\.runId !== hack\.runId[\s\S]*beginUltimateHackClient\(hack, snapshot\)/);
  assert.match(syncSource, /stepChanged \|\| !this\.ultimateHackClient\.lastRequestedStepKey[\s\S]*scheduleUltimateHackStep\(snapshot\)/);

  const scheduleSource = sourceBetween(appSource, '  scheduleUltimateHackStep(', '  showTaskCompletion() {');
  assert.match(scheduleSource, /const stepKey = `\$\{hack\.runId\}:\$\{String\(hack\.step \?\? 0\)\}`/);
  assert.match(scheduleSource, /client\.lastRequestedStepKey === stepKey \|\| client\.scheduledStepKey === stepKey/);
  assert.match(scheduleSource, /liveHack\?\.status !== 'running'[\s\S]*liveHack\.runId !== hack\.runId[\s\S]*String\(liveHack\.step \?\? 0\)[\s\S]*!== stepKey/);
  assert.match(scheduleSource, /this\.cellRevealAnimations\.length > 0[\s\S]*performance\.now\(\) < this\.revealAnimationEndsAt[\s\S]*this\.sectorPurgeAnimations\.length > 0/);
  assert.match(scheduleSource, /window\.setTimeout\(sendWhenSettled, 80\)/);
});

test('distinguishes automated scan flags with a red visual without recoloring manual flags', () => {
  const snapshotSource = sourceBetween(appSource, '  applyRoomSnapshot(snapshot, initial = false) {', '  missionFromConfig(config) {');
  assert.match(snapshotSource, /automatedScanActive = snapshot\.ultimateHack\?\.status === 'running'[\s\S]*strategy === 'scan'[\s\S]*snapshot\.config\?\.reduction === false/);
  assert.match(snapshotSource, /shouldFlag && \(!previous \|\| !previousFlags\.has\(key\)\)[\s\S]*automatedFlagKeys\.add\(key\)/);
  assert.match(snapshotSource, /setFlagLocal\(x, y, z, shouldFlag, !initial, \{[\s\S]*automated:\s*this\.automatedFlagKeys\.has\(key\)/);

  assert.match(appSource, /this\.geometries\.automatedFlag = automatedFlagGroup/);
  assert.match(appSource, /cellAutomatedFlagged = new THREE\.MeshStandardMaterial\(\{[^}]*color:\s*0xff174d[^}]*emissive:/s);
  assert.match(appSource, /automated \? this\.geometries\.automatedFlag : this\.geometries\.flag/);
  assert.match(appSource, /createExplosion\(world, 0xff174d, 18\)/);
  assert.match(appSource, /flagMaterialForCell\(cell[\s\S]*cell\?\.isAutomatedFlag/);
});

test('locks competing mobile controls and keeps a 44px abort target at the top safe area', () => {
  assert.match(styleSource, /\.ultimate-hack-hud\s*\{[^}]*position:\s*fixed[^}]*top:\s*max\(16px, env\(safe-area-inset-top\)\)/s);
  assert.match(styleSource, /\.ultimate-hack-cancel\s*\{[^}]*min-height:\s*44px/s);
  const mobileSource = sourceBetween(styleSource, '@media (max-width: 900px) {', '@media (max-width: 900px) and (max-height: 620px) {');
  assert.match(mobileSource, /\.ultimate-hack-hud\s*\{[^}]*top:\s*calc\(8px \+ env\(safe-area-inset-top\)\)[^}]*width:\s*calc\(100vw - 16px\)/s);
  assert.match(mobileSource, /\.ultimate-hack-cancel\s*\{[^}]*min-height:\s*44px/s);
  assert.match(mobileSource, /body\.ultimate-hack-active \.mobile-statusbar,[\s\S]*body\.ultimate-hack-active #mobile-control-dock,[\s\S]*body\.ultimate-hack-active #slicing-panel,[\s\S]*body\.ultimate-hack-active \.solver-hint-panel\s*\{[^}]*display:\s*none !important/s);
  assert.match(appSource, /this\.isInteractionLocked = this\.ultimateHackRunning\(snapshot\)/);
});

test('localizes the Ultimate Hack surface and retires the old Reduction brand without touching internal keys', () => {
  for (const key of [
    'ultimateHack.launch',
    'ultimateHack.hudLabel',
    'ultimateHack.stage.entropy',
    'ultimateHack.stage.scan',
    'ultimateHack.step',
    'ultimateHack.progress',
    'ultimateHack.cancel',
    'task.ultimate.chapterTitle',
    'task.ultimate.installButton',
    'task.ultimate.completeTitle',
  ]) {
    assert.equal((i18nSource.match(new RegExp(`'${key.replaceAll('.', '\\.')}'`, 'g')) || []).length, 2, `${key} should exist in zh and en`);
  }
  assert.doesNotMatch(i18nSource, /动态化简|Dynamic Reduction|\bReduction\b|REDUCTION/);
  assert.doesNotMatch(indexSource, /动态化简|Dynamic Reduction|\bReduction\b|REDUCTION/);
  assert.match(appSource, /reduction:\s*true/);
  assert.match(i18nSource, /'reduction\.tutorialTitle'/);
  assert.doesNotMatch(i18nSource, /'task\.ultimate\.(?:trojanFact|installFact)'/);
  assert.doesNotMatch(appSource, /factKey:\s*'task\.ultimate\.(?:trojanFact|installFact)'/);
});

test('keeps the successful replay entry and lifecycle available after auto-solving', () => {
  assert.match(indexSource, /id="btn-tutorial-replay"/);
  assert.match(indexSource, /id="replay-hud"/);
  assert.match(appSource, /startSuccessReplay\(\)/);
  assert.match(appSource, /applySuccessReplayStep\(step/);
  assert.match(appSource, /stopSuccessReplay\(\)/);
  assert.match(appSource, /task\.ultimate\.completeTitle[\s\S]*allowReplay:\s*true/);
});
