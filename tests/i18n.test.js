import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeLanguage, randomNickname, translate } from '../public/i18n.js';

const publicCopySource = [
  readFileSync(new URL('../public/i18n.js', import.meta.url), 'utf8'),
  readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFileSync(new URL('../worker/room-engine.js', import.meta.url), 'utf8'),
].join('\n');
const internalProtocolSource = [
  readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFileSync(new URL('../worker/room-engine.js', import.meta.url), 'utf8'),
].join('\n');

test('selects Chinese only for Chinese browser language tags', () => {
  assert.equal(normalizeLanguage('zh-CN'), 'zh');
  assert.equal(normalizeLanguage('zh-TW'), 'zh');
  assert.equal(normalizeLanguage('en-US'), 'en');
  assert.equal(normalizeLanguage('ja-JP'), 'en');
});

test('uses the Sector Purge version title', () => {
  assert.equal(translate('zh', 'document.title'), '零域协议：区块清除 | 银狼任务');
  assert.equal(translate('en', 'document.title'), 'Zero Domain Protocol: Sector Purge | Silver Wolf');
  assert.match(translate('zh', 'purge.tutorialMessage'), /实体孤岛.*正确标雷.*重算周围所有数字/);
  assert.match(translate('zh', 'purge.tutorialFact'), /数字降到 0 时会隐藏.*自动向周围连锁展开安全格.*大于 0 就保留并更新/);
  assert.match(translate('en', 'purge.tutorialMessage'), /solid island.*correctly flagged mine.*recalculate every affected clue/i);
  assert.match(translate('en', 'purge.tutorialFact'), /drops to 0.*automatically cascades into surrounding safe cells.*above 0 stays visible/i);
});

