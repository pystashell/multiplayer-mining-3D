function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function validPlacements({ board, safe, target, width, height, gap, obstacles = [] }) {
  if (!board || !safe || !target || width <= 0 || height <= 0) return null;

  const spaces = {
    top: board.top - safe.top,
    bottom: safe.bottom - board.bottom,
    left: board.left - safe.left,
    right: safe.right - board.right,
  };
  const candidates = [
    {
      side: 'top',
      left: clamp(target.x - width / 2, safe.left, safe.right - width),
      top: board.top - gap - height,
      score: spaces.top - height,
    },
    {
      side: 'bottom',
      left: clamp(target.x - width / 2, safe.left, safe.right - width),
      top: board.bottom + gap,
      score: spaces.bottom - height,
    },
    {
      side: 'right',
      left: board.right + gap,
      top: clamp(target.y - height / 2, safe.top, safe.bottom - height),
      score: spaces.right - width,
    },
    {
      side: 'left',
      left: board.left - gap - width,
      top: clamp(target.y - height / 2, safe.top, safe.bottom - height),
      score: spaces.left - width,
    },
  ];

  return candidates
    .map(candidate => ({
      ...candidate,
      right: candidate.left + width,
      bottom: candidate.top + height,
    }))
    .filter(candidate => (
      candidate.left >= safe.left
      && candidate.top >= safe.top
      && candidate.right <= safe.right
      && candidate.bottom <= safe.bottom
      && !overlaps(candidate, board)
      && !obstacles.some(obstacle => obstacle && overlaps(candidate, obstacle))
    ));
}

export function chooseGuidedCalloutPlacement({ board, safe, target, width, height, gap = 20 }) {
  const candidates = validPlacements({ board, safe, target, width, height, gap });
  return candidates?.sort((a, b) => b.score - a.score)[0] ?? null;
}

export function chooseFloatingAxisPlacement({ board, safe, target, width, height, gap = 14, obstacles = [] }) {
  const candidates = validPlacements({ board, safe, target, width, height, gap, obstacles });
  return candidates?.sort((left, right) => {
    const leftCenter = { x: (left.left + left.right) / 2, y: (left.top + left.bottom) / 2 };
    const rightCenter = { x: (right.left + right.right) / 2, y: (right.top + right.bottom) / 2 };
    const leftDistance = (leftCenter.x - target.x) ** 2 + (leftCenter.y - target.y) ** 2;
    const rightDistance = (rightCenter.x - target.x) ** 2 + (rightCenter.y - target.y) ** 2;
    return leftDistance - rightDistance || right.score - left.score;
  })[0] ?? null;
}
