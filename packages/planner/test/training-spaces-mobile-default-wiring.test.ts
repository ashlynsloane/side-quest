import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('training spaces mobile default wiring', () => {
  it('uses the space-aware whole-athlete planner from the primary refresh runtime', () => {
    const source = read('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(source).toContain('generateAndPersistSpaceAwareWholeAthleteBlock');
    expect(source).not.toContain('generateAndPersistWholeAthleteBlock({');
  });

  it('keeps physiology-first planning and applies spaces afterward', () => {
    const source = read('apps/mobile/src/services/whole-athlete-plan-training-spaces.ts');
    expect(source).toContain('generateAndPersistWholeAthleteBlock(input)');
    expect(source).toContain('applyPersistedTrainingSpaces(week.sessions)');
  });

  it('keeps exact training-space generation available for assigned sessions', () => {
    const source = read('apps/mobile/src/services/training-space-runtime.ts');
    expect(source).toContain('generateWorkoutForAssignedTrainingSpace');
    expect(source).toContain('generateWorkoutForTrainingSpace');
    expect(source).toContain('session.trainingSpaceId');
  });
});
