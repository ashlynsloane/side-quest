import {
  buildWholeAthleteWeek as buildStrategyWholeAthleteWeek,
} from './whole-athlete-week-strategy';
import { applyTrainingBlockRhythm } from './whole-athlete-week-rhythm';
import type {
  WholeAthleteWeeklyPlannerInput,
  WholeAthleteWeekPlan,
} from './whole-athlete-week';

export * from './whole-athlete-week-strategy';
export { applyTrainingBlockRhythm } from './whole-athlete-week-rhythm';
export type { BlockWorkoutStage, TrainingWorkoutIdentity } from './whole-athlete-week-rhythm';

/**
 * Product-level weekly planner composition.
 *
 * 1. Safety / load governance builds the allowed week.
 * 2. Race Intent + Coach Strategy may adjust that allowed allocation.
 * 3. Block rhythm preserves repeatable weekdays and chooses the week's workout
 *    families without increasing the approved dose.
 */
export function buildWholeAthleteWeek(input: WholeAthleteWeeklyPlannerInput): WholeAthleteWeekPlan {
  const strategicPlan = buildStrategyWholeAthleteWeek(input);
  return applyTrainingBlockRhythm(strategicPlan, input);
}
