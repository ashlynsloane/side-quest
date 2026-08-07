export type CoachExecutionStatus =
  | 'followed'
  | 'partial'
  | 'exceeded_prescription'
  | 'different_session'
  | 'not_observed';

export interface CoachObservedExecutionInput {
  prescribedDurationMinutes?: number;
  actualDurationMinutes?: number;
  prescribedIntensity?: 'recovery' | 'easy' | 'moderate' | 'hard' | 'max';
  actualIntensity?: 'recovery' | 'easy' | 'moderate' | 'hard' | 'max';
  matchedPlannedSession: boolean;
  completed: boolean;
  completionFraction?: number;
}

export interface CoachObservedExecution {
  status: CoachExecutionStatus;
  durationRatio?: number;
  completedAsPrescribed?: boolean;
  exceededDurationCeiling: boolean;
  exceededIntensityCeiling: boolean;
  evidence: string[];
}

const INTENSITY_RANK = { recovery: 0, easy: 1, moderate: 2, hard: 3, max: 4 } as const;

export function classifyCoachObservedExecution(input: CoachObservedExecutionInput): CoachObservedExecution {
  if (!input.completed) {
    return {
      status: 'not_observed',
      completedAsPrescribed: false,
      exceededDurationCeiling: false,
      exceededIntensityCeiling: false,
      evidence: ['No completed session was observed for this coach intervention yet.'],
    };
  }
  if (!input.matchedPlannedSession) {
    return {
      status: 'different_session',
      completedAsPrescribed: false,
      exceededDurationCeiling: false,
      exceededIntensityCeiling: false,
      evidence: ['A completed workout was observed, but it was not matched to the session changed by Coach.'],
    };
  }

  const durationRatio = input.prescribedDurationMinutes && input.actualDurationMinutes !== undefined
    ? input.actualDurationMinutes / Math.max(1, input.prescribedDurationMinutes)
    : undefined;
  const exceededDurationCeiling = durationRatio !== undefined && durationRatio > 1.2;
  const exceededIntensityCeiling = Boolean(
    input.prescribedIntensity
    && input.actualIntensity
    && INTENSITY_RANK[input.actualIntensity] > INTENSITY_RANK[input.prescribedIntensity],
  );
  const completionFraction = input.completionFraction ?? 1;
  const partial = completionFraction < 0.8 || (durationRatio !== undefined && durationRatio < 0.75);
  const status: CoachExecutionStatus = exceededDurationCeiling || exceededIntensityCeiling
    ? 'exceeded_prescription'
    : partial
      ? 'partial'
      : 'followed';
  const evidence: string[] = [];
  if (durationRatio !== undefined) evidence.push(`Observed duration was ${Math.round(durationRatio * 100)}% of the prescribed duration.`);
  if (exceededDurationCeiling) evidence.push('Observed duration exceeded the coach-prescribed ceiling by more than 20%.');
  if (exceededIntensityCeiling) evidence.push('Observed intensity exceeded the coach-prescribed intensity ceiling.');
  if (status === 'followed') evidence.push('The completed workout was consistent with the coach-prescribed session change.');
  if (status === 'partial') evidence.push('The matched session was completed only partially; this is adherence evidence, not evidence that the intervention helped or hurt.');
  return {
    status,
    durationRatio,
    completedAsPrescribed: status === 'followed',
    exceededDurationCeiling,
    exceededIntensityCeiling,
    evidence,
  };
}
