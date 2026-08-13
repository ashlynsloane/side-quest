import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('whole-athlete strength prescription generation wiring', () => {
  it('translates weekly strength roles into generator-native focus and protection inputs', () => {
    const source = read('apps/mobile/src/services/strength-prescription-generation.ts');
    expect(source).toContain('applyWeeklyStrengthPrescriptionToRequest');
    expect(source).toContain('prescription.emphasis.flatMap');
    expect(source).toContain('prescription.deEmphasize.flatMap');
    expect(source).toContain("mode: 'keep_light'");
    expect(source).toContain("prescription.lowerBodyDose === 'light'");
  });

  it('applies the coherent request before assigned-space workout generation', () => {
    const source = read('apps/mobile/src/services/training-space-runtime.ts');
    expect(source).toContain('session.strengthPrescription');
    expect(source).toContain('applyWeeklyStrengthPrescriptionToRequest');
    expect(source).toContain('const coherentRequest');
    expect(source).toContain('generateWorkoutForTrainingSpace(\n    coherentRequest');
  });

  it('keeps safety and equipment constraints in the generator rather than hard-coding exercises', () => {
    const source = read('apps/mobile/src/services/strength-prescription-generation.ts');
    expect(source).not.toContain('exerciseId:');
    expect(source).toContain('regionRestrictions');
    expect(source).toContain('focusTargets');
  });
});
