import type { PerformanceGoalType, TrainingPhase } from '@circuit/domain';

import type { RaceHorizonDevelopmentWeek } from './race-development-types';

import { canonicalEnduranceMinutes } from './endurance-prescription';
import {
  chooseProgressionBudget,
  validateUnifiedWeek,
  type AthleteLimiterProfile,
  type PlanQualityReport,
  type ProgressionBudget,
  type ProgressionDomain,
  type UnifiedDiscipline,
  type UnifiedIntensity,
  type UnifiedTrainingSession,
} from './unified-training';

export type TrainableDiscipline = 'swim' | 'bike' | 'run' | 'strength';
export type PlanningCommitment = 'fixed' | 'preferred' | 'generated';
export type WholeAthletePlanningState = 'build' | 'hold' | 'protect' | 'recover';
export type WholeAthleteWeekDecision = 'progress' | 'maintain' | 'reduce' | 'recover';
export type EnergyAvailabilitySignal = 'adequate' | 'uncertain' | 'concerning';
export type MenstrualRecoverySignal = 'stable' | 'unknown' | 'disrupted';
export type BoneStressSignal = 'none' | 'remote' | 'recent' | 'active';
export type InjuryConstraint = 'none' | 'monitor' | 'restricted';
export type MentalEnergySignal = 'good' | 'limited' | 'depleted';
export type LifeStressSignal = 'low' | 'moderate' | 'high' | 'overwhelming';
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WeeklySchedulePreference {
  preferredDays?: Partial<Record<TrainableDiscipline, WeekdayIndex[]>>;
  availableDays?: Partial<Record<TrainableDiscipline, WeekdayIndex[]>>;
  maxContinuousMinutesByDay?: Partial<Record<WeekdayIndex, number>>;
  totalAvailableMinutesByDay?: Partial<Record<WeekdayIndex, number>>;
  restDays?: WeekdayIndex[];
  hardBikeDay?: WeekdayIndex;
  longBikeDay?: WeekdayIndex;
  hardRunDay?: WeekdayIndex;
  longRunDay?: WeekdayIndex;
  groupSwimDays?: WeekdayIndex[];
}

/**
 * Training-planning inputs only. These signals limit training stress and never
 * diagnose RED-S, determine medical clearance, or infer a condition from training data.
 */
export interface WholeAthleteHealthContext {
  energyAvailability: EnergyAvailabilitySignal;
  menstrualRecovery?: MenstrualRecoverySignal;
  boneStress?: BoneStressSignal;
  injuryConstraint?: InjuryConstraint;
  restrictedDisciplines?: TrainableDiscipline[];
  noImpact?: boolean;
  mentalEnergy?: MentalEnergySignal;
  lifeStress?: LifeStressSignal;
  illnessOrSystemicSymptoms?: boolean;
  athleteRequestedRest?: boolean;
}

export interface DisciplineFrequencyTarget {
  min?: number;
  preferred?: number;
  max?: number;
}

export interface DisciplineBaseline {
  sessionsPerWeek: number;
  minutesPerWeek: number;
  longestSessionMinutes?: number;
}

export interface WholeAthleteWeeklyPlannerInput {
  weekStartDate: string;
  availableMinutes: number;
  goalType: PerformanceGoalType;
  phase: TrainingPhase;
  health: WholeAthleteHealthContext;
  fixedSessions?: UnifiedTrainingSession[];
  preferredSessions?: UnifiedTrainingSession[];
  previousWeek?: UnifiedTrainingSession[];
  baselines?: Partial<Record<TrainableDiscipline, DisciplineBaseline>>;
  frequencyTargets?: Partial<Record<TrainableDiscipline, DisciplineFrequencyTarget>>;
  limiterProfile?: AthleteLimiterProfile;
  recentBoneStress?: boolean;
  returnToRun?: boolean;
  maxSessionsPerDay?: 1 | 2;
  weeklySchedule?: WeeklySchedulePreference;
  developmentWeek?: RaceHorizonDevelopmentWeek;
}

export interface WholeAthletePlannedSession extends UnifiedTrainingSession {
  planningCommitment: PlanningCommitment;
  rationale: string[];
  healthAdjusted: boolean;
  progressionTarget?: ProgressionDomain;
}

export interface DisciplinePlanSummary {
  discipline: TrainableDiscipline;
  sessions: number;
  minutes: number;
  targetMin: number;
  targetPreferred: number;
  baselineMinutes?: number;
}

export interface DoubleDayPlanSummary {
  date: string;
  sessionIds: string[];
  disciplines: TrainableDiscipline[];
  rationale: string;
  athleteSpecified: boolean;
}

export interface WholeAthleteWeekPlan {
  weekStartDate: string;
  weekEndDate: string;
  planningState: WholeAthletePlanningState;
  weekDecision: WholeAthleteWeekDecision;
  weekDecisionReason: string;
  sessions: WholeAthletePlannedSession[];
  progressionBudget: ProgressionBudget;
  progressionAllowed: boolean;
  targetMinutes: number;
  plannedMinutes: number;
  generatedMinutes: number;
  disciplineSummary: DisciplinePlanSummary[];
  doubleDays: DoubleDayPlanSummary[];
  guardrails: string[];
  warnings: string[];
  quality: PlanQualityReport;
  developmentWeek?: RaceHorizonDevelopmentWeek;
}

interface ResolvedFrequencyTarget {
  min: number;
  preferred: number;
  max: number;
}

type FrequencyPlan = Record<TrainableDiscipline, ResolvedFrequencyTarget>;

interface SessionTemplate {
  title: string;
  intensity: UnifiedIntensity;
  durationMinutes: number;
  keySession: boolean;
  progressionTarget?: ProgressionDomain;
}

interface DoubleDayAssessment {
  score: number;
  rationale: string;
}

const TRAINABLE_DISCIPLINES: TrainableDiscipline[] = ['swim', 'bike', 'run', 'strength'];
const MIN_DURATION: Record<TrainableDiscipline, number> = { swim: 25, bike: 35, run: 20, strength: 25 };
const DEFAULT_DURATION: Record<TrainableDiscipline, number> = { swim: 45, bike: 60, run: 40, strength: 40 };
const MAX_DURATION: Record<TrainableDiscipline, number> = { swim: 75, bike: 120, run: 75, strength: 55 };

const DEFAULT_FREQUENCY: Record<PerformanceGoalType, FrequencyPlan> = {
  triathlon_sprint: frequencyPlan([2, 2, 3], [2, 2, 4], [2, 2, 4], [2, 2, 3]),
  triathlon_olympic: frequencyPlan([2, 3, 4], [2, 3, 4], [2, 3, 4], [2, 2, 3]),
  ironman_70_3: frequencyPlan([2, 3, 5], [2, 3, 5], [2, 3, 5], [2, 2, 3]),
  ironman_full: frequencyPlan([2, 3, 5], [2, 3, 5], [2, 3, 5], [2, 2, 3]),
  swimrun: frequencyPlan([2, 3, 5], [0, 0, 2], [2, 3, 5], [2, 2, 3]),
  road_10k: frequencyPlan([0, 1, 2], [0, 1, 2], [3, 4, 6], [2, 2, 3]),
  road_half_marathon: frequencyPlan([0, 1, 2], [0, 1, 2], [3, 4, 6], [2, 2, 3]),
  road_marathon: frequencyPlan([0, 1, 2], [0, 1, 2], [4, 5, 6], [2, 2, 3]),
  trail_50k: frequencyPlan([0, 1, 2], [0, 1, 2], [4, 5, 6], [2, 2, 3]),
  trail_100k: frequencyPlan([0, 1, 2], [0, 1, 2], [4, 5, 7], [2, 2, 3]),
  swim_speed: frequencyPlan([3, 4, 6], [0, 1, 2], [0, 1, 2], [2, 2, 3]),
  general_offseason: frequencyPlan([0, 1, 2], [0, 1, 2], [0, 1, 2], [2, 3, 4]),
};

