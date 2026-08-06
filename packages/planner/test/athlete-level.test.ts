import { describe, expect, it } from 'vitest';
import type { EnduranceActivity } from '@circuit/domain';
import { assessAthleteLevel, planningProficiency } from '../src/athlete-level';

const now = '2026-07-26T12:00:00.000Z';
function activity(id: string, discipline: 'swim' | 'bike' | 'run', daysAgo: number, minutes = 60, extra: Partial<EnduranceActivity> = {}): EnduranceActivity {
  return {
    id, source: 'strava', externalId: id, name: `${discipline} session`, discipline,
    startAt: new Date(new Date(now).getTime() - daysAgo * 86_400_000).toISOString(),
    movingTimeSeconds: minutes * 60, elapsedTimeSeconds: minutes * 60, intensity: 'easy',
    importedAt: now, updatedAt: now, ...extra,
  };
}

describe('athlete level assessment', () => {
  it('weights recent history while preserving annual context', () => {
    const activities = Array.from({ length: 30 }, (_, i) => activity(`b${i}`, 'bike', i * 2, 75, { weightedAverageWatts: 180 + i }));
    const result = assessAthleteLevel({ activities, history: { yearsByDiscipline: { bike: 6 } }, now });
    expect(result.bike.recent28DayCount).toBeGreaterThan(10);
    expect(result.bike.currentCapacity).not.toBe('rebuilding');
    expect(result.bike.historicalExperience).toBe('advanced');
    expect(result.bike.performanceEstimate?.unit).toBe('watts');
  });

  it('marks an experienced injured runner as historically advanced but currently rebuilding', () => {
    const activities = Array.from({ length: 40 }, (_, i) => activity(`r${i}`, 'run', 100 + i * 5, 55, { distanceMeters: 10000 }));
    const result = assessAthleteLevel({ activities, history: { yearsByDiscipline: { run: 8 }, recentInjuryInterruption: true, returnToRun: true, recentBoneStress: true }, now });
    expect(result.run.historicalExperience).toBe('advanced');
    expect(result.run.currentCapacity).toBe('rebuilding');
    expect(result.run.durability).toBe('low');
    expect(result.run.calibrationRecommendation?.priority).toBe('defer');
    expect(planningProficiency(result.run)).toBe('developing');
  });

  it('does not require maximal tests when history is sufficient', () => {
    const activities = Array.from({ length: 24 }, (_, i) => activity(`s${i}`, 'swim', i * 3, 50, { distanceMeters: 2500 }));
    const result = assessAthleteLevel({ activities, history: { selfRated: { swim: 'strong' } }, now });
    expect(result.swim.confidence).toBe('high');
    expect(result.swim.calibrationRecommendation?.priority).toBe('optional');
  });

  it('accepts coach or platform thresholds with high confidence', () => {
    const result = assessAthleteLevel({ activities: [], history: { manualThresholds: { bikeFtpWatts: 240, source: 'coach', recordedAt: now } }, now });
    expect(result.bike.performanceEstimate).toEqual({ value: 240, unit: 'watts', source: 'manual', confidence: 'high' });
  });
});
