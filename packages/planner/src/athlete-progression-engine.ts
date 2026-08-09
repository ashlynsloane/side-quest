import type { LoadManagementWeekHistory } from '@circuit/domain';
import { decideLoadManagementWeek } from './load-management-week';

export type ProgressionDiscipline = 'strength' | 'swim' | 'bike' | 'run';
export type ProgressionPrescriptionStyle = 'effort' | 'numeric' | 'hybrid';
export type ProgressionCyclePhase = 'build' | 'hold' | 'reload' | 'rebuild' | 'taper' | 'restricted';
export type ProgressionTrainingState = 'normal' | 'travel' | 'return_to_training' | 'taper' | 'race_week' | 'restricted';
export type ProgressionInterruptionReason = 'vacation' | 'travel' | 'schedule' | 'illness' | 'unknown';

export interface AthleteProgressionDose {
  durationMinutes?: number;
  intervalCount?: number;
  intervalMinutes?: number;
  reps?: number;
  load?: number;
  rpeLow?: number;
  rpeHigh?: number;
  wattsLow?: number;
  wattsHigh?: number;
}

export interface AthleteProgressionEvidence {
  completedAt: string;
  completedAsPlanned?: boolean;
  rpe?: number;
  durationMinutes?: number;
  averageWatts?: number;
  weightedAverageWatts?: number;
}

export interface AthleteProgressionContinuity {
  daysSinceExposure: number;
  interruptionReason?: ProgressionInterruptionReason;
}

export interface AthleteProgressionInput {
  weekStartDate: string;
  discipline: ProgressionDiscipline;
  baseline: AthleteProgressionDose;
  recentEvidence?: AthleteProgressionEvidence[];
  continuity: AthleteProgressionContinuity;
  recentWeeks?: LoadManagementWeekHistory[];
  weeksSinceLastReload?: number;
  trainingState?: ProgressionTrainingState;
  athleteRequestedRecovery?: boolean;
  prescriptionStyle?: ProgressionPrescriptionStyle;
}

export interface AthleteProgressionDecision {
  discipline: ProgressionDiscipline;
  phase: ProgressionCyclePhase;
  direction: 'increase' | 'hold' | 'reduce';
  progressionAllowed: boolean;
  prescriptionStyle: ProgressionPrescriptionStyle;
  numericTargetsAllowed: boolean;
  target: AthleteProgressionDose;
  volumeScale: number;
  intensityScale: number;
  strengthLoadCeiling?: number;
  reloadKind: 'normal' | 'consolidation' | 'deload' | 'restriction';
  makeUpMissedTraining: false;
  rationale: string[];
}

interface ContinuityGuard {
  phase: 'normal' | 'hold' | 'rebuild';
  volumeScale: number;
  intensityScale: number;
  strengthLoadScale: number;
  rationale?: string;
}

function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value: number, increment = 1): number {
  return Math.round(value / increment) * increment;
}

function scaledInteger(value: number | undefined, scale: number, minimum: number): number | undefined {
  if (!finitePositive(value)) return undefined;
  return Math.max(minimum, Math.round(value * scale));
}

function scaledMinutes(value: number | undefined, scale: number, minimum = 1): number | undefined {
  if (!finitePositive(value)) return undefined;
  return Math.max(minimum, rounded(value * scale, value >= 30 ? 5 : 1));
}

function continuityGuard(daysSinceExposure: number): ContinuityGuard {
  const days = Math.max(0, daysSinceExposure);
  if (days >= 35) {
    return {
      phase: 'rebuild',
      volumeScale: 0.65,
      intensityScale: 0.8,
      strengthLoadScale: 0.8,
      rationale: 'This discipline has been absent for five weeks or more. Rebuild from a clearly lower dose before resuming progression.',
    };
  }
  if (days >= 21) {
    return {
      phase: 'rebuild',
      volumeScale: 0.72,
      intensityScale: 0.85,
      strengthLoadScale: 0.85,
      rationale: 'This discipline has been absent for about three weeks. Re-enter below the previous dose instead of resuming at the old peak.',
    };
  }
  if (days >= 14) {
    return {
      phase: 'rebuild',
      volumeScale: 0.8,
      intensityScale: 0.9,
      strengthLoadScale: 0.9,
      rationale: 'This discipline has been absent for about two weeks. Use a shorter, easier re-entry dose and rebuild from there.',
    };
  }
  if (days >= 7) {
    return {
      phase: 'hold',
      volumeScale: 0.95,
      intensityScale: 1,
      strengthLoadScale: 1,
      rationale: 'There has been a short gap in this discipline. Confirm the current dose before progressing it.',
    };
  }
  return { phase: 'normal', volumeScale: 1, intensityScale: 1, strengthLoadScale: 1 };
}

