import type {
  ExerciseResponseAdjustment,
  ExerciseResponseObservation,
  ExerciseToleranceProfile,
  PostWorkoutResponseDecision,
  PostWorkoutResponseLoopInput,
  PostWorkoutResponseRecord,
  PostWorkoutResponseAction,
  StructuralRegion,
} from '@circuit/domain';

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function recentForExercise(
  exerciseId: string,
  responses: PostWorkoutResponseRecord[],
): ExerciseResponseObservation[] {
  return responses
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .flatMap((response) => response.exerciseResponses)
    .filter((observation) => observation.exerciseId === exerciseId)
    .slice(0, 6);
}

function typicalDifficulty(observations: ExerciseResponseObservation[]) {
  const difficulties = observations.map((item) => item.difficulty).filter(Boolean);
  if (difficulties.filter((value) => value === 'too_hard').length >= 2) return 'too_hard' as const;
  if (difficulties.filter((value) => value === 'too_easy').length >= 2) return 'too_easy' as const;
  if (difficulties.length > 0) return 'appropriate' as const;
  return undefined;
}

export function buildExerciseToleranceProfile(
  exerciseId: string,
  responses: PostWorkoutResponseRecord[],
): ExerciseToleranceProfile {
  const observations = recentForExercise(exerciseId, [...responses]);
  const completed = observations.filter((item) => item.completed).length;
  const pain = observations.filter((item) => (item.painRegions?.length ?? 0) > 0).length;
  const difficult = observations.filter((item) => item.difficulty === 'too_hard' || item.techniqueStable === false).length;
  const reasons: string[] = [];
  let status: ExerciseToleranceProfile['status'] = 'monitor';

  if (pain >= 2) {
    status = 'avoid_temporarily';
    reasons.push('Pain was reported after this exercise more than once in the recent response window.');
  } else if (pain === 1 || difficult >= 2) {
    status = 'reduce';
    reasons.push('Recent difficulty, technique loss, or pain supports a lower dose before repeating this exercise.');
  } else if (observations.length >= 3 && completed / observations.length >= 0.8) {
    status = 'well_tolerated';
    reasons.push('Repeated completed exposures were tolerated without a recurring pain signal.');
  } else {
    reasons.push('There is not yet enough clean exposure history to progress this exercise confidently.');
  }

  return {
    exerciseId,
    toleratedExposureCount: completed - pain,
    difficultExposureCount: difficult,
    painExposureCount: pain,
    completionRate: observations.length === 0 ? 0 : completed / observations.length,
    typicalDifficulty: typicalDifficulty(observations),
    lastPainRegions: unique(observations.flatMap((item) => item.painRegions ?? [])),
    status,
    confidence: observations.length >= 4 ? 'high' : observations.length >= 2 ? 'moderate' : 'low',
    reasons,
  };
}

function exerciseAction(profile: ExerciseToleranceProfile): PostWorkoutResponseAction {
  if (profile.status === 'avoid_temporarily') return 'substitute';
  if (profile.status === 'reduce') return 'reduce';
  if (profile.status === 'well_tolerated' && profile.typicalDifficulty === 'too_easy') return 'progress';
  return 'repeat';
}

function adjustment(profile: ExerciseToleranceProfile): ExerciseResponseAdjustment {
  const action = exerciseAction(profile);
  const scale = action === 'reduce' ? 0.75 : action === 'substitute' ? 0.5 : 1;
  return {
    exerciseId: profile.exerciseId,
    action,
    loadScale: scale,
    volumeScale: scale,
    replaceWithFamiliarAlternative: action === 'substitute',
    protectedRegions: profile.lastPainRegions,
    rationale: [...profile.reasons],
  };
}

export function evaluatePostWorkoutResponse(
  input: PostWorkoutResponseLoopInput,
): PostWorkoutResponseDecision {
  const history = [input.response, ...input.recentResponses.filter((item) => item.responseId !== input.response.responseId)];
  const exerciseIds = unique(history.flatMap((response) => response.exerciseResponses.map((item) => item.exerciseId)));
  const profiles = exerciseIds.map((exerciseId) => buildExerciseToleranceProfile(exerciseId, history));
  const adjustments = profiles.map(adjustment);
  const restrictedRegions: StructuralRegion[] = unique([
    ...input.response.painRegions,
    ...profiles.filter((profile) => profile.status === 'avoid_temporarily').flatMap((profile) => profile.lastPainRegions),
  ]);

  const painCarryover = input.response.affectedNextWorkout || input.response.painRegions.length > 0;
  const prolongedSoreness = (input.response.sorenessResolvedHours ?? 0) > 48;
  const excessive = input.response.sessionDifficulty === 'too_hard' || !input.response.completedAsPlanned;
  let sessionAction: PostWorkoutResponseAction = 'repeat';
  let nextSessionScale = 1;

  if (input.response.affectedNextWorkout) {
    sessionAction = 'restrict_region';
    nextSessionScale = 0.6;
  } else if (painCarryover || prolongedSoreness) {
    sessionAction = 'reduce';
    nextSessionScale = 0.75;
  } else if (excessive) {
    sessionAction = 'reduce';
    nextSessionScale = 0.85;
  } else if (input.response.sessionDifficulty === 'too_easy' && profiles.every((profile) => profile.status !== 'reduce' && profile.status !== 'avoid_temporarily')) {
    sessionAction = 'progress';
    nextSessionScale = 1;
  }

  const progressionBlockedByExistingPlan = input.currentProgression?.action === 'hold' || input.currentProgression?.action === 'reduce';
  const progressionBlockedByWeek = input.currentLoadManagement?.progressionAllowed === false;
  const progressionAllowed = sessionAction === 'progress' && !progressionBlockedByExistingPlan && !progressionBlockedByWeek;
  const noveltyAllowed = !painCarryover && !prolongedSoreness && input.currentLoadManagement?.noveltyBudget !== 0;
  const explanations: string[] = [];

  if (sessionAction === 'progress') explanations.push('The session was completed cleanly and felt too easy, so a controlled progression may be considered.');
  if (sessionAction === 'repeat') explanations.push('Repeat the current dose to build a more reliable tolerance history before progressing.');
  if (sessionAction === 'reduce') explanations.push('Reduce the next comparable dose because the response exceeded the intended recovery cost.');
  if (sessionAction === 'restrict_region') explanations.push('Pain affected another workout, so protect the involved region rather than treating this as ordinary soreness.');
  if (!progressionAllowed && sessionAction === 'progress') explanations.push('An existing progression hold or recovery-week decision overrides the otherwise positive response.');
  if (!noveltyAllowed) explanations.push('Keep the next session familiar while the response signal resolves.');

  return {
    sessionAction,
    progressionAllowed,
    noveltyAllowed,
    nextSessionScale,
    restrictedRegions,
    exerciseProfiles: profiles,
    exerciseAdjustments: adjustments,
    explanations,
  };
}
