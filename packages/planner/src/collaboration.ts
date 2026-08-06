import type {
  AvoidanceTag,
  BodyRegion,
  CoachProposalDifference,
  CoachSessionProposalSnapshot,
  EquipmentId,
  FriendWorkoutSubstitution,
  GeneratedWorkout,
  PlannedStrengthSession,
  SharedWorkoutContext,
  TrainingBlockPlan,
  WorkoutExercisePrescription,
  WorkoutStation,
} from '@circuit/domain';

export interface SharedWorkoutCandidateInput {
  userId: string;
  displayName: string;
  sourceSessionId?: string;
  workout: GeneratedWorkout;
}

export interface CoachSessionRevision {
  sessionId: string;
  date: string;
  title: string;
  intendedLoad: PlannedStrengthSession['intendedLoad'];
  workout: GeneratedWorkout;
  coachUserId: string;
  coachDisplayName: string;
  editedAt: string;
  revisionId: string;
  note?: string;
}

export type CoachSessionApplyResult =
  | { ok: true; session: PlannedStrengthSession }
  | { ok: false; reasons: string[] };

function targetLabel(item: WorkoutExercisePrescription): string {
  if (item.unit === 'seconds') return `${item.target} sec`;
  if (item.unit === 'per_side') return `${item.target} / side`;
  return `${item.target} reps`;
}

function proposalExercises(snapshot: CoachSessionProposalSnapshot): Map<string, WorkoutExercisePrescription> {
  return new Map(snapshot.workout.stations
    .flatMap((station) => station.exercises)
    .map((item) => [item.exerciseId, item] as const));
}

