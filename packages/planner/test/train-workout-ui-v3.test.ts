import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Train + workout flow UI V3', () => {
  it('routes Train through a focused recommended-workout workspace', () => {
    const route = source('apps/mobile/src/app/(tabs)/train.tsx');
    const train = source('apps/mobile/src/components/train-screen-v3.tsx');
    expect(route).toContain("@/components/train-screen-v3");
    expect(train).toContain('NEXT PLANNED STRENGTH');
    expect(train).toContain('Review workout');
    expect(train).toContain('Quick workout');
    expect(train).toContain('Saved workouts');
    expect(train).not.toContain('Workout history');
  });

  it('opens planned sessions through the plan-aware preview context', () => {
    const train = source('apps/mobile/src/components/train-screen-v3.tsx');
    expect(train).toContain('openPlannedWorkoutPreview(next');
    expect(train).toContain("router.push('/workout-preview'");
  });

  it('routes one-off generation through the progressive V2 builder', () => {
    const route = source('apps/mobile/src/app/generate.tsx');
    const builder = source('apps/mobile/src/components/quick-workout-builder-v2.tsx');
    expect(route).toContain("@/components/quick-workout-builder-v2");
    expect(builder).toContain('Build around the day you have.');
    expect(builder).toContain('TRAINING LOCATION');
    expect(builder).toContain('Optional emphasis');
    expect(builder).toContain('Limitations today');
    expect(builder).toContain('footer={footer}');
    expect(builder).toContain('generateWorkout');
  });

  it('makes Preview workout-first with direct Demo and Swap actions', () => {
    const route = source('apps/mobile/src/app/workout-preview.tsx');
    const preview = source('apps/mobile/src/components/workout-preview-screen-v2.tsx');
    expect(route).toContain("@/components/workout-preview-screen-v2");
    expect(preview).toContain('WORKOUT PREVIEW');
    expect(preview).toContain('Edit workout');
    expect(preview).toContain('>Demo<');
    expect(preview).toContain('>Swap<');
    expect(preview).not.toContain("Alert.alert(exercise.name, 'Choose an action.'");
  });

  it('keeps workout start persistent and secondary utilities subordinate', () => {
    const preview = source('apps/mobile/src/components/workout-preview-screen-v2.tsx');
    expect(preview).toContain('footer={footer}');
    expect(preview).toContain("activeMatchesPreview ? 'Resume' : 'Start'");
    expect(preview).toContain('More workout options');
    expect(preview).toContain('Why this workout?');
    expect(preview).toContain('Keep current workout');
  });

  it('preserves edit, swap, favorite, sharing, and Workout Together behavior', () => {
    const preview = source('apps/mobile/src/components/workout-preview-screen-v2.tsx');
    for (const expected of [
      'WorkoutEditorModal',
      'ExerciseSwapModal',
      'saveFavoriteWorkout',
      'shareText',
      'createWorkoutRoom',
      'updatePreviewWorkout',
      'beginWorkout',
    ]) expect(preview).toContain(expected);
  });
});
