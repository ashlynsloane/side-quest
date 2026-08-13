import {
  buildWholeAthleteWeek as buildStrategyWholeAthleteWeek,
} from './whole-athlete-week-strategy';
import { applyBikeQualityAnchor } from './bike-quality-anchor';
import {
  applyTrainingBlockRhythm,
  reconcileTrainingWeekdays,
} from './whole-athlete-week-rhythm';
import { applyWeekendLongRideAnchor } from './bike-long-ride-anchor';
import { applyDisciplineDaySpread } from './discipline-day-spread';
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
 * 3. A bike-development week converts one approved weekday ride into quality
 *    without adding training time or impact.
 * 4. Block rhythm preserves repeatable weekdays and chooses the week's workout
 *    families without increasing the approved dose.
 * 5. Long-course triathlon bike volume is shaped around one weekend long ride
 *    rather than several nearly-identical medium-long rides.
 * 6. Accidental generated swim doubles are spread across distinct days while
 *    preserving fixed athlete commitments and the lowest-load recovery day.
 */
export function buildWholeAthleteWeek(input: WholeAthleteWeeklyPlannerInput): WholeAthleteWeekPlan {
  const strategicPlan = buildStrategyWholeAthleteWeek(input);
  const qualityShapedPlan = applyBikeQualityAnchor(strategicPlan, input);

  // Establish workout families and a provisional rhythm before long-ride
  // shaping so downstream bike logic still sees sensible weekday structure.
  const rhythmedPlan = applyTrainingBlockRhythm(qualityShapedPlan, input);

  const longRidePlan = applyWeekendLongRideAnchor(rhythmedPlan, input);
  const spreadPlan = applyDisciplineDaySpread(longRidePlan, input);

  // Final structural reconciliation changes weekdays only. Workout identity,
  // long-ride shaping, duration, intensity, and key-session status have already
  // been decided upstream and must not be re-authored here.
  return reconcileTrainingWeekdays(spreadPlan, input);
}
