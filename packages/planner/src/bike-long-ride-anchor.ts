import type {
  WholeAthletePlannedSession,
  WholeAthleteWeeklyPlannerInput,
  WholeAthleteWeekPlan,
} from './whole-athlete-week';
import { validateUnifiedWeek } from './unified-training';

const LONG_RIDE_MINUTES = 180;
const LONG_RIDE_MAX_MINUTES_70_3 = 270;
const LONG_RIDE_MAX_MINUTES_FULL = 300;
const LONG_RIDE_SHARE = 0.5;
const LONG_RIDE_WEEKLY_STEP_MINUTES = 30;

const QUALITY_RIDE_TARGET_MINUTES = 105;
const QUALITY_RIDE_MIN_MINUTES = 75;
const QUALITY_RIDE_MAX_MINUTES = 120;

const SUPPORT_RIDE_FLOOR_MINUTES = 45;
const SUPPORT_RIDE_MIN_FALLBACK = 35;
const SUPPORT_RIDE_MAX_MINUTES = 120;
const MAX_AUTOMATIC_BIKE_FREQUENCY = 5;

const ADAPTIVE_FREQUENCY_REFLOW_PREFIX = 'Adaptive frequency reflow:';

/**
 * Long-course bike volume is expressed through roles and real availability,
 * not by making every ride longer.
 *
 * This pass preserves the already-approved weekly bike minutes whenever those
 * minutes can fit the athlete's saved windows. It then:
 *
 * - keeps one controlled weekday quality ride;
 * - concentrates durability into one weekend long ride;
 * - derives the number of support rides from the remaining bike minutes;
 * - caps every generated bike to the longest continuous window on that day;
 * - adds an easy support/recovery ride before inflating a weekday ride beyond
 *   its role or availability cap;
 * - trims only the unplaceable remainder when the saved week genuinely cannot
 *   hold the approved bike target.
 */
