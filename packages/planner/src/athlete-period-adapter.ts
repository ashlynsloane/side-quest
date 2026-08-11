import {
  buildCycleTrainingForecast,
  type CycleSymptomObservation,
  type CycleTrainingAdjustment,
  type CycleTrainingForecast,
  type MenstrualContextSignal,
} from './athlete-context-intelligence';

export interface AthletePeriodTrainingContext {
  predictedPeriodStart?: string;
  predictionConfidence?: 'low' | 'moderate' | 'high';
  currentSymptoms?: MenstrualContextSignal;
  symptomHistory?: CycleSymptomObservation[];
}

export interface AthletePeriodTrainingSignal {
  source: 'athlete_period';
  forecast: CycleTrainingForecast;
  predictedPeriodStart?: string;
  suggestedAdjustments: CycleTrainingAdjustment[];
  automaticReductionAllowed: false;
  explanation: string;
}

export function adaptAthletePeriodContext(
  context: AthletePeriodTrainingContext,
  referenceDate: string,
): AthletePeriodTrainingSignal {
  const daysUntilPredictedPeriod = context.predictedPeriodStart
    ? daysBetween(referenceDate, context.predictedPeriodStart)
    : 999;
  const forecast = buildCycleTrainingForecast({
    daysUntilPredictedPeriod,
    predictionConfidence: context.predictionConfidence ?? 'low',
    observations: context.symptomHistory ?? [],
    activeSymptoms: context.currentSymptoms,
  });
  const explanation = forecast.mode === 'active_symptom_adjustment'
    ? 'Current symptoms are active training context; Side Quest may offer athlete-preferred modifications that still fit the week.'
    : forecast.mode === 'offer_preemptive_options'
      ? 'A repeated athlete-specific pattern exists near the predicted window; Side Quest may surface options early but must not auto-reduce training.'
      : 'Cycle timing is context only. Side Quest will not change training from predicted phase alone.';
  return {
    source: 'athlete_period',
    forecast,
    predictedPeriodStart: context.predictedPeriodStart,
    suggestedAdjustments: forecast.suggestedAdjustments,
    automaticReductionAllowed: false,
    explanation,
  };
}

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(`${from.slice(0, 10)}T12:00:00Z`).getTime();
  const toMs = new Date(`${to.slice(0, 10)}T12:00:00Z`).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 999;
  return Math.round((toMs - fromMs) / 86_400_000);
}
