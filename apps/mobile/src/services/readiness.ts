export type ReadinessBand = 'ready' | 'steady' | 'reduced' | 'recover';

export interface DailyReadinessCheckIn {
  id: string;
  date: string;
  sleep: number;
  energy: number;
  muscleFreshness: number;
  stress: number;
  motivation: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyReadinessSummary {
  averageScore: number | null;
  band: ReadinessBand | null;
  daysLogged: number;
  lowestDay?: DailyReadinessCheckIn;
}

export interface WeeklyCoachInputs {
  plannedSessions: number;
  completedSessions: number;
  skippedSessions: number;
  rescheduledSessions: number;
  completedWorkouts: number;
  tooEasyCount: number;
  appropriateCount: number;
  tooHardCount: number;
  averageRpe: number | null;
  readiness: WeeklyReadinessSummary;
  activePainRestriction: boolean;
}

export function readinessScore(checkIn: DailyReadinessCheckIn): number {
  const invertedStress = 6 - clamp(checkIn.stress, 1, 5);
  const values = [
    clamp(checkIn.sleep, 1, 5),
    clamp(checkIn.energy, 1, 5),
    clamp(checkIn.muscleFreshness, 1, 5),
    invertedStress,
    clamp(checkIn.motivation, 1, 5),
  ];
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

export function readinessBand(score: number): ReadinessBand {
  if (score >= 4.2) return 'ready';
  if (score >= 3.3) return 'steady';
  if (score >= 2.4) return 'reduced';
  return 'recover';
}

export function readinessSummary(checkIns: DailyReadinessCheckIn[]): WeeklyReadinessSummary {
  if (checkIns.length === 0) return { averageScore: null, band: null, daysLogged: 0 };
  const scored = checkIns.map((checkIn) => ({ checkIn, score: readinessScore(checkIn) }));
  const average = round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length, 2);
  const lowest = [...scored].sort((a, b) => a.score - b.score)[0]?.checkIn;
  return {
    averageScore: average,
    band: readinessBand(average),
    daysLogged: checkIns.length,
    lowestDay: lowest,
  };
}

export function readinessHeadline(checkIn: DailyReadinessCheckIn): string {
  const score = readinessScore(checkIn);
  switch (readinessBand(score)) {
    case 'ready': return 'Ready for the planned session';
    case 'steady': return 'Normal training looks reasonable';
    case 'reduced': return 'Use a reduced dose today';
    case 'recover': return 'Keep strength minimal today';
  }
}

export function readinessDetail(checkIn: DailyReadinessCheckIn): string {
  const score = readinessScore(checkIn);
  const band = readinessBand(score);
  if (band === 'ready') return 'Sleep, energy, stress, motivation, and muscle freshness are collectively strong.';
  if (band === 'steady') return 'No major recovery signal stands out, but the app will still respect the training calendar and PT profile.';
  if (band === 'reduced') return 'At least one recovery input is meaningfully suppressed. Preserve the main movement patterns with less total work.';
  return 'Multiple recovery inputs are low. A minimum session or complete rest is more appropriate than forcing the full prescription.';
}

export function readinessVariant(checkIn: DailyReadinessCheckIn): 'full' | 'reduced' | 'minimum' {
  const band = readinessBand(readinessScore(checkIn));
  if (band === 'ready' || band === 'steady') return 'full';
  if (band === 'reduced') return 'reduced';
  return 'minimum';
}

export function buildWeeklyCoachNotes(input: WeeklyCoachInputs): string[] {
  const notes: string[] = [];
  const adherence = input.plannedSessions > 0
    ? input.completedSessions / input.plannedSessions
    : null;

  if (adherence !== null && adherence >= 0.85) {
    notes.push('Plan adherence was strong. Keep the next week structurally similar rather than adding unnecessary novelty.');
  } else if (adherence !== null && adherence >= 0.5) {
    notes.push('You completed part of the planned strength work. Prioritize the highest-value sessions next week instead of trying to make up every missed workout.');
  } else if (adherence !== null) {
    notes.push('The planned dose was not realistic this week. Use reduced or minimum versions sooner, or decrease weekly strength frequency.');
  }

  if (input.tooHardCount > input.appropriateCount && input.tooHardCount >= input.tooEasyCount) {
    notes.push('Difficulty feedback skewed too hard. Hold load steady and reduce one progression variable next week.');
  } else if (input.tooEasyCount > input.appropriateCount && input.tooEasyCount > input.tooHardCount) {
    notes.push('Difficulty feedback skewed too easy. Progress one anchor exercise through load, reps, or control—not all three at once.');
  } else if (input.appropriateCount > 0) {
    notes.push('Most recorded prescriptions were appropriate. Continue gradual progression while retaining familiar anchor exercises.');
  }

  if (input.averageRpe !== null && input.averageRpe >= 8) {
    notes.push('Average session effort was high. Avoid stacking another hard strength week on top of demanding endurance work.');
  } else if (input.averageRpe !== null && input.averageRpe <= 5 && input.completedWorkouts > 0) {
    notes.push('Average effort was modest. The next build week can tolerate a small progression if recovery remains stable.');
  }

  if (input.readiness.averageScore !== null) {
    if (input.readiness.band === 'recover' || input.readiness.band === 'reduced') {
      notes.push('Readiness trended low. Protect recovery before increasing training density.');
    } else if (input.readiness.band === 'ready' && input.completedWorkouts > 0) {
      notes.push('Readiness remained strong while training. That supports maintaining the current structure.');
    }
  }

  if (input.activePainRestriction) {
    notes.push('A pain or tightness adjustment is active. Do not use adherence targets to override symptom-based restrictions.');
  }

  if (input.rescheduledSessions > 0) {
    notes.push(`${input.rescheduledSessions} strength session${input.rescheduledSessions === 1 ? ' was' : 's were'} moved. Review whether the original preferred strength days still match the real training week.`);
  }

  if (input.skippedSessions > 0 && input.completedSessions > 0) {
    notes.push('Skipped sessions were left skipped rather than crammed into the following days, which protects recovery and schedule quality.');
  }

  if (notes.length === 0) {
    notes.push('Log readiness and post-workout feedback for several days to unlock a more specific weekly review.');
  }

  return notes;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
