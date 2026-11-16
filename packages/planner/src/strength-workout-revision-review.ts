import type { GeneratedWorkout } from '@circuit/domain';

export interface StrengthRevisionReview {
  structurallyValid: boolean;
  reasons: string[];
  /** This validator cannot establish medical or rehabilitation safety. */
  requiresCurrentRestrictionReview: true;
  /** Never start a workout or authorize an approval based on this result. */
  autoApproved: false;
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function finitePositive(value: unknown): value is number {
  return finiteNonnegative(value) && value > 0;
}

/**
 * Conservative structural check for an athlete-reviewed shorter workout.
 * Does NOT check pain response, tissue load, PT rules, equipment safety,
 * station balance or an exercise-specific dose ceiling. Even a valid result
 * remains pending independently refreshed restriction and athlete review.
 */
export function evaluateStrengthWorkoutRevision(input: {
  original: GeneratedWorkout;
  proposed: GeneratedWorkout;
  maximumMinutes: number;
}): StrengthRevisionReview {
  const reasons: string[] = [];
  const reject = (reason: string) => { reasons.push(reason); };
  const { original, proposed, maximumMinutes } = input;
  if (!finitePositive(maximumMinutes)) reject('Invalid planning-time ceiling.');
  if (!original || !proposed || !original.id || !proposed.id
    || !Array.isArray(original.stations) || !Array.isArray(proposed.stations)
    || original.stations.length === 0 || proposed.stations.length === 0) {
    return { structurallyValid: false, reasons: ['Missing workout identity or stations.'],
      requiresCurrentRestrictionReview: true, autoApproved: false };
  }
  if (!finitePositive(original.estimatedElapsedSeconds)
    || !finitePositive(proposed.estimatedElapsedSeconds)
    || proposed.estimatedElapsedSeconds > original.estimatedElapsedSeconds
    || proposed.estimatedElapsedSeconds > maximumMinutes * 60) {
    reject('Elapsed time is missing, increased, or exceeds the planning ceiling.');
  }
  for (const key of ['totalWorkSeconds', 'totalRestSeconds'] as const) {
    if (!finiteNonnegative(original[key]) || !finiteNonnegative(proposed[key])
      || proposed[key] > original[key]) {
      reject(key + ' is invalid or increased.');
    }
  }
  if (proposed.stations.length > original.stations.length) {
    reject('A shorter revision cannot add stations.');
  }
  const sourceStations = new Map(original.stations.map(s => [s.id, s]));
  if (sourceStations.size !== original.stations.length
    || new Set(proposed.stations.map(s => s.id)).size !== proposed.stations.length) {
    reject('Station identity is ambiguous.');
  }
  const usedExercises = new Set<string>();
  for (const station of proposed.stations) {
    const source = sourceStations.get(station.id);
    if (!source || !station.id || !finitePositive(station.durationSeconds)
      || !finitePositive(source.durationSeconds)
      || station.durationSeconds > source.durationSeconds
      || station.order !== source.order || station.format !== source.format
      || !Array.isArray(station.exercises) || station.exercises.length === 0
      || !Array.isArray(source.exercises) || source.exercises.length === 0) {
      reject('Unrecognized, empty, increased, or structurally modified station.');
      continue;
    }
    if (station.exercises.length > source.exercises.length) {
      reject('A revision cannot add exercises.');
    }
    const sourceExercises = new Map(source.exercises.map(e => [e.exerciseId, e]));
    if (sourceExercises.size !== source.exercises.length
      || new Set(station.exercises.map(e => e.exerciseId)).size !== station.exercises.length) {
      reject('Exercise identity is ambiguous.');
    }
    for (const exercise of station.exercises) {
      const previous = sourceExercises.get(exercise.exerciseId);
      if (!previous || !exercise.exerciseId
        || usedExercises.has(station.id + ':' + exercise.exerciseId)) {
        reject('New, duplicated, or unrecognized exercise.');
        continue;
      }
      usedExercises.add(station.id + ':' + exercise.exerciseId);
      if (!finitePositive(previous.target) || !finitePositive(exercise.target)
        || exercise.target > previous.target
        || exercise.unit !== previous.unit || exercise.order !== previous.order
        || exercise.prescriptionId !== previous.prescriptionId
        || exercise.equipmentOptionId !== previous.equipmentOptionId
        || JSON.stringify(exercise.exerciseSnapshot) !== JSON.stringify(previous.exerciseSnapshot)) {
        reject('Exercise target, prescription, equipment or snapshot changed unsafely.');
      }
      // Unknown load, unit changes and removal of recorded resistance are not
      // interpreted as a harmless reduction.
      const before = previous.userLoadValue;
      const after = exercise.userLoadValue;
      if ((before === undefined) !== (after === undefined)
        || (before !== undefined && (!finiteNonnegative(before)
          || !finiteNonnegative(after) || after! > before))
        || exercise.userLoadUnit !== previous.userLoadUnit) {
        reject('Resistance load is ambiguous, increased or changes units.');
      }
    }
  }
  const totalStationTime = proposed.stations.reduce(
    (sum, station) => sum + station.durationSeconds, 0);
  if (!Number.isFinite(totalStationTime)
    || totalStationTime > proposed.totalWorkSeconds
    || proposed.totalWorkSeconds + proposed.totalRestSeconds
      > proposed.estimatedElapsedSeconds) {
    reject('Proposed station time does not reconcile with workout timing.');
  }
  return { structurallyValid: reasons.length === 0, reasons,
    requiresCurrentRestrictionReview: true, autoApproved: false };
}
