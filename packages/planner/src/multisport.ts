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

export function generateMultisportWeek(request: MultisportWeekRequest): MultisportWeekPlan {
  const fixed = normalizeFixedSessions(request);
  const warnings: string[] = [];
  const decisions: string[] = [];
  const sessions: PlannedMultisportSession[] = [...fixed];

  if (request.health.runStatus === 'not_running' || request.health.avoidImpact) {
    decisions.push('Running generation is disabled by the current impact constraint.');
  }
  if (request.health.boneStressInjuryHistory === 'recent_or_current') {
    decisions.push('Recent/current bone-stress history keeps impact progression conservative.');
  }

  const targets = sessionTargets(request);
  const desired: Array<{ discipline: MultisportDiscipline; count: number }> = [
    { discipline: 'swim', count: targets.swim },
    { discipline: 'bike', count: targets.bike },
    { discipline: 'run', count: targets.run },
    { discipline: 'strength', count: targets.strength },
  ];

  for (const target of desired) {
    const existing = sessions.filter((session) => session.discipline === target.discipline).length;
    const missing = Math.max(0, target.count - existing);
    for (let index = 0; index < missing; index += 1) {
      const candidate = placeGeneratedSession(request, sessions, target.discipline, index, missing);
      if (candidate) {
        sessions.push(candidate);
      } else {
        warnings.push(`Could not place another ${target.discipline} session without violating current availability or spacing rules.`);
      }
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

function sessionTargets(request: MultisportWeekRequest): Record<'swim' | 'bike' | 'run' | 'strength', number> {
  const explicit = request.preferences?.preferredSessionsPerWeek;
  const isTriathlon = request.goal.disciplines.includes('swim')
    && request.goal.disciplines.includes('bike')
    && request.goal.disciplines.includes('run');

  let swim = explicit?.swim ?? (request.goal.disciplines.includes('swim') ? (isTriathlon ? 3 : 2) : 0);
  let bike = explicit?.bike ?? (request.goal.disciplines.includes('bike') ? (isTriathlon ? 3 : 2) : 0);
  let run = explicit?.run ?? (request.goal.disciplines.includes('run') ? (isTriathlon ? 3 : 3) : 0);
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
  if (request.health.runStatus === 'return_to_run') run = Math.min(run, 2);
  if (request.health.runStatus === 'reduced') run = Math.min(run, 2);

  return { swim, bike, run, strength };
}

function placeGeneratedSession(
  request: MultisportWeekRequest,
  current: PlannedMultisportSession[],
  discipline: MultisportDiscipline,
  ordinal: number,
  totalMissing: number,
): PlannedMultisportSession | null {
  const candidates = candidateDays(request, discipline)
    .filter((day) => canFitOnDay(request, current, discipline, day))
    .map((day) => ({ day, score: placementScore(request, current, discipline, day, ordinal) }))
    .sort((left, right) => right.score - left.score || dayOffset(left.day) - dayOffset(right.day));

  const selected = candidates[0]?.day;
  if (!selected) return null;

  const role = generatedRole(request, discipline, ordinal, totalMissing);
  const durationMinutes = generatedDuration(request, discipline, selected, role.priority);
  return {
    id: `generated_${discipline}_${isoDateForDay(request.weekStartDate, selected)}_${ordinal + 1}`,
    date: isoDateForDay(request.weekStartDate, selected),
    day: selected,
    discipline,
    title: role.title,
    durationMinutes,
    intensity: role.intensity,
    priority: role.priority,
    ownership: preferredDays(request, discipline).includes(selected) ? 'preferred' : 'generated',
    rationale: placementRationale(request, current, discipline, selected, role),
  };
}

function candidateDays(request: MultisportWeekRequest, discipline: MultisportDiscipline): Weekday[] {
  const available = request.availability.filter((window) => window.available && window.minutes > 0).map((window) => window.day);
  const avoid = new Set(request.preferences?.avoidDays ?? []);
  const preferred = preferredDays(request, discipline).filter((day) => available.includes(day) && !avoid.has(day));
  const remainder = available.filter((day) => !avoid.has(day) && !preferred.includes(day));
  return [...preferred, ...remainder];
}

function canFitOnDay(
  request: MultisportWeekRequest,
  current: PlannedMultisportSession[],
  discipline: MultisportDiscipline,
  day: Weekday,
): boolean {
  const availability = request.availability.find((window) => window.day === day);
  if (!availability?.available) return false;

  const onDay = current.filter((session) => session.day === day);
  const usedMinutes = onDay.reduce((sum, session) => sum + session.durationMinutes, 0);
  const minimum = minimumDuration(discipline);
  if (availability.minutes < usedMinutes + minimum) return false;

  if (onDay.some((session) => session.discipline === discipline)) return false;
  if (discipline === 'strength' && onDay.some((session) => session.intensity === 'hard' && (session.discipline === 'bike' || session.discipline === 'run'))) return false;

  if (discipline === 'strength') {
    const tomorrow = dayAtOffset(day, 1);
    if (current.some((session) => session.day === tomorrow && session.priority === 'key' && (session.discipline === 'bike' || session.discipline === 'run'))) {
      return false;
    }
  }

  if ((discipline === 'bike' || discipline === 'run') && current.some((session) => session.day === day && session.discipline === 'strength' && session.intensity === 'hard')) {
    return false;
  }

  return true;
}

function placementScore(
  request: MultisportWeekRequest,
  current: PlannedMultisportSession[],
  discipline: MultisportDiscipline,
  day: Weekday,
  ordinal: number,
): number {
  let score = 0;
  if (preferredDays(request, discipline).includes(day)) score += 40;
  if (request.preferences?.longRideDay === day && discipline === 'bike' && ordinal === 0) score += 50;
  if (request.preferences?.longRunDay === day && discipline === 'run' && ordinal === 0) score += 50;

  const index = dayOffset(day);
  const sameDisciplineDistances = current
    .filter((session) => session.discipline === discipline)
    .map((session) => Math.abs(dayOffset(session.day) - index));
  if (sameDisciplineDistances.length) score += Math.min(...sameDisciplineDistances) * 5;

  if (!current.some((session) => session.day === day)) score += 12;
  if (current.some((session) => session.day === day && session.discipline === 'swim') && discipline === 'strength') score += 5;
  if (hasAdjacentHardDay(current, day)) score -= 15;

  const availability = request.availability.find((window) => window.day === day)?.minutes ?? 0;
  score += Math.min(availability, 180) / 30;
  return score;
}

function generatedRole(
  request: MultisportWeekRequest,
  discipline: MultisportDiscipline,
  ordinal: number,
  totalMissing: number,
): { title: string; intensity: SessionIntensity; priority: SessionPriority } {
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
  if (discipline === 'strength') {
    if (request.phase === 'race_week' || request.phase === 'taper') return { title: 'Strength · race support', intensity: 'easy', priority: 'support' };
    if (ordinal === 0) return { title: 'Strength · primary development', intensity: 'hard', priority: 'key' };
    return { title: 'Strength · durability and support', intensity: 'moderate', priority: 'support' };
  }
  return { title: 'Recovery', intensity: 'easy', priority: 'support' };
}

function generatedDuration(
  request: MultisportWeekRequest,
  discipline: MultisportDiscipline,
  day: Weekday,
  priority: SessionPriority,
): number {
  const available = request.availability.find((window) => window.day === day)?.minutes ?? 60;
  const base = discipline === 'strength'
    ? request.goal.defaultSessionMinutes
    : discipline === 'swim'
      ? 60
      : discipline === 'bike'
        ? (priority === 'key' ? 120 : 60)
        : discipline === 'run'
          ? (priority === 'key' ? 75 : 45)
          : 30;
  return Math.max(minimumDuration(discipline), Math.min(base, available));
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
  discipline: MultisportDiscipline,
  day: Weekday,
  role: { intensity: SessionIntensity; priority: SessionPriority },
): string[] {
  const rationale = [`Side Quest filled an open ${day} slot with ${discipline} to move the ${request.goal.name} plan forward.`];
  if (preferredDays(request, discipline).includes(day)) rationale.push('This matches one of your preferred days.');
  if (!current.some((session) => session.day === day)) rationale.push('The day was otherwise open, reducing unnecessary stacking.');
  if (discipline === 'strength') rationale.push('Strength placement avoids the day immediately before an existing key bike or run session.');
  if (role.priority === 'key') rationale.push('This is treated as a key session when balancing the rest of the week.');
  return rationale;
}

function addRecoveryIfNeeded(
  request: MultisportWeekRequest,
  sessions: PlannedMultisportSession[],
  decisions: string[],
): void {
  const occupied = new Set(sessions.map((session) => session.day));
  const openDay = DAYS.find((day) => !occupied.has(day) && request.availability.some((window) => window.day === day));
  if (!openDay) return;
  const hardDays = uniqueDays(sessions.filter((session) => session.intensity === 'hard'));
  if (hardDays.length < 2) return;
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
    rationale: ['Recovery is prescribed deliberately because the week already contains multiple hard training days.'],
  });
  decisions.push(`Kept ${openDay} as a recovery-focused day rather than filling every available slot.`);
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
