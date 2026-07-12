import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLanguage, translate } from '../public/i18n.js';

test('selects Chinese only for Chinese browser language tags', () => {
  assert.equal(normalizeLanguage('zh-CN'), 'zh');
  assert.equal(normalizeLanguage('zh-TW'), 'zh');
  assert.equal(normalizeLanguage('en-US'), 'en');
  assert.equal(normalizeLanguage('ja-JP'), 'en');
});

test('provides the requested localized default nickname', () => {
  assert.equal(translate('zh', 'nickname.default'), '银狼');
  assert.equal(translate('en', 'nickname.default'), 'silver wolf');
});

test('localizes semantic room activities independently for each client', () => {
  assert.equal(translate('zh', 'activity.dug', { name: '银狼' }), '银狼 挖开了空间方块');
  assert.equal(translate('en', 'activity.dug', { name: 'silver wolf' }), 'silver wolf excavated a spatial cell');
});
