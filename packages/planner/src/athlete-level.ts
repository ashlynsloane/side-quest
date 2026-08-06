import type { CompletedTrainingDiscipline, EnduranceActivity } from '@circuit/domain';

export type EvidenceConfidence = 'low' | 'moderate' | 'high';
export type CurrentCapacityBand = 'rebuilding' | 'developing' | 'established' | 'advanced';
export type TechnicalBand = 'unknown' | 'developing' | 'competent' | 'strong';
export type DurabilityBand = 'low' | 'uncertain' | 'moderate' | 'high';
export type StrengthExperienceBand = 'beginner' | 'intermediate' | 'advanced';
export type CalibrationKind = 'swim_css' | 'bike_ftp' | 'run_threshold' | 'strength_baseline';

export interface AthleteHistoryProfile {
  yearsInTriathlon?: number;
  yearsByDiscipline?: Partial<Record<'swim' | 'bike' | 'run' | 'strength', number>>;
  uninterruptedTrainingWeeks?: number;
  recentInjuryInterruption?: boolean;
  returnToRun?: boolean;
  recentBoneStress?: boolean;
  selfRated?: Partial<Record<'swim' | 'bike' | 'run', 'developing' | 'average' | 'strong'>>;
  strengthExperience?: StrengthExperienceBand;
  manualThresholds?: {
    swimCssSecondsPer100m?: number;
    bikeFtpWatts?: number;
    runThresholdPaceSecondsPerKm?: number;
    recordedAt?: string;
    source?: 'coach' | 'lab' | 'platform' | 'self_test';
  };
}

export interface DisciplineLevelAssessment {
  discipline: 'swim' | 'bike' | 'run';
  historicalExperience: CurrentCapacityBand;
  currentCapacity: CurrentCapacityBand;
  technicalProficiency: TechnicalBand;
  durability: DurabilityBand;
  frequencyTolerance: DurabilityBand;
  confidence: EvidenceConfidence;
  evidenceCount: number;
  recent28DayCount: number;
  recent90DayCount: number;
  recent365DayCount: number;
  recent28DayMinutes: number;
  recent90DayMinutes: number;
  recent365DayMinutes: number;
  longestRecentMinutes: number;
  performanceEstimate?: {
    value: number;
    unit: 'sec_per_100m' | 'watts' | 'sec_per_km';
    source: 'manual' | 'history';
    confidence: EvidenceConfidence;
  };
  rationale: string[];
  calibrationRecommendation?: {
    kind: CalibrationKind;
    priority: 'optional' | 'recommended' | 'defer';
    reason: string;
  };
}

export interface AthleteLevelAssessment {
  generatedAt: string;
  lookback: { currentDays: 28; capacityDays: 90; contextDays: 365 };
  swim: DisciplineLevelAssessment;
  bike: DisciplineLevelAssessment;
  run: DisciplineLevelAssessment;
  strength: {
    experience: StrengthExperienceBand;
    confidence: EvidenceConfidence;
    rationale: string[];
    calibrationRecommendation?: DisciplineLevelAssessment['calibrationRecommendation'];
  };
  summary: string[];
}

export interface AssessAthleteLevelInput {
  activities: EnduranceActivity[];
  history?: AthleteHistoryProfile;
  now?: string;
}

export function assessAthleteLevel({ activities, history = {}, now = new Date().toISOString() }: AssessAthleteLevelInput): AthleteLevelAssessment {
  const nowMs = new Date(now).getTime();
  const usable = activities.filter((activity) => !activity.deletedAt && Number.isFinite(new Date(activity.startAt).getTime()));
  const swim = assessDiscipline('swim', usable, history, nowMs);
  const bike = assessDiscipline('bike', usable, history, nowMs);
  const run = assessDiscipline('run', usable, history, nowMs);
  const strengthExperience = history.strengthExperience ?? inferStrengthExperience(history.yearsByDiscipline?.strength);
  const strengthConfidence: EvidenceConfidence = history.strengthExperience ? 'moderate' : history.yearsByDiscipline?.strength !== undefined ? 'moderate' : 'low';
  const strength = {
    experience: strengthExperience,
    confidence: strengthConfidence,
    rationale: history.strengthExperience
      ? [`Strength experience was athlete-reported as ${strengthExperience}.`, 'Exercise-level performance and recovery should update this estimate over time.']
      : ['Strength level cannot be inferred reliably from endurance-platform history.', 'Start conservatively and update from exercise technique, repetitions in reserve, load progression, and recovery response.'],
    calibrationRecommendation: strengthConfidence === 'low'
      ? { kind: 'strength_baseline' as const, priority: 'recommended' as const, reason: 'Complete familiar submaximal movements rather than a one-repetition maximum test.' }
      : undefined,
  };
  return {
    generatedAt: new Date(nowMs).toISOString(),
    lookback: { currentDays: 28, capacityDays: 90, contextDays: 365 },
    swim,
    bike,
    run,
    strength,
    summary: [
      'The past 28 days define current state, the past 90 days drive capacity estimates, and the past year supplies durability and historical context.',
      'Older or pre-interruption performance is contextual and does not automatically set current training intensity.',
      'Maximal tests are optional; existing recent evidence and submaximal calibration are preferred when sufficient.',
    ],
  };
}

