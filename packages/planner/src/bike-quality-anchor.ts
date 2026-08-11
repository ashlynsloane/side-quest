import type {
  WholeAthletePlannedSession,
  WholeAthleteWeeklyPlannerInput,
  WholeAthleteWeekPlan,
} from './whole-athlete-week';

/**
 * A bike-development block needs a workout, not only more easy minutes.
 *
 * Strategy owns the weekly bike allocation. This pass changes the internal
 * stimulus of one already-approved weekday bike session without adding time.
 * Block rhythm runs after this and turns the generic quality marker into the
 * stage-specific bike workout family (threshold, over/under, long repeats).
 */
export function applyBikeQualityAnchor(
  plan: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthleteWeekPlan {
  if (input.phase !== 'build' && input.phase !== 'peak') return plan;
  if (plan.planningState !== 'build' || plan.weekDecision !== 'progress') return plan;
  if (plan.progressionBudget.primary !== 'bike_volume') return plan;

  const bikes = plan.sessions.filter((session) => session.discipline === 'bike');
  if (bikes.length < 2 || bikes.some(isHard)) return plan;

  const candidates = plan.sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.discipline === 'bike')
    .filter(({ session }) => session.planningCommitment === 'generated')
    .filter(({ session }) => weekdayIndex(session.date) < 5)
    .filter(({ session }) => !/long/i.test(session.title))
    .sort((left, right) => qualityCandidateScore(plan.sessions, right.session) - qualityCandidateScore(plan.sessions, left.session)
      || left.session.date.localeCompare(right.session.date));

  const target = candidates[0];
  if (!target) return plan;

  const sessions = plan.sessions.map((session, index) => {
    if (index !== target.index) return session;
    return {
      ...session,
      title: 'Bike quality',
      intensity: 'hard' as const,
      cardiovascularDemand: 'high' as const,
      musculoskeletalDemand: 'moderate' as const,
      lowerBodyDemand: 'high' as const,
      recoveryCost: 4 as const,
      priority: 'required' as const,
      keySession: true,
      progressionTarget: 'bike_volume' as const,
      rationale: unique([
        ...session.rationale,
        'This is the week’s controlled bike-development workout. It adds race-specific cycling quality without adding impact or increasing the approved weekly duration.',
      ]),
    };
  });

  return {
    ...plan,
    sessions,
    guardrails: unique([
      ...plan.guardrails,
      'Bike-focused build weeks use one controlled bike-quality session plus one aerobic long ride; remaining rides stay supportive rather than becoming additional hard days.',
    ]),
  };
}

function qualityCandidateScore(
  sessions: WholeAthletePlannedSession[],
  candidate: WholeAthletePlannedSession,
): number {
  const weekday = weekdayIndex(candidate.date);
  const sameDay = sessions.filter((session) => session.id !== candidate.id && session.date === candidate.date);
  const adjacentHard = sessions.some((session) => session.id !== candidate.id && isHard(session) && Math.abs(dayDifference(session.date, candidate.date)) <= 1);
  let score = 0;

  // Early-week quality leaves room before the weekend long ride.
  if (weekday === 0) score += 24;
  else if (weekday === 1) score += 18;
  else if (weekday === 2) score += 12;
  else if (weekday === 3) score += 6;

  if (!sameDay.length) score += 18;
  if (!sameDay.some((session) => session.discipline === 'run' || session.discipline === 'strength')) score += 12;
  if (!adjacentHard) score += 20;
  if (candidate.durationMinutes >= 75 && candidate.durationMinutes <= 120) score += 8;
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
