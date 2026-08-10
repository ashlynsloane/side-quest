import type {
  PerformanceGoalType,
  PlannedStrengthSession,
  TrainingBlockPlan,
  TrainingCalendarEvent,
  TrainingPhase,
} from '@circuit/domain';

export type UnifiedDiscipline = 'swim' | 'bike' | 'run' | 'strength' | 'mobility' | 'rest';
export type UnifiedIntensity = 'recovery' | 'easy' | 'moderate' | 'hard' | 'max';
export type DemandBand = 'none' | 'low' | 'moderate' | 'high';
export type ImpactBand = 'none' | 'low' | 'moderate' | 'high';
export type SessionPriority = 'required' | 'recommended' | 'optional';
export type RecommendationConfidence = 'low' | 'moderate' | 'high';
export type ProgressionDomain = 'swim_volume' | 'bike_volume' | 'run_volume' | 'strength_volume' | 'strength_intensity' | 'impact';

export interface UnifiedTrainingSession {
  id: string;
  date: string;
  title: string;
  discipline: UnifiedDiscipline;
  durationMinutes: number;
  intensity: UnifiedIntensity;
  cardiovascularDemand: DemandBand;
  musculoskeletalDemand: DemandBand;
  lowerBodyDemand: DemandBand;
  upperBodyDemand: DemandBand;
  impact: ImpactBand;
  technicalDemand: DemandBand;
  recoveryCost: 0 | 1 | 2 | 3 | 4 | 5;
  priority: SessionPriority;
  source: 'side_quest' | 'calendar' | 'manual';
  keySession: boolean;
}

export interface AthleteLimiterProfile {
  swim?: 'technique' | 'aerobic' | 'muscular_endurance' | 'frequency_tolerance' | 'confidence' | 'none';
  bike?: 'aerobic' | 'muscular_endurance' | 'technical' | 'frequency_tolerance' | 'confidence' | 'none';
  run?: 'aerobic' | 'durability' | 'impact_tolerance' | 'technical' | 'frequency_tolerance' | 'confidence' | 'none';
  strength?: 'movement_skill' | 'max_strength' | 'muscular_endurance' | 'consistency' | 'none';
}

export interface ProgressionBudget {
  primary: ProgressionDomain | null;
  secondary: ProgressionDomain | null;
  heldStable: ProgressionDomain[];
  reduced: ProgressionDomain[];
  rationale: string[];
}

export interface PlanInvariantViolation {
  code:
    | 'TIME_BUDGET_EXCEEDED'
    | 'RACE_WEEK_OVERLOAD'
    | 'RETURN_TO_RUN_IMPACT'
    | 'MISSED_SESSION_COMPRESSION'
    | 'DUPLICATE_EXTERNAL_ACTIVITY'
    | 'ZERO_STRENGTH_DRIFT'
    | 'OPTIONAL_BEFORE_REQUIRED'
    | 'HARD_DAY_CLUSTER'
    | 'UNEXPLAINED_LOAD_JUMP';
  severity: 'warning' | 'blocking';
  message: string;
  sessionIds: string[];
}

export interface PlanQualityReport {
  status: 'valid' | 'review' | 'invalid';
  confidence: RecommendationConfidence;
  violations: PlanInvariantViolation[];
  totalMinutes: number;
  hardDays: number;
  keySessions: number;
  recoveryDays: number;
  summary: string;
}

export interface PlanChangeAuditEntry {
  id: string;
  createdAt: string;
  kind: 'automatic_minor' | 'athlete_approved' | 'coach_proposed' | 'manual';
  reason: string;
  trigger: string;
  before: string;
  after: string;
  preserved: string[];
  reversible: boolean;
  confidence: RecommendationConfidence;
}

export interface WeeklyTrainingBudgetInput {
  availableMinutes: number;
  phase: TrainingPhase;
  goalType: PerformanceGoalType;
  recentBoneStress: boolean;
  returnToRun: boolean;
  previousWeek?: UnifiedTrainingSession[];
  limiterProfile?: AthleteLimiterProfile;
}

