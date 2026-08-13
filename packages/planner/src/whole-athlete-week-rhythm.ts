import {
  buildWholeAthleteWeek as buildBaseWholeAthleteWeek,
  type WholeAthletePlannedSession,
  type WholeAthleteWeekPlan,
  type WholeAthleteWeeklyPlannerInput,
  type TrainableDiscipline,
} from './whole-athlete-week';
import { validateUnifiedWeek, type UnifiedTrainingSession } from './unified-training';

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

  // Completed historical activity informs load, recovery, and progression,
  // but it is NOT automatically an athlete scheduling preference.
  //
  // Only a previously planned/rhythmed week is allowed to become the weekday
  // template for the next week. Otherwise a random recent training week would
  // silently replace the canonical triathlon scaffold.
  const hasPreviousRhythm = previous.some(
    (session) =>
      TRAINABLE.has(session.discipline as TrainableDiscipline)
      && (
        session.source === 'side_quest'
        || session.trainingIdentity !== undefined
        || session.planningCommitment !== undefined
      ),
  );

  const stage = nextBlockStage(previous);

  let sessions = base.sessions.map((session) => ({ ...session })) as RhythmedSession[];

  // Recovery is resolved by the governing whole-athlete planner first.
  // Rhythm follows that decision rather than independently inventing another
  // recovery weekday.
  const recoveryWeekday = base.recoveryDayDate
    ? weekdayIndex(base.recoveryDayDate)
    : chooseRecoveryWeekday(previous, sessions);

  if (hasPreviousRhythm) {
    // Once an athlete has an established rhythm, preserve it unless a
    // higher-priority commitment, recovery need, or safety rule prevents it.
    sessions = preserveWeeklyAnchors(
      sessions,
      previous,
      input.weekStartDate,
      recoveryWeekday,
    );
    sessions = protectLowerLoadDay(
      sessions,
      input.weekStartDate,
      recoveryWeekday,
    );
  } else {
    // Week one needs a sensible default rhythm. Without this, arbitrary
    // placement in the base planner becomes the anchor for every later week.
    // This scaffold is intentionally soft: canMove() still protects fixed
    // athlete commitments, safety, recovery, same-discipline doubles, and
    // incompatible double days.
    sessions = applyCanonicalTriathlonScaffold(
      sessions,
      input,
      recoveryWeekday,
    );
  }

  sessions = decorateWorkoutFamilies(sessions, stage);

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


/**
 * Final weekday-only reconciliation.
 *
 * This may move sessions to preserve the intended weekly rhythm, but it must
 * not re-author workout identity after quality, long-ride, or other shaping
 * passes have already decided the session's stimulus.
 */
