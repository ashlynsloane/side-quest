import { describe, expect, it } from 'vitest';
import type { GeneratedWorkout, TrainingCheckIn } from '@circuit/domain';
import type { DailyTrainingCeiling } from '../src/daily-training-guardrails';
import { evaluateActiveSessionRecovery } from '../src/active-session-recovery';

const start = '2026-11-10T16:00:00Z';
const workout = (region: string): GeneratedWorkout => ({
  id: 'w', stations: [{ id: 's', durationSeconds: 1200, exercises: [{
    exerciseSnapshot: { bodyRegions: [{ region, load: 1 }],
      jointLoads: [], movementPatterns: [], impactLevel: 0,
      balanceDemand: 0, cardiovascularDemand: 0 },
  }] }], targetRegions: [region],
}) as unknown as GeneratedWorkout;
const ceiling = (): DailyTrainingCeiling => ({
  date: '2026-11-10', planned: [],
  recovery: { general: 'stable', achilles: 'stable', upper_back: 'stable' },
  restrictUnplanned: true,
  recoveryObservedAt: { general: '2026-11-10T15:00:00Z',
    achilles: '2026-11-10T15:00:00Z', upper_back: '2026-11-10T15:00:00Z' },
});
describe('mid-workout regional recovery reassessment', () => {
  it('pauses Achilles-loading exercise after Achilles symptoms worsen', () => {
    const next = ceiling();
    next.recovery.achilles = 'worse';
    expect(evaluateActiveSessionRecovery(workout('gastrocnemius'), start, null, next).pause).toBe(true);
  });
  it('pauses upper-back loading after a back red flag', () => {
    const next = ceiling();
    next.recovery.upper_back = 'red_flag';
    expect(evaluateActiveSessionRecovery(workout('upper_back'), start, null, next).pause).toBe(true);
  });
  it('does not fabricate an Achilles restriction for unrelated upper-body work', () => {
    const next = ceiling();
    next.recovery.achilles = 'worse';
    expect(evaluateActiveSessionRecovery(workout('chest'), start, null, next).pause).toBe(false);
  });
  it('pauses if a new check-in became uncertain after the session began', () => {
    const next = ceiling();
    next.recovery.achilles = 'uncertain';
    next.recoveryObservedAt!.achilles = '2026-11-10T16:15:00Z';
    expect(evaluateActiveSessionRecovery(workout('gastrocnemius'), start, null, next).pause).toBe(true);
  });
  it('does not interpret a pre-start uncertain observation as an interruption by itself', () => {
    const next = ceiling();
    next.recovery.achilles = 'uncertain';
    expect(evaluateActiveSessionRecovery(workout('gastrocnemius'), start, null, next).pause).toBe(false);
  });
  it('pauses on a newly explicit no-training check-in even without a ceiling', () => {
    const current = {
      active: true, status: 'unable_to_train', severity: 3,
    } as TrainingCheckIn;
    expect(evaluateActiveSessionRecovery(workout('core_anterior'), start, current, null).pause).toBe(true);
  });
  it('fails conservatively on a corrupted authorization timestamp', () => {
    expect(evaluateActiveSessionRecovery(workout('core_anterior'), 'garbled', null, ceiling()).pause).toBe(true);
  });
});
