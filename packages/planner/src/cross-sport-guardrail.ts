import type { TrainingRegion } from './daily-training-guardrails';

export type ExposureDiscipline = 'run' | 'bike' | 'swim' | 'strength' | 'hiit' | 'unknown';

export interface CrossSportExposure {
  id: string;
  discipline: ExposureDiscipline;
  minutes: number;
  occurredAt?: string;
  /** Known tissue exposure from a recorded workout; absent for many imports. */
  regions?: TrainingRegion[];
}

export interface CrossSportDecision {
  conflict: boolean;
  affectedRegions: TrainingRegion[];
  reasons: string[];
  /** Most recent relevant exposure per region, when timestamps are valid. */
  lastExposureAt?: Partial<Record<TrainingRegion, string>>;
  /** No valid timestamp: a reported recovery observation cannot be compared. */
  unknownTimingRegions?: TrainingRegion[];
}

/**
 * Exposure overlap is a caution flag, not a conversion between minutes of
 * different sports. We deliberately avoid claiming 1 min running equals
 * 1 min lifting or assuming cross-sport training stress is additive in time.
 */
export function assessCrossSportExposure(
  proposedRegions: readonly TrainingRegion[],
  exposures: readonly CrossSportExposure[],
  window?: { now: string; lookbackHours: number },
): CrossSportDecision {
  const concerns = new Set<TrainingRegion>();
  const labels = new Set<string>();
  const lastExposureAt: Partial<Record<TrainingRegion, string>> = {};
  const unknownTiming = new Set<TrainingRegion>();
  const now = window ? Date.parse(window.now) : NaN;
  if (window && (!Number.isFinite(now) || !Number.isFinite(window.lookbackHours) ||
      window.lookbackHours <= 0)) {
    throw new Error('Invalid lookback window');
  }
  for (const entry of exposures) {
    if (!Number.isFinite(entry.minutes) || entry.minutes <= 0) continue;
    if (window && entry.occurredAt) {
      const occurred = Date.parse(entry.occurredAt);
      if (Number.isFinite(occurred) &&
          (occurred > now || now - occurred > window.lookbackHours * 60 * 60 * 1000)) continue;
      // Unknown dates remain cautionary instead of disappearing from history.
    }
    const achilles = entry.regions
      ? entry.regions.includes('achilles')
      : entry.discipline === 'run' || entry.discipline === 'bike'
        || entry.discipline === 'hiit' || entry.discipline === 'strength' || entry.discipline === 'unknown';
    const upperBack = entry.regions
      ? entry.regions.includes('upper_back')
      : entry.discipline === 'swim' || entry.discipline === 'hiit'
        || entry.discipline === 'strength' || entry.discipline === 'unknown';
    const mark = (region: TrainingRegion) => {
      concerns.add(region);
      labels.add(entry.discipline);
      const time = Date.parse(entry.occurredAt ?? '');
      if (!Number.isFinite(time)) {
        unknownTiming.add(region);
        return;
      }
      const previous = Date.parse(lastExposureAt[region] ?? '');
      if (!Number.isFinite(previous) || time > previous)
        lastExposureAt[region] = new Date(time).toISOString();
    };
    if (achilles && proposedRegions.includes('achilles')) mark('achilles');
    if (upperBack && proposedRegions.includes('upper_back')) mark('upper_back');
  }
  if (!concerns.size) return { conflict: false, affectedRegions: [], reasons: [] };
  return {
    conflict: true,
    affectedRegions: [...concerns],
    lastExposureAt,
    unknownTimingRegions: [...unknownTiming],
    reasons: [
      `Recent ${[...labels].join('/')} activity overlaps a recovering region loaded by this session. Review combined exposure before adding more training.`,
    ],
  };
}
