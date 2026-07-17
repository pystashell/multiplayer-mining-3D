export const CONTROL_STORAGE_KEY = 'holo-sweeper.controls.v1';

const DRAG_ACTIONS = Object.freeze(['rotate', 'zoom', 'none']);
const WHEEL_ACTIONS = Object.freeze(['zoom', 'yaw', 'pitch', 'none']);
const KEY_FIELDS = Object.freeze(['digKey', 'flagKey', 'resetKey']);
const SETTING_FIELDS = Object.freeze([
  'middleDragAction',
  'rightDragAction',
  'wheelAction',
  'shiftWheelAction',
  'ctrlWheelAction',
  ...KEY_FIELDS,
]);

const VALID_KEY_CODE = /^(Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Space|Enter|Minus|Equal|BracketLeft|BracketRight)$/;

function freezePreset(settings) {
  return Object.freeze({ ...settings });
}

export const CONTROL_PRESETS = Object.freeze({
  classic: freezePreset({
    middleDragAction: 'rotate',
    rightDragAction: 'rotate',
    wheelAction: 'zoom',
    shiftWheelAction: 'zoom',
    ctrlWheelAction: 'zoom',
    digKey: 'KeyD',
    flagKey: 'KeyF',
    resetKey: 'Space',
  }),
  wheelFlip: freezePreset({
    middleDragAction: 'rotate',
    rightDragAction: 'rotate',
    wheelAction: 'pitch',
    shiftWheelAction: 'yaw',
    ctrlWheelAction: 'zoom',
    digKey: 'KeyD',
    flagKey: 'KeyF',
    resetKey: 'Space',
  }),
  modeling: freezePreset({
    middleDragAction: 'zoom',
    rightDragAction: 'rotate',
    wheelAction: 'yaw',
    shiftWheelAction: 'pitch',
    ctrlWheelAction: 'zoom',
    digKey: 'KeyD',
    flagKey: 'KeyF',
    resetKey: 'Space',
  }),
  rightOrbit: freezePreset({
    middleDragAction: 'none',
    rightDragAction: 'rotate',
    wheelAction: 'zoom',
    shiftWheelAction: 'zoom',
    ctrlWheelAction: 'zoom',
    digKey: 'KeyD',
    flagKey: 'KeyF',
    resetKey: 'Space',
  }),
});

export const DEFAULT_CONTROL_SETTINGS = CONTROL_PRESETS.classic;

export function isBindableControlKey(code) {
  return typeof code === 'string' && VALID_KEY_CODE.test(code);
}

export function cloneControlSettings(settings = DEFAULT_CONTROL_SETTINGS) {
  return { ...settings };
}

export function normalizeControlSettings(candidate = {}) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const normalized = {
    middleDragAction: DRAG_ACTIONS.includes(source.middleDragAction)
      ? source.middleDragAction
      : DEFAULT_CONTROL_SETTINGS.middleDragAction,
    rightDragAction: DRAG_ACTIONS.includes(source.rightDragAction)
      ? source.rightDragAction
      : DEFAULT_CONTROL_SETTINGS.rightDragAction,
    wheelAction: WHEEL_ACTIONS.includes(source.wheelAction)
      ? source.wheelAction
      : DEFAULT_CONTROL_SETTINGS.wheelAction,
    shiftWheelAction: WHEEL_ACTIONS.includes(source.shiftWheelAction)
      ? source.shiftWheelAction
      : DEFAULT_CONTROL_SETTINGS.shiftWheelAction,
    ctrlWheelAction: WHEEL_ACTIONS.includes(source.ctrlWheelAction)
      ? source.ctrlWheelAction
      : DEFAULT_CONTROL_SETTINGS.ctrlWheelAction,
  };
  for (const field of KEY_FIELDS) {
    normalized[field] = isBindableControlKey(source[field]) ? source[field] : DEFAULT_CONTROL_SETTINGS[field];
  }
  return normalized;
}

export function validateControlSettings(candidate) {
  const settings = normalizeControlSettings(candidate);
  const errors = [];
  const keys = KEY_FIELDS.map(field => settings[field]);
  if (new Set(keys).size !== keys.length) errors.push('duplicateKeys');

  const wheelActions = [settings.wheelAction, settings.shiftWheelAction, settings.ctrlWheelAction];
  const dragActions = [settings.middleDragAction, settings.rightDragAction];
  const hasRotation = dragActions.includes('rotate')
    || wheelActions.some(action => action === 'yaw' || action === 'pitch');
  const hasZoom = dragActions.includes('zoom') || wheelActions.includes('zoom');
  if (!hasRotation) errors.push('missingRotation');
  if (!hasZoom) errors.push('missingZoom');
  return { valid: errors.length === 0, errors, settings };
}

export function controlPresetForSettings(candidate) {
  const settings = normalizeControlSettings(candidate);
  return Object.entries(CONTROL_PRESETS).find(([, preset]) => (
    SETTING_FIELDS.every(field => preset[field] === settings[field])
  ))?.[0] ?? 'custom';
}

export function wheelActionForEvent(candidate, event = {}) {
  const settings = normalizeControlSettings(candidate);
  if (event.ctrlKey) return settings.ctrlWheelAction;
  if (event.shiftKey) return settings.shiftWheelAction;
  return settings.wheelAction;
}

export function normalizeWheelDelta(event = {}, pageHeight = 800) {
  const raw = Math.abs(event.deltaY ?? 0) >= Math.abs(event.deltaX ?? 0)
    ? (event.deltaY ?? 0)
    : (event.deltaX ?? 0);
  const scale = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? pageHeight : 1);
  return Math.max(-240, Math.min(240, raw * scale));
}

export function formatControlKey(code) {
  if (code?.startsWith('Key')) return code.slice(3);
  if (code?.startsWith('Digit')) return code.slice(5);
  return ({
    Space: 'SPACE',
    Enter: 'ENTER',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
  })[code] ?? code ?? '';
}

export function loadControlSettings(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(CONTROL_STORAGE_KEY) ?? 'null');
    const result = validateControlSettings(saved);
    return result.valid ? result.settings : cloneControlSettings();
  } catch {
    return cloneControlSettings();
  }
}

export function saveControlSettings(settings, storage = globalThis.localStorage) {
  const result = validateControlSettings(settings);
  if (!result.valid) return result;
  try { storage?.setItem(CONTROL_STORAGE_KEY, JSON.stringify(result.settings)); } catch {}
  return result;
}
