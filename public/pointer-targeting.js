function hitCell(intersection, getCell) {
  const object = intersection?.object;
  const { x, y, z } = object?.userData ?? {};
  if (![x, y, z].every(Number.isInteger)) return null;
  const cell = getCell(x, y, z);
  if (!cell || cell.isPurged || cell.group?.visible === false) return null;
  return { object, cell, x, y, z };
}

export function intersectionHitsVisibleNumberPixel(intersection, alphaThreshold = 12) {
  const object = intersection?.object;
  if (object?.userData?.type !== 'number') return true;
  const hitMask = object.userData.numberHitMask;
  const uv = intersection?.uv;
  if (!hitMask || !uv) return true;
  const width = Number(hitMask.width) || 0;
  const height = Number(hitMask.height) || 0;
  const alpha = hitMask.alpha;
  if (!width || !height || !alpha?.length) return true;
  const normalizedX = Number(uv.x);
  const normalizedV = Number(uv.y);
  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedV)) return false;
  const x = Math.max(0, Math.min(width - 1, Math.floor(normalizedX * width)));
  // Sprite UVs use a bottom-left origin. CanvasTexture flips DOM canvases by
  // default, so convert the raycast UV back to the exact source-canvas row.
  // Respecting map.flipY also keeps this correct if the texture is customized.
  const normalizedY = object.material?.map?.flipY === false
    ? normalizedV
    : 1 - normalizedV;
  const y = Math.max(0, Math.min(height - 1, Math.floor(normalizedY * height)));
  return Number(alpha[y * width + x] || 0) >= alphaThreshold;
}

/**
 * Resolve visible targets before the invisible full-cube clue proxies.
 * This lets a visible inner cube remain clickable through already-open cells,
 * while keeping the generous clue proxy as a fallback when no solid cube or
 * number sprite was actually hit.
 */
export function resolveTwoButtonRayHits(
  primaryIntersections = [],
  clueProxyIntersections = [],
  getCell = () => null,
) {
  for (const intersection of primaryIntersections) {
    const hit = hitCell(intersection, getCell);
    if (!hit || hit.object.visible === false) continue;
    const { object, cell, x, y, z } = hit;
    if (!cell.isRevealed && object === cell.mesh) return { x, y, z, type: 'cell' };
    if (cell.isRevealed
      && cell.neighborMines > 0
      && object === cell.spriteInstance
      && intersectionHitsVisibleNumberPixel(intersection)) return { x, y, z, type: 'number' };
  }

  for (const intersection of clueProxyIntersections) {
    const hit = hitCell(intersection, getCell);
    if (!hit) continue;
    const { object, cell, x, y, z } = hit;
    if (cell.isRevealed
      && cell.neighborMines > 0
      && object === cell.mesh) return { x, y, z, type: 'number' };
  }
  return null;
}

function sameTarget(left, right) {
  return Boolean(left && right
    && left.x === right.x
    && left.y === right.y
    && left.z === right.z
    && left.type === right.type);
}

/** The first pressed button owns the chord target; the second ray is fallback. */
export function orderedTwoButtonTargets(anchorTarget = null, currentTarget = null) {
  if (!anchorTarget) return currentTarget ? [currentTarget] : [];
  if (!currentTarget || sameTarget(anchorTarget, currentTarget)) return [anchorTarget];
  return [anchorTarget, currentTarget];
}

export function targetFromFocusedCell(cell = null) {
  if (!cell
    || cell.isPurged
    || cell.isRevealed
    || cell.group?.visible === false
    || cell.mesh?.visible === false) return null;
  const { x, y, z } = cell.mesh?.userData ?? {};
  if (![x, y, z].every(Number.isInteger)) return null;
  return { x, y, z, type: 'cell' };
}

export function targetFromFocusedNumber(cell = null) {
  const sprite = cell?.spriteInstance;
  if (!cell
    || !sprite
    || !cell.isRevealed
    || cell.isPurged
    || cell.neighborMines <= 0
    || cell.group?.visible === false
    || sprite.visible === false) return null;
  const { x, y, z } = sprite.userData ?? {};
  if (![x, y, z].every(Number.isInteger)) return null;
  return { x, y, z, type: 'number' };
}

export function isTwoButtonTargetAvailable(target, getCell = () => null) {
  if (!target) return false;
  const cell = getCell(target.x, target.y, target.z);
  if (!cell || cell.isPurged || cell.group?.visible === false) return false;
  if (target.type === 'cell') {
    return Boolean(cell.mesh) && !cell.isRevealed && cell.mesh.visible !== false;
  }
  if (target.type === 'number') {
    return cell.isRevealed
      && cell.neighborMines > 0
      && Boolean(cell.spriteInstance)
      && cell.spriteInstance.visible !== false;
  }
  return false;
}

/**
 * A visible pointer focus is a user-facing promise: if a cube is glowing when
 * the two-button gesture starts, that exact cube owns the gesture. Raycasts are
 * only fallbacks when the focus or first-button anchor has become unavailable.
 */
export function resolveTwoButtonGestureTargets({
  focusTarget = null,
  anchorTarget = null,
  currentTarget = null,
  dragDistance = 0,
  dragThreshold = 5,
} = {}, getCell = () => null) {
  if (dragDistance >= dragThreshold) return [];
  if (focusTarget) {
    return isTwoButtonTargetAvailable(focusTarget, getCell) ? [focusTarget] : [];
  }
  if (anchorTarget) {
    return isTwoButtonTargetAvailable(anchorTarget, getCell) ? [anchorTarget] : [];
  }
  if (isTwoButtonTargetAvailable(currentTarget, getCell)) return [currentTarget];
  return [];
}

export function mergeTwoButtonState(previousButtons = 0, eventButtons = 0, pressedButton = 0) {
  return (previousButtons | (eventButtons & 3) | pressedButton) & 3;
}
