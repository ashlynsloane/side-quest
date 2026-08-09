import type {
  EquipmentId,
  GeneratedWorkout,
  TrainingBlockPlan,
  TrainingBlockRequest,
  TrainingBlockResult,
  WeeklyPlanningContext,
  WeeklyTrainingPlan,
  WorkoutExercisePrescription,
} from '@circuit/domain';
import { generateTrainingBlock } from './index';
import { buildEndurancePrescription, type EnduranceSessionPrescription } from './endurance-prescription';
import { generateMultisportWeek, type MultisportWeekPlan, type MultisportWeekRequest, type PlannedMultisportSession, type SessionIntensity, type WeeklyAvailabilityWindow } from './multisport';
import type {
  AthleteProgressionDecision,
  AthleteProgressionDose,
  ProgressionDiscipline,
} from './athlete-progression-engine';

export interface ProgressionDoseAssignment {
  decision: AthleteProgressionDecision;
  baseline: AthleteProgressionDose;
}

export interface AdaptiveMultisportProgressionContext {
  sessionAssignments?: Record<string, ProgressionDoseAssignment>;
  disciplineAssignments?: Partial<Record<ProgressionDiscipline, ProgressionDoseAssignment>>;
}

export interface ProgressionApplicationMetadata {
  scope: 'session' | 'discipline';
  decision: AthleteProgressionDecision;
  baseline: AthleteProgressionDose;
  originalDurationMinutes: number;
  recommendedDurationMinutes: number;
  appliedDurationMinutes: number;
  fixedSessionPreserved: boolean;
  cappedByAvailability: boolean;
}

export type ProgressionAdjustedMultisportSession = PlannedMultisportSession & {
  progression?: ProgressionApplicationMetadata;
};

export type ProgressionAdjustedMultisportWeekPlan = Omit<MultisportWeekPlan, 'sessions'> & {
  sessions: ProgressionAdjustedMultisportSession[];
};

export interface AdaptiveEnduranceSessionPrescription extends EnduranceSessionPrescription {
  progressionPhase?: AthleteProgressionDecision['phase'];
  progressionDirection?: AthleteProgressionDecision['direction'];
  recommendedTotalMinutes?: number;
  fixedSessionPreserved?: boolean;
}

export interface AdaptiveStrengthBlockProgressionContext {
  weekAssignments?: Partial<Record<number, ProgressionDoseAssignment>>;
  defaultAssignment?: ProgressionDoseAssignment;
}

function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundMinutes(value: number): number {
  if (value < 20) return Math.max(10, Math.round(value));
  return Math.max(10, Math.round(value / 5) * 5);
}

function durationRatio(assignment: ProgressionDoseAssignment): number {
  const { baseline, decision } = assignment;
  if (finitePositive(baseline.durationMinutes) && finitePositive(decision.target.durationMinutes)) {
    return clamp(decision.target.durationMinutes / baseline.durationMinutes, 0.5, 1.15);
  }
  return clamp(decision.volumeScale, 0.5, 1.15);
}

function adjustedIntensity(intensity: SessionIntensity, decision: AthleteProgressionDecision): SessionIntensity {
  if (decision.direction !== 'reduce' && decision.intensityScale >= 0.99) return intensity;
  if (decision.phase === 'restricted' && intensity === 'hard') return 'easy';
  if (decision.intensityScale >= 0.99) return intensity;
  if (intensity === 'hard') return 'moderate';
  if (intensity === 'moderate') return 'easy';
  return 'easy';
}

function resolveAssignment(
  session: PlannedMultisportSession,
  context: AdaptiveMultisportProgressionContext,
): { assignment: ProgressionDoseAssignment; scope: 'session' | 'discipline' } | null {
  if (session.discipline === 'recovery' || session.discipline === 'rest') return null;
  const direct = context.sessionAssignments?.[session.id]
    ?? (session.sourceSessionId ? context.sessionAssignments?.[session.sourceSessionId] : undefined);
  if (direct) return { assignment: direct, scope: 'session' };
  const discipline = context.disciplineAssignments?.[session.discipline];
  return discipline ? { assignment: discipline, scope: 'discipline' } : null;
}

