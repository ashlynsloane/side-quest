import type {
  WholeAthletePlannedSession,
  WholeAthleteWeeklyPlannerInput,
  WholeAthleteWeekPlan,
} from './whole-athlete-week';

/**
 * A long-course bike-development week needs a workout, not only more easy minutes.
 *
 * Strategy owns the weekly bike allocation. Base, build, and peak phases may
 * all use one controlled bike-quality stimulus when bike volume is the approved
 * progression target. This pass changes the internal stimulus of one already-
 * approved weekday bike session without adding time.
 * Block rhythm runs after this and turns the generic quality marker into the
 * stage-specific bike workout family (threshold, over/under, long repeats).
 */
export function applyBikeQualityAnchor(
  plan: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthleteWeekPlan {
  if (input.phase !== 'base' && input.phase !== 'build' && input.phase !== 'peak') return plan;
  if (input.developmentWeek?.loadIntent === 'recovery') {
    return applyRaceHorizonRecoveryBikeWeek(plan, input);
  }
  if (plan.planningState !== 'build' || plan.weekDecision !== 'progress') return plan;
  if (plan.progressionBudget.primary !== 'bike_volume') return plan;

  const bikeEntries = plan.sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.discipline === 'bike');
  if (bikeEntries.length < 2) return plan;

  const preferredQualityWeekday = input.weeklySchedule?.hardBikeDay ?? 1;
  const generatedCandidates = bikeEntries
    .filter(({ session }) => session.planningCommitment === 'generated')
    .filter(({ session }) => weekdayIndex(session.date) < 5)
    .filter(({ session }) => !/long/i.test(session.title));

  const hardEntries = bikeEntries.filter(({ session }) => isHard(session));

  // The base planner may already have created one hard bike before this shaping
  // pass. If that generated hard ride landed on the wrong weekday, transfer the
  // quality ROLE to the configured anchor instead of accepting the drift.
  if (hardEntries.length === 1) {
    const currentHard = hardEntries[0]!;
    if (weekdayIndex(currentHard.session.date) === preferredQualityWeekday) return plan;
    if (currentHard.session.planningCommitment !== 'generated') return plan;

    const anchoredTarget = generatedCandidates
      .filter(({ index }) => index !== currentHard.index)
      .filter(({ session }) => weekdayIndex(session.date) === preferredQualityWeekday)
      .sort((left, right) => qualityCandidateScore(plan.sessions, right.session, preferredQualityWeekday)
        - qualityCandidateScore(plan.sessions, left.session, preferredQualityWeekday)
        || left.session.date.localeCompare(right.session.date))[0];

    const targetDate = addDays(input.weekStartDate, preferredQualityWeekday);

    if (anchoredTarget) {
      const sessions = plan.sessions.map((session, index) => {
        if (index === currentHard.index) return demoteBikeQuality(session);
        if (index === anchoredTarget.index) return promoteBikeQuality(session);
        return session;
      });

      return {
        ...plan,
        sessions,
        guardrails: unique([
          ...plan.guardrails,
          `Bike quality is anchored to the athlete's configured weekday rather than drifting to ${weekdayName(weekdayIndex(currentHard.session.date))}.`,
          'Bike-focused build weeks use one controlled bike-quality session plus one aerobic long ride; remaining rides stay supportive rather than becoming additional hard days.',
        ]),
      };
    }

    // There may be no bike already sitting on the configured quality weekday.
    // In that case move the generated quality ride itself when the target day
    // can safely accept it. This is the important fallback for a Tue-quality /
    // Thu-support / Sat-long structure.
    if (canMoveGeneratedHardBikeToDate(plan.sessions, currentHard.index, targetDate)) {
      const sessions = plan.sessions.map((session, index) => index === currentHard.index
        ? {
            ...session,
            date: targetDate,
            rationale: unique([
              ...session.rationale,
              `Moved to ${weekdayName(preferredQualityWeekday)} because that is the configured bike-quality anchor for this weekly schedule.`,
            ]),
          }
        : session);

      return {
        ...plan,
        sessions: sessions.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id)),
        guardrails: unique([
          ...plan.guardrails,
          `Bike quality is anchored to ${weekdayName(preferredQualityWeekday)} even when no support bike was already occupying that weekday.`,
          'Bike-focused build weeks use one controlled bike-quality session plus one aerobic long ride; remaining rides stay supportive rather than becoming additional hard days.',
        ]),
      };
    }

    return plan;
  }

  // Multiple hard bikes may include athlete/fixed work. Do not silently rewrite
  // those commitments here.
  if (hardEntries.length > 1) return plan;

  // The configured quality day can already be full before this pass. A common
  // triathlon case is Tuesday = generated strength + swim while a fourth,
  // low-priority support bike sits on Monday. Do not abandon the Tuesday bike
  // anchor or create a third session. Swap the generated strength into the
  // support bike's compatible source slot and move that support bike into the
  // quality slot.
  if (hardEntries.length === 0) {
    const swapped = anchorBikeQualityBySlotSwap(plan, input, preferredQualityWeekday);
    if (swapped) return swapped;
  }

  const candidates = generatedCandidates
    .sort((left, right) => qualityCandidateScore(plan.sessions, right.session, preferredQualityWeekday)
      - qualityCandidateScore(plan.sessions, left.session, preferredQualityWeekday)
      || left.session.date.localeCompare(right.session.date));

  const target = candidates[0];
  if (!target) return plan;

  const sessions = plan.sessions.map((session, index) =>
    index === target.index ? promoteBikeQuality(session) : session
  );

  return {
    ...plan,
    sessions,
    guardrails: unique([
      ...plan.guardrails,
      'Bike-focused build weeks use one controlled bike-quality session plus one aerobic long ride; remaining rides stay supportive rather than becoming additional hard days.',
    ]),
  };
}

