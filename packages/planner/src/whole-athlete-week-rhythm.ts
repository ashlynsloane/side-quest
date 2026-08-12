import {
  buildWholeAthleteWeek as buildBaseWholeAthleteWeek,
  type WholeAthletePlannedSession,
  type WholeAthleteWeekPlan,
  type WholeAthleteWeeklyPlannerInput,
  type TrainableDiscipline,
} from './whole-athlete-week';
import { validateUnifiedWeek, type UnifiedTrainingSession } from './unified-training';
import type { RaceHorizonDevelopmentWeek, RaceHorizonWorkoutObjective } from './race-development-types';

export * from './whole-athlete-week';

export type BlockWorkoutStage = 0 | 1 | 2 | 3;

export interface TrainingWorkoutIdentity {
  familyId: string;
  variantId: string;
  blockStage: BlockWorkoutStage;
  role: string;
  benchmarkRepeat: boolean;
}

type RhythmedSession = WholeAthletePlannedSession & {
  trainingIdentity?: TrainingWorkoutIdentity;
};

type PreviousRhythmedSession = UnifiedTrainingSession & {
  planningCommitment?: WholeAthletePlannedSession['planningCommitment'];
  trainingIdentity?: TrainingWorkoutIdentity;
};

const TRAINABLE = new Set<TrainableDiscipline>(['swim', 'bike', 'run', 'strength']);
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Standalone rhythm-aware planner retained for isolated block-rhythm tests. */
export function buildWholeAthleteWeek(input: WholeAthleteWeeklyPlannerInput): WholeAthleteWeekPlan {
  return applyTrainingBlockRhythm(buildBaseWholeAthleteWeek(input), input);
}

/**
 * Apply longitudinal block behavior to an already-governed week plan.
 *
 * This deliberately runs after safety / race strategy has decided what work is
 * allowed. Rhythm may move generated work to an established weekday and may
 * change the internal workout family, but it never increases duration or
 * intensity beyond the supplied plan.
 */
