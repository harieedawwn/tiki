/** Points by stage index; stages past the end score the last value. */
export const STAGE_POINTS = [1000, 700, 450, 250, 100];

export function pointsForStage(stage: number): number {
  return STAGE_POINTS[Math.min(Math.max(stage, 0), STAGE_POINTS.length - 1)];
}

export const MAX_SPEED_BONUS = 200;

/** Multiplayer speed bonus: MAX at the stage start, falling linearly to 0 at the end of the interval. */
export function speedBonus(elapsedMs: number, intervalMs: number): number {
  if (intervalMs <= 0) return 0;
  const f = 1 - Math.min(Math.max(elapsedMs, 0), intervalMs) / intervalMs;
  return Math.round(MAX_SPEED_BONUS * f);
}
