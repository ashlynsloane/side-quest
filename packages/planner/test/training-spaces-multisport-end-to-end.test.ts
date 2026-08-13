import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

describe('multisport training spaces end-to-end wiring', () => {
  it('applies training spaces after the normal whole-athlete and outing plan is built', () => {
    const source = read('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(source).toContain('applyTrainingOutingsToGeneratedBlock');
    expect(source).toContain('applyTrainingSpacesToGeneratedBlock(shaped)');
    expect(source).toContain('latestReconciledPlan = { blockId: saved.block.id, generated: spaceAware }');
  });

  it('coordinates strength roles before allocating home and gym', () => {
    const source = read('apps/mobile/src/services/training-space-runtime.ts');
    expect(source).toContain('coordinateWeeklyStrengthStimuli(week.sessions)');
    expect(source).toContain('allocateStrengthTrainingSpaces');
    expect(source).toContain('preferredHomeSessions: counts.home');
    expect(source).toContain('preferredGymSessions: counts.gym');
  });

  it('regenerates each assigned strength workout against exact space equipment and its weekly role', () => {
    const source = read('apps/mobile/src/services/training-space-runtime.ts');
    expect(source).toContain('applyWeeklyStrengthPrescriptionToRequest');
    expect(source).toContain('generateWorkoutForTrainingSpace(request, context, targetSpace, home)');
    expect(source).toContain('workout: generated.workout');
  });
});