export function buildWholeAthleteWeek(input: WholeAthleteWeeklyPlannerInput): WholeAthleteWeekPlan {
  const planningState = derivePlanningState(input);
  const weekEndDate = addDays(input.weekStartDate, 6);
  const guardrails = buildGuardrails(input, planningState);
  const warnings: string[] = [];
  const previousWeek = input.previousWeek ?? [];
  const baseProgressionBudget = chooseProgressionBudget({
    availableMinutes: input.availableMinutes,
    phase: input.phase,
    goalType: input.goalType,
    recentBoneStress: input.recentBoneStress ?? (input.health.boneStress === 'recent' || input.health.boneStress === 'active'),
    returnToRun: input.returnToRun ?? false,
    previousWeek,
    limiterProfile: input.limiterProfile,
  });
  const progressionBudget = applyHealthToProgressionBudget(baseProgressionBudget, planningState, input);
  const progressionAllowed = planningState === 'build' && progressionBudget.primary !== null;
  const frequency = resolveFrequencyPlan(input, planningState);
  const baselines = resolveBaselines(input);
  const targetMinutes = resolveTargetMinutes(input, planningState, previousWeek);
  const weekDecision = deriveWeekDecision(input, planningState, progressionAllowed, targetMinutes, previousWeek);
  const weekDecisionReason = explainWeekDecision(input, planningState, weekDecision, progressionBudget, targetMinutes, previousWeek);
  const maxSessionsPerDay = input.maxSessionsPerDay ?? (
    planningState === 'recover'
      || input.health.mentalEnergy === 'limited'
      || input.health.mentalEnergy === 'depleted'
      || input.health.lifeStress === 'high'
      || input.health.lifeStress === 'overwhelming'
      ? 1
      : 2
  );

  const fixed = inWeek(input.fixedSessions ?? [], input.weekStartDate, weekEndDate).map((session) => ({
    ...session,
    planningCommitment: 'fixed' as const,
    rationale: ['Fixed by the athlete or calendar and preserved unless the athlete changes it.'],
    healthAdjusted: false,
  }));
  warnings.push(...fixedConflictWarnings(fixed, input));

  const preferredCandidates = inWeek(input.preferredSessions ?? [], input.weekStartDate, weekEndDate)
    .map((session) => adjustPreferredSession(session, input, planningState))
    .filter((session): session is WholeAthletePlannedSession => session !== null);
  const preferred = fitPreferredSessions(
    fixed,
    preferredCandidates,
    Math.min(input.availableMinutes, targetMinutes),
    warnings,
  );

  let sessions: WholeAthletePlannedSession[] = [...fixed, ...preferred]
    .sort(sortSessions);
  const hardBudget = allowedGeneratedHardSessions(input, planningState, sessions);
  let generatedHardSessions = 0;

  const requiredCounts = Object.fromEntries(TRAINABLE_DISCIPLINES.map((discipline) => [discipline, frequency[discipline].min])) as Record<TrainableDiscipline, number>;
  const preferredCounts = Object.fromEntries(TRAINABLE_DISCIPLINES.map((discipline) => [discipline, frequency[discipline].preferred])) as Record<TrainableDiscipline, number>;

  const addPass = (targets: Record<TrainableDiscipline, number>, required: boolean) => {
    const order = disciplineOrder(input.goalType);
    let progress = true;
    while (progress) {
      progress = false;
      for (const discipline of order) {
        if (isDisciplineRestricted(discipline, input)) continue;
        if (countDiscipline(sessions, discipline) >= targets[discipline]) continue;
        if (planningState === 'recover') continue;

        const remainingBudget = Math.min(input.availableMinutes, targetMinutes) - totalMinutes(sessions);
        const template = buildTemplate({
          discipline,
          existingDisciplineCount: countDiscipline(sessions, discipline),
          baseline: baselines[discipline],
          input,
          planningState,
          progressionBudget,
          mayUseHardSession: generatedHardSessions < hardBudget,
        });
        const durationMinutes = fitDuration(template.durationMinutes, discipline, remainingBudget);
        if (durationMinutes === null) {
          if (required) warnings.push(`Could not fit the minimum ${discipline} frequency inside the current time and recovery budget.`);
          continue;
        }

        const date = chooseDate({
          weekStartDate: input.weekStartDate,
          discipline,
          template,
          sessions,
          input,
          maxSessionsPerDay,
        });
        if (!date) {
          if (required) warnings.push(`Could not place another ${discipline} session without violating spacing or daily-load guardrails.`);
          continue;
        }

        const sameDay = sessions.filter((session) => session.date === date);
        const pairAssessment = sameDay.length ? assessDoubleDay(discipline, template, sameDay) : null;
        const generated = createGeneratedSession({
          date,
          discipline,
          template: { ...template, durationMinutes },
          index: countDiscipline(sessions, discipline),
          planningState,
          doubleDayRationale: pairAssessment?.rationale,
        });
        sessions = [...sessions, generated].sort(sortSessions);
        if (generated.intensity === 'hard' || generated.intensity === 'max') generatedHardSessions += 1;
        progress = true;
      }
    }
  };

  addPass(requiredCounts, true);
  if (planningState === 'build') addPass(preferredCounts, false);
  else if (planningState === 'hold') addPass(preferredCounts, false);
  else if (planningState === 'protect' && isImpactLocalProtection(input)) {
    // Only swim/bike can exceed minimum frequency here; run and strength
    // preferred counts remain at their protected minimums.
    addPass(preferredCounts, false);
  }

  const quality = validateUnifiedWeek(sessions, {
    availableMinutes: input.availableMinutes,
    phase: input.phase,
    goalType: input.goalType,
    recentBoneStress: input.recentBoneStress ?? (input.health.boneStress === 'recent' || input.health.boneStress === 'active'),
    returnToRun: input.returnToRun ?? false,
    previousWeek,
    limiterProfile: input.limiterProfile,
  });

  warnings.push(...frequencyWarnings(sessions, frequency));
  warnings.push(...weekCoherenceWarnings(sessions));
  if (totalMinutes(sessions) > targetMinutes && totalMinutes(fixed) <= targetMinutes) {
    warnings.push('The plan is above the preferred health-adjusted volume ceiling; review preferred commitments before adding more work.');
  }
  if (planningState !== 'build') {
    warnings.push('Progression is intentionally withheld this week; the plan favors maintaining useful training while reducing avoidable stress.');
  }

  return {
    weekStartDate: input.weekStartDate,
    weekEndDate,
    planningState,
    weekDecision,
    weekDecisionReason,
    developmentWeek: input.developmentWeek,
    sessions,
    progressionBudget,
    progressionAllowed,
    targetMinutes,
    plannedMinutes: totalMinutes(sessions),
    generatedMinutes: totalMinutes(sessions.filter((session) => session.planningCommitment === 'generated')),
    disciplineSummary: TRAINABLE_DISCIPLINES.map((discipline) => ({
      discipline,
      sessions: countDiscipline(sessions, discipline),
      minutes: totalMinutes(sessions.filter((session) => session.discipline === discipline)),
      targetMin: frequency[discipline].min,
      targetPreferred: frequency[discipline].preferred,
      baselineMinutes: baselines[discipline]?.minutesPerWeek,
    })),
    doubleDays: summarizeDoubleDays(sessions),
    guardrails,
    warnings: unique(warnings),
    quality,
  };
}

function derivePlanningState(input: WholeAthleteWeeklyPlannerInput): WholeAthletePlanningState {
  const health = input.health;
  if (health.athleteRequestedRest || health.illnessOrSystemicSymptoms || health.mentalEnergy === 'depleted' || health.lifeStress === 'overwhelming') return 'recover';
  if (
    health.energyAvailability === 'concerning'
    || health.menstrualRecovery === 'disrupted'
    || health.boneStress === 'recent'
    || health.boneStress === 'active'
    || health.injuryConstraint === 'restricted'
    || health.noImpact
    || input.recentBoneStress
    || input.returnToRun
  ) return 'protect';
  if (health.energyAvailability === 'uncertain' || health.mentalEnergy === 'limited' || health.lifeStress === 'high' || health.injuryConstraint === 'monitor') return 'hold';
  return 'build';
}

function deriveWeekDecision(
  input: WholeAthleteWeeklyPlannerInput,
  state: WholeAthletePlanningState,
  progressionAllowed: boolean,
  targetMinutes: number,
  previousWeek: UnifiedTrainingSession[],
): WholeAthleteWeekDecision {
  if (state === 'recover') return 'recover';
  if (state === 'protect') return 'reduce';
  if (state === 'hold') return 'maintain';
  const previousMinutes = totalMinutes(previousWeek);
  if (previousMinutes > 0 && targetMinutes < previousMinutes * 0.97) return 'reduce';
  return progressionAllowed ? 'progress' : 'maintain';
}

function explainWeekDecision(
  input: WholeAthleteWeeklyPlannerInput,
  state: WholeAthletePlanningState,
  decision: WholeAthleteWeekDecision,
  budget: ProgressionBudget,
  targetMinutes: number,
  previousWeek: UnifiedTrainingSession[],
): string {
  const phase = input.phase.replaceAll('_', ' ');
  const previousMinutes = totalMinutes(previousWeek);
  if (state === 'recover') return `This is a ${phase} phase, but recovery is the priority this week because current recovery or life-capacity signals override training progression.`;
  if (state === 'protect') return `This is a ${phase} phase, but training load is reduced this week because an active health or injury-protection constraint takes priority.`;
  if (state === 'hold') return `This is a ${phase} phase, but this week maintains training rather than adding load because recovery capacity is uncertain.`;
  if (decision === 'reduce' && previousMinutes > 0 && input.availableMinutes < previousMinutes) {
    return `This remains a ${phase} phase, but total training is lower because available training time is below last week. The reduction reflects availability, not a change in the season plan.`;
  }
  if (decision === 'progress' && budget.primary) {
    return `This is a ${phase} phase. ${friendlyProgressionDomain(budget.primary)} is the primary progression this week while other training stays controlled.`;
  }
  const budgetReason = budget.rationale.find((line) => Boolean(line.trim()));
  return budgetReason
    ? `This is a ${phase} phase. ${budgetReason}`
    : `This is a ${phase} phase, but no training domain is being pushed higher this week; useful work is maintained instead.`;
}

