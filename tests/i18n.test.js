import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLanguage, randomNickname, translate } from '../public/i18n.js';

test('selects Chinese only for Chinese browser language tags', () => {
  assert.equal(normalizeLanguage('zh-CN'), 'zh');
  assert.equal(normalizeLanguage('zh-TW'), 'zh');
  assert.equal(normalizeLanguage('en-US'), 'en');
  assert.equal(normalizeLanguage('ja-JP'), 'en');
});

test('uses Zero Domain Protocol as the game title', () => {
  assert.equal(translate('zh', 'document.title'), '零域协议 | 银狼先遣任务');
  assert.equal(translate('en', 'document.title'), 'Zero Domain Protocol | Silver Wolf Pathfinder');
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
  assert.match(translate('zh', 'task.medium.brief.2'), /切片.*右键.*相邻区域/);
  assert.doesNotMatch(translate('zh', 'task.medium.brief.2'), /十五|X、Y、Z/);
  assert.doesNotMatch(translate('zh', 'task.medium.brief.fact'), /15|反制节点/);
});

test('teaches slice visibility in intermediate but keeps it out of beginner copy', () => {
  assert.equal(translate('zh', 'mobile.slices'), '切片');
  assert.match(translate('zh', 'tutorial.slice'), /5×5×5.*桌面.*顶部.*手机.*底部.*切片/);
  assert.match(translate('zh', 'tutorial.sliceFact'), /缩小至少一层.*不改变雷阵/);
  assert.match(translate('zh', 'tutorial.sliceReset'), /显示全部.*不会.*改变/);
  assert.match(translate('en', 'tutorial.actionHint.slice'), /top slice panel.*bottom dock.*Narrow/i);
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
  assert.match(translate('zh', 'mobile.touchHint'), /双击数字快速展开/);
  assert.match(translate('zh', 'mobile.touchHint'), /长按数字.*单指.*双指/);
  assert.match(translate('zh', 'tutorial.inspect'), /手机长按数字/);
  assert.match(translate('zh', 'tutorial.mark'), /手机.*标记模式.*轻触/);
  assert.match(translate('zh', 'guide.chord'), /同时按左右键.*手机双击数字.*标错会踩雷/);
  assert.match(translate('en', 'mobile.touchHint'), /Double-tap a number.*Long-press.*One finger.*Two fingers/i);
  assert.match(translate('en', 'guide.chord'), /both mouse buttons.*double-tap the number.*wrong flags/i);
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