function evidenceSignal(evidence: AthleteProgressionEvidence[]): 'insufficient' | 'hard' | 'absorbed' | 'steady' {
  if (evidence.length < 2) return 'insufficient';
  const recent = [...evidence]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, 3);
  if (recent.some((item) => item.completedAsPlanned === false)) return 'hard';
  const rpe = recent.map((item) => item.rpe).filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (rpe.length && rpe.reduce((sum, value) => sum + value, 0) / rpe.length >= 8.5) return 'hard';
  if (
    recent.length >= 2
    && recent.every((item) => item.completedAsPlanned !== false)
    && rpe.length >= 2
    && rpe.reduce((sum, value) => sum + value, 0) / rpe.length <= 6.5
  ) return 'absorbed';
  return 'steady';
}

function hasBikePowerEvidence(discipline: ProgressionDiscipline, evidence: AthleteProgressionEvidence[]): boolean {
  if (discipline !== 'bike') return false;
  return evidence.some((item) => finitePositive(item.weightedAverageWatts) || finitePositive(item.averageWatts));
}

function resolvedStyle(
  discipline: ProgressionDiscipline,
  requested: ProgressionPrescriptionStyle,
  baseline: AthleteProgressionDose,
  evidence: AthleteProgressionEvidence[],
): { style: ProgressionPrescriptionStyle; numericTargetsAllowed: boolean } {
  if (discipline === 'strength') {
    return { style: 'numeric', numericTargetsAllowed: finitePositive(baseline.load) || finitePositive(baseline.reps) };
  }
  const hasSupportedNumericTarget = discipline === 'bike'
    && finitePositive(baseline.wattsLow)
    && finitePositive(baseline.wattsHigh)
    && hasBikePowerEvidence(discipline, evidence);
  if (!hasSupportedNumericTarget) return { style: 'effort', numericTargetsAllowed: false };
  return { style: requested, numericTargetsAllowed: requested !== 'effort' };
}

function reducedRpe(baseline: AthleteProgressionDose, intensityScale: number): Pick<AthleteProgressionDose, 'rpeLow' | 'rpeHigh'> {
  if (!finitePositive(baseline.rpeHigh)) {
    return finitePositive(baseline.rpeLow) ? { rpeLow: baseline.rpeLow } : {};
  }
  if (intensityScale >= 0.99) {
    return {
      ...(finitePositive(baseline.rpeLow) ? { rpeLow: baseline.rpeLow } : {}),
      rpeHigh: baseline.rpeHigh,
    };
  }
  const drop = intensityScale <= 0.85 ? 2 : 1;
  const nextHigh = clamp(Math.round(baseline.rpeHigh - drop), 1, 10);
  const nextLow = finitePositive(baseline.rpeLow)
    ? Math.min(baseline.rpeLow, Math.max(1, nextHigh - 1))
    : undefined;
  return {
    ...(nextLow !== undefined ? { rpeLow: nextLow } : {}),
    rpeHigh: nextHigh,
  };
}