test('explains the campaign, hidden Ultimate chapter, and independent Free Mode features', () => {
  assert.equal(translate('zh', 'settings.mediumMeta'), '5x5x5 (10雷)');
  assert.equal(translate('zh', 'settings.hardMeta'), '7x7x7 (30雷)');
  assert.equal(translate('en', 'settings.mediumMeta'), '5x5x5 (10 mines)');
  assert.equal(translate('en', 'settings.hardMeta'), '7x7x7 (30 mines)');
  assert.match(translate('zh', 'task.hard.brief.1'), /三十个反制节点/);
  assert.match(translate('en', 'task.hard.brief.1'), /thirty countermeasures/i);
  assert.match(translate('zh', 'lobby.task.easyMeta'), /经典扫描/);
  assert.match(translate('zh', 'lobby.task.mediumMeta'), /孤立区块清除/);
  assert.match(translate('zh', 'lobby.task.hardMeta'), /熵域压缩/);
  assert.match(translate('zh', 'reduction.tutorialMessage'), /未展开方块.*熵域压缩.*删除这颗雷.*原格.*周围相关数字.*剩余雷数/);
  assert.match(translate('zh', 'reduction.tutorialFact'), /不需要先插旗.*数字.*自动开启.*未展开方块.*熵域压缩.*挖掘模式.*雷格.*新数字.*为 0.*向外扩展/);
  assert.equal(translate('zh', 'lobby.task.freeplay'), '自由模式');
  assert.equal(translate('en', 'lobby.task.freeplay'), 'Free Mode');
  assert.equal(translate('zh', 'lobby.task.startFreeplay'), '进入自由模式');
  assert.equal(translate('en', 'lobby.task.startFreeplay'), 'Enter Free Mode');
  assert.equal(translate('zh', 'lobby.task.freeplayBadge'), 'FREE MODE');
  assert.match(translate('zh', 'task.hard.complete.2'), /基础扫描.*区块清除.*熵域压缩.*权限表之外.*回声/);
  assert.match(translate('en', 'task.hard.complete.2'), /Classic Scan.*Sector Purge.*Entropy-Field Compression.*echo.*permission table/i);
  assert.match(translate('zh', 'task.ultimate.brief.fact'), /9×9×9.*729 节点.*60 雷.*无大厅入口/);
  assert.match(translate('en', 'task.ultimate.brief.fact'), /9×9×9.*729 NODES.*60 MINES.*NO LOBBY ENTRY/i);
  assert.match(translate('zh', 'task.ultimate.complete.2'), /战役.*真正结束.*成功路线.*自由模式.*终极骇客/);
  assert.match(translate('en', 'task.ultimate.complete.2'), /campaign.*complete.*successful route.*Free Mode.*Ultimate Hack/i);
  assert.match(translate('zh', 'lobby.task.freeplayBrief'), /选择矩阵规模.*经典扫描.*始终启用.*两个 Add-on.*默认全开.*游戏后.*调整/);
  assert.match(translate('en', 'lobby.task.freeplayBrief'), /Choose a matrix size.*Classic Scan.*active.*both add-ons.*enabled.*adjust.*in-game/i);

  const zhCompletion = translate('zh', 'freeplay.completeMessage');
  const enCompletion = translate('en', 'freeplay.completeMessage');
  assert.match(zhCompletion, /漂亮.*整个矩阵.*清空.*赢得很干净/);
  assert.match(enCompletion, /Nice.*entire matrix.*clear.*clean run/i);
  assert.doesNotMatch(zhCompletion, /Add-on|经典扫描|区块清除|熵域压缩/);
  assert.doesNotMatch(enCompletion, /add-on|Classic Scan|Sector Purge|Entropy-Field Compression/i);
  assert.ok(zhCompletion.length <= 40, 'Chinese Free Mode congratulations should stay brief');
  assert.ok(enCompletion.length <= 80, 'English Free Mode congratulations should stay brief');

  assert.equal(
    translate('zh', 'tutorial.completionFact', { time: '01:23' }),
    '攻略用时：01:23  //  解密进度：100%',
  );
  assert.equal(
    translate('en', 'tutorial.completionFact', { time: '01:23' }),
    'BREACH TIME: 01:23  //  DECRYPTION: 100%',
  );
  assert.match(translate('en', 'reduction.tutorialFact'), /No flag is required.*Numbers auto-open.*unopened cells apply Entropy-Field Compression.*Dig Mode.*removed mine cell.*new clue.*recursively opens/i);
  assert.equal(translate('zh', 'settings.features'), '演算协议 Add-ons');
  assert.equal(translate('en', 'settings.features'), 'Protocol Add-ons');
  assert.equal(translate('zh', 'feature.autoPurge'), '区块清除');
  assert.equal(translate('zh', 'feature.autoPurgeHint'), '自动消除完整标记的孤立雷区');
  assert.equal(translate('en', 'feature.autoPurge'), 'Sector Purge');
  assert.match(translate('en', 'feature.autoPurgeHint'), /Automatically clear.*isolated mine sectors/i);
  assert.equal(translate('zh', 'feature.reduction'), '熵域压缩');
  assert.match(translate('zh', 'feature.reductionHint'), /直接判断并消除.*未开启雷格/);
  assert.equal(translate('en', 'feature.reduction'), 'Entropy-Field Compression');
  assert.match(translate('en', 'feature.reductionHint'), /unopened cell deduced to be a mine/i);
  assert.equal(translate('zh', 'tutorial.enterFreeplay'), '进入自由模式');
  assert.equal(translate('en', 'tutorial.enterFreeplay'), 'Enter Free Mode');
});

test('uses the new public compression name everywhere while preserving internal protocol identifiers', () => {
  assert.match(publicCopySource, /熵域压缩/);
  assert.match(publicCopySource, /Entropy-Field Compression/);
  assert.doesNotMatch(publicCopySource, /动态化简/);
  assert.doesNotMatch(publicCopySource, /Dynamic Reduction/i);

  assert.match(internalProtocolSource, /ruleset:\s*'reduction'/);
  assert.match(internalProtocolSource, /reduction:\s*true/);
  assert.match(internalProtocolSource, /op:\s*'reduce'/);
});

