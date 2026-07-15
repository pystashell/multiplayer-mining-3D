export const BOARD_ANIMATION_TIMING = Object.freeze({
  // Every player-initiated reveal starts with the same quick, crisp first beat.
  primaryRevealDurationMs: 110,
  cellRevealDurationMs: 220,
  cascadeRevealDurationMs: 420,
  cascadeLeadInMs: 150,
  cascadeWaveStepMs: 140,
  cascadeMaxDelayMs: 2400,
  sectorPurgeCellDurationMs: 650,
  sectorPurgeStaggerMs: 48,
});

export function revealAnimationTiming(wave, timing = BOARD_ANIMATION_TIMING) {
  if (wave === null || wave === undefined || !Number.isFinite(Number(wave))) {
    return {
      delayMs: 0,
      durationMs: timing.cellRevealDurationMs,
      isPrimary: false,
      isCascade: false,
    };
  }

  const normalizedWave = Math.max(0, Math.floor(Number(wave)));
  if (normalizedWave === 0) {
    return {
      delayMs: 0,
      durationMs: timing.primaryRevealDurationMs,
      isPrimary: true,
      isCascade: false,
    };
  }

  return {
    delayMs: Math.min(
      timing.cascadeMaxDelayMs,
      timing.cascadeLeadInMs + (normalizedWave - 1) * timing.cascadeWaveStepMs,
    ),
    durationMs: timing.cascadeRevealDurationMs,
    isPrimary: false,
    isCascade: true,
  };
}
