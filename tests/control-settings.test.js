import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTROL_PRESETS,
  CONTROL_STORAGE_KEY,
  DEFAULT_CONTROL_SETTINGS,
  cloneControlSettings,
  controlPresetForSettings,
  formatControlKey,
  isBindableControlKey,
  loadControlSettings,
  normalizeControlSettings,
  normalizeWheelDelta,
  saveControlSettings,
  validateControlSettings,
  wheelActionForEvent,
} from '../public/control-settings.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    values,
    writes,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      const serialized = String(value);
      writes.push([key, serialized]);
      values.set(key, serialized);
    },
  };
}

test('defines middle-drag and right-drag control presets and recognizes custom profiles', () => {
  assert.deepEqual(CONTROL_PRESETS.classic, {
    middleDragAction: 'rotate',
    rightDragAction: 'rotate',
    wheelAction: 'zoom',
    shiftWheelAction: 'zoom',
    ctrlWheelAction: 'zoom',
    digKey: 'KeyD',
    flagKey: 'KeyF',
    resetKey: 'Space',
  });
  assert.deepEqual(CONTROL_PRESETS.wheelFlip, {
    middleDragAction: 'rotate',
    rightDragAction: 'rotate',
    wheelAction: 'pitch',
    shiftWheelAction: 'yaw',
    ctrlWheelAction: 'zoom',
    digKey: 'KeyD',
    flagKey: 'KeyF',
    resetKey: 'Space',
  });
  assert.deepEqual(CONTROL_PRESETS.modeling, {
    middleDragAction: 'zoom',
    rightDragAction: 'rotate',
    wheelAction: 'yaw',
    shiftWheelAction: 'pitch',
    ctrlWheelAction: 'zoom',
    digKey: 'KeyD',
    flagKey: 'KeyF',
    resetKey: 'Space',
  });
  assert.deepEqual(CONTROL_PRESETS.rightOrbit, {
    middleDragAction: 'none',
    rightDragAction: 'rotate',
    wheelAction: 'zoom',
    shiftWheelAction: 'zoom',
    ctrlWheelAction: 'zoom',
    digKey: 'KeyD',
    flagKey: 'KeyF',
    resetKey: 'Space',
  });

  assert.equal(DEFAULT_CONTROL_SETTINGS, CONTROL_PRESETS.classic);
  for (const [name, preset] of Object.entries(CONTROL_PRESETS)) {
    assert.equal(Object.isFrozen(preset), true);
    assert.deepEqual(validateControlSettings(preset), { valid: true, errors: [], settings: { ...preset } });
    assert.equal(controlPresetForSettings(preset), name);
  }

  const customized = { ...CONTROL_PRESETS.classic, digKey: 'KeyQ' };
  assert.equal(controlPresetForSettings(customized), 'custom');
  const clone = cloneControlSettings(customized);
  assert.deepEqual(clone, customized);
  assert.notEqual(clone, customized);
});

test('normalizes unsupported values and rejects unusable control profiles', () => {
  assert.deepEqual(normalizeControlSettings({
    middleDragAction: 'pan',
    rightDragAction: 'pan',
    wheelAction: 'spin',
    shiftWheelAction: 'pitch',
    ctrlWheelAction: 'none',
    digKey: 'Escape',
    flagKey: 'Digit4',
    resetKey: 'Enter',
  }), {
    middleDragAction: 'rotate',
    rightDragAction: 'rotate',
    wheelAction: 'zoom',
    shiftWheelAction: 'pitch',
    ctrlWheelAction: 'none',
    digKey: 'KeyD',
    flagKey: 'Digit4',
    resetKey: 'Enter',
  });

  for (const code of ['KeyA', 'KeyZ', 'Digit0', 'Digit9', 'ArrowUp', 'Space', 'Enter', 'BracketRight']) {
    assert.equal(isBindableControlKey(code), true, `${code} should be bindable`);
  }
  for (const code of ['', 'Escape', 'F1', 'Numpad1', 'ShiftLeft', 'ControlLeft', null]) {
    assert.equal(isBindableControlKey(code), false, `${code} should not be bindable`);
  }

  const duplicateKeys = validateControlSettings({ ...CONTROL_PRESETS.classic, flagKey: 'KeyD' });
  assert.equal(duplicateKeys.valid, false);
  assert.deepEqual(duplicateKeys.errors, ['duplicateKeys']);

  const missingRotation = validateControlSettings({
    ...CONTROL_PRESETS.classic,
    middleDragAction: 'none',
    rightDragAction: 'none',
    wheelAction: 'zoom',
    shiftWheelAction: 'zoom',
    ctrlWheelAction: 'none',
  });
  assert.equal(missingRotation.valid, false);
  assert.deepEqual(missingRotation.errors, ['missingRotation']);

  const missingZoom = validateControlSettings({
    ...CONTROL_PRESETS.classic,
    middleDragAction: 'rotate',
    wheelAction: 'yaw',
    shiftWheelAction: 'pitch',
    ctrlWheelAction: 'none',
  });
  assert.equal(missingZoom.valid, false);
  assert.deepEqual(missingZoom.errors, ['missingZoom']);

  const multipleErrors = validateControlSettings({
    ...CONTROL_PRESETS.classic,
    middleDragAction: 'none',
    rightDragAction: 'none',
    wheelAction: 'none',
    shiftWheelAction: 'none',
    ctrlWheelAction: 'none',
    flagKey: 'KeyD',
  });
  assert.deepEqual(multipleErrors.errors, ['duplicateKeys', 'missingRotation', 'missingZoom']);

  const rightOnlyRotation = validateControlSettings({
    ...CONTROL_PRESETS.classic,
    middleDragAction: 'none',
    rightDragAction: 'rotate',
  });
  assert.equal(rightOnlyRotation.valid, true);

  const rightOnlyZoom = validateControlSettings({
    ...CONTROL_PRESETS.classic,
    middleDragAction: 'rotate',
    rightDragAction: 'zoom',
    wheelAction: 'none',
    shiftWheelAction: 'none',
    ctrlWheelAction: 'none',
  });
  assert.equal(rightOnlyZoom.valid, true);
});

