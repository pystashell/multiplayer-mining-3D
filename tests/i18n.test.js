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
  assert.equal(translate('zh', 'purge.tutorialFact'), '错误标记不会触发区块清除。');
  assert.match(translate('en', 'purge.tutorialMessage'), /solid island.*correctly flagged mine.*recalculate every affected clue/i);
  assert.equal(translate('en', 'purge.tutorialFact'), 'Incorrect flags will not trigger Sector Purge.');
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
  assert.match(translate('zh', 'reduction.tutorialMessage'), /7 层矩阵.*终端.*熵域压缩.*未展开方块.*直接.*消除.*重新计算.*剩余雷数/);
  assert.match(translate('zh', 'reduction.tutorialFact'), /左右键.*手机.*双击任意未展开方块.*已插旗方块.*无需切换.*判断错误.*自动更新.*递归展开/);
  assert.equal(translate('zh', 'lobby.task.freeplay'), '自由模式');
  assert.equal(translate('en', 'lobby.task.freeplay'), 'Free Mode');
  assert.equal(translate('zh', 'lobby.task.startFreeplay'), '进入自由模式');
  assert.equal(translate('en', 'lobby.task.startFreeplay'), 'Enter Free Mode');
  assert.equal(translate('zh', 'lobby.task.freeplayBadge'), 'FREE MODE');
  assert.match(translate('zh', 'task.hard.complete.2'), /基础扫描.*区块清除.*熵域压缩.*权限表之外.*回声/);
  assert.match(translate('en', 'task.hard.complete.2'), /Classic Scan.*Sector Purge.*Entropy-Field Compression.*echo.*permission table/i);
  assert.match(translate('zh', 'task.hard.brief.2'), /权限窗口.*管理员.*外围.*七层矩阵.*核心/);
  assert.doesNotMatch(translate('zh', 'task.hard.brief.2'), /直接.*消除|不需要插旗|左右键|双击/);
  assert.match(translate('en', 'task.hard.brief.2'), /root-access window.*admin.*perimeter.*seven-layer matrix.*core/i);
  assert.doesNotMatch(translate('en', 'task.hard.brief.2'), /remove it directly|no flag|mouse buttons|double-tap/i);
  assert.match(translate('zh', 'task.ultimate.brief.fact'), /9×9×9.*729 节点.*60 雷.*无大厅入口/);
  assert.match(translate('en', 'task.ultimate.brief.fact'), /9×9×9.*729 NODES.*60 MINES.*NO LOBBY ENTRY/i);
  assert.match(translate('zh', 'task.ultimate.complete.2'), /战役.*真正结束.*成功路线.*自由模式.*终极骇客/);
  assert.match(translate('en', 'task.ultimate.complete.2'), /campaign.*complete.*successful route.*Free Mode.*Ultimate Hacker Trojan/i);
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
  assert.match(translate('en', 'reduction.tutorialMessage'), /seven-layer matrix.*Entropy-Field Compression.*unopened cell.*remove it directly.*remaining mine counts/i);
  assert.match(translate('en', 'reduction.tutorialFact'), /both mouse buttons.*double-tap any unopened cell.*flagged one.*Dig or Flag Mode.*wrong deduction.*update automatically.*zero recursively opens/i);
  assert.equal(translate('zh', 'task.hard.guide.reduceOne'), '消除一颗地雷');
  assert.match(translate('zh', 'tutorial.actionHint.reduce'), /高级任务.*消除一颗地雷.*手机端.*双击未开启格子.*电脑端.*同时按下左右键/);
  assert.equal(translate('en', 'task.hard.guide.reduceOne'), 'Eliminate one mine');
  assert.match(translate('en', 'tutorial.actionHint.reduce'), /advanced objective.*eliminate one mine.*mobile.*double-tap.*desktop.*both mouse buttons/i);
  assert.equal(translate('zh', 'task.medium.guide.chordOne', { number: 2 }), '对金色圈出的数字 2 执行一次自动展开');
  assert.match(translate('zh', 'tutorial.actionHint.chord', { number: 2 }), /中级实操.*金色圈出的数字 2.*旗子已经标够.*仍有邻格可开.*左右键.*双击金色数字/);
  assert.equal(translate('zh', 'task.medium.guide.chordOneOutsideSlice', { number: 2 }), '自动展开目标在当前切片外：数字 2');
  assert.match(translate('zh', 'tutorial.actionHint.chord.outsideSlice', { number: 2 }), /目标数字 2.*当前切片外.*切片.*显示全部.*金色圈/);
  assert.equal(translate('en', 'task.medium.guide.chordOne', { number: 2 }), 'Auto-reveal around the gold-ringed clue 2');
  assert.match(translate('en', 'tutorial.actionHint.chord', { number: 2 }), /intermediate objective.*gold-ringed clue 2.*enough flags.*neighbors to open.*both mouse buttons.*double-tap/i);
  assert.equal(translate('en', 'task.medium.guide.chordOneOutsideSlice', { number: 2 }), 'Auto-reveal target is outside the current slice: clue 2');
  assert.match(translate('en', 'tutorial.actionHint.chord.outsideSlice', { number: 2 }), /clue 2.*outside the current slice.*slices.*show all.*gold ring/i);
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

