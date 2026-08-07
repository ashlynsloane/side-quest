import {
  buildCycleTrainingForecast,
  type CycleSymptomObservation,
  type CycleTrainingForecast,
  type MenstrualContextSignal,
} from '@circuit/planner/athlete-context-intelligence';

/**
 * Adapter contract for a future Athlete Period integration.
 *
 * Side Quest does not infer cycle phase from training behavior or missing periods.
 * The cycle source supplies prediction confidence, symptom history, and any current
 * symptom state. Side Quest uses that information as planning context only.
 */
export interface AthletePeriodTrainingContext {
  predictedPeriodStart?: string;
  predictionConfidence: 'low' | 'moderate' | 'high';
  symptomHistory: CycleSymptomObservation[];
  activeSymptoms?: MenstrualContextSignal;
}

export interface CyclePlanningHint {
  source: 'athlete_period';
  mode: CycleTrainingForecast['mode'];
  confidence: CycleTrainingForecast['confidence'];
  offerOptions: boolean;
  automaticReductionAllowed: false;
  forecast: CycleTrainingForecast;
}

export function buildCyclePlanningHint(
  context: AthletePeriodTrainingContext,
  today = localDate(),
): CyclePlanningHint | null {
  if (context.activeSymptoms?.active) {
    const forecast = buildCycleTrainingForecast({
      daysUntilPredictedPeriod: 0,
      predictionConfidence: context.predictionConfidence,
      observations: context.symptomHistory,
      activeSymptoms: context.activeSymptoms,
    });
    return {
      source: 'athlete_period',
      mode: forecast.mode,
      confidence: forecast.confidence,
      offerOptions: true,
      automaticReductionAllowed: false,
      forecast,
    };
  }

  if (!context.predictedPeriodStart) return null;
  const daysUntilPredictedPeriod = differenceDays(today, context.predictedPeriodStart);
  const forecast = buildCycleTrainingForecast({
    daysUntilPredictedPeriod,
    predictionConfidence: context.predictionConfidence,
    observations: context.symptomHistory,
  });

  return {
    source: 'athlete_period',
    mode: forecast.mode,
    confidence: forecast.confidence,
    offerOptions: forecast.mode === 'offer_preemptive_options',
    automaticReductionAllowed: false,
    forecast,
  };
}

function differenceDays(from: string, to: string): number {
  const start = new Date(`${from}T12:00:00Z`).getTime();
  const end = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
