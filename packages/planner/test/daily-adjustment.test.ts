import { describe, expect, it } from 'vitest';
import { assessSessionPair, buildDailyAdjustmentOptions, createEndurancePrescription } from '../src/index';
import type { UnifiedTrainingSession } from '../src/index';

const planned: UnifiedTrainingSession = {
  id: 'bike-vo2', date: '2026-07-28', title: 'Bike VO2', discipline: 'bike', durationMinutes: 70,
  intensity: 'hard', cardiovascularDemand: 'high', musculoskeletalDemand: 'moderate', lowerBodyDemand: 'high',
  upperBodyDemand: 'none', impact: 'none', technicalDemand: 'moderate', recoveryCost: 4, priority: 'required',
  source: 'calendar', keySession: true,
};

describe('daily adjustment engine', () => {
  it('recommends recovery for focal pain rather than protecting completion', () => {
    const result = buildDailyAdjustmentOptions({ sessionId: planned.id, reason: 'pain', requestedAction: 'skip', focalPain: true, symptomSeverity: 3 }, {
      plannedSession: planned, weekSessions: [planned], availableDates: ['2026-07-29'], recentBoneStress: true,
    });
    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.action).toBe('skip');
    expect(result.safetyMessage).toContain('Stop');
  });

  it('preserves the main work when a session is shortened', () => {
    const result = buildDailyAdjustmentOptions({ sessionId: planned.id, reason: 'time', requestedAction: 'shorter', availableMinutes: 35 }, {
      plannedSession: planned, weekSessions: [planned], availableDates: ['2026-07-29'],
    });
    expect(result.options.find((option) => option.action === 'modify')?.durationMinutes).toBe(35);
    expect(result.recommendedOptionId).toContain('shorten');
  });

  it('does not substitute running during bone-stress return', () => {
    const result = buildDailyAdjustmentOptions({ sessionId: planned.id, reason: 'access', requestedAction: 'different', availableDisciplines: ['run', 'swim'] }, {
      plannedSession: planned, weekSessions: [planned], availableDates: [], recentBoneStress: true, returnToRun: true,
    });
    expect(result.options.find((option) => option.action === 'replace')?.replacementDiscipline).toBe('swim');
  });

  it('recommends easier or recovery when fatigue trend worsens', () => {
    const result = buildDailyAdjustmentOptions({ sessionId: planned.id, reason: 'fatigue', requestedAction: 'easier', fatigueKind: 'systemic' }, {
      plannedSession: planned, weekSessions: [planned], availableDates: ['2026-07-29'], recentFatigueTrend: 'worsening',
    });
    expect(result.recommendedOptionId.includes('easier') || result.recommendedOptionId.includes('skip')).toBe(true);
  });
});

describe('session compatibility', () => {
  it('flags heavy lower strength close to bike VO2', () => {
    const bike = createEndurancePrescription({ id: 'v', discipline: 'bike', purpose: 'vo2', durationRangeMinutes: [60, 75] });
    const assessment = assessSessionPair({ first: bike, second: { discipline: 'strength', role: 'heavy_lower', priority: 'required' }, separationHours: 2, phasePriority: 'endurance' });
    expect(assessment.compatibility).toBe('poor');
    expect(assessment.minimumSeparationHours).toBeGreaterThanOrEqual(8);
  });

  it('accepts technique swim and heavy lower strength with separation', () => {
    const swim = createEndurancePrescription({ id: 's', discipline: 'swim', purpose: 'technique', durationRangeMinutes: [30, 45] });
    const assessment = assessSessionPair({ first: { discipline: 'strength', role: 'heavy_lower', priority: 'required' }, second: swim, separationHours: 10, phasePriority: 'strength' });
    expect(assessment.compatibility).toBe('good');
  });
});