function friendlyProgressionDomain(domain: ProgressionDomain): string {
  if (domain === 'swim_volume') return 'Swim volume';
  if (domain === 'bike_volume') return 'Bike volume';
  if (domain === 'run_volume') return 'Run volume';
  if (domain === 'strength_volume') return 'Strength volume';
  if (domain === 'strength_intensity') return 'Strength intensity';
  if (domain === 'impact') return 'Impact exposure';
  return 'Training load';
}

function buildGuardrails(input: WholeAthleteWeeklyPlannerInput, state: WholeAthletePlanningState): string[] {
  const health = input.health;
  const guardrails: string[] = [];
  if (state === 'recover') guardrails.push('Do not generate training load when rest, systemic symptoms, depleted mental energy, or overwhelming life stress is the dominant signal.');
  if (health.energyAvailability === 'concerning' || health.menstrualRecovery === 'disrupted') guardrails.push('Hold progression and remove discretionary intensity before reducing low-risk aerobic consistency.');
  if (health.energyAvailability === 'uncertain') guardrails.push('Do not use uncertain recovery evidence to justify a load increase.');
  if (input.returnToRun || input.recentBoneStress || health.boneStress === 'recent') guardrails.push('Return-to-run work stays easy, short, and separated by at least one non-running day.');
  if (health.boneStress === 'active' || health.noImpact) guardrails.push('Do not generate impact sessions; preserve non-impact options unless another restriction blocks them.');
  if (health.restrictedDisciplines?.length) guardrails.push(`Do not generate restricted disciplines: ${health.restrictedDisciplines.join(', ')}.`);
  if (health.mentalEnergy === 'limited' || health.lifeStress === 'high') guardrails.push('Prefer fewer, more familiar sessions over additional optional volume.');
  if (guardrails.length === 0) guardrails.push('Progress only a small number of training domains while preserving recovery spacing and the weekly time budget.');
  return guardrails;
}

function applyHealthToProgressionBudget(
  base: ProgressionBudget,
  state: WholeAthletePlanningState,
  input: WholeAthleteWeeklyPlannerInput,
): ProgressionBudget {
  if (state === 'build') return base;
  const held = unique([
    ...base.heldStable,
    'swim_volume',
    'bike_volume',
    'run_volume',
    'strength_volume',
    'strength_intensity',
  ] as ProgressionDomain[]);
  const reduced = unique([
    ...base.reduced,
    ...(state === 'protect' ? ['impact'] as ProgressionDomain[] : []),
  ]);
  return {
    primary: null,
    secondary: null,
    heldStable: held,
    reduced,
    rationale: [
      ...base.rationale,
      state === 'recover'
        ? 'Recovery and life-capacity signals override planned progression.'
        : state === 'protect'
          ? 'Health or injury-protection signals hold progression until the constraint improves.'
          : 'Uncertain recovery capacity favors consolidation rather than adding load.',
      input.health.energyAvailability === 'concerning' ? 'Low-energy-availability risk signals are treated as a ceiling on training stress, not as a performance target.' : '',
    ].filter(Boolean),
  };
}

function isImpactLocalProtection(input: WholeAthleteWeeklyPlannerInput): boolean {
  const health = input.health;
  const impactSignal = Boolean(
    input.returnToRun
    || input.recentBoneStress
    || health.boneStress === 'recent',
  );
  if (!impactSignal) return false;

  // These signals indicate a broader recovery ceiling, not merely an impact
  // restriction. In those cases the ordinary protect/hold frequency reduction
  // remains authoritative.
  if (health.energyAvailability === 'concerning' || health.menstrualRecovery === 'disrupted') return false;
  if (health.boneStress === 'active' || health.injuryConstraint === 'restricted' || health.noImpact) return false;
  if (health.illnessOrSystemicSymptoms || health.athleteRequestedRest) return false;
  if (health.mentalEnergy === 'depleted' || health.lifeStress === 'overwhelming') return false;
  if ((health.restrictedDisciplines ?? []).some((discipline) => discipline !== 'run')) return false;

  return true;
}

function resolveFrequencyPlan(input: WholeAthleteWeeklyPlannerInput, state: WholeAthletePlanningState): FrequencyPlan {
  const defaults = DEFAULT_FREQUENCY[input.goalType];
  const plan = {} as FrequencyPlan;
  const impactLocalProtection = isImpactLocalProtection(input);
  for (const discipline of TRAINABLE_DISCIPLINES) {
    const override = input.frequencyTargets?.[discipline];
    const base = defaults[discipline];
    let min = clampInt(override?.min ?? base.min, 0, 7);
    let preferred = clampInt(override?.preferred ?? base.preferred, min, 7);
    let max = clampInt(override?.max ?? base.max, preferred, 7);

    if (isDisciplineRestricted(discipline, input)) {
      min = 0;
      preferred = 0;
      max = 0;
    } else if (state === 'recover') {
      min = 0;
      preferred = 0;
    } else if (state === 'protect' || state === 'hold') {
      // A clean return-to-run / recent-bone-stress signal is discipline-local:
      // impact exposure is protected, but low-impact race training does not
      // automatically collapse from preferred frequency to the bare minimum.
      if (!(impactLocalProtection && (discipline === 'swim' || discipline === 'bike'))) {
        preferred = min;
      }
    }

    if (
      discipline === 'run'
      && input.returnToRun
      && impactLocalProtection
      && state !== 'recover'
      && !isDisciplineRestricted(discipline, input)
    ) {
      // When impact is permitted, return-to-run is a three-exposure rhythm.
      // Dose changes before frequency; broader recovery ceilings can still
      // reduce frequency through the ordinary protection path above.
      min = 3;
      preferred = 3;
      max = 3;
    } else if (
      discipline === 'run'
      && (input.recentBoneStress || input.health.boneStress === 'recent')
    ) {
      min = Math.min(min, 2);
      preferred = Math.min(preferred, 3);
      max = Math.min(max, 3);
    }

    plan[discipline] = { min, preferred, max };
  }
  return plan;
}

function resolveBaselines(input: WholeAthleteWeeklyPlannerInput): Partial<Record<TrainableDiscipline, DisciplineBaseline>> {
  const result: Partial<Record<TrainableDiscipline, DisciplineBaseline>> = { ...(input.baselines ?? {}) };
  const previousWeek = input.previousWeek ?? [];
  for (const discipline of TRAINABLE_DISCIPLINES) {
    if (result[discipline]) continue;
    const sessions = previousWeek.filter((session) => session.discipline === discipline);
    if (!sessions.length) continue;
    result[discipline] = {
      sessionsPerWeek: sessions.length,
      minutesPerWeek: totalMinutes(sessions),
      longestSessionMinutes: Math.max(...sessions.map((session) => session.durationMinutes)),
    };
  }
  return result;
}

function resolveTargetMinutes(
  input: WholeAthleteWeeklyPlannerInput,
  state: WholeAthletePlanningState,
  previousWeek: UnifiedTrainingSession[],
): number {
  const available = Math.max(0, Math.round(input.availableMinutes));
  const previous = totalMinutes(previousWeek);
  if (state === 'recover') return Math.min(available, totalMinutes(inWeek(input.fixedSessions ?? [], input.weekStartDate, addDays(input.weekStartDate, 6))));
  if (previous <= 0) return available;
  const multiplier = state === 'build' ? 1.08 : state === 'hold' ? 1 : 0.9;
  return Math.min(available, roundToFive(previous * multiplier));
}

function adjustPreferredSession(
  session: UnifiedTrainingSession,
  input: WholeAthleteWeeklyPlannerInput,
  state: WholeAthletePlanningState,
): WholeAthletePlannedSession | null {
  if (state === 'recover' && session.discipline !== 'rest' && session.discipline !== 'mobility') return null;
  if (isTrainableDiscipline(session.discipline) && isDisciplineRestricted(session.discipline, input)) return null;
  if (session.discipline === 'run' && (input.health.boneStress === 'active' || input.health.noImpact)) return null;

  let adjusted = session;
  const rationale = ['Preferred by the athlete; kept when it fits current health and recovery constraints.'];
  let healthAdjusted = false;

  if (state === 'protect' || state === 'hold') {
    if (session.intensity === 'hard' || session.intensity === 'max') {
      adjusted = capSessionIntensity(adjusted, state === 'protect' ? 'easy' : 'moderate');
      rationale.push('Intensity reduced because progression is not currently the priority.');
      healthAdjusted = true;
    }
    if (session.discipline === 'run' && (input.returnToRun || input.recentBoneStress || input.health.boneStress === 'recent')) {
      adjusted = {
        ...adjusted,
        durationMinutes: Math.min(30, adjusted.durationMinutes),
        intensity: 'easy',
        impact: adjusted.impact === 'none' ? 'moderate' : adjusted.impact,
        recoveryCost: Math.min(adjusted.recoveryCost, 2) as 0 | 1 | 2 | 3 | 4 | 5,
        keySession: false,
      };
      rationale.push('Run dose capped for protected return-to-impact progression.');
      healthAdjusted = true;
    }
  }

  return {
    ...adjusted,
    planningCommitment: 'preferred',
    rationale,
    healthAdjusted,
  };
}

