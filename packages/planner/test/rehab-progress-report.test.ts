import { describe, expect, it } from 'vitest';
import {
  buildRehabReportData,
  type RehabMetricObservation,
  type RehabReportInput,
} from '../src/rehab-progress-report';

const observation = (
  id: string, caseId: string, observedAt: string, metricKey: string,
  value: number, extra: Partial<RehabMetricObservation> = {},
): RehabMetricObservation => ({
  id, caseId, observedAt, metricKey, value,
  unit: '0-10', source: 'athlete', ...extra,
});

const input = (): RehabReportInput => ({
  caseId: 'ankle',
  range: {startAt: '2026-10-01T00:00:00Z', endAt: '2026-10-31T23:59:59Z'},
  observations: [
    observation('a3', 'ankle', '2026-10-04T08:00:00Z', 'walking_pain', 2),
    observation('a1', 'ankle', '2026-10-01T08:00:00Z', 'walking_pain', 5),
    observation('a2', 'ankle', '2026-10-03T08:00:00Z', 'walking_pain', 4),
    observation('b1', 'back', '2026-10-02T08:00:00Z', 'movement_pain', 7),
    observation('a0', 'ankle', '2026-09-30T08:00:00Z', 'walking_pain', 9),
  ],
  events: [
    {id:'flare',caseIds:['ankle'],occurredAt:'2026-10-02T18:00:00Z',
      kind:'flare',description:'Pain increased',source:'athlete'},
    {id:'unrelated',caseIds:['back'],occurredAt:'2026-10-02T18:00:00Z',
      kind:'flare',description:'Back flare',source:'athlete'},
  ],
  training: [
    {id:'rehab',occurredAt:'2026-10-02T16:00:00Z',sourceRecordId:'ledger:42',
      kind:'rehab',relatedCaseIds:['ankle'],source:'athlete'},
    {id:'swim',occurredAt:'2026-10-03T16:00:00Z',sourceRecordId:'ledger:43',
      kind:'endurance',relatedCaseIds:[],source:'device'},
  ],
});

describe('rehab longitudinal report data', () => {
  it('isolates the selected injury and requested window', () => {
    const r = buildRehabReportData(input());
    expect(r.observationCount).toBe(3);
    expect(r.eventCount).toBe(1);
    expect(r.trainingRecordCount).toBe(1);
    expect(r.series[0]!.points.map(p => p.id)).toEqual(['a1','a2','a3']);
  });
  it('computes observed difference without inferring improvement', () => {
    const s = buildRehabReportData(input()).series[0]!;
    expect(s.firstValue).toBe(5);
    expect(s.lastValue).toBe(2);
    expect(s.observedDelta).toBe(-3);
  });
  it('does not impute missing days', () => {
    const r = buildRehabReportData(input());
    expect(r.series[0]!.pointCount).toBe(3);
  });
  it('separates measurements with different contexts and units', () => {
    const x = input();
    x.observations.push(observation('walk-context','ankle','2026-10-05T08:00:00Z',
      'walking_pain',1,{contextKey:'stairs'}));
    x.observations.push(observation('stiffness','ankle','2026-10-05T08:00:00Z',
      'morning_stiffness',20,{unit:'minutes'}));
    const r = buildRehabReportData(x);
    expect(r.series).toHaveLength(3);
  });
  it('includes unrelated activity only by explicit opt-in', () => {
    const x = input();
    expect(buildRehabReportData(x).trainingRecordCount).toBe(1);
    x.includeUnlinkedTraining = true;
    expect(buildRehabReportData(x).trainingRecordCount).toBe(2);
  });
  it('rejects invalid pain scales and nonfinite readings', () => {
    const x = input();
    x.observations[0]!.value=11;
    expect(() => buildRehabReportData(x)).toThrow();
    x.observations[0]!.value=Number.NaN;
    expect(() => buildRehabReportData(x)).toThrow();
  });
  it('requires unique stable event IDs', () => {
    const x = input();
    x.events.push({...x.events[0]!});
    expect(() => buildRehabReportData(x)).toThrow(/duplicate ID/);
  });
  it('does not show a trend when only one observation exists', () => {
    const x = input();
    x.observations=[x.observations[0]!];
    expect(buildRehabReportData(x).series[0]!.observedDelta).toBeNull();
  });
  it('reports empty coverage instead of inventing conclusions', () => {
    const x = input();x.caseId='unknown';
    const r = buildRehabReportData(x);
    expect(r.series).toHaveLength(0);
    expect(r.warnings.some(w => w.includes('No observations'))).toBe(true);
  });
  it('rejects reversed or malformed report windows', () => {
    const x = input();x.range.startAt='wrong';
    expect(() => buildRehabReportData(x)).toThrow();
    x.range.startAt='2026-12-01T00:00:00Z';
    expect(() => buildRehabReportData(x)).toThrow();
  });
});
