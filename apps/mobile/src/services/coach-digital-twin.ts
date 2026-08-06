import type {
  AthleteDigitalTwin,
  DigitalTwinConfidenceSummary,
  DigitalTwinParameterKey,
  DigitalTwinPrediction,
  TwinParameter,
} from '@circuit/domain';

export interface DigitalTwinParameterCard {
  key: DigitalTwinParameterKey;
  label: string;
  value: string;
  confidence: TwinParameter['confidence'];
  evidenceCount: number;
  uncertainty: number;
}

export interface DigitalTwinSummaryCard {
  title: string;
  subtitle: string;
  confidence: DigitalTwinConfidenceSummary;
  parameters: DigitalTwinParameterCard[];
  safeguards: string[];
}

export interface DigitalTwinPredictionCard {
  scenarioId: string;
  recovery: string;
  adaptation: string;
  injuryRisk: string;
  confidence: DigitalTwinPrediction['confidence'];
  rationale: string[];
}

function parameterCard(
  key: DigitalTwinParameterKey,
  label: string,
  parameter: TwinParameter,
  formatter: (value: number) => string,
): DigitalTwinParameterCard {
  return {
    key,
    label,
    value: formatter(parameter.estimate),
    confidence: parameter.confidence,
    evidenceCount: parameter.evidenceCount,
    uncertainty: parameter.uncertainty,
  };
}

export function buildDigitalTwinSummaryCard(
  twin: AthleteDigitalTwin,
  confidence: DigitalTwinConfidenceSummary,
): DigitalTwinSummaryCard {
  return {
    title: 'How your coach learns',
    subtitle: confidence.summary,
    confidence,
    parameters: [
      parameterCard('recoveryHalfLifeHours', 'Recovery profile', twin.recovery.recoveryHalfLifeHours, (value) => `${value.toFixed(1)} hr`),
      parameterCard('strengthResponse', 'Strength response', twin.adaptation.strengthResponse, (value) => `${Math.round(value * 100)}%`),
      parameterCard('enduranceResponse', 'Endurance response', twin.adaptation.enduranceResponse, (value) => `${Math.round(value * 100)}%`),
      parameterCard('completionRate', 'Plan completion', twin.compliance.completionRate, (value) => `${Math.round(value * 100)}%`),
      parameterCard('sleepLossSensitivity', 'Sleep sensitivity', twin.sensitivity.sleepLossSensitivity, (value) => `${Math.round(value * 100)}%`),
    ],
    safeguards: twin.safeguards,
  };
}

export function buildDigitalTwinPredictionCard(
  prediction: DigitalTwinPrediction,
): DigitalTwinPredictionCard {
  return {
    scenarioId: prediction.scenarioId,
    recovery: `${prediction.predictedRecoveryHours.toFixed(1)} hr`,
    adaptation: `${Math.round(prediction.expectedAdaptation * 100)}%`,
    injuryRisk: `${Math.round(prediction.expectedInjuryRisk * 100)}%`,
    confidence: prediction.confidence,
    rationale: prediction.rationale,
  };
}