test('teaches inspection once in beginner, transitions into guided reasoning, and only reminds once in medium', () => {
  assert.match(translate('zh', 'tutorial.beginnerInspect'), /电脑.*按住右键.*手机.*长按数字.*相邻单元格.*不会挖掘或标记/);
  assert.match(translate('zh', 'tutorial.beginnerInspectFact'), /实操.*按住数字上的右键.*手机上长按数字.*高亮.*下一步/);
  assert.match(translate('en', 'tutorial.beginnerInspect'), /Hold right-click.*long-press.*neighboring cell.*does not dig or flag/i);
  assert.match(translate('zh', 'tutorial.beginnerReasoning'), /第一关.*全程.*带着你推理.*金色数字.*安全格或地雷/);
  assert.match(translate('zh', 'tutorial.beginnerReasoningFact'), /金色数字.*推理依据.*青色.*挖掘.*粉色.*标记/);
  assert.match(translate('en', 'tutorial.beginnerReasoning'), /entire first mission.*gold clues.*why the target is safe or a mine/i);
  assert.equal(translate('zh', 'tutorial.inspectTitle'), '按住数字，查看相邻单元格');
  assert.equal(translate('en', 'tutorial.inspectTitle'), 'Hold a Number to Inspect Adjacent Cells');
  assert.match(translate('zh', 'task.medium.upgrade.1'), /初级学过.*邻域高亮.*数字管哪些格.*看清范围/);
  assert.match(translate('zh', 'task.medium.upgrade.fact'), /右键按住数字/);
  assert.doesNotMatch(translate('zh', 'task.medium.upgrade.1'), /升级|模块|复习|实操|再试一次/);
  assert.match(translate('zh', 'tutorial.inspect'), /按住右键.*松开右键/);
  assert.match(translate('zh', 'tutorial.actionHint.inspect'), /按住右键/);
  assert.match(translate('en', 'tutorial.inspect'), /Hold right-click.*release/i);
  assert.match(translate('zh', 'task.medium.brief.2'), /问我下一步.*外围.*推理/);
  assert.match(translate('en', 'task.medium.brief.2'), /ask me for the next move.*working inward from the edges/i);
  assert.doesNotMatch(translate('zh', 'task.medium.brief.2'), /右键|高亮|相邻区域/);
  assert.doesNotMatch(translate('en', 'task.medium.brief.2'), /right-click|highlight|neighborhood/i);
  assert.doesNotMatch(translate('zh', 'task.medium.brief.2'), /切片/);
  assert.doesNotMatch(translate('en', 'task.medium.brief.2'), /\bslices?\b/i);
  assert.doesNotMatch(translate('zh', 'task.medium.brief.2'), /十五|X、Y、Z/);
  assert.doesNotMatch(translate('zh', 'task.medium.brief.fact'), /15|反制节点/);
  assert.doesNotMatch(translate('zh', 'task.easy.complete.2'), /再教你|邻域高亮/);
  assert.doesNotMatch(translate('en', 'task.easy.complete.2'), /teach you|neighborhood highlight/i);
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
  const cover = translate('zh', 'solver.reason.cover-safe', {
    upperLabel: '1', upperHidden: 10, upperRemaining: 2,
    coverClues: '金色2是数字 1（已标 0 雷，4 个未开格还需 1 雷）；金色3是数字 1（已标 0 雷，4 个未开格还需 1 雷）',
    lowerRemainingTotal: 2, difference: 2,
  });
  assert.match(cover, /10 个未开邻格还需 2 雷/);
  assert.match(cover, /4 个未开格还需 1 雷.*4 个未开格还需 1 雷/);
  assert.match(cover, /互不重叠.*全部包含.*占满.*余下 2 格需要 0 雷.*安全/);
  assert.match(translate('en', 'solver.reason.cover-safe', {
    upperLabel: '1', upperHidden: 10, upperRemaining: 2,
    coverClues: 'gold 2 is 1; gold 3 is 1', lowerRemainingTotal: 2, difference: 2,
  }), /disjoint.*inside.*consume.*remaining 2 cells.*zero mines.*safe/i);
  assert.doesNotMatch(translate('zh', 'solver.reason.enumeration-safe'), /列出了|64 个|合法布局/);
  assert.match(translate('zh', 'solver.reason.enumeration-safe'), /每个金色数字.*反过来假设.*无法同时满足.*安全/);
  assert.match(translate('zh', 'solver.reason.direct-safe', { number: 1, flagged: 1, hidden: 3 }), /正好满足数字.*不可能再有雷.*安全挖掘/);
  assert.match(translate('zh', 'solver.reason.guess', { layouts: 2, safePercent: '50.0%', minePercent: '50.0%' }), /完整枚举.*安全率.*踩雷率.*只能赌/);
  assert.match(translate('zh', 'solver.reason.bounded-guess', { remaining: 1, hidden: 19, densityPercent: '5.3%' }), /固定算法.*不是目标格的精确踩雷率.*只能猜/);
  assert.match(translate('zh', 'solver.action.dig'), /左键挖掘.*手机.*挖掘.*轻触/);
  assert.match(translate('zh', 'solver.action.flag'), /右键标记.*手机.*标记.*轻触/);
  assert.equal(translate('zh', 'solver.actionLabel.dig'), '安全挖掘');
  assert.equal(translate('zh', 'solver.actionLabel.flag'), '标记地雷');
  assert.equal(translate('zh', 'solver.target.safe'), '跟随青色箭头');
  assert.equal(translate('zh', 'solver.target.mine'), '跟随粉色箭头');
  assert.match(translate('zh', 'solver.coordinate', { x: 5, y: 5, z: 5 }), /仅供核对.*X5.*Y5.*Z5/);
  assert.equal(translate('zh', 'solver.buttonActive'), '退出推理模式');
  assert.match(translate('zh', 'solver.buttonActiveNote'), /收起.*保留.*矩阵标记.*退出推理/);
  assert.equal(translate('zh', 'solver.collapse'), '收起推理说明');
  assert.equal(translate('zh', 'solver.expand'), '展开推理说明');
  assert.match(translate('zh', 'solver.collapsedLabel'), /说明已收起.*矩阵标记仍保留/);
  assert.equal(translate('en', 'solver.collapse'), 'Collapse reasoning explanation');
  assert.equal(translate('en', 'solver.expand'), 'Expand reasoning explanation');
  assert.equal(translate('en', 'solver.buttonActive'), 'Exit Reasoning Mode');
  assert.equal(translate('zh', 'solver.panelLabel'), '银狼任务提示终端');
  assert.equal(translate('en', 'solver.panelLabel'), 'Silver Wolf mission hint terminal');
  assert.match(translate('zh', 'solver.reason.first-move', { x: 5, y: 5, z: 5 }), /不会踩雷.*青色箭头.*坐标只用于核对/);
  assert.match(translate('en', 'solver.reason.first-move', { x: 5, y: 5, z: 5 }), /protected.*cyan arrow.*coordinate.*double-check/i);
  assert.equal(translate('zh', 'stats.mines'), '🚩 已标记 / 剩余地雷');
  assert.equal(translate('en', 'stats.mines'), '🚩 Flagged / Mines Left');
});