test('builds localized computer-themed nicknames from random parts', () => {
  const first = () => 0;
  assert.equal(randomNickname('zh', first), '清脆的键盘');
  assert.equal(randomNickname('en', first), 'Clicky Keyboard');
  assert.equal(translate('zh', 'lobby.randomNickname'), '换一个随机昵称');
  assert.equal(translate('en', 'lobby.randomNickname'), 'Roll another nickname');

  const chineseNames = new Set();
  const englishNames = new Set();
  for (let index = 0; index < 1_000; index++) {
    const nounSample = index / 1_000;
    const chineseSamples = [0, nounSample];
    const englishSamples = [0, nounSample];
    chineseNames.add(randomNickname('zh', () => chineseSamples.shift()));
    const englishName = randomNickname('en', () => englishSamples.shift());
    englishNames.add(englishName);
    assert.ok(englishName.length <= 16);
  }
  assert.ok(chineseNames.size >= 130);
  assert.ok(englishNames.size >= 130);
  for (const noun of ['CPU', '内存', '显卡', '音响', '鼠标', '网线', '路由器', '机箱', '主板']) {
    assert.ok([...chineseNames].some(name => name.endsWith(`的${noun}`)), `${noun} should be reachable`);
  }
});

test('localizes semantic room activities independently for each client', () => {
  assert.equal(translate('zh', 'activity.dug', { name: '银狼' }), '银狼 挖开了空间方块');
  assert.equal(translate('en', 'activity.dug', { name: 'silver wolf' }), 'silver wolf excavated a spatial cell');
});

test('distinguishes 3D neighbor positions from the beginner number ceiling', () => {
  assert.match(translate('zh', 'tutorial.neighbors'), /上层 9 格、同层 8 格、下层 9 格/);
  assert.equal(translate('zh', 'tutorial.neighborsFact'), '理论最大数字是 26；初级全图只有 3 雷，所以初级数字范围是 0–3。');
  assert.doesNotMatch(translate('zh', 'tutorial.neighborsFact'), /不能把/);
  assert.match(translate('en', 'tutorial.neighborsFact'), /theoretical maximum number is 26.*range from 0–3/i);
  assert.doesNotMatch(translate('en', 'tutorial.neighborsFact'), /Do not confuse/i);
});

test('introduces right-click number inspection as Silver Wolf\'s medium mission trick', () => {
  assert.match(translate('zh', 'task.medium.upgrade.1'), /小黑客窍门.*功能一直都在/);
  assert.match(translate('zh', 'task.medium.upgrade.fact'), /右键按住数字/);
  assert.doesNotMatch(translate('zh', 'task.medium.upgrade.1'), /升级|模块/);
  assert.match(translate('zh', 'tutorial.inspect'), /按住右键.*松开右键/);
  assert.match(translate('zh', 'tutorial.actionHint.inspect'), /按住右键/);
  assert.match(translate('en', 'tutorial.inspect'), /Hold right-click.*release/i);
  assert.match(translate('zh', 'task.medium.brief.2'), /右键.*相邻区域.*问我下一步.*外围.*推理/);
  assert.match(translate('en', 'task.medium.brief.2'), /right-click.*neighborhood.*ask me.*edge-first deductions/i);
  assert.doesNotMatch(translate('zh', 'task.medium.brief.2'), /切片/);
  assert.doesNotMatch(translate('en', 'task.medium.brief.2'), /\bslices?\b/i);
  assert.doesNotMatch(translate('zh', 'task.medium.brief.2'), /十五|X、Y、Z/);
  assert.doesNotMatch(translate('zh', 'task.medium.brief.fact'), /15|反制节点/);
});