function fitPreferredSessions(
  fixed: WholeAthletePlannedSession[],
  preferred: WholeAthletePlannedSession[],
  budgetMinutes: number,
  warnings: string[],
): WholeAthletePlannedSession[] {
  const selected: WholeAthletePlannedSession[] = [];
  let committedMinutes = totalMinutes(fixed);
  const ordered = [...preferred].sort((left, right) =>
    priorityRank(left.priority) - priorityRank(right.priority)
      || Number(right.keySession) - Number(left.keySession)
      || left.date.localeCompare(right.date));

  for (const session of ordered) {
    if (session.discipline === 'rest' || session.discipline === 'mobility') {
      selected.push(session);
      continue;
    }
    const remaining = budgetMinutes - committedMinutes;
    if (remaining >= session.durationMinutes) {
      selected.push(session);
      committedMinutes += session.durationMinutes;
      continue;
    }
    if (isTrainableDiscipline(session.discipline) && remaining >= MIN_DURATION[session.discipline] && session.priority !== 'optional') {
      const rawTrimmedMinutes = Math.floor(remaining);
      const trimmedMinutes = session.discipline === 'strength'
        ? rawTrimmedMinutes
        : Math.max(MIN_DURATION[session.discipline], Math.floor(rawTrimmedMinutes / 5) * 5);
      const trimmed = {
        ...session,
        durationMinutes: trimmedMinutes,
        healthAdjusted: true,
        rationale: [...session.rationale, 'Duration trimmed so preferred work does not crowd out the weekly time and recovery budget.'],
      };
      selected.push(trimmed);
      committedMinutes += trimmed.durationMinutes;
      continue;
    }
    warnings.push(`${session.title} was left out because fixed and higher-priority work already used the available weekly budget.`);
  }
  return selected.sort(sortSessions);
}

function priorityRank(priority: UnifiedTrainingSession['priority']): number {
  if (priority === 'required') return 0;
  if (priority === 'recommended') return 1;
  return 2;
}

function allowedGeneratedHardSessions(
  input: WholeAthleteWeeklyPlannerInput,
  state: WholeAthletePlanningState,
  sessions: WholeAthletePlannedSession[],
): number {
  if (state === 'protect' || state === 'recover') return 0;
  const existingHardDates = new Set(sessions.filter(isHard).map((session) => session.date)).size;
  const totalHardLimit = state === 'hold'
    ? 1
    : input.phase === 'race_week'
      ? 0
      : input.phase === 'taper'
        ? 1
        : input.phase === 'build' || input.phase === 'peak'
          ? 2
          : 1;
  return Math.max(0, totalHardLimit - existingHardDates);
}

function buildTemplate({
  discipline,
  existingDisciplineCount,
  baseline,
  input,
  planningState,
  progressionBudget,
  mayUseHardSession,
}: {
  discipline: TrainableDiscipline;
  existingDisciplineCount: number;
  baseline?: DisciplineBaseline;
  input: WholeAthleteWeeklyPlannerInput;
  planningState: WholeAthletePlanningState;
  progressionBudget: ProgressionBudget;
  mayUseHardSession: boolean;
}): SessionTemplate {
  const averageBaseline = baseline && baseline.sessionsPerWeek > 0
    ? baseline.minutesPerWeek / baseline.sessionsPerWeek
    : DEFAULT_DURATION[discipline];
  const progressionTarget = progressionTargetFor(discipline, progressionBudget);
  const progresses = planningState === 'build' && progressionTarget !== undefined;
  const rawDuration = averageBaseline * (progresses ? 1.05 : planningState === 'protect' ? 0.85 : 1);
  const duration = clamp(
    discipline === 'strength' ? Math.round(rawDuration) : canonicalEnduranceMinutes(rawDuration),
    MIN_DURATION[discipline],
    MAX_DURATION[discipline],
  );
  const hardEligible = mayUseHardSession
    && planningState === 'build'
    && input.phase !== 'race_week'
    && !(discipline === 'run' && (input.returnToRun || input.recentBoneStress || input.health.boneStress === 'recent'));
  const qualityDiscipline = hardSessionDisciplineOrder(input.goalType).includes(discipline);
  const makeHard = hardEligible && qualityDiscipline && existingDisciplineCount === 0;

  if (discipline === 'swim') {
    const qualitySwim = existingDisciplineCount === 0;
    return {
      title: makeHard
        ? 'Swim quality'
        : qualitySwim
          ? 'Swim quality'
          : existingDisciplineCount === 1
            ? 'Aerobic + technique swim'
            : 'Recovery swim',
      intensity: makeHard
        ? 'hard'
        : qualitySwim
          ? 'moderate'
          : 'easy',
      durationMinutes: duration,
      keySession: makeHard || qualitySwim,
      progressionTarget: progresses ? progressionTarget : undefined,
    };
  }
  if (discipline === 'bike') {
    const proposedLong = Math.min(MAX_DURATION.bike, Math.max(duration, canonicalEnduranceMinutes(duration * 1.25)));
    const longDuration = baseline?.longestSessionMinutes
      ? Math.min(proposedLong, canonicalEnduranceMinutes(baseline.longestSessionMinutes * (progresses ? 1.05 : 1)))
      : proposedLong;
    return {
      title: makeHard ? 'Bike quality' : existingDisciplineCount === 2 ? 'Long endurance ride' : 'Aerobic ride',
      intensity: makeHard ? 'hard' : existingDisciplineCount === 2 ? 'moderate' : 'easy',
      durationMinutes: existingDisciplineCount === 2 ? longDuration : duration,
      keySession: makeHard || existingDisciplineCount === 2,
      progressionTarget: progresses ? progressionTarget : undefined,
    };
  }
  if (discipline === 'run') {
    const protectedRun = input.returnToRun || input.recentBoneStress || input.health.boneStress === 'recent';
    const proposedLong = Math.min(MAX_DURATION.run, Math.max(duration, canonicalEnduranceMinutes(duration * 1.2)));
    const longDuration = baseline?.longestSessionMinutes
      ? Math.min(proposedLong, canonicalEnduranceMinutes(baseline.longestSessionMinutes * (progresses ? 1.05 : 1)))
      : proposedLong;
    return {
      title: protectedRun ? 'Easy return-to-run' : makeHard ? 'Run quality' : existingDisciplineCount >= 2 ? 'Long aerobic run' : 'Easy aerobic run',
      intensity: protectedRun ? 'easy' : makeHard ? 'hard' : existingDisciplineCount >= 2 ? 'moderate' : 'easy',
      durationMinutes: protectedRun ? Math.min(30, duration) : existingDisciplineCount >= 2 ? longDuration : duration,
      keySession: !protectedRun && (makeHard || existingDisciplineCount >= 2),
      progressionTarget: progresses ? progressionTarget : undefined,
    };
  }

  const swimSupport = ['swim_speed', 'ironman_70_3', 'ironman_full', 'triathlon_olympic', 'triathlon_sprint', 'swimrun'].includes(input.goalType) && existingDisciplineCount > 0;
  return {
    title: swimSupport ? 'Swim-support strength' : 'Full-body strength',
    intensity: planningState === 'protect' ? 'easy' : makeHard ? 'hard' : 'moderate',
    durationMinutes: planningState === 'protect' ? Math.min(35, duration) : duration,
    keySession: makeHard,
    progressionTarget: progresses ? progressionTarget : undefined,
  };
}