test('persists only valid profiles and safely falls back when storage is bad', () => {
  const storage = memoryStorage();
  const profile = {
    ...CONTROL_PRESETS.modeling,
    digKey: 'KeyQ',
    flagKey: 'KeyE',
    resetKey: 'KeyR',
  };

  const saved = saveControlSettings(profile, storage);
  assert.equal(saved.valid, true);
  assert.deepEqual(storage.writes, [[CONTROL_STORAGE_KEY, JSON.stringify(profile)]]);
  assert.deepEqual(loadControlSettings(storage), profile);

  const writesBeforeInvalidSave = storage.writes.length;
  const invalidSave = saveControlSettings({ ...profile, flagKey: 'KeyQ' }, storage);
  assert.equal(invalidSave.valid, false);
  assert.deepEqual(invalidSave.errors, ['duplicateKeys']);
  assert.equal(storage.writes.length, writesBeforeInvalidSave);

  const malformed = memoryStorage({ [CONTROL_STORAGE_KEY]: '{not-json' });
  assert.deepEqual(loadControlSettings(malformed), { ...DEFAULT_CONTROL_SETTINGS });

  const legacyProfile = { ...CONTROL_PRESETS.classic };
  delete legacyProfile.rightDragAction;
  const legacyStorage = memoryStorage({
    [CONTROL_STORAGE_KEY]: JSON.stringify(legacyProfile),
  });
  assert.deepEqual(loadControlSettings(legacyStorage), { ...CONTROL_PRESETS.classic });

  const invalidStoredProfile = memoryStorage({
    [CONTROL_STORAGE_KEY]: JSON.stringify({ ...CONTROL_PRESETS.classic, flagKey: 'KeyD' }),
  });
  assert.deepEqual(loadControlSettings(invalidStoredProfile), { ...DEFAULT_CONTROL_SETTINGS });

  const throwingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.deepEqual(loadControlSettings(throwingStorage), { ...DEFAULT_CONTROL_SETTINGS });
  assert.equal(saveControlSettings(CONTROL_PRESETS.wheelFlip, throwingStorage).valid, true);
});

test('routes plain, Shift, and Ctrl wheel gestures with deterministic modifier precedence', () => {
  const settings = CONTROL_PRESETS.wheelFlip;
  assert.equal(wheelActionForEvent(settings, {}), 'pitch');
  assert.equal(wheelActionForEvent(settings, { shiftKey: true }), 'yaw');
  assert.equal(wheelActionForEvent(settings, { ctrlKey: true }), 'zoom');
  assert.equal(wheelActionForEvent(settings, { ctrlKey: true, shiftKey: true }), 'zoom');
  assert.equal(wheelActionForEvent(settings, { altKey: true }), 'pitch');

  assert.equal(wheelActionForEvent(CONTROL_PRESETS.modeling, {}), 'yaw');
  assert.equal(wheelActionForEvent(CONTROL_PRESETS.modeling, { shiftKey: true }), 'pitch');
  assert.equal(wheelActionForEvent(CONTROL_PRESETS.modeling, { ctrlKey: true }), 'zoom');
});

test('normalizes wheel delta modes, dominant axes, directions, and extreme input', () => {
  assert.equal(normalizeWheelDelta({ deltaX: 4, deltaY: 12, deltaMode: 0 }), 12);
  assert.equal(normalizeWheelDelta({ deltaX: -7, deltaY: 2, deltaMode: 0 }), -7);
  assert.equal(normalizeWheelDelta({ deltaY: 2, deltaMode: 1 }), 32);
  assert.equal(normalizeWheelDelta({ deltaY: -0.25, deltaMode: 2 }, 600), -150);
  assert.equal(normalizeWheelDelta({ deltaY: 20, deltaMode: 1 }), 240);
  assert.equal(normalizeWheelDelta({ deltaY: -20, deltaMode: 1 }), -240);
  assert.equal(normalizeWheelDelta({ deltaY: 10_000, deltaMode: 0 }), 240);
  assert.equal(normalizeWheelDelta({}), 0);
});

test('formats persisted physical key codes for the settings UI', () => {
  assert.equal(formatControlKey('KeyQ'), 'Q');
  assert.equal(formatControlKey('Digit7'), '7');
  assert.equal(formatControlKey('Space'), 'SPACE');
  assert.equal(formatControlKey('Enter'), 'ENTER');
  assert.equal(formatControlKey('Minus'), '-');
});
