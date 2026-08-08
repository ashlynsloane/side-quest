import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Workout editing UI V3', () => {
  it('keeps the workout editor escapable and saves draft changes explicitly', () => {
    const editor = source('apps/mobile/src/components/workout-editor-modal.tsx');
    expect(editor).toContain('presentationStyle="fullScreen"');
    expect(editor).toContain('closeCurrentLayer');
    expect(editor).toContain('onRequestClose={closeCurrentLayer}');
    expect(editor).toContain('Close workout editor');
    expect(editor).toContain('Save changes');
    expect(editor).toContain('recalculateWorkout(draft)');
    expect(editor).toContain('Reset to generated workout');
  });

  it('edits one exercise in a focused layer instead of exposing every control at once', () => {
    const editor = source('apps/mobile/src/components/workout-editor-modal.tsx');
    expect(editor).toContain('Edit exercise');
    expect(editor).toContain('What should one round ask for?');
    expect(editor).toContain('Move it within this station.');
    expect(editor).toContain('Remove from this station');
    expect(editor).toContain('Done editing exercise');
    expect(editor).toContain('Add an exercise');
  });

  it('keeps added exercises compatible with the current workout equipment', () => {
    const editor = source('apps/mobile/src/components/workout-editor-modal.tsx');
    expect(editor).toContain('exercise.suitableForAmrap');
    expect(editor).toContain('draft.request.availableEquipment.includes');
    expect(editor).toContain('COMPATIBLE WITH THIS WORKOUT');
    expect(editor).toContain('Only active AMRAP exercises');
  });

  it('keeps Smart Swap reason-aware and pain on the protection path', () => {
    const swap = source('apps/mobile/src/components/exercise-swap-modal.tsx');
    expect(swap).toContain('WHY ARE YOU SWAPPING?');
    expect(swap).toContain('onLoadCandidates');
    expect(swap).toContain('SMART SWAP');
    expect(swap).toContain('SAME EXERCISE');
    expect(swap).toContain('SAME LADDER');
    expect(swap).toContain('SAME PURPOSE');
    expect(swap).toContain('Pain or unusual tightness');
    expect(swap).toContain('Open Training Protection');
    expect(swap).toContain('onPain');
  });

  it('makes the exercise guide movement-first with secondary details disclosed', () => {
    const demo = source('apps/mobile/src/components/exercise-demo-modal.tsx');
    expect(demo).toContain('visualGuideForExercise');
    expect(demo).toContain('MOVEMENT GUIDE');
    expect(demo).toContain('Need an easier or harder version?');
    expect(demo).toContain('Common mistakes');
    expect(demo).toContain('Exercise details');
    expect(demo).toContain('ProductDisclosure');
    expect(demo).toContain('Back to workout');
  });

  it('keeps Preview and live execution wired to the shared V3 edit surfaces', () => {
    const preview = source('apps/mobile/src/components/workout-preview-screen-v2.tsx');
    const active = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(preview).toContain('WorkoutEditorModal');
    expect(preview).toContain('ExerciseSwapModal');
    expect(preview).toContain('ExerciseDemoModal');
    expect(active).toContain('ExerciseSwapModal');
    expect(active).toContain('ExerciseDemoModal');
  });
});