function applyRaceHorizonRecoveryBikeWeek(
  plan: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthleteWeekPlan {
  let changed = false;
  const sessions = plan.sessions.map((session) => {
    if (
      session.discipline !== 'bike'
      || session.planningCommitment !== 'generated'
      || !isHard(session)
    ) return session;

    changed = true;
    return {
      ...demoteBikeQuality(session),
      title: input.developmentWeek?.bikeSupport.title ?? 'Aerobic · Cadence Economy',
      rationale: unique([
        ...session.rationale,
        'Race-horizon recovery week: the generated hard-bike stimulus is replaced by aerobic support so the previous block can be absorbed.',
      ]),
    };
  });

  if (!changed) return plan;
  return {
    ...plan,
    sessions,
    guardrails: unique([
      ...plan.guardrails,
      'Race-horizon recovery weeks do not add a generated hard bike session; fixed athlete commitments remain untouched.',
    ]),
  };
}

function anchorBikeQualityBySlotSwap(
  plan: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
  preferredQualityWeekday: number,
): WholeAthleteWeekPlan | null {
  const targetDate = addDays(input.weekStartDate, preferredQualityWeekday);
  const targetEntries = plan.sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.date === targetDate && isTrainable(session.discipline));

  // If a bike is already on the quality day, normal quality selection can
  // promote it without relocating anything.
  if (targetEntries.some(({ session }) => session.discipline === 'bike')) return null;

  const movableStrength = targetEntries.filter(({ session }) =>
    session.discipline === 'strength'
    && session.planningCommitment === 'generated'
    && session.intensity === 'easy'
    && session.recoveryCost <= 2
  );

  if (movableStrength.length !== 1) return null;

  // The slot swap is deliberately narrow: remove one generated easy strength
  // session from a target day otherwise containing only swim/support work.
  if (targetEntries.some(({ session }) =>
    session.discipline !== 'strength' && session.discipline !== 'swim'
  )) return null;

  const strength = movableStrength[0]!;
  const preferredBikeDays = input.weeklySchedule?.preferredDays?.bike ?? [];

  const supportBikes = plan.sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.discipline === 'bike')
    .filter(({ session }) => session.planningCommitment === 'generated')
    .filter(({ session }) => !isHard(session))
    .filter(({ session }) => !/long/i.test(session.title))
    .filter(({ session }) => session.date !== targetDate)
    .filter(({ index }) => canPlaceStrengthAfterBikeSwap(plan.sessions, strength.session, index))
    .sort((left, right) =>
      supportBikeMoveScore(right.session, preferredBikeDays)
      - supportBikeMoveScore(left.session, preferredBikeDays)
      || left.session.date.localeCompare(right.session.date)
    );

  const supportBike = supportBikes[0];
  if (!supportBike) return null;

  const sourceDate = supportBike.session.date;

  const sessions = plan.sessions.map((session, index) => {
    if (index === supportBike.index) {
      return promoteBikeQuality({
        ...session,
        date: targetDate,
        rationale: unique([
          ...session.rationale,
          `Moved to ${weekdayName(preferredQualityWeekday)} because that is the configured bike-quality anchor; the displaced generated strength session was moved into this ride's compatible support slot.`,
        ]),
      });
    }

    if (index === strength.index) {
      return {
        ...session,
        date: sourceDate,
        rationale: unique([
          ...session.rationale,
          `Moved from ${weekdayName(preferredQualityWeekday)} to preserve the configured bike-quality + swim training day without adding a third session.`,
        ]),
      };
    }

    return session;
  });

  return {
    ...plan,
    sessions: sessions.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id)),
    guardrails: unique([
      ...plan.guardrails,
      `Bike quality is anchored to ${weekdayName(preferredQualityWeekday)} by swapping only generated support work; athlete/fixed commitments are not moved.`,
      'The quality-day slot swap never creates a third daily session, same-discipline double, or training on the protected rest day.',
      'Bike-focused build weeks use one controlled bike-quality session plus one aerobic long ride; remaining rides stay supportive.',
    ]),
  };
}