function chooseDate({
  weekStartDate,
  discipline,
  template,
  sessions,
  input,
  maxSessionsPerDay,
}: {
  weekStartDate: string;
  discipline: TrainableDiscipline;
  template: SessionTemplate;
  sessions: WholeAthletePlannedSession[];
  input: WholeAthleteWeeklyPlannerInput;
  maxSessionsPerDay: 1 | 2;
}): string | null {
  const candidates = Array.from({ length: 7 }, (_, offset) => addDays(weekStartDate, offset))
    .map((date, offset) => ({ date, offset, score: placementScore(date, offset, discipline, template, sessions, input, maxSessionsPerDay) }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || left.offset - right.offset);
  return candidates[0]?.date ?? null;
}

function placementScore(
  date: string,
  offset: number,
  discipline: TrainableDiscipline,
  template: SessionTemplate,
  sessions: WholeAthletePlannedSession[],
  input: WholeAthleteWeeklyPlannerInput,
  maxSessionsPerDay: 1 | 2,
): number {
  const sameDay = sessions.filter((session) => session.date === date);
  if (sameDay.length >= maxSessionsPerDay) return Number.NEGATIVE_INFINITY;
  const sportAvailableDays = input.weeklySchedule?.availableDays?.[discipline];
  if (sportAvailableDays?.length && !sportAvailableDays.includes(offset as WeekdayIndex)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (sameDay.some((session) => session.discipline === discipline)) return Number.NEGATIVE_INFINITY;

  if ((input.returnToRun || input.recentBoneStress || input.health.boneStress === 'recent') && discipline === 'run') {
    const runDates = sessions.filter((session) => session.discipline === 'run').map((session) => session.date);
    if (runDates.some((runDate) => Math.abs(dayDifference(runDate, date)) < 2)) return Number.NEGATIVE_INFINITY;
  }

  const hardCandidate = template.intensity === 'hard' || template.intensity === 'max';
  const weeklyStructure = resolveWeeklySchedule(input);
  const structureScore = weeklyStructurePlacementScore({
    offset,
    discipline,
    template,
    sessions,
    input,
    structure: weeklyStructure,
  });
  if (!Number.isFinite(structureScore)) return Number.NEGATIVE_INFINITY;
  const longCandidate = (discipline === 'bike' || discipline === 'run')
    && template.title.toLowerCase().includes('long');
  const keyLowerBodyCandidate = (discipline === 'bike' || discipline === 'run')
    && (template.keySession || hardCandidate || longCandidate);

  const recentPreviousWeek = (input.previousWeek ?? []).filter((session) => {
    const gap = dayDifference(session.date, date);
    return gap >= 1 && gap <= 2;
  });
  const contextSessions = [...sessions, ...recentPreviousWeek];
  const adjacent = contextSessions.filter((session) => Math.abs(dayDifference(session.date, date)) === 1);
  const previousDay = contextSessions.filter((session) => dayDifference(session.date, date) === 1);
  const nextDay = contextSessions.filter((session) => dayDifference(date, session.date) === 1);
  const adjacentKeyLower = adjacent.filter(isKeyLowerBodySession);
  const sameDayKeyLower = sameDay.filter(isKeyLowerBodySession);
  const adjacentCommittedKeyLower = adjacentKeyLower.filter(
    (session) => (session as WholeAthletePlannedSession).planningCommitment !== 'generated',
  );

  // Athlete/calendar commitments remain hard anchors. Generated strength may
  // sit beside an intentionally structured generated key day, but it must not
  // be placed immediately before or after a fixed/preferred key lower-body
  // session that the athlete did not ask Side Quest to move.
  if (discipline === 'strength' && adjacentCommittedKeyLower.length > 0) {
    return Number.NEGATIVE_INFINITY;
  }

  // Strength should not share the same day as a hard bike workout. The
  // supported consolidation pattern is long run + controlled strength.
  if (
    discipline === 'strength'
    && sameDayKeyLower.some((session) => session.discipline === 'bike' && isHard(session))
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const activeDates = new Set(
    sessions
      .filter((session) => session.discipline !== 'rest' && session.discipline !== 'mobility')
      .map((session) => session.date),
  );

  const compatibleDouble = sameDay.length > 0
    && sameDay.every((session) => isCompatibleSameDayPair(session, discipline, template));

  let score = structureScore;

  if (sameDay.length === 0) {
    score += 14;
    if (activeDates.size >= 5) score -= 8;
    if (activeDates.size >= 6) score -= 14;

  } else if (compatibleDouble) {
    score += 24;
    if (activeDates.size >= 5) score += 8;
  } else if (discipline === 'swim' && !hardCandidate) {
    score += 4;
  } else {
    score -= 20;
  }

  if (hardCandidate) {
    if (adjacent.some(isHard)) score -= 120;
    score -= adjacent.filter((session) => session.recoveryCost >= 3).length * 20;
    if (previousDay.length === 0 || previousDay.every(isLowLoadSession)) score += 10;
  }

  if (keyLowerBodyCandidate) {
    score -= adjacentKeyLower.length * 34;
    score -= adjacent.filter(
      (session) => session.discipline === 'strength' && session.lowerBodyDemand !== 'none',
    ).length * 22;
    if (previousDay.length === 0 || previousDay.every(isLowLoadSession)) score += 10;
    if (nextDay.length === 0 || nextDay.every(isLowLoadSession)) score += 6;
  }

  if (discipline === 'strength') {
    const hasSwim = sameDay.some((session) => session.discipline === 'swim');
    const hasLongRun = sameDay.some(
      (session) => session.discipline === 'run' && /\blong\b/i.test(session.title),
    );
    if (hasLongRun && !hardCandidate) score += 52;
    if (hasSwim && !hardCandidate) score += 18;
    score -= adjacentKeyLower.length * 24;
    score -= sameDayKeyLower.filter((session) => session.discipline === 'bike').length
      * (hardCandidate ? 34 : 18);

    const neighboringLower = adjacent.filter(
      (session) => session.lowerBodyDemand === 'high'
        || (session.lowerBodyDemand === 'moderate' && session.recoveryCost >= 3),
    );
    const adjacentHardLower = adjacent.filter(
      (session) => (session.discipline === 'bike' || session.discipline === 'run')
        && isHard(session),
    );
    score -= neighboringLower.length * 18;
    score -= adjacentHardLower.length * 30;

    if ((offset === 1 || offset === 4) && adjacentKeyLower.length === 0) score += 5;
  }

  if (discipline === 'swim') {
    if (!hardCandidate && sameDay.some((session) => session.discipline === 'strength')) score += 16;
    if (!hardCandidate && previousDay.some(isKeyLowerBodySession)) score += 12;
    if (offset === 1 || offset === 3 || offset === 6) score += 4;
  }

  if (discipline === 'bike') {
    if (longCandidate) score += offset >= 5 ? 24 : 0;
    else if (offset === 1 || offset === 3) score += 4;
  }

  if (discipline === 'run') {
    if (longCandidate) score += offset === 6 ? 28 : offset >= 5 ? 12 : 0;
    else if (offset === 2 || offset === 4 || offset === 6) score += 4;
  }

  if (longCandidate) {
    score -= adjacent.filter((session) => isHard(session) || session.recoveryCost >= 4).length * 28;
    score -= adjacentKeyLower.length * 14;
  }

  for (const session of sameDay) {
    if (hardCandidate && session.recoveryCost >= 4) score -= 24;
    if ((discipline === 'run' || discipline === 'bike') && session.lowerBodyDemand === 'high') score -= 28;
  }

  return score;
}


function resolveWeeklySchedule(input: WholeAthleteWeeklyPlannerInput): WeeklySchedulePreference | null {
  return resolveWeeklySchedulePreference(input.goalType, input.weeklySchedule);
}

export function resolveWeeklySchedulePreference(
  goalType: PerformanceGoalType,
  override?: WeeklySchedulePreference,
): WeeklySchedulePreference | null {
  const usesTriathlonStructure = [
    'triathlon_sprint',
    'triathlon_olympic',
    'ironman_70_3',
    'ironman_full',
  ].includes(goalType);

  if (!usesTriathlonStructure && !override) return null;

  const requestedRestDay = override?.restDays?.[0] ?? 0;
  const base = usesTriathlonStructure
    ? deriveAutomaticTriathlonSchedule(requestedRestDay, override)
    : null;

  if (!override) return base;

  return {
    ...(base ?? {}),
    ...override,
    preferredDays: {
      ...(base?.preferredDays ?? {}),
      ...(override.preferredDays ?? {}),
    },
  };
}

type AutomaticTriathlonRole =
  | 'quality'
  | 'easyRunStrength'
  | 'support'
  | 'qualityRunStrength'
  | 'longBike'
  | 'longRunSwim';

function deriveAutomaticTriathlonSchedule(
  restDay: number,
  override?: WeeklySchedulePreference,
): WeeklySchedulePreference {
  const normalizedRest: WeekdayIndex = Number.isInteger(restDay) && restDay >= 0 && restDay <= 6
    ? restDay as WeekdayIndex
    : 0;

  const days: WeekdayIndex[] = ([0, 1, 2, 3, 4, 5, 6] as WeekdayIndex[])
    .filter((day) => day !== normalizedRest);
  const roles: AutomaticTriathlonRole[] = [
    'quality',
    'easyRunStrength',
    'support',
    'qualityRunStrength',
    'longBike',
    'longRunSwim',
  ];

  let best:
    | { score: number; assignment: Record<AutomaticTriathlonRole, WeekdayIndex> }
    | undefined;

  for (const permutation of permutations(days)) {
    const assignment = Object.fromEntries(
      roles.map((role, index) => [role, permutation[index]!]),
    ) as Record<AutomaticTriathlonRole, WeekdayIndex>;
    const score = automaticTriathlonScheduleScore(
      assignment,
      normalizedRest,
      override,
    );
    if (!best || score < best.score) best = { score, assignment };
  }

  const assignment: Record<AutomaticTriathlonRole, WeekdayIndex> = best?.assignment ?? {
    quality: 1,
    easyRunStrength: 2,
    support: 3,
    qualityRunStrength: 4,
    longBike: 5,
    longRunSwim: 6,
  };

  return {
    preferredDays: {
      swim: [assignment.quality, assignment.support, assignment.longRunSwim],
      bike: [assignment.quality, assignment.support, assignment.longBike],
      run: [assignment.easyRunStrength, assignment.qualityRunStrength, assignment.longRunSwim],
      strength: [assignment.easyRunStrength, assignment.qualityRunStrength],
    },
    restDays: [normalizedRest],
    hardBikeDay: assignment.quality,
    longBikeDay: assignment.longBike,
    hardRunDay: assignment.qualityRunStrength,
    longRunDay: assignment.longRunSwim,
    groupSwimDays: [assignment.quality],
  };
}

function automaticTriathlonScheduleScore(
  assignment: Record<AutomaticTriathlonRole, WeekdayIndex>,
  restDay: WeekdayIndex,
  override?: WeeklySchedulePreference,
): number {
  let score = 0;

  score += Math.abs(assignment.longBike - 5) * 80;
  score += Math.abs(assignment.longRunSwim - 6) * 80;

  score += Math.abs(assignment.quality - 1) * 8;
  score += Math.abs(assignment.support - 3) * 4;
  score += Math.abs(assignment.easyRunStrength - 2) * 5;
  score += Math.abs(assignment.qualityRunStrength - 4) * 5;

  for (const longRole of ['longBike', 'longRunSwim'] as const) {
    if (cyclicWeekdayDistance(assignment.quality, assignment[longRole]) === 1) score += 35;
  }

  if (cyclicWeekdayDistance(assignment.qualityRunStrength, assignment.longRunSwim) === 1) score += 22;
  if (cyclicWeekdayDistance(assignment.easyRunStrength, assignment.longRunSwim) === 1) score += 12;
  if (cyclicWeekdayDistance(assignment.easyRunStrength, assignment.qualityRunStrength) === 1) score += 18;
  if (cyclicWeekdayDistance(assignment.quality, assignment.support) === 1) score += 8;

  if ((assignment.quality + 1) % 7 === restDay) score -= 10;
  if (assignment.support === 0 && assignment.longRunSwim === 6) score -= 8;
  if (assignment.easyRunStrength === 0 && assignment.longRunSwim === 6) score += 18;
  if (assignment.qualityRunStrength === 0 && assignment.longRunSwim === 6) score += 30;

  // Explicit recurring weekday preferences shape the AUTOMATIC scaffold rather
  // than being pasted over it after the fact. This lets the remaining roles
  // reflow coherently around a partial override such as:
  //   Sunday rest + swims on Monday / Wednesday / Friday.
  //
  // A preference is strong but not impossible: if an athlete supplies fewer
  // preferred weekdays than the requested discipline frequency, the solver can
  // still use additional legal days.
  const preferred = override?.preferredDays;
  const available = override?.availableDays;
  score += automaticRoleAvailabilityPenalty(assignment.quality, available?.swim);
  score += automaticRoleAvailabilityPenalty(assignment.support, available?.swim);
  score += automaticRoleAvailabilityPenalty(assignment.longRunSwim, available?.swim);
  score += automaticRoleAvailabilityPenalty(assignment.quality, available?.bike);
  score += automaticRoleAvailabilityPenalty(assignment.support, available?.bike);
  score += automaticRoleAvailabilityPenalty(assignment.longBike, available?.bike);
  score += automaticRoleAvailabilityPenalty(assignment.easyRunStrength, available?.run);
  score += automaticRoleAvailabilityPenalty(assignment.qualityRunStrength, available?.run);
  score += automaticRoleAvailabilityPenalty(assignment.longRunSwim, available?.run);
  score += automaticRoleAvailabilityPenalty(assignment.easyRunStrength, available?.strength);
  score += automaticRoleAvailabilityPenalty(assignment.qualityRunStrength, available?.strength);

  score += automaticRolePreferencePenalty(assignment.quality, preferred?.swim);
  score += automaticRolePreferencePenalty(assignment.support, preferred?.swim);
  score += automaticRolePreferencePenalty(assignment.longRunSwim, preferred?.swim);

  score += automaticRolePreferencePenalty(assignment.quality, preferred?.bike);
  score += automaticRolePreferencePenalty(assignment.support, preferred?.bike);
  score += automaticRolePreferencePenalty(assignment.longBike, preferred?.bike);

  score += automaticRolePreferencePenalty(assignment.easyRunStrength, preferred?.run);
  score += automaticRolePreferencePenalty(assignment.qualityRunStrength, preferred?.run);
  score += automaticRolePreferencePenalty(assignment.longRunSwim, preferred?.run);

  score += automaticRolePreferencePenalty(assignment.easyRunStrength, preferred?.strength);
  score += automaticRolePreferencePenalty(assignment.qualityRunStrength, preferred?.strength);

  if (override?.groupSwimDays?.length
    && !override.groupSwimDays.includes(assignment.quality)) {
    score += 500;
  }

  if (override?.hardBikeDay !== undefined && assignment.quality !== override.hardBikeDay) {
    score += 600;
  }
  if (override?.longBikeDay !== undefined && assignment.longBike !== override.longBikeDay) {
    score += 600;
  }
  if (override?.hardRunDay !== undefined
    && assignment.qualityRunStrength !== override.hardRunDay) {
    score += 600;
  }
  if (override?.longRunDay !== undefined && assignment.longRunSwim !== override.longRunDay) {
    score += 600;
  }

  return score;
}

function automaticRoleAvailabilityPenalty(
  weekday: WeekdayIndex,
  available: WeekdayIndex[] | undefined,
): number {
  if (!available?.length) return 0;
  return available.includes(weekday) ? 0 : 10_000;
}

function automaticRolePreferencePenalty(
  weekday: WeekdayIndex,
  preferred: WeekdayIndex[] | undefined,
): number {
  if (!preferred?.length) return 0;
  return preferred.includes(weekday) ? 0 : 220;
}

function cyclicWeekdayDistance(left: WeekdayIndex, right: WeekdayIndex): number {
  const direct = Math.abs(left - right);
  return Math.min(direct, 7 - direct);
}

function permutations(values: WeekdayIndex[]): WeekdayIndex[][] {
  if (values.length <= 1) return [values];
  const result: WeekdayIndex[][] = [];
  values.forEach((value, index) => {
    const remaining = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(remaining)) result.push([value, ...tail]);
  });
  return result;
}

function weeklyStructurePlacementScore({
  offset,
  discipline,
  template,
  sessions,
  input,
  structure,
}: {
  offset: number;
  discipline: TrainableDiscipline;
  template: SessionTemplate;
  sessions: WholeAthletePlannedSession[];
  input: WholeAthleteWeeklyPlannerInput;
  structure: WeeklySchedulePreference | null;
}): number {
  if (!structure) return 0;

  if (structure.restDays?.includes(offset as WeekdayIndex)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  const preferred = structure.preferredDays?.[discipline];
  if (preferred?.length) {
    score += preferred.includes(offset as WeekdayIndex) ? 34 : -24;
  }

  const hard = template.intensity === 'hard' || template.intensity === 'max';
  const long = template.title.toLowerCase().includes('long');
  const existingCount = sessions.filter((session) => session.discipline === discipline).length;

  if (discipline === 'bike') {
    if (long && structure.longBikeDay !== undefined) {
      score += offset === structure.longBikeDay ? 52 : -28;
    } else if (hard && structure.hardBikeDay !== undefined) {
      score += offset === structure.hardBikeDay ? 48 : -24;
    } else if (!hard && !long && preferred?.length) {
      const supportBikeDays = preferred.filter(
        (day) => day !== structure.hardBikeDay && day !== structure.longBikeDay,
      );
      const occupiedBikeDays = new Set(
        sessions
          .filter((session) => session.discipline === 'bike')
          .map((session) => dayOffset(input.weekStartDate, session.date)),
      );
      const target = supportBikeDays.find((day) => !occupiedBikeDays.has(day))
        ?? supportBikeDays[0]
        ?? preferred[0];
      if (target !== undefined) {
        score += offset === target ? 54 : -16;
      }
    }
  }

  if (discipline === 'run') {
    if (long && structure.longRunDay !== undefined) {
      score += offset === structure.longRunDay ? 48 : -24;
    } else if (hard && structure.hardRunDay !== undefined) {
      score += offset === structure.hardRunDay ? 48 : -24;
    } else if (input.returnToRun || input.recentBoneStress || input.health.boneStress === 'recent') {
      const protectedOrder: WeekdayIndex[] = [2, 4, 6];
      const target = protectedOrder[Math.min(existingCount, protectedOrder.length - 1)];
      score += offset === target ? 30 : 0;
    } else if (!hard && !long && preferred?.length) {
      score += offset === preferred[0] ? 22 : 0;
    }
  }

  if (discipline === 'swim') {
    const groupDays = structure.groupSwimDays ?? [];
    if (template.intensity === 'moderate' || hard) {
      score += groupDays.includes(offset as WeekdayIndex) ? 40 : -12;
    } else if (preferred?.length) {
      const easySwimOrder = preferred.filter((day) => !groupDays.includes(day));
      const existingEasySwims = sessions.filter(
        (session) => session.discipline === 'swim'
          && session.intensity !== 'moderate'
          && session.intensity !== 'hard'
          && session.intensity !== 'max',
      ).length;
      const target = easySwimOrder[Math.min(existingEasySwims, Math.max(0, easySwimOrder.length - 1))];
      if (target !== undefined) score += offset === target ? 38 : -6;
    }
  }

  if (discipline === 'strength' && preferred?.length) {
    const target = preferred[Math.min(existingCount, preferred.length - 1)];
    score += offset === target ? 28 : 0;
  }

  return score;
}

function dayOffset(weekStartDate: string, date: string): WeekdayIndex {
  const raw = dayDifference(weekStartDate, date);
  return clampInt(raw, 0, 6) as WeekdayIndex;
}

function isCompatibleSameDayPair(
  existing: WholeAthletePlannedSession,
  discipline: TrainableDiscipline,
  template: SessionTemplate,
): boolean {
  const candidateHard = template.intensity === 'hard' || template.intensity === 'max';
  const existingHard = isHard(existing);

  if (existing.discipline === 'rest' || existing.discipline === 'mobility') return true;

  const swimStrength = (
    (existing.discipline === 'swim' && discipline === 'strength')
    || (existing.discipline === 'strength' && discipline === 'swim')
  );
  if (swimStrength) return !(candidateHard && existingHard);

  const longRunStrength = (
    existing.discipline === 'run'
    && discipline === 'strength'
    && /\blong\b/i.test(existing.title)
    && !candidateHard
  ) || (
    existing.discipline === 'strength'
    && discipline === 'run'
    && /\blong\b/i.test(template.title)
    && !existingHard
  );
  if (longRunStrength) return true;

  if (existing.discipline === 'swim' && discipline === 'bike') {
    return existing.recoveryCost <= 2;
  }

  if (existing.discipline === 'swim' && discipline === 'run') {
    return !candidateHard && existing.recoveryCost <= 2;
  }

  if (discipline === 'swim' && existing.discipline === 'bike') {
    return template.intensity !== 'hard' && template.intensity !== 'max' && existing.recoveryCost <= 4;
  }

  if (discipline === 'swim' && existing.discipline === 'run') {
    return !candidateHard && template.intensity === 'easy' && existing.recoveryCost <= 3;
  }

  return false;
}

function isKeyLowerBodySession(session: UnifiedTrainingSession): boolean {
  if (session.discipline !== 'bike' && session.discipline !== 'run') return false;
  return session.keySession
    || isHard(session)
    || session.recoveryCost >= 4
    || /\blong\b/i.test(session.title);
}

function isLowLoadSession(session: UnifiedTrainingSession): boolean {
  return session.recoveryCost <= 2
    && session.lowerBodyDemand !== 'high'
    && !isHard(session);
}

function assessDoubleDay(
  discipline: TrainableDiscipline,
  template: SessionTemplate,
  sameDay: WholeAthletePlannedSession[],
): DoubleDayAssessment | null {
  if (sameDay.length !== 1) return null;
  const existing = sameDay[0]!;
  if (!isTrainableDiscipline(existing.discipline) || existing.discipline === discipline) return null;
  const candidateHard = template.intensity === 'hard' || template.intensity === 'max';
  if (candidateHard && isHard(existing)) return null;

  const pair = new Set<TrainableDiscipline>([discipline, existing.discipline]);
  const athleteCommitted = existing.planningCommitment === 'fixed' || existing.planningCommitment === 'preferred';
  const label = friendlyDiscipline(existing.discipline);

  if (pair.has('swim')) {
    return {
      score: athleteCommitted ? 7 : -2,
      rationale: athleteCommitted
        ? `Intentional double day: paired with the athlete's ${label.toLowerCase()} commitment because swimming adds little impact and this preserves another lower-load day.`
        : `Intentional double day: paired with ${label.toLowerCase()} to consolidate training while preserving another lower-load day.`,
    };
  }

  if (pair.has('bike') && pair.has('run')) {
    if (candidateHard || isHard(existing) || existing.recoveryCost >= 4) return null;
    return {
      score: athleteCommitted ? 2 : -8,
      rationale: athleteCommitted
        ? `Intentional double day: paired with the athlete's ${label.toLowerCase()} commitment while keeping both endurance sessions controlled.`
        : 'Intentional double day: bike and run are paired to consolidate aerobic work; neither session should become harder because they share a day.',
    };
  }

  if (pair.has('strength') && pair.has('run')) {
    const longRunPair = (
      (discipline === 'run' && /\\blong\\b/i.test(template.title))
      || (existing.discipline === 'run' && /\\blong\\b/i.test(existing.title))
    );
    const strengthIsControlled = (
      (discipline === 'strength' && !candidateHard)
      || (existing.discipline === 'strength' && !isHard(existing))
    );

    if (longRunPair && strengthIsControlled) {
      return {
        score: athleteCommitted ? 3 : 1,
        rationale: athleteCommitted
          ? `Intentional double day: paired the long run with the athlete's ${label.toLowerCase()} commitment to consolidate lower-body load and preserve recovery space.`
          : 'Intentional double day: long run and controlled strength are consolidated on the same day so the surrounding bike and run quality days stay protected.',
      };
    }
  }

  if (pair.has('strength') && (pair.has('bike') || pair.has('run'))) {
    if (candidateHard || isHard(existing) || existing.lowerBodyDemand === 'high' || template.intensity !== 'easy') return null;
    return {
      score: athleteCommitted ? -2 : -12,
      rationale: athleteCommitted
        ? `Intentional double day: low-load strength is paired with the athlete's ${label.toLowerCase()} commitment so the commitment stays intact without adding another training day.`
        : 'Intentional double day: low-load strength is paired with easy endurance work to preserve a separate recovery day.',
    };
  }

  return null;
}


function createGeneratedSession({
  date,
  discipline,
  template,
  index,
  planningState,
  doubleDayRationale,
}: {
  date: string;
  discipline: TrainableDiscipline;
  template: SessionTemplate;
  index: number;
  planningState: WholeAthletePlanningState;
  doubleDayRationale?: string;
}): WholeAthletePlannedSession {
  const intensity = template.intensity;
  const hard = intensity === 'hard' || intensity === 'max';
  const moderate = intensity === 'moderate';
  const common = {
    id: `whole_${discipline}_${date}_${index + 1}`,
    date,
    title: template.title,
    discipline,
    durationMinutes: template.durationMinutes,
    intensity,
    priority: template.keySession ? 'required' as const : 'recommended' as const,
    source: 'side_quest' as const,
    keySession: template.keySession,
    planningCommitment: 'generated' as const,
    rationale: generatedRationale(discipline, template, planningState, doubleDayRationale),
    healthAdjusted: planningState !== 'build',
    progressionTarget: template.progressionTarget,
  };

  if (discipline === 'swim') return {
    ...common,
    cardiovascularDemand: hard ? 'high' : moderate ? 'moderate' : 'low',
    musculoskeletalDemand: 'low',
    lowerBodyDemand: 'none',
    upperBodyDemand: hard ? 'high' : 'moderate',
    impact: 'none',
    technicalDemand: 'high',
    recoveryCost: hard ? 4 : moderate ? 2 : 1,
  };
  if (discipline === 'bike') return {
    ...common,
    cardiovascularDemand: hard ? 'high' : moderate ? 'moderate' : 'low',
    musculoskeletalDemand: hard ? 'moderate' : 'low',
    lowerBodyDemand: hard ? 'high' : 'moderate',
    upperBodyDemand: 'none',
    impact: 'none',
    technicalDemand: 'moderate',
    recoveryCost: hard ? 4 : moderate ? 3 : 1,
  };
  if (discipline === 'run') return {
    ...common,
    cardiovascularDemand: hard ? 'high' : moderate ? 'moderate' : 'low',
    musculoskeletalDemand: hard ? 'high' : 'moderate',
    lowerBodyDemand: hard ? 'high' : 'moderate',
    upperBodyDemand: 'none',
    impact: hard ? 'high' : 'moderate',
    technicalDemand: 'moderate',
    recoveryCost: hard ? 5 : moderate ? 3 : 2,
  };
  return {
    ...common,
    cardiovascularDemand: hard ? 'moderate' : 'low',
    musculoskeletalDemand: hard ? 'high' : moderate ? 'moderate' : 'low',
    lowerBodyDemand: hard ? 'high' : 'moderate',
    upperBodyDemand: 'moderate',
    impact: planningState === 'protect' ? 'low' : 'moderate',
    technicalDemand: 'moderate',
    recoveryCost: hard ? 4 : moderate ? 3 : 1,
  };
}

function generatedRationale(
  discipline: TrainableDiscipline,
  template: SessionTemplate,
  planningState: WholeAthletePlanningState,
  doubleDayRationale?: string,
): string[] {
  const rationale = [`Generated to satisfy the ${discipline} frequency target without exceeding the weekly time budget.`];
  if (template.progressionTarget) rationale.push(`This session carries the week's controlled ${template.progressionTarget.replaceAll('_', ' ')} progression.`);
  if (template.keySession) rationale.push('This is one of the small number of key sessions allowed this week.');
  if (doubleDayRationale) rationale.push(doubleDayRationale);
  if (planningState === 'hold') rationale.push('The dose is held near recent training rather than progressed.');
  if (planningState === 'protect') rationale.push('The dose is reduced or simplified to respect current health and injury-protection signals.');
  return rationale;
}

function summarizeDoubleDays(sessions: WholeAthletePlannedSession[]): DoubleDayPlanSummary[] {
  const byDate = new Map<string, WholeAthletePlannedSession[]>();
  for (const session of sessions) {
    if (!isTrainableDiscipline(session.discipline)) continue;
    const group = byDate.get(session.date) ?? [];
    group.push(session);
    byDate.set(session.date, group);
  }
  return [...byDate.entries()]
    .filter(([, day]) => day.length >= 2)
    .map(([date, day]) => {
      const explicit = day.flatMap((session) => session.rationale).find((line) => line.startsWith('Intentional double day:'));
      const athleteSpecified = day.every((session) => session.planningCommitment !== 'generated');
      return {
        date,
        sessionIds: day.map((session) => session.id),
        disciplines: day.map((session) => session.discipline).filter(isTrainableDiscipline),
        rationale: explicit ?? (athleteSpecified
          ? 'Athlete-specified double day preserved as entered.'
          : 'Double day preserved because one or more sessions are athlete commitments.'),
        athleteSpecified,
      };
    });
}

function fixedConflictWarnings(sessions: WholeAthletePlannedSession[], input: WholeAthleteWeeklyPlannerInput): string[] {
  const warnings: string[] = [];
  for (const session of sessions) {
    if (isTrainableDiscipline(session.discipline) && isDisciplineRestricted(session.discipline, input)) warnings.push(`${session.title} is fixed but conflicts with the current ${session.discipline} restriction; it was preserved for athlete review rather than silently removed.`);
    if (session.discipline === 'run' && (input.health.boneStress === 'active' || input.health.noImpact)) warnings.push(`${session.title} is a fixed impact session while impact generation is blocked; it was preserved for athlete review.`);
    if (isHard(session) && derivePlanningState(input) !== 'build') warnings.push(`${session.title} is a fixed high-load session during a ${derivePlanningState(input)} week; generated training was reduced around it.`);
  }
  return warnings;
}


function weekCoherenceWarnings(sessions: WholeAthletePlannedSession[]): string[] {
  const warnings: string[] = [];
  const trainable = sessions.filter(
    (session) => session.discipline !== 'rest' && session.discipline !== 'mobility',
  );
  const activeDates = new Set(trainable.map((session) => session.date));
  const keyLowerBody = trainable.filter(isKeyLowerBodySession).sort(sortSessions);

  for (let index = 1; index < keyLowerBody.length; index += 1) {
    const previous = keyLowerBody[index - 1]!;
    const current = keyLowerBody[index]!;
    if (Math.abs(dayDifference(previous.date, current.date)) === 1) {
      warnings.push(
        `Key lower-body sessions are stacked on ${previous.date} and ${current.date}; protect the quality of both unless the back-to-back block is intentional.`,
      );
    }
  }

  for (const strength of trainable.filter(
    (session) => session.discipline === 'strength' && session.lowerBodyDemand !== 'none',
  )) {
    const conflict = keyLowerBody.find(
      (session) => session.id !== strength.id
        && Math.abs(dayDifference(session.date, strength.date)) === 1,
    );
    if (conflict) {
      warnings.push(
        `${strength.title} sits next to ${conflict.title}; consider moving lower-body strength so it supports rather than compromises the key endurance session.`,
      );
    }
  }

  if (activeDates.size === 7 && trainable.length >= 7) {
    warnings.push(
      'Training occupies all seven days. Prefer a compatible double-session day when possible so the week retains at least one genuine low-load or off day.',
    );
  }

  return unique(warnings);
}

function frequencyWarnings(sessions: WholeAthletePlannedSession[], frequency: FrequencyPlan): string[] {
  const warnings: string[] = [];
  for (const discipline of TRAINABLE_DISCIPLINES) {
    const count = countDiscipline(sessions, discipline);
    if (count < frequency[discipline].min) warnings.push(`${discipline} frequency is ${count}; the current minimum target is ${frequency[discipline].min}.`);
    if (count > frequency[discipline].max) warnings.push(`${discipline} frequency is ${count}; this exceeds the configured maximum of ${frequency[discipline].max}.`);
  }
  return warnings;
}

function isDisciplineRestricted(discipline: TrainableDiscipline, input: WholeAthleteWeeklyPlannerInput): boolean {
  if (input.health.restrictedDisciplines?.includes(discipline)) return true;
  if (discipline === 'run' && (input.health.boneStress === 'active' || input.health.noImpact)) return true;
  return false;
}

function hardSessionDisciplineOrder(goal: PerformanceGoalType): TrainableDiscipline[] {
  if (goal === 'swim_speed') return ['swim', 'strength'];
  if (goal === 'road_10k' || goal === 'road_half_marathon' || goal === 'road_marathon' || goal === 'trail_50k' || goal === 'trail_100k') return ['run', 'strength'];
  if (goal === 'general_offseason') return ['strength'];
  if (goal === 'swimrun') return ['run', 'swim'];
  return ['bike', 'run', 'swim', 'strength'];
}

function disciplineOrder(goal: PerformanceGoalType): TrainableDiscipline[] {
  if (goal === 'swim_speed') return ['swim', 'strength', 'bike', 'run'];
  if (goal === 'road_10k' || goal === 'road_half_marathon' || goal === 'road_marathon' || goal === 'trail_50k' || goal === 'trail_100k') return ['run', 'strength', 'bike', 'swim'];
  if (goal === 'general_offseason') return ['strength', 'bike', 'swim', 'run'];
  if (goal === 'swimrun') return ['run', 'swim', 'strength', 'bike'];
  return ['bike', 'run', 'swim', 'strength'];
}

function progressionTargetFor(
  discipline: TrainableDiscipline,
  budget: ProgressionBudget,
): ProgressionDomain | undefined {
  const candidates: ProgressionDomain[] = discipline === 'strength'
    ? ['strength_intensity', 'strength_volume']
    : [progressionDomainFor(discipline)];
  return candidates.find((candidate) => budget.primary === candidate || budget.secondary === candidate);
}

function progressionDomainFor(discipline: TrainableDiscipline): ProgressionDomain {
  if (discipline === 'swim') return 'swim_volume';
  if (discipline === 'bike') return 'bike_volume';
  if (discipline === 'run') return 'run_volume';
  return 'strength_volume';
}

function capSessionIntensity(session: UnifiedTrainingSession, intensity: 'easy' | 'moderate'): UnifiedTrainingSession {
  const recoveryCost = intensity === 'easy' ? Math.min(session.recoveryCost, 2) : Math.min(session.recoveryCost, 3);
  return {
    ...session,
    intensity,
    cardiovascularDemand: intensity === 'easy' && session.cardiovascularDemand === 'high' ? 'moderate' : session.cardiovascularDemand,
    musculoskeletalDemand: intensity === 'easy' && session.musculoskeletalDemand === 'high' ? 'moderate' : session.musculoskeletalDemand,
    lowerBodyDemand: intensity === 'easy' && session.lowerBodyDemand === 'high' ? 'moderate' : session.lowerBodyDemand,
    upperBodyDemand: intensity === 'easy' && session.upperBodyDemand === 'high' ? 'moderate' : session.upperBodyDemand,
    recoveryCost: recoveryCost as 0 | 1 | 2 | 3 | 4 | 5,
    keySession: false,
  };
}

function fitDuration(requested: number, discipline: TrainableDiscipline, remainingBudget: number): number | null {
  if (remainingBudget < MIN_DURATION[discipline]) return null;
  const fitted = Math.min(requested, Math.floor(remainingBudget));
  if (discipline === 'strength') return Math.max(MIN_DURATION[discipline], fitted);
  return Math.max(MIN_DURATION[discipline], Math.floor(fitted / 5) * 5);
}

function frequencyPlan(
  swim: [number, number, number],
  bike: [number, number, number],
  run: [number, number, number],
  strength: [number, number, number],
): FrequencyPlan {
  return {
    swim: { min: swim[0], preferred: swim[1], max: swim[2] },
    bike: { min: bike[0], preferred: bike[1], max: bike[2] },
    run: { min: run[0], preferred: run[1], max: run[2] },
    strength: { min: strength[0], preferred: strength[1], max: strength[2] },
  };
}

function inWeek<T extends UnifiedTrainingSession>(sessions: T[], start: string, end: string): T[] {
  return sessions.filter((session) => session.date >= start && session.date <= end);
}

function countDiscipline(sessions: UnifiedTrainingSession[], discipline: TrainableDiscipline): number {
  return sessions.filter((session) => session.discipline === discipline).length;
}

function totalMinutes(sessions: Array<Pick<UnifiedTrainingSession, 'durationMinutes'>>): number {
  return sessions.reduce((sum, session) => sum + Math.max(0, session.durationMinutes), 0);
}

function isHard(session: Pick<UnifiedTrainingSession, 'intensity'>): boolean {
  return session.intensity === 'hard' || session.intensity === 'max';
}

function isTrainableDiscipline(discipline: UnifiedDiscipline): discipline is TrainableDiscipline {
  return discipline === 'swim' || discipline === 'bike' || discipline === 'run' || discipline === 'strength';
}

function friendlyDiscipline(discipline: TrainableDiscipline): string {
  if (discipline === 'swim') return 'Swim';
  if (discipline === 'bike') return 'Bike';
  if (discipline === 'run') return 'Run';
  return 'Strength';
}

function sortSessions(left: WholeAthletePlannedSession, right: WholeAthletePlannedSession): number {
  return left.date.localeCompare(right.date) || commitmentRank(left.planningCommitment) - commitmentRank(right.planningCommitment) || left.title.localeCompare(right.title);
}

function commitmentRank(commitment: PlanningCommitment): number {
  if (commitment === 'fixed') return 0;
  if (commitment === 'preferred') return 1;
  return 2;
}

function dayDifference(left: string, right: string): number {
  const leftDate = Date.parse(`${left}T12:00:00Z`);
  const rightDate = Date.parse(`${right}T12:00:00Z`);
  return Math.round((rightDate - leftDate) / 86_400_000);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function roundToFive(value: number): number {
  return Math.max(0, Math.round(value / 5) * 5);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.round(clamp(value, minimum, maximum));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