test('keeps slice controls localized without any proactive slice tutorial copy', () => {
  assert.equal(translate('zh', 'mobile.slices'), '切片');
  assert.equal(translate('zh', 'slice.title'), '切片分析');
  assert.equal(translate('zh', 'slice.subtitle'), '只显示所选坐标范围');
  assert.equal(translate('zh', 'slice.reset'), '显示全部');
  assert.equal(translate('zh', 'slice.close'), '关闭切片');
  assert.equal(translate('en', 'mobile.slices'), 'Slices');
  assert.equal(translate('en', 'slice.title'), 'SLICE ANALYSIS');
  assert.equal(translate('en', 'slice.reset'), 'Show All');
  assert.equal(translate('en', 'slice.close'), 'Close slices');
  for (const key of [
    'tutorial.sliceTitle', 'tutorial.slice', 'tutorial.sliceFact', 'tutorial.trySlice',
    'tutorial.sliceResetTitle', 'tutorial.sliceReset', 'tutorial.sliceResetFact', 'tutorial.trySliceReset',
    'tutorial.actionHint.slice', 'tutorial.actionHint.sliceReset',
  ]) {
    assert.equal(translate('zh', key), key);
    assert.equal(translate('en', key), key);
  }
  for (const key of ['tutorial.intro', 'tutorial.neighbors', 'tutorial.guided', 'tutorial.guidedFact']) {
    assert.doesNotMatch(translate('zh', key), /切片/);
    assert.doesNotMatch(translate('en', key), /\bslices?\b/i);
  }
});

test('teaches exact medium hint deductions and labels guesses honestly', () => {
  const subset = translate('zh', 'solver.reason.subset-safe', {
    lowerNumber: 1, lowerHidden: 4, upperNumber: 1, upperHidden: 6,
    lowerRemaining: 1, upperRemaining: 1, difference: 2,
  });
  assert.match(subset, /完全包含.*多出来的 2 格需要 0 雷.*安全/);
  assert.match(translate('zh', 'solver.reason.direct-safe', { number: 1, flagged: 1, hidden: 3 }), /正好满足数字.*不可能再有雷.*安全挖掘/);
  assert.match(translate('zh', 'solver.reason.guess', { layouts: 2, safePercent: '50.0%', minePercent: '50.0%' }), /完整枚举.*安全率.*踩雷率.*只能赌/);
  assert.match(translate('zh', 'solver.reason.bounded-guess', { remaining: 1, hidden: 19, densityPercent: '5.3%' }), /固定算法.*不是目标格的精确踩雷率.*只能猜/);
  assert.match(translate('zh', 'solver.action.dig'), /左键挖掘.*手机.*挖掘.*轻触/);
  assert.match(translate('zh', 'solver.action.flag'), /右键标记.*手机.*标记.*轻触/);
  assert.equal(translate('zh', 'solver.buttonActive'), '退出推理模式');
  assert.match(translate('zh', 'solver.buttonActiveNote'), /收起.*清除.*高亮/);
  assert.equal(translate('en', 'solver.buttonActive'), 'Exit Reasoning Mode');
  assert.equal(translate('zh', 'solver.panelLabel'), '银狼任务提示终端');
  assert.equal(translate('en', 'solver.panelLabel'), 'Silver Wolf mission hint terminal');
  assert.match(translate('zh', 'solver.reason.first-move', { x: 5, y: 5, z: 5 }), /外侧入口角点.*外围.*一层层/);
  assert.match(translate('en', 'solver.reason.first-move', { x: 5, y: 5, z: 5 }), /outer entry corner.*easier to tap.*layer by layer/i);
});

test('provides mobile touch controls and long-press guidance', () => {
  assert.match(translate('zh', 'mobile.touchHint'), /双击数字自动开启.*挖掘模式双击未展开方块.*熵域压缩/);
  assert.match(translate('zh', 'mobile.touchHint'), /长按数字.*单指.*双指/);
  assert.match(translate('zh', 'tutorial.inspect'), /手机长按数字/);
  assert.match(translate('zh', 'tutorial.mark'), /手机.*标记模式.*轻触/);
  assert.match(translate('zh', 'guide.chord'), /数字.*同时按左右键.*手机双击.*开启熵域压缩.*未展开方块.*挖掘模式.*双击.*判断错误.*失败/);
  assert.match(translate('en', 'mobile.touchHint'), /Double-tap a number.*Dig Mode.*double-tap an unopened cell.*Entropy-Field Compression.*Long-press.*One finger.*Two fingers/i);
  assert.match(translate('en', 'guide.chord'), /Clue.*both mouse buttons.*Entropy-Field Compression.*enabled.*unopened cell.*Dig Mode.*wrong deduction fails/i);
  assert.match(translate('en', 'tutorial.inspect'), /long-press.*mobile/i);
});

