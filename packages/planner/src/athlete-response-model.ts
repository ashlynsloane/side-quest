import type {
  AdaptiveDecisionConfidence,
  AthletePersonalizedAdjustment,
  AthleteResponseModelInput,
  AthleteResponseObservation,
  AthleteResponseProfile,
  AthleteResponseSignalQuality,
  AthleteToleranceEstimate,
  PostWorkoutDifficulty,
} from '@circuit/domain';

const DAY_MS = 86_400_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function signalQuality(samples: number, emerging: number, established: number): AthleteResponseSignalQuality {
  if (samples >= established) return 'established';
  if (samples >= emerging) return 'emerging';
  return 'insufficient';
}

function confidenceFor(quality: AthleteResponseSignalQuality): AdaptiveDecisionConfidence {
  if (quality === 'established') return 'high';
  if (quality === 'emerging') return 'moderate';
  return 'low';
}

function excessive(observation: AthleteResponseObservation): boolean {
  return observation.sessionDifficulty === 'too_hard'
    || observation.affectedNextWorkout
    || (observation.sorenessResolvedHours ?? 0) > 48;
}

function estimate(
  key: string,
  observations: AthleteResponseObservation[],
  emerging: number,
  established: number,
): AthleteToleranceEstimate {
  const sampleCount = observations.length;
  const quality = signalQuality(sampleCount, emerging, established);
  const completionRate = sampleCount
    ? observations.filter((item) => item.completedLoad >= item.plannedLoad * 0.9).length / sampleCount
    : 0;
  const excessiveResponseRate = sampleCount ? observations.filter(excessive).length / sampleCount : 0;
  const painResponseRate = sampleCount ? observations.filter((item) => item.painRegions.length > 0).length / sampleCount : 0;
  const recoveryValues = observations
    .map((item) => item.sorenessResolvedHours)
    .filter((value): value is number => typeof value === 'number');
  const typicalRecoveryHours = recoveryValues.length
    ? Math.round(recoveryValues.reduce((sum, value) => sum + value, 0) / recoveryValues.length)
    : undefined;

  let toleranceBand: AthleteToleranceEstimate['toleranceBand'] = 'typical';
  if (quality !== 'insufficient' && completionRate >= 0.9 && excessiveResponseRate <= 0.15 && painResponseRate === 0) toleranceBand = 'high';
  if (excessiveResponseRate >= 0.35 || painResponseRate >= 0.25 || completionRate < 0.75) toleranceBand = 'low';

  const reasons = [
    `${sampleCount} relevant observation${sampleCount === 1 ? '' : 's'}.`,
    `${Math.round(completionRate * 100)}% completion rate.`,
    `${Math.round(excessiveResponseRate * 100)}% excessive-response rate.`,
  ];
  if (painResponseRate > 0) reasons.push(`${Math.round(painResponseRate * 100)}% included a pain response.`);
  if (typicalRecoveryHours !== undefined) reasons.push(`Typical soreness resolution: ${typicalRecoveryHours} hours.`);
  if (quality === 'insufficient') reasons.push('The planner will not personalize progression from this signal yet.');

  return {
    key,
    sampleCount,
    signalQuality: quality,
    toleranceBand,
    typicalRecoveryHours,
    completionRate,
    excessiveResponseRate,
    painResponseRate,
    confidence: confidenceFor(quality),
    reasons,
  };
}

function groupByKeys(
  observations: AthleteResponseObservation[],
  keysFor: (observation: AthleteResponseObservation) => string[],
): Map<string, AthleteResponseObservation[]> {
  const groups = new Map<string, AthleteResponseObservation[]>();
  for (const observation of observations) {
    for (const key of new Set(keysFor(observation))) {
      const current = groups.get(key) ?? [];
      current.push(observation);
      groups.set(key, current);
    }
  }
  return groups;
}

function estimatesFromGroups(
  groups: Map<string, AthleteResponseObservation[]>,
  emerging: number,
  established: number,
): AthleteToleranceEstimate[] {
  return [...groups.entries()]
    .map(([key, observations]) => estimate(key, observations, emerging, established))
    .sort((a, b) => b.sampleCount - a.sampleCount || a.key.localeCompare(b.key));
}