function canPlaceStrengthAfterBikeSwap(
  sessions: WholeAthletePlannedSession[],
  strength: WholeAthletePlannedSession,
  bikeIndex: number,
): boolean {
  const bike = sessions[bikeIndex];
  if (!bike || bike.discipline !== 'bike' || bike.planningCommitment !== 'generated') return false;

  const remaining = sessions.filter((session, index) =>
    index !== bikeIndex
    && session.date === bike.date
    && isTrainable(session.discipline)
  );

  if (remaining.length >= 2) return false;
  if (remaining.some((session) => session.discipline === 'strength')) return false;

  if (!remaining.length) return true;

  const existing = remaining[0]!;
  if (existing.planningCommitment !== 'generated' && isHard(existing)) return false;

  if (existing.discipline === 'swim') return true;

  if (existing.discipline === 'run') {
    return strength.intensity === 'easy'
      && strength.recoveryCost <= 2
      && !isHard(existing)
      && existing.lowerBodyDemand !== 'high';
  }

  return false;
}

function supportBikeMoveScore(
  bike: WholeAthletePlannedSession,
  preferredBikeDays: number[],
): number {
  const weekday = weekdayIndex(bike.date);
  const preferenceIndex = preferredBikeDays.indexOf(weekday);

  // Later entries in the athlete's bike preference order are more disposable
  // support slots. Unlisted generated support days are the most movable.
  let score = preferenceIndex === -1 ? 100 : preferenceIndex * 24;

  if (bike.intensity === 'easy') score += 12;
  if (!bike.keySession) score += 12;
  if (bike.recoveryCost <= 1) score += 8;

  return score;
}

