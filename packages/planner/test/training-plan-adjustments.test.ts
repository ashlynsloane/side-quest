import { describe, expect, it } from 'vitest';
import {
  applyAcceptedPlanAdjustments, buildPlanAdjustmentPreview,
  rawGeneratedEventSignature, planExposureSignature,
  type PlanAdjustmentEvent,
} from '../src/training-plan-adjustments';
import type {
  FrozenTrainingAllowance, TrainingExposureRecord,
} from '../src/experimental-training-guardrails';
import type { TrainingCalendarEvent } from '@circuit/domain';

const allowance: FrozenTrainingAllowance = {
  planningWeekStart: '2026-11-02', baselineId: 'reviewed-1',
  baselineStartDate: '2026-10-26', baselineEndDate: '2026-11-01',
  timezone: 'America/Denver', policyVersion: 'athlete-experimental-ramp-v1',
  runDistanceCapKm: 16, cyclingMinutesCap: 200, combinedMinutesCap: 300,
  frozenAt: '2026-11-02T13:00:00Z',
};
const row = (recordId: string, sport: TrainingExposureRecord['sport'],
  duration: number, extra: Partial<TrainingExposureRecord> = {}): TrainingExposureRecord => ({
  recordId: 'calendar:' + recordId, canonicalActivityId: 'calendar:' + recordId,
  localDate: '2026-11-04', sport, status: 'planned',
  durationMinutes: duration, source: 'Calendar: side_quest_generated_plan',
  ...(sport === 'run' ? { runDistanceKm: null } : {}), ...extra,
});
const preview = (records: TrainingExposureRecord[], eligible = true) =>
  buildPlanAdjustmentPreview({
    records, eligible, weekStartDate: '2026-11-02',
    timezone: 'America/Denver', allowance, todayLocalDate: '2026-11-02',
  });
const event: TrainingCalendarEvent = {
  id: 'bike-1', sourceId: 'side_quest_generated_plan', title: 'Easy ride',
  startAt: '2026-11-04T12:00:00.000Z', endAt: '2026-11-04T15:00:00.000Z',
  allDay: true, discipline: 'bike',
  description: 'Side Quest generated · 180 min · easy',
};
function decision(overrides: Partial<PlanAdjustmentEvent> = {}): PlanAdjustmentEvent {
  return {
    id: 'accept-1', sourceEventId: 'bike-1',
    sourceSignature: rawGeneratedEventSignature(event),
    action: 'shorten_20_percent', decision: 'accepted',
    proposedMinutes: 144, createdAt: '2026-11-02T14:00:00Z',
    ...overrides,
  };
}
describe('explicit athlete-reviewed plan changes', () => {
  it('builds deterministic shorten/defer previews for generated bike when combined cap binds', () => {
    const p = preview([row('bike-1', 'bike', 180), row('run-1', 'run', 160)]);
    expect(p.current.anyOverage).toBe(true);
    expect(p.candidates.some(c => c.eventId === 'bike-1'
      && c.action === 'shorten_20_percent' && c.proposedMinutes === 144)).toBe(true);
    expect(p.candidates.some(c => c.eventId === 'bike-1' && c.action === 'defer')).toBe(true);
    const shorter = p.candidates.find(c => c.eventId === 'bike-1'
      && c.action === 'shorten_20_percent')!;
    expect(shorter.preview.comparisons[2]!.proposedKnownSubtotal).toBe(304);
    expect(shorter.preview.anyOverage).toBe(true);
    expect(shorter.summary).toContain('not clinical permission');
  });
  it('does not propose a change for completed workouts or externally scheduled commitments', () => {
    const p = preview([
      row('actual', 'bike', 180, { status: 'completed' }),
      row('external', 'bike', 170, { source: 'Calendar: trainingpeaks_ics' }),
    ]);
    expect(p.candidates).toEqual([]);
  });
  it('blocks proposals when source overlap is unresolved', () => {
    const p = preview([
      row('bike-1', 'bike', 300),
      row('actual', 'bike', 150, { status: 'completed',
        source: 'Completed activity: manual' }),
    ]);
    expect(p.eligibleForProposal).toBe(false);
    expect(p.explanations.join(' ')).toContain('duplicate or unlinked');
  });
  it('does not offer to modify a planned session already superseded by completed training', () => {
    const plan = row('bike-1', 'bike', 250);
    const actual: TrainingExposureRecord = {
      ...row('actual-bike', 'bike', 400), status: 'completed',
      source: 'Completed activity: strava',
      linkedPlanRecordId: plan.recordId,
    };
    const p = preview([plan, actual]);
    expect(p.candidates.some(c => c.eventId === 'bike-1')).toBe(false);
  });
  it('blocks previews without approved policy eligibility', () => {
    const p = preview([row('bike-1', 'bike', 240)], false);
    expect(p.candidates).toEqual([]);
  });
  it('does not suggest starting a session in the past', () => {
    const p = buildPlanAdjustmentPreview({
      weekStartDate: '2026-11-02', timezone: 'America/Denver', allowance,
      records: [row('bike-1', 'bike', 240)],
      todayLocalDate: '2026-11-05', eligible: true,
    });
    expect(p.candidates).toEqual([]);
  });
  it('does not misrepresent a shortened run as reducing its unmeasured distance', () => {
    const p = preview([row('run-1', 'run', 330)]);
    const shorter = p.candidates.find(c => c.action === 'shorten_20_percent');
    expect(shorter?.preview.comparisons[0]?.status).toBe('uncertain');
  });
  it('overlays accepted shortening without changing the raw generated event', () => {
    const original = JSON.stringify(event);
    const resolved = applyAcceptedPlanAdjustments([event], [decision()]);
    expect(resolved.staleEventIds).toEqual([]);
    expect(resolved.events).toHaveLength(1);
    expect(resolved.events[0]?.description).toContain('144 min');
    expect(resolved.events[0]?.endAt).toBe('2026-11-04T14:24:00.000Z');
    expect(JSON.stringify(event)).toBe(original);
  });
  it('defer hides only the accepted generated event', () => {
    const deferred = decision({ action: 'defer', proposedMinutes: null });
    const another = { ...event, id: 'bike-2' };
    expect(applyAcceptedPlanAdjustments([event, another], [deferred]).events)
      .toEqual([another]);
  });
  it('decline and restore leave the raw event unchanged', () => {
    for (const choice of ['declined', 'restored'] as const) {
      expect(applyAcceptedPlanAdjustments([event], [decision({ decision: choice })]).events)
        .toEqual([event]);
    }
  });
  it('refuses to apply an outdated overlay after regeneration changes the original workout', () => {
    const changed = { ...event, title: 'Long ride' };
    const resolved = applyAcceptedPlanAdjustments([changed], [decision()]);
    expect(resolved.events).toEqual([changed]);
    expect(resolved.staleEventIds).toEqual(['bike-1']);
  });
  it('treats evidence signatures as order-independent for identical activity records', () => {
    const a = row('bike-1', 'bike', 90);
    const b = row('run-1', 'run', 25);
    expect(planExposureSignature([a, b])).toBe(planExposureSignature([b, a]));
    expect(planExposureSignature([a, b])).not.toBe(planExposureSignature([a, {
      ...b, durationMinutes: 26,
    }]));
  });
});
