import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMERA_GESTURE_LIMITS,
  interruptedGesturePatch,
  pointerDistance,
  recenterCameraKeepingOffset,
  screenPanTranslation,
  shouldStartMousePan,
  shouldStartTouchPan,
  touchHoldDecision,
} from '../public/camera-gestures.js';

const mousePan = (overrides = {}) => shouldStartMousePan({
  centerMode: 'movable',
  pointerType: 'mouse',
  pointerId: 7,
  panPointerId: 7,
  buttons: 2,
  start: { x: 20, y: 30 },
  current: { x: 25, y: 30 },
  ...overrides,
});

test('right-drag panning starts at exactly 5px and never while the center is fixed', () => {
  assert.equal(CAMERA_GESTURE_LIMITS.mousePanStartPx, 5);
  assert.equal(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(mousePan({ current: { x: 24.999, y: 30 } }), false);
  assert.equal(mousePan(), true);
  assert.equal(mousePan({ centerMode: 'fixed' }), false);
});

test('left+right Minesweeper gestures and foreign pointers cannot become camera pans', () => {
  assert.equal(mousePan({ buttons: 3 }), false, 'left+right belongs to chord or Reduction');
  assert.equal(mousePan({ chordTriggered: true }), false);
  assert.equal(mousePan({ buttons: 1 }), false);
  assert.equal(mousePan({ pointerId: 8 }), false);
  assert.equal(mousePan({ pointerType: 'touch' }), false);
});

test('mobile hold waits 420ms and a premature move or second pointer cancels it', () => {
  const stationary = {
    start: { clientX: 100, clientY: 120 },
    current: { clientX: 100, clientY: 120 },
    activePointerCount: 1,
  };
  assert.equal(CAMERA_GESTURE_LIMITS.touchHoldMs, 420);
  assert.equal(touchHoldDecision({ ...stationary, elapsedMs: 419.999 }), 'pending');
  assert.equal(touchHoldDecision({ ...stationary, elapsedMs: 420 }), 'trigger');
  assert.equal(touchHoldDecision({
    ...stationary,
    elapsedMs: 420,
    current: { clientX: 110, clientY: 120 },
  }), 'trigger', 'the existing 10px boundary remains inclusive');
  assert.equal(touchHoldDecision({
    ...stationary,
    elapsedMs: 100,
    current: { clientX: 110.01, clientY: 120 },
  }), 'cancel');
  assert.equal(touchHoldDecision({
    ...stationary,
    elapsedMs: 100,
    activePointerCount: 2,
  }), 'cancel');
  assert.equal(touchHoldDecision({
    ...stationary,
    elapsedMs: 100,
    hadMultiplePointers: true,
  }), 'cancel');
});

test('touch panning starts only after the hold and its 6px handoff movement', () => {
  const gesture = {
    centerMode: 'movable',
    holdTriggered: true,
    panActive: false,
    pointerId: 4,
    holdPointerId: 4,
    activePointerCount: 1,
    start: { x: 10, y: 10 },
    current: { x: 16, y: 10 },
  };
  assert.equal(shouldStartTouchPan(gesture), true);
  assert.equal(shouldStartTouchPan({ ...gesture, current: { x: 15.99, y: 10 } }), false);
  assert.equal(shouldStartTouchPan({ ...gesture, centerMode: 'fixed' }), false);
  assert.equal(shouldStartTouchPan({ ...gesture, holdTriggered: false }), false);
  assert.equal(shouldStartTouchPan({ ...gesture, activePointerCount: 2 }), false);
  assert.equal(shouldStartTouchPan({ ...gesture, pointerId: 5 }), false);
});

test('pointercancel and blur reset every state that can leave a gesture stuck', () => {
  const touchCancel = interruptedGesturePatch({
    pointerType: 'touch',
    clearMultiTouch: false,
  });
  assert.deepEqual(touchCancel, {
    touchHoldTimer: null,
    touchHoldTriggered: false,
    touchInspectionActive: false,
    touchHoldLatestPosition: null,
    touchPanActive: false,
    touchPanPointerId: null,
    touchPanLastPosition: null,
  });

  const blur = interruptedGesturePatch();
  assert.equal(blur.mousePanActive, false);
  assert.equal(blur.mousePanPointerId, null);
  assert.equal(blur.mouseChordTriggered, false);
  assert.equal(blur.mouseChordButtons, 0);
  assert.equal(blur.mouseChordAnchor, null);
  assert.equal(blur.mouseChordFocusTarget, null);
  assert.equal(blur.touchHoldTriggered, false);
  assert.equal(blur.touchInspectionActive, false);
  assert.equal(blur.touchPanActive, false);
  assert.equal(blur.touchPanPointerId, null);
  assert.equal(blur.touchGestureHadMultiplePointers, false);
});

test('screen-space pan moves camera and target together while recenter preserves offset', () => {
  const translation = screenPanTranslation({
    deltaX: 100,
    deltaY: 50,
    viewportHeight: 1000,
    targetDistance: 10,
    verticalFovDegrees: 60,
    screenRight: { x: 1, y: 0, z: 0 },
    screenUp: { x: 0, y: 1, z: 0 },
  });
  assert.ok(Math.abs(translation.x + 1.154700538) < 1e-8);
  assert.ok(Math.abs(translation.y - 0.577350269) < 1e-8);
  assert.equal(translation.z, 0);

  const beforeCamera = { x: 8, y: 7, z: 6 };
  const beforeTarget = { x: 3, y: 2, z: 1 };
  const recentered = recenterCameraKeepingOffset(beforeCamera, beforeTarget);
  assert.deepEqual(recentered, {
    cameraPosition: { x: 5, y: 5, z: 5 },
    target: { x: 0, y: 0, z: 0 },
  });
  assert.deepEqual({
    x: beforeCamera.x - beforeTarget.x,
    y: beforeCamera.y - beforeTarget.y,
    z: beforeCamera.z - beforeTarget.z,
  }, {
    x: recentered.cameraPosition.x - recentered.target.x,
    y: recentered.cameraPosition.y - recentered.target.y,
    z: recentered.cameraPosition.z - recentered.target.z,
  });
});
