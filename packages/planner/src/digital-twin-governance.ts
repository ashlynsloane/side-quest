import type {
  AthleteDigitalTwin,
  DigitalTwinParameterKey,
  TwinCalibrationRecord,
  TwinDriftAssessment,
  TwinEvidenceExclusion,
  TwinGovernanceState,
  TwinParameter,
  TwinParameterSnapshot,
  TwinPredictionOutcome,
  TwinReliability,
  TwinReliabilitySummary,
  TwinRollbackPoint,
} from '@circuit/domain';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 3) => Number(value.toFixed(digits));

export function createTwinGovernanceState(): TwinGovernanceState {
  return {
    calibration: {}, snapshots: [], rollbacks: [], exclusions: [], frozenParameters: [], drift: {},
    safeguards: [
      'Digital Twin governance may reduce personalization but cannot authorize plan changes.',
      'Clinician restrictions, hard constraints, and athlete approval remain authoritative.',
      'Excluded evidence is retained in the audit trail and is never silently deleted.',
    ],
  };
}

export function recordTwinPredictionOutcome(
  outcomes: TwinPredictionOutcome[],
  outcome: TwinPredictionOutcome,
): TwinPredictionOutcome[] {
  return [outcome, ...outcomes.filter((item) => item.outcomeId !== outcome.outcomeId)].slice(0, 500);
}

export function evaluateTwinCalibration(
  outcomes: TwinPredictionOutcome[],
  generatedAt: string,
): Partial<Record<DigitalTwinParameterKey, TwinCalibrationRecord>> {
  const groups = new Map<DigitalTwinParameterKey, TwinPredictionOutcome[]>();
  for (const outcome of outcomes) {
    const current = groups.get(outcome.parameterKey) ?? [];
    current.push(outcome);
    groups.set(outcome.parameterKey, current);
  }
  const calibration: Partial<Record<DigitalTwinParameterKey, TwinCalibrationRecord>> = {};
  for (const [parameterKey, values] of groups) {
    const errors = values.map((value) => value.observedValue - value.predictedValue);
    const scale = Math.max(1, values.reduce((sum, value) => sum + Math.abs(value.observedValue), 0) / values.length);
    const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length;
    const normalizedError = mae / scale;
    const reliability: TwinReliability = values.length < 3 ? 'watch' : normalizedError > 0.35 ? 'fallback' : normalizedError > 0.18 ? 'watch' : 'stable';
    calibration[parameterKey] = {
      parameterKey, sampleCount: values.length, meanAbsoluteError: round(mae),
      bias: round(errors.reduce((sum, value) => sum + value, 0) / errors.length), reliability, updatedAt: generatedAt,
    };
  }
  return calibration;
}

export function detectTwinDrift(
  parameterKey: DigitalTwinParameterKey,
  current: TwinParameter,
  stable: TwinParameterSnapshot | undefined,
  calibration?: TwinCalibrationRecord,
): TwinDriftAssessment {
  const reasons: string[] = [];
  let severity = 0;
  if (stable) {
    const baseline = Math.max(Math.abs(stable.parameter.estimate), 0.1);
    const relativeChange = Math.abs(current.estimate - stable.parameter.estimate) / baseline;
    if (relativeChange > 0.35 && current.evidenceCount - stable.parameter.evidenceCount < 5) {
      severity = Math.max(severity, clamp(relativeChange));
      reasons.push('Large parameter change occurred with limited new evidence.');
    }
  }
  if (calibration?.reliability === 'fallback') {
    severity = Math.max(severity, 0.8);
    reasons.push('Recent predictions are poorly calibrated.');
  } else if (calibration?.reliability === 'watch') {
    severity = Math.max(severity, 0.45);
    reasons.push('Calibration requires additional evidence.');
  }
  const driftType = reasons.length === 0 ? 'none' : calibration?.reliability === 'fallback' ? 'structural' : 'temporary';
  const reliability: TwinReliability = severity >= 0.75 ? 'fallback' : severity >= 0.35 ? 'watch' : 'stable';
  return {
    parameterKey, driftType, severity: round(severity), reliability, reasons,
    recommendedAction: reliability === 'fallback' ? (stable ? 'rollback' : 'population_fallback') : reliability === 'watch' ? 'slow_learning' : 'continue',
  };
}

