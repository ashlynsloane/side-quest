import { describe, expect, it } from 'vitest';

import { applyApprovedFrequencySuppression } from '../src/frequency-suppression';

describe('approved frequency suppression', () => {
  it('prevents an athlete-approved skipped session from being silently recreated', () => {
    const result = applyApprovedFrequencySuppression(
      {},
      { swim: 2, bike: 3, run: 3, strength: 2 },
      { bike: 1 },
    );

    expect(result.bike).toEqual({ min: 2, preferred: 2, max: 2 });
    expect(result.run).toBeUndefined();
  });

  it('treats a cross-sport replacement as removing one obligation from the original discipline', () => {
    const result = applyApprovedFrequencySuppression(
      { run: { min: 2, preferred: 2, max: 3 } },
      { swim: 2, bike: 3, run: 2 },
      { swim: 1 },
    );

    expect(result.swim).toEqual({ min: 1, preferred: 1, max: 1 });
    expect(result.run).toEqual({ min: 2, preferred: 2, max: 3 });
  });

  it('never produces a negative weekly target', () => {
    const result = applyApprovedFrequencySuppression(
      {},
      { run: 1 },
      { run: 3 },
    );

    expect(result.run).toEqual({ min: 0, preferred: 0, max: 0 });
  });
});
