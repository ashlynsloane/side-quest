import type { WholeAthletePlannedSession } from './whole-athlete-week';

interface StrengthSpaceAllocationPrescription {
  gymValue?: 'low' | 'moderate' | 'high';
  lowerBodyDose?: 'light' | 'moderate' | 'high';
}

export type StrengthTrainingEnvironment = 'home' | 'gym' | 'custom';

export interface StrengthTrainingSpaceRef {
  id: string;
  name: string;
  environment: StrengthTrainingEnvironment;
}

type AllocatableStrengthSession = WholeAthletePlannedSession & {
  strengthPrescription?: StrengthSpaceAllocationPrescription;
};

export interface StrengthTrainingSpaceAllocationInput {
  sessions: AllocatableStrengthSession[];
  homeSpace?: StrengthTrainingSpaceRef;
  gymSpace?: StrengthTrainingSpaceRef;
  customSpaces?: StrengthTrainingSpaceRef[];
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

export type SpaceAwarePlannedSession = AllocatableStrengthSession & Partial<TrainingSpaceAssignment>;

/**
 * Assigns available training spaces across a finished weekly plan.
 *
 * Location never creates, removes, or moves a session. If the athlete has only
 * one usable space, every strength session is assigned there. A mixed home/gym
 * split is used only when both spaces actually exist.
 */
export function allocateStrengthTrainingSpaces(
  input: StrengthTrainingSpaceAllocationInput,
): SpaceAwarePlannedSession[] {
  const strengthSessions = input.sessions.filter((session) => session.discipline === 'strength');
  if (strengthSessions.length === 0) return input.sessions.map((session) => ({ ...session }));

  const customSpaces = input.customSpaces ?? [];
  const availableSpaces = [input.homeSpace, input.gymSpace, ...customSpaces].filter(
    (space): space is StrengthTrainingSpaceRef => Boolean(space),
  );

  if (availableSpaces.length === 0) return input.sessions.map((session) => ({ ...session }));

  if (availableSpaces.length === 1) {
    const onlySpace = availableSpaces[0];
    return input.sessions.map((session) => session.discipline === 'strength'
      ? withAssignment(
          session,
          onlySpace,
          `All strength is assigned to ${onlySpace.name} because it is the athlete’s available training space.`,
        )
      : { ...session });
  }

  if (!input.homeSpace && !input.gymSpace) {
    return input.sessions.map((session) => ({ ...session }));
  }

  if (!input.gymSpace && input.homeSpace) {
    return input.sessions.map((session) => session.discipline === 'strength'
      ? withAssignment(session, input.homeSpace!, 'All strength is assigned to Home because no gym training space is configured.')
      : { ...session });
  }

  if (!input.homeSpace && input.gymSpace) {
    return input.sessions.map((session) => session.discipline === 'strength'
      ? withAssignment(session, input.gymSpace!, 'All strength is assigned to Gym because no home training space is configured.')
      : { ...session });
  }

  const homeSpace = input.homeSpace!;
  const gymSpace = input.gymSpace!;
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
      const highGymValue = session.strengthPrescription?.gymValue === 'high';
      const reason = highGymValue
        ? 'Gym strength assigned here because this session carries the week’s highest-value loading stimulus and benefits most from heavier or gym-specific equipment.'
        : pairedWithSwim && input.preferGymOnSwimDays !== false
          ? 'Gym strength assigned here because this day already includes a swim/gym visit, while preserving the planner’s existing training-load placement.'
          : 'Gym strength assigned here to reserve a weekly session for heavier loading, machines, cables, and other gym-specific opportunities.';
      return withAssignment(session, gymSpace, reason);
    }

    if (homeIds.has(session.id)) {
      return withAssignment(
        session,
        homeSpace,
        'Home strength assigned here so gym time can be reserved for movements that materially benefit from heavier loading or gym-specific equipment.',
      );
    }

    return { ...session };
  });
}

function gymAssignmentScore(
  session: AllocatableStrengthSession,
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
  if (session.strengthPrescription?.gymValue === 'high') score += 14;
  else if (session.strengthPrescription?.gymValue === 'moderate') score += 5;
  if (session.strengthPrescription?.lowerBodyDose === 'light') score -= 4;
  if (preferGymOnSwimDays && swimDates.has(session.date)) score += 7;
  return score;
}

function withAssignment(
  session: AllocatableStrengthSession,
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
