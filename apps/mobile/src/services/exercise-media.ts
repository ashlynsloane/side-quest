import type { Exercise, ExerciseMedia } from '@circuit/domain';
import { EXERCISE_VISUAL_ASSETS } from '@/content/exercise-visual-assets';

// Legacy external-demo exports remain available for compatibility with older screens.
export interface ReviewedExerciseDemo {
  source: 'Muscle & Strength';
  url: string;
  match: 'exact' | 'base_movement';
  label: string;
  note?: string;
}

export const MUSCLE_AND_STRENGTH_LIBRARY_URL = 'https://www.muscleandstrength.com/exercises';
export function reviewedDemoForExercise(_exercise: Exercise): ReviewedExerciseDemo | null { return null; }

export type ExerciseMediaReviewStatus = 'exact' | 'base_movement' | 'verified_video' | 'illustrated' | 'written_only';

export interface ExerciseVisualGuide {
  exerciseId: string;
  source: number;
  status: 'illustrated';
  label: string;
  reviewerNote: string;
  credit: string;
  license: string;
}

export interface ExerciseMediaRegistryRecord {
  exerciseId: string;
  exerciseName: string;
  status: ExerciseMediaReviewStatus;
  label: string;
  reviewerNote: string;
  source?: string;
  url?: string;
  license?: string;
}

function hasSafeUri(uri: string): boolean {
  return uri.startsWith('https://') || uri.startsWith('file://') || uri.startsWith('asset://');
}

export function verifiedVideoForExercise(exercise: Exercise): ExerciseMedia | null {
  return exercise.media.find((item) => item.verified && item.kind === 'video' && hasSafeUri(item.uri)) ?? null;
}

export function visualGuideForExercise(exercise: Exercise): ExerciseVisualGuide | null {
  const source = EXERCISE_VISUAL_ASSETS[exercise.id];
  if (!source) return null;
  return {
    exerciseId: exercise.id,
    source,
    status: 'illustrated',
    label: 'Illustrated guide',
    reviewerNote: 'Approved Side Quest exercise guide.',
    credit: 'Side Quest',
    license: 'Bundled Side Quest beta asset',
  };
}

export function exerciseMediaRegistryRecord(exercise: Exercise): ExerciseMediaRegistryRecord {
  const visual = visualGuideForExercise(exercise);
  if (visual) {
    return {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      status: 'illustrated',
      label: visual.label,
      reviewerNote: visual.reviewerNote,
      source: visual.credit,
      license: visual.license,
    };
  }

  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    status: 'written_only',
    label: 'Written guide',
    reviewerNote: 'Use the exercise-specific setup, movement, and cue sections.',
  };
}

export function exerciseMediaCoverage(exercises: Exercise[]) {
  const records = exercises.map(exerciseMediaRegistryRecord);
  return {
    total: records.length,
    exact: 0,
    baseMovement: 0,
    verifiedVideo: 0,
    illustrated: records.filter((record) => record.status === 'illustrated').length,
    writtenOnly: records.filter((record) => record.status === 'written_only').length,
    records,
  };
}
