import type {
  GenerationContext,
  PlannedStrengthSession,
  WorkoutGenerationRequest,
} from '@circuit/domain';
import { generateWorkoutForTrainingSpace, type TrainingSpaceProfile } from '@circuit/generator';
import { allocateStrengthTrainingSpaces, type SpaceAwarePlannedSession } from '@circuit/planner/strength-training-space-allocation';
import { coordinateWeeklyStrengthStimuli, type WeeklyStrengthPrescription } from '@circuit/planner/whole-athlete-strength-coherence';

import { getPreviousExerciseIds, getRecentRegionExposures, listExercisePreferences } from './database';
import { loadExerciseCatalog } from './exercise-catalog';
import { applyWeeklyStrengthPrescriptionToRequest } from './strength-prescription-generation';
import {
  gymSpace,
  homeSpace,
  loadTrainingSpacePreferences,
  type TrainingSpacePreferences,
} from './training-spaces';
import type { GeneratedWholeAthleteBlock } from './whole-athlete-plan';

export type CachedSpaceAwarePlannedSession = SpaceAwarePlannedSession & {
  strengthPrescription?: WeeklyStrengthPrescription;
};

const assignments = new Map<string, CachedSpaceAwarePlannedSession>();

export function trainingSpaceAssignmentForPlannedSession(id: string) {
  return assignments.get(id);
}

export function trainingSpaceForSession(id: string | undefined, preferences = loadTrainingSpacePreferences()): TrainingSpaceProfile | undefined {
  return id ? preferences.spaces.find((space) => space.id === id) : undefined;
}

export async function applyTrainingSpacesToGeneratedBlock(
  block: GeneratedWholeAthleteBlock,
  preferences = loadTrainingSpacePreferences(),
): Promise<GeneratedWholeAthleteBlock> {
  const home = homeSpace(preferences);
  const gym = gymSpace(preferences);
  if (!home && !gym) return block;

  const [exercises, recentRegionExposures, previousExerciseIds, exercisePreferences] = await Promise.all([
    loadExerciseCatalog(),
    getRecentRegionExposures(),
    getPreviousExerciseIds(),
    listExercisePreferences(),
  ]);
  const context: GenerationContext = { exercises, recentRegionExposures, previousExerciseIds, exercisePreferences };

  const weeks = block.weeks.map((week) => {
    const coherent = coordinateWeeklyStrengthStimuli(week.sessions);
    const strengthCount = coherent.filter((session) => session.discipline === 'strength').length;
    const counts = allocationCounts(preferences, strengthCount, Boolean(home), Boolean(gym));
    const allocated = allocateStrengthTrainingSpaces({
      sessions: coherent,
      homeSpace: home ? { id: home.id, name: home.name, environment: home.environment } : undefined,
      gymSpace: gym ? { id: gym.id, name: gym.name, environment: gym.environment } : undefined,
      preferredHomeSessions: counts.home,
      preferredGymSessions: counts.gym,
      preferGymOnSwimDays: preferences.preferGymOnSwimDays,
    }) as CachedSpaceAwarePlannedSession[];

    const sessions = allocated.map((session) => {
      if (session.discipline !== 'strength') return session;
      assignments.set(session.id, { ...session });
      const targetSpace = trainingSpaceForSession(session.trainingSpaceId, preferences);
      if (!targetSpace || !('workout' in session) || !session.workout) return session;

      const strengthSession = session as typeof session & Pick<
        PlannedStrengthSession,
        'workout' | 'purpose' | 'id' | 'date'
      >;
      const architectureRequest = applyPlannedStrengthArchitecture(
        strengthSession.workout.request,
        strengthSession,
        targetSpace,
      );
      const request = applyWeeklyStrengthPrescriptionToRequest(
        architectureRequest,
        session.strengthPrescription,
      );
      const generated = generateWorkoutForTrainingSpace(request, context, targetSpace, home);
      if (!generated.ok) return session;
      return { ...session, workout: generated.workout };
    });

    return { ...week, sessions } as typeof week;
  });

  return { ...block, weeks };
}


/**
 * Gives planned strength sessions different structural identities before
 * exercise selection. The weekly coherence layer still controls what the
 * session needs to train; this layer controls how the workout is shaped.
 *
 * We intentionally avoid making every planned session a ~40-minute work block
 * that resolves to the same five-station circuit.
 */
export function applyPlannedStrengthArchitecture(
  request: WorkoutGenerationRequest,
  session: Pick<PlannedStrengthSession, 'purpose' | 'id' | 'date'>,
  space: TrainingSpaceProfile,
): WorkoutGenerationRequest {
  const gym = space.environment === 'gym';

  switch (session.purpose) {
    case 'swim_support':
      return {
        ...request,
        // Support work should feel crisp rather than like another major workout.
        workMinutes: gym ? 28 : 24,
        allowedStationMinutes: [4, 6, 8],
        exercisesPerStation: 2,
        randomSeed: `${request.randomSeed ?? session.id}:swim-support:${space.id}`,
      };

    case 'posterior_durability':
      return {
        ...request,
        // Gym version gets enough room for meaningful loaded work without
        // turning the session into five interchangeable circuits.
        workMinutes: gym ? 36 : 32,
        allowedStationMinutes: gym ? [6, 8] : [4, 6, 8],
        exercisesPerStation: 2,
        randomSeed: `${request.randomSeed ?? session.id}:posterior:${space.id}`,
      };

    case 'single_leg_durability':
      return {
        ...request,
        workMinutes: gym ? 32 : 28,
        allowedStationMinutes: [4, 6, 8],
        exercisesPerStation: 2,
        randomSeed: `${request.randomSeed ?? session.id}:single-leg:${space.id}`,
      };

    case 'maintenance':
      return {
        ...request,
        // Maintenance should be obviously smaller than a key strength dose.
        workMinutes: 24,
        allowedStationMinutes: [4, 6, 8],
        exercisesPerStation: 2,
        randomSeed: `${request.randomSeed ?? session.id}:maintenance:${space.id}`,
      };

    default:
      return {
        ...request,
        workMinutes: gym ? 36 : 32,
        allowedStationMinutes: [4, 6, 8],
        exercisesPerStation: 2,
        randomSeed: `${request.randomSeed ?? session.id}:general:${space.id}`,
      };
  }
}


function allocationCounts(
  preferences: TrainingSpacePreferences,
  strengthCount: number,
  hasHome: boolean,
  hasGym: boolean,
): { home: number; gym: number } {
  if (strengthCount <= 0) return { home: 0, gym: 0 };
  if (preferences.strengthLocationPreference === 'home_only' && hasHome) return { home: strengthCount, gym: 0 };
  if (preferences.strengthLocationPreference === 'gym_only' && hasGym) return { home: 0, gym: strengthCount };
  if (!hasGym && hasHome) return { home: strengthCount, gym: 0 };
  if (!hasHome && hasGym) return { home: 0, gym: strengthCount };
  if (hasHome && hasGym) {
    const gymCount = clamp(preferences.preferredGymSessions ?? (strengthCount >= 3 ? 1 : 0), strengthCount);
    const homeCount = clamp(preferences.preferredHomeSessions ?? Math.max(0, strengthCount - gymCount), strengthCount - gymCount);
    return { home: homeCount + Math.max(0, strengthCount - homeCount - gymCount), gym: gymCount };
  }
  return { home: 0, gym: 0 };
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Number.isFinite(value) ? Math.floor(value) : 0));
}
