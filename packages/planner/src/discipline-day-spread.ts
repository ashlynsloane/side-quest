import type {
  WholeAthletePlannedSession,
  WholeAthleteWeeklyPlannerInput,
  WholeAthleteWeekPlan,
} from './whole-athlete-week';

/**
 * Frequency only counts as useful frequency when the sessions are actually
 * distributed. Repair accidental generated swim doubles while preserving fixed
 * athlete/calendar commitments and the week's lowest-load recovery day.
 */
export function applyDisciplineDaySpread(
  plan: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthleteWeekPlan {
  let sessions = plan.sessions.map((session) => ({ ...session }));
  const protectedLowDate = lowestLoadDate(sessions, input.weekStartDate);
  let changed = false;

  const byDate = groupDisciplineByDate(sessions, 'swim');
  for (const [date, sameDay] of byDate) {
    if (sameDay.length < 2) continue;

    const ordered = [...sameDay].sort((left, right) => keepPriority(left) - keepPriority(right) || left.id.localeCompare(right.id));
    const extras = ordered.slice(1).filter(isMovableGenerated);
    for (const extra of extras) {
      const destination = chooseSwimDestination(sessions, extra, input.weekStartDate, protectedLowDate);
      if (!destination) continue;
      sessions = sessions.map((session) => session.id === extra.id
        ? {
            ...session,
            date: destination,
            rationale: unique([
              ...session.rationale,
              `Moved from ${friendlyWeekday(date)} to ${friendlyWeekday(destination)} so swim frequency is spread across distinct training days rather than doubled accidentally.`,
            ]),
          }
        : session);
      changed = true;
    }
  }

  if (!changed) return plan;
  sessions.sort(sortSessions);
  return {
    ...plan,
    sessions,
    doubleDays: summarizeDoubleDays(sessions),
    guardrails: unique([
      ...plan.guardrails,
      'Generated swim frequency is distributed across distinct days unless the athlete explicitly fixes a swim double.',
    ]),
  };
}

function chooseSwimDestination(
  sessions: WholeAthletePlannedSession[],
  swim: WholeAthletePlannedSession,
  weekStartDate: string,
  protectedLowDate: string | null,
): string | null {
  const currentSwimDates = new Set(sessions.filter((session) => session.discipline === 'swim' && session.id !== swim.id).map((session) => session.date));
  const candidates: Array<{ date: string; score: number }> = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(weekStartDate, offset);
    if (currentSwimDates.has(date)) continue;
    const sameDay = sessions.filter((session) => session.id !== swim.id && session.date === date && isTrainable(session));
    if (sameDay.length >= 2) continue;
    if (sameDay.some((session) => session.discipline === 'rest')) continue;
    if (sameDay.some(isHard) && isHard(swim)) continue;
    if (isHard(swim) && sessions.some((session) => session.id !== swim.id && isHard(session) && Math.abs(dayDifference(session.date, date)) <= 1)) continue;

    let score = 0;
    if (date === protectedLowDate) score -= 80;
    if (!sameDay.length) score += 22;
    if (sameDay.length === 1 && sameDay[0]?.discipline === 'run' && sameDay[0].intensity === 'easy') score += 16;
    if (sameDay.length === 1 && sameDay[0]?.discipline === 'strength' && sameDay[0].upperBodyDemand !== 'high') score += 10;
    if (sameDay.some((session) => session.discipline === 'bike' && /long/i.test(session.title))) score -= 30;
    if (sameDay.some(isHard)) score -= 24;
    score -= sameDay.reduce((sum, session) => sum + session.recoveryCost * 5 + session.durationMinutes / 30, 0);

    const distances = [...currentSwimDates].map((swimDate) => Math.abs(dayDifference(swimDate, date)));
    if (distances.length) score += Math.min(...distances) * 9;
    candidates.push({ date, score });
  }

  return candidates.sort((left, right) => right.score - left.score || left.date.localeCompare(right.date))[0]?.date ?? null;
}

function lowestLoadDate(sessions: WholeAthletePlannedSession[], weekStartDate: string): string | null {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(weekStartDate, offset);
    const daySessions = sessions.filter((session) => session.date === date && isTrainable(session));
    const load = daySessions.reduce((sum, session) => sum + session.recoveryCost + session.durationMinutes / 60, 0);
    return { date, load, count: daySessions.length };
  });
  const empty = days.filter((day) => day.count === 0).sort((left, right) => left.load - right.load || Math.abs(2 - weekdayIndex(left.date)) - Math.abs(2 - weekdayIndex(right.date)));
  return empty[0]?.date ?? null;
}

function groupDisciplineByDate(
  sessions: WholeAthletePlannedSession[],
  discipline: 'swim',
): Map<string, WholeAthletePlannedSession[]> {
  const result = new Map<string, WholeAthletePlannedSession[]>();
  for (const session of sessions.filter((item) => item.discipline === discipline)) {
    const values = result.get(session.date) ?? [];
    values.push(session);
    result.set(session.date, values);
  }
  return result;
}

function keepPriority(session: WholeAthletePlannedSession): number {
  if (!isMovableGenerated(session)) return 0;
  if (session.keySession || isHard(session)) return 1;
  return 2;
}

function isMovableGenerated(session: WholeAthletePlannedSession): boolean {
  return session.planningCommitment === 'generated';
}

function isTrainable(session: WholeAthletePlannedSession): boolean {
  return session.discipline === 'swim' || session.discipline === 'bike' || session.discipline === 'run' || session.discipline === 'strength' || session.discipline === 'rest';
}

function isHard(session: Pick<WholeAthletePlannedSession, 'intensity' | 'recoveryCost'>): boolean {
  return session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4;
}

function summarizeDoubleDays(sessions: WholeAthletePlannedSession[]): WholeAthleteWeekPlan['doubleDays'] {
  const byDate = new Map<string, WholeAthletePlannedSession[]>();
  for (const session of sessions.filter(isTrainable).filter((item) => item.discipline !== 'rest')) {
    const values = byDate.get(session.date) ?? [];
    values.push(session);
    byDate.set(session.date, values);
  }
  return [...byDate.entries()]
    .filter(([, values]) => values.length >= 2)
    .map(([date, values]) => ({
      date,
      sessionIds: values.map((session) => session.id),
      disciplines: values.map((session) => session.discipline).filter((discipline): discipline is 'swim' | 'bike' | 'run' | 'strength' => discipline === 'swim' || discipline === 'bike' || discipline === 'run' || discipline === 'strength'),
      rationale: 'Intentional double day preserved because the pairing fits the weekly load and recovery structure.',
      athleteSpecified: values.every((session) => session.planningCommitment !== 'generated'),
    }));
}

function sortSessions(left: WholeAthletePlannedSession, right: WholeAthletePlannedSession): number {
  return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function dayDifference(left: string, right: string): number {
  return Math.round((Date.parse(`${right}T12:00:00Z`) - Date.parse(`${left}T12:00:00Z`)) / 86_400_000);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function friendlyWeekday(date: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
