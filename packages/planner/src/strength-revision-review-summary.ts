import type { PlannedStrengthSession, WorkoutStation } from '@circuit/domain';
import type { StoredStrengthRevisionPreview } from './strength-revision-preview-sqlite';
import { verifyStrengthRevisionPreviewBinding } from './strength-revision-preview-binding';
import { evaluateStrengthWorkoutRevision } from './strength-workout-revision-review';

export interface StrengthReviewDoseChange {
  kind: 'station_removed' | 'exercise_removed' | 'station_duration'
    | 'exercise_target' | 'exercise_resistance';
  stationId: string;
  exerciseId: string | null;
  label: string;
  before: number;
  after: number | null;
  unit: string;
}

export interface StrengthRevisionReadOnlySummary {
  previewId: string;
  sourceTitle: string;
  sourceDate: string;
  originalSeconds: number;
  proposedSeconds: number;
  secondsReduced: number;
  stationCountBefore: number;
  stationCountAfter: number;
  changes: StrengthReviewDoseChange[];
  status: 'unapproved';
  executableWorkoutApproved: false;
  currentRestrictionsNotVerified: true;
  requiresWriteTimeRevalidation: true;
}

function snapshotLabel(
  exercise: WorkoutStation['exercises'][number],
): string {
  const name = exercise.exerciseSnapshot?.name;
  return typeof name === 'string' && name.trim()
    ? name.trim() : exercise.exerciseId;
}

/**
 * Display only: compare the exact saved original plan with the saved
 * proposed workout. No values from here can authorize or start exercise.
 *
 * Malformed or structurally unsafe saved proposals throw instead of showing
 * a misleading reduced dose or silently hiding changed instructions.
 */
export function summarizeUnapprovedStrengthRevision(
  preview: StoredStrengthRevisionPreview,
): StrengthRevisionReadOnlySummary {
  if (!preview || preview.status !== 'unapproved'
    || preview.executableWorkoutApproved !== false
    || preview.binding?.executableWorkoutApproved !== false
    || preview.binding?.requiresWriteTimeRevalidation !== true) {
    throw new Error('Only a verified, unapproved strength preview can be displayed.');
  }
  let source: PlannedStrengthSession;
  try {
    source = JSON.parse(preview.binding.sourceSignature) as PlannedStrengthSession;
  } catch {
    throw new Error('Original strength-review source snapshot is unreadable.');
  }
  if (!source || typeof source.title !== 'string'
    || typeof source.date !== 'string' || !source.workout
    || !Array.isArray(source.workout.stations)) {
    throw new Error('Original strength-review source snapshot is invalid.');
  }
  const bound = verifyStrengthRevisionPreviewBinding({
    binding: preview.binding, source,
    candidate: preview.candidate, decision: preview.decision,
    evidence: preview.evidence,
  });
  if (!bound.valid) {
    throw new Error('Saved strength-review preview does not match its source and decision.');
  }
  const structural = evaluateStrengthWorkoutRevision({
    original: source.workout, proposed: preview.candidate,
    maximumMinutes: preview.decision.proposedMinutes ?? 0,
  });
  if (!structural.structurallyValid) {
    throw new Error('Saved strength-review workout contains unsafe structural changes.');
  }

  const changes: StrengthReviewDoseChange[] = [];
  const candidateStations = new Map(
    preview.candidate.stations.map(station => [station.id, station]),
  );
  for (const station of source.workout.stations) {
    const revised = candidateStations.get(station.id);
    if (!revised) {
      changes.push({
        kind: 'station_removed', stationId: station.id, exerciseId: null,
        label: station.purpose || station.id,
        before: station.durationSeconds, after: null, unit: 'seconds',
      });
      continue;
    }
    if (station.durationSeconds !== revised.durationSeconds) {
      changes.push({
        kind: 'station_duration', stationId: station.id, exerciseId: null,
        label: station.purpose || station.id,
        before: station.durationSeconds,
        after: revised.durationSeconds, unit: 'seconds',
      });
    }
    const revisedExercises = new Map(
      revised.exercises.map(exercise => [exercise.exerciseId, exercise]),
    );
    for (const exercise of station.exercises) {
      const next = revisedExercises.get(exercise.exerciseId);
      if (!next) {
        changes.push({
          kind: 'exercise_removed', stationId: station.id,
          exerciseId: exercise.exerciseId, label: snapshotLabel(exercise),
          before: exercise.target, after: null, unit: String(exercise.unit),
        });
        continue;
      }
      if (exercise.target !== next.target) {
        changes.push({
          kind: 'exercise_target', stationId: station.id,
          exerciseId: exercise.exerciseId, label: snapshotLabel(exercise),
          before: exercise.target, after: next.target, unit: String(exercise.unit),
        });
      }
      if (exercise.userLoadValue !== undefined
        && next.userLoadValue !== undefined
        && exercise.userLoadValue !== next.userLoadValue) {
        changes.push({
          kind: 'exercise_resistance', stationId: station.id,
          exerciseId: exercise.exerciseId, label: snapshotLabel(exercise),
          before: exercise.userLoadValue, after: next.userLoadValue,
          unit: exercise.userLoadUnit ?? 'unspecified load unit',
        });
      }
    }
  }

  return {
    previewId: preview.id,
    sourceTitle: source.title,
    sourceDate: source.date,
    originalSeconds: source.workout.estimatedElapsedSeconds,
    proposedSeconds: preview.candidate.estimatedElapsedSeconds,
    secondsReduced: source.workout.estimatedElapsedSeconds
      - preview.candidate.estimatedElapsedSeconds,
    stationCountBefore: source.workout.stations.length,
    stationCountAfter: preview.candidate.stations.length,
    changes, status: 'unapproved', executableWorkoutApproved: false,
    currentRestrictionsNotVerified: true,
    requiresWriteTimeRevalidation: true,
  };
}
