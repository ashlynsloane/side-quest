/**
 * Read-only preflight of existing Side Quest workouts against injury-case data.
 * Never construes "no coded conflict" as medical clearance or a green light.
 */
import type { Exercise, GeneratedWorkout } from '@circuit/domain';
import {
  assessInjuryManagement, screenExerciseForInjuries,
  type InjuryAssessmentInput, type ExerciseExposure, type ExerciseDecision,
} from './injury-management';

export interface WorkoutInjuryPreflight {
  workoutId: string;
  disposition: 'blocked'|'review_needed'|'no_coded_conflict';
  safetyLevel: ReturnType<typeof assessInjuryManagement>['safety']['level'];
  exercises: Array<ExerciseDecision & {stationId:string;exerciseName:string}>;
  warnings: string[];
}
const unique=(values:string[]):string[]=>[...new Set(values)];
/**
 * Exercise metadata can be incomplete even when its TypeScript shape is valid.
 * Only independently reviewed IDs may be treated as complete annotations.
 */
export function exerciseExposureFromCatalog(
  exercise:Exercise,
  reviewedExerciseIds:ReadonlySet<string>=new Set<string>(),
):ExerciseExposure {
  const regions=unique([
    ...exercise.bodyRegions.map(item=>item.region),
    ...exercise.jointLoads.map(item=>item.region),
  ]);
  const tags=unique([
    ...exercise.avoidanceTags,
    ...exercise.movementPatterns,
    ...(exercise.impactLevel>=2?['impact']:[]),
  ]);
  return {
    exerciseId:exercise.id,
    affectedRegions:regions,
    stressTags:tags,
    annotationCoverage:reviewedExerciseIds.has(exercise.id)&&regions.length>0
      ? 'complete':'incomplete',
  };
}
export function assessWorkoutInjuryPreflight(
  workout:GeneratedWorkout,
  injuryInput:InjuryAssessmentInput,
  reviewedExerciseIds:ReadonlySet<string>=new Set<string>(),
):WorkoutInjuryPreflight {
  const assessment=assessInjuryManagement(injuryInput);
  const exercises=workout.stations.flatMap(station=>
    station.exercises.map(prescription=>({
      ...screenExerciseForInjuries(
        exerciseExposureFromCatalog(prescription.exerciseSnapshot,reviewedExerciseIds),
        injuryInput,assessment,
      ),
      stationId:station.id,
      exerciseName:prescription.exerciseSnapshot.name,
    })),
  );
  const disposition=exercises.some(e=>e.disposition==='blocked')
    ? 'blocked'
    : exercises.some(e=>e.disposition==='manual_review')
      ? 'review_needed'
      : 'no_coded_conflict';
  const warnings=[
    'Exercise exposure and clinical injury data may be incomplete.',
    'No coded conflict is not clinical clearance or a rehabilitation prescription.',
    'This preflight does not modify or authorize an existing workout.',
    ...(assessment.safety.requiresClinicalAssessment
      ? ['Safety screening or clinician assessment is required before relevant training.']:[]),
  ];
  return {workoutId:workout.id,disposition,safetyLevel:assessment.safety.level,exercises,warnings};
}