function reducedDose(
  baseline: AthleteProgressionDose,
  discipline: ProgressionDiscipline,
  volumeScale: number,
  intensityScale: number,
  numericTargetsAllowed: boolean,
): AthleteProgressionDose {
  const target: AthleteProgressionDose = {
    ...(scaledMinutes(baseline.durationMinutes, volumeScale, 10) !== undefined
      ? { durationMinutes: scaledMinutes(baseline.durationMinutes, volumeScale, 10) }
      : {}),
    ...(scaledInteger(baseline.intervalCount, volumeScale, 1) !== undefined
      ? { intervalCount: scaledInteger(baseline.intervalCount, volumeScale, 1) }
      : {}),
    ...(scaledMinutes(baseline.intervalMinutes, volumeScale, 1) !== undefined
      ? { intervalMinutes: scaledMinutes(baseline.intervalMinutes, volumeScale, 1) }
      : {}),
    ...(scaledInteger(baseline.reps, volumeScale, 1) !== undefined
      ? { reps: scaledInteger(baseline.reps, volumeScale, 1) }
      : {}),
    ...(finitePositive(baseline.load) ? { load: baseline.load } : {}),
    ...reducedRpe(baseline, intensityScale),
  };

  if (numericTargetsAllowed && discipline === 'bike') {
    if (finitePositive(baseline.wattsLow)) target.wattsLow = Math.max(1, rounded(baseline.wattsLow * intensityScale, 5));
    if (finitePositive(baseline.wattsHigh)) target.wattsHigh = Math.max(target.wattsLow ?? 1, rounded(baseline.wattsHigh * intensityScale, 5));
  }
  return target;
}

function buildProgression(
  baseline: AthleteProgressionDose,
  discipline: ProgressionDiscipline,
  numericTargetsAllowed: boolean,
): AthleteProgressionDose {
  const target: AthleteProgressionDose = { ...baseline };
  if (discipline === 'strength') {
    if (finitePositive(baseline.reps)) target.reps = baseline.reps + 1;
    return target;
  }

  // Endurance progression changes dose/structure before intensity. RPE and power stay fixed.
  if (finitePositive(baseline.intervalMinutes)) {
    target.intervalMinutes = baseline.intervalMinutes + Math.max(1, rounded(baseline.intervalMinutes * 0.08, 1));
    return target;
  }
  if (finitePositive(baseline.intervalCount)) {
    target.intervalCount = baseline.intervalCount + 1;
    return target;
  }
  if (finitePositive(baseline.durationMinutes)) {
    target.durationMinutes = baseline.durationMinutes + Math.max(5, rounded(baseline.durationMinutes * 0.05, 5));
  }
  if (!numericTargetsAllowed) {
    delete target.wattsLow;
    delete target.wattsHigh;
  }
  return target;
}

function hardResponseDose(
  baseline: AthleteProgressionDose,
  discipline: ProgressionDiscipline,
  numericTargetsAllowed: boolean,
): AthleteProgressionDose {
  return reducedDose(baseline, discipline, 0.9, 0.95, numericTargetsAllowed);
}

function directionFromTargets(baseline: AthleteProgressionDose, target: AthleteProgressionDose): 'increase' | 'hold' | 'reduce' {
  const fields: (keyof AthleteProgressionDose)[] = ['durationMinutes', 'intervalCount', 'intervalMinutes', 'reps', 'wattsLow', 'wattsHigh'];
  let increased = false;
  let reduced = false;
  for (const field of fields) {
    const before = baseline[field];
    const after = target[field];
    if (typeof before !== 'number' || typeof after !== 'number') continue;
    if (after > before + 0.001) increased = true;
    if (after < before - 0.001) reduced = true;
  }
  if (reduced) return 'reduce';
  if (increased) return 'increase';
  return 'hold';
}

