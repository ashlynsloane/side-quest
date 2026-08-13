import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('training-space load range mobile UI', () => {
  it('collects minimum and maximum loads for dumbbells and kettlebells', () => {
    const source = read('apps/mobile/src/app/training-spaces.tsx');
    expect(source).toContain("const RANGE_EQUIPMENT = new Set<EquipmentId>(['dumbbell', 'kettlebell'])");
    expect(source).toContain("setLoad(id, 'minLoadLb', value)");
    expect(source).toContain("setLoad(id, 'maxLoadLb', value)");
    expect(source).toContain('Lightest to heaviest available, per weight');
  });

  it('keeps barbell, trap bar, and medicine ball as max-load inputs', () => {
    const source = read('apps/mobile/src/app/training-spaces.tsx');
    expect(source).toContain("const MAX_LOAD_EQUIPMENT: EquipmentId[] = ['medicine_ball', 'barbell', 'trap_bar']");
  });

  it('seeds commercial gym dumbbell and kettlebell ranges', () => {
    const source = read('apps/mobile/src/services/training-spaces.ts');
    expect(source).toContain("equipmentId: 'dumbbell', quantity: 2, minLoadLb: 5, maxLoadLb: 100");
    expect(source).toContain("equipmentId: 'kettlebell', quantity: 1, minLoadLb: 10, maxLoadLb: 80");
  });
});
