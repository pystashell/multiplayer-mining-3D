import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectInitialInputMode,
  inputModeFromPointerType,
  inputScopedTranslationKey,
} from '../public/input-mode.js';
import { hasTranslation, translateForInput } from '../public/i18n.js';

test('detects the initial input mode from pointer capability instead of viewport size', () => {
  assert.equal(detectInitialInputMode({ matchMedia: () => ({ matches: true }) }), 'touch');
  assert.equal(detectInitialInputMode({ matchMedia: () => ({ matches: false }), maxTouchPoints: 10 }), 'mouse');
  assert.equal(detectInitialInputMode({ maxTouchPoints: 2 }), 'touch');
  assert.equal(detectInitialInputMode({ maxTouchPoints: 0 }), 'mouse');
});

test('lets real pointer input recalibrate hybrid devices without guessing unknown pointers', () => {
  assert.equal(inputModeFromPointerType('mouse', 'touch'), 'mouse');
  assert.equal(inputModeFromPointerType('touch', 'mouse'), 'touch');
  assert.equal(inputModeFromPointerType('pen', 'mouse'), 'mouse');
  assert.equal(inputModeFromPointerType('', 'touch'), 'touch');
  assert.equal(inputScopedTranslationKey('solver.action.dig', 'mouse'), 'solver.action.dig.mouse');
  assert.equal(inputScopedTranslationKey('solver.action.dig', 'touch'), 'solver.action.dig.touch');
});

test('selects same-language input copy, replaces params, and falls back to the base key', () => {
  assert.match(translateForInput('zh', 'tutorial.actionHint.chord', 'mouse', { number: 2 }), /数字 2.*左右键/);
  assert.doesNotMatch(translateForInput('zh', 'tutorial.actionHint.chord', 'mouse', { number: 2 }), /手机|双击/);
  assert.match(translateForInput('zh', 'tutorial.actionHint.chord', 'touch', { number: 2 }), /数字 2.*双击/);
  assert.doesNotMatch(translateForInput('zh', 'tutorial.actionHint.chord', 'touch', { number: 2 }), /电脑|鼠标|左右键/);
  assert.match(translateForInput('en', 'tutorial.actionHint.chord', 'mouse', { number: 3 }), /clue 3.*both mouse buttons/i);
  assert.match(translateForInput('en', 'tutorial.actionHint.chord', 'touch', { number: 3 }), /clue 3.*double-tap/i);
  assert.equal(translateForInput('en', 'document.title', 'touch'), 'Zero Domain Protocol: Sector Purge | Silver Wolf');
});

test('keeps all gameplay instruction variants complete in Chinese and English', () => {
  const keys = [
    'mobile.touchHint',
    'controls.fixedNote',
    'controls.touchNote',
    'task.guide.guidedStartTitle',
    'task.guide.guidedMinesTitle',
    'tutorial.actionHint.scan',
    'tutorial.actionHint.inspect',
    'tutorial.actionHint.mark',
    'tutorial.actionHint.reduce',
    'tutorial.actionHint.chord',
    'guide.rotateConfigured',
    'guide.zoomConfigured',
    'guide.keysConfigured',
    'guide.click',
    'guide.flag',
    'guide.inspect',
    'guide.chord',
    'reduction.tutorialFact',
    'tutorial.controlsNote',
    'tutorial.guided',
    'tutorial.flagMode',
    'tutorial.guided.hint.protectedStart',
    'tutorial.guided.hint.directSafe',
    'tutorial.guided.hint.directMine',
    'tutorial.guided.hint.compareSafe',
    'tutorial.guided.hint.compareMine',
    'tutorial.guided.hint.correction.dig',
    'tutorial.guided.hint.correction.flag',
    'tutorial.guided.pointer.safe',
    'tutorial.guided.pointer.mine',
    'tutorial.beginnerInspect',
    'tutorial.beginnerInspectFact',
    'tutorial.inspect',
    'tutorial.inspectFact',
    'tutorial.mark',
    'tutorial.markFact',
    'task.medium.upgrade.fact',
    'task.medium.chordTip',
    'solver.action.dig',
    'solver.action.flag',
    'solver.action.reduce',
  ];

  for (const language of ['zh', 'en']) {
    for (const key of keys) {
      for (const mode of ['mouse', 'touch']) {
        const scopedKey = `${key}.${mode}`;
        assert.equal(hasTranslation(language, scopedKey), true, `${language} ${scopedKey}`);
      }
      const mouseCopy = translateForInput(language, key, 'mouse');
      const touchCopy = translateForInput(language, key, 'touch');
      if (language === 'zh') {
        assert.doesNotMatch(mouseCopy, /手机|轻触|长按|双击/, `${key}.mouse mixed touch instructions`);
        assert.doesNotMatch(touchCopy, /电脑|鼠标|左键|右键|左右键/, `${key}.touch mixed mouse instructions`);
      } else {
        assert.doesNotMatch(mouseCopy, /\bmobile\b|long-press|double-tap|\btap\b/i, `${key}.mouse mixed touch instructions`);
        assert.doesNotMatch(touchCopy, /\bdesktop\b|right-click|left-click|mouse buttons/i, `${key}.touch mixed mouse instructions`);
      }
    }
  }
});
