import type { TrainingRegion } from './daily-training-guardrails';

export type ExposureDiscipline = 'run' | 'bike' | 'swim' | 'strength' | 'hiit' | 'unknown';

export interface CrossSportExposure {
  id: string;
  discipline: ExposureDiscipline;
  minutes: number;
}

export interface CrossSportDecision {
  conflict: boolean;
  affectedRegions: TrainingRegion[];
  reasons: string[];
}

/**
 * Exposure overlap is a caution flag, not a conversion between minutes of
 * different sports. We deliberately avoid claiming 1 min running equals
 * 1 min lifting or assuming cross-sport training stress is additive in time.
 */
export function assessCrossSportExposure(
  proposedRegions: readonly TrainingRegion[],
  exposures: readonly CrossSportExposure[],
): CrossSportDecision {
  const concerns = new Set<TrainingRegion>();
  const labels = new Set<string>();
  for (const entry of exposures) {
    if (!Number.isFinite(entry.minutes) || entry.minutes <= 0) continue;
    const achilles = entry.discipline === 'run' || entry.discipline === 'bike'
      || entry.discipline === 'hiit' || entry.discipline === 'strength' || entry.discipline === 'unknown';
    const upperBack = entry.discipline === 'swim' || entry.discipline === 'hiit'
      || entry.discipline === 'strength' || entry.discipline === 'unknown';
    if (achilles && proposedRegions.includes('achilles')) {
      concerns.add('achilles');
      labels.add(entry.discipline);
    }
    if (upperBack && proposedRegions.includes('upper_back')) {
      concerns.add('upper_back');
      labels.add(entry.discipline);
    }
  }
  if (!concerns.size) return { conflict: false, affectedRegions: [], reasons: [] };
  return {
    conflict: true,
    affectedRegions: [...concerns],
    reasons: [
      `Earlier ${[...labels].join('/')} activity overlaps a recovering region loaded by this session. Review combined exposure before adding more training.`,
    ],
  };
}
