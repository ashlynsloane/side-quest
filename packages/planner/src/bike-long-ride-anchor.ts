import type { WholeAthleteWeeklyPlannerInput, WholeAthleteWeekPlan } from './whole-athlete-week';
import { validateUnifiedWeek } from './unified-training';

const LONG_RIDE_MINUTES = 180;
const LONG_RIDE_MAX_MINUTES = 240;
const SUPPORT_RIDE_FLOOR_MINUTES = 60;
const LONG_RIDE_SHARE = 0.4;

/**
 * Long-course triathlon volume needs a single durability anchor rather than
 * several nearly-identical medium-long rides. This pass never adds weekly
 * minutes: it transfers generated bike minutes into one Saturday/Sunday ride
 * and keeps the remaining rides as support work.
 */
export function applyWeekendLongRideAnchor(
  plan: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthleteWeekPlan {
  if (input.goalType !== 'ironman_70_3' && input.goalType !== 'ironman_full') return plan;
  if (plan.planningState !== 'build' || input.phase === 'taper' || input.phase === 'race_week') return plan;

  const bikeIndexes = plan.sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.discipline === 'bike');
  if (bikeIndexes.length < 3) return plan;

  const weekendGenerated = bikeIndexes
    .filter(({ session }) => session.planningCommitment === 'generated')
    .filter(({ session }) => {
      const weekday = weekdayIndex(session.date);
      return weekday === 5 || weekday === 6;
    })
    .filter(({ session }) => session.intensity !== 'hard' && session.intensity !== 'max')
    .sort((left, right) => {
      const dayDelta = weekdayIndex(left.session.date) - weekdayIndex(right.session.date);
      if (dayDelta !== 0) return dayDelta; // Saturday before Sunday when both are available.
      return right.session.durationMinutes - left.session.durationMinutes;
    });
  const anchorEntry = weekendGenerated[0];
  if (!anchorEntry) return plan;

  const nextSessions = plan.sessions.map((session) => ({ ...session, rationale: [...session.rationale] }));
  const anchor = nextSessions[anchorEntry.index]!;
  const totalBikeMinutes = bikeIndexes.reduce((sum, { session }) => sum + session.durationMinutes, 0);
  const desiredLongRideMinutes = roundToFive(clamp(
    totalBikeMinutes * LONG_RIDE_SHARE,
    LONG_RIDE_MINUTES,
    LONG_RIDE_MAX_MINUTES,
  ));

  const donorIndexes = bikeIndexes
    .map(({ index }) => index)
    .filter((index) => index !== anchorEntry.index)
    .filter((index) => nextSessions[index]?.planningCommitment === 'generated')
    .filter((index) => {
      const session = nextSessions[index];
      return Boolean(session && session.intensity !== 'hard' && session.intensity !== 'max');
    });
  const transferableMinutes = donorIndexes.reduce((sum, index) => {
    const session = nextSessions[index]!;
    return sum + Math.max(0, session.durationMinutes - SUPPORT_RIDE_FLOOR_MINUTES);
  }, 0);
  const longRideTarget = Math.min(
    desiredLongRideMinutes,
    anchor.durationMinutes + transferableMinutes,
  );
  let transferNeeded = Math.max(0, longRideTarget - anchor.durationMinutes);

  // Reduce support rides together rather than draining one ride first. This
  // preserves useful support sessions while making the weekend anchor clearly
  // longer than the rest of the week.
  while (transferNeeded > 0) {
    const donors = donorIndexes
      .map((index) => ({ index, duration: nextSessions[index]!.durationMinutes }))
      .filter(({ duration }) => duration > SUPPORT_RIDE_FLOOR_MINUTES)
      .sort((left, right) => right.duration - left.duration || left.index - right.index);
    if (!donors.length) break;
    let movedThisRound = 0;
    for (const donor of donors) {
      if (transferNeeded <= 0) break;
      const session = nextSessions[donor.index]!;
      const available = session.durationMinutes - SUPPORT_RIDE_FLOOR_MINUTES;
      if (available <= 0) continue;
      const moved = Math.min(5, available, transferNeeded);
      session.durationMinutes -= moved;
      transferNeeded -= moved;
      movedThisRound += moved;
    }
    if (movedThisRound === 0) break;
  }

  const movedToAnchor = longRideTarget - anchor.durationMinutes - transferNeeded;
  anchor.durationMinutes += Math.max(0, movedToAnchor);
  anchor.title = 'Long Ride · Long Aerobic';
  anchor.keySession = true;
  anchor.rationale = unique([
    ...anchor.rationale,
    'This is the week’s long-ride anchor: long-course bike durability is concentrated here rather than spread across several medium-long rides.',
    `Weekend long ride receives ${anchor.durationMinutes} minutes while total weekly bike time stays unchanged.`,
  ]);

  for (const { index } of bikeIndexes) {
    if (index === anchorEntry.index) continue;
    const session = nextSessions[index]!;
    if (session.planningCommitment !== 'generated') continue;
    if (session.intensity === 'hard' || session.intensity === 'max') continue;
    if (/long ride|long endurance/i.test(session.title)) session.title = 'Aerobic · Endurance Support';
    session.keySession = false;
    session.rationale = unique([
      ...session.rationale,
      'Support ride duration is subordinate to the weekend long-ride anchor.',
    ]);
  }

  const quality = validateUnifiedWeek(nextSessions, {
    availableMinutes: input.availableMinutes,
    phase: input.phase,
    goalType: input.goalType,
    recentBoneStress: input.recentBoneStress ?? (input.health.boneStress === 'recent' || input.health.boneStress === 'active'),
    returnToRun: input.returnToRun ?? false,
    previousWeek: input.previousWeek ?? [],
    limiterProfile: input.limiterProfile,
  });

  return {
    ...plan,
    sessions: nextSessions,
    quality,
    guardrails: unique([
      ...plan.guardrails,
      'Long-course bike volume uses one Saturday/Sunday long-ride anchor; remaining bike sessions support that anchor rather than becoming multiple pseudo-long rides.',
    ]),
  };
}

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function roundToFive(value: number): number {
  return Math.round(value / 5) * 5;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
