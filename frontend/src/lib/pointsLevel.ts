/**
 * Points → level (max 150). Rising XP curve (Helldivers-style).
 * Same logic as `backend/src/utils/pointsLevel.ts` — update both if you change tuning.
 */
export const MAX_POINTS_LEVEL = 150;

const MULT = 4;
const EXP = 1.65;

function buildMinPointsPerLevel(): number[] {
  const min: number[] = [];
  min[1] = Number.MIN_SAFE_INTEGER;
  let cumulative = 0;
  for (let l = 1; l < MAX_POINTS_LEVEL; l++) {
    const step = Math.max(1, Math.round(MULT * l ** EXP));
    cumulative += step;
    min[l + 1] = cumulative;
  }
  return min;
}

export const MIN_POINTS_FOR_LEVEL = buildMinPointsPerLevel();

export function levelFromTotalPoints(totalPoints: number): number {
  const p = Math.trunc(totalPoints);
  let lo = 1;
  let hi = MAX_POINTS_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (MIN_POINTS_FOR_LEVEL[mid] <= p) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

export interface PointsLevelState {
  level: number;
  maxLevel: number;
  pointsToNextLevel: number;
  nextLevelAtPoints: number | null;
  levelProgress: number;
}

export function getPointsLevelState(totalPoints: number): PointsLevelState {
  const points = Math.trunc(totalPoints);
  const level = levelFromTotalPoints(points);
  if (level >= MAX_POINTS_LEVEL) {
    return {
      level: MAX_POINTS_LEVEL,
      maxLevel: MAX_POINTS_LEVEL,
      pointsToNextLevel: 0,
      nextLevelAtPoints: null,
      levelProgress: 1,
    };
  }
  const low = MIN_POINTS_FOR_LEVEL[level];
  const high = MIN_POINTS_FOR_LEVEL[level + 1];
  const span = high - low;
  const levelProgress = span <= 0 ? 1 : Math.max(0, Math.min(1, (points - low) / span));
  return {
    level,
    maxLevel: MAX_POINTS_LEVEL,
    pointsToNextLevel: Math.max(0, high - points),
    nextLevelAtPoints: high,
    levelProgress,
  };
}
