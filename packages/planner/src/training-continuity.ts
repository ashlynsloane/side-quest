import type {
  AthleteProgressionContinuity,
  ProgressionDiscipline,
  ProgressionInterruptionReason,
} from './athlete-progression-engine';

export interface ProgressionTrainingExposure {
  discipline: ProgressionDiscipline;
  completedAt: string;
}

export interface DisciplineContinuityInput {
  discipline: ProgressionDiscipline;
  asOf: string;
  exposures: ProgressionTrainingExposure[];
  interruptionReason?: ProgressionInterruptionReason;
}

export interface DisciplineContinuityResult {
  continuity: AthleteProgressionContinuity | null;
  latestExposureAt?: string;
  comparableExposureCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Derives continuity for one discipline from completed training only.
 *
 * A vacation or travel window does not automatically mean detraining. If the
 * athlete kept swimming while away, swim continuity remains current while bike
 * or strength can independently enter a re-entry path.
 *
 * Returns null continuity when there is no trustworthy exposure history. The
 * caller should collect/confirm a baseline rather than assuming a long layoff.
 */
export function deriveDisciplineContinuity(input: DisciplineContinuityInput): DisciplineContinuityResult {
  const asOfMs = timestamp(input.asOf);
  if (asOfMs === null) return { continuity: null, comparableExposureCount: 0 };

  const comparable = input.exposures
    .filter((item) => item.discipline === input.discipline)
    .map((item) => ({ item, time: timestamp(item.completedAt) }))
    .filter((entry): entry is { item: ProgressionTrainingExposure; time: number } => entry.time !== null)
    .filter((entry) => entry.time <= asOfMs)
    .sort((left, right) => right.time - left.time);

  const latest = comparable[0];
  if (!latest) return { continuity: null, comparableExposureCount: 0 };

  const daysSinceExposure = Math.max(0, Math.floor((asOfMs - latest.time) / DAY_MS));
  return {
    continuity: {
      daysSinceExposure,
      ...(input.interruptionReason ? { interruptionReason: input.interruptionReason } : {}),
    },
    latestExposureAt: latest.item.completedAt,
    comparableExposureCount: comparable.length,
  };
}

export function deriveAllDisciplineContinuity({
  asOf,
  exposures,
  interruptionReason,
}: {
  asOf: string;
  exposures: ProgressionTrainingExposure[];
  interruptionReason?: ProgressionInterruptionReason;
}): Partial<Record<ProgressionDiscipline, DisciplineContinuityResult>> {
  const disciplines: ProgressionDiscipline[] = ['strength', 'swim', 'bike', 'run'];
  return Object.fromEntries(
    disciplines.map((discipline) => [
      discipline,
      deriveDisciplineContinuity({
        discipline,
        asOf,
        exposures,
        ...(interruptionReason ? { interruptionReason } : {}),
      }),
    ]),
  ) as Partial<Record<ProgressionDiscipline, DisciplineContinuityResult>>;
}