export function normalizeStrengthSession(session: PlannedStrengthSession): UnifiedTrainingSession {
  const durationMinutes = session.workout?.estimatedElapsedSeconds
    ? Math.max(1, Math.round(session.workout.estimatedElapsedSeconds / 60))
    : session.workout?.request?.workMinutes ?? 40;
  const intensity: UnifiedIntensity = session.intendedLoad === 'high' ? 'hard' : session.intendedLoad === 'light' ? 'easy' : 'moderate';
  const upperBody = session.purpose === 'swim_support';
  return {
    id: session.id,
    date: session.date,
    title: session.title,
    discipline: 'strength',
    durationMinutes,
    intensity,
    cardiovascularDemand: intensity === 'hard' ? 'moderate' : 'low',
    musculoskeletalDemand: intensity === 'hard' ? 'high' : intensity === 'moderate' ? 'moderate' : 'low',
    lowerBodyDemand: upperBody ? 'low' : intensity === 'hard' ? 'high' : 'moderate',
    upperBodyDemand: upperBody ? (intensity === 'hard' ? 'high' : 'moderate') : 'low',
    impact: (session.workout?.request?.maximumImpact ?? 1) >= 4 ? 'high' : (session.workout?.request?.maximumImpact ?? 1) >= 2 ? 'moderate' : 'low',
    technicalDemand: 'moderate',
    recoveryCost: intensity === 'hard' ? 4 : intensity === 'moderate' ? 3 : 1,
    priority: session.intendedLoad === 'high' ? 'required' : 'recommended',
    source: 'side_quest',
    keySession: session.intendedLoad === 'high',
  };
}

export function normalizeCalendarEvent(event: TrainingCalendarEvent): UnifiedTrainingSession {
  const text = `${event.title} ${event.description ?? ''}`.toLowerCase();
  const discipline: UnifiedDiscipline = event.discipline === 'swim' || event.discipline === 'bike' || event.discipline === 'run' || event.discipline === 'strength' || event.discipline === 'rest' ? event.discipline : 'mobility';
  const hard = /race|vo2|threshold|interval|tempo|hard|long/.test(text);
  const recovery = /recovery|easy|rest/.test(text);
  const intensity: UnifiedIntensity = discipline === 'rest' ? 'recovery' : hard ? 'hard' : recovery ? 'easy' : 'moderate';
  const start = new Date(event.startAt).getTime();
  const end = event.endAt ? new Date(event.endAt).getTime() : start + 60 * 60 * 1000;
  const durationMinutes = Math.max(0, Math.round((end - start) / 60000));
  return {
    id: event.id,
    date: event.startAt.slice(0, 10),
    title: event.title,
    discipline,
    durationMinutes,
    intensity,
    cardiovascularDemand: discipline === 'strength' || discipline === 'mobility' || discipline === 'rest' ? 'low' : hard ? 'high' : intensity === 'moderate' ? 'moderate' : 'low',
    musculoskeletalDemand: discipline === 'run' ? (hard ? 'high' : 'moderate') : discipline === 'bike' ? (hard ? 'moderate' : 'low') : discipline === 'swim' ? 'low' : 'none',
    lowerBodyDemand: discipline === 'run' || discipline === 'bike' ? (hard ? 'high' : 'moderate') : 'none',
    upperBodyDemand: discipline === 'swim' ? (hard ? 'high' : 'moderate') : 'none',
    impact: discipline === 'run' ? (hard ? 'high' : 'moderate') : 'none',
    technicalDemand: discipline === 'swim' ? 'high' : discipline === 'bike' || discipline === 'run' ? 'moderate' : 'low',
    recoveryCost: discipline === 'rest' ? 0 : hard ? 4 : intensity === 'moderate' ? 2 : 1,
    priority: hard ? 'required' : recovery ? 'optional' : 'recommended',
    source: 'calendar',
    keySession: hard,
  };
}

export function chooseProgressionBudget(input: WeeklyTrainingBudgetInput): ProgressionBudget {
  if (input.recentBoneStress || input.returnToRun) {
    return {
      primary: 'run_volume',
      secondary: 'swim_volume',
      heldStable: ['bike_volume', 'strength_volume', 'strength_intensity'],
      reduced: ['impact'],
      rationale: [
        'Return-to-run progression is the primary adaptation target.',
        'Lower-body strength dose remains stable while running tolerance is established.',
        'Plyometric and other discretionary impact progression is reduced.',
      ],
    };
  }
  if (input.phase === 'taper' || input.phase === 'race_week') {
    return {
      primary: null,
      secondary: null,
      heldStable: ['swim_volume', 'bike_volume', 'run_volume'],
      reduced: ['strength_volume', 'strength_intensity', 'impact'],
      rationale: ['Taper protects race-specific fitness while reducing fatigue-producing strength and impact load.'],
    };
  }
  if (input.phase === 'offseason' || input.phase === 'base') {
    return {
      primary: 'strength_intensity',
      secondary: limiterProgression(input.limiterProfile),
      heldStable: ['impact'],
      reduced: [],
      rationale: ['Early phases prioritize strength development while preserving endurance consistency.', limiterRationale(input.limiterProfile)],
    };
  }
  return {
    primary: goalSpecificProgression(input.goalType),
    secondary: 'strength_volume',
    heldStable: ['strength_intensity', 'impact'],
    reduced: [],
    rationale: ['Build and peak phases prioritize race-specific endurance progression while strength shifts toward maintenance.'],
  };
}

