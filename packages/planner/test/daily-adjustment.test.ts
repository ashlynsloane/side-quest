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

  it('cannot bypass an active symptom restriction by choosing a time-based adjustment', () => {
    const result = buildDailyAdjustmentOptions({
      sessionId: planned.id, reason: 'time',
      requestedAction: 'shorter', availableMinutes: 35,
    }, {
      plannedSession: planned, weekSessions: [planned],
      availableDates: ['2026-07-29'], activeSymptomRestriction: true,
    });
    expect(result.options.map(option => option.action)).toEqual(['skip']);
    expect(result.safetyMessage).toContain('Stop');
    expect(result.options.every(option => option.requiresApproval)).toBe(true);
  });

  it('recovery hold prevents reducing or moving a workout regardless of selection', () => {
    for (const reason of ['time', 'fatigue', 'preference'] as const) {
      const result = buildDailyAdjustmentOptions({
        sessionId: planned.id, reason, requestedAction: 'shorter',
        availableMinutes: 35,
      }, {
        plannedSession: planned, weekSessions: [planned],
        availableDates: ['2026-07-29'], recoveryHold: true,
      });
      expect(result.options.map(option => option.action)).toEqual(['skip']);
      expect(result.recommendedOptionId).toContain('skip');
    }
  });

  it('preserves the main work when a session is shortened', () => {
    const result = buildDailyAdjustmentOptions({ sessionId: planned.id, reason: 'time', requestedAction: 'shorter', availableMinutes: 35 }, {
      plannedSession: planned, weekSessions: [planned], availableDates: ['2026-07-29'],
    });
    expect(result.options.find((option) => option.action === 'modify')?.durationMinutes).toBe(35);
    expect(result.recommendedOptionId).toContain('shorten');
  });

  it('requires explicit athlete approval for shorter, easier and recovery choices', () => {
    for (const request of [
      { sessionId: planned.id, reason: 'time' as const,
        requestedAction: 'shorter' as const, availableMinutes: 35 },
      { sessionId: planned.id, reason: 'fatigue' as const,
        requestedAction: 'easier' as const },
      { sessionId: planned.id, reason: 'pain' as const,
        requestedAction: 'skip' as const, focalPain: true, symptomSeverity: 3 as const },
    ]) {
      const result = buildDailyAdjustmentOptions(request, {
        plannedSession: planned, weekSessions: [planned], availableDates: ['2026-07-29'],
      });
      expect(result.options.length).toBeGreaterThan(0);
      expect(result.options.every(option => option.requiresApproval)).toBe(true);
    }
  });

  it('optional sessions still require signoff before skip or replacement', () => {
    const optional = { ...planned, priority: 'optional' as const, keySession: false };
    const skip = buildDailyAdjustmentOptions({
      sessionId: optional.id, reason: 'preference', requestedAction: 'skip',
    }, {
      plannedSession: optional, weekSessions: [optional], availableDates: [],
    });
    expect(skip.options.find(option => option.action === 'skip')?.requiresApproval).toBe(true);
    const replacement = buildDailyAdjustmentOptions({
      sessionId: optional.id, reason: 'access',
      requestedAction: 'different', availableDisciplines: ['swim'],
    }, {
      plannedSession: optional, weekSessions: [optional], availableDates: [],
    });
    expect(replacement.options.find(option => option.action === 'replace')?.requiresApproval).toBe(true);
  });

  it('does not quietly move training when the athlete requested fatigue or time reduction', () => {
    for (const reason of ['fatigue', 'time', 'access'] as const) {
      const result = buildDailyAdjustmentOptions({
        sessionId: planned.id, reason,
        requestedAction: reason === 'fatigue' ? 'easier'
          : reason === 'time' ? 'shorter' : 'different',
        availableMinutes: 35,
        availableDisciplines: ['swim'],
      }, {
        plannedSession: planned, weekSessions: [planned],
        availableDates: ['2026-07-29', '2026-07-30'],
      });
      expect(result.options.some(option => option.action === 'move')).toBe(false);
    }
    const explicitlyMoved = buildDailyAdjustmentOptions({
      sessionId: planned.id, reason: 'preference', requestedAction: 'move',
    }, {
      plannedSession: planned, weekSessions: [planned],
      availableDates: ['2026-07-29'],
    });
    expect(explicitlyMoved.options.some(option => option.action === 'move')).toBe(true);
    expect(explicitlyMoved.options.find(option => option.action === 'move')?.requiresApproval)
      .toBe(true);
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
