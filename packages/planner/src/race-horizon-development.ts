import type { PerformanceGoalType, TrainingPhase } from '@circuit/domain';

import type {
  RaceHorizonDevelopmentPlan,
  RaceHorizonDevelopmentWeek,
  RaceHorizonLoadIntent,
  RaceHorizonRunMode,
  RaceHorizonWorkoutObjective,
} from './race-development-types';

export * from './race-development-types';

export interface RaceHorizonDevelopmentInput {
  startDate: string;
  raceDate: string;
  goalType: PerformanceGoalType;
  runStatus: 'normal' | 'reduced' | 'return_to_run' | 'not_running';
  recentBoneStress?: boolean;
}

export function buildRaceHorizonDevelopmentPlan(
  input: RaceHorizonDevelopmentInput,
): RaceHorizonDevelopmentPlan {
  const startDate = normalizeDate(input.startDate);
  const raceDate = normalizeDate(input.raceDate);
  const starts = weekStartsThroughRace(startDate, raceDate);
  const phaseCounts = new Map<TrainingPhase, number>();
  const runMode = resolveRunMode(input);

  const weeks = starts.map((weekStartDate, index): RaceHorizonDevelopmentWeek => {
    const daysToRace = Math.max(0, dayDifference(raceDate, weekStartDate));
    const phase = phaseForWeek(weekStartDate, raceDate);
    const phaseWeekNumber = (phaseCounts.get(phase) ?? 0) + 1;
    phaseCounts.set(phase, phaseWeekNumber);
    const phaseStage = (phaseWeekNumber - 1) % 4;
    const developmentOrdinal = developmentOrdinalForPhaseWeek(phaseWeekNumber);
    const loadIntent = loadIntentFor(phase, phaseStage);

    return {
      weekStartDate,
      weekNumber: index + 1,
      totalWeeks: starts.length,
      raceDate,
      daysToRace,
      phase,
      phaseWeekNumber,
      loadIntent,
      targetLoadFactor: targetLoadFactorFor(phase, phaseStage),
      weekPurpose: weekPurposeFor(phase, loadIntent, runMode),
      bikeQuality: loadIntent === 'recovery'
        ? objective('bike_recovery', 'cadence_economy', 'Aerobic · Cadence Economy', 'Absorb the block with aerobic cadence work instead of another hard bike session.')
        : bikeQualityFor(phase, developmentOrdinal),
      bikeSupport: loadIntent === 'recovery'
        ? objective('bike_support', 'recovery_spin', 'Recovery Spin · Aerobic Reset', 'Keep cycling frequency with minimal residual fatigue.')
        : bikeSupportFor(phase, developmentOrdinal),
      longRide: loadIntent === 'recovery'
        ? objective('bike_long', 'reduced_aerobic', 'Long Ride · Reduced Aerobic', 'Retain durability rhythm with a shorter, fully aerobic long ride.')
        : longRideFor(phase, developmentOrdinal),
      swimObjective: swimObjectiveFor(phase, loadIntent),
      runMode,
      runObjective: runObjectiveFor(phase, runMode),
      runSupport: runSupportFor(phase, developmentOrdinal, runMode, loadIntent),
      longRun: longRunFor(phase, developmentOrdinal, runMode, loadIntent),
      strengthObjective: strengthObjectiveFor(phase, loadIntent),
    };
  });

  return {
    goalType: input.goalType,
    startDate,
    raceDate,
    totalWeeks: weeks.length,
    weeks,
    summary: `${weeks.length}-week race-horizon plan from ${startDate} through race week. Phase objectives drive the weekly workout roles; health and athlete constraints still override dose.` ,
  };
}

export function raceHorizonWeekForDate(
  plan: RaceHorizonDevelopmentPlan,
  weekStartDate: string,
): RaceHorizonDevelopmentWeek | undefined {
  return plan.weeks.find((week) => week.weekStartDate === weekStartDate);
}

function resolveRunMode(input: RaceHorizonDevelopmentInput): RaceHorizonRunMode {
  if (input.runStatus === 'return_to_run') return 'return_to_run';
  if (input.runStatus === 'reduced' || input.runStatus === 'not_running' || input.recentBoneStress) return 'easy_rebuild';
  return 'normal';
}

function phaseForWeek(weekStartDate: string, raceDate: string): TrainingPhase {
  const weekEndDate = addDays(weekStartDate, 6);
  if (raceDate >= weekStartDate && raceDate <= weekEndDate) return 'race_week';
  const daysToRace = dayDifference(raceDate, weekStartDate);
  if (daysToRace <= 14) return 'taper';
  if (daysToRace <= 35) return 'peak';
  if (daysToRace <= 84) return 'build';
  return 'base';
}

