import type {
  AthleteDigitalTwin,
  DigitalTwinConfidence,
  DigitalTwinConfidenceSummary,
  DigitalTwinParameterKey,
  DigitalTwinPrediction,
  DigitalTwinPredictionInput,
  DigitalTwinUpdate,
  DigitalTwinUpdateObservation,
  TwinEvidence,
  TwinParameter,
} from '@circuit/domain';

const MAX_RECENT_EVIDENCE = 50;
const MAX_SINGLE_UPDATE_FRACTION = 0.08;

function clamp(value: number, minimum = 0, maximum = 1): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function confidenceFor(evidenceCount: number): DigitalTwinConfidence {
  if (evidenceCount >= 40) return 'high';
  if (evidenceCount >= 12) return 'moderate';
  return 'low';
}

function parameter(estimate: number, generatedAt: string): TwinParameter {
  return {
    estimate,
    populationDefault: estimate,
    confidence: 'low',
    evidenceCount: 0,
    uncertainty: 1,
    lastUpdatedAt: generatedAt,
  };
}

export function createDigitalTwin(athleteId: string, generatedAt: string): AthleteDigitalTwin {
  return {
    athleteId,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    recovery: {
      recoveryHalfLifeHours: parameter(30, generatedAt),
      sorenessPersistenceHours: parameter(36, generatedAt),
      recoveryVariability: parameter(0.2, generatedAt),
    },
    adaptation: {
      strengthResponse: parameter(0.65, generatedAt),
      enduranceResponse: parameter(0.65, generatedAt),
      mixedTrainingResponse: parameter(0.6, generatedAt),
    },
    compliance: {
      completionRate: parameter(0.75, generatedAt),
      swapRate: parameter(0.15, generatedAt),
      postponementRate: parameter(0.15, generatedAt),
    },
    sensitivity: {
      sleepLossSensitivity: parameter(0.25, generatedAt),
      travelSensitivity: parameter(0.2, generatedAt),
      heatSensitivity: parameter(0.2, generatedAt),
      consecutiveHardDaySensitivity: parameter(0.3, generatedAt),
      calendarCompressionSensitivity: parameter(0.25, generatedAt),
    },
    recentEvidence: [],
    safeguards: [
      'The digital twin provides conservative decision support and does not diagnose physiology.',
      'Low-confidence estimates remain anchored to population defaults.',
      'A single workout cannot materially rewrite the athlete model.',
      'Clinician restrictions, safety constraints, and athlete approval remain authoritative.',
    ],
  };
}

function learn(current: TwinParameter, observed: number, observedAt: string): TwinParameter {
  const nextCount = current.evidenceCount + 1;
  const learningRate = Math.min(MAX_SINGLE_UPDATE_FRACTION, 1 / Math.sqrt(nextCount + 8));
  const boundedObserved = Number.isFinite(observed) ? observed : current.estimate;
  const rawChange = (boundedObserved - current.estimate) * learningRate;
  const maximumChange = Math.max(Math.abs(current.populationDefault) * MAX_SINGLE_UPDATE_FRACTION, 0.02);
  const estimate = current.estimate + clamp(rawChange, -maximumChange, maximumChange);
  return {
    ...current,
    estimate: round(estimate),
    evidenceCount: nextCount,
    confidence: confidenceFor(nextCount),
    uncertainty: round(Math.max(0.08, 1 / Math.sqrt(nextCount + 1))),
    lastUpdatedAt: observedAt,
  };
}

function responseTarget(observation: DigitalTwinUpdateObservation): number {
  const readinessDelta =
    observation.readinessBefore !== undefined && observation.readinessNextDay !== undefined
      ? (observation.readinessNextDay - observation.readinessBefore) / 10
      : 0;
  const rpePenalty = observation.sessionRpe === undefined ? 0 : Math.max(0, observation.sessionRpe - 7) * 0.035;
  const sorenessPenalty = observation.sorenessAfter === undefined ? 0 : observation.sorenessAfter * 0.025;
  return clamp(0.68 + readinessDelta - rpePenalty - sorenessPenalty, 0.2, 1);
}

