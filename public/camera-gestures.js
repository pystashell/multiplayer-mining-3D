export const CAMERA_GESTURE_LIMITS = Object.freeze({
  mousePanStartPx: 5,
  touchHoldMs: 420,
  touchHoldCancelPx: 10,
  touchPanStartPx: 6,
});

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function vector3(value = {}) {
  return {
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    z: finiteNumber(value.z),
  };
}

export function pointerDistance(start, current) {
  const from = start ?? {};
  const to = current ?? {};
  return Math.hypot(
    finiteNumber(to.x ?? to.clientX) - finiteNumber(from.x ?? from.clientX),
    finiteNumber(to.y ?? to.clientY) - finiteNumber(from.y ?? from.clientY),
  );
}

export function shouldStartMousePan({
  centerMode,
  pointerType,
  pointerId,
  panPointerId,
  buttons,
  chordTriggered = false,
  start,
  current,
} = {}) {
  if (centerMode !== 'movable' || pointerType !== 'mouse') return false;
  if (pointerId == null || pointerId !== panPointerId || chordTriggered) return false;
  // Panning belongs to a right-only drag. Left+right remains exclusively a
  // Minesweeper chord / Reduction gesture even after the pointer moves.
  if ((finiteNumber(buttons) & 3) !== 2) return false;
  return pointerDistance(start, current) >= CAMERA_GESTURE_LIMITS.mousePanStartPx;
}

export function touchHoldDecision({
  elapsedMs = 0,
  start,
  current,
  activePointerCount = 1,
  hadMultiplePointers = false,
  cancelled = false,
} = {}) {
  if (
    cancelled
    || hadMultiplePointers
    || activePointerCount !== 1
    || pointerDistance(start, current) > CAMERA_GESTURE_LIMITS.touchHoldCancelPx
  ) {
    return 'cancel';
  }
  return finiteNumber(elapsedMs) >= CAMERA_GESTURE_LIMITS.touchHoldMs
    ? 'trigger'
    : 'pending';
}

export function shouldStartTouchPan({
  centerMode,
  holdTriggered = false,
  panActive = false,
  pointerId,
  holdPointerId,
  activePointerCount = 1,
  hadMultiplePointers = false,
  start,
  current,
} = {}) {
  if (
    centerMode !== 'movable'
    || !holdTriggered
    || panActive
    || pointerId == null
    || pointerId !== holdPointerId
    || activePointerCount !== 1
    || hadMultiplePointers
  ) {
    return false;
  }
  return pointerDistance(start, current) >= CAMERA_GESTURE_LIMITS.touchPanStartPx;
}

export function interruptedGesturePatch({
  pointerType = 'all',
  clearMultiTouch = true,
} = {}) {
  const patch = {};
  if (pointerType === 'all' || pointerType === 'mouse') {
    Object.assign(patch, {
      mousePanActive: false,
      mousePanPointerId: null,
      mousePanStartPosition: null,
      mousePanLastPosition: null,
      mouseChordTriggered: false,
      mouseChordButtons: 0,
      mouseChordAnchor: null,
      mouseChordFocusTarget: null,
    });
  }
  if (pointerType === 'all' || pointerType === 'touch') {
    Object.assign(patch, {
      touchHoldTimer: null,
      touchHoldTriggered: false,
      touchInspectionActive: false,
      touchHoldLatestPosition: null,
      touchPanActive: false,
      touchPanPointerId: null,
      touchPanLastPosition: null,
    });
    if (clearMultiTouch) patch.touchGestureHadMultiplePointers = false;
  }
  return patch;
}

export function screenPanTranslation({
  deltaX,
  deltaY,
  viewportHeight,
  targetDistance,
  verticalFovDegrees,
  screenRight,
  screenUp,
} = {}) {
  const height = Math.max(1, finiteNumber(viewportHeight, 1));
  const distance = Math.max(0.01, finiteNumber(targetDistance, 0.01));
  const fovRadians = finiteNumber(verticalFovDegrees) * Math.PI / 180;
  const worldUnitsPerPixel = (2 * distance * Math.tan(fovRadians * 0.5)) / height;
  const right = vector3(screenRight);
  const up = vector3(screenUp);
  const horizontal = -finiteNumber(deltaX) * worldUnitsPerPixel;
  const vertical = finiteNumber(deltaY) * worldUnitsPerPixel;
  return {
    x: right.x * horizontal + up.x * vertical,
    y: right.y * horizontal + up.y * vertical,
    z: right.z * horizontal + up.z * vertical,
  };
}

export function recenterCameraKeepingOffset(cameraPosition, target) {
  const camera = vector3(cameraPosition);
  const origin = vector3(target);
  return {
    cameraPosition: {
      x: camera.x - origin.x,
      y: camera.y - origin.y,
      z: camera.z - origin.z,
    },
    target: { x: 0, y: 0, z: 0 },
  };
}
