/**
 * Local-first and additive injury history store for the active Side Quest profile.
 * No cloud sync, migrations of legacy tables, or automatic clinical prescribing.
 */
import type {
  InjuryCase, InjuryEpisode, InjuryEvent, InjuryObservation, ClinicalConstraint,
  RehabAuthorization, RehabMetricObservation, RehabTimelineEvent,
  RehabTrainingReference, RehabReportRange, RehabReportData, RehabObservationSource,
} from '@circuit/planner';
import { buildRehabReportData } from '@circuit/planner';
import { withActiveSqliteDatabase } from './database';

export const INJURY_MEMORY_SCHEMA_VERSION = 1;
type Bind = string | number | null;
export interface InjurySqlite {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Bind[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: Bind[]): Promise<T[]>;
}
export interface InjuryEventRecord {
  event: InjuryEvent;
  description: string;
  source: RehabObservationSource;
}
export interface InjuryProtocolRecord {
  id: string;
  issuedAt: string;
  authorization: RehabAuthorization;
}
export interface InjuryHistory {
  injuryCase: InjuryCase | null;
  episodes: InjuryEpisode[];
  events: InjuryEventRecord[];
  responses: InjuryObservation[];
  metrics: RehabMetricObservation[];
  constraints: ClinicalConstraint[];
  protocols: InjuryProtocolRecord[];
  training: RehabTrainingReference[];
}
type JsonRow = { payload_json: string };
const SQL = [
  'CREATE TABLE IF NOT EXISTS injury_cases (id TEXT PRIMARY KEY NOT NULL,updated_at TEXT NOT NULL,payload_json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS injury_episodes (id TEXT PRIMARY KEY NOT NULL,case_id TEXT NOT NULL,started_at TEXT NOT NULL,payload_json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS injury_events (id TEXT PRIMARY KEY NOT NULL,case_id TEXT,occurred_at TEXT NOT NULL,payload_json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS injury_responses (id TEXT PRIMARY KEY NOT NULL,case_id TEXT NOT NULL,observed_at TEXT NOT NULL,payload_json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS injury_metrics (id TEXT PRIMARY KEY NOT NULL,case_id TEXT NOT NULL,observed_at TEXT NOT NULL,payload_json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS injury_constraints (id TEXT PRIMARY KEY NOT NULL,case_id TEXT,issued_at TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS injury_protocols (id TEXT PRIMARY KEY NOT NULL,case_id TEXT NOT NULL,issued_at TEXT NOT NULL,payload_json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS injury_training_links (id TEXT NOT NULL,case_id TEXT NOT NULL,occurred_at TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(id,case_id))',
  'CREATE INDEX IF NOT EXISTS idx_injury_events_case_time ON injury_events(case_id,occurred_at)',
  'CREATE INDEX IF NOT EXISTS idx_injury_responses_case_time ON injury_responses(case_id,observed_at)',
  'CREATE INDEX IF NOT EXISTS idx_injury_metrics_case_time ON injury_metrics(case_id,observed_at)',
  'CREATE INDEX IF NOT EXISTS idx_injury_training_case_time ON injury_training_links(case_id,occurred_at)',
  'CREATE TABLE IF NOT EXISTS injury_schema_metadata (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)',
  "INSERT OR IGNORE INTO injury_schema_metadata(key,value) VALUES ('version','1')",
].join(';\n') + ';';

const id = (value: string): void => {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Stable ID required');
};
const date = (value: string): void => {
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error('Valid timestamp required');
};
const parse = <T>(rows: JsonRow[]): T[] => rows.map(row => JSON.parse(row.payload_json) as T);
const eventKind = (kind: InjuryEvent['kind']): RehabTimelineEvent['kind'] => {
  switch (kind) {
    case 'onset': return 'injury_onset';
    case 'trauma': return 'trauma';
    case 'flare': return 'flare';
    case 'diagnosis_revision': return 'diagnosis_updated';
    case 'clinical_update': return 'clinical_visit';
    default: return 'other';
  }
};