export function decideAthleteProgression(input: AthleteProgressionInput): AthleteProgressionDecision {
  const evidence = input.recentEvidence ?? [];
  const continuity = continuityGuard(input.continuity.daysSinceExposure);
  const trainingState = input.trainingState ?? 'normal';
  const style = resolvedStyle(input.discipline, input.prescriptionStyle ?? 'effort', input.baseline, evidence);

  const loadManagement = decideLoadManagementWeek({
    weekStartDate: input.weekStartDate,
    recentWeeks: input.recentWeeks ?? [],
    upcomingSessions: [],
    ...(input.weeksSinceLastReload !== undefined ? { weeksSinceLastDeload: input.weeksSinceLastReload } : {}),
    ...(input.athleteRequestedRecovery !== undefined ? { athleteRequestedRecovery: input.athleteRequestedRecovery } : {}),
    returnToTraining: continuity.phase === 'rebuild' || trainingState === 'return_to_training',
  });

  const rationale: string[] = [];
  if (input.continuity.interruptionReason === 'vacation' || input.continuity.interruptionReason === 'travel') {
    rationale.push('Time away is treated as a continuity change, not as training debt. Missed sessions will not be made up.');
  }

  if (trainingState === 'restricted' || loadManagement.kind === 'restriction') {
    const target = reducedDose(input.baseline, input.discipline, 0.6, 0.75, style.numericTargetsAllowed);
    rationale.push('An active training restriction overrides progression and lowers the dose while preserving only compatible work.');
    return {
      discipline: input.discipline,
      phase: 'restricted',
      direction: 'reduce',
      progressionAllowed: false,
      prescriptionStyle: style.style,
      numericTargetsAllowed: style.numericTargetsAllowed,
      target,
      volumeScale: 0.6,
      intensityScale: 0.75,
      ...(finitePositive(input.baseline.load) ? { strengthLoadCeiling: input.baseline.load * 0.75 } : {}),
      reloadKind: loadManagement.kind,
      makeUpMissedTraining: false,
      rationale,
    };
  }

  if (continuity.phase === 'rebuild' || trainingState === 'return_to_training') {
    const volumeScale = continuity.phase === 'rebuild' ? continuity.volumeScale : 0.8;
    const intensityScale = continuity.phase === 'rebuild' ? continuity.intensityScale : 0.9;
    const strengthLoadScale = continuity.phase === 'rebuild' ? continuity.strengthLoadScale : 0.9;
    const target = reducedDose(input.baseline, input.discipline, volumeScale, intensityScale, style.numericTargetsAllowed);
    if (continuity.rationale) rationale.push(continuity.rationale);
    rationale.push('Re-entry happens from the last established baseline at a lower dose; there is no catch-up week after an interruption.');
    return {
      discipline: input.discipline,
      phase: 'rebuild',
      direction: 'reduce',
      progressionAllowed: false,
      prescriptionStyle: style.style,
      numericTargetsAllowed: style.numericTargetsAllowed,
      target,
      volumeScale,
      intensityScale,
      ...(finitePositive(input.baseline.load) ? { strengthLoadCeiling: input.baseline.load * strengthLoadScale } : {}),
      reloadKind: loadManagement.kind,
      makeUpMissedTraining: false,
      rationale,
    };
  }

  if (trainingState === 'race_week' || trainingState === 'taper') {
    const raceWeek = trainingState === 'race_week';
    const volumeScale = raceWeek ? 0.55 : 0.75;
    const target = reducedDose(input.baseline, input.discipline, volumeScale, 1, style.numericTargetsAllowed);
    rationale.push(raceWeek
      ? 'Race week lowers training volume and blocks progression so fitness is expressed rather than chased.'
      : 'Taper blocks progression and lowers volume while preserving familiar session intent.');
    return {
      discipline: input.discipline,
      phase: 'taper',
      direction: 'reduce',
      progressionAllowed: false,
      prescriptionStyle: style.style,
      numericTargetsAllowed: style.numericTargetsAllowed,
      target,
      volumeScale,
      intensityScale: 1,
      ...(finitePositive(input.baseline.load) ? { strengthLoadCeiling: input.baseline.load } : {}),
      reloadKind: loadManagement.kind,
      makeUpMissedTraining: false,
      rationale,
    };
  }

  if (loadManagement.kind === 'consolidation' || loadManagement.kind === 'deload') {
    const volumeScale = loadManagement.sessionDurationScale;
    const intensityScale = loadManagement.kind === 'deload' ? 0.9 : 1;
    const target = reducedDose(input.baseline, input.discipline, volumeScale, intensityScale, style.numericTargetsAllowed);
    rationale.push(loadManagement.kind === 'deload'
      ? 'This is a reload week: reduce training dose and novelty before starting another build.'
      : 'This is a consolidation week: stop progression and absorb the recent build with a slightly lower dose.');
    rationale.push(...loadManagement.explanations);
    return {
      discipline: input.discipline,
      phase: 'reload',
      direction: directionFromTargets(input.baseline, target),
      progressionAllowed: false,
      prescriptionStyle: style.style,
      numericTargetsAllowed: style.numericTargetsAllowed,
      target,
      volumeScale,
      intensityScale,
      ...(finitePositive(input.baseline.load)
        ? { strengthLoadCeiling: input.baseline.load * loadManagement.mechanicalDemandScale }
        : {}),
      reloadKind: loadManagement.kind,
      makeUpMissedTraining: false,
      rationale,
    };
  }

  if (continuity.phase === 'hold') {
    const target = reducedDose(input.baseline, input.discipline, continuity.volumeScale, 1, style.numericTargetsAllowed);
    if (continuity.rationale) rationale.push(continuity.rationale);
    return {
      discipline: input.discipline,
      phase: 'hold',
      direction: directionFromTargets(input.baseline, target),
      progressionAllowed: false,
      prescriptionStyle: style.style,
      numericTargetsAllowed: style.numericTargetsAllowed,
      target,
      volumeScale: continuity.volumeScale,
      intensityScale: 1,
      ...(finitePositive(input.baseline.load) ? { strengthLoadCeiling: input.baseline.load } : {}),
      reloadKind: loadManagement.kind,
      makeUpMissedTraining: false,
      rationale,
    };
  }

  const signal = evidenceSignal(evidence);
  if (signal === 'hard') {
    const target = hardResponseDose(input.baseline, input.discipline, style.numericTargetsAllowed);
    rationale.push('Recent completion or effort evidence suggests the current dose was too costly. Step the dose down before trying to progress again.');
    return {
      discipline: input.discipline,
      phase: 'hold',
      direction: 'reduce',
      progressionAllowed: false,
      prescriptionStyle: style.style,
      numericTargetsAllowed: style.numericTargetsAllowed,
      target,
      volumeScale: 0.9,
      intensityScale: 0.95,
      ...(finitePositive(input.baseline.load) ? { strengthLoadCeiling: input.baseline.load } : {}),
      reloadKind: loadManagement.kind,
      makeUpMissedTraining: false,
      rationale,
    };
  }

  if (signal !== 'absorbed') {
    rationale.push(signal === 'insufficient'
      ? 'There is not enough comparable evidence to progress this dose yet. Repeat it and learn from the response.'
      : 'The current dose is being tolerated, but the evidence does not justify increasing it yet.');
    return {
      discipline: input.discipline,
      phase: 'hold',
      direction: 'hold',
      progressionAllowed: false,
      prescriptionStyle: style.style,
      numericTargetsAllowed: style.numericTargetsAllowed,
      target: reducedDose(input.baseline, input.discipline, 1, 1, style.numericTargetsAllowed),
      volumeScale: 1,
      intensityScale: 1,
      ...(finitePositive(input.baseline.load) ? { strengthLoadCeiling: input.baseline.load } : {}),
      reloadKind: loadManagement.kind,
      makeUpMissedTraining: false,
      rationale,
    };
  }

  const target = buildProgression(input.baseline, input.discipline, style.numericTargetsAllowed);
  rationale.push(input.discipline === 'strength'
    ? 'The dose appears absorbed. Progress repetitions before asking for more load unless the exercise-specific load ladder says otherwise.'
    : 'The dose appears absorbed. Progress duration or interval structure before increasing intensity.');
  if (input.discipline === 'bike' && style.numericTargetsAllowed) {
    rationale.push('Existing power targets are preserved during this progression step; watts do not rise automatically just because duration increases.');
  }
  return {
    discipline: input.discipline,
    phase: 'build',
    direction: directionFromTargets(input.baseline, target),
    progressionAllowed: true,
    prescriptionStyle: style.style,
    numericTargetsAllowed: style.numericTargetsAllowed,
    target,
    volumeScale: 1,
    intensityScale: 1,
    ...(finitePositive(input.baseline.load) ? { strengthLoadCeiling: input.baseline.load } : {}),
    reloadKind: loadManagement.kind,
    makeUpMissedTraining: false,
    rationale,
  };
}
