import { describe, expect, it } from 'vitest';

describe('training-space runtime wiring', () => {
  it('keeps the runtime bridge free of deprecated strength-coherence dependencies', async () => {
    const fs = await import('node:fs/promises');
    const path = new URL(
      '../../../apps/mobile/src/services/training-space-runtime.ts',
      import.meta.url,
    );

    const source = await fs.readFile(path, 'utf8');

    expect(source).not.toContain('whole-athlete-strength-coherence');
    expect(source).not.toContain('strength-prescription-generation');
    expect(source).toContain('generateWorkoutForTrainingSpace');
    expect(source).toContain('allocateStrengthTrainingSpaces');
  });
});
