import { describe, expect, it } from 'vitest';
import {
  applyTwinGovernancePolicy,
  createTwinGovernanceState,
  createTwinSnapshot,
  detectTwinDrift,
  evaluateTwinCalibration,
  excludeTwinEvidence,
  filterTwinEvidence,
  rollbackTwinParameter,
  summarizeTwinReliability,
  twinPersonalizationWeight,
} from '../src';

const parameter = { estimate: 24, populationDefault: 24, confidence: 'moderate' as const, evidenceCount: 20, uncertainty: 0.3, lastUpdatedAt: '2026-07-01' };

describe('digital twin governance', () => {
  it('improves reliability when prediction errors are small', () => {
    const calibration = evaluateTwinCalibration([
      { outcomeId: '1', parameterKey: 'recoveryHalfLifeHours', predictedValue: 24, observedValue: 25, predictedAt: 'a', observedAt: 'b' },
      { outcomeId: '2', parameterKey: 'recoveryHalfLifeHours', predictedValue: 26, observedValue: 25, predictedAt: 'a', observedAt: 'b' },
      { outcomeId: '3', parameterKey: 'recoveryHalfLifeHours', predictedValue: 25, observedValue: 25, predictedAt: 'a', observedAt: 'b' },
    ], '2026-07-29');
    expect(calibration.recoveryHalfLifeHours?.reliability).toBe('stable');
  });

  it('detects abrupt drift and supports rollback', () => {
    const snapshot = createTwinSnapshot('recoveryHalfLifeHours', parameter, '2026-07-01', 'Stable baseline');
    const current = { ...parameter, estimate: 40, evidenceCount: 22 };
    const drift = detectTwinDrift('recoveryHalfLifeHours', current, snapshot);
    expect(drift.reliability).not.toBe('stable');
    const rollback = rollbackTwinParameter(current, snapshot, '2026-07-29', 'Abrupt low-evidence drift');
    expect(rollback.parameter.estimate).toBe(24);
  });

  it('quarantines evidence and reduces unreliable personalization', () => {
    let state = createTwinGovernanceState();
    state = excludeTwinEvidence(state, { evidenceId: 'duplicate', excludedAt: '2026-07-29', reason: 'Duplicate workout', requestedBy: 'data_quality' });
    expect(filterTwinEvidence(state, [{ evidenceId: 'duplicate' }, { evidenceId: 'valid' }])).toEqual([{ evidenceId: 'valid' }]);
    state = applyTwinGovernancePolicy(state, [{ parameterKey: 'travelSensitivity', driftType: 'data_quality', severity: 0.9, reliability: 'fallback', reasons: ['Bad import'], recommendedAction: 'population_fallback' }]);
    expect(twinPersonalizationWeight(state, 'travelSensitivity')).toBe(0);
    expect(summarizeTwinReliability(state).overall).toBe('fallback');
  });
});
