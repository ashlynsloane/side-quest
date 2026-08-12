import type { GenerationContext, GenerationResult } from '@circuit/domain';
import {
  generateWorkoutForTrainingSpace,
  type TrainingSpaceProfile,
} from '@circuit/generator';
import {
  allocateStrengthTrainingSpaces,
  type SpaceAwarePlannedSession,
} from '@circuit/planner/strength-training-space-allocation';
import type { WholeAthletePlannedSession } from '@circuit/planner/whole-athlete-week';

import {
  gymSpace,
  homeSpace,
  loadTrainingSpacePreferences,
  type TrainingSpacePreferences,
} from './training-spaces';

export interface ResolvedTrainingSpaceWeek {
  sessions: SpaceAwarePlannedSession[];
  preferences: TrainingSpacePreferences;
}

const plannedStrengthSpaceAssignments = new Map<string, SpaceAwarePlannedSession>();

/**
 * Applies the athlete's persisted Home/Gym configuration to a physiologically
 * finished week. No session dates, loads, or recovery decisions are moved here.
 */
export function applyPersistedTrainingSpaces(
  sessions: WholeAthletePlannedSession[],
  preferences = loadTrainingSpacePreferences(),
): ResolvedTrainingSpaceWeek {
  const home = homeSpace(preferences);
  const gym = gymSpace(preferences);

  if (!home && !gym) {
    const unresolved = sessions.map((session) => ({ ...session }));
    cacheStrengthAssignments(unresolved);
    return { sessions: unresolved, preferences };
  }

  const strengthCount = sessions.filter((session) => session.discipline === 'strength').length;
  const allocation = allocationCounts(preferences, strengthCount, Boolean(home), Boolean(gym));
  const resolved = allocateStrengthTrainingSpaces({
    sessions,
    homeSpace: home ? toPlannerSpace(home) : undefined,
    gymSpace: gym ? toPlannerSpace(gym) : undefined,
    preferredHomeSessions: allocation.home,
    preferredGymSessions: allocation.gym,
    preferGymOnSwimDays: preferences.preferGymOnSwimDays,
  });
  cacheStrengthAssignments(resolved);

  return {
    sessions: resolved,
    preferences,
  };
}

/**
 * Returns the most recent Home/Gym assignment for a planned strength session.
 * Whole-athlete normalization preserves PlannedStrengthSession.id, so this key
 * remains stable between the strength block and the unified weekly planner.
 */
export function trainingSpaceAssignmentForPlannedSession(
  plannedSessionId: string,
): SpaceAwarePlannedSession | undefined {
  return plannedStrengthSpaceAssignments.get(plannedSessionId);
}

export function clearCachedTrainingSpaceAssignments(): void {
  plannedStrengthSpaceAssignments.clear();
}

/**
 * Generates a workout using the exact equipment/load capabilities of the
 * training space assigned to this planned strength session.
 *
 * Falls back to undefined when no training space is assigned/configured so the
 * caller can preserve legacy workout generation rather than invent equipment.
 */
export function generateWorkoutForAssignedTrainingSpace({
  session,
  request,
  context,
  preferences = loadTrainingSpacePreferences(),
}: {
  session: Pick<SpaceAwarePlannedSession, 'trainingSpaceId'>;
  request: Parameters<typeof generateWorkoutForTrainingSpace>[0];
  context: GenerationContext;
  preferences?: TrainingSpacePreferences;
}): GenerationResult | undefined {
  if (!session.trainingSpaceId) return undefined;
  const targetSpace = preferences.spaces.find((space) => space.id === session.trainingSpaceId);
  if (!targetSpace) return undefined;

  return generateWorkoutForTrainingSpace(
    request,
    context,
    targetSpace,
    homeSpace(preferences),
  );
}

export function trainingSpaceForSession(
  trainingSpaceId: string | undefined,
  preferences = loadTrainingSpacePreferences(),
): TrainingSpaceProfile | undefined {
  if (!trainingSpaceId) return undefined;
  return preferences.spaces.find((space) => space.id === trainingSpaceId);
}

function cacheStrengthAssignments(sessions: SpaceAwarePlannedSession[]): void {
  for (const session of sessions) {
    if (session.discipline !== 'strength') continue;
    plannedStrengthSpaceAssignments.set(session.id, { ...session });
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
    const requestedGym = clamp(
      preferences.preferredGymSessions ?? (strengthCount >= 3 ? 1 : 0),
      strengthCount,
    );
    const requestedHome = clamp(
      preferences.preferredHomeSessions ?? Math.max(0, strengthCount - requestedGym),
      strengthCount - requestedGym,
    );
    const unassigned = Math.max(0, strengthCount - requestedHome - requestedGym);
    return { home: requestedHome + unassigned, gym: requestedGym };
  }

  return { home: 0, gym: 0 };
}

function toPlannerSpace(space: TrainingSpaceProfile) {
  return { id: space.id, name: space.name, environment: space.environment };
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.floor(value)));
}