function canMoveGeneratedHardBikeToDate(
  sessions: WholeAthletePlannedSession[],
  sourceIndex: number,
  targetDate: string,
): boolean {
  const source = sessions[sourceIndex];
  if (!source || source.discipline !== 'bike' || source.planningCommitment !== 'generated') return false;

  const others = sessions.filter((_, index) => index !== sourceIndex);
  const sameDay = others.filter((session) => session.date === targetDate && isTrainable(session.discipline));

  if (sameDay.some((session) => session.discipline === 'bike')) return false;
  if (sameDay.length >= 2) return false;

  // A hard bike may deliberately share a triathlon quality day with a swim.
  // It may not be silently stacked with run or strength work.
  if (sameDay.some((session) => session.discipline !== 'swim')) return false;

  // Do not move the quality bike next to another hard athlete commitment.
  const adjacentHard = others.some((session) =>
    isHard(session)
    && Math.abs(dayDifference(session.date, targetDate)) <= 1
    && session.planningCommitment !== 'generated'
  );
  if (adjacentHard) return false;

  return true;
}

function isTrainable(value: string): boolean {
  return value === 'swim' || value === 'bike' || value === 'run' || value === 'strength';
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function promoteBikeQuality(session: WholeAthletePlannedSession): WholeAthletePlannedSession {
  return {
    ...session,
    title: 'Bike quality',
    intensity: 'hard',
    cardiovascularDemand: 'high',
    musculoskeletalDemand: 'moderate',
    lowerBodyDemand: 'high',
    recoveryCost: 4,
    priority: 'required',
    keySession: true,
    progressionTarget: 'bike_volume',
    rationale: unique([
      ...session.rationale,
      'This is the week’s controlled bike-development workout. It adds race-specific cycling quality without adding impact or increasing the approved weekly duration.',
    ]),
  };
}

function demoteBikeQuality(session: WholeAthletePlannedSession): WholeAthletePlannedSession {
  return {
    ...session,
    title: /long/i.test(session.title) ? session.title : 'Aerobic · Endurance Support',
    intensity: 'easy',
    cardiovascularDemand: 'low',
    musculoskeletalDemand: 'low',
    lowerBodyDemand: 'moderate',
    recoveryCost: 1,
    priority: 'recommended',
    keySession: false,
    progressionTarget: 'bike_volume',
    rationale: unique([
      ...session.rationale,
      'Bike-quality stimulus was reassigned to the configured quality day; this ride remains supportive aerobic volume.',
    ]),
  };
}

function weekdayName(weekday: number): string {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday] ?? 'another weekday';
}

function qualityCandidateScore(
  sessions: WholeAthletePlannedSession[],
  candidate: WholeAthletePlannedSession,
  preferredQualityWeekday: number,
): number {
  const weekday = weekdayIndex(candidate.date);
  const sameDay = sessions.filter((session) => session.id !== candidate.id && session.date === candidate.date);
  const adjacentHard = sessions.some((session) => session.id !== candidate.id && isHard(session) && Math.abs(dayDifference(session.date, candidate.date)) <= 1);
  let score = 0;

  // The weekly schedule owns the quality-bike weekday. A same-day swim is a
  // feature, not a reason to push bike quality onto Wednesday: triathlon
  // quality days deliberately consolidate compatible work.
  if (weekday === preferredQualityWeekday) score += 72;
  else score -= Math.abs(weekday - preferredQualityWeekday) * 8;

  if (sameDay.some((session) => session.discipline === 'swim')) score += 24;
  else if (!sameDay.length) score += 10;
  if (sameDay.some((session) => session.discipline === 'run' || session.discipline === 'strength')) score -= 20;
  if (!adjacentHard) score += 20;
  if (candidate.durationMinutes >= 60 && candidate.durationMinutes <= 120) score += 8;
  return score;
}

function isHard(session: Pick<WholeAthletePlannedSession, 'intensity' | 'recoveryCost'>): boolean {
  return session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4;
}

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function dayDifference(left: string, right: string): number {
  return Math.round((Date.parse(`${right}T12:00:00Z`) - Date.parse(`${left}T12:00:00Z`)) / 86_400_000);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
