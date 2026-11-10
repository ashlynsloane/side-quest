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

  it('subtracts already completed strength from the day budget', () => {
    const history = [{
      id: 'completed-1', kind: 'completed' as const, occurredAt: '2026-11-09T15:00:00Z',
      trainingDate: '2026-11-09',
      activity: { activity: 'strength', minutes: 20, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition(baseline,
      { activity: 'strength', minutes: 20, regions: ['general'], scheduled: true }, history).decision).toBe('modify');
    expect(evaluateTrainingAddition(baseline,
      { activity: 'strength', minutes: 15, regions: ['general'], scheduled: true }, history).decision).toBe('allow');
  });
  it('does not count prescription or assessment entries as completed load', () => {
    const history = [{
      id: 'planned-1', kind: 'prescribed' as const, occurredAt: '2026-11-09T15:00:00Z',
      trainingDate: '2026-11-09',
      activity: { activity: 'strength', minutes: 35, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition(baseline,
      { activity: 'strength', minutes: 35, regions: ['general'], scheduled: true }, history).decision).toBe('allow');
  });
  it('does not carry yesterday’s completed load into today', () => {
    const history = [{
      id: 'yesterday', kind: 'completed' as const, occurredAt: '2026-11-08T21:00:00Z',
      trainingDate: '2026-11-08',
      activity: { activity: 'strength', minutes: 35, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition(baseline,
      { activity: 'strength', minutes: 35, regions: ['general'], scheduled: true }, history).decision).toBe('allow');
  });
  it('rejects replaying an already exhausted prescription', () => {
    const history = [{
      id: 'completed-1', kind: 'completed' as const, occurredAt: '2026-11-09T16:00:00Z',
      trainingDate: '2026-11-09',
      activity: { activity: 'strength', minutes: 35, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition(baseline,
      { activity: 'strength', minutes: 1, regions: ['general'], scheduled: true }, history).decision).toBe('defer');
  });
  it('requires the exact planned session identity when present', () => {
    const identified = { ...baseline, planned: [
      { activity: 'strength', sessionId: 'session-a', minutes: 35, regions: ['general' as const] },
    ] };
    expect(evaluateTrainingAddition(identified,
      { activity: 'strength', sessionId: 'session-b', minutes: 20, regions: ['general'], scheduled: true }).decision).toBe('defer');
    expect(evaluateTrainingAddition(identified,
      { activity: 'strength', sessionId: 'session-a', minutes: 20, regions: ['general'], scheduled: true }).decision).toBe('allow');
  });

  it('stops when a no-training check-in is active', () => {
    expect(evaluateTrainingAddition({ ...baseline, pauseTraining: true },
      { activity: 'strength', minutes: 10, regions: ['general'], scheduled: true }).decision).toBe('stop');
  });
  it('keeps original tissue restrictions after workout-region edits', () => {
    const constrained = {
      ...baseline,
      planned: [{ activity: 'strength', minutes: 35, regions: ['general' as const, 'achilles' as const] }],
      recovery: { general: 'stable' as const, achilles: 'uncertain' as const },
    };
    expect(evaluateTrainingAddition(constrained,
      { activity: 'strength', minutes: 30, regions: ['general'], scheduled: true }).decision).toBe('defer');
  });
  it('counts unplanned performed training against a matching ceiling', () => {
    const history = [{
      id: 'extra', kind: 'unplanned' as const, occurredAt: '2026-11-09T12:00:00Z',
      trainingDate: '2026-11-09',
      activity: { activity: 'strength', minutes: 12, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition(baseline,
      { activity: 'strength', minutes: 30, regions: ['general'], scheduled: true }, history).decision).toBe('modify');
  });

});
