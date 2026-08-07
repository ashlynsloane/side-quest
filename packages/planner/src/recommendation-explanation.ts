import type {
  AdaptiveDecisionConfidence,
  BodyRegion,
  PerformanceGoal,
  PlannedStrengthSession,
  RecommendationConfidence,
  RecommendationReason,
  TrainingAdaptation,
  WorkoutRecommendationExplanation,
} from '@circuit/domain';

export interface RecommendationExplanationContext {
  goal?: PerformanceGoal;
  previousSessionDate?: string;
  nextKeyEnduranceDate?: string;
  hasTrainingHistory?: boolean;
  hasConnectedTrainingData?: boolean;
  hasReadinessData?: boolean;
  now?: string;
}

const LOWER_BODY_REGIONS = new Set<BodyRegion>([
  'glutes', 'hamstrings', 'quadriceps', 'hip_abductors', 'hip_adductors', 'hip_flexors',
  'gastrocnemius', 'soleus', 'tibialis_anterior', 'feet_ankles', 'lower_back',
]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function asLevel(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.round(clamp(value, 1, 5)) as 1 | 2 | 3 | 4 | 5;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function daysBetween(left?: string, right?: string): number | undefined {
  if (!left || !right) return undefined;
  const difference = Date.parse(right) - Date.parse(left);
  if (!Number.isFinite(difference)) return undefined;
  return Math.round(difference / 86_400_000);
}

function confidenceLabel(score: number): AdaptiveDecisionConfidence {
  if (score >= 0.76) return 'high';
  if (score >= 0.52) return 'moderate';
  return 'low';
}

function adaptationForPurpose(session: PlannedStrengthSession): TrainingAdaptation[] {
  const mapping: Partial<Record<PlannedStrengthSession['purpose'], TrainingAdaptation[]>> = {
    single_leg_durability: ['run_durability', 'single_leg_strength', 'hip_stability'],
    swim_support: ['swim_support', 'trunk_control', 'upper_body_strength'],
    calf_ankle_capacity: ['calf_ankle_capacity', 'run_durability'],
    trail_durability: ['run_durability', 'single_leg_strength', 'posterior_chain_capacity'],
    power: ['power', 'general_strength'],
    stability: ['hip_stability', 'trunk_control', 'movement_quality'],
    maintenance: ['general_strength', 'movement_quality'],
    full_body: ['general_strength', 'trunk_control'],
    posterior_durability: ['posterior_chain_capacity', 'hip_stability'],
    max_strength: ['general_strength', 'posterior_chain_capacity'],
  };
  return mapping[session.purpose] ?? ['general_strength'];
}

function fatigueFor(session: PlannedStrengthSession): WorkoutRecommendationExplanation['fatigue'] {
  const workout = session.workout;
  const minutes = workout.estimatedElapsedSeconds / 60;
  const lowerBodyTargets = workout.targetRegions.filter((region) => LOWER_BODY_REGIONS.has(region)).length;
  const cardiovascularDemand = workout.stations.flatMap((station) => station.exercises)
    .reduce((maximum, exercise) => Math.max(maximum, exercise.exerciseSnapshot.cardiovascularDemand), 0);
  const complexity = workout.stations.flatMap((station) => station.exercises)
    .reduce((maximum, exercise) => Math.max(maximum, exercise.exerciseSnapshot.technicalComplexity), 0);
  const loadBase = session.intendedLoad === 'high' ? 4 : session.intendedLoad === 'moderate' ? 3 : 2;
  const muscular = asLevel(loadBase + (lowerBodyTargets >= 4 ? 1 : 0) + (minutes >= 45 ? 0.5 : 0));
  const cardiovascular = asLevel(1 + cardiovascularDemand * 0.75 + (minutes >= 40 ? 0.5 : 0));
  const neural = asLevel(1 + complexity * 0.65 + (session.purpose === 'power' ? 1 : 0));
  const recoveryHours = Math.round(clamp(12 + muscular * 5 + neural * 2, 18, 48));
  return { muscular, cardiovascular, neural, recoveryHours, uncertainty: 'moderate' };
}

export function explainPlannedStrengthSession(
  session: PlannedStrengthSession,
  context: RecommendationExplanationContext = {},
): WorkoutRecommendationExplanation {
  const goal = context.goal;
  const capacity = goal?.capacityProfile;
  const reasons: RecommendationReason[] = [];

  reasons.push({
    code: 'session_purpose',
    summary: session.rationale || `${session.title} supports the purpose of this training day.`,
    evidenceSource: 'workout',
  });

  if (goal) {
    reasons.push({
      code: 'goal_alignment',
      summary: `${session.title} supports ${goal.name}.`,
      detail: `The session was selected for the current ${goal.name} training context.`,
      evidenceSource: 'goal',
    });
  }
  if (session.placementNote) {
    reasons.push({ code: 'schedule_fit', summary: session.placementNote, evidenceSource: 'schedule' });
  }
  if (capacity?.runStatus === 'return_to_run' || capacity?.runStatus === 'not_running') {
    reasons.push({
      code: 'return_to_run',
      summary: 'Running is being rebuilt conservatively, so strength supports durability without adding impact.',
      evidenceSource: 'athlete_profile',
    });
  }
  if (capacity?.boneStressInjuryHistory === 'recent_or_current' || capacity?.boneStressInjuryHistory === 'remote') {
    reasons.push({
      code: 'bone_stress_caution',
      summary: 'Bone-stress history favors gradual loading and avoids stacking multiple aggressive progressions.',
      evidenceSource: 'athlete_profile',
    });
  }
  if (capacity) {
    const strongest = ([['swim', capacity.swimProficiency], ['bike', capacity.bikeProficiency], ['run', capacity.runProficiency]] as const)
      .filter(([, value]) => value === 'strong')
      .map(([discipline]) => discipline);
    if (strongest.length > 0) {
      reasons.push({
        code: 'sport_background',
        summary: `Your stronger ${strongest.join(' and ')} background is treated as context rather than a reason to add unnecessary volume.`,
        evidenceSource: 'athlete_profile',
      });
    }
    reasons.push({
      code: 'strength_experience',
      summary: `Exercise complexity and progression reflect ${capacity.strengthExperience} strength experience.`,
      evidenceSource: 'athlete_profile',
    });
  }

  const previousGap = daysBetween(context.previousSessionDate, session.date);
  if (previousGap !== undefined && previousGap >= 2) {
    reasons.push({
      code: 'recovery_spacing',
      summary: `${previousGap} days of spacing were preserved from the previous strength session.`,
      evidenceSource: 'schedule',
    });
  }

  const nextEnduranceGap = daysBetween(session.date, context.nextKeyEnduranceDate);
  if (nextEnduranceGap !== undefined && nextEnduranceGap >= 0 && nextEnduranceGap <= 2) {
    reasons.push({
      code: 'schedule_fit',
      summary: nextEnduranceGap === 0
        ? 'The dose is controlled because endurance training also falls on this day.'
        : nextEnduranceGap === 1
          ? 'The dose preserves quality for the next day’s endurance session.'
          : 'The session leaves a two-day buffer before the next endurance demand.',
      evidenceSource: 'schedule',
    });
  }

  const evidenceInputs = ['goal', 'training phase', 'session purpose', 'workout structure'];
  if (capacity) evidenceInputs.push('athlete capacity profile');
  if (session.placementNote || context.previousSessionDate || context.nextKeyEnduranceDate) evidenceInputs.push('schedule context');
  if (context.hasTrainingHistory) evidenceInputs.push('completed training history');
  if (context.hasConnectedTrainingData) evidenceInputs.push('connected training data');
  if (context.hasReadinessData) evidenceInputs.push('current readiness data');

  const missingInputs: string[] = [];
  if (!context.hasTrainingHistory) missingInputs.push('completed workout response history');
  if (!context.hasConnectedTrainingData) missingInputs.push('connected endurance history');
  if (!context.hasReadinessData) missingInputs.push('current readiness or recovery data');

  let confidenceScore = 0.48 + Math.min(0.24, reasons.length * 0.035);
  if (capacity) confidenceScore += 0.08;
  if (context.hasTrainingHistory) confidenceScore += 0.08;
  if (context.hasConnectedTrainingData) confidenceScore += 0.07;
  if (context.hasReadinessData) confidenceScore += 0.05;
  if (missingInputs.length >= 2) confidenceScore = Math.min(confidenceScore, 0.74);
  confidenceScore = Math.round(clamp(confidenceScore, 0.25, 0.95) * 100) / 100;

  const confidence: RecommendationConfidence = {
    score: confidenceScore,
    label: confidenceLabel(confidenceScore),
    evidenceInputs: unique(evidenceInputs),
    missingInputs,
    rationale: [
      `${reasons.length} athlete- or plan-specific reasons support this recommendation.`,
      missingInputs.length > 0
        ? 'Confidence is capped until more completed-workout or connected-training evidence is available.'
        : 'Current profile, history, and readiness inputs are available.',
    ],
  };

  const cautious = capacity?.runStatus === 'return_to_run'
    || capacity?.runStatus === 'not_running'
    || capacity?.boneStressInjuryHistory === 'recent_or_current';

  return {
    sessionId: session.id,
    generatedAt: context.now ?? new Date().toISOString(),
    conciseWhy: unique(reasons.map((reason) => reason.summary)).slice(0, 4),
    detailedReasons: reasons,
    expectedAdaptations: unique(adaptationForPurpose(session)),
    fatigue: fatigueFor(session),
    confidence,
    whyNotHarder: cautious
      ? 'A harder session would increase lower-body loading faster than the current profile supports. Progression should follow successful, well-tolerated weeks rather than compensate for missed work.'
      : session.intendedLoad === 'high'
        ? undefined
        : 'The current dose preserves room for endurance training and future progression instead of maximizing fatigue today.',
    safeguards: [
      'This explanation is training guidance, not a diagnosis or prediction of injury.',
      'Fatigue and recovery estimates are approximate and should be overridden by pain, illness, or clinician guidance.',
      'Missing data lowers confidence; it is never treated as evidence that the athlete is at risk.',
      'The explanation does not automatically change the plan.',
    ],
  };
}