export function buildAthleteResponseProfile(input: AthleteResponseModelInput): AthleteResponseProfile {
  const lookbackDays = input.lookbackDays ?? 56;
  const emerging = input.minimumEmergingSamples ?? 3;
  const established = input.minimumEstablishedSamples ?? 6;
  const cutoff = new Date(input.generatedAt).getTime() - lookbackDays * DAY_MS;
  const observations = input.observations.filter((item) =>
    item.athleteId === input.athleteId && new Date(item.completedAt).getTime() >= cutoff,
  );

  const exerciseTolerance = estimatesFromGroups(groupByKeys(observations, (item) => item.exerciseIds), emerging, established);
  const regionTolerance = estimatesFromGroups(groupByKeys(observations, (item) => item.regions), emerging, established);
  const disciplineTolerance = estimatesFromGroups(groupByKeys(observations, (item) => [item.discipline]), emerging, established);
  const recoveryValues = observations
    .map((item) => item.sorenessResolvedHours)
    .filter((value): value is number => typeof value === 'number');
  const recoveryLatencyHours = recoveryValues.length
    ? Math.round(recoveryValues.reduce((sum, value) => sum + value, 0) / recoveryValues.length)
    : undefined;
  const globalSignalQuality = signalQuality(observations.length, emerging, established);

  return {
    athleteId: input.athleteId,
    generatedAt: input.generatedAt,
    observationCount: observations.length,
    globalSignalQuality,
    exerciseTolerance,
    regionTolerance,
    disciplineTolerance,
    recoveryLatencyHours,
    conservativeCeiling: globalSignalQuality === 'established' ? 1.1 : globalSignalQuality === 'emerging' ? 1.05 : 1,
    explanations: [
      `Profile uses ${observations.length} observations from the last ${lookbackDays} days.`,
      globalSignalQuality === 'insufficient'
        ? 'There is not enough evidence to increase training beyond the generic plan.'
        : 'Personalization is bounded and cannot override pain, life context, recovery, or structural safeguards.',
      'The model does not recommend calorie restriction, weight loss, or training through mental-health or life constraints.',
    ],
  };
}

function worstTolerance(estimates: AthleteToleranceEstimate[]): AthleteToleranceEstimate | undefined {
  return [...estimates].sort((a, b) => {
    const rank = { low: 0, typical: 1, high: 2 } as const;
    return rank[a.toleranceBand] - rank[b.toleranceBand] || b.sampleCount - a.sampleCount;
  })[0];
}

export function personalizeAdaptiveDose({
  profile,
  exerciseIds = [],
  regions = [],
  discipline,
  requestedDirection,
}: {
  profile: AthleteResponseProfile;
  exerciseIds?: string[];
  regions?: string[];
  discipline?: string;
  requestedDirection: 'hold' | 'progress';
}): AthletePersonalizedAdjustment {
  const relevant = [
    ...profile.exerciseTolerance.filter((item) => exerciseIds.includes(item.key)),
    ...profile.regionTolerance.filter((item) => regions.includes(item.key)),
    ...profile.disciplineTolerance.filter((item) => item.key === discipline),
  ];
  const limiting = worstTolerance(relevant);

  if (!limiting || limiting.signalQuality === 'insufficient') {
    return { direction: 'hold', loadScale: 1, volumeScale: 1, noveltyScale: 1, confidence: 'low', reasons: ['Athlete-specific evidence is insufficient; use the generic safe plan.'] };
  }
  if (limiting.toleranceBand === 'low') {
    return {
      direction: 'reduce',
      loadScale: 0.9,
      volumeScale: limiting.painResponseRate > 0 ? 0.8 : 0.9,
      noveltyScale: 0,
      confidence: limiting.confidence,
      reasons: [`${limiting.key} has shown lower tolerance for this athlete.`, ...limiting.reasons],
    };
  }
  if (requestedDirection === 'progress' && limiting.toleranceBand === 'high' && limiting.signalQuality === 'established') {
    const scale = clamp(profile.conservativeCeiling, 1, 1.1);
    return {
      direction: 'progress',
      loadScale: scale,
      volumeScale: 1,
      noveltyScale: 1,
      confidence: 'high',
      reasons: [`${limiting.key} is repeatedly well tolerated.`, 'Only one dose variable should be progressed at a time.'],
    };
  }
  return {
    direction: 'hold',
    loadScale: 1,
    volumeScale: 1,
    noveltyScale: 1,
    confidence: limiting.confidence,
    reasons: [`${limiting.key} is within this athlete's current typical tolerance.`, 'Repeat before increasing demand.'],
  };
}
