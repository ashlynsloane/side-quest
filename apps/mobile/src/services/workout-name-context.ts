import type { WorkoutNamePhase } from './workout-name-catalog';

export type WorkoutNameSeason = 'winter' | 'spring' | 'summer' | 'fall';

export interface GeneratedWorkoutNamingMetadata {
  phase?: WorkoutNamePhase;
  goalType?: string;
  raceDate?: string;
  raceName?: string;
  triathlon?: boolean;
}

const PHASES = new Set<WorkoutNamePhase>([
  'offseason',
  'base',
  'build',
  'peak',
  'taper',
  'race_week',
  'rebuild',
]);

export function workoutNameSeason(date: string): WorkoutNameSeason {
  const month = Number(date.slice(5, 7));
  if (month === 12 || month === 1 || month === 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'fall';
}

export function isHolidayNamingWindow(date: string): boolean {
  const monthDay = date.slice(5, 10);
  return monthDay >= '12-15' || monthDay <= '01-02';
}

export function weeksUntilRace(workoutDate: string, raceDate?: string): number | undefined {
  if (!raceDate) return undefined;
  const workout = Date.parse(`${workoutDate}T12:00:00Z`);
  const race = Date.parse(`${raceDate}T12:00:00Z`);
  if (!Number.isFinite(workout) || !Number.isFinite(race)) return undefined;
  return (race - workout) / (7 * 86_400_000);
}

export function effectiveWorkoutNamePhase(
  explicitPhase: WorkoutNamePhase | undefined,
  weeksToRace: number | undefined,
): WorkoutNamePhase | undefined {
  if (weeksToRace != null && weeksToRace >= -0.15 && weeksToRace <= 1) return 'race_week';
  if (explicitPhase) return explicitPhase;
  if (weeksToRace != null && weeksToRace > 1 && weeksToRace <= 3) return 'taper';
  return undefined;
}

export function isTriathlonGoalType(goalType?: string): boolean {
  return Boolean(goalType && /triathlon|ironman|70[_ .-]?3|swim.?bike.?run/i.test(goalType));
}

export function generatedWorkoutNamingMetadata(input: {
  phase?: string;
  goalType?: string;
  raceDate?: string;
  raceName?: string;
}): string {
  const phase = normalizePhase(input.phase);
  const parts = [
    phase ? `phase=${phase}` : undefined,
    input.goalType ? `goalType=${encodeURIComponent(input.goalType)}` : undefined,
    input.raceDate ? `raceDate=${input.raceDate}` : undefined,
    input.raceName ? `raceName=${encodeURIComponent(input.raceName)}` : undefined,
  ].filter((value): value is string => Boolean(value));
  return `Side Quest naming · ${parts.join(' · ')}`;
}

export function parseGeneratedWorkoutNamingMetadata(description?: string): GeneratedWorkoutNamingMetadata {
  const line = description?.split('\n').find((value) => value.startsWith('Side Quest naming · '));
  if (!line) return {};
  const values = Object.fromEntries(
    line
      .replace(/^Side Quest naming · /, '')
      .split(' · ')
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator < 0) return [part, ''];
        return [part.slice(0, separator), part.slice(separator + 1)];
      }),
  );
  const phase = normalizePhase(values.phase);
  const goalType = decode(values.goalType);
  const raceName = decode(values.raceName);
  return {
    phase,
    goalType: goalType || undefined,
    raceDate: /^\d{4}-\d{2}-\d{2}$/.test(values.raceDate ?? '') ? values.raceDate : undefined,
    raceName: raceName || undefined,
    triathlon: isTriathlonGoalType(goalType) || isTriathlonGoalType(raceName),
  };
}

function normalizePhase(value?: string): WorkoutNamePhase | undefined {
  if (!value) return undefined;
  if (value === 'recovery') return 'rebuild';
  return PHASES.has(value as WorkoutNamePhase) ? value as WorkoutNamePhase : undefined;
}

function decode(value?: string): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
