import type {
  WholeAthletePlannedSession,
  WholeAthleteWeeklyPlannerInput,
  WholeAthleteWeekPlan,
} from './whole-athlete-week';

const ADAPTIVE_FREQUENCY_REFLOW_PREFIX = 'Adaptive frequency reflow:';

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
  const configuredRestWeekday = input.weeklySchedule?.restDays?.[0]
    ?? (isTriathlonGoal(input.goalType) ? 0 : undefined);
  const protectedLowDate = configuredRestWeekday !== undefined
    ? addDays(input.weekStartDate, configuredRestWeekday)
    : lowestLoadDate(sessions, input.weekStartDate);
  let changed = false;

  const byDate = groupDisciplineByDate(sessions, 'swim');
  for (const [date, sameDay] of byDate) {
    if (sameDay.length < 2) continue;

    const ordered = [...sameDay].sort((left, right) => keepPriority(left) - keepPriority(right) || left.id.localeCompare(right.id));
    const extras = ordered.slice(1).filter(isMovableGenerated);
    for (const extra of extras) {
      const destination = chooseSwimDestination(sessions, extra, input, protectedLowDate);
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

  const aligned = alignGeneratedSwimsToPreferredRoles(
    sessions,
    input,
    protectedLowDate,
  );
  sessions = aligned.sessions;
  changed = changed || aligned.changed;

  if (!changed) return plan;
  sessions.sort(sortSessions);
  return {
    ...plan,
    sessions,
    doubleDays: summarizeDoubleDays(sessions),
    guardrails: unique([
      ...plan.guardrails,
      'Generated swim frequency is distributed across distinct days without consuming the protected recovery/rest day unless the athlete explicitly fixes that commitment.',
      'Generated triathlon swims are aligned by role: the quality swim uses the quality-swim weekday and easy/recovery swims use the remaining preferred swim weekdays.',
    ]),
  };
}

function isTriathlonGoal(goalType: WholeAthleteWeeklyPlannerInput['goalType']): boolean {
  return goalType === 'triathlon_sprint'
    || goalType === 'triathlon_olympic'
    || goalType === 'ironman_70_3'
    || goalType === 'ironman_full';
}

function preferredSwimWeekdays(input: WholeAthleteWeeklyPlannerInput): number[] {
  const explicit = input.weeklySchedule?.preferredDays?.swim;
  if (explicit?.length) return explicit;
  return isTriathlonGoal(input.goalType) ? [1, 3, 6] : [];
}

function alignGeneratedSwimsToPreferredRoles(
  sessions: WholeAthletePlannedSession[],
  input: WholeAthleteWeeklyPlannerInput,
  protectedLowDate: string | null,
): { sessions: WholeAthletePlannedSession[]; changed: boolean } {
  const preferred = preferredSwimWeekdays(input);
  if (!preferred.length) return { sessions, changed: false };

  const groupDays: readonly number[] = input.weeklySchedule?.groupSwimDays
    ?? (isTriathlonGoal(input.goalType) ? [1] : []);
  const easyDays = preferred.filter((day) => !groupDays.includes(day));

  const generatedSwims = sessions
    .filter((session) =>
      session.discipline === 'swim'
      && isMovableGenerated(session)
      && !session.rationale.some((line) => line.startsWith(ADAPTIVE_FREQUENCY_REFLOW_PREFIX)));

  if (!generatedSwims.length) return { sessions, changed: false };

  const qualitySwims = generatedSwims
    .filter(isQualitySwim)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const easySwims = generatedSwims
    .filter((session) => !isQualitySwim(session))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));

  const targetById = new Map<string, string>();
  const usedWeekdays = new Set<number>();

  for (let index = 0; index < qualitySwims.length; index += 1) {
    const weekday = groupDays.find((day) => !usedWeekdays.has(day))
      ?? preferred.find((day) => !usedWeekdays.has(day));
    if (weekday !== undefined) {
      targetById.set(qualitySwims[index]!.id, addDays(input.weekStartDate, weekday));
      usedWeekdays.add(weekday);
    }
  }

  // Every generated swim gets a distinct preferred weekday before any target
  // is reused. This matters when the athlete supplies multiple group-swim days
  // but the generated week contains only one quality swim: the unused group day
  // is still a valid home for an easy swim.
  const remainingPreferred = preferred.filter((day) => !usedWeekdays.has(day));
  for (let index = 0; index < easySwims.length; index += 1) {
    const weekday = remainingPreferred[index];
    if (weekday !== undefined) {
      targetById.set(easySwims[index]!.id, addDays(input.weekStartDate, weekday));
      usedWeekdays.add(weekday);
    }
  }

  if (!targetById.size) return { sessions, changed: false };

  const projectedSwimIds = new Set(targetById.keys());
  let next = sessions.map((session) => ({ ...session }));
  let changed = false;

  const orderedSwims = [...generatedSwims].sort((left, right) => {
    const leftQuality = isQualitySwim(left) ? 0 : 1;
    const rightQuality = isQualitySwim(right) ? 0 : 1;
    return leftQuality - rightQuality || left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
  });

  for (const swim of orderedSwims) {
    const targetDate = targetById.get(swim.id);
    if (!targetDate || swim.date === targetDate) continue;
    if (targetDate === protectedLowDate) continue;

    const baseOccupants = next.filter((session) =>
      session.id !== swim.id
      && !projectedSwimIds.has(session.id)
      && session.date === targetDate
      && isTrainable(session)
      && session.discipline !== 'rest');

    if (canPairProjectedSwim(swim, baseOccupants)) {
      next = moveSession(
        next,
        swim.id,
        targetDate,
        `Moved to ${friendlyWeekday(targetDate)} so this ${isQualitySwim(swim) ? 'quality' : 'easy/recovery'} swim matches the athlete's weekly swim scaffold.`,
      );
      changed = true;
      continue;
    }

    const explicitSwimDays: readonly number[] = input.weeklySchedule?.preferredDays?.swim ?? [];
    const targetWeekday = weekdayIndex(targetDate);
    const canDisplace = explicitSwimDays.includes(targetWeekday)
      || isTriathlonGoal(input.goalType);

    if (!canDisplace) continue;

    const displacement = chooseGeneratedDisplacement(
      next,
      swim,
      targetDate,
      swim.date,
      projectedSwimIds,
      protectedLowDate,
    );
    if (!displacement) continue;

    next = moveSession(
      next,
      displacement.id,
      swim.date,
      `Moved to ${friendlyWeekday(swim.date)} so a higher-priority swim weekday can be honored without creating a third session.`,
    );
    next = moveSession(
      next,
      swim.id,
      targetDate,
      `Moved to ${friendlyWeekday(targetDate)} so this ${isQualitySwim(swim) ? 'quality' : 'easy/recovery'} swim matches the athlete's weekly swim scaffold.`,
    );
    changed = true;
  }

  const strengthAligned = alignGeneratedStrengthToPreferredDays(
    next,
    input,
    protectedLowDate,
  );
  next = strengthAligned.sessions;
  changed = changed || strengthAligned.changed;

  return { sessions: next, changed };
}

