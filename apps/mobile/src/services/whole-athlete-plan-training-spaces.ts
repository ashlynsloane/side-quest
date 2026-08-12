import type { TrainingCalendarEvent } from '@circuit/domain';
import type { SpaceAwarePlannedSession } from '@circuit/planner/strength-training-space-allocation';
import type { WholeAthleteWeekPlan } from '@circuit/planner/whole-athlete-week';

import {
  generateAndPersistWholeAthleteBlock,
  type GenerateWholeAthleteBlockInput,
} from './whole-athlete-plan';
import { applyPersistedTrainingSpaces } from './training-space-runtime';

export type SpaceAwareWholeAthleteWeekPlan = Omit<WholeAthleteWeekPlan, 'sessions'> & {
  sessions: SpaceAwarePlannedSession[];
};

export interface SpaceAwareWholeAthleteBlock {
  weeks: SpaceAwareWholeAthleteWeekPlan[];
  generatedEvents: TrainingCalendarEvent[];
}

/**
 * Mobile entry point for plans that should honor Training Spaces settings.
 * The base planner still decides physiology, dates, recovery, and session load;
 * this layer attaches the athlete's configured training space afterward.
 */
export async function generateAndPersistSpaceAwareWholeAthleteBlock(
  input: GenerateWholeAthleteBlockInput,
): Promise<SpaceAwareWholeAthleteBlock> {
  const base = await generateAndPersistWholeAthleteBlock(input);
  const weeks = base.weeks.map((week): SpaceAwareWholeAthleteWeekPlan => ({
    ...week,
    sessions: applyPersistedTrainingSpaces(week.sessions).sessions,
  }));

  return {
    weeks,
    generatedEvents: base.generatedEvents,
  };
}