export function reconcileTrainingWeekdays(
  base: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthleteWeekPlan {
  const reconciled = applyTrainingBlockRhythm(base, input);
  const originals = new Map(
    base.sessions.map((session) => [session.id, session] as const),
  );

  const sessions = reconciled.sessions.map((session) => {
    const original = originals.get(session.id);
    if (!original) return session;

    return {
      ...original,

      // The ONLY structural value we take from the final rhythm pass.
      date: session.date,

      // Keep useful placement rationale without replacing the already-shaped
      // workout semantics.
      rationale: unique([
        ...original.rationale,
        ...session.rationale.filter((line) =>
          line.startsWith('Placed on ')
          || line.startsWith('Kept on ')
          || line.includes('lower-load for recovery continuity'),
        ),
      ]),
    };
  }).sort(compareSessionDate);

  const datesChanged = sessions.some((session) => {
    const original = originals.get(session.id);
    return Boolean(original && original.date !== session.date);
  });

  return {
    ...base,
    sessions,
    doubleDays: datesChanged
      ? summarizeDoubleDays(sessions)
      : base.doubleDays,

    // Validation from the reconciled layout remains useful because date
    // changes can affect spacing even though workout semantics are restored.
    quality: reconciled.quality,

    guardrails: unique([
      ...base.guardrails,
      'Final weekday reconciliation may move generated sessions without changing their prescribed workout identity or dose.',
    ]),

    warnings: unique([
      ...base.warnings,
      ...reconciled.warnings,
    ]),
  };
}

function nextBlockStage(previous: PreviousRhythmedSession[]): BlockWorkoutStage {
  const stages = previous
    .map((session) => session.trainingIdentity?.blockStage)
    .filter((value): value is BlockWorkoutStage => value === 0 || value === 1 || value === 2 || value === 3);
  if (!stages.length) return 0;
  return ((Math.max(...stages) + 1) % 4) as BlockWorkoutStage;
}

function chooseRecoveryWeekday(previous: PreviousRhythmedSession[], current: RhythmedSession[]): number {
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


function applyCanonicalTriathlonScaffold(
  sessions: RhythmedSession[],
  input: WholeAthleteWeeklyPlannerInput,
  recoveryWeekday: number,
): RhythmedSession[] {
  if (
    input.goalType !== 'triathlon_sprint'
    && input.goalType !== 'triathlon_olympic'
    && input.goalType !== 'ironman_70_3'
    && input.goalType !== 'ironman_full'
  ) {
    return sessions;
  }

  const canonical: Record<TrainableDiscipline, number[]> = {
    swim: [1, 3, 4],
    bike: [1, 3, 5, 6],
    run: [2, 4, 6],
    strength: [2, 4, 5],
  };

  let next = sessions.map((session) => ({ ...session }));

  /*
   * Apply each discipline as a batch.
   *
   * This matters because the old one-at-a-time algorithm could not perform:
   *
   *   run Thu -> Fri
   *   run Fri -> Sun
   *
   * because Fri looked occupied at the instant Thu was considered.
   *
   * Swim goes first so its Sunday session vacates the Sunday bike/run slot.
   * Run then establishes Wed/Fri/Sun.
   * Bike can then establish Tue/Thu/Sat/Sun.
   * Strength fills around the endurance scaffold last.
   */
  for (const discipline of ['swim', 'run', 'bike', 'strength'] as const) {
    const slots = next
      .map((session, index) => ({ session, index }))
      .filter(({ session }) => session.discipline === discipline)
      .sort((left, right) =>
        compareSessionDate(left.session, right.session),
      );

    const targets = canonical[discipline];
    const proposals = new Map<number, string>();

    for (let ordinal = 0; ordinal < slots.length; ordinal += 1) {
      const slot = slots[ordinal];
      const targetWeekday = targets[ordinal];

      if (!slot || targetWeekday === undefined) continue;
      if (!isRhythmMovable(slot.session)) continue;

      if (
        targetWeekday === recoveryWeekday
        && !isActiveRecovery(slot.session)
      ) {
        continue;
      }

      proposals.set(
        slot.index,
        addDays(input.weekStartDate, targetWeekday),
      );
    }

    if (!proposals.size) continue;

    /*
     * Construct the proposed discipline layout first, then validate it.
     * canMove() therefore sees the FINAL same-discipline positions rather
     * than the stale positions from before the rearrangement.
     */
    const proposed = next.map((session, index) => {
      const date = proposals.get(index);
      return date
        ? { ...session, date }
        : { ...session };
    });

    /*
     * Prefer the complete canonical discipline layout. If one target is
     * blocked by a higher-priority commitment or safety rule, preserve every
     * other canonical placement that remains valid rather than abandoning the
     * entire discipline.
     */
    const fullyValid = [...proposals.entries()].every(([index, date]) =>
      canMove(proposed, index, date, recoveryWeekday),
    );

    if (fullyValid) {
      next = proposed.map((session, index) => {
        const date = proposals.get(index);
        if (!date) return session;

        const targetWeekday = weekdayIndex(date);
        return {
          ...session,
          rationale: unique([
            ...session.rationale,
            `Placed on ${WEEKDAY_NAMES[targetWeekday]} as part of the default triathlon weekly rhythm.`,
          ]),
        };
      });
      continue;
    }

    /*
     * Partial repair uses the proposed final discipline layout as the first
     * feasibility test, then revalidates each accepted move against the actual
     * evolving week. Higher-priority fixed sessions always remain untouched.
     */
    const orderedProposals = [...proposals.entries()]
      .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex);

    for (const [index, date] of orderedProposals) {
      const session = next[index];
      if (!session || session.date === date) continue;

      // A target must be valid in the intended final discipline layout.
      if (!canMove(proposed, index, date, recoveryWeekday)) continue;

      // It must also remain valid after any earlier partial repairs.
      if (!canMove(next, index, date, recoveryWeekday)) continue;

      const targetWeekday = weekdayIndex(date);
      next[index] = {
        ...session,
        date,
        rationale: unique([
          ...session.rationale,
          `Placed on ${WEEKDAY_NAMES[targetWeekday]} as part of the default triathlon weekly rhythm.`,
        ]),
      };
    }
  }

  return next.sort(compareSessionDate);
}


function canUseCanonicalTriathlonDoubleDay(
  sessions: RhythmedSession[],
  sessionIndex: number,
  date: string,
  recoveryWeekday: number,
): boolean {
  const session = sessions[sessionIndex];
  if (!session) return false;

  if (
    weekdayIndex(date) === recoveryWeekday
    && !isActiveRecovery(session)
  ) {
    return false;
  }

  if (!isRhythmMovable(session)) return false;

  const others = sessions.filter((_, index) => index !== sessionIndex);
  const sameDay = others.filter(
    (item) => item.date === date && isTrainable(item),
  );

  // The canonical triathlon rhythm intentionally uses swim + bike
  // double days on Tuesday and Thursday. This is a rhythm preference,
  // not permission to create arbitrary doubles.
  if (sameDay.length !== 1) return false;

  const partner = sameDay[0]!;
  const pair = new Set([session.discipline, partner.discipline]);

  if (!(pair.has('swim') && pair.has('bike'))) return false;

  // Never displace or duplicate the same discipline.
  if (session.discipline === partner.discipline) return false;

  // Fixed athlete commitments are allowed to anchor the pair; the generated
  // session moves around them, never the reverse.
  return true;
}

function preserveWeeklyAnchors(
  sessions: RhythmedSession[],
  previous: PreviousRhythmedSession[],
  weekStartDate: string,
  recoveryWeekday: number,
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
      const targetWeekday = weekdayIndex(anchor.date);
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
    return strength.intensity === 'easy' && !isHard(endurance) && endurance.lowerBodyDemand !== 'high';
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

function decorateWorkoutFamilies(sessions: RhythmedSession[], stage: BlockWorkoutStage): RhythmedSession[] {
  const next = sessions.map((session) => ({ ...session }));
  for (const discipline of ['swim', 'bike', 'run'] as const) {
    const slots = next
      .map((session, index) => ({ session, index }))
      .filter(({ session }) => session.discipline === discipline && session.planningCommitment === 'generated')
      .sort((left, right) => compareSessionDate(left.session, right.session));

    slots.forEach(({ session, index }, ordinal) => {
      const identity = workoutIdentity(session, ordinal, stage);
      if (!identity) return;
      next[index] = {
        ...session,
        title: identity.title,
        trainingIdentity: identity.identity,
        rationale: unique([
          ...session.rationale,
          stageRationale(stage, identity.identity.benchmarkRepeat),
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
): { title: string; identity: TrainingWorkoutIdentity } | null {
  if (session.discipline !== 'swim' && session.discipline !== 'bike' && session.discipline !== 'run') return null;
  if (session.discipline === 'run' && /return-to-run/i.test(session.title)) {
    return identityResult('Easy return-to-run', 'run_return_to_run', 'protocol', stage, `run:${ordinal}`, false);
  }

  if (isHard(session)) return hardWorkoutIdentity(session.discipline, ordinal, stage);

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
): { title: string; identity: TrainingWorkoutIdentity } {
  const libraries = {
    swim: [
      ['Threshold · Broken Tempo', 'swim_threshold', 'broken'],
      ['Threshold · Fast & Smooth', 'swim_threshold', 'fast_smooth'],
      ['Threshold · Ladder Day', 'swim_threshold', 'ladder'],
      ['Threshold · Broken Tempo', 'swim_threshold', 'broken'],
    ],
    bike: [
      ['Threshold · Cruise Control', 'bike_threshold', 'cruise'],
      ['Fartlek · Over / Under', 'bike_over_under', 'over_under'],
      ['Threshold · Long Repeats', 'bike_threshold', 'long'],
      ['Threshold · Cruise Control', 'bike_threshold', 'cruise'],
    ],
    run: [
      ['Tempo · Cruise Control', 'run_tempo', 'cruise'],
      ['Intervals · Broken Repeats', 'run_intervals', 'broken'],
      ['Fartlek · Change of Pace', 'run_fartlek_quality', '3_1_2'],
      ['Tempo · Cruise Control', 'run_tempo', 'cruise'],
    ],
  } as const;
  const selected = libraries[discipline][stage];
  return identityResult(selected[0], selected[1], selected[2], stage, `${discipline}:${ordinal}:quality`, stage === 3);
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
  return 'Block consolidation: compare against an earlier reference before the next progression.';
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
