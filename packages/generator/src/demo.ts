import { writeFile } from 'node:fs/promises';
import { exerciseSeed } from '@circuit/exercise-content';
import type { WorkoutGenerationRequest } from '@circuit/domain';
import { generateWorkout } from './index';

const request: WorkoutGenerationRequest = {
  workMinutes: 40,
  allowedStationMinutes: [4, 8, 12],
  restSeconds: 60,
  exercisesPerStation: 'mixed',
  focusTargets: [
    { region: 'hamstrings', emphasis: 'strong' },
    { region: 'feet_ankles', emphasis: 'light' },
  ],
  excludedRegions: ['shoulders', 'shoulder'],
  excludedMovementTags: ['shoulder_weight_bearing', 'overhead'],
  availableEquipment: [
    'dumbbell',
    'kettlebell',
    'long_band',
    'mini_band',
    'bench',
    'box',
    'bosu',
    'stability_ball',
    'slider',
  ],
  workoutStyle: 'strength_cardio_amrap',
  difficulty: 'intermediate',
  maximumImpact: 3,
  recoveryAware: true,
  avoidPreviousWorkoutExercises: true,
  favorFamiliarExercises: false,
  allowUnfamiliarExercises: true,
  minimizeEquipmentChanges: false,
  randomSeed: 'v1-sample-hamstrings',
};

const result = generateWorkout(request, {
  exercises: exerciseSeed,
  now: '2026-07-17T12:00:00.000Z',
  recentRegionExposures: [
    {
      region: 'shoulders',
      rawExposure: 18,
      completedAt: '2026-07-16T12:00:00.000Z',
    },
  ],
});

if (!result.ok) {
  console.error(result.messages.join('\n'));
  process.exitCode = 1;
} else {
  const json = `${JSON.stringify(result.workout, null, 2)}\n`;
  const outputPath = new URL('../../../examples/sample-generated-workout.json', import.meta.url);
  await writeFile(outputPath, json);
  console.log(`Generated ${result.workout.name}`);
  console.log(`Saved to examples/sample-generated-workout.json`);
}
