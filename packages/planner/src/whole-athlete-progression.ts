import type { WorkoutDifficultyFeedback } from '@circuit/domain';
import type { UnifiedIntensity } from './unified-training';
import {
  decideAthleteProgression,
  type AthleteProgressionDecision,
  type AthleteProgressionDose,
  type AthleteProgressionEvidence,
} from './athlete-progression-engine';
import {
  buildWholeAthleteWeek,
  type DisciplinePlanSummary,
  type TrainableDiscipline,
  type WholeAthletePlannedSession,
  type WholeAthleteWeeklyPlannerInput,
  type WholeAthleteWeekPlan,
} from './whole-athlete-week-strategy';
import type { ProgressionDoseAssignment } from './adaptive-prescription';

export interface WholeAthleteProgressionContext {
  disciplineAssignments?: Partial<Record<TrainableDiscipline, ProgressionDoseAssignment>>;
}

export interface CompletedDisciplineExposure extends AthleteProgressionEvidence {
  discipline: TrainableDiscipline;
  difficulty?: WorkoutDifficultyFeedback;
}

export interface WholeAthleteHistoryProgressionInput {
  weekStartDate: string;
  asOf: string;
  exposures: CompletedDisciplineExposure[];
  disciplines?: TrainableDiscipline[];
}

export type ProgressionAdjustedWholeAthleteSession = WholeAthletePlannedSession & {
  progression?: {
    phase: ProgressionDoseAssignment['decision']['phase'];
    direction: ProgressionDoseAssignment['decision']['direction'];
    originalDurationMinutes: number;
    recommendedDurationMinutes: number;
    appliedDurationMinutes: number;
    fixedSessionPreserved: boolean;
  };
};

export type ProgressionAdjustedWholeAthleteWeekPlan = Omit<WholeAthleteWeekPlan, 'sessions'> & {
  sessions: ProgressionAdjustedWholeAthleteSession[];
};

const DAY_MS = 86_400_000;
const DEFAULT_DISCIPLINES: TrainableDiscipline[] = ['swim', 'bike', 'run', 'strength'];
const RELATIVE_ENDURANCE_BASELINE: AthleteProgressionDose = { durationMinutes: 100 };
const RELATIVE_STRENGTH_BASELINE: AthleteProgressionDose = {
  durationMinutes: 100,
  reps: 10,
  load: 100,
};

function relativeProgressionBaseline(discipline: TrainableDiscipline): AthleteProgressionDose {
  return discipline === 'strength'
    ? { ...RELATIVE_STRENGTH_BASELINE }
    : { ...RELATIVE_ENDURANCE_BASELINE };
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
  if (
    finitePositive(assignment.baseline.durationMinutes)
    && finitePositive(assignment.decision.target.durationMinutes)
  ) {
    return clamp(
      assignment.decision.target.durationMinutes / assignment.baseline.durationMinutes,
      0.5,
      1.1,
    );
  }
  return clamp(assignment.decision.volumeScale, 0.5, 1.1);
}

function lowerIntensity(
  intensity: UnifiedIntensity,
  assignment: ProgressionDoseAssignment,
): UnifiedIntensity {
  const decision = assignment.decision;
  if (decision.direction !== 'reduce' || decision.intensityScale >= 0.99) return intensity;
  if (decision.phase === 'restricted') {
    if (intensity === 'max' || intensity === 'hard' || intensity === 'moderate') return 'easy';
    return intensity;
  }
  if (intensity === 'max') return 'hard';
  if (intensity === 'hard') return 'moderate';
  if (intensity === 'moderate') return 'easy';
  return intensity;
}

function totalMinutes(sessions: WholeAthletePlannedSession[]): number {
  return sessions
    .filter((session) => session.discipline !== 'rest' && session.discipline !== 'mobility')
    .reduce((sum, session) => sum + session.durationMinutes, 0);
}

function disciplineSummary(
  original: DisciplinePlanSummary[],
  sessions: WholeAthletePlannedSession[],
): DisciplinePlanSummary[] {
  return original.map((summary) => {
    const matching = sessions.filter((session) => session.discipline === summary.discipline);
    return {
      ...summary,
      sessions: matching.length,
      minutes: matching.reduce((sum, session) => sum + session.durationMinutes, 0),
    };
  });
}

function adjustmentLabel(assignment: ProgressionDoseAssignment): string {
  const decision = assignment.decision;
  if (decision.phase === 'reload') return 'Reload week: absorb the previous build instead of extending it.';
  if (decision.phase === 'rebuild') return 'Re-entry week: resume below the previous established dose and rebuild progressively.';
  if (decision.phase === 'taper') return 'Taper week: lower volume while preserving familiar race-specific work.';
  if (decision.phase === 'restricted') return 'Restricted week: lower compatible training stress; safety constraints outrank progression.';
  if (decision.phase === 'hold') return 'Hold week: confirm the current dose before progressing again.';
  return 'Build week: progression is limited to the governor-approved dose.';
}

