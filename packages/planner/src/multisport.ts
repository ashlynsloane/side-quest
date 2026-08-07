import type { EnduranceDiscipline, PerformanceGoal, TrainingPhase, Weekday } from '@circuit/domain';

export type MultisportDiscipline = EnduranceDiscipline | 'strength' | 'recovery' | 'rest';
export type SessionOwnership = 'fixed' | 'preferred' | 'generated';
export type SessionIntensity = 'easy' | 'moderate' | 'hard';
export type SessionPriority = 'support' | 'key';

export interface WeeklyAvailabilityWindow {
  day: Weekday;
  minutes: number;
  available: boolean;
}

export interface FixedMultisportSession {
  id: string;
  day: Weekday;
  discipline: MultisportDiscipline;
  title: string;
  durationMinutes: number;
  intensity?: SessionIntensity;
  priority?: SessionPriority;
  timeOfDay?: 'morning' | 'midday' | 'evening';
  notes?: string;
}

export interface MultisportPreferences {
  preferredSessionsPerWeek?: Partial<Record<MultisportDiscipline, number>>;
  preferredDays?: Partial<Record<MultisportDiscipline, Weekday[]>>;
  avoidDays?: Weekday[];
  longRideDay?: Weekday;
  longRunDay?: Weekday;
}

export interface MultisportHealthConstraints {
  runStatus: 'normal' | 'reduced' | 'return_to_run' | 'not_running';
  boneStressInjuryHistory?: 'none' | 'remote' | 'recent_or_current';
  maxHardDaysPerWeek?: 2 | 3 | 4;
  maxStrengthDaysPerWeek?: 1 | 2 | 3 | 4;
  avoidImpact?: boolean;
}

export interface MultisportWeekRequest {
  goal: PerformanceGoal;
  weekStartDate: string;
  phase: TrainingPhase;
  availability: WeeklyAvailabilityWindow[];
  fixedSessions?: FixedMultisportSession[];
  preferences?: MultisportPreferences;
  health: MultisportHealthConstraints;
}

export interface PlannedMultisportSession {
  id: string;
  date: string;
  day: Weekday;
  discipline: MultisportDiscipline;
  title: string;
  durationMinutes: number;
  intensity: SessionIntensity;
  priority: SessionPriority;
  ownership: SessionOwnership;
  rationale: string[];
  timeOfDay?: 'morning' | 'midday' | 'evening';
  sourceSessionId?: string;
}

export interface MultisportWeekPlan {
  id: string;
  weekStartDate: string;
  phase: TrainingPhase;
  sessions: PlannedMultisportSession[];
  warnings: string[];
  decisions: string[];
}

type GeneratedTask = {
  discipline: Exclude<MultisportDiscipline, 'recovery' | 'rest'>;
  ordinal: number;
  totalMissing: number;
  role: GeneratedRole;
};

type GeneratedRole = {
  title: string;
  intensity: SessionIntensity;
  priority: SessionPriority;
};

const DAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DAY_INDEX = new Map(DAYS.map((day, index) => [day, index]));
const LAND_DISCIPLINES = new Set<MultisportDiscipline>(['bike', 'run', 'strength']);

export function generateMultisportWeek(request: MultisportWeekRequest): MultisportWeekPlan {
  const warnings: string[] = [];
  const decisions: string[] = [];
  const sessions: PlannedMultisportSession[] = normalizeFixedSessions(request);

  if (request.health.runStatus === 'not_running' || request.health.avoidImpact) {
    decisions.push('Running generation is disabled by the current impact constraint.');
  }
  if (request.health.boneStressInjuryHistory === 'recent_or_current') {
    decisions.push('Recent/current bone-stress history keeps impact progression conservative.');
  }

  const tasks = buildGeneratedTasks(request, sessions);
  for (const task of tasks) {
    const candidate = placeGeneratedSession(request, sessions, task);
    if (candidate) {
      sessions.push(candidate);
    } else {
      warnings.push(`Could not place another ${task.discipline} session without violating current availability, recovery, or spacing rules.`);
    }
  }

  addRecoveryIfNeeded(request, sessions, decisions);
  sessions.sort(compareSessions);

  const hardDays = uniqueDays(sessions.filter((session) => session.intensity === 'hard'));
  const hardLimit = request.health.maxHardDaysPerWeek ?? 3;
  if (hardDays.length > hardLimit) {
    warnings.push(`This week contains ${hardDays.length} hard days; current limit is ${hardLimit}. Review fixed sessions or reduce intensity.`);
  }

  return {
    id: `multisport_${hash(`${request.goal.id}:${request.weekStartDate}:${sessions.map((session) => session.id).join('|')}`)}`,
    weekStartDate: request.weekStartDate,
    phase: request.phase,
    sessions,
    warnings,
    decisions,
  };
}

