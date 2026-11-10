import { describe, expect, it } from 'vitest';
import { appendTrainingEvent, completedActivities, evaluateTrainingAddition } from '../src/daily-training-guardrails';

const baseline = {
  date: '2026-11-09',
  planned: [{ activity: 'strength', minutes: 35, regions: ['general' as const] }],
  recovery: { general: 'stable' as const, achilles: 'stable' as const, upper_back: 'uncertain' as const },
  restrictUnplanned: true,
};

describe('daily training ceiling', () => {
  it('permits scheduled activity within ceiling', () => {
    expect(evaluateTrainingAddition(baseline, { activity: 'strength', minutes: 35, regions: ['general'], scheduled: true }).decision).toBe('allow');
  });
  it('defers spontaneous calf raises even if Achilles feels good', () => {
    expect(evaluateTrainingAddition(baseline, { activity: 'calf raises', sets: 3, regions: ['achilles'], scheduled: false }).decision).toBe('defer');
  });
  it('defers spontaneous cycling', () => {
    expect(evaluateTrainingAddition(baseline, { activity: 'cycling', minutes: 20, regions: ['achilles', 'upper_back'], scheduled: false }).decision).toBe('defer');
  });
  it('does not treat unknown back recovery as clearance', () => {
    expect(evaluateTrainingAddition(baseline, { activity: 'cycling', minutes: 10, regions: ['upper_back'], scheduled: true }).requiresReassessment).toBe(true);
  });
  it('modifies attempts to exceed a scheduled dose', () => {
    expect(evaluateTrainingAddition(baseline, { activity: 'strength', minutes: 50, regions: ['general'], scheduled: true }).decision).toBe('modify');
  });
  it('stops on red flags even for scheduled activity', () => {
    expect(evaluateTrainingAddition({ ...baseline, recovery: { ...baseline.recovery, achilles: 'red_flag' } }, { activity: 'calf raises', regions: ['achilles'], scheduled: true }).decision).toBe('stop');
  });
  it('does not confuse prescriptions with completed training', () => {
    const prescribed = { id: 'a', occurredAt: '2026-11-09', kind: 'prescribed' as const, activity: baseline.planned[0] };
    const history = appendTrainingEvent([], prescribed);
    expect(completedActivities(history)).toEqual([]);
    expect(completedActivities(appendTrainingEvent(history, { ...prescribed, id: 'b', kind: 'completed' }))).toHaveLength(1);
    expect(() => appendTrainingEvent(history, prescribed)).toThrow();
  });
  it('rejects negative and non-finite doses', () => {
    for (const minutes of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(evaluateTrainingAddition(baseline, { activity: 'strength', minutes, regions: ['general'], scheduled: true }).decision).toBe('stop');
    }
  });
  it('does not allow an unprescribed dose dimension', () => {
    expect(evaluateTrainingAddition(baseline, { activity: 'strength', sets: 4, regions: ['general'], scheduled: true }).decision).toBe('modify');
  });
  it('rejects affected regions omitted from the matching prescription', () => {
    expect(evaluateTrainingAddition({ ...baseline, recovery: { general: 'stable', achilles: 'stable' } },
      { activity: 'strength', minutes: 35, regions: ['general', 'achilles'], scheduled: true }).decision).toBe('defer');
  });

});
