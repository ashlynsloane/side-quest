import type { AthleteLimiterProfile, UnifiedTrainingSession, WeeklyTrainingBudgetInput } from './unified-training';

export interface SyntheticAthleteFixture {
  id: string;
  label: string;
  input: WeeklyTrainingBudgetInput;
  limiterProfile: AthleteLimiterProfile;
  expected: string[];
  previousWeek?: UnifiedTrainingSession[];
}

export const SYNTHETIC_ATHLETE_FIXTURES: SyntheticAthleteFixture[] = [
  { id: 'beginner-tri-8h', label: 'Beginner triathlete, 8 hours', input: { availableMinutes: 480, phase: 'base', goalType: 'triathlon_olympic', recentBoneStress: false, returnToRun: false }, limiterProfile: { swim: 'technique', run: 'frequency_tolerance', strength: 'movement_skill' }, expected: ['frequent short swim skill exposures', 'strength development', 'no excessive hard-day density'] },
  { id: 'experienced-70-3-14h', label: 'Experienced 70.3 athlete, 14 hours', input: { availableMinutes: 840, phase: 'build', goalType: 'ironman_70_3', recentBoneStress: false, returnToRun: false }, limiterProfile: { swim: 'none', bike: 'muscular_endurance', run: 'durability', strength: 'max_strength' }, expected: ['race-specific bike progression', 'strength maintenance', 'protected key sessions'] },
  { id: 'strong-bike-weak-swim', label: 'Strong cyclist, developing swimmer', input: { availableMinutes: 720, phase: 'base', goalType: 'ironman_70_3', recentBoneStress: false, returnToRun: false }, limiterProfile: { swim: 'technique', bike: 'none', run: 'none' }, expected: ['swim frequency over one large swim', 'bike maintenance', 'strength remains required'] },
  { id: 'bone-stress-rtr', label: 'Return to run after bone stress injury', input: { availableMinutes: 600, phase: 'base', goalType: 'ironman_70_3', recentBoneStress: true, returnToRun: true }, limiterProfile: { run: 'impact_tolerance', strength: 'consistency' }, expected: ['run progression primary', 'strength volume stable', 'impact reduced'] },
  { id: 'marathon-strength', label: 'Marathoner adding strength', input: { availableMinutes: 600, phase: 'build', goalType: 'road_marathon', recentBoneStress: false, returnToRun: false }, limiterProfile: { run: 'durability', strength: 'movement_skill' }, expected: ['run-specific progression', 'minimum effective strength', 'long-run protection'] },
  { id: 'offseason-no-race', label: 'Offseason athlete without a race', input: { availableMinutes: 540, phase: 'offseason', goalType: 'general_offseason', recentBoneStress: false, returnToRun: false }, limiterProfile: { strength: 'max_strength' }, expected: ['strength priority', 'no race language', 'endurance maintenance'] },
  { id: 'fluctuating-schedule', label: 'Athlete with fluctuating work schedule', input: { availableMinutes: 420, phase: 'base', goalType: 'triathlon_sprint', recentBoneStress: false, returnToRun: false }, limiterProfile: { strength: 'consistency' }, expected: ['required/recommended/optional hierarchy', 'optional work dropped first', 'no make-up compression'] },
  { id: 'four-weeks-out', label: 'Athlete four weeks from race', input: { availableMinutes: 720, phase: 'peak', goalType: 'ironman_70_3', recentBoneStress: false, returnToRun: false }, limiterProfile: { bike: 'muscular_endurance', run: 'durability' }, expected: ['race specificity', 'strength maintenance', 'fatigue control'] },
  { id: 'postponed-race', label: 'Athlete postpones race by three months', input: { availableMinutes: 660, phase: 'base', goalType: 'ironman_70_3', recentBoneStress: false, returnToRun: true }, limiterProfile: { run: 'impact_tolerance', strength: 'max_strength' }, expected: ['phase recalculated', 'early strength emphasis restored', 'return-to-run remains conservative'] },
];