export function planningProficiency(assessment: DisciplineLevelAssessment): 'developing' | 'average' | 'strong' {
  if (assessment.currentCapacity === 'rebuilding' || assessment.currentCapacity === 'developing') return 'developing';
  if (assessment.currentCapacity === 'advanced' && assessment.durability === 'high') return 'strong';
  return 'average';
}

function assessDiscipline(
  discipline: 'swim' | 'bike' | 'run',
  activities: EnduranceActivity[],
  history: AthleteHistoryProfile,
  nowMs: number,
): DisciplineLevelAssessment {
  const all = activities.filter((activity) => activity.discipline === discipline);
  const within = (days: number) => all.filter((activity) => ageDays(activity.startAt, nowMs) <= days);
  const recent28 = within(28);
  const recent90 = within(90);
  const recent365 = within(365);
  const mins = (items: EnduranceActivity[]) => Math.round(items.reduce((sum, activity) => sum + activity.movingTimeSeconds / 60, 0));
  const longestRecentMinutes = Math.round(Math.max(0, ...recent90.map((activity) => activity.movingTimeSeconds / 60)));
  const weeksWithActivity = new Set(recent90.map((activity) => weekKey(activity.startAt))).size;
  const recentFrequency = recent90.length / 13;
  const years = history.yearsByDiscipline?.[discipline] ?? history.yearsInTriathlon ?? 0;
  const interrupted = Boolean(history.recentInjuryInterruption || (discipline === 'run' && (history.returnToRun || history.recentBoneStress)));
  const historicalExperience = years >= 5 || recent365.length >= 120 ? 'advanced' : years >= 2 || recent365.length >= 45 ? 'established' : years > 0 || recent365.length >= 12 ? 'developing' : 'rebuilding';
  const weightedMinutes = mins(recent28) * 0.5 + Math.max(0, mins(recent90) - mins(recent28)) * 0.35 + Math.max(0, mins(recent365) - mins(recent90)) * 0.15;
  let currentCapacity: CurrentCapacityBand = weightedMinutes >= 4500 && recentFrequency >= 3 ? 'advanced' : weightedMinutes >= 1800 && recentFrequency >= 1.5 ? 'established' : recent90.length >= 8 ? 'developing' : 'rebuilding';
  if (interrupted) currentCapacity = 'rebuilding';
  const durability: DurabilityBand = interrupted ? 'low' : weeksWithActivity >= 10 && longestRecentMinutes >= disciplineLongThreshold(discipline) ? 'high' : weeksWithActivity >= 6 ? 'moderate' : recent90.length ? 'uncertain' : 'low';
  const frequencyTolerance: DurabilityBand = interrupted ? 'low' : recentFrequency >= disciplineFrequencyThreshold(discipline) ? 'high' : recentFrequency >= 1.5 ? 'moderate' : recent90.length ? 'uncertain' : 'low';
  const technicalProficiency = inferTechnicalBand(discipline, history.selfRated?.[discipline], years, recent90.length);
  const confidence: EvidenceConfidence = recent90.length >= 20 && recent28.length >= 4 ? 'high' : recent90.length >= 8 || history.selfRated?.[discipline] ? 'moderate' : 'low';
  const performanceEstimate = inferPerformanceEstimate(discipline, recent90, history);
  const calibrationRecommendation = calibrationFor(discipline, confidence, interrupted, performanceEstimate);
  const rationale = [
    `${recent28.length} activities in 28 days, ${recent90.length} in 90 days, and ${recent365.length} in 12 months.`,
    `${weeksWithActivity} of the last 13 weeks contain ${discipline} training; longest recent session was ${longestRecentMinutes} minutes.`,
    interrupted ? 'Recent interruption overrides older performance when estimating current capacity.' : 'Recent continuity and durability are weighted more heavily than historical personal bests.',
  ];
  return {
    discipline,
    historicalExperience,
    currentCapacity,
    technicalProficiency,
    durability,
    frequencyTolerance,
    confidence,
    evidenceCount: recent365.length,
    recent28DayCount: recent28.length,
    recent90DayCount: recent90.length,
    recent365DayCount: recent365.length,
    recent28DayMinutes: mins(recent28),
    recent90DayMinutes: mins(recent90),
    recent365DayMinutes: mins(recent365),
    longestRecentMinutes,
    performanceEstimate,
    rationale,
    calibrationRecommendation,
  };
}