function normalizeFixedSessions(request: MultisportWeekRequest): PlannedMultisportSession[] {
  return (request.fixedSessions ?? []).map((session) => ({
    id: `fixed_${session.id}`,
    date: isoDateForDay(request.weekStartDate, session.day),
    day: session.day,
    discipline: session.discipline,
    title: session.title,
    durationMinutes: session.durationMinutes,
    intensity: session.intensity ?? inferFixedIntensity(session),
    priority: session.priority ?? 'key',
    ownership: 'fixed',
    rationale: ['You fixed this session, so Side Quest preserves it while planning the rest of the week.'],
    timeOfDay: session.timeOfDay,
    sourceSessionId: session.id,
  }));
}

function buildGeneratedTasks(
  request: MultisportWeekRequest,
  existing: PlannedMultisportSession[],
): GeneratedTask[] {
  const targets = sessionTargets(request);
  const disciplines: Array<GeneratedTask['discipline']> = ['swim', 'bike', 'run', 'strength'];
  const tasks: GeneratedTask[] = [];

  for (const discipline of disciplines) {
    const existingCount = existing.filter((session) => session.discipline === discipline).length;
    const target = targets[discipline];
    const missing = Math.max(0, target - existingCount);
    for (let ordinal = 0; ordinal < missing; ordinal += 1) {
      tasks.push({
        discipline,
        ordinal,
        totalMissing: missing,
        role: generatedRole(request, discipline, ordinal, missing),
      });
    }
  }

  return tasks.sort((left, right) => taskPriority(right) - taskPriority(left));
}

function taskPriority(task: GeneratedTask): number {
  let score = 0;
  if (task.role.priority === 'key') score += 100;
  if (task.role.intensity === 'hard') score += 40;
  if (task.discipline === 'bike' || task.discipline === 'run') score += 20;
  if (task.discipline === 'strength') score += 10;
  return score;
}

function sessionTargets(request: MultisportWeekRequest): Record<'swim' | 'bike' | 'run' | 'strength', number> {
  const explicit = request.preferences?.preferredSessionsPerWeek;
  const isTriathlon = request.goal.disciplines.includes('swim')
    && request.goal.disciplines.includes('bike')
    && request.goal.disciplines.includes('run');

  let swim = explicit?.swim ?? (request.goal.disciplines.includes('swim') ? (isTriathlon ? 3 : 2) : 0);
  let bike = explicit?.bike ?? (request.goal.disciplines.includes('bike') ? (isTriathlon ? 3 : 2) : 0);
  let run = explicit?.run ?? (request.goal.disciplines.includes('run') ? 3 : 0);
  let strength = explicit?.strength ?? Math.min(
    request.health.maxStrengthDaysPerWeek ?? 3,
    request.goal.phaseStrengthSessions?.[request.phase] ?? request.goal.sessionsPerWeek,
  );

  if (request.phase === 'taper') {
    swim = Math.min(swim, 3);
    bike = Math.min(bike, 3);
    run = Math.min(run, 3);
    strength = Math.min(strength, 2);
  } else if (request.phase === 'race_week') {
    strength = Math.min(strength, 1);
  }

  if (request.health.runStatus === 'not_running' || request.health.avoidImpact) run = 0;
  if (request.health.runStatus === 'return_to_run' || request.health.runStatus === 'reduced') run = Math.min(run, 2);

  return { swim, bike, run, strength };
}