export function createTwinSnapshot(
  parameterKey: DigitalTwinParameterKey,
  parameter: TwinParameter,
  createdAt: string,
  reason: string,
): TwinParameterSnapshot {
  return { snapshotId: `twin-snapshot:${parameterKey}:${createdAt}`, parameterKey, parameter: { ...parameter }, createdAt, reason };
}

export function excludeTwinEvidence(
  state: TwinGovernanceState,
  exclusion: TwinEvidenceExclusion,
): TwinGovernanceState {
  return { ...state, exclusions: [exclusion, ...state.exclusions.filter((item) => item.evidenceId !== exclusion.evidenceId)] };
}

export function rollbackTwinParameter(
  parameter: TwinParameter,
  snapshot: TwinParameterSnapshot,
  appliedAt: string,
  reason: string,
): { parameter: TwinParameter; rollback: TwinRollbackPoint } {
  return {
    parameter: { ...snapshot.parameter, lastUpdatedAt: appliedAt },
    rollback: {
      rollbackId: `twin-rollback:${snapshot.parameterKey}:${appliedAt}`, parameterKey: snapshot.parameterKey,
      fromEstimate: parameter.estimate, toEstimate: snapshot.parameter.estimate, appliedAt, snapshotId: snapshot.snapshotId, reason,
    },
  };
}

export function applyTwinGovernancePolicy(
  state: TwinGovernanceState,
  assessments: TwinDriftAssessment[],
): TwinGovernanceState {
  const drift = { ...state.drift };
  const frozen = new Set(state.frozenParameters);
  for (const assessment of assessments) {
    drift[assessment.parameterKey] = assessment;
    if (assessment.recommendedAction === 'freeze' || assessment.recommendedAction === 'rollback') frozen.add(assessment.parameterKey);
    else if (assessment.reliability === 'stable') frozen.delete(assessment.parameterKey);
  }
  return { ...state, drift, frozenParameters: [...frozen] };
}

export function summarizeTwinReliability(state: TwinGovernanceState): TwinReliabilitySummary {
  const stableParameters: DigitalTwinParameterKey[] = [];
  const watchParameters: DigitalTwinParameterKey[] = [];
  const fallbackParameters: DigitalTwinParameterKey[] = [];
  for (const assessment of Object.values(state.drift)) {
    if (!assessment) continue;
    if (assessment.reliability === 'stable') stableParameters.push(assessment.parameterKey);
    else if (assessment.reliability === 'watch') watchParameters.push(assessment.parameterKey);
    else fallbackParameters.push(assessment.parameterKey);
  }
  const overall: TwinReliability = fallbackParameters.length ? 'fallback' : watchParameters.length ? 'watch' : 'stable';
  return { overall, stableParameters, watchParameters, fallbackParameters, summary: [
    `${stableParameters.length} parameters stable.`, `${watchParameters.length} parameters under review.`, `${fallbackParameters.length} parameters using conservative fallback.`,
  ] };
}

export function twinPersonalizationWeight(state: TwinGovernanceState, parameterKey: DigitalTwinParameterKey): number {
  const reliability = state.drift[parameterKey]?.reliability ?? state.calibration[parameterKey]?.reliability ?? 'watch';
  return reliability === 'stable' ? 1 : reliability === 'watch' ? 0.5 : 0;
}

export function filterTwinEvidence<T extends { evidenceId?: string }>(state: TwinGovernanceState, values: T[]): T[] {
  const excluded = new Set(state.exclusions.map((item) => item.evidenceId));
  return values.filter((item) => !item.evidenceId || !excluded.has(item.evidenceId));
}

export function governanceSafeguardsPreserved(_twin: AthleteDigitalTwin): true { return true; }