function inferPerformanceEstimate(discipline: 'swim' | 'bike' | 'run', activities: EnduranceActivity[], history: AthleteHistoryProfile): DisciplineLevelAssessment['performanceEstimate'] {
  const manual = history.manualThresholds;
  if (discipline === 'swim' && manual?.swimCssSecondsPer100m) return { value: manual.swimCssSecondsPer100m, unit: 'sec_per_100m', source: 'manual', confidence: 'high' };
  if (discipline === 'bike' && manual?.bikeFtpWatts) return { value: manual.bikeFtpWatts, unit: 'watts', source: 'manual', confidence: 'high' };
  if (discipline === 'run' && manual?.runThresholdPaceSecondsPerKm) return { value: manual.runThresholdPaceSecondsPerKm, unit: 'sec_per_km', source: 'manual', confidence: 'high' };
  if (discipline === 'bike') {
    const powers = activities.flatMap((activity) => activity.weightedAverageWatts ?? activity.averageWatts ?? 0).filter((value) => value > 0);
    if (powers.length >= 5) return { value: Math.round(percentile(powers, 0.8)), unit: 'watts', source: 'history', confidence: powers.length >= 12 ? 'moderate' : 'low' };
  }
  if (discipline === 'run') {
    const paces = activities.filter((activity) => (activity.distanceMeters ?? 0) >= 3000 && activity.movingTimeSeconds > 0).map((activity) => activity.movingTimeSeconds / ((activity.distanceMeters ?? 1) / 1000));
    if (paces.length >= 3) return { value: Math.round(percentile(paces, 0.25)), unit: 'sec_per_km', source: 'history', confidence: paces.length >= 8 ? 'moderate' : 'low' };
  }
  if (discipline === 'swim') {
    const paces = activities.filter((activity) => (activity.distanceMeters ?? 0) >= 400 && activity.movingTimeSeconds > 0).map((activity) => activity.movingTimeSeconds / ((activity.distanceMeters ?? 1) / 100));
    if (paces.length >= 3) return { value: Math.round(percentile(paces, 0.25)), unit: 'sec_per_100m', source: 'history', confidence: 'low' };
  }
  return undefined;
}

function calibrationFor(discipline: 'swim' | 'bike' | 'run', confidence: EvidenceConfidence, interrupted: boolean, estimate: DisciplineLevelAssessment['performanceEstimate']): DisciplineLevelAssessment['calibrationRecommendation'] {
  const kind: Record<typeof discipline, CalibrationKind> = { swim: 'swim_css', bike: 'bike_ftp', run: 'run_threshold' };
  if (interrupted && discipline === 'run') return { kind: kind[discipline], priority: 'defer', reason: 'Do not prescribe a maximal run test during active pain or early return-to-run.' };
  if (confidence === 'high' && estimate) return { kind: kind[discipline], priority: 'optional', reason: 'Recent history is sufficient; testing is optional rather than required.' };
  return { kind: kind[discipline], priority: 'recommended', reason: discipline === 'swim' ? 'Use a controlled 400 m/200 m CSS calibration when healthy.' : discipline === 'bike' ? 'Use recent power history first; a ramp or sustained test is optional when power data are sparse.' : 'Use a recent race or controlled threshold effort; avoid mandatory maximal 5 km testing.' };
}

function inferTechnicalBand(discipline: 'swim' | 'bike' | 'run', selfRated: 'developing' | 'average' | 'strong' | undefined, years: number, count: number): TechnicalBand {
  if (selfRated === 'strong') return 'strong';
  if (selfRated === 'average') return 'competent';
  if (selfRated === 'developing') return 'developing';
  if (discipline === 'swim') return years >= 3 && count >= 12 ? 'competent' : count ? 'developing' : 'unknown';
  return years >= 2 ? 'competent' : count ? 'developing' : 'unknown';
}
function inferStrengthExperience(years?: number): StrengthExperienceBand { return (years ?? 0) >= 4 ? 'advanced' : (years ?? 0) >= 1 ? 'intermediate' : 'beginner'; }
function disciplineLongThreshold(discipline: 'swim' | 'bike' | 'run') { return discipline === 'bike' ? 120 : discipline === 'run' ? 60 : 45; }
function disciplineFrequencyThreshold(discipline: 'swim' | 'bike' | 'run') { return discipline === 'swim' ? 2.5 : discipline === 'bike' ? 2 : 2.5; }
function ageDays(date: string, nowMs: number) { return Math.max(0, (nowMs - new Date(date).getTime()) / 86_400_000); }
function weekKey(date: string) { const value = new Date(date); const first = new Date(Date.UTC(value.getUTCFullYear(), 0, 1)); return `${value.getUTCFullYear()}-${Math.floor((value.getTime() - first.getTime()) / 604_800_000)}`; }
function percentile(values: number[], quantile: number) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * quantile)))] ?? 0; }
