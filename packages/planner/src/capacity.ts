import type { PerformanceGoalType, TrainingPhase } from '@circuit/domain';

export type RunStatus = 'normal' | 'reduced' | 'return_to_run' | 'not_running';
export type Proficiency = 'developing' | 'average' | 'strong';
export type StrengthSessionRole = 'heavy' | 'moderate' | 'upper_body' | 'stability' | 'maintenance';

export interface AthleteCapacityProfile {
  totalWeeklyHours: number;
  currentEnduranceHours: number;
  runStatus: RunStatus;
  maxRunMilesLast12Weeks: number;
  boneStressInjuryHistory: 'none' | 'remote' | 'recent_or_current';
  swimProficiency: Proficiency;
  bikeProficiency: Proficiency;
  runProficiency: Proficiency;
  strengthExperience: 'beginner' | 'intermediate' | 'advanced';
}

export interface TrainingBudgetItem {
  hours: number;
  priority: 'required' | 'recommended' | 'optional';
}

export interface StrengthDoseRecommendation {
  sessionsPerWeek: 2 | 3 | 4 | 5;
  minutesPerWeek: number;
  sessionMinutes: 24 | 32 | 40 | 48;
  minimumEffectiveMinutes: number;
  maximumRecommendedMinutes: number;
  maxHighLoadStrengthDays: 1 | 2 | 3;
  maxTotalHardDays: 3 | 4;
  sessionRoles: StrengthSessionRole[];
  rationale: string[];
  safeguards: string[];
  phaseSchedule: Record<TrainingPhase, 0 | 1 | 2 | 3 | 4 | 5>;
  weeklyAllocationHours: { strength: number; swim: number; bike: number; run: number; recoveryMargin: number };
  trainingBudget: { strength: TrainingBudgetItem; swim: TrainingBudgetItem; bike: TrainingBudgetItem; run: TrainingBudgetItem };
  validationErrors: string[];
  validationWarnings: string[];
}