export function updateDigitalTwin(
  twin: AthleteDigitalTwin,
  observation: DigitalTwinUpdateObservation,
): { twin: AthleteDigitalTwin; update: DigitalTwinUpdate } {
  const next: AthleteDigitalTwin = JSON.parse(JSON.stringify(twin)) as AthleteDigitalTwin;
  const changed = new Set<DigitalTwinParameterKey>();
  const notes: string[] = [];

  if (observation.recoveredAfterHours !== undefined) {
    next.recovery.recoveryHalfLifeHours = learn(
      next.recovery.recoveryHalfLifeHours,
      clamp(observation.recoveredAfterHours, 8, 120),
      observation.observedAt,
    );
    changed.add('recoveryHalfLifeHours');
  }
  if (observation.sorenessAfter !== undefined) {
    const sorenessHours = clamp(12 + observation.sorenessAfter * 6, 12, 96);
    next.recovery.sorenessPersistenceHours = learn(
      next.recovery.sorenessPersistenceHours,
      sorenessHours,
      observation.observedAt,
    );
    changed.add('sorenessPersistenceHours');
  }

  const response = responseTarget(observation);
  const adaptationKey =
    observation.workoutType === 'strength'
      ? 'strengthResponse'
      : observation.workoutType === 'endurance'
        ? 'enduranceResponse'
        : 'mixedTrainingResponse';
  next.adaptation[adaptationKey] = learn(next.adaptation[adaptationKey], response, observation.observedAt);
  changed.add(adaptationKey);

  if (observation.completedAsPlanned !== undefined) {
    next.compliance.completionRate = learn(
      next.compliance.completionRate,
      observation.completedAsPlanned ? 1 : 0,
      observation.observedAt,
    );
    changed.add('completionRate');
  }
  if (observation.swapped !== undefined) {
    next.compliance.swapRate = learn(next.compliance.swapRate, observation.swapped ? 1 : 0, observation.observedAt);
    changed.add('swapRate');
  }
  if (observation.postponed !== undefined) {
    next.compliance.postponementRate = learn(
      next.compliance.postponementRate,
      observation.postponed ? 1 : 0,
      observation.observedAt,
    );
    changed.add('postponementRate');
  }

  const readinessLoss =
    observation.readinessBefore !== undefined && observation.readinessNextDay !== undefined
      ? clamp((observation.readinessBefore - observation.readinessNextDay) / 10)
      : 0.25;
  const sensitivityUpdates: Array<[DigitalTwinParameterKey, boolean | undefined, keyof AthleteDigitalTwin['sensitivity']]> = [
    ['sleepLossSensitivity', observation.sleepLoss, 'sleepLossSensitivity'],
    ['travelSensitivity', observation.travel, 'travelSensitivity'],
    ['heatSensitivity', observation.heatExposure, 'heatSensitivity'],
  ];
  for (const [key, present, modelKey] of sensitivityUpdates) {
    if (present) {
      next.sensitivity[modelKey] = learn(next.sensitivity[modelKey], readinessLoss, observation.observedAt);
      changed.add(key);
    }
  }
  if ((observation.consecutiveHardDays ?? 0) >= 2) {
    next.sensitivity.consecutiveHardDaySensitivity = learn(
      next.sensitivity.consecutiveHardDaySensitivity,
      readinessLoss,
      observation.observedAt,
    );
    changed.add('consecutiveHardDaySensitivity');
  }
  if (observation.calendarCompression !== undefined) {
    next.sensitivity.calendarCompressionSensitivity = learn(
      next.sensitivity.calendarCompressionSensitivity,
      clamp(observation.calendarCompression),
      observation.observedAt,
    );
    changed.add('calendarCompressionSensitivity');
  }

  next.updatedAt = observation.observedAt;
  const latestEvidence: TwinEvidence = {
    evidenceId: observation.observationId,
    observedAt: observation.observedAt,
    source: 'workout_response',
    summary: `${observation.workoutType} workout response updated ${changed.size} model parameter${changed.size === 1 ? '' : 's'}.`,
    quality: 'self_reported',
  };
  next.recentEvidence = [
    latestEvidence,
    ...next.recentEvidence.filter((item) => item.evidenceId !== observation.observationId),
  ].slice(0, MAX_RECENT_EVIDENCE);
  notes.push(`Applied conservative learning to ${changed.size} parameters.`);
  if (changed.size === 0) notes.push('No usable learning signals were present.');

  return {
    twin: next,
    update: {
      observationId: observation.observationId,
      updatedAt: observation.observedAt,
      changedParameters: [...changed],
      learningRate: MAX_SINGLE_UPDATE_FRACTION,
      notes,
    },
  };
}

function personalizedEstimate(parameterValue: TwinParameter): number {
  const confidenceWeight = clamp(parameterValue.evidenceCount / 40);
  return parameterValue.populationDefault * (1 - confidenceWeight) + parameterValue.estimate * confidenceWeight;
}

export function predictRecovery(
  twin: AthleteDigitalTwin,
  input: DigitalTwinPredictionInput,
): { hours: number; recovery: number; confidence: DigitalTwinConfidence } {
  const baseHours = personalizedEstimate(twin.recovery.recoveryHalfLifeHours);
  let multiplier = 0.65 + clamp(input.load) * 0.7;
  if (input.sleepLoss) multiplier += personalizedEstimate(twin.sensitivity.sleepLossSensitivity);
  if (input.travel) multiplier += personalizedEstimate(twin.sensitivity.travelSensitivity);
  if (input.heatExposure) multiplier += personalizedEstimate(twin.sensitivity.heatSensitivity);
  multiplier += Math.max(0, (input.consecutiveHardDays ?? 1) - 1) * personalizedEstimate(
    twin.sensitivity.consecutiveHardDaySensitivity,
  ) * 0.35;
  const hours = round(clamp(baseHours * multiplier, 6, 168), 1);
  return {
    hours,
    recovery: round(clamp(input.recoveryWindowHours / Math.max(hours, 1))),
    confidence: confidenceFor(twin.recovery.recoveryHalfLifeHours.evidenceCount),
  };
}