export function applyTrainingBlockRhythm(
  base: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthleteWeekPlan {
  const previous = (input.previousWeek ?? []) as PreviousRhythmedSession[];
  const hasPreviousRhythm = previous.some(isTrainable);
  const stage = nextBlockStage(previous);

  let sessions = base.sessions.map((session) => ({ ...session })) as RhythmedSession[];
  const recoveryWeekday = chooseRecoveryWeekday(previous, sessions, input);

  // Week one establishes the athlete's actual rhythm. We do not reshuffle an
  // otherwise valid first week simply to manufacture our preferred template.
  if (hasPreviousRhythm) {
    sessions = preserveWeeklyAnchors(sessions, previous, input.weekStartDate, recoveryWeekday, input);
  }
  sessions = establishSideQuestStrengthAnchors(sessions, input, recoveryWeekday, previous);
  sessions = protectLowerLoadDay(sessions, input.weekStartDate, recoveryWeekday);
  sessions = decorateWorkoutFamilies(sessions, stage, input.phase, input.developmentWeek);

  const datesChanged = sessions.some((session) => {
    const original = base.sessions.find((item) => item.id === session.id);
    return Boolean(original && original.date !== session.date);
  });

  const quality = validateUnifiedWeek(sessions, {
    availableMinutes: input.availableMinutes,
    phase: input.phase,
    goalType: input.goalType,
    recentBoneStress: input.recentBoneStress ?? (input.health.boneStress === 'recent' || input.health.boneStress === 'active'),
    returnToRun: input.returnToRun ?? false,
    previousWeek: input.previousWeek ?? [],
    limiterProfile: input.limiterProfile,
  });

  const lowerLoadPreserved = dayLoad(sessions, recoveryWeekday) <= 1;
  const rhythmGuardrail = lowerLoadPreserved
    ? `${WEEKDAY_NAMES[recoveryWeekday]} is protected as the block's lower-load day when athlete commitments allow.`
    : `A lower-load day remains a block priority, but fixed commitments prevent a fully protected ${WEEKDAY_NAMES[recoveryWeekday]} this week.`;

  return {
    ...base,
    sessions,
    doubleDays: datesChanged ? summarizeDoubleDays(sessions) : base.doubleDays,
    guardrails: unique([
      ...base.guardrails,
      rhythmGuardrail,
      'Generated sessions keep a repeatable weekly rhythm unless recovery, availability, or athlete commitments require a move.',
    ]),
    warnings: lowerLoadPreserved
      ? base.warnings
      : unique([
          ...base.warnings,
          `Could not fully preserve the ${WEEKDAY_NAMES[recoveryWeekday]} lower-load anchor because fixed training already occupies that day.`,
        ]),
    quality,
  };
}

function nextBlockStage(previous: PreviousRhythmedSession[]): BlockWorkoutStage {
  const stages = previous
    .map((session) => session.trainingIdentity?.blockStage)
    .filter((value): value is BlockWorkoutStage => value === 0 || value === 1 || value === 2 || value === 3);
  if (!stages.length) return 0;
  return ((Math.max(...stages) + 1) % 4) as BlockWorkoutStage;
}

function chooseRecoveryWeekday(
  previous: PreviousRhythmedSession[],
  current: RhythmedSession[],
  input: WholeAthleteWeeklyPlannerInput,
): number {
  const explicitRest = input.weeklySchedule?.restDays?.[0];
  if (explicitRest !== undefined) return explicitRest;
  if (input.goalType === 'triathlon_sprint'
    || input.goalType === 'triathlon_olympic'
    || input.goalType === 'ironman_70_3'
    || input.goalType === 'ironman_full') {
    return 0;
  }

  const source = previous.some(isTrainable) ? previous : current;
  const fixedCurrent = current.filter((session) => session.planningCommitment !== 'generated' && session.source !== 'side_quest');
  const candidates = [2, 1, 4, 0, 3, 6, 5];

  for (const weekday of candidates) {
    if (fixedCurrent.some((session) => weekdayIndex(session.date) === weekday && !isActiveRecovery(session))) continue;
    const onDay = source.filter((session) => isTrainable(session) && weekdayIndex(session.date) === weekday);
    if (!onDay.length || onDay.every(isActiveRecovery)) return weekday;
  }

  return [...Array(7).keys()].sort((left, right) => dayLoad(source, left) - dayLoad(source, right))[0] ?? 2;
}

function establishSideQuestStrengthAnchors(
  sessions: RhythmedSession[],
  input: WholeAthleteWeeklyPlannerInput,
  recoveryWeekday: number,
  previous: PreviousRhythmedSession[],
): RhythmedSession[] {
  const explicitPreferred = input.weeklySchedule?.preferredDays?.strength;
  const hasEstablishedStrengthRhythm = previous.some((session) => session.discipline === 'strength');

  // Precedence:
  // 1. athlete-configured recurring strength weekdays
  // 2. the athlete's established prior-week Side Quest strength rhythm
  // 3. default multisport strength scaffold for a new/unanchored block
  //
  // preserveWeeklyAnchors has already restored historical strength dates. Do
  // not overwrite them with generic defaults when the athlete did not specify
  // a different recurring strength schedule.
  if (hasEstablishedStrengthRhythm && !explicitPreferred?.length) return sessions;

  const preferred = explicitPreferred ?? [2, 4];
  const strengthSlots = sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.discipline === 'strength' && session.source === 'side_quest')
    .sort((left, right) => compareSessionDate(left.session, right.session));

  if (!strengthSlots.length) return sessions;
  const next = sessions.map((session) => ({ ...session }));

  strengthSlots.forEach(({ index }, ordinal) => {
    const session = next[index];
    if (!session) return;
    const orderedWeekdays = [
      preferred[Math.min(ordinal, Math.max(0, preferred.length - 1))],
      ...preferred,
      2, 4, 3, 5, 6, 1,
    ].filter((value, position, values): value is number =>
      value !== undefined
      && value !== recoveryWeekday
      && values.indexOf(value) === position);

    for (const weekday of orderedWeekdays) {
      const targetDate = addDays(input.weekStartDate, weekday);
      if (targetDate === session.date) break;
      if (!canMove(next, index, targetDate, recoveryWeekday)) continue;
      next[index] = {
        ...session,
        date: targetDate,
        rationale: unique([
          ...session.rationale,
          `Strength is anchored to ${WEEKDAY_NAMES[weekday]} so it supports the weekly endurance rhythm instead of consuming the protected recovery day.`,
        ]),
      };
      break;
    }
  });

  return next.sort(compareSessionDate);
}

