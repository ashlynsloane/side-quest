import type { GeneratedWorkout, TrainingBlockPlan, WeeklyTrainingPlan } from '@circuit/domain';
import {
  applyProgressionToStrengthBlock,
  type ProgressionDoseAssignment,
} from '@circuit/planner/adaptive-prescription';
import Storage from 'expo-sqlite/kv-store';

const STORAGE_PREFIX = 'circuit.strength-progression-baseline.v1';

interface StrengthProgressionWeekState {
  blockId: string;
  weekStartDate: string;
  baselinePhaseExplanation: string;
  baselineWarnings: string[];
  baselineWorkouts: Record<string, GeneratedWorkout>;
  lastAppliedPhaseExplanation: string;
  lastAppliedWarnings: string[];
  lastAppliedWorkouts: Record<string, GeneratedWorkout>;
}

export interface StrengthProgressionPersistenceResult {
  block: TrainingBlockPlan;
  changed: boolean;
}

/**
 * Applies the governor to the current strength week without repeatedly scaling
 * an already-scaled workout. The first untouched prescription becomes the
 * canonical baseline. Later reconciliations re-derive from that baseline.
 *
 * If an athlete or another planner path edits a workout after progression was
 * applied, that changed workout becomes the new baseline for that session so
 * explicit edits are never silently overwritten by stale progression state.
 * Completed and skipped sessions are historical facts and are never rewritten.
 */
export function applyCurrentWeekStrengthProgression(
  block: TrainingBlockPlan,
  weekStartDate: string,
  assignment: ProgressionDoseAssignment | undefined,
): StrengthProgressionPersistenceResult {
  if (!assignment || assignment.decision.discipline !== 'strength') {
    return { block, changed: false };
  }

  const weekIndex = block.weeks.findIndex((week) => week.weekStartDate === weekStartDate);
  if (weekIndex < 0) return { block, changed: false };

  const currentWeek = block.weeks[weekIndex]!;
  const storageKey = stateKey(block.id, weekStartDate);
  const priorState = readState(storageKey, block.id, weekStartDate);
  const reconciledBaseline = baselineWeek(currentWeek, priorState);
  const weekNumber = reconciledBaseline.weekNumber ?? weekIndex + 1;
  const baselineBlock: TrainingBlockPlan = {
    ...block,
    weeks: block.weeks.map((week, index) => index === weekIndex ? reconciledBaseline : week),
  };
  const progressedBlock = applyProgressionToStrengthBlock(baselineBlock, {
    weekAssignments: { [weekNumber]: assignment },
  });
  const progressedWeek = progressedBlock.weeks[weekIndex]!;
  const adjustedWeek = preserveHistoricalSessions(currentWeek, progressedWeek);
  const adjustedBlock: TrainingBlockPlan = {
    ...progressedBlock,
    weeks: progressedBlock.weeks.map((week, index) => index === weekIndex ? adjustedWeek : week),
  };

  writeState(storageKey, {
    blockId: block.id,
    weekStartDate,
    baselinePhaseExplanation: reconciledBaseline.phaseExplanation,
    baselineWarnings: [...reconciledBaseline.warnings],
    baselineWorkouts: workoutMap(reconciledBaseline),
    lastAppliedPhaseExplanation: adjustedWeek.phaseExplanation,
    lastAppliedWarnings: [...adjustedWeek.warnings],
    lastAppliedWorkouts: workoutMap(adjustedWeek),
  });

  return {
    block: adjustedBlock,
    changed: weekPrescriptionFingerprint(currentWeek) !== weekPrescriptionFingerprint(adjustedWeek),
  };
}

function preserveHistoricalSessions(
  currentWeek: WeeklyTrainingPlan,
  progressedWeek: WeeklyTrainingPlan,
): WeeklyTrainingPlan {
  const currentById = new Map(currentWeek.sessions.map((session) => [session.id, session]));
  return {
    ...progressedWeek,
    sessions: progressedWeek.sessions.map((session) => {
      const current = currentById.get(session.id);
      if (!current) return session;
      if (current.completionStatus === 'completed' || current.completionStatus === 'skipped') {
        return current;
      }
      return session;
    }),
  };
}

function baselineWeek(
  currentWeek: WeeklyTrainingPlan,
  state: StrengthProgressionWeekState | null,
): WeeklyTrainingPlan {
  if (!state) return currentWeek;

  const baselineWorkouts: Record<string, GeneratedWorkout> = { ...state.baselineWorkouts };
  const sessions = currentWeek.sessions.map((session) => {
    const lastApplied = state.lastAppliedWorkouts[session.id];
    const storedBaseline = baselineWorkouts[session.id];
    const currentMatchesLastApplied = Boolean(
      lastApplied
      && workoutFingerprint(lastApplied) === workoutFingerprint(session.workout),
    );
    const workout = currentMatchesLastApplied && storedBaseline
      ? storedBaseline
      : session.workout;
    baselineWorkouts[session.id] = workout;
    return { ...session, workout };
  });

  const phaseExplanation = currentWeek.phaseExplanation === state.lastAppliedPhaseExplanation
    ? state.baselinePhaseExplanation
    : currentWeek.phaseExplanation;
  const warnings = arrayFingerprint(currentWeek.warnings) === arrayFingerprint(state.lastAppliedWarnings)
    ? [...state.baselineWarnings]
    : [...currentWeek.warnings];

  return {
    ...currentWeek,
    sessions,
    phaseExplanation,
    warnings,
  };
}

function workoutMap(week: WeeklyTrainingPlan): Record<string, GeneratedWorkout> {
  return Object.fromEntries(week.sessions.map((session) => [session.id, session.workout]));
}

function stateKey(blockId: string, weekStartDate: string): string {
  return `${STORAGE_PREFIX}.${safeKey(blockId)}.${weekStartDate}`;
}

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

function readState(
  key: string,
  blockId: string,
  weekStartDate: string,
): StrengthProgressionWeekState | null {
  const raw = Storage.getItemSync(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StrengthProgressionWeekState;
    if (parsed.blockId !== blockId || parsed.weekStartDate !== weekStartDate) return null;
    if (!parsed.baselineWorkouts || !parsed.lastAppliedWorkouts) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeState(key: string, state: StrengthProgressionWeekState): void {
  Storage.setItemSync(key, JSON.stringify(state));
}

function workoutFingerprint(workout: GeneratedWorkout): string {
  return JSON.stringify(workout);
}

function arrayFingerprint(values: string[]): string {
  return JSON.stringify(values);
}

function weekPrescriptionFingerprint(week: WeeklyTrainingPlan): string {
  return JSON.stringify({
    phaseExplanation: week.phaseExplanation,
    warnings: week.warnings,
    workouts: week.sessions.map((session) => ({ id: session.id, workout: session.workout })),
  });
}