function placeGeneratedSession(
  request: MultisportWeekRequest,
  current: PlannedMultisportSession[],
  task: GeneratedTask,
): PlannedMultisportSession | null {
  const candidates = candidateDays(request, task.discipline)
    .filter((day) => canFitOnDay(request, current, task, day))
    .map((day) => ({ day, score: placementScore(request, current, task, day) }))
    .sort((left, right) => right.score - left.score || dayOffset(left.day) - dayOffset(right.day));

  const selected = candidates[0]?.day;
  if (!selected) return null;

  const durationMinutes = generatedDuration(request, task.discipline, selected, task.role.priority, current);
  return {
    id: `generated_${task.discipline}_${isoDateForDay(request.weekStartDate, selected)}_${task.ordinal + 1}`,
    date: isoDateForDay(request.weekStartDate, selected),
    day: selected,
    discipline: task.discipline,
    title: task.role.title,
    durationMinutes,
    intensity: task.role.intensity,
    priority: task.role.priority,
    ownership: preferredDays(request, task.discipline).includes(selected) ? 'preferred' : 'generated',
    rationale: placementRationale(request, current, task, selected),
  };
}

function candidateDays(request: MultisportWeekRequest, discipline: MultisportDiscipline): Weekday[] {
  const available = request.availability
    .filter((window) => window.available && window.minutes > 0)
    .map((window) => window.day);
  const avoid = new Set(request.preferences?.avoidDays ?? []);
  const preferred = preferredDays(request, discipline).filter((day) => available.includes(day) && !avoid.has(day));
  const remainder = available.filter((day) => !avoid.has(day) && !preferred.includes(day));
  return [...preferred, ...remainder];
}

function canFitOnDay(
  request: MultisportWeekRequest,
  current: PlannedMultisportSession[],
  task: GeneratedTask,
  day: Weekday,
): boolean {
  const availability = request.availability.find((window) => window.day === day);
  if (!availability?.available) return false;

  const onDay = current.filter((session) => session.day === day);
  const usedMinutes = onDay.reduce((sum, session) => sum + session.durationMinutes, 0);
  if (availability.minutes < usedMinutes + minimumDuration(task.discipline)) return false;
  if (onDay.some((session) => session.discipline === task.discipline)) return false;

  // Side Quest should not invent three-a-days. Two sessions are allowed only for
  // complementary pairings (most commonly swim + one land-based session).
  if (onDay.length >= 2) return false;
  if (LAND_DISCIPLINES.has(task.discipline) && onDay.some((session) => LAND_DISCIPLINES.has(session.discipline))) {
    return false;
  }
  if (task.role.priority === 'key' && onDay.some((session) => session.priority === 'key')) return false;

  if (task.discipline === 'strength') {
    const tomorrow = dayAtOffset(day, 1);
    if (current.some((session) => session.day === tomorrow && session.priority === 'key' && (session.discipline === 'bike' || session.discipline === 'run'))) {
      return false;
    }
  }

  if ((task.discipline === 'bike' || task.discipline === 'run') && task.role.priority === 'key') {
    const yesterday = dayAtOffset(day, -1);
    if (current.some((session) => session.day === yesterday && session.discipline === 'strength')) return false;
  }

  if (task.discipline === 'run') {
    const previous = dayAtOffset(day, -1);
    const next = dayAtOffset(day, 1);
    if (current.some((session) => session.discipline === 'run' && (session.day === previous || session.day === next))) {
      return false;
    }
  }

  if (task.role.intensity === 'hard') {
    const hardDays = uniqueDays(current.filter((session) => session.intensity === 'hard'));
    const limit = request.health.maxHardDaysPerWeek ?? 3;
    if (!hardDays.includes(day) && hardDays.length >= limit) return false;
  }

  return true;
}

