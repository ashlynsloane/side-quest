import type { TrainingCalendarEvent } from '@circuit/domain';
import type { SpaceAwarePlannedSession } from '@circuit/planner/strength-training-space-allocation';
import {
  coordinateWeeklyStrengthStimuli,
  type WeeklyStrengthPrescription,
} from '@circuit/planner/whole-athlete-strength-coherence';
import type { WholeAthleteWeekPlan } from '@circuit/planner/whole-athlete-week';

import {
  generateAndPersistWholeAthleteBlock,
  type GenerateWholeAthleteBlockInput,
} from './whole-athlete-plan';
import { applyPersistedTrainingSpaces } from './training-space-runtime';

export type SpaceAwareWholeAthletePlannedSession = SpaceAwarePlannedSession & {
  strengthPrescription?: WeeklyStrengthPrescription;
};

export type SpaceAwareWholeAthleteWeekPlan = Omit<WholeAthleteWeekPlan, 'sessions'> & {
  sessions: SpaceAwareWholeAthletePlannedSession[];
};

export interface SpaceAwareWholeAthleteBlock {
  weeks: SpaceAwareWholeAthleteWeekPlan[];
  generatedEvents: TrainingCalendarEvent[];
}

/**
 * Mobile entry point for plans that should honor Training Spaces settings.
 * The base planner still decides physiology, dates, recovery, and session load.
 * We then coordinate the strength roles against the complete endurance week
 * before assigning Home/Gym, so location serves the intended stimulus rather
 * than becoming the thing that drives physiology.
 */
export async function generateAndPersistSpaceAwareWholeAthleteBlock(
  input: GenerateWholeAthleteBlockInput,
): Promise<SpaceAwareWholeAthleteBlock> {
  const base = await generateAndPersistWholeAthleteBlock(input);
  const weeks = base.weeks.map((week): SpaceAwareWholeAthleteWeekPlan => {
    const coherentSessions = coordinateWeeklyStrengthStimuli(week.sessions);
    return {
      ...week,
      sessions: applyPersistedTrainingSpaces(coherentSessions).sessions as SpaceAwareWholeAthletePlannedSession[],
    };
  });

  return {
    weeks,
    generatedEvents: base.generatedEvents,
  };
}