function preserveWeeklyAnchors(
  sessions: RhythmedSession[],
  previous: PreviousRhythmedSession[],
  weekStartDate: string,
  recoveryWeekday: number,
  input: WholeAthleteWeeklyPlannerInput,
): RhythmedSession[] {
  const next = sessions.map((session) => ({ ...session }));
  const disciplines: TrainableDiscipline[] = ['swim', 'bike', 'run', 'strength'];

  for (const discipline of disciplines) {
    const previousSlots = previous
      .filter((session) => session.discipline === discipline)
      .sort(compareSessionDate);
    const currentSlots = next
      .map((session, index) => ({ session, index }))
      .filter(({ session }) => session.discipline === discipline)
      .sort((left, right) => compareSessionDate(left.session, right.session));

    for (let ordinal = 0; ordinal < currentSlots.length; ordinal += 1) {
      const target = currentSlots[ordinal];
      const anchor = previousSlots[ordinal];
      if (!target || !anchor || !isRhythmMovable(target.session)) continue;
      const configuredWeekday = configuredWeekdayForSession(target.session, ordinal, input);
      const targetWeekday = configuredWeekday ?? weekdayIndex(anchor.date);
      if (targetWeekday === recoveryWeekday && !isActiveRecovery(target.session)) continue;
      const targetDate = addDays(weekStartDate, targetWeekday);
      if (targetDate === target.session.date) continue;
      if (!canMove(next, target.index, targetDate, recoveryWeekday)) continue;
      next[target.index] = {
        ...target.session,
        date: targetDate,
        rationale: unique([
          ...target.session.rationale,
          `Kept on ${WEEKDAY_NAMES[targetWeekday]} to preserve the established weekly training rhythm.`,
        ]),
      };
    }
  }
  return next.sort(compareSessionDate);
}

function configuredWeekdayForSession(
  session: RhythmedSession,
  ordinal: number,
  input: WholeAthleteWeeklyPlannerInput,
): number | undefined {
  const schedule = input.weeklySchedule;

  if (session.discipline === 'bike') {
    if (isHard(session)) return schedule?.hardBikeDay ?? 1;
    if (/\blong\b/i.test(session.title)) return schedule?.longBikeDay ?? 5;
  }

  if (session.discipline === 'run') {
    if (isHard(session)) return schedule?.hardRunDay ?? 4;
    if (/\blong\b/i.test(session.title)) return schedule?.longRunDay ?? 6;
  }

  if (!TRAINABLE.has(session.discipline as TrainableDiscipline)) return undefined;
  const preferred = schedule?.preferredDays?.[session.discipline as TrainableDiscipline];
  if (preferred?.length && ordinal < preferred.length) return preferred[ordinal];
  return undefined;
}

function protectLowerLoadDay(
  sessions: RhythmedSession[],
  weekStartDate: string,
  recoveryWeekday: number,
): RhythmedSession[] {
  const next = sessions.map((session) => ({ ...session }));
  const recoveryDate = addDays(weekStartDate, recoveryWeekday);
  const offenders = next
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.date === recoveryDate && isRhythmMovable(session) && !isActiveRecovery(session));

  for (const { index } of offenders) {
    const session = next[index]!;
    const candidateDates = [...Array(7).keys()]
      .filter((weekday) => weekday !== recoveryWeekday)
      .map((weekday) => addDays(weekStartDate, weekday))
      .sort((left, right) => {
        const loadDelta = dayLoad(next, weekdayIndex(left)) - dayLoad(next, weekdayIndex(right));
        if (loadDelta !== 0) return loadDelta;
        return Math.abs(dayDifference(left, session.date)) - Math.abs(dayDifference(right, session.date));
      });
    const candidate = candidateDates.find((date) => canMove(next, index, date, recoveryWeekday));
    if (!candidate) continue;
    next[index] = {
      ...session,
      date: candidate,
      rationale: unique([...session.rationale, `${WEEKDAY_NAMES[recoveryWeekday]} was kept lower-load for recovery continuity.`]),
    };
  }
  return next.sort(compareSessionDate);
}

