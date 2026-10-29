import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  createInjuryMemoryStore,
  type InjurySqlite,
} from '../src/injury-memory-sql';
import type {
  InjuryCase, InjuryEvent, ClinicalConstraint,
} from '../src/injury-management';
import type {
  RehabMetricObservation, RehabTrainingReference,
} from '../src/rehab-progress-report';

const caseRecord = (id: string): InjuryCase => ({
  id, label: id, course: 'acute', diagnosisState: 'unknown',
  status: 'under_assessment', affectedRegions: ['ankle'],
});
const eventRecord = (id:string, caseId:string): InjuryEvent => ({
  id,caseId,occurredAt:'2026-10-12T12:00:00Z',kind:'flare',
  mechanism:'uncertain',dangerSigns:[],functionLoss:'mild',
  initialSafetyScreenComplete:true,
});
const measure=(id:string,caseId:string,time:string,value:number):RehabMetricObservation=>({
  id,caseId,observedAt:time,metricKey:'walking_pain',value,
  unit:'0-10',source:'athlete',sourceRecordId:'check-in:'+id,
});
const training=(id:string,cases:string[]):RehabTrainingReference=>({
  id,occurredAt:'2026-10-13T12:00:00Z',kind:'strength',
  sourceRecordId:'workout:'+id,source:'athlete',relatedCaseIds:cases,
});
const constraint = (id:string):ClinicalConstraint=>({
  id,caseId:'ankle',status:'active',source:'clinician',effect:'prohibit',
  scope:{kind:'stress_tag',value:'impact'},issuedAt:'2026-10-10T00:00:00Z',
  expiresAt:'2026-10-11T00:00:00Z',
});
function createTestStore() {
  const native=new DatabaseSync(':memory:');
  const db: InjurySqlite={
    execAsync:async sql=>{native.exec(sql);},
    runAsync:async (sql,...params)=>native.prepare(sql).run(...params),
    getAllAsync:async <T>(sql:string,...params:(string|number|null)[]) =>
      native.prepare(sql).all(...params) as T[],
  };
  return {native,store:createInjuryMemoryStore(db)};
}
const range={startAt:'2026-10-01T00:00:00Z',endAt:'2026-10-31T23:59:59Z'};
describe('SQLite injury-memory integration',()=>{
  it('creates additive tables without touching legacy data',async()=>{
    const {native,store}=createTestStore();
    native.exec("CREATE TABLE legacy(x TEXT); INSERT INTO legacy VALUES ('keep');");
    await store.ensureSchema();
    expect(native.prepare('SELECT x FROM legacy').get()).toEqual({x:'keep'});
    const tables=native.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .map(row=>String(row.name));
    expect(tables).toContain('injury_metrics');
    expect(tables).toContain('injury_training_links');
    native.close();
  });
  it('is safe to initialize repeatedly',async()=>{
    const {native,store}=createTestStore();
    await store.ensureSchema();await store.ensureSchema();
    const version=native.prepare("SELECT value FROM injury_schema_metadata WHERE key='version'").get();
    expect(version).toEqual({value:'1'});native.close();
  });
  it('stores distinct injuries without mixing observations',async()=>{
    const {native,store}=createTestStore();
    await store.upsertCase(caseRecord('ankle'));
    await store.upsertCase(caseRecord('back'));
    await store.appendMetric(measure('a','ankle','2026-10-10T00:00:00Z',5));
    await store.appendMetric(measure('b','back','2026-10-11T00:00:00Z',8));
    expect((await store.getHistory('ankle')).metrics).toHaveLength(1);
    expect((await store.getHistory('back')).metrics[0]!.value).toBe(8);
    native.close();
  });
  it('preserves an original observation and rejects duplicate IDs',async()=>{
    const {native,store}=createTestStore();
    await store.appendMetric(measure('a','ankle','2026-10-10T00:00:00Z',4));
    await expect(store.appendMetric(measure('a','ankle','2026-10-10T00:00:00Z',1)))
      .rejects.toThrow();
    expect((await store.getHistory('ankle')).metrics[0]!.value).toBe(4);
    native.close();
  });
  it('rejects missing and out-of-range measurements',async()=>{
    const {native,store}=createTestStore();
    await expect(store.appendMetric(measure('bad','ankle','2026-10-10T00:00:00Z',11)))
      .rejects.toThrow();
    await expect(store.appendMetric(measure('bad','ankle','not a date',2)))
      .rejects.toThrow();
    native.close();
  });
  it('records events with attribution in PT timelines',async()=>{
    const {native,store}=createTestStore();
    await store.upsertCase(caseRecord('ankle'));
    await store.appendEvent({event:eventRecord('flare','ankle'),description:'Pain recurred',
      source:'athlete'});
    const r=await store.buildReport('ankle',range);
    expect(r.eventCount).toBe(1);
    expect(r.events[0]!.kind).toBe('flare');
    expect(r.events[0]!.source).toBe('athlete');
    native.close();
  });
  it('produces chronological, nonimputed symptom plots',async()=>{
    const {native,store}=createTestStore();
    await store.appendMetric(measure('late','ankle','2026-10-16T00:00:00Z',2));
    await store.appendMetric(measure('early','ankle','2026-10-02T00:00:00Z',5));
    const r=await store.buildReport('ankle',range);
    expect(r.series[0]!.points.map(p=>p.id)).toEqual(['early','late']);
    expect(r.series[0]!.observedDelta).toBe(-3);
    expect(r.series[0]!.pointCount).toBe(2);
    native.close();
  });
  it('keeps clinician constraints active until explicitly revoked',async()=>{
    const {native,store}=createTestStore();
    await store.appendConstraint(constraint('no-impact'));
    expect((await store.getHistory('ankle')).constraints[0]!.status).toBe('active');
    await store.revokeConstraint('no-impact');
    expect((await store.getHistory('ankle')).constraints[0]!.status).toBe('revoked');
    await expect(store.revokeConstraint('no-impact')).rejects.toThrow();
    native.close();
  });
  it('includes daily pain and stiffness in the report without inventing missing days',async()=>{
    const {native,store}=createTestStore();
    await store.appendResponse('check1',{
      caseId:'ankle',observedAt:'2026-10-10T07:00:00Z',
      pain:5,painContextKey:'walking',morningStiffnessMinutes:12,
      response24h:'unknown',functionTrend:'unknown',
      consecutiveStableDays:0,dangerSigns:[],
    });
    await store.appendResponse('check2',{
      caseId:'ankle',observedAt:'2026-10-13T07:00:00Z',
      pain:2,previousPain:5,painContextKey:'walking',
      response24h:'better',functionTrend:'improving',
      consecutiveStableDays:0,dangerSigns:[],
    });
    await store.appendResponse('check3',{
      caseId:'ankle',observedAt:'2026-10-14T07:00:00Z',
      pain:1,painContextKey:'rest',response24h:'stable',
      functionTrend:'stable',consecutiveStableDays:1,dangerSigns:[],
    });
    const report=await store.buildReport('ankle',range);
    const walking=report.series.find(s=>s.metricKey==='pain'&&s.contextKey==='walking');
    expect(walking?.points).toHaveLength(2);
    expect(walking?.observedDelta).toBe(-3);
    const resting=report.series.find(s=>s.metricKey==='pain'&&s.contextKey==='rest');
    expect(resting?.points).toHaveLength(1);
    expect(resting?.observedDelta).toBeNull();
    expect(report.series.find(s=>s.metricKey==='morning_stiffness')?.points).toHaveLength(1);
    expect(report.observationCount).toBe(4);
    native.close();
  });
  it('stores explicit training links for multiple injuries',async()=>{
    const {native,store}=createTestStore();
    await store.linkTraining(training('w1',['ankle','back']));
    expect((await store.getHistory('ankle')).training).toHaveLength(1);
    expect((await store.getHistory('back')).training).toHaveLength(1);
    native.close();
  });
  it('does not associate unrelated training without opt-in',async()=>{
    const {native,store}=createTestStore();
    const unrelated=training('w2',[]);
    expect((await store.buildReport('ankle',range,[unrelated])).trainingRecordCount).toBe(0);
    expect((await store.buildReport('ankle',range,[unrelated],true)).trainingRecordCount).toBe(1);
    native.close();
  });
  it('preserves response records and versioned protocol authorization',async()=>{
    const {native,store}=createTestStore();
    await store.appendResponse('response-1',{
      caseId:'ankle',observedAt:'2026-10-12T07:00:00Z',
      pain:3,previousPain:2,response24h:'worse',
      functionTrend:'worsening',consecutiveStableDays:0,dangerSigns:[],
    });
    await store.appendProtocol({id:'protocol-1',issuedAt:'2026-10-12T00:00:00Z',
      authorization:{caseId:'ankle',protocolId:'example',protocolVersion:'1',
        approvedByClinician:false,progressionAuthorized:false,
        diagnosisStateAtApproval:'unknown',approvedPhases:['protected']}});
    const h=await store.getHistory('ankle');
    expect(h.responses[0]!.response24h).toBe('worse');
    expect(h.protocols[0]!.authorization.progressionAuthorized).toBe(false);
    native.close();
  });
});
