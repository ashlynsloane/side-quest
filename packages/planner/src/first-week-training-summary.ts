import type { PlannedStrengthSession, TrainingCalendarEvent } from '@circuit/domain';
import { localTrainingDate } from './core-training-week-evidence';

export interface FirstWeekTrainingItem {
  id: string;
  date: string;
  sport: 'strength' | 'swim' | 'bike' | 'run';
  title: string;
  plannedMinutes: number | null;
  source: 'generated_strength' | 'generated_endurance';
  status: 'planned' | 'completed' | 'skipped' | 'modified';
}
export interface FirstWeekDay {
  date: string;
  sessions: FirstWeekTrainingItem[];
}
export interface FirstWeekTrainingSummary {
  days: FirstWeekDay[];
  sessions: FirstWeekTrainingItem[];
  counts: { strength: number; swim: number; bike: number; run: number };
  knownPlannedMinutes: number;
  unknownDurationCount: number;
  /** Availability, sport background and generated dose are not completed training. */
  evidenceStatus: 'provisional_unverified';
}
const DAY_MS = 86_400_000;
function dayNumber(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Invalid YYYY-MM-DD');
  const value = Date.parse(iso + 'T00:00:00Z');
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== iso) {
    throw new Error('Invalid date');
  }
  return value / DAY_MS;
}
function dayString(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}
export function buildFirstWeekTrainingSummary(input: {
  weekStartDate: string;
  strengthSessions: PlannedStrengthSession[];
  generatedEvents: TrainingCalendarEvent[];
  timezone: string;
}): FirstWeekTrainingSummary {
  const start = dayNumber(input.weekStartDate);
  if (new Date(start * DAY_MS).getUTCDay() !== 1) {
    throw new Error('Training week must start Monday');
  }
  const finish = dayString(start + 6);
  const sessions: FirstWeekTrainingItem[] = input.strengthSessions
    .filter(s => s.date >= input.weekStartDate && s.date <= finish)
    .map(s => ({
      id: 'strength:' + s.id,
      date: s.date, sport: 'strength', title: s.title,
      plannedMinutes: s.workout.estimatedElapsedSeconds > 0
        ? Math.round(s.workout.estimatedElapsedSeconds / 60) : null,
      source: 'generated_strength' as const,
      status: s.completionStatus,
    }));
  for (const event of input.generatedEvents) {
    if (event.sourceId !== 'side_quest_generated_plan'
      || !['run', 'bike', 'swim'].includes(event.discipline ?? '')) continue;
    const date = event.allDay
      ? event.startAt.slice(0, 10)
      : localTrainingDate(event.startAt, input.timezone);
    if (date < input.weekStartDate || date > finish) continue;
    const parsed = event.description?.match(/Side Quest generated · (\d+) min/);
    const duration = parsed ? Number(parsed[1]) : null;
    const plannedMinutes = duration !== null && Number.isFinite(duration)
      && duration > 0 ? duration : null;
    sessions.push({
      id: 'calendar:' + event.id, date,
      sport: event.discipline as 'run' | 'bike' | 'swim',
      title: event.title, plannedMinutes,
      source: 'generated_endurance', status: 'planned',
    });
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date)
    || a.sport.localeCompare(b.sport) || a.id.localeCompare(b.id));
  const counts = { strength: 0, swim: 0, bike: 0, run: 0 };
  for (const s of sessions) counts[s.sport] += 1;
  return {
    days: Array.from({ length: 7 }, (_, i) => ({
      date: dayString(start + i),
      sessions: sessions.filter(s => s.date === dayString(start + i)),
    })),
    sessions, counts,
    knownPlannedMinutes: sessions.reduce((acc, s) => acc + (s.plannedMinutes ?? 0), 0),
    unknownDurationCount: sessions.filter(s => s.plannedMinutes === null).length,
    evidenceStatus: 'provisional_unverified',
  };
}