function isQualitySwim(session: WholeAthletePlannedSession): boolean {
  return session.discipline === 'swim'
    && (session.keySession || session.intensity === 'moderate' || isHard(session));
}

function canPairProjectedSwim(
  swim: WholeAthletePlannedSession,
  occupants: WholeAthletePlannedSession[],
): boolean {
  if (occupants.length >= 2) return false;
  if (occupants.some((session) => session.discipline === 'swim')) return false;
  if (!occupants.length) return true;

  const existing = occupants[0]!;
  if (isHard(swim) && isHard(existing)) return false;

  if (existing.discipline === 'bike') {
    return !isHard(swim) || existing.recoveryCost <= 4;
  }
  if (existing.discipline === 'run') {
    return !isHard(swim);
  }
  if (existing.discipline === 'strength') {
    return !isHard(swim) && existing.upperBodyDemand !== 'high';
  }

  return false;
}

function chooseGeneratedDisplacement(
  sessions: WholeAthletePlannedSession[],
  swim: WholeAthletePlannedSession,
  targetDate: string,
  sourceDate: string,
  projectedSwimIds: Set<string>,
  protectedLowDate: string | null,
): WholeAthletePlannedSession | null {
  const candidates = sessions
    .filter((session) =>
      session.date === targetDate
      && !projectedSwimIds.has(session.id)
      && session.id !== swim.id
      && isTrainable(session)
      && session.discipline !== 'rest'
      && session.planningCommitment === 'generated'
      && !isHard(session))
    .sort((left, right) =>
      displacementPriority(left) - displacementPriority(right)
      || left.recoveryCost - right.recoveryCost
      || left.id.localeCompare(right.id));

  for (const candidate of candidates) {
    if (canPlaceDisplacedSession(
      sessions,
      candidate,
      sourceDate,
      swim.id,
      projectedSwimIds,
      protectedLowDate,
    )) {
      return candidate;
    }
  }

  return null;
}

function displacementPriority(session: WholeAthletePlannedSession): number {
  if (session.discipline === 'strength' && !session.keySession) return 0;
  if (session.discipline === 'bike' && !session.keySession) return 1;
  if (session.discipline === 'run' && !session.keySession) return 2;
  return 3;
}