function loadIntentFor(phase: TrainingPhase, stage: number): RaceHorizonLoadIntent {
  if (phase === 'race_week') return 'race';
  if (phase === 'taper') return 'taper';
  if (phase === 'peak') return stage >= 2 ? 'absorb' : 'build';
  if (stage === 3) return 'recovery';
  return 'build';
}

function targetLoadFactorFor(phase: TrainingPhase, stage: number): number {
  if (phase === 'race_week') return 0.48;
  if (phase === 'taper') return 0.72;
  if (phase === 'peak') return [0.96, 1, 0.92, 0.9][stage] ?? 0.94;
  if (phase === 'build') return [0.94, 0.97, 1, 0.88][stage] ?? 0.95;
  return [0.88, 0.91, 0.94, 0.82][stage] ?? 0.9;
}

function weekPurposeFor(
  phase: TrainingPhase,
  loadIntent: RaceHorizonLoadIntent,
  runMode: RaceHorizonRunMode,
): string {
  if (phase === 'race_week') return 'Arrive fresh, preserve feel, and execute the race plan.';
  if (phase === 'taper') return 'Reduce fatigue while preserving short touches of race-relevant intensity.';
  if (loadIntent === 'recovery' || loadIntent === 'absorb') {
    return runMode === 'return_to_run'
      ? 'Absorb the previous training block while preserving three controlled return-to-run exposures.'
      : 'Absorb the previous training block without losing weekly rhythm.';
  }
  if (phase === 'peak') return 'Convert fitness into race-specific durability, fueling execution, and controlled race-pressure work.';
  if (phase === 'build') return 'Build sustained power and durability while making the long ride progressively more race-specific.';
  return 'Build aerobic durability, raise the cycling ceiling, and establish repeatable fueling and movement habits.';
}

function developmentOrdinalForPhaseWeek(phaseWeekNumber: number): number {
  const zeroBased = Math.max(0, phaseWeekNumber - 1);
  const recoveryWeeksBefore = Math.floor(zeroBased / 4);
  return zeroBased - recoveryWeeksBefore;
}

function bikeQualityFor(phase: TrainingPhase, stage: number): RaceHorizonWorkoutObjective {
  const base = [
    objective('bike_vo2', '6x4', 'VO2 · 6 × 4', 'Raise aerobic ceiling with repeatable high-aerobic work without turning the workout into a test.'),
    objective('bike_tempo', '3x15', 'Tempo · Aerobic Strength', 'Build sustained aerobic pressure and positional durability below threshold.'),
    objective('bike_vo2', '8x2', 'VO2 · 8 × 2', 'Use shorter high-aerobic repetitions to improve oxygen uptake and cadence quality.'),
    objective('bike_over_under', '4x10', 'Over / Under · 4 × 10', 'Practice changing pressure and settling quickly without accumulating race-specific fatigue too early.'),
  ];
  const build = [
    objective('bike_threshold', '4x10', 'Threshold · Cruise Control', 'Develop repeatable threshold power while keeping the final repetition controlled.'),
    objective('bike_vo2', '5x5', 'VO2 · 5 × 5', 'Maintain aerobic ceiling as total endurance load grows.'),
    objective('bike_threshold', '3x12', 'Threshold · Long Repeats', 'Extend time at controlled threshold to improve sustained power.'),
    objective('bike_over_under', '3x12', 'Over / Under · 3 × 12', 'Improve surge tolerance and the ability to return to sustainable pressure.'),
  ];
  const peak = [
    objective('bike_race_specific', '3x15', 'Race Pace · 3 × 15', 'Dial in sustainable 70.3 pressure, position, and fueling rhythm.'),
    objective('bike_vo2', '6x3', 'VO2 · 6 × 3', 'Keep high-aerobic sharpness without adding a large fatigue cost.'),
    objective('bike_threshold', '3x10', 'Threshold · 3 × 10', 'Maintain threshold strength with less total work than the build phase.'),
    objective('bike_race_specific', '4x10_surges', 'Race Pace + Surges · 4 × 10', 'Practice absorbing terrain or passing surges and settling immediately back to race pressure.'),
  ];
  const taper = [
    objective('bike_taper', 'openers', 'Race Feel · Short Openers', 'Preserve leg speed and race feel with a small dose of intensity.'),
  ];
  const library = phase === 'base' ? base : phase === 'build' ? build : phase === 'peak' ? peak : taper;
  return library[stage % library.length]!;
}