export function applyWeekendLongRideAnchor(
  plan: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthleteWeekPlan {
  if (input.goalType !== 'ironman_70_3' && input.goalType !== 'ironman_full') return plan;
  if (plan.planningState !== 'build' || input.phase === 'taper' || input.phase === 'race_week') return plan;

  let sessions = plan.sessions.map((session) => ({
    ...session,
    rationale: [...session.rationale],
  }));

  const initialBikes = bikeEntries(sessions);
  if (initialBikes.length < 3) return plan;

  const totalBikeMinutes = totalMinutes(initialBikes.map(({ session }) => session));
  const qualityEntry = chooseQualityBike(initialBikes, input);
  const longEntry = chooseLongBike(initialBikes, input);
  if (!longEntry) return plan;

  const qualityTarget = qualityEntry
    ? Math.min(
        QUALITY_RIDE_TARGET_MINUTES,
        bikeRoleCap(input, qualityEntry.session.date, 'quality'),
      )
    : QUALITY_RIDE_TARGET_MINUTES;
  const desiredLongRideMinutes = desiredLongRideTarget(
    totalBikeMinutes,
    longEntry.session.date,
    input,
  );

  const desiredBikeCount = requiredBikeFrequency(
    totalBikeMinutes,
    qualityTarget,
    desiredLongRideMinutes,
  );

  while (countDiscipline(sessions, 'bike') < desiredBikeCount) {
    let date = chooseSupportBikeDate(sessions, input, longEntry.session.date);

    if (!date) {
      const reflowed = reflowEasySwimForSupportBike(
        sessions,
        input,
        longEntry.session.date,
      );
      if (reflowed) {
        sessions = reflowed;
        date = chooseSupportBikeDate(sessions, input, longEntry.session.date);
      }
    }

    if (!date) break;
    sessions.push(createSupportBike(date, countDiscipline(sessions, 'bike')));
    sessions.sort(sortSessions);
  }

  const currentBikes = bikeEntries(sessions);
  const currentQuality = qualityEntry
    ? currentBikes.find(({ session }) => session.id === qualityEntry.session.id)
    : chooseQualityBike(currentBikes, input);
  const currentLong = currentBikes.find(({ session }) => session.id === longEntry.session.id)
    ?? chooseLongBike(currentBikes, input);
  if (!currentLong) return plan;

  const distribution = distributeGeneratedBikeMinutes({
    sessions,
    totalBikeMinutes,
    qualityId: currentQuality?.session.id,
    longId: currentLong.session.id,
    desiredLongRideMinutes,
    input,
  });
  sessions = distribution.sessions.sort(sortSessions);

  const plannedMinutes = totalMinutes(sessions);
  const generatedMinutes = totalMinutes(
    sessions.filter((session) => session.planningCommitment === 'generated'),
  );
  const finalBikeMinutes = totalMinutes(
    sessions.filter((session) => session.discipline === 'bike'),
  );
  const finalBikeCount = countDiscipline(sessions, 'bike');

  const quality = validateUnifiedWeek(sessions, {
    availableMinutes: input.availableMinutes,
    phase: input.phase,
    goalType: input.goalType,
    recentBoneStress: input.recentBoneStress
      ?? (input.health.boneStress === 'recent' || input.health.boneStress === 'active'),
    returnToRun: input.returnToRun ?? false,
    previousWeek: input.previousWeek ?? [],
    limiterProfile: input.limiterProfile,
  });

  const disciplineSummary = plan.disciplineSummary.map((summary) => {
    if (summary.discipline !== 'bike') return summary;
    return {
      ...summary,
      sessions: finalBikeCount,
      minutes: finalBikeMinutes,
      targetPreferred: Math.max(summary.targetPreferred, finalBikeCount),
    };
  });

  const unplacedMinutes = Math.max(0, totalBikeMinutes - finalBikeMinutes);

  return {
    ...plan,
    sessions,
    plannedMinutes,
    generatedMinutes,
    disciplineSummary,
    doubleDays: summarizeDoubleDays(sessions),
    quality,
    warnings: unique([
      ...plan.warnings,
      unplacedMinutes > 0
        ? `${unplacedMinutes} bike minutes were removed because the approved bike target could not fit the athlete's saved continuous training windows without exceeding role-duration or daily-session limits.`
        : '',
    ]),
    guardrails: unique([
      ...plan.guardrails,
      'Long-course bike frequency emerges from approved bike minutes plus quality/support/long-ride duration caps; excess volume creates another easy support ride before a weekday ride is inflated.',
      'Every generated bike must fit the athlete’s longest saved continuous window on its assigned day.',
      'Bike quality is a controlled weekday session with total ride duration governed separately from the weekend durability anchor.',
      'Long-course bike volume uses one Saturday/Sunday long-ride anchor; remaining bike sessions support that anchor rather than becoming multiple pseudo-long rides.',
    ]),
  };
}

function distributeGeneratedBikeMinutes({
  sessions,
  totalBikeMinutes,
  qualityId,
  longId,
  desiredLongRideMinutes,
  input,
}: {
  sessions: WholeAthletePlannedSession[];
  totalBikeMinutes: number;
  qualityId: string | undefined;
  longId: string;
  desiredLongRideMinutes: number;
  input: WholeAthleteWeeklyPlannerInput;
}): { sessions: WholeAthletePlannedSession[] } {
  const next = sessions.map((session) => ({ ...session, rationale: [...session.rationale] }));
  const generated = next.filter((session) =>
    session.discipline === 'bike'
    && session.planningCommitment === 'generated');
  if (!generated.length) return { sessions: next };

  const fixedBikeMinutes = totalMinutes(next.filter((session) =>
    session.discipline === 'bike'
    && session.planningCommitment !== 'generated'));
  const generatedTarget = Math.max(0, totalBikeMinutes - fixedBikeMinutes);

  const allocations = new Map<string, number>();
  const caps = new Map<string, number>();

  const quality = generated.find((session) => session.id === qualityId);
  const long = generated.find((session) => session.id === longId);
  const supports = generated
    .filter((session) => session.id !== quality?.id && session.id !== long?.id)
    .sort((left, right) => supportAllocationOrder(left, right));

  for (const session of generated) {
    const role = session.id === quality?.id
      ? 'quality'
      : session.id === long?.id
        ? 'long'
        : 'support';
    caps.set(session.id, bikeRoleCap(input, session.date, role));
  }

  if (quality) {
    allocations.set(
      quality.id,
      roundToFive(Math.min(
        QUALITY_RIDE_TARGET_MINUTES,
        caps.get(quality.id) ?? QUALITY_RIDE_MAX_MINUTES,
      )),
    );
  }

  if (long) {
    allocations.set(
      long.id,
      roundToFive(Math.min(
        desiredLongRideMinutes,
        caps.get(long.id) ?? desiredLongRideMinutes,
      )),
    );
  }

  for (const support of supports) {
    allocations.set(
      support.id,
      roundToFive(Math.min(
        SUPPORT_RIDE_FLOOR_MINUTES,
        caps.get(support.id) ?? SUPPORT_RIDE_FLOOR_MINUTES,
      )),
    );
  }

  // Low-volume long-course weeks may not have enough bike minutes for the
  // preferred 105-minute quality target plus a 180-minute long ride and a
  // support exposure. Reduce quality first to 75 minutes, then long-ride time
  // above 180, then support rides to a 35-minute fallback floor.
  let allocated = allocatedMinutes(allocations);
  while (allocated > generatedTarget) {
    let changed = false;

    if (quality) {
      const current = allocations.get(quality.id) ?? 0;
      const floor = Math.min(
        QUALITY_RIDE_MIN_MINUTES,
        caps.get(quality.id) ?? QUALITY_RIDE_MIN_MINUTES,
      );
      if (current > floor) {
        allocations.set(quality.id, current - 5);
        allocated -= 5;
        changed = true;
      }
    }
    if (allocated <= generatedTarget) break;

    if (long) {
      const current = allocations.get(long.id) ?? 0;
      const floor = Math.min(
        LONG_RIDE_MINUTES,
        caps.get(long.id) ?? LONG_RIDE_MINUTES,
      );
      if (current > floor) {
        allocations.set(long.id, current - 5);
        allocated -= 5;
        changed = true;
      }
    }
    if (allocated <= generatedTarget) break;

    for (const support of [...supports].reverse()) {
      if (allocated <= generatedTarget) break;
      const current = allocations.get(support.id) ?? 0;
      const floor = Math.min(
        SUPPORT_RIDE_MIN_FALLBACK,
        caps.get(support.id) ?? SUPPORT_RIDE_MIN_FALLBACK,
      );
      if (current <= floor) continue;
      allocations.set(support.id, current - 5);
      allocated -= 5;
      changed = true;
    }

    if (!changed) break;
  }

  // After the role-defining targets are protected, remaining approved bike
  // minutes go to the primary support ride first. A weekend recovery/coffee
  // spin therefore stays short instead of becoming another pseudo-long ride.
  let remaining = Math.max(0, generatedTarget - allocatedMinutes(allocations));
  for (const support of supports) {
    if (remaining <= 0) break;
    remaining = addMinutesUpToCap(
      allocations,
      support.id,
      caps.get(support.id) ?? SUPPORT_RIDE_MAX_MINUTES,
      remaining,
    );
  }

  if (remaining > 0 && long) {
    remaining = addMinutesUpToCap(
      allocations,
      long.id,
      caps.get(long.id) ?? desiredLongRideMinutes,
      remaining,
    );
  }
  if (remaining > 0 && quality) {
    remaining = addMinutesUpToCap(
      allocations,
      quality.id,
      caps.get(quality.id) ?? QUALITY_RIDE_MAX_MINUTES,
      remaining,
    );
  }

  for (const session of next) {
    if (session.discipline !== 'bike' || session.planningCommitment !== 'generated') continue;
    const minutes = allocations.get(session.id);
    if (minutes === undefined) continue;

    session.durationMinutes = minutes;

    if (session.id === long?.id) {
      session.title = input.developmentWeek?.longRide.title ?? 'Long Ride · Long Aerobic';
      session.intensity = session.intensity === 'hard' || session.intensity === 'max'
        ? 'moderate'
        : session.intensity;
      session.keySession = true;
      session.rationale = unique([
        ...session.rationale,
        'This is the week’s long-ride durability anchor; long-course volume is concentrated here rather than spread across several medium-long rides.',
        `Long-ride duration is ${minutes} minutes and fits the saved continuous training window for this day.`,
        input.developmentWeek ? `Season objective: ${input.developmentWeek.longRide.objective}` : '',
      ]);
      continue;
    }

    if (session.id === quality?.id) {
      session.keySession = true;
      session.rationale = unique([
        ...session.rationale,
        `Bike-quality total duration is capped at ${minutes} minutes; workout-specific quality minutes are governed inside that approved ride rather than by inflating the entire session.`,
      ]);
      continue;
    }

    const weekend = weekdayIndex(session.date) >= 5;
    session.title = weekend && minutes <= 60
      ? 'Recovery Spin · Aerobic Reset'
      : input.developmentWeek?.bikeSupport.title ?? 'Aerobic · Endurance Support';
    session.intensity = 'easy';
    session.keySession = false;
    session.recoveryCost = Math.min(session.recoveryCost, 2) as 0 | 1 | 2 | 3 | 4 | 5;
    session.rationale = unique([
      ...session.rationale,
      weekend && minutes <= 60
        ? 'Short weekend support spin absorbs useful low-impact bike frequency without turning the day into another key workout.'
        : 'Support ride duration is subordinate to the weekday quality session and weekend long-ride anchor.',
      `This ride fits inside the saved continuous training window for ${weekdayName(weekdayIndex(session.date))}.`,
      input.developmentWeek && !(weekend && minutes <= 60)
        ? `Season objective: ${input.developmentWeek.bikeSupport.objective}`
        : '',
    ]);
  }

  return { sessions: next };
}

function requiredBikeFrequency(
  totalBikeMinutes: number,
  qualityTargetMinutes: number,
  longTargetMinutes: number,
): number {
  const remainingAfterKeyRoles = Math.max(
    0,
    totalBikeMinutes - qualityTargetMinutes - longTargetMinutes,
  );
  const supportCount = Math.max(
    1,
    Math.ceil(remainingAfterKeyRoles / SUPPORT_RIDE_MAX_MINUTES),
  );
  return clampInt(2 + supportCount, 3, MAX_AUTOMATIC_BIKE_FREQUENCY);
}

function desiredLongRideTarget(
  totalBikeMinutes: number,
  date: string,
  input: WholeAthleteWeeklyPlannerInput,
): number {
  const goalCap = input.goalType === 'ironman_full'
    ? LONG_RIDE_MAX_MINUTES_FULL
    : LONG_RIDE_MAX_MINUTES_70_3;
  const windowCap = bikeRoleCap(input, date, 'long');
  const shareTarget = roundToFive(clamp(
    totalBikeMinutes * LONG_RIDE_SHARE,
    LONG_RIDE_MINUTES,
    goalCap,
  ));

  const previousLongest = Math.max(
    0,
    input.baselines?.bike?.longestSessionMinutes ?? 0,
    ...(input.previousWeek ?? [])
      .filter((session) => session.discipline === 'bike')
      .map((session) => session.durationMinutes),
  );
  const progressionCap = previousLongest > 0
    ? roundToFive(Math.max(
        LONG_RIDE_MINUTES,
        previousLongest + LONG_RIDE_WEEKLY_STEP_MINUTES,
      ))
    : goalCap;

  return roundToFive(Math.min(
    shareTarget,
    goalCap,
    windowCap,
    progressionCap,
  ));
}

function chooseQualityBike(
  entries: Array<{ session: WholeAthletePlannedSession; index: number }>,
  input: WholeAthleteWeeklyPlannerInput,
): { session: WholeAthletePlannedSession; index: number } | undefined {
  const hard = entries.filter(({ session }) => isHard(session));
  if (hard.length === 1) return hard[0];

  const preferred = input.weeklySchedule?.hardBikeDay;
  if (preferred !== undefined) {
    const configured = entries.find(({ session }) => weekdayIndex(session.date) === preferred);
    if (configured) return configured;
  }

  return entries
    .filter(({ session }) => weekdayIndex(session.date) < 5)
    .sort((left, right) => left.session.date.localeCompare(right.session.date))[0];
}

function chooseLongBike(
  entries: Array<{ session: WholeAthletePlannedSession; index: number }>,
  input: WholeAthleteWeeklyPlannerInput,
): { session: WholeAthletePlannedSession; index: number } | undefined {
  const generated = entries.filter(({ session }) =>
    session.planningCommitment === 'generated'
    && !isHard(session));
  if (!generated.length) return undefined;

  const configured = input.weeklySchedule?.longBikeDay;
  return [...generated].sort((left, right) => {
    const leftWeekday = weekdayIndex(left.session.date);
    const rightWeekday = weekdayIndex(right.session.date);
    const leftConfigured = configured !== undefined && leftWeekday === configured ? 1 : 0;
    const rightConfigured = configured !== undefined && rightWeekday === configured ? 1 : 0;
    const leftWeekend = leftWeekday >= 5 ? 1 : 0;
    const rightWeekend = rightWeekday >= 5 ? 1 : 0;
    const leftWindow = continuousWindowMinutes(input, leftWeekday, LONG_RIDE_MAX_MINUTES_FULL);
    const rightWindow = continuousWindowMinutes(input, rightWeekday, LONG_RIDE_MAX_MINUTES_FULL);

    return rightConfigured - leftConfigured
      || rightWeekend - leftWeekend
      || rightWindow - leftWindow
      || leftWeekday - rightWeekday
      || right.session.durationMinutes - left.session.durationMinutes;
  })[0];
}

function chooseSupportBikeDate(
  sessions: WholeAthletePlannedSession[],
  input: WholeAthleteWeeklyPlannerInput,
  longRideDate: string,
): string | null {
  const restDays = new Set(input.weeklySchedule?.restDays ?? []);
  const longWeekday = weekdayIndex(longRideDate);

  const candidates = Array.from({ length: 7 }, (_, weekday) => weekday)
    .filter((weekday) => !restDays.has(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6))
    .filter((weekday) => bikeAvailableOnWeekday(input, weekday))
    .map((weekday) => {
      const date = addDays(input.weekStartDate, weekday);
      const day = sessions.filter((session) => session.date === date && isTrainable(session));
      const hasBike = day.some((session) => session.discipline === 'bike');
      const canPair = day.length === 0
        || (day.length === 1 && compatibleSupportBikePair(day[0]!));
      const window = continuousWindowMinutes(input, weekday, SUPPORT_RIDE_MAX_MINUTES);
      const weekendSupport = weekday >= 5 && weekday !== longWeekday ? 1 : 0;
      return { weekday, date, day, hasBike, canPair, window, weekendSupport };
    })
    .filter((candidate) =>
      !candidate.hasBike
      && candidate.day.length < 2
      && candidate.canPair
      && candidate.window >= SUPPORT_RIDE_MIN_FALLBACK)
    .sort((left, right) =>
      right.weekendSupport - left.weekendSupport
      || right.window - left.window
      || right.weekday - left.weekday);

  return candidates[0]?.date ?? null;
}

function reflowEasySwimForSupportBike(
  sessions: WholeAthletePlannedSession[],
  input: WholeAthleteWeeklyPlannerInput,
  longRideDate: string,
): WholeAthletePlannedSession[] | null {
  const longWeekday = weekdayIndex(longRideDate);
  const restDays = new Set(input.weeklySchedule?.restDays ?? []);

  const sourceCandidates = Array.from({ length: 7 }, (_, weekday) => weekday)
    .filter((weekday) => !restDays.has(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6))
    .filter((weekday) => bikeAvailableOnWeekday(input, weekday))
    .map((weekday) => {
      const date = addDays(input.weekStartDate, weekday);
      const day = sessions.filter((session) => session.date === date && isTrainable(session));
      const swim = day.find(isMovableEasySwim);
      const easyRun = day.find((session) =>
        session.discipline === 'run'
        && session.intensity === 'easy'
        && session.recoveryCost <= 2);
      return { weekday, date, day, swim, easyRun };
    })
    .filter((candidate) =>
      candidate.day.length === 2
      && candidate.swim
      && candidate.easyRun
      && !candidate.day.some((session) => session.discipline === 'bike'))
    .sort((left, right) => {
      const leftWeekendSupport = left.weekday >= 5 && left.weekday !== longWeekday ? 1 : 0;
      const rightWeekendSupport = right.weekday >= 5 && right.weekday !== longWeekday ? 1 : 0;
      return rightWeekendSupport - leftWeekendSupport || right.weekday - left.weekday;
    });

  for (const source of sourceCandidates) {
    const swim = source.swim!;
    const destinationCandidates = Array.from({ length: 7 }, (_, weekday) => weekday)
      .filter((weekday) => !restDays.has(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6))
      .filter((weekday) => weekday !== source.weekday)
      .filter((weekday) => swimAvailableOnWeekday(input, weekday))
      .map((weekday) => {
        const date = addDays(input.weekStartDate, weekday);
        const day = sessions.filter((session) => session.date === date && isTrainable(session));
        const bike = day.find((session) => session.discipline === 'bike');
        const longLike = date === longRideDate || (bike && /\blong\b/i.test(bike.title));
        return { weekday, date, day, bike, longLike };
      })
      .filter((candidate) =>
        candidate.day.length === 1
        && candidate.bike
        && !candidate.day.some((session) => session.discipline === 'swim')
        && !isHard(candidate.bike))
      .sort((left, right) =>
        Number(right.longLike) - Number(left.longLike)
        || Number(right.weekday >= 5) - Number(left.weekday >= 5)
        || left.weekday - right.weekday);

    const destination = destinationCandidates[0];
    if (!destination) continue;

    return sessions.map((session) => session.id === swim.id
      ? {
          ...session,
          date: destination.date,
          rationale: unique([
            ...session.rationale,
            `${ADAPTIVE_FREQUENCY_REFLOW_PREFIX} moved this easy swim to ${weekdayName(destination.weekday)} beside the existing long/support bike so approved bike volume can use another short support ride on ${weekdayName(source.weekday)} without creating a triple day or reducing return-to-run frequency.`,
          ]),
        }
      : { ...session, rationale: [...session.rationale] });
  }

  return null;
}

function createSupportBike(
  date: string,
  index: number,
): WholeAthletePlannedSession {
  return {
    id: `bike_volume_support_${date}_${index + 1}`,
    date,
    title: weekdayIndex(date) >= 5
      ? 'Recovery Spin · Easy Aerobic'
      : 'Aerobic · Endurance Support',
    discipline: 'bike',
    durationMinutes: SUPPORT_RIDE_FLOOR_MINUTES,
    intensity: 'easy',
    cardiovascularDemand: 'low',
    musculoskeletalDemand: 'low',
    lowerBodyDemand: 'moderate',
    upperBodyDemand: 'none',
    impact: 'none',
    technicalDemand: 'moderate',
    recoveryCost: 1,
    priority: 'recommended',
    source: 'side_quest',
    keySession: false,
    planningCommitment: 'generated',
    rationale: [
      'Added because the approved weekly bike minutes cannot be expressed coherently through only one quality ride, one support ride, and one long ride inside their role and availability caps.',
    ],
    healthAdjusted: false,
    progressionTarget: 'bike_volume',
  };
}

function bikeRoleCap(
  input: WholeAthleteWeeklyPlannerInput,
  date: string,
  role: 'quality' | 'long' | 'support',
): number {
  const weekday = weekdayIndex(date);
  const roleCap = role === 'quality'
    ? QUALITY_RIDE_MAX_MINUTES
    : role === 'long'
      ? input.goalType === 'ironman_full'
        ? LONG_RIDE_MAX_MINUTES_FULL
        : LONG_RIDE_MAX_MINUTES_70_3
      : SUPPORT_RIDE_MAX_MINUTES;
  return Math.max(0, Math.min(
    roleCap,
    continuousWindowMinutes(input, weekday, roleCap),
  ));
}

function continuousWindowMinutes(
  input: WholeAthleteWeeklyPlannerInput,
  weekday: number,
  fallback: number,
): number {
  const configured = input.weeklySchedule?.maxContinuousMinutesByDay?.[
    weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6
  ];
  return configured === undefined ? fallback : Math.max(0, configured);
}

function bikeAvailableOnWeekday(
  input: WholeAthleteWeeklyPlannerInput,
  weekday: number,
): boolean {
  const allowed = input.weeklySchedule?.availableDays?.bike;
  if (allowed?.length && !allowed.includes(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6)) return false;
  return continuousWindowMinutes(input, weekday, SUPPORT_RIDE_MAX_MINUTES) >= SUPPORT_RIDE_MIN_FALLBACK;
}

function swimAvailableOnWeekday(
  input: WholeAthleteWeeklyPlannerInput,
  weekday: number,
): boolean {
  const allowed = input.weeklySchedule?.availableDays?.swim;
  return !allowed?.length || allowed.includes(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6);
}

function compatibleSupportBikePair(existing: WholeAthletePlannedSession): boolean {
  if (existing.discipline === 'rest') return false;
  if (isHard(existing) || existing.recoveryCost >= 4) return false;
  if (existing.discipline === 'swim') return true;
  if (existing.discipline === 'run') {
    return existing.intensity === 'easy' && existing.recoveryCost <= 2;
  }
  if (existing.discipline === 'strength') {
    return existing.intensity === 'easy'
      && existing.lowerBodyDemand !== 'high'
      && existing.recoveryCost <= 2;
  }
  return false;
}

function isMovableEasySwim(session: WholeAthletePlannedSession): boolean {
  return session.discipline === 'swim'
    && session.planningCommitment === 'generated'
    && session.intensity === 'easy'
    && !session.keySession
    && session.recoveryCost <= 2;
}

function supportAllocationOrder(
  left: WholeAthletePlannedSession,
  right: WholeAthletePlannedSession,
): number {
  const leftWeekend = weekdayIndex(left.date) >= 5 ? 1 : 0;
  const rightWeekend = weekdayIndex(right.date) >= 5 ? 1 : 0;
  // Keep the weekend recovery/coffee spin shorter by allocating discretionary
  // support minutes to weekday support rides first.
  return leftWeekend - rightWeekend
    || left.date.localeCompare(right.date)
    || left.id.localeCompare(right.id);
}

function addMinutesUpToCap(
  allocations: Map<string, number>,
  id: string,
  cap: number,
  remaining: number,
): number {
  let nextRemaining = remaining;
  let current = allocations.get(id) ?? 0;
  while (nextRemaining >= 5 && current + 5 <= cap) {
    current += 5;
    nextRemaining -= 5;
  }
  allocations.set(id, current);
  return nextRemaining;
}

function allocatedMinutes(allocations: Map<string, number>): number {
  return [...allocations.values()].reduce((sum, minutes) => sum + minutes, 0);
}

function bikeEntries(sessions: WholeAthletePlannedSession[]) {
  return sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.discipline === 'bike');
}

