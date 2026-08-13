import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('Week strength visibility', () => {
  it('does not hide a valid planned strength session when scheduled metadata is absent', async () => {
    const source = await readFile(
      new URL(
        '../../../apps/mobile/src/app/(tabs)/plan.tsx',
        import.meta.url,
      ),
      'utf8',
    );

    expect(source).not.toContain(
      'if (availabilityEnabled && !planned) return []',
    );

    expect(source).toContain(
      'const displayDate = planned?.date ?? session.date',
    );
  });
});
