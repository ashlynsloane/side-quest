import {
  buildRaceTargetEvidence,
  type RaceTargetEvidence,
} from '@circuit/planner/race-target-evidence';

import { listEnduranceActivities } from './database';
import type { RaceStrategyContext } from './race-strategy-context';

export type { RaceTargetEvidence } from '@circuit/planner/race-target-evidence';

export async function loadRaceTargetEvidence(context: RaceStrategyContext): Promise<RaceTargetEvidence> {
  const withoutHistory = buildRaceTargetEvidence({
    raceIntent: context.raceIntent,
    effectiveStrategy: context.effectiveStrategy,
    activities: [],
  });
  if (withoutHistory.status === 'none') return withoutHistory;
  if (withoutHistory.kind !== 'power' && withoutHistory.kind !== 'pace' && withoutHistory.kind !== 'speed') {
    return withoutHistory;
  }

  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 90);
  const activities = await listEnduranceActivities({
    from: from.toISOString(),
    to: now.toISOString(),
    limit: 5_000,
  });
  return buildRaceTargetEvidence({
    raceIntent: context.raceIntent,
    effectiveStrategy: context.effectiveStrategy,
    activities,
  });
}