function elapsedDays(from: string, toMs: number): number | null {
  const fromMs = Date.parse(from);
  if (!Number.isFinite(fromMs) || fromMs > toMs) return null;
  return Math.max(0, Math.floor((toMs - fromMs) / DAY_MS));
}

function explicitTooHardInRecentHistory(exposures: CompletedDisciplineExposure[]): boolean {
  return exposures
    .slice(-3)
    .some((exposure) => exposure.difficulty === 'too_hard');
}

function explicitTooHardGuard(
  decision: AthleteProgressionDecision,
  baseline: AthleteProgressionDose,
): AthleteProgressionDecision {
  if (decision.direction === 'reduce') return decision;
  if (decision.phase !== 'build' && decision.phase !== 'hold') return decision;

  const target: AthleteProgressionDose = {
    ...decision.target,
    ...(finitePositive(baseline.durationMinutes)
      ? { durationMinutes: roundMinutes(baseline.durationMinutes * 0.9) }
      : {}),
    ...(finitePositive(baseline.reps)
      ? { reps: Math.max(1, Math.round(baseline.reps * 0.9)) }
      : {}),
    ...(finitePositive(baseline.load) ? { load: baseline.load } : {}),
  };

  return {
    ...decision,
    phase: 'hold',
    direction: 'reduce',
    progressionAllowed: false,
    target,
    volumeScale: 0.9,
    intensityScale: 0.95,
    ...(finitePositive(baseline.load) ? { strengthLoadCeiling: baseline.load } : {}),
    rationale: [
      ...decision.rationale,
      'The athlete explicitly marked a recent comparable session as too hard, so the next dose steps down before progression is reconsidered.',
    ],
  };
}

/**
 * Converts completed discipline exposures into conservative progression
 * assignments. The baseline is intentionally relative because the
 * whole-athlete renderer owns the athlete's actual prescription. Endurance uses
 * a 100-minute reference dose. Strength additionally uses relative 10-rep and
 * 100-load anchors so the existing strength adapter can express reps-first
 * progression and proportional load ceilings without inventing absolute loads.
 *
 * Structured quick feedback is kept distinct from RPE. An explicit "too hard"
 * response is a conservative negative gate, while "too easy" remains supporting
 * evidence rather than manufacturing a numeric RPE or forcing progression.
 *
 * A missing discipline is not interpreted as a lapse until the available
 * history itself spans at least 14 days. This prevents a new install or a
 * partially imported history window from manufacturing a false interruption.
 */
export function buildWholeAthleteProgressionContextFromHistory(
  input: WholeAthleteHistoryProgressionInput,
): WholeAthleteProgressionContext {
  const asOfMs = Date.parse(input.asOf);
  if (!Number.isFinite(asOfMs)) return {};

  const validExposures = input.exposures
    .filter((exposure) => {
      const completedAtMs = Date.parse(exposure.completedAt);
      return Number.isFinite(completedAtMs) && completedAtMs <= asOfMs;
    })
    .sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt));
  if (!validExposures.length) return {};

  const firstExposureMs = Date.parse(validExposures[0]!.completedAt);
  const historyCoverageDays = Math.max(0, Math.floor((asOfMs - firstExposureMs) / DAY_MS));
  const disciplineAssignments: Partial<Record<TrainableDiscipline, ProgressionDoseAssignment>> = {};

  for (const discipline of input.disciplines ?? DEFAULT_DISCIPLINES) {
    const matching = validExposures.filter((exposure) => exposure.discipline === discipline);
    const latest = matching.at(-1);
    const observedGap = latest ? elapsedDays(latest.completedAt, asOfMs) : null;
    const daysSinceExposure = observedGap ?? (historyCoverageDays >= 14 ? historyCoverageDays : null);
    if (daysSinceExposure === null) continue;

    const recentEvidence: AthleteProgressionEvidence[] = matching.slice(-3).map((exposure) => ({
      completedAt: exposure.completedAt,
      completedAsPlanned: exposure.completedAsPlanned,
      rpe: exposure.rpe,
      durationMinutes: exposure.durationMinutes,
      averageWatts: exposure.averageWatts,
      weightedAverageWatts: exposure.weightedAverageWatts,
    }));
    const baseline = relativeProgressionBaseline(discipline);
    const baseDecision = decideAthleteProgression({
      weekStartDate: input.weekStartDate,
      discipline,
      baseline,
      recentEvidence,
      continuity: { daysSinceExposure },
    });
    const decision = explicitTooHardInRecentHistory(matching)
      ? explicitTooHardGuard(baseDecision, baseline)
      : baseDecision;
    disciplineAssignments[discipline] = { baseline, decision };
  }

  return Object.keys(disciplineAssignments).length ? { disciplineAssignments } : {};
}

