import type {
  StrengthLoadBaseline,
  StrengthLoadDecision,
  StrengthSessionResponse,
  StrengthTrainingHistoryEntry,
} from '@circuit/domain';

const DAY_MS = 86_400_000;

function asTime(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function sessionsInWindow(history: StrengthTrainingHistoryEntry[], end: number, days: number): number {
  const start = end - days * DAY_MS;
  return history.filter((entry) => {
    const time = asTime(entry.completedAt);
    return time >= start && time < end;
  }).length;
}

function inferredBaseline(history: StrengthTrainingHistoryEntry[], end: number): number {
  const weeks: number[] = [];
  // Exclude the most recent week so a sudden increase does not redefine capacity.
  for (let index = 1; index <= 5; index += 1) {
    const windowEnd = end - index * 7 * DAY_MS;
    weeks.push(sessionsInWindow(history, windowEnd, 7));
  }
  weeks.sort((left, right) => left - right);
  return weeks.length ? weeks[Math.floor(weeks.length / 2)] : 0;
}

function baselineFromConsistency(value: StrengthLoadBaseline['consistencyLastSixWeeks']): number {
  switch (value) {
    case 'none': return 0;
    case 'occasional': return 0.5;
    case 'one_per_week': return 1;
    case 'two_per_week': return 2;
    case 'three_plus_per_week': return 3;
  }
}

function responseConcern(responses: StrengthSessionResponse[], end: number) {
  const recent = responses.filter((response) => {
    const time = asTime(response.recordedAt || response.completedAt);
    return time >= end - 14 * DAY_MS && time < end + DAY_MS;
  });
  const severe = recent.some((response) =>
    response.classification === 'pain_or_discomfort'
    && ((response.severity ?? 0) >= 4 || response.affectedDailyActivity || response.affectedNextWorkout),
  );
  const accumulation = recent.filter((response) =>
    response.classification === 'unusually_sore'
    || response.classification === 'pain_or_discomfort'
    || response.classification === 'affected_other_training'
    || response.sorenessDistribution === 'widespread',
  ).length;
  const widespread = recent.some((response) => response.sorenessDistribution === 'widespread');
  return { severe, accumulation, widespread };
}

function clampSessions(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
}

export function evaluateStrengthLoad({
  requestedSessions,
  weekStartDate,
  baseline,
  history = [],
  responses = [],
  rampWeekIndex = 0,
}: {
  requestedSessions: number;
  weekStartDate: string;
  baseline?: StrengthLoadBaseline;
  history?: StrengthTrainingHistoryEntry[];
  responses?: StrengthSessionResponse[];
  rampWeekIndex?: number;
}): StrengthLoadDecision {
  const end = asTime(`${weekStartDate}T00:00:00.000Z`) || Date.now();
  const hasLoadEvidence = Boolean(baseline || history.length || responses.length);
  if (!hasLoadEvidence) {
    return {
      action: 'progress',
      baselineSessionsPerWeek: requestedSessions,
      recentSessionsPerWeek: requestedSessions,
      requestedSessions,
      allowedSessions: clampSessions(requestedSessions),
      durationMultiplier: 1,
      allowFrequencyProgression: true,
      allowDurationProgression: true,
      allowRepProgression: true,
      reduceNovelty: false,
      reasons: [],
      evaluatedAt: new Date().toISOString(),
    };
  }
  const explicitBaseline = baseline
    ? Math.max(baselineFromConsistency(baseline.consistencyLastSixWeeks), baseline.establishedSessionsPerWeek)
    : 0;
  const historicalBaseline = inferredBaseline(history, end);
  const established = Math.max(0, Math.min(5, explicitBaseline || historicalBaseline));
  const recent7 = sessionsInWindow(history, end, 7);
  const recent14Weekly = sessionsInWindow(history, end, 14) / 2;
  const recentWeekly = Math.max(recent7, recent14Weekly);
  const concern = responseConcern(responses, end);
  const reasons: string[] = [];

  // Frequency tolerance is rebuilt before the requested target is granted.
  const startingCap = established < 1 ? 2 : established < 2 ? 2 : established < 3 ? 3 : established < 4 ? 4 : 5;
  const earnedRamp = Math.floor(Math.max(0, rampWeekIndex) / 2);
  let allowed = Math.min(requestedSessions, startingCap + earnedRamp);
  let action: StrengthLoadDecision['action'] = allowed < requestedSessions ? 'hold' : 'progress';
  let durationMultiplier: StrengthLoadDecision['durationMultiplier'] = 1;
  let reduceNovelty = allowed < requestedSessions;

  if (allowed < requestedSessions) {
    reasons.push(`Strength frequency is capped at ${allowed} sessions while tolerance is established from a ${established.toFixed(1)}-session weekly baseline.`);
  }

  const spikeThreshold = Math.max(established + 1, established * 1.5, 2);
  if (recentWeekly > spikeThreshold) {
    allowed = Math.min(allowed, Math.max(1, Math.ceil(established + 1)));
    action = 'consolidate';
    durationMultiplier = 0.8;
    reduceNovelty = true;
    reasons.push('Recent strength frequency increased faster than the established baseline, so this week consolidates instead of progressing.');
  }

  if (concern.accumulation >= 2 || concern.widespread) {
    allowed = Math.min(allowed, Math.max(1, Math.floor(Math.max(established, 2))));
    action = 'consolidate';
    durationMultiplier = concern.widespread ? 0.67 : 0.8;
    reduceNovelty = true;
    reasons.push('Repeated or widespread soreness indicates that the recent dose was not fully tolerated.');
  }

  if (concern.severe) {
    allowed = 1;
    action = 'restrict';
    durationMultiplier = 0.5;
    reduceNovelty = true;
    reasons.push('Pain or discomfort affected daily activity or subsequent training, so only a minimum-strength exposure is retained.');
  }

  // Every fourth ramp week is consolidation unless a stricter rule already applies.
  if (rampWeekIndex > 0 && (rampWeekIndex + 1) % 4 === 0 && action === 'progress') {
    action = 'consolidate';
    durationMultiplier = 0.8;
    reduceNovelty = true;
    reasons.push('This is a planned consolidation week: frequency is maintained and progression is paused.');
  }

  if (reasons.length === 0) {
    reasons.push('Recent strength exposure and reported response support the planned dose.');
  }

  const frequencyProgressedThisWeek = allowed > startingCap;
  return {
    action,
    baselineSessionsPerWeek: established,
    recentSessionsPerWeek: Number(recentWeekly.toFixed(1)),
    requestedSessions,
    allowedSessions: clampSessions(allowed),
    durationMultiplier,
    allowFrequencyProgression: action === 'progress',
    allowDurationProgression: action === 'progress' && allowed >= requestedSessions && !frequencyProgressedThisWeek,
    allowRepProgression: action === 'progress' && allowed >= requestedSessions && !frequencyProgressedThisWeek,
    reduceNovelty,
    reasons,
    evaluatedAt: new Date().toISOString(),
  };
}

export function scaleWorkMinutes(
  minutes: 24 | 32 | 40 | 48,
  multiplier: StrengthLoadDecision['durationMultiplier'],
): 24 | 32 | 40 | 48 {
  const target = minutes * multiplier;
  const options = [24, 32, 40, 48] as const;
  return options.reduce((best, option) =>
    Math.abs(option - target) < Math.abs(best - target) ? option : best,
  );
}