function maximumDurationForSession(
  session: PlannedMultisportSession,
  plan: MultisportWeekPlan,
  availability: WeeklyAvailabilityWindow[],
): number {
  const window = availability.find((item) => item.day === session.day);
  if (!window?.available) return session.durationMinutes;
  const otherMinutes = plan.sessions
    .filter((item) => item.id !== session.id && item.day === session.day)
    .reduce((sum, item) => sum + item.durationMinutes, 0);
  return Math.max(session.durationMinutes, window.minutes - otherMinutes);
}

/**
 * Applies governor decisions to a concrete multisport week.
 *
 * Generated/preferred sessions may change dose. Athlete-fixed sessions keep
 * their calendar duration and receive a recommendation instead of a silent
 * rewrite. A discipline-level assignment uses proportional dose changes; a
 * session-level assignment may additionally drive interval structure later.
 */
export function applyProgressionToMultisportWeek(
  plan: MultisportWeekPlan,
  progression: AdaptiveMultisportProgressionContext,
  availability: WeeklyAvailabilityWindow[] = [],
): ProgressionAdjustedMultisportWeekPlan {
  const warnings = [...plan.warnings];
  const decisions = [...plan.decisions];

  const sessions: ProgressionAdjustedMultisportSession[] = plan.sessions.map((session) => {
    const resolved = resolveAssignment(session, progression);
    if (!resolved) return session;

    const { assignment, scope } = resolved;
    const { decision } = assignment;
    const ratio = durationRatio(assignment);
    const isReturnToRun = session.discipline === 'run' && session.title.toLowerCase().includes('return-to-run');
    const rawRecommended = roundMinutes(session.durationMinutes * ratio);
    const recommendedDurationMinutes = isReturnToRun
      ? Math.min(session.durationMinutes, rawRecommended)
      : rawRecommended;
    const fixedSessionPreserved = session.ownership === 'fixed';
    const maximumAvailable = maximumDurationForSession(session, plan, availability);
    const cappedDuration = decision.direction === 'increase'
      ? Math.min(recommendedDurationMinutes, maximumAvailable)
      : recommendedDurationMinutes;
    const cappedByAvailability = !fixedSessionPreserved && cappedDuration < recommendedDurationMinutes;
    const appliedDurationMinutes = fixedSessionPreserved ? session.durationMinutes : cappedDuration;
    const intensity = fixedSessionPreserved ? session.intensity : adjustedIntensity(session.intensity, decision);

    if (fixedSessionPreserved && recommendedDurationMinutes !== session.durationMinutes) {
      warnings.push(
        `${session.title} is athlete-fixed at ${session.durationMinutes} min. The progression governor recommends ${recommendedDurationMinutes} min, so Side Quest preserved the fixed session instead of changing it silently.`,
      );
    }
    if (cappedByAvailability) {
      warnings.push(`${session.title} was capped at ${cappedDuration} min because the athlete's available time on ${session.day} does not support the full progression.`);
    }

    decisions.push(
      `${session.discipline}: ${decision.phase} / ${decision.direction}; ${fixedSessionPreserved ? 'recommendation only because the session is fixed' : `applied ${session.durationMinutes} → ${appliedDurationMinutes} min`}.`,
    );

    return {
      ...session,
      durationMinutes: appliedDurationMinutes,
      intensity,
      rationale: [
        ...session.rationale,
        ...decision.rationale,
        'The progression governor never adds missed-session volume elsewhere in the week.',
      ],
      progression: {
        scope,
        decision,
        baseline: assignment.baseline,
        originalDurationMinutes: session.durationMinutes,
        recommendedDurationMinutes,
        appliedDurationMinutes,
        fixedSessionPreserved,
        cappedByAvailability,
      },
    };
  });

  return {
    ...plan,
    sessions,
    warnings: [...new Set(warnings)],
    decisions: [...new Set(decisions)],
  };
}