function placementScore(
  request: MultisportWeekRequest,
  current: PlannedMultisportSession[],
  task: GeneratedTask,
  day: Weekday,
): number {
  let score = 0;
  const onDay = current.filter((session) => session.day === day);

  if (preferredDays(request, task.discipline).includes(day)) score += 80;
  if (request.preferences?.longRideDay === day && task.discipline === 'bike' && task.ordinal === 0) score += 100;
  if (request.preferences?.longRunDay === day && task.discipline === 'run' && task.ordinal === 0) score += 100;

  if (onDay.length === 0) score += 60;
  else score -= 35 * onDay.length;

  const index = dayOffset(day);
  const sameDisciplineDistances = current
    .filter((session) => session.discipline === task.discipline)
    .map((session) => Math.abs(dayOffset(session.day) - index));
  if (sameDisciplineDistances.length) score += Math.min(...sameDisciplineDistances) * 10;

  if (task.role.priority === 'key' && (day === 'saturday' || day === 'sunday')) score += 12;
  if (task.discipline === 'strength' && onDay.some((session) => session.discipline === 'swim')) score += 8;
  if (hasAdjacentHardDay(current, day)) score -= 30;

  const adjacentOccupied = [dayAtOffset(day, -1), dayAtOffset(day, 1)]
    .filter((adjacent) => current.some((session) => session.day === adjacent)).length;
  score -= adjacentOccupied * 4;

  const availability = request.availability.find((window) => window.day === day)?.minutes ?? 0;
  score += Math.min(availability, 180) / 20;
  return score;
}

function generatedRole(
  request: MultisportWeekRequest,
  discipline: GeneratedTask['discipline'],
  ordinal: number,
  totalMissing: number,
): GeneratedRole {
  const finalGenerated = ordinal === totalMissing - 1;
  if (discipline === 'swim') {
    if (ordinal === 0) return { title: 'Swim · aerobic technique', intensity: 'easy', priority: 'support' };
    if (finalGenerated && request.phase !== 'race_week') return { title: 'Swim · endurance', intensity: 'moderate', priority: 'key' };
    return { title: 'Swim · steady aerobic', intensity: 'moderate', priority: 'support' };
  }
  if (discipline === 'bike') {
    if (ordinal === 0 && request.phase !== 'race_week') return { title: 'Bike · long aerobic endurance', intensity: 'moderate', priority: 'key' };
    if (request.phase === 'build' || request.phase === 'peak') return { title: 'Bike · quality intervals', intensity: 'hard', priority: 'key' };
    return { title: 'Bike · aerobic endurance', intensity: 'easy', priority: 'support' };
  }
  if (discipline === 'run') {
    if (request.health.runStatus === 'return_to_run') return { title: 'Run · return-to-run progression', intensity: 'easy', priority: 'support' };
    if (ordinal === 0 && request.phase !== 'race_week') return { title: 'Run · long aerobic endurance', intensity: 'moderate', priority: 'key' };
    if ((request.phase === 'build' || request.phase === 'peak') && finalGenerated) return { title: 'Run · quality intervals', intensity: 'hard', priority: 'key' };
    return { title: 'Run · easy aerobic', intensity: 'easy', priority: 'support' };
  }
  if (request.phase === 'race_week' || request.phase === 'taper') return { title: 'Strength · race support', intensity: 'easy', priority: 'support' };
  if (ordinal === 0) return { title: 'Strength · primary development', intensity: 'hard', priority: 'key' };
  return { title: 'Strength · durability and support', intensity: 'moderate', priority: 'support' };
}

function generatedDuration(
  request: MultisportWeekRequest,
  discipline: MultisportDiscipline,
  day: Weekday,
  priority: SessionPriority,
  current: PlannedMultisportSession[],
): number {
  const available = request.availability.find((window) => window.day === day)?.minutes ?? 60;
  const used = current.filter((session) => session.day === day).reduce((sum, session) => sum + session.durationMinutes, 0);
  const remaining = Math.max(minimumDuration(discipline), available - used);
  const base = discipline === 'strength'
    ? request.goal.defaultSessionMinutes
    : discipline === 'swim'
      ? 60
      : discipline === 'bike'
        ? (priority === 'key' ? 120 : 60)
        : discipline === 'run'
          ? (priority === 'key' ? 75 : 45)
          : 30;
  return Math.max(minimumDuration(discipline), Math.min(base, remaining));
}

function minimumDuration(discipline: MultisportDiscipline): number {
  if (discipline === 'strength') return 24;
  if (discipline === 'swim') return 30;
  if (discipline === 'bike') return 30;
  if (discipline === 'run') return 20;
  return 20;
}