function canMove(sessions: RhythmedSession[], sessionIndex: number, date: string, recoveryWeekday: number): boolean {
  const session = sessions[sessionIndex];
  if (!session) return false;
  if (weekdayIndex(date) === recoveryWeekday && !isActiveRecovery(session)) return false;
  const others = sessions.filter((_, index) => index !== sessionIndex);
  const sameDay = others.filter((item) => item.date === date && isTrainable(item));
  if (sameDay.length >= 2) return false;
  if (sameDay.some((item) => item.discipline === session.discipline)) return false;
  if (sameDay.length && !compatiblePair(session, sameDay[0]!)) return false;
  if (isHard(session) && others.some((item) => isHard(item) && Math.abs(dayDifference(item.date, date)) <= 1)) return false;
  if (session.discipline === 'run' && /return-to-run/i.test(session.title)) {
    if (others.some((item) => item.discipline === 'run' && Math.abs(dayDifference(item.date, date)) < 2)) return false;
  }
  return true;
}

function compatiblePair(left: RhythmedSession, right: RhythmedSession): boolean {
  if (!isTrainable(left) || !isTrainable(right) || left.discipline === right.discipline) return false;
  if (isHard(left) && isHard(right)) return false;
  const pair = new Set([left.discipline, right.discipline]);
  if (pair.has('swim')) return true;
  if (pair.has('bike') && pair.has('run')) return !isHard(left) && !isHard(right) && left.recoveryCost <= 3 && right.recoveryCost <= 3;
  if (pair.has('strength') && (pair.has('bike') || pair.has('run'))) {
    const strength = left.discipline === 'strength' ? left : right;
    const endurance = left.discipline === 'strength' ? right : left;
    return !isHard(strength)
      && !isHard(endurance)
      && strength.lowerBodyDemand !== 'high'
      && endurance.lowerBodyDemand !== 'high'
      && strength.recoveryCost <= 3
      && endurance.recoveryCost <= 3;
  }
  return false;
}

function isRhythmMovable(session: RhythmedSession): boolean {
  if (!isTrainable(session)) return false;
  if (session.planningCommitment === 'generated') return true;
  // Detailed strength is generated upstream by Side Quest but enters the
  // whole-athlete planner as fixed so its exact workout remains intact. Its day
  // may follow the block rhythm; true athlete/calendar commitments may not.
  return session.discipline === 'strength' && session.source === 'side_quest';
}

function decorateWorkoutFamilies(
  sessions: RhythmedSession[],
  stage: BlockWorkoutStage,
  phase: WholeAthleteWeeklyPlannerInput['phase'],
  developmentWeek?: RaceHorizonDevelopmentWeek,
): RhythmedSession[] {
  const next = sessions.map((session) => ({ ...session }));
  for (const discipline of ['swim', 'bike', 'run'] as const) {
    const slots = next
      .map((session, index) => ({ session, index }))
      .filter(({ session }) => session.discipline === discipline && session.planningCommitment === 'generated')
      .sort((left, right) => compareSessionDate(left.session, right.session));

    slots.forEach(({ session, index }, ordinal) => {
      const identity = workoutIdentity(session, ordinal, stage, phase, developmentWeek);
      if (!identity) return;
      next[index] = {
        ...session,
        title: identity.title,
        trainingIdentity: identity.identity,
        rationale: unique([
          ...session.rationale,
          stageRationale(stage, identity.identity.benchmarkRepeat),
          ...developmentRationale(session, developmentWeek),
        ]),
      };
    });
  }
  return next.sort(compareSessionDate);
}