function bikeSupportFor(phase: TrainingPhase, stage: number): RaceHorizonWorkoutObjective {
  const base = [
    objective('bike_support', 'steady_economy', 'Aerobic · Steady Economy', 'Accumulate low-cost aerobic volume with stable cadence and posture.'),
    objective('bike_support', 'cadence_economy', 'Aerobic · Cadence Economy', 'Improve pedaling economy with controlled cadence changes while remaining aerobic.'),
    objective('bike_support', 'low_cadence_strength', 'Aerobic Strength · Low Cadence', 'Build muscular endurance at low intensity using controlled low-cadence pressure.'),
    objective('bike_support', 'progressive_aerobic', 'Aerobic · Progressive Build', 'Finish slightly stronger while keeping the entire ride below threshold.'),
  ];
  const build = [
    objective('bike_support', 'rolling_aerobic', 'Aerobic · Rolling Economy', 'Hold smooth aerobic output over changing terrain or resistance.'),
    objective('bike_support', 'low_cadence_strength', 'Aerobic Strength · Low Cadence', 'Build bike-specific muscular endurance without creating another hard day.'),
    objective('bike_support', 'tempo_inserts', 'Tempo Inserts · Controlled', 'Add small doses of tempo inside an otherwise aerobic ride.'),
    objective('bike_support', 'cadence_economy', 'Aerobic · Cadence Economy', 'Reinforce efficient cadence after a heavier build week.'),
  ];
  const peak = [
    objective('bike_support', 'race_position', 'Race Position · Smooth Aerobic', 'Accumulate comfortable time in race position at low metabolic cost.'),
    objective('bike_support', 'race_cadence', 'Race Cadence · Locked In', 'Practice the cadence and posture intended for race day.'),
    objective('bike_support', 'short_tempo', 'Tempo Inserts · Short + Smooth', 'Keep a little race-relevant pressure without adding another key workout.'),
    objective('bike_support', 'recovery_spin', 'Recovery Spin · Aerobic Reset', 'Use very easy movement to support recovery and distribute volume.'),
  ];
  const taper = [objective('bike_support', 'recovery_spin', 'Recovery Spin · Aerobic Reset', 'Keep the legs moving without carrying fatigue forward.')];
  const library = phase === 'base' ? base : phase === 'build' ? build : phase === 'peak' ? peak : taper;
  return library[stage % library.length]!;
}

function longRideFor(phase: TrainingPhase, stage: number): RaceHorizonWorkoutObjective {
  const base = [
    objective('bike_long', 'aerobic_durability', 'Long Ride · Aerobic Durability', 'Extend durable aerobic time while keeping the ride metabolically controlled.'),
    objective('bike_long', 'fueling_practice', 'Long Ride · Fueling Practice', 'Build endurance while rehearsing a consistent fueling and hydration schedule.'),
    objective('bike_long', 'rolling_durability', 'Long Ride · Hills + Rolling Terrain', 'Develop steady output over hills and rolling terrain without turning climbs into threshold work.'),
    objective('bike_long', 'progressive_finish', 'Long Ride · Progressive Finish', 'Keep most of the ride easy and finish the final segment at firm aerobic pressure.'),
  ];
  const build = [
    objective('bike_long', 'tempo_inserts', 'Long Ride · Tempo Inserts', 'Add controlled tempo blocks inside the long ride while preserving overall durability.'),
    objective('bike_long', 'fueling_rehearsal', 'Long Ride · Fueling Rehearsal', 'Rehearse race-like carbohydrate, fluid, and position habits across a long ride.'),
    objective('bike_long', 'rolling_durability', 'Long Ride · Hills + Rolling Terrain', 'Sustain aerobic pressure over hills and rolling terrain while protecting the run rebuild.'),
    objective('bike_long', 'strong_finish', 'Long Ride · Strong Finish', 'Finish with controlled race-adjacent pressure after accumulating aerobic fatigue.'),
  ];
  const peak = [
    objective('bike_long', 'race_pace_blocks', 'Long Ride · Race Pace Blocks', 'Practice sustained race pressure inside a long ride without making the full ride a race simulation.'),
    objective('bike_long', 'full_rehearsal', 'Long Ride · Full Rehearsal', 'Rehearse race position, fueling, hydration, and equipment execution.'),
    objective('bike_long', 'race_position_durability', 'Long Ride · Race Position Durability', 'Accumulate long periods in race position at sustainable pressure.'),
    objective('bike_long', 'reduced_specific', 'Long Ride · Reduced Specific', 'Keep a smaller race-specific dose while allowing fatigue to fall.'),
  ];
  const taper = [objective('bike_long', 'reduced_specific', 'Long Ride · Reduced Specific', 'Shorten durability work while retaining a small race-specific segment.')];
  const library = phase === 'base' ? base : phase === 'build' ? build : phase === 'peak' ? peak : taper;
  return library[stage % library.length]!;
}

