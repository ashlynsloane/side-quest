import { describe, expect, it } from 'vitest';
import { appendTrainingEvent, completedActivities, evaluateTrainingAddition, hasRecordedTrainingLoadOnDate, reconcileDailyCeilingPlan } from '../src/daily-training-guardrails';

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
    const recovered = { ...baseline, recoveryObservedAt: { general: '2026-11-09T17:00:00Z' } };
    expect(evaluateTrainingAddition(recovered,
      { activity: 'strength', minutes: 20, regions: ['general'], scheduled: true }, history).decision).toBe('modify');
    expect(evaluateTrainingAddition(recovered,
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
    const recovered = { ...baseline, recoveryObservedAt: { general: '2026-11-09T17:00:00Z' } };
    expect(evaluateTrainingAddition(recovered,
      { activity: 'strength', minutes: 30, regions: ['general'], scheduled: true }, history).decision).toBe('modify');
  });

  it('does not use a pre-workout check-in as clearance after the workout', () => {
    const ceiling = { ...baseline, recoveryObservedAt: { general: '2026-11-09T14:00:00Z' } };
    const history = [{
      id: 'completed-1', kind: 'completed' as const, occurredAt: '2026-11-09T15:00:00Z',
      trainingDate: '2026-11-09',
      activity: { activity: 'strength', minutes: 10, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition(ceiling,
      { activity: 'strength', minutes: 15, regions: ['general'], scheduled: true }, history).decision).toBe('defer');
  });
  it('does not authorize repeating a partially completed planned session', () => {
    const ceiling = {
      ...baseline,
      planned: [{ activity: 'strength', sessionId: 'session-1', minutes: 35, regions: ['general' as const] }],
      recoveryObservedAt: { general: '2026-11-09T17:00:00Z' },
    };
    const history = [{
      id: 'completed-1', kind: 'completed' as const, occurredAt: '2026-11-09T15:00:00Z',
      trainingDate: '2026-11-09',
      activity: { activity: 'strength', sessionId: 'session-1', minutes: 10, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition(ceiling,
      { activity: 'strength', sessionId: 'session-1', minutes: 15, regions: ['general'], scheduled: true }, history).decision).toBe('defer');
  });
  it('can run a separate planned session after an explicit post-exposure check', () => {
    const ceiling = {
      ...baseline,
      planned: [
        { activity: 'strength', sessionId: 's1', minutes: 20, regions: ['general' as const] },
        { activity: 'strength', sessionId: 's2', minutes: 20, regions: ['general' as const] },
      ],
      recoveryObservedAt: { general: '2026-11-09T17:00:00Z' },
    };
    const history = [{
      id: 'completed-1', kind: 'completed' as const, occurredAt: '2026-11-09T15:00:00Z',
      trainingDate: '2026-11-09',
      activity: { activity: 'strength', sessionId: 's1', minutes: 20, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition(ceiling,
      { activity: 'strength', sessionId: 's2', minutes: 20, regions: ['general'], scheduled: true }, history).decision).toBe('allow');
  });

  it('never increases approved minutes after a plan revision', () => {
    const original = { ...baseline, planned: [
      { activity: 'strength', sessionId: 'A', minutes: 35, regions: ['general' as const] },
    ] };
    const result = reconcileDailyCeilingPlan(original, [
      { activity: 'strength', sessionId: 'A', minutes: 60, regions: ['general', 'achilles'] },
    ]);
    expect(result.planned).toEqual([
      { activity: 'strength', sessionId: 'A', minutes: 35, regions: ['general', 'achilles'] },
    ]);
  });
  it('tightens limits after calendar reductions and rejects moved sessions', () => {
    const original = { ...baseline, planned: [
      { activity: 'strength', sessionId: 'A', minutes: 35, regions: ['general' as const] },
      { activity: 'strength', sessionId: 'B', minutes: 20, regions: ['general' as const] },
    ] };
    const result = reconcileDailyCeilingPlan(original, [
      { activity: 'strength', sessionId: 'A', minutes: 25, regions: ['general'] },
    ]);
    expect(result.planned).toHaveLength(1);
    expect(result.planned[0]?.minutes).toBe(25);
  });
  it('does not silently authorize newly added sessions halfway through a day', () => {
    const original = { ...baseline, planned: [
      { activity: 'strength', sessionId: 'A', minutes: 30, regions: ['general' as const] },
    ] };
    const result = reconcileDailyCeilingPlan(original, [
      { activity: 'strength', sessionId: 'A', minutes: 30, regions: ['general'] },
      { activity: 'strength', sessionId: 'B', minutes: 30, regions: ['general'] },
    ]);
    expect(result.planned.map((item) => item.sessionId)).toEqual(['A']);
  });

  it('fails closed on corrupted recovery states and malformed plan doses', () => {
    const invalidRecovery = { ...baseline, recovery: { general: 'cleared' as 'stable' } };
    expect(evaluateTrainingAddition(invalidRecovery,
      { activity: 'strength', minutes: 20, regions: ['general'], scheduled: true }).decision).toBe('stop');
    const invalidPlan = { ...baseline, planned: [
      { activity: 'strength', minutes: Number.NaN, regions: ['general' as const] },
    ] };
    expect(evaluateTrainingAddition(invalidPlan,
      { activity: 'strength', minutes: 20, regions: ['general'], scheduled: true }).decision).toBe('stop');
  });
  it('does not let negative recorded work expand the daily budget', () => {
    const history = [{
      id: 'bad', occurredAt: '2026-11-09T15:00:00Z',
      trainingDate: '2026-11-09', kind: 'completed' as const,
      activity: { activity: 'strength', minutes: -10, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition(baseline,
      { activity: 'strength', minutes: 20, regions: ['general'], scheduled: true }, history).decision).toBe('stop');
  });
  it('accepts a zero-minute historical entry without granting extra workout time', () => {
    const history = [{
      id: 'not-done', occurredAt: '2026-11-09T15:00:00Z',
      trainingDate: '2026-11-09', kind: 'completed' as const,
      activity: { activity: 'strength', minutes: 0, regions: ['general' as const] },
    }];
    expect(evaluateTrainingAddition({
      ...baseline, recoveryObservedAt: { general: '2026-11-09T17:00:00Z' },
    }, { activity: 'strength', minutes: 35, regions: ['general'], scheduled: true }, history).decision).toBe('allow');
  });

  it('requires fresh recovery rather than permitting a text-only override', () => {
    const unknown = { ...baseline, recovery: { general: 'uncertain' as const } };
    const result = evaluateTrainingAddition(unknown,
      { activity: 'strength', minutes: 20, regions: ['general'], scheduled: true });
    expect(result.decision).toBe('defer');
    expect(result.overrideAllowed).toBe(false);
  });
  it('does not override a prescribed ceiling by entering explanatory text', () => {
    const result = evaluateTrainingAddition(baseline,
      { activity: 'strength', minutes: 80, regions: ['general'], scheduled: true });
    expect(result.decision).toBe('modify');
    expect(result.overrideAllowed).toBe(false);
  });
  it('retains a documented discretionary path for truly unplanned activity', () => {
    const result = evaluateTrainingAddition(baseline,
      { activity: 'cycling', minutes: 12, regions: ['general'], scheduled: false });
    expect(result.decision).toBe('defer');
    expect(result.overrideAllowed).not.toBe(false);
  });

  it('requires a new prescription before bonus activity after work has already been completed', () => {
    const history = [{
      id: 'morning-session', occurredAt: '2026-11-09T15:00:00Z',
      trainingDate: '2026-11-09', kind: 'completed' as const,
      activity: { activity: 'strength', minutes: 30, regions: ['general' as const] },
    }];
    const afterRecovery = { ...baseline, recoveryObservedAt: { general: '2026-11-09T18:00:00Z' } };
    const extra = evaluateTrainingAddition(afterRecovery,
      { activity: 'cycling', minutes: 15, regions: ['general'], scheduled: false }, history);
    expect(extra.decision).toBe('defer');
    expect(extra.overrideAllowed).toBe(false);
  });
  it('allows documentation-based discretion on a genuinely unplanned first session', () => {
    const first = evaluateTrainingAddition(baseline,
      { activity: 'strength', minutes: 20, regions: ['general'], scheduled: false });
    expect(first.decision).toBe('defer');
    expect(first.overrideAllowed).toBe(true);
  });

  it('finds actual load without a prescription and ignores explicit retractions', () => {
    const events = [{
      id: 'workout-1', kind: 'completed' as const, occurredAt: '2026-11-09T15:00:00Z',
      trainingDate: '2026-11-09',
      activity: { activity: 'strength', minutes: 20, regions: ['general' as const] },
    }];
    expect(hasRecordedTrainingLoadOnDate(events, '2026-11-09')).toBe(true);
    expect(hasRecordedTrainingLoadOnDate(events, '2026-11-10')).toBe(false);
    const retraction = {
      id: 'retracted:workout-1', kind: 'retracted' as const, retractsEventId: 'workout-1',
      occurredAt: '2026-11-09T18:00:00Z', trainingDate: '2026-11-09',
    };
    expect(hasRecordedTrainingLoadOnDate([...events, retraction], '2026-11-09')).toBe(false);
  });

});