/**
 * Applies discipline-specific progression decisions to the production
 * whole-athlete week planner. This is deliberately post-plan: the base planner
 * still owns spacing, frequency, health guardrails, Race Intent and Strategy;
 * the governor owns whether an otherwise valid dose may increase, hold or fall.
 *
 * Fixed athlete/calendar commitments are never silently rewritten. Generated
 * and preferred sessions can be adjusted. No removed minutes are reallocated to
 * another discipline, which prevents reload and vacation reductions from
 * becoming hidden catch-up volume elsewhere in the week.
 */
export function applyProgressionToWholeAthleteWeek(
  plan: WholeAthleteWeekPlan,
  context: WholeAthleteProgressionContext,
): ProgressionAdjustedWholeAthleteWeekPlan {
  const warnings = [...plan.warnings];
  const guardrails = [...plan.guardrails];

  const sessions: ProgressionAdjustedWholeAthleteSession[] = plan.sessions.map((session) => {
    if (
      session.discipline !== 'swim'
      && session.discipline !== 'bike'
      && session.discipline !== 'run'
      && session.discipline !== 'strength'
    ) return session;

    const assignment = context.disciplineAssignments?.[session.discipline];
    if (!assignment) return session;

    const ratio = durationRatio(assignment);
    const returnToRun = session.discipline === 'run' && /return-to-run/i.test(session.title);
    const rawRecommended = roundMinutes(session.durationMinutes * ratio);
    const recommendedDurationMinutes = returnToRun
      ? Math.min(session.durationMinutes, rawRecommended)
      : rawRecommended;
    const fixedSessionPreserved = session.planningCommitment === 'fixed';
    const appliedDurationMinutes = fixedSessionPreserved
      ? session.durationMinutes
      : recommendedDurationMinutes;
    const intensity = fixedSessionPreserved
      ? session.intensity
      : lowerIntensity(session.intensity, assignment);

    if (fixedSessionPreserved && recommendedDurationMinutes !== session.durationMinutes) {
      warnings.push(
        `${session.title} is fixed at ${session.durationMinutes} min. The progression governor recommends ${recommendedDurationMinutes} min, but Side Quest preserved the athlete/calendar commitment until it is explicitly changed.`,
      );
    }

    return {
      ...session,
      durationMinutes: appliedDurationMinutes,
      intensity,
      keySession: assignment.decision.phase === 'restricted' && !fixedSessionPreserved
        ? false
        : session.keySession,
      healthAdjusted: session.healthAdjusted || (
        !fixedSessionPreserved
        && (appliedDurationMinutes !== session.durationMinutes || intensity !== session.intensity)
      ),
      rationale: [
        ...session.rationale,
        adjustmentLabel(assignment),
        ...assignment.decision.rationale,
        'Reduced or missed training is not reallocated as training debt elsewhere in this week.',
      ],
      progression: {
        phase: assignment.decision.phase,
        direction: assignment.decision.direction,
        originalDurationMinutes: session.durationMinutes,
        recommendedDurationMinutes,
        appliedDurationMinutes,
        fixedSessionPreserved,
      },
    };
  });

  const changedAssignments = Object.values(context.disciplineAssignments ?? {})
    .filter((assignment): assignment is ProgressionDoseAssignment => Boolean(assignment));
  if (changedAssignments.some((assignment) => assignment.decision.phase === 'reload')) {
    guardrails.push('This is a reload week. Do not refill reduced minutes with extra endurance, strength, intervals, or make-up sessions.');
  }
  if (changedAssignments.some((assignment) => assignment.decision.phase === 'rebuild')) {
    guardrails.push('Re-entry is discipline-specific: maintain current disciplines while rebuilding only the training that actually lapsed.');
  }
  guardrails.push('Progression is non-monotonic: build, hold, reload, rebuild and taper are all valid planned outcomes.');

  const plannedMinutes = totalMinutes(sessions);
  const generatedMinutes = totalMinutes(
    sessions.filter((session) => session.planningCommitment === 'generated'),
  );

  return {
    ...plan,
    sessions,
    plannedMinutes,
    generatedMinutes,
    disciplineSummary: disciplineSummary(plan.disciplineSummary, sessions),
    warnings: [...new Set(warnings)],
    guardrails: [...new Set(guardrails)],
  };
}

/**
 * Production wrapper for callers that already have trustworthy governor
 * assignments. A caller may omit a discipline when evidence is insufficient;
 * the base planner then remains responsible for that discipline rather than
 * inventing a progression signal.
 */
export function buildAdaptiveWholeAthleteWeek(
  input: WholeAthleteWeeklyPlannerInput,
  progression: WholeAthleteProgressionContext,
): ProgressionAdjustedWholeAthleteWeekPlan {
  return applyProgressionToWholeAthleteWeek(buildWholeAthleteWeek(input), progression);
}