function workoutIdentity(
  session: RhythmedSession,
  ordinal: number,
  stage: BlockWorkoutStage,
  phase: WholeAthleteWeeklyPlannerInput['phase'],
  developmentWeek?: RaceHorizonDevelopmentWeek,
): { title: string; identity: TrainingWorkoutIdentity } | null {
  if (session.discipline !== 'swim' && session.discipline !== 'bike' && session.discipline !== 'run') return null;
  if (session.discipline === 'run' && /return-to-run/i.test(session.title)) {
    return identityResult('Easy return-to-run', 'run_return_to_run', 'protocol', stage, `run:${ordinal}`, false);
  }

  if (isHard(session)) return hardWorkoutIdentity(session.discipline, ordinal, stage, phase, developmentWeek);

  if (session.discipline === 'swim') {
    const primary = [
      ['Technique · Form + Flow', 'swim_form_flow', 'reference'],
      ['Fartlek · Change of Pace', 'swim_change_of_pace', '50_25_25'],
      ['Aerobic · Fast & Smooth', 'swim_fast_smooth', 'build_finish'],
      ['Technique · Form + Flow', 'swim_form_flow', 'reference'],
    ] as const;
    const secondary = [
      ['Endurance · Long Water', 'swim_long_water', 'steady'],
      ['Endurance · Descending Ladder', 'swim_descending', 'descending'],
      ['Fartlek · Change of Pace', 'swim_change_of_pace', '50_25_25'],
      ['Endurance · Long Water', 'swim_long_water', 'steady'],
    ] as const;
    const selected = (ordinal === 0 ? primary : secondary)[stage];
    return identityResult(selected[0], selected[1], selected[2], stage, `swim:${ordinal}`, stage === 3);
  }

  if (session.discipline === 'bike') {
    if (developmentWeek) {
      return developmentBikeIdentity(session, ordinal, stage, developmentWeek);
    }
    const primary = [
      ['Aerobic · Steady State', 'bike_steady_state', 'reference'],
      ['Fartlek · Cadence Change-Up', 'bike_cadence_fartlek', '4_1'],
      ['Aerobic · Progressive Finish', 'bike_progressive', 'thirds'],
      ['Aerobic · Steady State', 'bike_steady_state', 'reference'],
    ] as const;
    const secondary = [
      ['Long Ride · Long Aerobic', 'bike_long_aerobic', 'reference'],
      ['Long Ride · Rolling Endurance', 'bike_rolling_endurance', 'rolling'],
      ['Long Ride · Strong Finish', 'bike_long_finish', 'finish'],
      ['Long Ride · Long Aerobic', 'bike_long_aerobic', 'reference'],
    ] as const;
    const selected = (ordinal === 0 ? primary : secondary)[stage];
    return identityResult(selected[0], selected[1], selected[2], stage, `bike:${ordinal}`, stage === 3);
  }

  if (developmentWeek && developmentWeek.runMode !== 'return_to_run') {
    const objective = isLongRunSession(session)
      ? developmentWeek.longRun
      : developmentWeek.runSupport;
    return objectiveIdentity(objective, stage, `run:${ordinal}:${isLongRunSession(session) ? 'long' : 'support'}`);
  }

  const primary = [
    ['Aerobic · Easy Miles', 'run_easy_miles', 'reference'],
    ['Fartlek · Change of Pace', 'run_fartlek', '3_1_2'],
    ['Aerobic · Negative Split', 'run_negative_split', 'halves'],
    ['Aerobic · Easy Miles', 'run_easy_miles', 'reference'],
  ] as const;
  const secondary = [
    ['Long Run · Time on Feet', 'run_long_aerobic', 'reference'],
    ['Aerobic · Rolling Rhythm', 'run_rolling_aerobic', 'rolling'],
    ['Long Run · Fast Finish', 'run_long_finish', 'finish'],
    ['Long Run · Time on Feet', 'run_long_aerobic', 'reference'],
  ] as const;
  const selected = (ordinal === 0 ? primary : secondary)[stage];
  return identityResult(selected[0], selected[1], selected[2], stage, `run:${ordinal}`, stage === 3);
}