export function createInjuryMemoryStore(db: InjurySqlite) {
  let initialization: Promise<void> | null = null;
  async function ensureSchema(): Promise<void> {
    if (!initialization) {
      initialization = db.execAsync(SQL).catch(error => { initialization = null; throw error; });
    }
    await initialization;
  }
  async function select<T>(table: string, clause: string, ...params: Bind[]): Promise<T[]> {
    await ensureSchema();
    // Both table and clause are constants supplied only by this module.
    return parse<T>(await db.getAllAsync<JsonRow>(
      'SELECT payload_json FROM ' + table + ' ' + clause, ...params,
    ));
  }
  async function append(table: string, columns: string[], values: Bind[]): Promise<void> {
    await ensureSchema();
    await db.runAsync(
      'INSERT INTO ' + table + ' (' + columns.join(',') + ') VALUES (' +
      columns.map(() => '?').join(',') + ')', ...values,
    );
  }
  return {
    ensureSchema,
    async upsertCase(value: InjuryCase, updatedAt = new Date().toISOString()) {
      id(value.id); date(updatedAt); await ensureSchema();
      await db.runAsync(
        'INSERT INTO injury_cases(id,updated_at,payload_json) VALUES (?,?,?) ' +
        'ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,payload_json=excluded.payload_json',
        value.id, updatedAt, JSON.stringify(value),
      );
    },
    async listCases(): Promise<InjuryCase[]> {
      return select<InjuryCase>('injury_cases', 'ORDER BY updated_at DESC,id');
    },
    async appendEpisode(value: InjuryEpisode) {
      id(value.id); id(value.caseId); date(value.startedAt);
      await append('injury_episodes', ['id','case_id','started_at','payload_json'],
        [value.id,value.caseId,value.startedAt,JSON.stringify(value)]);
    },
    async appendEvent(value: InjuryEventRecord) {
      id(value.event.id); date(value.event.occurredAt);
      if (!value.description.trim()) throw new Error('Description required');
      await append('injury_events', ['id','case_id','occurred_at','payload_json'],
        [value.event.id,value.event.caseId??null,value.event.occurredAt,JSON.stringify(value)]);
    },
    async appendResponse(recordId: string, value: InjuryObservation) {
      id(recordId); id(value.caseId); date(value.observedAt);
      if (value.pain != null && (!Number.isFinite(value.pain) || value.pain<0 || value.pain>10)) {
        throw new Error('Pain score must be 0–10');
      }
      await append('injury_responses',['id','case_id','observed_at','payload_json'],
        [recordId,value.caseId,value.observedAt,JSON.stringify(value)]);
    },
    async appendMetric(value: RehabMetricObservation) {
      id(value.id); id(value.caseId); date(value.observedAt);
      if (!value.metricKey || !Number.isFinite(value.value) ||
          (value.unit==='0-10' && (value.value<0||value.value>10))) {
        throw new Error('Invalid numeric rehabilitation measure');
      }
      await append('injury_metrics',['id','case_id','observed_at','payload_json'],
        [value.id,value.caseId,value.observedAt,JSON.stringify(value)]);
    },
    async appendConstraint(value: ClinicalConstraint) {
      id(value.id); date(value.issuedAt);
      await append('injury_constraints',['id','case_id','issued_at','status','payload_json'],
        [value.id,value.caseId??null,value.issuedAt,value.status,JSON.stringify(value)]);
    },
    /** Explicitly recorded status transition; expiry alone never revokes clinician instructions. */
    async revokeConstraint(constraintId:string) {
      id(constraintId); await ensureSchema();
      const found = await db.getAllAsync<JsonRow>(
        'SELECT payload_json FROM injury_constraints WHERE id=? AND status=?',
        constraintId,'active',
      );
      if (found.length !== 1) throw new Error('Active constraint not found');
      const value=JSON.parse(found[0]!.payload_json) as ClinicalConstraint;
      await db.runAsync(
        'UPDATE injury_constraints SET status=?,payload_json=? WHERE id=? AND status=?',
        'revoked', JSON.stringify({...value,status:'revoked'}),constraintId,'active',
      );
    },
    async appendProtocol(value: InjuryProtocolRecord) {
      id(value.id); id(value.authorization.caseId); date(value.issuedAt);
      await append('injury_protocols',['id','case_id','issued_at','payload_json'],
        [value.id,value.authorization.caseId,value.issuedAt,JSON.stringify(value)]);
    },
    async linkTraining(value: RehabTrainingReference) {
      id(value.id); id(value.sourceRecordId);date(value.occurredAt);
      if (!value.relatedCaseIds.length ||
          value.relatedCaseIds.length!==new Set(value.relatedCaseIds).size) {
        throw new Error('Training links require unique explicit case IDs');
      }
      await ensureSchema();
      for (const caseId of value.relatedCaseIds) {
        id(caseId);
        await db.runAsync(
          'INSERT INTO injury_training_links(id,case_id,occurred_at,payload_json) VALUES (?,?,?,?)',
          value.id,caseId,value.occurredAt,JSON.stringify(value),
        );
      }
    },
    async getHistory(caseId:string): Promise<InjuryHistory> {
      id(caseId);
      const [cases,episodes,events,responses,metrics,constraints,protocols,training] =
        await Promise.all([
          select<InjuryCase>('injury_cases','WHERE id=?',caseId),
          select<InjuryEpisode>('injury_episodes','WHERE case_id=? ORDER BY started_at,id',caseId),
          select<InjuryEventRecord>('injury_events','WHERE case_id=? ORDER BY occurred_at,id',caseId),
          select<InjuryObservation>('injury_responses','WHERE case_id=? ORDER BY observed_at,id',caseId),
          select<RehabMetricObservation>('injury_metrics','WHERE case_id=? ORDER BY observed_at,id',caseId),
          select<ClinicalConstraint>('injury_constraints',
            'WHERE case_id=? OR case_id IS NULL ORDER BY issued_at,id',caseId),
          select<InjuryProtocolRecord>('injury_protocols',
            'WHERE case_id=? ORDER BY issued_at,id',caseId),
          select<RehabTrainingReference>('injury_training_links',
            'WHERE case_id=? ORDER BY occurred_at,id',caseId),
        ]);
      return {injuryCase:cases[0]??null,episodes,events,responses,metrics,
        constraints,protocols,training};
    },
    async buildReport(
      caseId:string, range:RehabReportRange, extraTraining:RehabTrainingReference[]=[],
      includeUnlinkedTraining=false,
    ):Promise<RehabReportData> {
      const history=await this.getHistory(caseId);
      const events:RehabTimelineEvent[]=history.events.map(item=>({
        id:item.event.id,
        caseIds:item.event.caseId?[item.event.caseId]:[],
        occurredAt:item.event.occurredAt,
        kind:eventKind(item.event.kind),
        description:item.description,
        source:item.source,
        sourceRecordId:item.event.id,
      }));
      const linked=new Map(history.training.map(record=>[record.id,record]));
      extraTraining.forEach(record=>{if(!linked.has(record.id))linked.set(record.id,record);});
      return buildRehabReportData({
        caseId,range,observations:history.metrics,events,
        training:[...linked.values()],includeUnlinkedTraining,
      });
    },
  };
}
export type InjuryMemoryStore = ReturnType<typeof createInjuryMemoryStore>;

/** Uses the active per-profile SQLite database. Call lazily after backup verification. */
export async function withInjuryMemoryStore<T>(
  callback:(store:InjuryMemoryStore)=>Promise<T>,
):Promise<T> {
  return withActiveSqliteDatabase(async database=>{
    const store=createInjuryMemoryStore(database);
    await store.ensureSchema();
    return callback(store);
  });
}