function swimObjectiveFor(phase: TrainingPhase, loadIntent: RaceHorizonLoadIntent): string {
  if (loadIntent === 'recovery' || loadIntent === 'absorb') return 'Reduce swim stress, reinforce technique, and preserve water feel while the previous block is absorbed.';
  if (phase === 'race_week') return 'Keep water feel and confidence; avoid carrying swim fatigue into race day.';
  if (phase === 'taper') return 'Reduce volume while preserving technique and a few short pace changes.';
  if (phase === 'peak') return 'Hold technique under sustained aerobic work and rehearse race-relevant rhythm.';
  if (phase === 'build') return 'Progress aerobic endurance and threshold support without sacrificing stroke quality.';
  return 'Build repeatable technique, body position, and aerobic consistency.';
}

function runObjectiveFor(phase: TrainingPhase, runMode: RaceHorizonRunMode): string {
  if (runMode === 'return_to_run') {
    return 'Complete three separated, symptom-guided return-to-run exposures; progress duration before speed and let clinician/PT restrictions override the forecast.';
  }
  if (runMode === 'easy_rebuild') {
    return 'Re-establish consistent easy running frequency and durability before adding quality or a true long-run demand.';
  }
  if (phase === 'race_week') return 'Keep the legs familiar with running while arriving fresh for the race.';
  if (phase === 'taper') return 'Reduce run volume while preserving rhythm and short race-pace touches.';
  if (phase === 'peak') return 'Build race-specific durability and controlled long-run quality without excessive residual fatigue.';
  if (phase === 'build') return 'Extend easy volume and long-run durability before adding more race-specific work.';
  return 'Build easy running consistency, economy, and durable time on feet.';
}

function runSupportFor(
  phase: TrainingPhase,
  stage: number,
  runMode: RaceHorizonRunMode,
  loadIntent: RaceHorizonLoadIntent,
): RaceHorizonWorkoutObjective {
  if (runMode === 'return_to_run') {
    return objective('run_return_to_run', 'protocol', 'Easy return-to-run', 'Follow the current symptom-guided return-to-run step; duration progresses before speed.');
  }
  if (loadIntent === 'recovery' || loadIntent === 'absorb') {
    return objective('run_easy', 'recovery', 'Recovery Run · Easy', 'Reduce run stress and preserve relaxed frequency while the previous block is absorbed.');
  }
  const base = [
    objective('run_easy', 'easy_miles', 'Aerobic · Easy Miles', 'Build relaxed running frequency and economy.'),
    objective('run_easy', 'strides', 'Aerobic · Easy + Strides', 'Keep most running easy while adding short relaxed neuromuscular strides.'),
    objective('run_easy', 'negative_split', 'Aerobic · Gentle Negative Split', 'Finish a little quicker without turning an easy run into threshold work.'),
    objective('run_easy', 'rolling', 'Aerobic · Rolling Rhythm', 'Hold even effort over small terrain changes.'),
  ];
  const build = [
    objective('run_aerobic', 'steady', 'Aerobic · Steady Run', 'Extend durable aerobic running at controlled effort.'),
    objective('run_aerobic', 'strides', 'Aerobic · Easy + Strides', 'Maintain leg speed while overall run durability grows.'),
    objective('run_aerobic', 'progressive', 'Aerobic · Progressive Finish', 'Finish with controlled aerobic pressure, not a race effort.'),
    objective('run_aerobic', 'rolling', 'Aerobic · Rolling Rhythm', 'Build durability across terrain without adding a second hard run.'),
  ];
  const peak = [
    objective('run_race_support', 'race_rhythm', 'Race Rhythm · Controlled', 'Touch race rhythm briefly while preserving freshness.'),
    objective('run_easy', 'easy_strides', 'Aerobic · Easy + Strides', 'Keep mechanics sharp with very low residual fatigue.'),
    objective('run_race_support', 'steady', 'Aerobic · Steady Run', 'Maintain run durability without chasing fitness late in the cycle.'),
    objective('run_easy', 'recovery', 'Recovery Run · Easy', 'Absorb the peak block with very easy running.'),
  ];
  const taper = [objective('run_easy', 'recovery', 'Aerobic · Easy + Pickups', 'Reduce volume while preserving running rhythm.')];
  const library = phase === 'base' ? base : phase === 'build' ? build : phase === 'peak' ? peak : taper;
  return library[stage % library.length]!;
}