export function generateAdaptiveMultisportWeek(
  request: MultisportWeekRequest,
  progression: AdaptiveMultisportProgressionContext,
): ProgressionAdjustedMultisportWeekPlan {
  return applyProgressionToMultisportWeek(
    generateMultisportWeek(request),
    progression,
    request.availability,
  );
}

function decisionEffortGuide(decision: AthleteProgressionDecision): string | null {
  const low = decision.target.rpeLow;
  const high = decision.target.rpeHigh;
  const rpe = finitePositive(low) && finitePositive(high)
    ? `RPE ${low}–${high}/10`
    : finitePositive(high)
      ? `RPE up to ${high}/10`
      : finitePositive(low)
        ? `RPE ${low}/10`
        : null;

  if (
    decision.numericTargetsAllowed
    && finitePositive(decision.target.wattsLow)
    && finitePositive(decision.target.wattsHigh)
  ) {
    return `${rpe ? `${rpe} · ` : ''}${decision.target.wattsLow}–${decision.target.wattsHigh} W`;
  }
  return rpe;
}

function intervalInstruction(
  session: ProgressionAdjustedMultisportSession,
  prescription: EnduranceSessionPrescription,
): string | null {
  const meta = session.progression;
  if (!meta || meta.scope !== 'session') return null;
  if (!session.title.toLowerCase().match(/interval|quality|tempo|threshold/)) return null;

  const count = meta.decision.target.intervalCount;
  const minutes = meta.decision.target.intervalMinutes;
  if (!finitePositive(count) || !finitePositive(minutes)) return null;

  const main = prescription.steps.find((step) => step.label === 'Main set');
  if (!main || count * minutes > main.minutes) return null;
  const effort = decisionEffortGuide(meta.decision) ?? main.effort;
  return `Complete ${count} × ${minutes} min at ${effort}, with easy recovery between efforts. Keep the final interval as controlled as the first; do not add an extra rep to make up missed training.`;
}

/**
 * Materializes the adjusted session into the athlete-facing endurance workout.
 * Session-specific decisions can write the actual interval count/duration and
 * evidence-supported effort target. Discipline-level decisions change dose but
 * do not invent interval structure for unrelated sessions in the same sport.
 */
export function buildAdaptiveEndurancePrescription(
  session: ProgressionAdjustedMultisportSession,
): AdaptiveEnduranceSessionPrescription | null {
  const base = buildEndurancePrescription(session);
  if (!base) return null;
  const meta = session.progression;
  if (!meta) return base;

  const instruction = intervalInstruction(session, base);
  const effortGuide = decisionEffortGuide(meta.decision) ?? base.effortGuide;
  const steps = instruction
    ? base.steps.map((step) => step.label === 'Main set'
      ? { ...step, effort: effortGuide, instruction }
      : step)
    : base.steps;

  const guardrails = [...base.guardrails];
  if (meta.fixedSessionPreserved && meta.recommendedDurationMinutes !== meta.originalDurationMinutes) {
    guardrails.unshift(
      `This session is fixed at ${meta.originalDurationMinutes} min on the calendar. The governor recommends ${meta.recommendedDurationMinutes} min; changing the fixed session requires athlete approval.`,
    );
  }
  guardrails.push('Do not extend this prescription to repay training missed during travel, vacation, illness, or schedule disruption.');

  return {
    ...base,
    effortGuide,
    steps,
    whyThisSession: [...base.whyThisSession, ...meta.decision.rationale],
    guardrails: [...new Set(guardrails)],
    progressionPhase: meta.decision.phase,
    progressionDirection: meta.decision.direction,
    recommendedTotalMinutes: meta.recommendedDurationMinutes,
    fixedSessionPreserved: meta.fixedSessionPreserved,
  };
}

function strengthTargetDelta(assignment: ProgressionDoseAssignment): number | null {
  if (!finitePositive(assignment.baseline.reps) || !finitePositive(assignment.decision.target.reps)) return null;
  return assignment.decision.target.reps - assignment.baseline.reps;
}

