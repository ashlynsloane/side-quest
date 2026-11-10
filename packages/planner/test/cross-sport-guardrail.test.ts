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
  it('flags Achilles activity from yesterday within a rolling 48-hour review', () => {
    const now = '2026-11-09T20:00:00Z';
    const reviewed = assessCrossSportExposure(['achilles'], [
      { id: 'yesterday-bike', discipline: 'bike', minutes: 30,
        occurredAt: '2026-11-08T19:00:00Z' },
    ], { now, lookbackHours: 48 });
    expect(reviewed.conflict).toBe(true);
  });
  it('does not attribute remote activity to the recent 48-hour window', () => {
    expect(assessCrossSportExposure(['achilles'], [
      { id: 'old-bike', discipline: 'bike', minutes: 30,
        occurredAt: '2026-11-06T10:00:00Z' },
    ], { now: '2026-11-09T20:00:00Z', lookbackHours: 48 }).conflict).toBe(false);
  });
  it('uses known prior strength regions instead of assuming all strength loads Achilles', () => {
    expect(assessCrossSportExposure(['achilles'], [
      { id: 'core', discipline: 'strength', minutes: 20, regions: ['general'],
        occurredAt: '2026-11-09T10:00:00Z' },
    ], { now: '2026-11-09T20:00:00Z', lookbackHours: 48 }).conflict).toBe(false);
    expect(assessCrossSportExposure(['achilles'], [
      { id: 'calf', discipline: 'strength', minutes: 20, regions: ['general', 'achilles'],
        occurredAt: '2026-11-09T10:00:00Z' },
    ], { now: '2026-11-09T20:00:00Z', lookbackHours: 48 }).conflict).toBe(true);
  });
  it('ignores future timestamps and fails on an invalid review window', () => {
    expect(assessCrossSportExposure(['achilles'], [
      { id: 'future', discipline: 'run', minutes: 30,
        occurredAt: '2026-11-10T10:00:00Z' },
    ], { now: '2026-11-09T20:00:00Z', lookbackHours: 48 }).conflict).toBe(false);
    expect(() => assessCrossSportExposure(['achilles'], [], {
      now: 'bad', lookbackHours: 48,
    })).toThrow();
  });

  it('reports the latest overlapping tissue exposure time for regional reassessment', () => {
    const result = assessCrossSportExposure(['achilles'], [
      { id: 'bike-1', discipline: 'bike', minutes: 20, occurredAt: '2026-11-08T12:00:00Z' },
      { id: 'bike-2', discipline: 'bike', minutes: 10, occurredAt: '2026-11-09T10:00:00Z' },
    ], { now: '2026-11-09T20:00:00Z', lookbackHours: 48 });
    expect(result.lastExposureAt?.achilles).toBe('2026-11-09T10:00:00.000Z');
    expect(result.unknownTimingRegions).toEqual([]);
  });
  it('flags overlapping activity without a usable timestamp as unverified recovery evidence', () => {
    const result = assessCrossSportExposure(['upper_back'], [
      { id: 'legacy-swim', discipline: 'swim', minutes: 20 },
    ], { now: '2026-11-09T20:00:00Z', lookbackHours: 48 });
    expect(result.conflict).toBe(true);
    expect(result.unknownTimingRegions).toContain('upper_back');
  });

});