export function predictAdaptation(twin: AthleteDigitalTwin, input: DigitalTwinPredictionInput): number {
  const responseParameter =
    input.workoutType === 'strength'
      ? twin.adaptation.strengthResponse
      : input.workoutType === 'endurance'
        ? twin.adaptation.enduranceResponse
        : twin.adaptation.mixedTrainingResponse;
  return round(clamp(personalizedEstimate(responseParameter) * (0.45 + clamp(input.load) * 0.55)));
}

export function predictScenarioOutcome(
  twin: AthleteDigitalTwin,
  input: DigitalTwinPredictionInput,
): DigitalTwinPrediction {
  const recovery = predictRecovery(twin, input);
  const adaptation = predictAdaptation(twin, input);
  const stress =
    (input.sleepLoss ? personalizedEstimate(twin.sensitivity.sleepLossSensitivity) : 0) +
    (input.travel ? personalizedEstimate(twin.sensitivity.travelSensitivity) : 0) +
    (input.heatExposure ? personalizedEstimate(twin.sensitivity.heatSensitivity) : 0) +
    Math.max(0, (input.consecutiveHardDays ?? 1) - 1) * 0.08 +
    clamp(input.calendarCompression ?? 0) * personalizedEstimate(twin.sensitivity.calendarCompressionSensitivity);
  const injuryRisk = round(clamp(clamp(input.load) * 0.35 + stress * 0.25 + (1 - recovery.recovery) * 0.3));
  const performance = round(clamp(recovery.recovery * 0.65 + (1 - stress) * 0.35));
  const evidenceCounts = [
    twin.recovery.recoveryHalfLifeHours.evidenceCount,
    twin.adaptation.strengthResponse.evidenceCount,
    twin.adaptation.enduranceResponse.evidenceCount,
    twin.adaptation.mixedTrainingResponse.evidenceCount,
  ];
  const relevantEvidence = Math.max(...evidenceCounts);
  const personalizedWeight = round(clamp(relevantEvidence / 40));
  return {
    scenarioId: input.scenarioId,
    expectedAdaptation: adaptation,
    expectedRecovery: recovery.recovery,
    expectedPerformance: performance,
    expectedInjuryRisk: injuryRisk,
    predictedRecoveryHours: recovery.hours,
    confidence: confidenceFor(relevantEvidence),
    personalizedWeight,
    rationale: [
      `Prediction blends athlete evidence with population defaults at ${Math.round(personalizedWeight * 100)}% personalization.`,
      `Estimated recovery requirement is ${recovery.hours} hours.`,
      recovery.confidence === 'low'
        ? 'Recovery evidence is sparse, so the estimate remains strongly anchored to defaults.'
        : 'Repeated athlete observations contribute materially to this estimate.',
    ],
  };
}

export function summarizeTwinConfidence(twin: AthleteDigitalTwin): DigitalTwinConfidenceSummary {
  const entries: Array<[DigitalTwinParameterKey, TwinParameter]> = [
    ['recoveryHalfLifeHours', twin.recovery.recoveryHalfLifeHours],
    ['sorenessPersistenceHours', twin.recovery.sorenessPersistenceHours],
    ['recoveryVariability', twin.recovery.recoveryVariability],
    ['strengthResponse', twin.adaptation.strengthResponse],
    ['enduranceResponse', twin.adaptation.enduranceResponse],
    ['mixedTrainingResponse', twin.adaptation.mixedTrainingResponse],
    ['completionRate', twin.compliance.completionRate],
    ['swapRate', twin.compliance.swapRate],
    ['postponementRate', twin.compliance.postponementRate],
    ['sleepLossSensitivity', twin.sensitivity.sleepLossSensitivity],
    ['travelSensitivity', twin.sensitivity.travelSensitivity],
    ['heatSensitivity', twin.sensitivity.heatSensitivity],
    ['consecutiveHardDaySensitivity', twin.sensitivity.consecutiveHardDaySensitivity],
    ['calendarCompressionSensitivity', twin.sensitivity.calendarCompressionSensitivity],
  ];
  const totalEvidence = entries.reduce((sum, [, item]) => sum + item.evidenceCount, 0);
  const averageEvidence = totalEvidence / entries.length;
  const overall = confidenceFor(Math.floor(averageEvidence));
  const lowConfidenceParameters = entries.filter(([, item]) => item.confidence === 'low').map(([key]) => key);
  return {
    overall,
    totalEvidence,
    lowConfidenceParameters,
    summary: `${overall} overall confidence from ${totalEvidence} parameter-level observations; ${lowConfidenceParameters.length} parameters remain low confidence.`,
  };
}