test('provides mobile touch controls and long-press guidance', () => {
  assert.match(translate('zh', 'mobile.touchHint'), /双击数字自动开启.*熵域压缩开启.*双击任意未展开方块.*已标记.*当前模式无关/);
  assert.match(translate('zh', 'mobile.touchHint'), /长按数字.*单指旋转.*双指缩放/);
  const zhControls = {
    rotate: '滚轮 → 上下翻面',
    zoom: 'Ctrl + 滚轮 → 缩放',
    dig: 'Q',
    flag: 'E',
    reset: 'R',
  };
  assert.equal(translate('zh', 'guide.rotateConfigured', zhControls), '电脑：滚轮 → 上下翻面；手机单指拖动旋转与翻面');
  assert.equal(translate('zh', 'guide.zoomConfigured', zhControls), '电脑：Ctrl + 滚轮 → 缩放；手机双指捏合缩放（矩阵始终居中）');
  assert.equal(translate('zh', 'guide.keysConfigured', zhControls), '[Q] / [E]：切换挖掘/标记；[R]：重置视角');
  assert.equal(translate('zh', 'controls.title'), '键位设置');
  assert.match(translate('zh', 'tutorial.controlsNote'), /手机.*控制.*键位设置.*电脑.*左侧.*键位设置/);
  assert.doesNotMatch(translate('zh', 'error.TUTORIAL_FIRST_MOVE_REQUIRED'), /视角|旋转/);
  assert.match(translate('zh', 'controls.touchNote'), /手机.*单指旋转.*双指缩放.*不受.*桌面设置影响/);
  assert.match(translate('zh', 'tutorial.inspect'), /手机长按数字/);
  assert.match(translate('zh', 'tutorial.mark'), /手机.*标记模式.*轻触/);
  assert.equal(translate('zh', 'solver.actionLabel.reduce'), '熵域消雷');
  assert.match(translate('zh', 'solver.action.reduce'), /电脑.*同时按下左右键.*手机.*双击.*熵域压缩/);
  assert.match(translate('zh', 'guide.chord'), /数字.*同时按左右键.*手机双击.*开启熵域压缩.*双击任意未展开方块.*已标记方块.*模式无关.*判断错误.*失败/);
  assert.match(translate('en', 'mobile.touchHint'), /Double-tap a number.*Entropy-Field Compression enabled.*any unopened cell.*flagged cells included.*either mode.*Long-press.*One finger.*Two fingers/i);
  const enControls = {
    rotate: 'Wheel → Pitch',
    zoom: 'Ctrl + Wheel → Zoom',
    dig: 'Q',
    flag: 'E',
    reset: 'R',
  };
  assert.equal(translate('en', 'guide.rotateConfigured', enControls), 'Desktop: Wheel → Pitch; mobile: one-finger drag rotates and flips');
  assert.equal(translate('en', 'guide.zoomConfigured', enControls), 'Desktop: Ctrl + Wheel → Zoom; mobile: pinch zooms (matrix stays centered)');
  assert.equal(translate('en', 'guide.keysConfigured', enControls), '[Q] / [E]: switch Dig/Flag; [R]: reset view');
  assert.equal(translate('en', 'controls.title'), 'Key Bindings');
  assert.match(translate('en', 'tutorial.controlsNote'), /mobile.*Controls.*Key Bindings.*desktop.*left panel/i);
  assert.doesNotMatch(translate('en', 'error.TUTORIAL_FIRST_MOVE_REQUIRED'), /camera|rotate/i);
  assert.match(translate('en', 'controls.touchNote'), /Mobile.*one-finger rotate.*two-finger zoom.*independent.*desktop settings/i);
  assert.match(translate('en', 'guide.chord'), /Clue.*both mouse buttons.*Entropy-Field Compression enabled.*any unopened cell.*flagged cell.*either mobile mode.*wrong deduction fails/i);
  assert.match(translate('en', 'tutorial.inspect'), /long-press.*mobile/i);
  assert.equal(translate('en', 'solver.actionLabel.reduce'), 'ENTROPY PURGE');
  assert.match(translate('en', 'solver.action.reduce'), /both mouse buttons.*double-tap.*Entropy-Field Compression/i);
});