function strengthLoadScale(assignment: ProgressionDoseAssignment): number {
  const baselineLoad = assignment.baseline.load;
  const ceiling = assignment.decision.strengthLoadCeiling;
  if (finitePositive(baselineLoad) && finitePositive(ceiling)) {
    return clamp(ceiling / baselineLoad, 0.5, 1.1);
  }
  return 1;
}

function scaledStationMinutes(originalMinutes: number, scale: number, allowed: Array<4 | 6 | 8 | 12>): number {
  if (scale >= 0.99) return originalMinutes;
  const target = originalMinutes * scale;
  const candidates = [...allowed].filter((minutes) => minutes <= originalMinutes).sort((a, b) => a - b);
  if (candidates.length === 0) return originalMinutes;
  const atOrBelow = candidates.filter((minutes) => minutes <= target).at(-1);
  return atOrBelow ?? candidates[0] ?? originalMinutes;
}

function progressionNote(decision: AthleteProgressionDecision): string {
  if (decision.phase === 'rebuild') return 'Re-entry dose: shorter/easier than the previous established prescription; rebuild before progressing again.';
  if (decision.phase === 'reload') return 'Reload dose: reduce training volume and absorb the prior build before another progression cycle.';
  if (decision.phase === 'restricted') return 'Restricted dose: preserve only compatible work at a lower mechanical demand.';
  if (decision.phase === 'taper') return 'Taper dose: reduce volume and preserve familiarity rather than chasing additional fitness.';
  if (decision.phase === 'hold') return 'Hold dose: repeat or slightly reduce the established work; do not progress yet.';
  return 'Progression dose: advance the established prescription without increasing multiple major variables at once.';
}

function adjustStrengthExercise(
  item: WorkoutExercisePrescription,
  assignment: ProgressionDoseAssignment,
): WorkoutExercisePrescription {
  const delta = strengthTargetDelta(assignment);
  const { decision } = assignment;
  let target = item.target;

  if (item.unit !== 'seconds' && delta !== null) {
    target = Math.max(3, item.target + delta);
  } else if (item.unit === 'seconds' && decision.direction === 'reduce') {
    target = Math.max(10, Math.round(item.target * clamp(decision.volumeScale, 0.5, 1) / 5) * 5);
  }

  let userLoadValue = item.userLoadValue;
  const loadScale = strengthLoadScale(assignment);
  if (finitePositive(userLoadValue) && loadScale < 0.999) {
    userLoadValue = Math.max(0.5, Math.floor(userLoadValue * loadScale * 2) / 2);
  }

  return {
    ...item,
    target,
    ...(userLoadValue !== undefined ? { userLoadValue } : {}),
    adaptationNote: [item.adaptationNote, progressionNote(decision)].filter(Boolean).join(' '),
  };
}

/**
 * Applies a strength governor decision to the generated workout itself.
 * Rebuild/reload/taper/restricted decisions shorten supported station durations,
 * reduce rep/time targets, and enforce an external-load ceiling when a load was
 * already recorded. Build decisions remain reps-first.
 */
export function applyProgressionToStrengthWorkout(
  workout: GeneratedWorkout,
  assignment: ProgressionDoseAssignment,
): GeneratedWorkout {
  if (assignment.decision.discipline !== 'strength') return workout;
  const { decision } = assignment;
  const durationScale = decision.direction === 'increase' ? 1 : clamp(decision.volumeScale, 0.5, 1);
  const allowed = workout.request.allowedStationMinutes;

  const stations = workout.stations.map((station) => ({
    ...station,
    durationSeconds: scaledStationMinutes(station.durationSeconds / 60, durationScale, allowed) * 60,
    exercises: station.exercises.map((item) => adjustStrengthExercise(item, assignment)),
  }));
  const totalWorkSeconds = stations.reduce((sum, station) => sum + station.durationSeconds, 0);
  const totalRestSeconds = Math.max(0, stations.length - 1) * workout.request.restSeconds;

  return {
    ...workout,
    request: {
      ...workout.request,
      workMinutes: Math.round(totalWorkSeconds / 60),
      allowUnfamiliarExercises: decision.phase === 'build' && workout.request.allowUnfamiliarExercises,
    },
    stations,
    totalWorkSeconds,
    totalRestSeconds,
    estimatedElapsedSeconds: totalWorkSeconds + totalRestSeconds,
    recentLoadAdjustments: [...new Set([
      ...workout.recentLoadAdjustments,
      progressionNote(decision),
      ...decision.rationale,
    ])],
    variantLabel: decision.phase === 'rebuild'
      ? 'Return-to-strength session'
      : decision.phase === 'reload'
        ? 'Reload session'
        : decision.phase === 'taper'
          ? 'Taper session'
          : workout.variantLabel,
  };
}