function placementRationale(
  request: MultisportWeekRequest,
  current: PlannedMultisportSession[],
  task: GeneratedTask,
  day: Weekday,
): string[] {
  const rationale = [`Side Quest placed ${task.discipline} on ${day} to move the ${request.goal.name} plan forward.`];
  if (preferredDays(request, task.discipline).includes(day)) rationale.push('This matches one of your preferred days.');
  if (!current.some((session) => session.day === day)) rationale.push('The day was open, so this placement spreads training load instead of stacking it unnecessarily.');
  if (task.discipline === 'strength') rationale.push('Strength is kept away from the day immediately before an existing key bike or run session.');
  if (task.discipline === 'run' && request.health.runStatus === 'return_to_run') rationale.push('Return-to-run sessions are separated by at least one day.');
  if (task.role.priority === 'key') rationale.push('This is treated as a key session when balancing the rest of the week.');
  return rationale;
}

function addRecoveryIfNeeded(
  request: MultisportWeekRequest,
  sessions: PlannedMultisportSession[],
  decisions: string[],
): void {
  const occupied = new Set(sessions.map((session) => session.day));
  const openDays = DAYS.filter((day) => !occupied.has(day) && request.availability.some((window) => window.day === day && window.available));
  if (!openDays.length) return;

  const hardDays = uniqueDays(sessions.filter((session) => session.intensity === 'hard'));
  if (hardDays.length < 2) return;

  const openDay = openDays
    .map((day) => ({ day, score: recoveryScore(sessions, day) }))
    .sort((left, right) => right.score - left.score)[0]?.day;
  if (!openDay) return;

  sessions.push({
    id: `generated_recovery_${isoDateForDay(request.weekStartDate, openDay)}`,
    date: isoDateForDay(request.weekStartDate, openDay),
    day: openDay,
    discipline: 'recovery',
    title: 'Recovery / optional easy movement',
    durationMinutes: 30,
    intensity: 'easy',
    priority: 'support',
    ownership: 'generated',
    rationale: ['Recovery is prescribed deliberately after the training week has been distributed, not used as a placeholder while other days are overloaded.'],
  });
  decisions.push(`Kept ${openDay} recovery-focused because the week already contains multiple hard training days.`);
}

function recoveryScore(sessions: PlannedMultisportSession[], day: Weekday): number {
  let score = 0;
  const previous = dayAtOffset(day, -1);
  const next = dayAtOffset(day, 1);
  if (sessions.some((session) => session.day === previous && session.intensity === 'hard')) score += 30;
  if (sessions.some((session) => session.day === next && session.intensity === 'hard')) score += 15;
  if (day === 'friday' && sessions.some((session) => session.day === 'saturday' && session.priority === 'key')) score += 20;
  return score;
}

function preferredDays(request: MultisportWeekRequest, discipline: MultisportDiscipline): Weekday[] {
  return request.preferences?.preferredDays?.[discipline] ?? [];
}

function inferFixedIntensity(session: FixedMultisportSession): SessionIntensity {
  if (session.priority === 'key' && (session.discipline === 'bike' || session.discipline === 'run')) return 'moderate';
  return 'easy';
}

function hasAdjacentHardDay(sessions: PlannedMultisportSession[], day: Weekday): boolean {
  const previous = dayAtOffset(day, -1);
  const next = dayAtOffset(day, 1);
  return sessions.some((session) => session.intensity === 'hard' && (session.day === previous || session.day === next));
}

function compareSessions(left: PlannedMultisportSession, right: PlannedMultisportSession): number {
  const dayDifference = dayOffset(left.day) - dayOffset(right.day);
  if (dayDifference !== 0) return dayDifference;
  const timeRank = { morning: 0, midday: 1, evening: 2 } as const;
  return (left.timeOfDay ? timeRank[left.timeOfDay] : 1) - (right.timeOfDay ? timeRank[right.timeOfDay] : 1);
}

function uniqueDays(sessions: PlannedMultisportSession[]): Weekday[] {
  return [...new Set(sessions.map((session) => session.day))];
}

function isoDateForDay(weekStartDate: string, day: Weekday): string {
  const date = new Date(`${weekStartDate.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset(day));
  return date.toISOString().slice(0, 10);
}

function dayOffset(day: Weekday): number {
  return DAY_INDEX.get(day) ?? 0;
}

function dayAtOffset(day: Weekday, offset: number): Weekday {
  const next = (dayOffset(day) + offset + 7) % 7;
  return DAYS[next] ?? 'monday';
}

function hash(value: string): string {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return (output >>> 0).toString(16);
}