function hardWorkoutIdentity(
  discipline: 'swim' | 'bike' | 'run',
  ordinal: number,
  stage: BlockWorkoutStage,
  phase: WholeAthleteWeeklyPlannerInput['phase'],
  developmentWeek?: RaceHorizonDevelopmentWeek,
): { title: string; identity: TrainingWorkoutIdentity } {
  const swim = [
    ['Threshold · Broken Tempo', 'swim_threshold', 'broken'],
    ['Threshold · Fast & Smooth', 'swim_threshold', 'fast_smooth'],
    ['Threshold · Ladder Day', 'swim_threshold', 'ladder'],
    ['Threshold · Broken Tempo', 'swim_threshold', 'broken'],
  ] as const;
  const run = [
    ['Tempo · Cruise Control', 'run_tempo', 'cruise'],
    ['Intervals · Broken Repeats', 'run_intervals', 'broken'],
    ['Fartlek · Change of Pace', 'run_fartlek_quality', '3_1_2'],
    ['Tempo · Cruise Control', 'run_tempo', 'cruise'],
  ] as const;

  if (discipline !== 'bike') {
    const selected = (discipline === 'swim' ? swim : run)[stage];
    return identityResult(
      selected[0],
      selected[1],
      selected[2],
      stage,
      `${discipline}:${ordinal}:quality`,
      stage === 3,
    );
  }

  if (developmentWeek) {
    return objectiveIdentity(
      developmentWeek.bikeQuality,
      stage,
      `bike:${ordinal}:quality`,
    );
  }

  const libraries = {
    base: [
      ['VO2 · 6 × 4', 'bike_vo2', '6x4'],
      ['Tempo · Aerobic Strength', 'bike_tempo', '3x15'],
      ['VO2 · 8 × 2', 'bike_vo2', '8x2'],
      ['Over / Under · 4 × 10', 'bike_over_under', '4x10'],
    ],
    build: [
      ['Threshold · Cruise Control', 'bike_threshold', '4x10'],
      ['VO2 · 5 × 5', 'bike_vo2', '5x5'],
      ['Threshold · Long Repeats', 'bike_threshold', '3x12'],
      ['Over / Under · 3 × 12', 'bike_over_under', '3x12'],
    ],
    peak: [
      ['Race Pace · 3 × 15', 'bike_race_specific', '3x15'],
      ['VO2 · 6 × 3', 'bike_vo2', '6x3'],
      ['Threshold · 3 × 10', 'bike_threshold', '3x10'],
      ['Race Pace + Surges · 4 × 10', 'bike_race_specific', '4x10_surges'],
    ],
  } as const;

  const library = phase === 'base'
    ? libraries.base
    : phase === 'peak'
      ? libraries.peak
      : libraries.build;
  const selected = library[stage];

  return identityResult(
    selected[0],
    selected[1],
    selected[2],
    stage,
    `bike:${ordinal}:quality`,
    false,
  );
}

function developmentBikeIdentity(
  session: RhythmedSession,
  ordinal: number,
  stage: BlockWorkoutStage,
  developmentWeek: RaceHorizonDevelopmentWeek,
): { title: string; identity: TrainingWorkoutIdentity } {
  if (isLongBikeSession(session)) {
    return objectiveIdentity(developmentWeek.longRide, stage, `bike:${ordinal}:long`);
  }
  if (isRecoveryBikeSession(session)) {
    return identityResult(
      'Recovery Spin · Aerobic Reset',
      'bike_recovery',
      'aerobic_reset',
      stage,
      `bike:${ordinal}:recovery`,
      false,
    );
  }
  return objectiveIdentity(developmentWeek.bikeSupport, stage, `bike:${ordinal}:support`);
}

function objectiveIdentity(
  objective: RaceHorizonWorkoutObjective,
  stage: BlockWorkoutStage,
  role: string,
): { title: string; identity: TrainingWorkoutIdentity } {
  return identityResult(
    objective.title,
    objective.familyId,
    objective.variantId,
    stage,
    role,
    false,
  );
}

function developmentRationale(
  session: RhythmedSession,
  developmentWeek: RaceHorizonDevelopmentWeek | undefined,
): string[] {
  if (!developmentWeek) return [];
  const horizon = `Race horizon: week ${developmentWeek.weekNumber} of ${developmentWeek.totalWeeks} · ${developmentWeek.phase.replaceAll('_', ' ')} · ${developmentWeek.loadIntent}.`;
  if (session.discipline === 'bike') {
    const objective = isHard(session)
      ? developmentWeek.bikeQuality.objective
      : isLongBikeSession(session)
        ? developmentWeek.longRide.objective
        : isRecoveryBikeSession(session)
          ? 'Distribute low-cost aerobic volume without creating another meaningful stressor.'
          : developmentWeek.bikeSupport.objective;
    return [horizon, `Season objective: ${objective}`];
  }
  if (session.discipline === 'swim') return [horizon, `Season objective: ${developmentWeek.swimObjective}`];
  if (session.discipline === 'run') return [horizon, `Season objective: ${developmentWeek.runObjective}`];
  return [horizon];
}

