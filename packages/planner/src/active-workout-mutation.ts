import type { GeneratedWorkout, WorkoutExercisePrescription } from '@circuit/domain';
import { affectedTrainingRegions } from './training-region-inference';

export interface WorkoutMutationDecision {
  allowed: boolean;
  reasons: string[];
}

/**
 * Session-in-progress editing is a one-way safety valve: substitutions and
 * reductions are possible, but increasing duration, repetitions, impact or
 * exposing a new region requires leaving the live session and reviewing a
 * new prescription.
 *
 * Compare with the *current* version of the active workout. Each accepted
 * edit must be non-escalating, so successive edits cannot ratchet up dose.
 */
export function assessActiveWorkoutMutation(
  current: GeneratedWorkout,
  candidate: GeneratedWorkout,
): WorkoutMutationDecision {
  const reasons: string[] = [];
  const fail = (reason: string) => { reasons.push(reason); };
  const finiteNonnegative = (value: number) => Number.isFinite(value) && value >= 0;
  if (!current || !candidate || candidate.id !== current.id ||
      !Array.isArray(candidate.stations) || !Array.isArray(current.stations)) {
    return { allowed: false, reasons: ['Workout identity or station structure changed.'] };
  }
  if (![current.estimatedElapsedSeconds, current.totalWorkSeconds,
        candidate.estimatedElapsedSeconds, candidate.totalWorkSeconds,
        current.totalRestSeconds, candidate.totalRestSeconds].every(finiteNonnegative)) {
    fail('Workout duration is invalid.');
  } else if (candidate.estimatedElapsedSeconds > current.estimatedElapsedSeconds ||
             candidate.totalWorkSeconds > current.totalWorkSeconds ||
             candidate.totalRestSeconds > current.totalRestSeconds) {
    fail('A live edit cannot increase session duration.');
  }
  if (candidate.stations.length !== current.stations.length) {
    fail('Adding or removing stations requires a new plan review.');
  }
  const currentRegions = new Set(affectedTrainingRegions(current));
  const nextRegions = affectedTrainingRegions(candidate);
  if (nextRegions.some((region) => !currentRegions.has(region))) {
    fail('A substitution loads a region not cleared for the current session.');
  }
  for (let index = 0; index < current.stations.length; index += 1) {
    const originalStation = current.stations[index]!;
    const nextStation = candidate.stations[index];
    if (!nextStation || originalStation.id !== nextStation.id ||
        !finiteNonnegative(nextStation.durationSeconds) ||
        nextStation.durationSeconds > originalStation.durationSeconds) {
      fail('Station identity or work duration changed.');
      continue;
    }
    if (!Array.isArray(nextStation.exercises) ||
        nextStation.exercises.length !== originalStation.exercises.length) {
      fail('Adding or removing exercises requires a new plan review.');
      continue;
    }
    for (let j = 0; j < originalStation.exercises.length; j += 1) {
      const old = originalStation.exercises[j]!;
      const next = nextStation.exercises[j]!;
      if (!old.exerciseSnapshot || !next.exerciseSnapshot ||
          old.unit !== next.unit || !finiteNonnegative(next.target)) {
        fail('Changed exercise target or unit is not comparable.');
        continue;
      }
      if (next.target > old.target) {
        fail('A live edit cannot increase exercise target repetitions or seconds.');
      }
      if (next.exerciseSnapshot.impactLevel > old.exerciseSnapshot.impactLevel ||
          next.exerciseSnapshot.balanceDemand > old.exerciseSnapshot.balanceDemand ||
          next.exerciseSnapshot.cardiovascularDemand > old.exerciseSnapshot.cardiovascularDemand) {
        fail('Replacement increases impact, balance or cardiovascular demand.');
      }
      for (const newLoad of next.exerciseSnapshot.jointLoads) {
        const prior = old.exerciseSnapshot.jointLoads.find((item) => item.region === newLoad.region);
        if (!prior && newLoad.load > 0) {
          fail('Replacement introduces a newly loaded joint.');
        } else if (prior && newLoad.load > prior.load) {
          fail('Replacement increases joint load.');
        }
      }
    }
  }
  return { allowed: reasons.length === 0, reasons: [...new Set(reasons)] };
}