export function recommendStrengthDose(input: AthleteCapacityProfile, goalType: PerformanceGoalType, weeksUntilEvent: number): StrengthDoseRecommendation {
  const validationErrors = validateCapacityProfile(input);
  const validationWarnings: string[] = [];
  const hours = clamp(input.totalWeeklyHours, 2, 30);
  const endurance = clamp(input.currentEnduranceHours, 0, hours);
  const openHours = Math.max(0, hours - endurance);
  const returnToRun = input.runStatus === 'return_to_run' || input.runStatus === 'not_running';
  const recentBoneStress = input.boneStressInjuryHistory === 'recent_or_current';
  const offseason = goalType === 'general_offseason';
  const farFromRace = offseason || weeksUntilEvent >= 13;

  let sessions: 2 | 3 | 4 | 5 = hours < 6 ? 2 : hours < 10 ? 3 : 4;
  if (farFromRace && openHours >= 3.5 && input.strengthExperience !== 'beginner') sessions = 5;
  if (recentBoneStress || returnToRun) sessions = Math.max(sessions, openHours >= 3 ? 4 : 3) as 3 | 4 | 5;
  if (!offseason && weeksUntilEvent <= 6) sessions = Math.min(sessions, 3) as 2 | 3;
  if (!offseason && weeksUntilEvent <= 3) sessions = 2;
  if (endurance >= hours * 0.85) sessions = 2;

  const developmentBand = input.strengthExperience === 'beginner' ? [72, 120] : [96, 168];
  const phaseMultiplier = offseason || weeksUntilEvent >= 13 ? 1 : weeksUntilEvent >= 7 ? 0.8 : weeksUntilEvent >= 4 ? 0.6 : 0.35;
  const maximumByTime = Math.floor(openHours * 60);
  const maximumRecommendedMinutes = Math.max(48, Math.min(developmentBand[1], maximumByTime || 48, Math.floor(hours * 60 * 0.25)));
  const minimumEffectiveMinutes = hours < 6 ? 48 : 60;
  const targetMinutes = clamp(Math.round(developmentBand[0] * phaseMultiplier), minimumEffectiveMinutes, maximumRecommendedMinutes);
  const sessionMinutes = nearestSessionDuration(targetMinutes / sessions);
  let minutesPerWeek = sessions * sessionMinutes;
  if (minutesPerWeek > maximumRecommendedMinutes) {
    sessions = Math.max(2, Math.floor(maximumRecommendedMinutes / 24)) as 2 | 3 | 4 | 5;
    minutesPerWeek = sessions * 24;
  }

  const maxHighLoadStrengthDays: 1 | 2 | 3 = !offseason && weeksUntilEvent <= 3
    ? 1
    : input.strengthExperience === 'advanced' && offseason && !recentBoneStress
      ? 3
      : 2;
  const maxTotalHardDays: 3 | 4 = hours >= 12 && input.strengthExperience !== 'beginner' ? 4 : 3;
  const sessionRoles = buildSessionRoles(sessions, maxHighLoadStrengthDays, recentBoneStress || returnToRun, weeksUntilEvent, offseason);

  const phaseSchedule: StrengthDoseRecommendation['phaseSchedule'] = {
    offseason: sessions,
    base: Math.min(sessions, 5) as 2 | 3 | 4 | 5,
    build: Math.min(sessions, 4) as 2 | 3 | 4,
    peak: Math.min(sessions, 3) as 2 | 3,
    taper: 2,
    race_week: 1,
  };
  if (recentBoneStress && returnToRun) {
    phaseSchedule.offseason = Math.max(phaseSchedule.offseason, 4) as 4 | 5;
    phaseSchedule.base = Math.max(phaseSchedule.base, 4) as 4 | 5;
  }

  const strengthHours = minutesPerWeek / 60;
  const enduranceBudget = Math.max(0, hours - strengthHours);
  const active = disciplinesForGoal(goalType);
  const weights = {
    swim: active.includes('swim') ? proficiencyWeight(input.swimProficiency) : 0,
    bike: active.includes('bike') ? proficiencyWeight(input.bikeProficiency) : 0,
    run: active.includes('run') ? proficiencyWeight(input.runProficiency) : 0,
  };
  if (returnToRun && weights.run > 0) weights.run *= 0.55;
  const totalWeight = weights.swim + weights.bike + weights.run;
  const raw = {
    swim: totalWeight ? enduranceBudget * weights.swim / totalWeight : 0,
    bike: totalWeight ? enduranceBudget * weights.bike / totalWeight : 0,
    run: totalWeight ? enduranceBudget * weights.run / totalWeight : 0,
  };
  const weeklyAllocationHours = {
    strength: roundQuarter(strengthHours),
    swim: roundQuarter(raw.swim),
    bike: roundQuarter(raw.bike),
    run: roundQuarter(raw.run),
    recoveryMargin: 0,
  };
  const used = weeklyAllocationHours.strength + weeklyAllocationHours.swim + weeklyAllocationHours.bike + weeklyAllocationHours.run;
  weeklyAllocationHours.recoveryMargin = Math.max(0, roundQuarter(hours - used));

  if (input.currentEnduranceHours > input.totalWeeklyHours) validationErrors.push('Current endurance hours cannot exceed total weekly training hours.');
  if (openHours < minimumEffectiveMinutes / 60) validationWarnings.push('Available time is below the usual minimum effective strength dose; the plan will prioritize short maintenance sessions.');
  if (recentBoneStress && input.runStatus === 'normal') validationWarnings.push('Recent/current bone-stress history with normal running status should be reviewed before aggressive run or impact progression.');
  if (returnToRun && input.maxRunMilesLast12Weeks === 0) validationWarnings.push('No recent run-mileage baseline was entered; running progression should remain conservative.');

  const safeguards = [
    `Limit true high-load strength to ${maxHighLoadStrengthDays} day${maxHighLoadStrengthDays === 1 ? '' : 's'} per week.`,
    `Keep total high-load days across strength and endurance at or below ${maxTotalHardDays} in most weeks.`,
    'Do not increase run volume, lower-body strength volume, and plyometric load in the same week.',
    'Missed heavy sessions should be skipped or shortened rather than compressed into adjacent days.',
  ];
  if (recentBoneStress || returnToRun) safeguards.push('Keep impact progression separate from heavy lower-body progression and preserve recovery days between loading exposures.');

  const rationale = [
    `${hours.toFixed(1)} total weekly hours with ${openHours.toFixed(1)} hours not already assigned to endurance training.`,
    `${minutesPerWeek} strength minutes fit within a recommended ceiling of ${maximumRecommendedMinutes} minutes for this phase and time budget.`,
    recentBoneStress ? 'Recent bone-stress history favors progressive strength development while running returns conservatively.' : 'No recent bone-stress constraint was reported.',
    returnToRun ? 'Current run status supports more early strength support, followed by fewer sessions as running rises.' : 'Strength frequency declines as race-specific endurance demand increases.',
  ];

  const trainingBudget = {
    strength: { hours: weeklyAllocationHours.strength, priority: 'required' as const },
    swim: { hours: weeklyAllocationHours.swim, priority: active.includes('swim') ? 'required' as const : 'optional' as const },
    bike: { hours: weeklyAllocationHours.bike, priority: active.includes('bike') ? 'required' as const : 'optional' as const },
    run: { hours: weeklyAllocationHours.run, priority: active.includes('run') && !returnToRun ? 'required' as const : active.includes('run') ? 'recommended' as const : 'optional' as const },
  };

  return { sessionsPerWeek: sessions, minutesPerWeek, sessionMinutes, minimumEffectiveMinutes, maximumRecommendedMinutes, maxHighLoadStrengthDays, maxTotalHardDays, sessionRoles, rationale, safeguards, phaseSchedule, weeklyAllocationHours, trainingBudget, validationErrors: [...new Set(validationErrors)], validationWarnings: [...new Set(validationWarnings)] };
}