function isLongBikeSession(session: UnifiedTrainingSession): boolean {
  return /\blong\b/i.test(session.title)
    || (session.keySession && session.durationMinutes >= 150);
}

function isRecoveryBikeSession(session: UnifiedTrainingSession): boolean {
  return session.intensity === 'easy'
    && !session.keySession
    && session.durationMinutes <= 60;
}

function isLongRunSession(session: UnifiedTrainingSession): boolean {
  return /\blong\b/i.test(session.title)
    || (session.keySession && session.discipline === 'run' && session.durationMinutes >= 75);
}

function identityResult(
  title: string,
  familyId: string,
  variantId: string,
  stage: BlockWorkoutStage,
  role: string,
  benchmarkRepeat: boolean,
) {
  return {
    title,
    identity: { familyId, variantId, blockStage: stage, role, benchmarkRepeat },
  };
}

function stageRationale(stage: BlockWorkoutStage, benchmarkRepeat: boolean): string {
  if (benchmarkRepeat) return 'Intentional repeat: this workout returns as a reference point rather than adding novelty for novelty’s sake.';
  if (stage === 0) return 'Block foundation: establish a repeatable reference workout and weekly rhythm.';
  if (stage === 1) return 'Block variation: change the internal stimulus while keeping the weekly rhythm stable.';
  if (stage === 2) return 'Block specificity: progress the workout structure without automatically adding more time.';
  return 'Block consolidation: keep the weekly rhythm stable while changing the internal stimulus before the next progression.';
}

function summarizeDoubleDays(sessions: RhythmedSession[]): WholeAthleteWeekPlan['doubleDays'] {
  const byDate = new Map<string, RhythmedSession[]>();
  for (const session of sessions) {
    if (!isTrainable(session)) continue;
    const group = byDate.get(session.date) ?? [];
    group.push(session);
    byDate.set(session.date, group);
  }
  return [...byDate.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([date, items]) => {
      const ordered = [...items].sort(compareSessionDate);
      const explicit = ordered.flatMap((session) => session.rationale).find((line) => line.startsWith('Intentional double day:'));
      return {
        date,
        sessionIds: ordered.map((item) => item.id),
        disciplines: ordered.map((item) => item.discipline).filter(isTrainableDiscipline),
        rationale: explicit ?? 'Intentional same-day training: compatible sessions are consolidated while the rest of the weekly rhythm stays stable.',
        athleteSpecified: ordered.every((item) => item.planningCommitment !== 'generated'),
      };
    });
}

function dayLoad(sessions: Array<UnifiedTrainingSession | RhythmedSession>, weekday: number): number {
  return sessions
    .filter((session) => isTrainable(session) && weekdayIndex(session.date) === weekday)
    .reduce((sum, session) => sum + (isActiveRecovery(session) ? 0.25 : Math.max(1, session.recoveryCost)), 0);
}

function isActiveRecovery(session: UnifiedTrainingSession): boolean {
  return (session.discipline === 'swim' || session.discipline === 'bike')
    && (session.intensity === 'easy' || session.intensity === 'recovery')
    && session.durationMinutes <= 30
    && session.recoveryCost <= 1;
}

function isHard(session: UnifiedTrainingSession): boolean {
  return session.intensity === 'hard' || session.intensity === 'max';
}

function isTrainable(session: UnifiedTrainingSession): session is UnifiedTrainingSession & { discipline: TrainableDiscipline } {
  return TRAINABLE.has(session.discipline as TrainableDiscipline);
}

function isTrainableDiscipline(value: string): value is TrainableDiscipline {
  return TRAINABLE.has(value as TrainableDiscipline);
}

function compareSessionDate(left: UnifiedTrainingSession, right: UnifiedTrainingSession): number {
  return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function weekdayIndex(date: string): number {
  const parsed = new Date(`${date}T12:00:00Z`);
  return (parsed.getUTCDay() + 6) % 7;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dayDifference(left: string, right: string): number {
  return Math.round((Date.parse(`${left}T12:00:00Z`) - Date.parse(`${right}T12:00:00Z`)) / 86_400_000);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