function previousExerciseTargets(week: WeeklyTrainingPlan | undefined): Map<string, { target: number; load?: number }> {
  const output = new Map<string, { target: number; load?: number }>();
  for (const session of week?.sessions ?? []) {
    for (const station of session.workout.stations) {
      for (const item of station.exercises) {
        const existing = output.get(item.exerciseId);
        if (!existing || item.target < existing.target) {
          output.set(item.exerciseId, { target: item.target, ...(item.userLoadValue !== undefined ? { load: item.userLoadValue } : {}) });
        }
      }
    }
  }
  return output;
}

function capWorkoutToPreviousDose(workout: GeneratedWorkout, previous: WeeklyTrainingPlan | undefined): GeneratedWorkout {
  if (!previous) return workout;
  const previousTargets = previousExerciseTargets(previous);
  const stations = workout.stations.map((station) => ({
    ...station,
    exercises: station.exercises.map((item) => {
      const prior = previousTargets.get(item.exerciseId);
      if (!prior) return item;
      return {
        ...item,
        target: Math.min(item.target, prior.target),
        ...(item.userLoadValue !== undefined && prior.load !== undefined
          ? { userLoadValue: Math.min(item.userLoadValue, prior.load) }
          : {}),
      };
    }),
  }));
  return { ...workout, stations };
}

export function applyProgressionToStrengthBlock(
  block: TrainingBlockPlan,
  progression: AdaptiveStrengthBlockProgressionContext,
): TrainingBlockPlan {
  const weeks: WeeklyTrainingPlan[] = [];

  for (let index = 0; index < block.weeks.length; index += 1) {
    const week = block.weeks[index]!;
    const weekNumber = week.weekNumber ?? index + 1;
    const assignment = progression.weekAssignments?.[weekNumber] ?? progression.defaultAssignment;
    if (!assignment || assignment.decision.discipline !== 'strength') {
      weeks.push(week);
      continue;
    }

    const previous = weeks.at(-1);
    const shouldCapProgression = !assignment.decision.progressionAllowed || assignment.decision.phase !== 'build';
    const sessions = week.sessions.map((session) => {
      let workout = applyProgressionToStrengthWorkout(session.workout, assignment);
      if (shouldCapProgression) workout = capWorkoutToPreviousDose(workout, previous);
      return { ...session, workout };
    });

    weeks.push({
      ...week,
      sessions,
      phaseExplanation: `${week.phaseExplanation} ${progressionNote(assignment.decision)}`,
      warnings: [...new Set([
        ...week.warnings,
        ...assignment.decision.rationale,
        'Missed strength sessions are not carried forward as training debt.',
      ])],
    });
  }

  return { ...block, weeks };
}

export function generateAdaptiveTrainingBlock(
  request: TrainingBlockRequest,
  context: WeeklyPlanningContext,
  progression: AdaptiveStrengthBlockProgressionContext,
): TrainingBlockResult {
  const result = generateTrainingBlock(request, context);
  if (!result.ok) return result;
  return { ok: true, block: applyProgressionToStrengthBlock(result.block, progression) };
}

export function progressionEquipmentForWorkout(workout: GeneratedWorkout): EquipmentId[] {
  const equipment = new Set<EquipmentId>();
  for (const station of workout.stations) {
    for (const item of station.exercises) {
      const option = item.exerciseSnapshot.equipmentOptions.find((candidate) => candidate.id === item.equipmentOptionId);
      for (const required of option?.items ?? []) equipment.add(required.equipmentId);
    }
  }
  return [...equipment];
}
