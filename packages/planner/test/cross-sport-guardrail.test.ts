import { describe, expect, it } from 'vitest';
import { assessCrossSportExposure } from '../src/cross-sport-guardrail';

describe('cross-sport overlap precautions', () => {
  it('flags cycling plus Achilles-loading strength', () => {
    expect(assessCrossSportExposure(['general', 'achilles'], [
      { id: 'ride', discipline: 'bike', minutes: 20 },
    ]).conflict).toBe(true);
  });
  it('flags swimming plus upper-back loading', () => {
    expect(assessCrossSportExposure(['upper_back'], [
      { id: 'swim', discipline: 'swim', minutes: 10 },
    ]).affectedRegions).toContain('upper_back');
  });
  it('does not infer that swimming loads Achilles', () => {
    expect(assessCrossSportExposure(['achilles'], [
      { id: 'swim', discipline: 'swim', minutes: 30 },
    ]).conflict).toBe(false);
  });
  it('ignores zero-duration and invalid exposure values', () => {
    expect(assessCrossSportExposure(['achilles'], [
      { id: 'bad', discipline: 'bike', minutes: Number.NaN },
      { id: 'zero', discipline: 'run', minutes: 0 },
    ]).conflict).toBe(false);
  });
  it('does not convert cross-sport minutes into an equivalent strength dose', () => {
    expect(assessCrossSportExposure(['achilles'], [
      { id: 'ride', discipline: 'bike', minutes: 15 },
    ]).reasons[0]).toContain('Review combined exposure');
  });
});
