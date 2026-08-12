import type { WholeAthletePlannedSession } from './whole-athlete-week';

export type StrengthTrainingEnvironment = 'home' | 'gym' | 'custom';

export interface StrengthTrainingSpaceRef {
  id: string;
  name: string;
  environment: StrengthTrainingEnvironment;
}

export interface StrengthTrainingSpaceAllocationInput {
  sessions: WholeAthletePlannedSession[];
  homeSpace: StrengthTrainingSpaceRef;
  gymSpace: StrengthTrainingSpaceRef;
  preferredHomeSessions?: number;
  preferredGymSessions?: number;
  preferGymOnSwimDays?: boolean;
}

export interface TrainingSpaceAssignment {
  trainingSpaceId: string;
  trainingSpaceName: string;
  trainingEnvironment: StrengthTrainingEnvironment;
  trainingSpaceReason: string;
}

export type SpaceAwarePlannedSession = WholeAthletePlannedSession & Partial<TrainingSpaceAssignment>;

/**
 * Assigns scarce gym opportunities across a finished weekly plan.
 *
 * This deliberately runs after physiological/session placement. Location should
 * exploit the week that the planner already decided is safe and coherent; it
 * should not move sessions or override recovery constraints merely to satisfy a
 * home/gym preference.
 */
export function allocateStrengthTrainingSpaces(
  input: StrengthTrainingSpaceAllocationInput,
): SpaceAwarePlannedSession[] {
  const strengthSessions = input.sessions.filter((session) => session.discipline === 'strength');
  if (strengthSessions.length === 0) return input.sessions.map((session) => ({ ...session }));

  const preferredGymSessions = clampCount(
    input.preferredGymSessions ?? (strengthSessions.length >= 3 ? 1 : 0),
    strengthSessions.length,
  );
  const preferredHomeSessions = clampCount(
    input.preferredHomeSessions ?? Math.max(0, strengthSessions.length - preferredGymSessions),
    strengthSessions.length,
  );

  const swimDates = new Set(
    input.sessions
      .filter((session) => session.discipline === 'swim')
      .map((session) => session.date),
  );

  const gymCandidates = [...strengthSessions].sort((left, right) => {
    const leftScore = gymAssignmentScore(left, swimDates, input.preferGymOnSwimDays !== false);
    const rightScore = gymAssignmentScore(right, swimDates, input.preferGymOnSwimDays !== false);
    return rightScore - leftScore || left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
  });

  const gymIds = new Set(gymCandidates.slice(0, preferredGymSessions).map((session) => session.id));
  const remaining = strengthSessions.filter((session) => !gymIds.has(session.id));
  const homeIds = new Set(remaining.slice(0, preferredHomeSessions).map((session) => session.id));

  return input.sessions.map((session): SpaceAwarePlannedSession => {
    if (session.discipline !== 'strength') return { ...session };

    if (gymIds.has(session.id)) {
      const pairedWithSwim = swimDates.has(session.date);
      const reason = pairedWithSwim && input.preferGymOnSwimDays !== false
        ? 'Gym strength assigned here because this day already includes a swim/gym visit, while preserving the planner’s existing training-load placement.'
        : 'Gym strength assigned here to reserve a weekly session for heavier loading, machines, cables, and other gym-specific opportunities.';
      return withAssignment(session, input.gymSpace, reason);
    }

    if (homeIds.has(session.id)) {
      return withAssignment(
        session,
        input.homeSpace,
        'Home strength assigned here so gym time can be reserved for movements that materially benefit from heavier loading or gym-specific equipment.',
      );
    }

    return { ...session };
  });
}

function gymAssignmentScore(
  session: WholeAthletePlannedSession,
  swimDates: Set<string>,
  preferGymOnSwimDays: boolean,
): number {
  let score = 0;
  if (session.intensity === 'hard' || session.intensity === 'max') score += 10;
  else if (session.intensity === 'moderate') score += 6;
  else score += 2;

  if (session.keySession) score += 6;
  if (session.progressionTarget === 'strength_intensity') score += 8;
  if (session.progressionTarget === 'strength_volume') score += 3;
  if (preferGymOnSwimDays && swimDates.has(session.date)) score += 7;
  return score;
}

function withAssignment(
  session: WholeAthletePlannedSession,
  space: StrengthTrainingSpaceRef,
  reason: string,
): SpaceAwarePlannedSession {
  return {
    ...session,
    trainingSpaceId: space.id,
    trainingSpaceName: space.name,
    trainingEnvironment: space.environment,
    trainingSpaceReason: reason,
    rationale: [...session.rationale, reason],
  };
}

function clampCount(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maximum, Math.floor(value)));
}