function longRunFor(
  phase: TrainingPhase,
  stage: number,
  runMode: RaceHorizonRunMode,
  loadIntent: RaceHorizonLoadIntent,
): RaceHorizonWorkoutObjective {
  if (runMode === 'return_to_run') {
    return objective('run_return_to_run', 'third_exposure', 'Easy return-to-run', 'The third weekly run remains an easy return-to-run exposure until durability is ready for a true long run.');
  }
  if (runMode === 'easy_rebuild') {
    return objective('run_long', 'easy_rebuild', 'Long Run · Easy Rebuild', 'Let the longest run grow gradually while keeping the effort easy.');
  }
  if (loadIntent === 'recovery' || loadIntent === 'absorb') {
    return objective('run_long', 'reduced', 'Long Run · Reduced', 'Shorten the longest run and keep it fully easy while the previous block is absorbed.');
  }
  const base = [
    objective('run_long', 'time_on_feet', 'Long Run · Time on Feet', 'Build durable easy running time without pace pressure.'),
    objective('run_long', 'rolling', 'Long Run · Rolling Aerobic', 'Maintain even effort over gentle terrain.'),
    objective('run_long', 'steady_finish', 'Long Run · Steady Finish', 'Finish with firm aerobic running after an otherwise easy long run.'),
    objective('run_long', 'time_on_feet', 'Long Run · Time on Feet', 'Consolidate durability before the next build.'),
  ];
  const build = [
    objective('run_long', 'aerobic_durability', 'Long Run · Aerobic Durability', 'Extend durable running while preserving bike quality and strength.'),
    objective('run_long', 'race_rhythm_blocks', 'Long Run · Race Rhythm Blocks', 'Introduce controlled 70.3 run rhythm inside a predominantly easy long run.'),
    objective('run_long', 'rolling', 'Long Run · Rolling Durability', 'Build strength and rhythm over terrain without forcing pace.'),
    objective('run_long', 'progressive_finish', 'Long Run · Progressive Finish', 'Finish at controlled race-adjacent effort after easy durability work.'),
  ];
  const peak = [
    objective('run_long', 'race_specific', 'Long Run · Race-Specific Blocks', 'Practice sustainable race rhythm under controlled fatigue.'),
    objective('run_long', 'steady', 'Long Run · Steady Durability', 'Maintain durability while the bike becomes more race-specific.'),
    objective('run_long', 'reduced_specific', 'Long Run · Reduced Specific', 'Keep a smaller race-specific dose while reducing residual fatigue.'),
    objective('run_long', 'easy', 'Long Run · Easy', 'Absorb peak work without adding another demanding run.'),
  ];
  const taper = [objective('run_long', 'reduced', 'Long Run · Reduced', 'Shorten the long run substantially while preserving rhythm.')];
  const library = phase === 'base' ? base : phase === 'build' ? build : phase === 'peak' ? peak : taper;
  return library[stage % library.length]!;
}

function strengthObjectiveFor(phase: TrainingPhase, loadIntent: RaceHorizonLoadIntent): string {
  if (loadIntent === 'recovery' || loadIntent === 'absorb') return 'Reduce strength volume and soreness while preserving movement quality and tissue capacity.';
  if (phase === 'race_week') return 'No meaningful strength fatigue; use only activation or mobility if appropriate.';
  if (phase === 'taper') return 'Reduce strength volume while preserving movement quality and neuromuscular familiarity.';
  if (phase === 'peak') return 'Maintain strength with low residual soreness and minimal interference with key endurance work.';
  if (phase === 'build') return 'Maintain force and tissue capacity while endurance specificity increases.';
  return 'Build or maintain general force, trunk control, and durable movement capacity.';
}

function objective(
  familyId: string,
  variantId: string,
  title: string,
  objectiveText: string,
): RaceHorizonWorkoutObjective {
  return { familyId, variantId, title, objective: objectiveText };
}

function weekStartsThroughRace(startDate: string, raceDate: string): string[] {
  const values: string[] = [];
  let cursor = startDate;
  const finalWeekStart = mondayOf(raceDate);
  while (cursor <= finalWeekStart) {
    values.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return values.length ? values : [startDate];
}

function mondayOf(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function normalizeDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`Invalid date: ${value}`);
  return parsed.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86_400_000);
}
