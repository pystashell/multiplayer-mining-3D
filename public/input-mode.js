export const INPUT_MODE_MOUSE = 'mouse';
export const INPUT_MODE_TOUCH = 'touch';

export function detectInitialInputMode({ matchMedia, maxTouchPoints = 0 } = {}) {
  if (typeof matchMedia === 'function') {
    try {
      return matchMedia('(pointer: coarse)').matches ? INPUT_MODE_TOUCH : INPUT_MODE_MOUSE;
    } catch {}
  }
  return Number(maxTouchPoints) > 0 ? INPUT_MODE_TOUCH : INPUT_MODE_MOUSE;
}

export function inputModeFromPointerType(pointerType, currentMode = INPUT_MODE_MOUSE) {
  if (pointerType === 'touch') return INPUT_MODE_TOUCH;
  if (pointerType === 'mouse') return INPUT_MODE_MOUSE;
  return currentMode;
}

export function inputScopedTranslationKey(key, inputMode) {
  return inputMode === INPUT_MODE_TOUCH || inputMode === INPUT_MODE_MOUSE
    ? `${key}.${inputMode}`
    : key;
}