export function validateUnifiedWeek(
  sessions: UnifiedTrainingSession[],
  input: WeeklyTrainingBudgetInput,
): PlanQualityReport {
  const violations: PlanInvariantViolation[] = [];
  const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  if (totalMinutes > input.availableMinutes) {
    violations.push(violation('TIME_BUDGET_EXCEEDED', 'blocking', `Planned time exceeds the weekly budget by ${totalMinutes - input.availableMinutes} minutes.`, sessions.map((session) => session.id)));
  }

  const byDate = groupByDate(sessions);
  const hardDates = Object.entries(byDate).filter(([, values]) => values.some(isHardSession)).map(([date]) => date).sort();
  for (let index = 2; index < hardDates.length; index += 1) {
    if (differenceDays(hardDates[index - 2]!, hardDates[index]!) <= 2) {
      const ids = hardDates.slice(index - 2, index + 1).flatMap((date) => byDate[date]?.map((session) => session.id) ?? []);
      violations.push(violation('HARD_DAY_CLUSTER', 'warning', 'Three consecutive calendar days contain high-load training. Preserve a lower-load day unless this block is intentional and athlete-approved.', ids));
      break;
    }
  }

  if (input.phase === 'race_week') {
    const overload = sessions.filter((session) => session.discipline === 'strength' && (session.intensity === 'hard' || session.durationMinutes > 30));
    if (overload.length) violations.push(violation('RACE_WEEK_OVERLOAD', 'blocking', 'Race-week strength must remain brief, familiar, and low fatigue.', overload.map((session) => session.id)));
  }

  if (input.returnToRun || input.recentBoneStress) {
    const impact = sessions.filter((session) => session.impact === 'high');
    const highLower = sessions.filter((session) => session.lowerBodyDemand === 'high');
    const overlapping = impact.filter((impactSession) => highLower.some((strength) => strength.id !== impactSession.id && Math.abs(differenceDays(impactSession.date, strength.date)) <= 1));
    if (overlapping.length) violations.push(violation('RETURN_TO_RUN_IMPACT', 'blocking', 'High impact and high lower-body loading are clustered during protected return-to-run progression.', overlapping.map((session) => session.id)));
  }

  const duplicateExternal = duplicateExternalActivities(sessions);
  if (duplicateExternal.length) violations.push(violation('DUPLICATE_EXTERNAL_ACTIVITY', 'warning', 'A likely duplicate imported activity was detected and should be counted once.', duplicateExternal));

  const strengthSessions = sessions.filter((session) => session.discipline === 'strength');
  if (input.phase !== 'race_week' && sessions.some((session) => ['swim', 'bike', 'run'].includes(session.discipline)) && strengthSessions.length === 0) {
    violations.push(violation('ZERO_STRENGTH_DRIFT', 'warning', 'Endurance load displaced strength completely. Preserve a minimum maintenance dose unless an explicit restriction prevents it.', []));
  }

  const optionalOnOverBudget = totalMinutes > input.availableMinutes && sessions.some((session) => session.priority === 'optional');
  if (optionalOnOverBudget) violations.push(violation('OPTIONAL_BEFORE_REQUIRED', 'blocking', 'Optional sessions remain while the plan exceeds the athlete’s time budget. Drop optional work first.', sessions.filter((session) => session.priority === 'optional').map((session) => session.id)));

  const previousMinutes = input.previousWeek?.reduce((sum, session) => sum + session.durationMinutes, 0) ?? 0;
  if (previousMinutes > 0 && totalMinutes > previousMinutes * 1.2 && input.phase !== 'offseason') {
    violations.push(violation('UNEXPLAINED_LOAD_JUMP', 'warning', `Weekly duration increased by ${Math.round((totalMinutes / previousMinutes - 1) * 100)}%. A major increase requires an explicit progression rationale.`, sessions.map((session) => session.id)));
  }

  const blocking = violations.filter((item) => item.severity === 'blocking').length;
  const status: PlanQualityReport['status'] = blocking ? 'invalid' : violations.length ? 'review' : 'valid';
  const confidence: RecommendationConfidence = sessions.length >= 4 && input.availableMinutes > 0 ? 'high' : sessions.length >= 2 ? 'moderate' : 'low';
  return {
    status,
    confidence,
    violations: dedupeViolations(violations),
    totalMinutes,
    hardDays: hardDates.length,
    keySessions: sessions.filter((session) => session.keySession).length,
    recoveryDays: Object.values(byDate).filter((values) => values.every((session) => session.recoveryCost <= 1)).length,
    summary: status === 'valid' ? 'The week fits its time budget and passes the core load, recovery, race-phase, and strength-preservation invariants.' : status === 'review' ? 'The week is usable but contains warnings that should be explained or athlete-approved.' : 'The week violates one or more blocking planning invariants and should not be published unchanged.',
  };
}