test('describes middle- and right-button camera drag choices in both languages', () => {
  assert.equal(translate('zh', 'controls.preset.rightOrbit'), '右键轨道');
  assert.match(translate('zh', 'controls.preset.rightOrbitDesc'), /右键拖动旋转.*滚轮缩放/);
  assert.equal(translate('zh', 'controls.rightDrag'), '右键拖动');
  assert.equal(translate('zh', 'controls.gesture.rightDrag'), '右键拖动');
  assert.match(translate('zh', 'controls.fixedNote'), /右键轻点.*标记.*按住不移动.*检查.*只有拖动.*视角.*左右键同时按.*自动开启或压缩/);

  assert.equal(translate('en', 'controls.preset.rightOrbit'), 'Right-button Orbit');
  assert.match(translate('en', 'controls.preset.rightOrbitDesc'), /Right-drag rotates.*Wheel zooms/i);
  assert.equal(translate('en', 'controls.rightDrag'), 'Right-button drag');
  assert.equal(translate('en', 'controls.gesture.rightDrag'), 'Right-drag');
  assert.match(translate('en', 'controls.fixedNote'), /right-click.*flags.*holding.*without moving.*inspects.*Only dragging.*camera.*both buttons.*auto-open or compression/i);
});

test('provides explicit click targets for the guided beginner board', () => {
  assert.match(translate('zh', 'tutorial.guided'), /左键.*挖掘.*青色.*安全格.*每.*一步.*自动推理/);
  assert.match(translate('zh', 'tutorial.guidedFact'), /全程逻辑.*随机生成.*不偷看.*不会.*猜/);
  assert.match(translate('zh', 'tutorial.flagMode'), /右键.*标记.*左键.*挖掘/);
  assert.equal(translate('zh', 'tutorial.guided.step', { step: 4 }), '第 4 步｜');
  assert.match(translate('zh', 'tutorial.guided.reseedMessage'), /只能猜.*初级训练不靠运气.*保证.*连续推理/);
  assert.match(translate('zh', 'tutorial.guided.hint.directSafe', { step: 3, total: 8, aNumber: 1, ax: 2, ay: 1, az: 1, aFlagged: 1, x: 1, y: 2, z: 1 }), /金色数字 1.*已经标出 1 个雷.*不可能再是雷.*左键挖掘/);
  assert.match(translate('zh', 'tutorial.guided.hint.compareMine', { step: 2, total: 8, aNumber: 1, ax: 2, ay: 3, az: 1, aRemaining: 1, bNumber: 2, bx: 2, by: 2, bz: 1, bRemaining: 2, x: 1, y: 1, z: 1 }), /比较|金色数字.*多缺 1 雷.*必定是雷.*右键标记/);
  assert.match(translate('en', 'tutorial.flagMode'), /right-click.*flag.*left-click.*digs/i);
  assert.match(translate('en', 'tutorial.guidedFact'), /randomly selected.*logically solvable.*no peeking.*no guessing/i);
  assert.match(translate('en', 'tutorial.guided.reseedMessage'), /forced guess.*does not run on luck.*continuous logical route/i);
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