export function validateCapacityProfile(input: AthleteCapacityProfile): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.totalWeeklyHours) || input.totalWeeklyHours < 2) errors.push('Enter at least 2 total weekly training hours.');
  if (input.totalWeeklyHours > 30) errors.push('Total weekly training hours must be 30 or less.');
  if (!Number.isFinite(input.currentEnduranceHours) || input.currentEnduranceHours < 0) errors.push('Current endurance hours cannot be negative.');
  if (input.currentEnduranceHours > input.totalWeeklyHours) errors.push('Current endurance hours cannot exceed total weekly training hours.');
  if (!Number.isFinite(input.maxRunMilesLast12Weeks) || input.maxRunMilesLast12Weeks < 0) errors.push('Recent run mileage cannot be negative.');
  if (input.maxRunMilesLast12Weeks > 150) errors.push('Recent run mileage appears implausibly high; enter the highest weekly mileage, not a 12-week total.');
  return [...new Set(errors)];
}

export function sessionsForPhase(recommendation: StrengthDoseRecommendation | undefined, phase: TrainingPhase, fallback: 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 | 5 {
  const value = recommendation?.phaseSchedule?.[phase] ?? fallback;
  return Math.max(1, value) as 1 | 2 | 3 | 4 | 5;
}

function buildSessionRoles(sessions: 2 | 3 | 4 | 5, maxHigh: number, protectedReturn: boolean, weeksUntilEvent: number, offseason: boolean): StrengthSessionRole[] {
  const roles: StrengthSessionRole[] = [];
  const highCount = weeksUntilEvent <= 4 && !offseason ? 0 : Math.min(maxHigh, sessions >= 4 ? 2 : 1);
  for (let index = 0; index < highCount; index += 1) roles.push('heavy');
  if (roles.length < sessions && weeksUntilEvent > 3) roles.push('moderate');
  if (roles.length < sessions) roles.push('upper_body');
  if (roles.length < sessions) roles.push(protectedReturn ? 'stability' : 'maintenance');
  while (roles.length < sessions) roles.push('maintenance');
  return roles.slice(0, sessions);
}

function nearestSessionDuration(value: number): 24 | 32 | 40 | 48 {
  const options = [24, 32, 40, 48] as const;
  return options.reduce((best, option) => Math.abs(option - value) < Math.abs(best - value) ? option : best, options[0]);
}
function proficiencyWeight(value: Proficiency) { return value === 'developing' ? 1.3 : value === 'strong' ? 0.85 : 1; }
function roundQuarter(value: number) { return Math.round(value * 4) / 4; }
function disciplinesForGoal(goalType: PerformanceGoalType): Array<'swim' | 'bike' | 'run'> {
  if (goalType.startsWith('triathlon_') || goalType === 'ironman_70_3' || goalType === 'ironman_full') return ['swim', 'bike', 'run'];
  if (goalType === 'swimrun') return ['swim', 'run'];
  if (goalType === 'swim_speed') return ['swim'];
  if (goalType === 'general_offseason') return [];
  return ['run'];
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