function canPlaceDisplacedSession(
  sessions: WholeAthletePlannedSession[],
  candidate: WholeAthletePlannedSession,
  targetDate: string,
  vacatingSwimId: string,
  projectedSwimIds: Set<string>,
  protectedLowDate: string | null,
): boolean {
  if (targetDate === protectedLowDate) return false;

  const occupants = sessions.filter((session) =>
    session.id !== candidate.id
    && session.id !== vacatingSwimId
    && !projectedSwimIds.has(session.id)
    && session.date === targetDate
    && isTrainable(session)
    && session.discipline !== 'rest');

  if (occupants.length >= 2) return false;
  if (occupants.some((session) => session.discipline === candidate.discipline)) return false;
  if (!occupants.length) return true;

  const existing = occupants[0]!;
  if (isHard(candidate) && isHard(existing)) return false;

  if (candidate.discipline === 'strength') {
    return !isHard(candidate)
      && existing.discipline !== 'strength'
      && existing.upperBodyDemand !== 'high';
  }
  if (candidate.discipline === 'bike') {
    return !candidate.keySession && !isHard(candidate) && !isHard(existing);
  }
  if (candidate.discipline === 'run') {
    return !candidate.keySession && !isHard(candidate) && !isHard(existing);
  }

  return false;
}

function alignGeneratedStrengthToPreferredDays(
  sessions: WholeAthletePlannedSession[],
  input: WholeAthleteWeeklyPlannerInput,
  protectedLowDate: string | null,
): { sessions: WholeAthletePlannedSession[]; changed: boolean } {
  const explicitStrength = input.weeklySchedule?.preferredDays?.strength;
  const preferred = explicitStrength?.length
    ? explicitStrength
    : isTriathlonGoal(input.goalType)
      ? [2, 4]
      : [];

  if (!preferred.length) return { sessions, changed: false };

  const strengths = sessions
    .filter((session) => session.discipline === 'strength' && isMovableGenerated(session))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));

  let next = sessions.map((session) => ({ ...session }));
  let changed = false;

  for (let index = 0; index < strengths.length; index += 1) {
    const weekday = preferred[index] ?? preferred[preferred.length - 1];
    if (weekday === undefined) continue;

    const targetDate = addDays(input.weekStartDate, weekday);
    const strength = next.find((session) => session.id === strengths[index]!.id);
    if (!strength || strength.date === targetDate || targetDate === protectedLowDate) continue;

    const occupants = next.filter((session) =>
      session.id !== strength.id
      && session.date === targetDate
      && isTrainable(session)
      && session.discipline !== 'rest');

    if (occupants.length >= 2) continue;
    if (occupants.some((session) => session.discipline === 'strength')) continue;

    const explicitSwimDays: readonly number[] = input.weeklySchedule?.preferredDays?.swim ?? [];
    if (occupants.some((session) =>
      session.discipline === 'swim'
      && explicitSwimDays.includes(weekdayIndex(session.date)))) {
      continue;
    }

    if (occupants.length === 1) {
      const existing = occupants[0]!;
      if (isHard(strength) && isHard(existing)) continue;
    }

    next = moveSession(
      next,
      strength.id,
      targetDate,
      `Moved to ${friendlyWeekday(targetDate)} so generated strength matches the weekly strength scaffold after swim placement is resolved.`,
    );
    changed = true;
  }

  return { sessions: next, changed };
}

function moveSession(
  sessions: WholeAthletePlannedSession[],
  sessionId: string,
  date: string,
  rationale: string,
): WholeAthletePlannedSession[] {
  return sessions.map((session) => session.id === sessionId
    ? {
        ...session,
        date,
        rationale: unique([...session.rationale, rationale]),
      }
    : session);
}

function chooseSwimDestination(
  sessions: WholeAthletePlannedSession[],
  swim: WholeAthletePlannedSession,
  input: WholeAthleteWeeklyPlannerInput,
  protectedLowDate: string | null,
): string | null {
  const currentSwimDates = new Set(sessions.filter((session) => session.discipline === 'swim' && session.id !== swim.id).map((session) => session.date));
  const candidates: Array<{ date: string; score: number }> = [];
  const preferred: readonly number[] = preferredSwimWeekdays(input);
  const groupDays: readonly number[] = input.weeklySchedule?.groupSwimDays
    ?? (isTriathlonGoal(input.goalType) ? [1] : []);
  const qualityLike = swim.keySession || swim.intensity === 'moderate' || isHard(swim);

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(input.weekStartDate, offset);
    if (currentSwimDates.has(date)) continue;
    const sameDay = sessions.filter((session) => session.id !== swim.id && session.date === date && isTrainable(session));
    if (sameDay.length >= 2) continue;
    if (sameDay.some((session) => session.discipline === 'rest')) continue;
    if (sameDay.some(isHard) && isHard(swim)) continue;
    if (isHard(swim) && sessions.some((session) => session.id !== swim.id && isHard(session) && Math.abs(dayDifference(session.date, date)) <= 1)) continue;

    if (date === protectedLowDate) continue;

    let score = 0;
    if (preferred.length) score += preferred.includes(offset) ? 34 : -20;
    if (qualityLike && groupDays.includes(offset)) score += 46;
    if (!qualityLike && preferred.includes(offset) && !groupDays.includes(offset)) score += 28;
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
