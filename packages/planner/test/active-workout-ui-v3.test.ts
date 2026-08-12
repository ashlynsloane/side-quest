import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Active Workout UI V3', () => {
  it('routes active workout through the focused execution screen', () => {
    const route = source('apps/mobile/src/app/active-workout.tsx');
    expect(route).toContain("@/components/active-workout-screen-v3");
  });

  it('keeps station progress and the next required action visually primary', () => {
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(screen).toContain('StationProgressRail');
    expect(screen).toContain('Finish station');
    expect(screen).toContain('Save + next station');
    expect(screen).toContain('actionDock');
  });

  it('keeps common exercise actions direct during the station', () => {
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(screen).toContain('>Demo<');
    expect(screen).toContain('>Swap<');
    expect(screen).toContain('ExerciseDemoModal');
    expect(screen).toContain('ExerciseSwapModal');
    expect(screen).toContain("router.push('/today-check-in'");
  });

  it('uses recovery time for logging without turning work mode into a form', () => {
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(screen).toContain('LOG THE STATION');
    expect(screen).toContain('Record what actually happened.');
    expect(screen).toContain('ROUNDS COMPLETED');
    expect(screen).toContain('continueAfterRest(true)');
    expect(screen).toContain('Continue without logging');
  });

  it('makes leaving resumable and ending early subordinate', () => {
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(screen).toContain('pauseAndLeave');
    expect(screen).toContain('End workout early');
    expect(screen).toContain("text: 'Save partial'");
    expect(screen).toContain("text: 'Discard'");
  });

  it('keeps completion feedback quick, save state truthful, and deeper details optional', () => {
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(screen).toContain('completionSaveEyebrow(completionSaveState)');
    expect(screen).toContain("completionSaveState === 'saved'");
    expect(screen).toContain('Retry local save');
    expect(screen).toContain("disabled={completionSaveState !== 'saved'}");
    expect(screen).toContain('How did that prescription feel?');
    expect(screen).toContain('Private reflection');
    expect(screen).toContain('Workout details');
    expect(screen).toContain('CompletedWorkoutBodyMap');
    expect(screen).toContain('Feedback and reflection are optional.');
  });
});
