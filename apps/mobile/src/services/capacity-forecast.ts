import type { CapacityForecastConflict, CapacityForecastResult, ForecastResource } from '@circuit/domain';
import { capacityAt } from '@circuit/planner';

export interface RecoveryForecastCard {
  headline: string;
  detail: string;
  confidence: CapacityForecastResult['confidence'];
  conflicts: CapacityForecastConflict[];
}

export function buildRecoveryForecastCard(result: CapacityForecastResult): RecoveryForecastCard {
  const first = result.conflicts[0];
  if (!first) {
    return {
      headline: 'No forecasted capacity conflict',
      detail: `The next ${Math.round(result.horizonHours / 24)} days remain above the current planning thresholds.`,
      confidence: result.confidence,
      conflicts: [],
    };
  }
  return {
    headline: `${first.resource.replaceAll('_', ' ')} may become limiting`,
    detail: `${first.availableCapacity}% capacity is forecast near the affected session. Review the contributing sessions before moving a key workout.`,
    confidence: result.confidence,
    conflicts: result.conflicts,
  };
}

export function recoveryTimelineValue(result: CapacityForecastResult, resource: ForecastResource, at: string): number | undefined {
  return capacityAt(result, resource, at)?.availableCapacity;
}
