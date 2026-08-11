import {
  type PainContextObservation,
  type PainContextReport,
} from '@circuit/planner/athlete-context-intelligence';
import Storage from 'expo-sqlite/kv-store';

const PAIN_MEMORY_KEY = 'circuit.athlete-pain-context.v1';
const MAX_PAIN_OBSERVATIONS = 100;
const PAIN_RETENTION_DAYS = 90;

export function loadPainContextObservations(now = new Date().toISOString()): PainContextObservation[] {
  const saved = Storage.getItemSync(PAIN_MEMORY_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cutoff = new Date(now).getTime() - PAIN_RETENTION_DAYS * 86_400_000;
    return parsed
      .filter(isValidPainObservation)
      .filter((item) => new Date(item.occurredAt).getTime() >= cutoff)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .slice(-MAX_PAIN_OBSERVATIONS);
  } catch {
    return [];
  }
}

export function recordPainContextObservation(
  report: PainContextReport,
  context: {
    occurredAt?: string;
    discipline?: 'swim' | 'bike' | 'run' | 'strength';
  } = {},
): PainContextObservation {
  const occurredAt = context.occurredAt ?? new Date().toISOString();
  const observation: PainContextObservation = {
    ...report,
    id: `pain_${occurredAt.replace(/[^0-9]/g, '')}_${report.kind}_${report.affectedArea}`,
    occurredAt,
    discipline: context.discipline,
  };
  const existing = loadPainContextObservations(occurredAt)
    .filter((item) => !isNearDuplicate(item, observation));
  const next = [...existing, observation].slice(-MAX_PAIN_OBSERVATIONS);
  Storage.setItemSync(PAIN_MEMORY_KEY, JSON.stringify(next));
  return observation;
}

export function clearPainContextMemory(): void {
  Storage.removeItemSync(PAIN_MEMORY_KEY);
}

function isNearDuplicate(left: PainContextObservation, right: PainContextObservation): boolean {
  if (left.kind !== right.kind || left.affectedArea !== right.affectedArea || left.discipline !== right.discipline) return false;
  const delta = Math.abs(new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
  return delta <= 30 * 60 * 1000
    && left.functionalInterference === right.functionalInterference
    && left.score0to10 === right.score0to10;
}

function isValidPainObservation(value: unknown): value is PainContextObservation {
  const item = value as Partial<PainContextObservation> | null | undefined;
  return Boolean(
    item?.id
    && item?.occurredAt
    && (item.kind === 'training_exertion'
      || item.kind === 'post_exercise_soreness'
      || item.kind === 'menstrual'
      || item.kind === 'focal_musculoskeletal'
      || item.kind === 'systemic'
      || item.kind === 'unknown')
    && (item.functionalInterference === 'none'
      || item.functionalInterference === 'noticeable'
      || item.functionalInterference === 'modified_session'
      || item.functionalInterference === 'stopped_session'
      || item.functionalInterference === 'daily_activity'
      || item.functionalInterference === 'rest_or_night')
    && (item.affectedArea === 'lower_body'
      || item.affectedArea === 'upper_body'
      || item.affectedArea === 'general'
      || item.affectedArea === 'unknown')
    && typeof item.focal === 'boolean'
    && typeof item.newOrUnfamiliar === 'boolean'
    && typeof item.worsening === 'boolean'
    && typeof item.stoppedSession === 'boolean'
    && Array.isArray(item.signals),
  );
}