function countDiscipline(
  sessions: WholeAthletePlannedSession[],
  discipline: 'bike',
): number {
  return sessions.filter((session) => session.discipline === discipline).length;
}

function summarizeDoubleDays(
  sessions: WholeAthletePlannedSession[],
): WholeAthleteWeekPlan['doubleDays'] {
  const byDate = new Map<string, WholeAthletePlannedSession[]>();
  for (const session of sessions.filter(isTrainable)) {
    const group = byDate.get(session.date) ?? [];
    group.push(session);
    byDate.set(session.date, group);
  }

  return [...byDate.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([date, items]) => ({
      date,
      sessionIds: items.map((session) => session.id),
      disciplines: items.map((session) => session.discipline).filter(isTrainableDiscipline),
      rationale: 'Intentional double day preserved because both sessions fit the weekly load and availability structure.',
      athleteSpecified: items.every((session) => session.planningCommitment !== 'generated'),
    }));
}

function isTrainable(
  session: Pick<WholeAthletePlannedSession, 'discipline'>,
): boolean {
  return isTrainableDiscipline(session.discipline);
}

function isTrainableDiscipline(
  discipline: WholeAthletePlannedSession['discipline'],
): discipline is 'swim' | 'bike' | 'run' | 'strength' {
  return discipline === 'swim'
    || discipline === 'bike'
    || discipline === 'run'
    || discipline === 'strength';
}

function isHard(
  session: Pick<WholeAthletePlannedSession, 'intensity' | 'recoveryCost'>,
): boolean {
  return session.intensity === 'hard'
    || session.intensity === 'max'
    || session.recoveryCost >= 4;
}

function totalMinutes(
  sessions: Array<Pick<WholeAthletePlannedSession, 'durationMinutes'>>,
): number {
  return sessions.reduce(
    (sum, session) => sum + Math.max(0, session.durationMinutes),
    0,
  );
}

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function weekdayName(weekday: number): string {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday]
    ?? 'another day';
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sortSessions(
  left: WholeAthletePlannedSession,
  right: WholeAthletePlannedSession,
): number {
  return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function roundToFive(value: number): number {
  return Math.round(value / 5) * 5;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