export function validateTrainingBlockUnified(block: TrainingBlockPlan, events: TrainingCalendarEvent[], availableMinutes: number, options: { recentBoneStress?: boolean; returnToRun?: boolean } = {}): PlanQualityReport[] {
  return block.weeks.map((week) => {
    const start = week.weekStartDate;
    const end = addDays(start, 6);
    const sessions = [
      ...week.sessions.map(normalizeStrengthSession),
      ...events.filter((event) => event.startAt.slice(0, 10) >= start && event.startAt.slice(0, 10) <= end).map(normalizeCalendarEvent),
    ];
    return validateUnifiedWeek(sessions, {
      availableMinutes,
      phase: week.phase,
      goalType: block.goal.type,
      recentBoneStress: options.recentBoneStress ?? false,
      returnToRun: options.returnToRun ?? false,
    });
  });
}

export function createPlanChangeAuditEntry(input: Omit<PlanChangeAuditEntry, 'id' | 'createdAt'>): PlanChangeAuditEntry {
  return {
    ...input,
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
}

export function requiresAthleteApproval(change: { changesWeeklyAllocation?: boolean; removesKeySession?: boolean; changesPhase?: boolean; changesReturnToRun?: boolean; durationDeltaMinutes?: number }): boolean {
  return Boolean(
    change.changesWeeklyAllocation
    || change.removesKeySession
    || change.changesPhase
    || change.changesReturnToRun
    || Math.abs(change.durationDeltaMinutes ?? 0) > 15,
  );
}

function goalSpecificProgression(goal: PerformanceGoalType): ProgressionDomain {
  if (goal === 'swim_speed') return 'swim_volume';
  if (goal.startsWith('triathlon_') || goal === 'ironman_70_3' || goal === 'ironman_full') return 'bike_volume';
  return 'run_volume';
}
function limiterProgression(profile?: AthleteLimiterProfile): ProgressionDomain | null {
  if (profile?.swim && profile.swim !== 'none') return 'swim_volume';
  if (profile?.run && profile.run !== 'none') return 'run_volume';
  if (profile?.bike && profile.bike !== 'none') return 'bike_volume';
  return null;
}
function limiterRationale(profile?: AthleteLimiterProfile): string {
  if (profile?.swim === 'technique') return 'A swim technique limiter favors frequent, shorter skill exposures rather than one large volume increase.';
  if (profile?.run === 'durability' || profile?.run === 'impact_tolerance') return 'A run durability limiter favors conservative frequency and impact progression.';
  if (profile?.bike && profile.bike !== 'none') return 'A bike limiter receives targeted progression without eliminating strength development.';
  return 'No dominant sport-specific limiter was supplied, so the plan uses balanced progression.';
}
function isHardSession(session: UnifiedTrainingSession) { return session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4; }
function groupByDate(sessions: UnifiedTrainingSession[]) { return sessions.reduce<Record<string, UnifiedTrainingSession[]>>((map, session) => { (map[session.date] ??= []).push(session); return map; }, {}); }
function duplicateExternalActivities(sessions: UnifiedTrainingSession[]): string[] {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const session of sessions.filter((item) => item.source === 'calendar')) {
    const key = `${session.date}|${session.discipline}|${session.durationMinutes}|${session.title.trim().toLowerCase()}`;
    const prior = seen.get(key);
    if (prior) duplicates.push(prior, session.id); else seen.set(key, session.id);
  }
  return [...new Set(duplicates)];
}
function violation(code: PlanInvariantViolation['code'], severity: PlanInvariantViolation['severity'], message: string, sessionIds: string[]): PlanInvariantViolation { return { code, severity, message, sessionIds }; }
function dedupeViolations(values: PlanInvariantViolation[]) { const map = new Map<string, PlanInvariantViolation>(); for (const value of values) map.set(`${value.code}|${value.sessionIds.sort().join(',')}`, value); return [...map.values()]; }
function differenceDays(left: string, right: string) { return Math.round((new Date(`${right}T00:00:00Z`).getTime() - new Date(`${left}T00:00:00Z`).getTime()) / 86400000); }
function addDays(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }

export type PlanningPriority = 'medical_restrictions' | 'race_specificity' | 'key_endurance' | 'recovery_spacing' | 'strength_dose' | 'optional_volume' | 'preferences';

export function planningPriorityHierarchy(goalType: PerformanceGoalType): PlanningPriority[] {
  return goalType === 'general_offseason'
    ? ['medical_restrictions', 'strength_dose', 'recovery_spacing', 'key_endurance', 'optional_volume', 'preferences', 'race_specificity']
    : ['medical_restrictions', 'race_specificity', 'key_endurance', 'recovery_spacing', 'strength_dose', 'optional_volume', 'preferences'];
}