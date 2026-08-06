import { describe, expect, it } from 'vitest';
import type { CrossSportStructuralSession, StructuralExposureDecision } from '@circuit/domain';
import { applyCrossSportAdjustmentToExposure, decideCrossSportStructuralPlan, detectCrossSportStructuralOverlaps } from '../src/cross-sport-structural-load';

const session = (values: Partial<CrossSportStructuralSession> & Pick<CrossSportStructuralSession, 'sessionId' | 'discipline' | 'startsAt'>): CrossSportStructuralSession => ({
  durationMinutes: 60, exposure: [], movable: true, priority: 'supporting', ...values,
});

describe('V24.6 cross-sport structural load integration', () => {
  it('detects shoulder overlap between a paddle swim and overhead strength', () => {
    const overlaps = detectCrossSportStructuralOverlaps([
      session({ sessionId: 'swim', discipline: 'swim', startsAt: '2026-07-28T07:00:00Z', exposure: [{ region: 'shoulder_complex', dose: 4.5, source: 'swim', rationale: 'Paddle swim.' }] }),
      session({ sessionId: 'strength', discipline: 'strength', startsAt: '2026-07-28T17:00:00Z', exposure: [{ region: 'shoulder_complex', dose: 4, source: 'strength', rationale: 'Overhead pressing.' }] }),
    ]);
    expect(overlaps[0]?.region).toBe('shoulder_complex');
    expect(overlaps[0]?.severity).toBe('separate');
  });

  it('moves the lower-priority supporting session instead of the key workout', () => {
    const decision = decideCrossSportStructuralPlan({ sessions: [
      session({ sessionId: 'long-run', discipline: 'run', startsAt: '2026-07-28T07:00:00Z', priority: 'key', movable: false, exposure: [{ region: 'knee', dose: 5, source: 'run', rationale: 'Long run.' }] }),
      session({ sessionId: 'strength', discipline: 'strength', startsAt: '2026-07-28T16:00:00Z', exposure: [{ region: 'knee', dose: 4, source: 'strength', rationale: 'Squat work.' }] }),
    ] });
    expect(decision.action).toBe('separate_sessions');
    expect(decision.adjustments.find((item) => item.sessionId === 'strength')?.action).toBe('move');
    expect(decision.adjustments.find((item) => item.sessionId === 'long-run')?.action).toBe('keep');
  });

  it('protects a currently constrained region across every discipline', () => {
    const currentDecision: StructuralExposureDecision = { action: 'modify', summaries: [], constrainedRegions: ['lumbar_spine'], avoidDimensions: ['spinalStabilization'], sessionScale: 0.7, explanations: [] };
    const decision = decideCrossSportStructuralPlan({ currentDecision, sessions: [
      session({ sessionId: 'bike', discipline: 'bike', startsAt: '2026-07-28T08:00:00Z', exposure: [{ region: 'lumbar_spine', dose: 3, source: 'bike', rationale: 'Aerobar posture.' }] }),
      session({ sessionId: 'upper', discipline: 'strength', startsAt: '2026-07-29T08:00:00Z', exposure: [{ region: 'shoulder_complex', dose: 3, source: 'strength', rationale: 'Supported upper body.' }] }),
    ] });
    expect(decision.action).toBe('protect_region');
    expect(decision.adjustments.find((item) => item.sessionId === 'bike')?.protectedRegions).toContain('lumbar_spine');
    expect(decision.adjustments.find((item) => item.sessionId === 'upper')?.action).toBe('keep');
  });

  it('reduces only the overlapping region and preserves unrelated exposure', () => {
    const exposure = [
      { region: 'shoulder_complex' as const, dose: 4, source: 'strength' as const, rationale: 'Pressing.' },
      { region: 'hip' as const, dose: 3, source: 'strength' as const, rationale: 'Hip work.' },
    ];
    const adjusted = applyCrossSportAdjustmentToExposure(exposure, { sessionId: 's', action: 'replace', scale: 0.5, protectedRegions: ['shoulder_complex'], rationale: [] });
    expect(adjusted.find((item) => item.region === 'shoulder_complex')?.dose).toBe(2);
    expect(adjusted.find((item) => item.region === 'hip')?.dose).toBe(3);
  });
});
