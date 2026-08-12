import type { PlannedStrengthSession } from '@circuit/domain';
import { createWorkoutVariant } from '@circuit/generator';
import type { RaceHorizonDevelopmentWeek } from '@circuit/planner';

/**
 * Applies macrocycle strength dose at read/generation time without mutating the
 * persisted strength block. Recovery weeks therefore deload the actual workout
 * the athlete opens, while the original generated session remains recoverable.
 */
export function applyRaceHorizonStrengthDose(
  session: PlannedStrengthSession,
  developmentWeek: RaceHorizonDevelopmentWeek | undefined,
): PlannedStrengthSession {
  if (!developmentWeek) return session;
  if (session.completionStatus === 'completed' || session.completionStatus === 'skipped') return session;

  const level = developmentWeek.loadIntent === 'race'
    ? 'minimum'
    : developmentWeek.loadIntent === 'recovery'
      || developmentWeek.loadIntent === 'absorb'
      || developmentWeek.loadIntent === 'taper'
      ? 'reduced'
      : null;
  if (!level) return session;
  if (session.workout.variantLevel === level) return session;

  const variant = createWorkoutVariant(session.workout, level);
  return {
    ...session,
    intendedLoad: 'light',
    workout: {
      ...variant,
      // Preserve the canonical planned-workout id so completion still resolves
      // to this session rather than becoming an unrelated strength workout.
      id: session.workout.id,
      variantOfWorkoutId: session.workout.id,
      name: session.workout.name,
    },
    rationale: [
      session.rationale,
      developmentWeek.loadIntent === 'race'
        ? 'Race-horizon dose: minimum effective strength only.'
        : 'Race-horizon dose: reduced strength volume for recovery/absorption.',
    ].filter(Boolean).join(' '),
  };
}