export function describeCoachProposalDifference(
  baseline: CoachSessionProposalSnapshot,
  proposed: CoachSessionProposalSnapshot,
): CoachProposalDifference {
  const before = proposalExercises(baseline);
  const after = proposalExercises(proposed);
  const addedExercises = [...after]
    .filter(([exerciseId]) => !before.has(exerciseId))
    .map(([, item]) => item.exerciseSnapshot.name);
  const removedExercises = [...before]
    .filter(([exerciseId]) => !after.has(exerciseId))
    .map(([, item]) => item.exerciseSnapshot.name);
  const targetChanges = [...after].flatMap(([exerciseId, item]) => {
    const previous = before.get(exerciseId);
    if (!previous || previous.target === item.target && previous.unit === item.unit) return [];
    return [{ exerciseName: item.exerciseSnapshot.name, before: targetLabel(previous), after: targetLabel(item) }];
  });
  return {
    dateChanged: baseline.sessionDate !== proposed.sessionDate,
    titleChanged: baseline.title !== proposed.title,
    intendedLoadChanged: baseline.intendedLoad !== proposed.intendedLoad,
    addedExercises,
    removedExercises,
    targetChanges,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function publicWorkoutForCollaboration(workout: GeneratedWorkout): GeneratedWorkout {
  return {
    ...workout,
    request: {
      ...workout.request,
      excludedRegions: [],
      excludedMovementTags: [],
      recoveryAware: false,
    },
    stations: workout.stations.map((station) => ({
      ...station,
      exercises: station.exercises.map((item) => ({
        ...item,
        userLoadValue: undefined,
        userLoadUnit: undefined,
        adaptationNote: undefined,
      })),
    })),
    recentLoadAdjustments: [],
    swapHistory: undefined,
  };
}

export function coachWorkoutConflicts(
  privateWorkout: GeneratedWorkout,
  candidateWorkout: GeneratedWorkout,
): string[] {
  const excludedRegions = new Set(privateWorkout.request.excludedRegions);
  const excludedTags = new Set<AvoidanceTag>(privateWorkout.request.excludedMovementTags);
  const allowedEquipment = new Set<EquipmentId>(privateWorkout.request.availableEquipment);
  const reasons: string[] = [];

  for (const item of candidateWorkout.stations.flatMap((station) => station.exercises)) {
    const exercise = item.exerciseSnapshot;
    const regionConflict = exercise.bodyRegions.find((load) => excludedRegions.has(load.region));
    const jointConflict = exercise.jointLoads.find((load) => excludedRegions.has(load.region));
    const tagConflict = exercise.avoidanceTags.find((tag) => excludedTags.has(tag));
    if (regionConflict) reasons.push(`${exercise.name} loads an excluded region (${regionConflict.region.replaceAll('_', ' ')}).`);
    if (jointConflict) reasons.push(`${exercise.name} loads an excluded joint (${jointConflict.region.replaceAll('_', ' ')}).`);
    if (tagConflict) reasons.push(`${exercise.name} conflicts with an active movement restriction (${tagConflict.replaceAll('_', ' ')}).`);
    if (exercise.impactLevel > privateWorkout.request.maximumImpact) reasons.push(`${exercise.name} exceeds the current impact limit.`);
  }

  const missingEquipment = candidateWorkout.requiredEquipment.filter(
    (equipment) => equipment !== 'bodyweight' && !allowedEquipment.has(equipment),
  );
  if (missingEquipment.length) {
    reasons.push(`Equipment is not available in the athlete's active setup: ${missingEquipment.join(', ')}.`);
  }

  return unique(reasons);
}

export function applyCoachSessionRevision(
  localSession: PlannedStrengthSession,
  revision: CoachSessionRevision,
): CoachSessionApplyResult {
  if (localSession.completionStatus === 'completed' || localSession.completionStatus === 'skipped') {
    return { ok: false, reasons: ['Completed or skipped history cannot be changed by a coach.'] };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (localSession.date < today || revision.date < today) {
    return { ok: false, reasons: ['Only future strength sessions can be changed by a coach.'] };
  }
  const reasons = coachWorkoutConflicts(localSession.workout, revision.workout);
  if (reasons.length) return { ok: false, reasons };

  const localNotes = new Map(
    localSession.workout.stations
      .flatMap((station) => station.exercises)
      .map((item) => [item.exerciseId, item.adaptationNote] as const),
  );
  const workout: GeneratedWorkout = {
    ...publicWorkoutForCollaboration(revision.workout),
    request: {
      ...revision.workout.request,
      excludedRegions: localSession.workout.request.excludedRegions,
      excludedMovementTags: localSession.workout.request.excludedMovementTags,
      recoveryAware: localSession.workout.request.recoveryAware,
      maximumImpact: localSession.workout.request.maximumImpact,
    },
    recentLoadAdjustments: localSession.workout.recentLoadAdjustments,
    stations: revision.workout.stations.map((station) => ({
      ...station,
      exercises: station.exercises.map((item) => ({
        ...item,
        userLoadValue: undefined,
        userLoadUnit: undefined,
        adaptationNote: localNotes.get(item.exerciseId),
      })),
    })),
  };

  return {
    ok: true,
    session: {
      ...localSession,
      date: revision.date,
      title: revision.title.trim() || localSession.title,
      intendedLoad: revision.intendedLoad,
      workout,
      completionStatus: 'modified',
      coachReview: {
        coachUserId: revision.coachUserId,
        coachDisplayName: revision.coachDisplayName,
        editedAt: revision.editedAt,
        revisionId: revision.revisionId,
        note: revision.note?.trim() || undefined,
      },
    },
  };
}

function candidateStation(
  station: WorkoutStation,
  candidateIndex: number,
  usedExercises: Set<string>,
): WorkoutStation | null {
  const exercises = station.exercises.filter((item) => {
    if (usedExercises.has(item.exerciseId)) return false;
    usedExercises.add(item.exerciseId);
    return true;
  });
  if (!exercises.length) return null;
  return {
    ...station,
    id: `shared_${candidateIndex}_${station.id}`,
    order: 0,
    exercises: exercises.map((item, exerciseIndex) => ({
      ...item,
      prescriptionId: `shared_${candidateIndex}_${item.prescriptionId}`,
      order: exerciseIndex + 1,
    })),
  };
}

function interleave<T>(groups: T[][]): Array<{ value: T; groupIndex: number }> {
  const output: Array<{ value: T; groupIndex: number }> = [];
  const max = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < max; index += 1) {
    groups.forEach((group, groupIndex) => {
      const value = group[index];
      if (value !== undefined) output.push({ value, groupIndex });
    });
  }
  return output;
}

export function combineSharedWorkouts(
  candidates: SharedWorkoutCandidateInput[],
  selectedByUserId?: string,
): GeneratedWorkout {
  if (candidates.length < 2) throw new Error('At least two workouts are required to combine sessions.');
  const sanitized = candidates.map((candidate) => ({
    ...candidate,
    workout: publicWorkoutForCollaboration(candidate.workout),
  }));
  const usedExercises = new Set<string>();
  const stations: WorkoutStation[] = [];
  let totalWorkSeconds = 0;

  for (const entry of interleave(sanitized.map((candidate) => candidate.workout.stations))) {
    if (stations.length >= 6) break;
    const next = candidateStation(entry.value, entry.groupIndex, usedExercises);
    if (!next) continue;
    const projected = totalWorkSeconds + next.durationSeconds;
    if (projected > 48 * 60 && stations.length >= sanitized.length * 2) continue;
    stations.push({ ...next, order: stations.length + 1 });
    totalWorkSeconds += next.durationSeconds;
  }

  if (stations.length < 2) throw new Error('The selected workouts do not contain enough distinct stations to combine safely.');

  const base = sanitized[0]!.workout;
  const sourceDisplayNames = sanitized.map((candidate) => candidate.displayName);
  const context: SharedWorkoutContext = {
    roomCode: '',
    selectionMode: 'combined',
    sourceUserIds: sanitized.map((candidate) => candidate.userId),
    sourceDisplayNames,
    sourceSessionIds: sanitized.flatMap((candidate) => candidate.sourceSessionId ? [candidate.sourceSessionId] : []),
    selectedByUserId,
  };
  const requiredEquipment = unique(stations.flatMap((station) =>
    station.exercises.flatMap((item) =>
      item.exerciseSnapshot.equipmentOptions
        .find((option) => option.id === item.equipmentOptionId)?.items
        .map((equipment) => equipment.equipmentId) ?? [],
    ),
  ));
  const targetRegions = unique(stations.flatMap((station) =>
    station.exercises.flatMap((item) => item.exerciseSnapshot.bodyRegions.map((load) => load.region)),
  ));
  const restSeconds = Math.max(...sanitized.map((candidate) => candidate.workout.request.restSeconds), 60);
  const totalRestSeconds = Math.max(0, stations.length - 1) * restSeconds;

  return {
    ...base,
    id: `shared_combined_${Date.now()}`,
    name: `Combined: ${sourceDisplayNames.join(' + ')}`,
    createdAt: new Date().toISOString(),
    randomSeed: `shared-${sanitized.map((candidate) => candidate.workout.id).join('-')}`,
    request: {
      ...base.request,
      workMinutes: Math.round(totalWorkSeconds / 60),
      restSeconds,
      focusTargets: unique(
        sanitized.flatMap((candidate) => candidate.workout.request.focusTargets)
          .map((target) => JSON.stringify(target)),
      ).map((value) => JSON.parse(value)).slice(0, 4),
      excludedRegions: [],
      excludedMovementTags: [],
      recoveryAware: false,
      availableEquipment: requiredEquipment,
    },
    stations,
    totalWorkSeconds,
    totalRestSeconds,
    estimatedElapsedSeconds: totalWorkSeconds + totalRestSeconds,
    requiredEquipment,
    targetRegions,
    recentLoadAdjustments: [],
    source: 'manual',
    sharedContext: context,
  };
}

export function withSharedWorkoutContext(
  workout: GeneratedWorkout,
  context: SharedWorkoutContext,
): GeneratedWorkout {
  return {
    ...publicWorkoutForCollaboration(workout),
    id: `${workout.id}_shared_${Date.now()}`,
    createdAt: new Date().toISOString(),
    sharedContext: context,
  };
}

export function nextSubstitutableSession(
  block: TrainingBlockPlan | null,
  today = new Date().toISOString().slice(0, 10),
): PlannedStrengthSession | null {
  if (!block) return null;
  return block.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.date >= today && !['completed', 'skipped'].includes(session.completionStatus))
    .sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order)[0] ?? null;
}

export function markFriendWorkoutSubstitution(
  block: TrainingBlockPlan,
  sessionId: string,
  substitution: FriendWorkoutSubstitution,
): TrainingBlockPlan {
  return {
    ...block,
    weeks: block.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => session.id === sessionId
        ? { ...session, completionStatus: 'completed' as const, friendSubstitution: substitution }
        : session),
    })),
  };
}