test('provides explicit click targets for the guided beginner board', () => {
  assert.match(translate('zh', 'tutorial.guided'), /左键.*挖掘.*青色.*安全格/);
  assert.match(translate('zh', 'tutorial.flagMode'), /右键.*标记.*左键.*挖掘/);
  assert.match(translate('zh', 'tutorial.guided.hint.directSafe', { step: 3, total: 8, aNumber: 1, ax: 2, ay: 1, az: 1, aFlagged: 1, x: 1, y: 2, z: 1 }), /金色数字 1.*已经标出 1 个雷.*不可能再是雷.*左键挖掘/);
  assert.match(translate('zh', 'tutorial.guided.hint.compareMine', { step: 2, total: 8, aNumber: 1, ax: 2, ay: 3, az: 1, aRemaining: 1, bNumber: 2, bx: 2, by: 2, bz: 1, bRemaining: 2, x: 1, y: 1, z: 1 }), /比较|金色数字.*多缺 1 雷.*必定是雷.*右键标记/);
  assert.match(translate('en', 'tutorial.flagMode'), /right-click.*flag.*left-click.*digs/i);
  assert.match(translate('en', 'tutorial.guided.hint.directSafe', { step: 3, total: 8, aNumber: 1, ax: 2, ay: 1, az: 1, aFlagged: 1, x: 1, y: 2, z: 1 }), /already touches 1 flagged mines.*cannot contain another mine.*left-click/i);
});

test('names the advanced mission Final Protocol in both languages', () => {
  assert.equal(translate('zh', 'lobby.task.hardTitle'), '高级 · 终末协议');
  assert.equal(translate('zh', 'task.hard.chapterTitle'), 'MISSION 03 // 终末协议');
  assert.equal(translate('en', 'lobby.task.hardTitle'), 'Advanced · Final Protocol');
  assert.equal(translate('en', 'task.hard.chapterTitle'), 'MISSION 03 // FINAL PROTOCOL');
});

test('localizes the dialogue backdrop dismissal hint', () => {
  assert.equal(translate('zh', 'tutorial.dismissHint'), '点击对话框外也可继续');
  assert.equal(translate('en', 'tutorial.dismissHint'), 'Click outside the dialogue to continue');
});

test('uses a single rewind action for solo mission failure', () => {
  assert.equal(translate('zh', 'task.result.lostTitle'), '任务演算失败');
  assert.equal(translate('zh', 'task.result.rewind'), '↺ 回溯');
  assert.doesNotMatch(translate('zh', 'task.result.lostMessage'), /广告/);
  assert.equal(translate('zh', 'task.result.lostMessage'), '银狼已保存失败前的数据。点击回溯，重新演算当前任务。');
  assert.equal(translate('zh', 'action.restart'), '重新初始化雷区');
  assert.equal(translate('zh', 'result.restart'), '重新初始化雷区');
  assert.equal(translate('en', 'task.result.rewind'), '↺ REWIND');
  assert.equal(translate('en', 'action.restart'), 'Reinitialize Minefield');
  assert.equal(translate('en', 'result.restart'), 'Reinitialize Minefield');
});

test('explains that a teammate ad locks the entire squad', () => {
  assert.match(translate('zh', 'revive.playingTeammate', { name: '队友A' }), /队友A.*无法操作.*所有人都要一起观看/);
  assert.match(translate('zh', 'revive.playingSelf'), /全员.*一起观看|全员.*同步观看/);
  assert.match(translate('en', 'revive.playingTeammate', { name: 'Player A' }), /Player A.*locked.*entire squad/i);
});
