import type {
  AdaptationEvidencePoint,
  AdaptationForecast,
  AdaptationTrajectory,
  LongTermAdaptationInput,
  LongTermAdaptationResult,
  TrainingObjective,
} from '@circuit/domain';

const DEFAULT_HALF_LIFE_DAYS: Record<TrainingObjective, number> = {
  max_strength: 42,
  hypertrophy: 56,
  muscular_endurance: 28,
  aerobic_base: 45,
  vo2_max: 21,
  lactate_threshold: 30,
  neuromuscular_speed: 14,
  technique: 35,
  recovery: 7,
  race_specific: 28,
  injury_prevention: 42,
  mobility: 35,
};

const MAX_DAILY_SIGNAL = 8;

function daysBetween(left: string, right: string): number {
  return Math.max(0, (new Date(right).getTime() - new Date(left).getTime()) / 86_400_000);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function confidenceFor(points: AdaptationEvidencePoint[], spanDays: number): 'low' | 'moderate' | 'high' {
  if (points.length >= 12 && spanDays >= 42) return 'high';
  if (points.length >= 5 && spanDays >= 14) return 'moderate';
  return 'low';
}

function signalFor(point: AdaptationEvidencePoint): number {
  const completion = clamp(point.completionRatio ?? 1, 0, 1);
  const response = clamp(point.responseQuality ?? 0.75, 0, 1);
  const load = Math.max(0, point.adaptationLoad);
  return Math.min(MAX_DAILY_SIGNAL, load * completion * (0.6 + response * 0.4));
}

function estimateTrajectory(
  objective: TrainingObjective,
  points: AdaptationEvidencePoint[],
  generatedAt: string,
  customHalfLife?: number,
): AdaptationTrajectory {
  const halfLifeDays = Math.max(3, customHalfLife ?? DEFAULT_HALF_LIFE_DAYS[objective]);
  const decayRate = Math.log(2) / halfLifeDays;
  const ordered = [...points].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  let readinessAdjustedSignal = 0;
  for (const point of ordered) {
    const ageDays = daysBetween(point.occurredAt, generatedAt);
    readinessAdjustedSignal += signalFor(point) * Math.exp(-decayRate * ageDays);
  }
  const first = ordered[0]?.occurredAt ?? generatedAt;
  const spanDays = daysBetween(first, generatedAt);
  const confidence = confidenceFor(ordered, spanDays);
  const level = clamp(50 + readinessAdjustedSignal * 2.2, 0, 100);
  const recent = ordered.filter((point) => daysBetween(point.occurredAt, generatedAt) <= 14);
  const prior = ordered.filter((point) => {
    const age = daysBetween(point.occurredAt, generatedAt);
    return age > 14 && age <= 28;
  });
  const recentSignal = recent.reduce((sum, point) => sum + signalFor(point), 0);
  const priorSignal = prior.reduce((sum, point) => sum + signalFor(point), 0);
  const delta = clamp((recentSignal - priorSignal) * 0.7, -15, 15);
  const direction = Math.abs(delta) < 1 ? 'stable' : delta > 0 ? 'improving' : 'declining';
  return {
    objective,
    estimatedLevel: Number(level.toFixed(1)),
    changeOver28Days: Number(delta.toFixed(1)),
    direction,
    confidence,
    evidenceCount: ordered.length,
    halfLifeDays,
    reasons: [
      `${ordered.length} objective-specific training response${ordered.length === 1 ? '' : 's'} informed this estimate.`,
      `The model uses a ${halfLifeDays}-day adaptation half-life and discounts older evidence.`,
      confidence === 'low'
        ? 'The estimate is intentionally conservative because evidence is limited.'
        : 'The estimate is supported by repeated longitudinal evidence.',
    ],
  };
}

function forecastFor(trajectory: AdaptationTrajectory, horizonDays: number): AdaptationForecast {
  const decay = Math.exp((-Math.log(2) * horizonDays) / trajectory.halfLifeDays);
  const projectedWithoutTraining = 50 + (trajectory.estimatedLevel - 50) * decay;
  return {
    objective: trajectory.objective,
    horizonDays,
    projectedLevelWithoutNewStimulus: Number(clamp(projectedWithoutTraining, 0, 100).toFixed(1)),
    maintenanceExposureNeeded: trajectory.estimatedLevel >= 65 ? 1 : 0,
    confidence: trajectory.confidence,
    reasons: [
      'This projection estimates retention if no new objective-specific stimulus occurs.',
      'It is a planning estimate, not a physiological measurement or medical assessment.',
    ],
  };
}

export function trackLongTermAdaptation(input: LongTermAdaptationInput): LongTermAdaptationResult {
  const grouped = new Map<TrainingObjective, AdaptationEvidencePoint[]>();
  for (const point of input.evidence) {
    const current = grouped.get(point.objective) ?? [];
    current.push(point);
    grouped.set(point.objective, current);
  }
  const objectives = [...new Set([...input.objectives, ...grouped.keys()])];
  const trajectories = objectives.map((objective) =>
    estimateTrajectory(
      objective,
      grouped.get(objective) ?? [],
      input.generatedAt,
      input.halfLifeOverrides?.[objective],
    ),
  );
  const forecasts = trajectories.flatMap((trajectory) =>
    (input.forecastHorizonsDays ?? [14, 28, 56]).map((days) => forecastFor(trajectory, days)),
  );
  const strongest = [...trajectories].sort((a, b) => b.estimatedLevel - a.estimatedLevel)[0];
  const mostAtRisk = [...trajectories]
    .filter((item) => item.estimatedLevel > 55)
    .sort((a, b) => a.changeOver28Days - b.changeOver28Days)[0];
  return {
    generatedAt: input.generatedAt,
    trajectories,
    forecasts,
    strongestObjective: strongest?.objective,
    mostAtRiskObjective: mostAtRisk?.objective,
    explanations: [
      'Long-term adaptation estimates combine repeated training exposure, completion, and athlete response over time.',
      'Objective-specific fitness is modeled separately so gains in one area do not imply gains in another.',
      'Low-confidence estimates remain visible but cannot independently drive major plan changes.',
    ],
    safeguards: [
      'Adaptation estimates are bounded and non-diagnostic.',
      'No single workout or self-report can create a high-confidence fitness change.',
      'The model never recommends compensatory exercise, calorie restriction, or training through symptoms.',
      'Major planning changes still require the existing capacity, calendar, block, and athlete-approval safeguards.',
    ],
  };
}
