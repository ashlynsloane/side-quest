import type { TrainingPhase } from '@circuit/domain';

export type RaceHorizonLoadIntent = 'build' | 'absorb' | 'recovery' | 'taper' | 'race';
export type RaceHorizonRunMode = 'return_to_run' | 'easy_rebuild' | 'normal';

export interface RaceHorizonWorkoutObjective {
  familyId: string;
  variantId: string;
  title: string;
  objective: string;
}

export interface RaceHorizonDevelopmentWeek {
  weekStartDate: string;
  weekNumber: number;
  totalWeeks: number;
  raceDate: string;
  daysToRace: number;
  phase: TrainingPhase;
  phaseWeekNumber: number;
  loadIntent: RaceHorizonLoadIntent;
  targetLoadFactor: number;
  weekPurpose: string;
  bikeQuality: RaceHorizonWorkoutObjective;
  bikeSupport: RaceHorizonWorkoutObjective;
  longRide: RaceHorizonWorkoutObjective;
  swimObjective: string;
  runMode: RaceHorizonRunMode;
  runObjective: string;
  runSupport: RaceHorizonWorkoutObjective;
  longRun: RaceHorizonWorkoutObjective;
  strengthObjective: string;
}

export interface RaceHorizonDevelopmentPlan {
  goalType: string;
  startDate: string;
  raceDate: string;
  totalWeeks: number;
  weeks: RaceHorizonDevelopmentWeek[];
  summary: string;
}
