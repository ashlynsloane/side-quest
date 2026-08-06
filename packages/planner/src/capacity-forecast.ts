import type {
  AdaptiveDecisionConfidence,
  AthleteResponseProfile,
  CapacityForecastConflict,
  CapacityForecastInput,
  CapacityForecastPoint,
  CapacityForecastResult,
  CapacityRecoveryCurve,
  ForecastResource,
  ForecastSessionDemand,
} from '@circuit/domain';

const HOUR_MS = 3_600_000;
const DEFAULT_THRESHOLD = 55;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function confidenceRank(value: AdaptiveDecisionConfidence): number {
  return value === 'high' ? 3 : value === 'moderate' ? 2 : 1;
}

function minimumConfidence(values: AdaptiveDecisionConfidence[]): AdaptiveDecisionConfidence {
  if (!values.length) return 'low';
  return [...values].sort((a, b) => confidenceRank(a) - confidenceRank(b))[0];
}

function personalizedCurve(curve: CapacityRecoveryCurve, profile?: AthleteResponseProfile): CapacityRecoveryCurve {
  if (!profile) return curve;
  const estimate = profile.regionTolerance.find((item) => item.key === curve.resource)
    ?? profile.disciplineTolerance.find((item) => item.key === curve.resource);
  if (!estimate || estimate.signalQuality === 'insufficient') return curve;
  const recoveryHours = estimate.typicalRecoveryHours ?? profile.recoveryLatencyHours;
  if (!recoveryHours) return curve;
  const boundedRecovery = clamp(recoveryHours, curve.fullRecoveryHours * 0.65, curve.fullRecoveryHours * 1.5);
  return {
    ...curve,
    halfLifeHours: Math.max(4, boundedRecovery / 2),
    fullRecoveryHours: boundedRecovery,
    confidence: estimate.confidence,
    source: 'athlete_response',
  };
}

function remainingDemand(curve: CapacityRecoveryCurve, elapsedHours: number): number {
  if (elapsedHours < 0) return 0;
  if (elapsedHours >= curve.fullRecoveryHours) return 0;
  const peak = Math.max(0, curve.peakDelayHours);
  if (curve.shape === 'delayed_peak' && elapsedHours < peak) {
    return curve.demand * (0.65 + 0.35 * (elapsedHours / Math.max(1, peak)));
  }
  const recoveryElapsed = Math.max(0, elapsedHours - peak);
  if (curve.shape === 'linear') {
    return curve.demand * (1 - recoveryElapsed / Math.max(1, curve.fullRecoveryHours - peak));
  }
  return curve.demand * Math.pow(0.5, recoveryElapsed / Math.max(1, curve.halfLifeHours));
}

function activeSessions(input: CapacityForecastInput, atMs: number): ForecastSessionDemand[] {
  return [...input.completedSessions, ...input.plannedSessions]
    .filter((session) => new Date(session.startsAt).getTime() <= atMs);
}

function resources(input: CapacityForecastInput): ForecastResource[] {
  return [...new Set([...input.completedSessions, ...input.plannedSessions]
    .flatMap((session) => session.curves.map((curve) => curve.resource)))];
}

function conflictSeverity(capacity: number, threshold: number): CapacityForecastConflict['severity'] {
  if (capacity <= threshold - 20) return 'critical';
  if (capacity <= threshold - 8) return 'meaningful';
  return 'watch';
}

export function forecastCapacity(input: CapacityForecastInput): CapacityForecastResult {
  const horizonHours = input.horizonHours ?? 168;
  const intervalHours = input.intervalHours ?? 12;
  const generatedMs = new Date(input.generatedAt).getTime();
  const forecastResources = resources(input);
  const points: CapacityForecastPoint[] = [];

  for (let offset = 0; offset <= horizonHours; offset += intervalHours) {
    const atMs = generatedMs + offset * HOUR_MS;
    for (const resource of forecastResources) {
      const contributors: string[] = [];
      const confidences: AdaptiveDecisionConfidence[] = [];
      let demand = 0;
      for (const session of activeSessions(input, atMs)) {
        const elapsed = (atMs - new Date(session.startsAt).getTime()) / HOUR_MS;
        for (const original of session.curves.filter((curve) => curve.resource === resource)) {
          const curve = personalizedCurve(original, input.athleteResponseProfile);
          const remaining = remainingDemand(curve, elapsed);
          if (remaining > 0.5) contributors.push(session.sessionId);
          demand += remaining;
          confidences.push(curve.confidence);
        }
      }
      points.push({
        at: new Date(atMs).toISOString(),
        resource,
        availableCapacity: Math.round(clamp(100 - demand, 0, 100)),
        confidence: minimumConfidence(confidences),
        contributingSessionIds: [...new Set(contributors)],
      });
    }
  }

  const conflicts: CapacityForecastConflict[] = [];
  for (const session of input.plannedSessions) {
    const sessionMs = new Date(session.startsAt).getTime();
    for (const curve of session.curves) {
      const point = points
        .filter((item) => item.resource === curve.resource)
        .sort((a, b) => Math.abs(new Date(a.at).getTime() - sessionMs) - Math.abs(new Date(b.at).getTime() - sessionMs))[0];
      if (!point) continue;
      const threshold = input.resourceThresholds?.[curve.resource] ?? DEFAULT_THRESHOLD;
      if (point.availableCapacity >= threshold) continue;
      conflicts.push({
        id: `${session.sessionId}:${curve.resource}:${point.at}`,
        at: point.at,
        resource: curve.resource,
        availableCapacity: point.availableCapacity,
        threshold,
        severity: conflictSeverity(point.availableCapacity, threshold),
        affectedSessionId: session.sessionId,
        reasons: [
          `${curve.resource} capacity is forecast at ${point.availableCapacity}% near ${session.title}.`,
          `The planning threshold is ${threshold}%.`,
          point.contributingSessionIds.length
            ? `Contributing sessions: ${point.contributingSessionIds.join(', ')}.`
            : 'The forecast has no identified contributing session.',
        ],
      });
    }
  }

  const lowestCapacityByResource: Partial<Record<ForecastResource, number>> = {};
  for (const point of points) {
    const current = lowestCapacityByResource[point.resource];
    if (current === undefined || point.availableCapacity < current) lowestCapacityByResource[point.resource] = point.availableCapacity;
  }
  const confidence = minimumConfidence(points.map((point) => point.confidence));
  return {
    generatedAt: input.generatedAt,
    horizonHours,
    points,
    conflicts: conflicts.sort((a, b) => a.at.localeCompare(b.at) || a.resource.localeCompare(b.resource)),
    lowestCapacityByResource,
    confidence,
    explanations: [
      `Forecast simulates ${horizonHours} hours in ${intervalHours}-hour steps.`,
      input.athleteResponseProfile
        ? 'Established athlete-response evidence adjusts bounded recovery timing; sparse evidence keeps generic curves.'
        : 'Generic recovery curves are used because no athlete-response profile was supplied.',
      'The forecast is a planning aid, not a diagnosis or guarantee of pain or injury.',
    ],
  };
}

export function capacityAt(
  result: CapacityForecastResult,
  resource: ForecastResource,
  at: string,
): CapacityForecastPoint | undefined {
  const target = new Date(at).getTime();
  return result.points
    .filter((point) => point.resource === resource)
    .sort((a, b) => Math.abs(new Date(a.at).getTime() - target) - Math.abs(new Date(b.at).getTime() - target))[0];
}
