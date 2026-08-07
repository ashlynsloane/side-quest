import type { PlannedStrengthSession, TrainingCalendarEvent } from '@circuit/domain';
import {
  buildProactiveCoachCue,
  learnCoachInterventionEffects,
  outcomeRatingFromFollowUp,
  type CoachDecisionExplanation,
  type CoachFollowUpPlan,
  type CoachInterventionEffectPattern,
  type CoachInterventionFingerprint,
  type CoachInterventionOutcomeObservation,
  type ProactiveCoachCue,
} from '@circuit/planner/coach-closed-loop';
import type { AdjustmentOption } from '@circuit/planner';
import Storage from 'expo-sqlite/kv-store';

import type { PersistedCoachTarget } from './coach-conversation-state';
import type { SideQuestPlanSessionOverride } from './side-quest-plan-overrides';

const COACH_CLOSED_LOOP_KEY = 'circuit.coach-closed-loop.v1';
const MAX_INTERVENTIONS = 200;
const MAX_OUTCOMES = 300;
const MAX_AGE_DAYS = 365;

export type CoachFollowUpResponse = 'better' | 'same' | 'worse' | 'not_completed';

export interface CoachAppliedInterventionRecord {
  id: string;
  blockId: string;
  target: PersistedCoachTarget;
  optionId: string;
  optionTitle: string;
  optionAction: AdjustmentOption['action'];
  snapshotId: string;
  appliedAt: string;
  fingerprint: CoachInterventionFingerprint;
  explanation: CoachDecisionExplanation;
  followUp: CoachFollowUpPlan;
  previousOverride?: SideQuestPlanSessionOverride;
  previousAdHocEvent?: TrainingCalendarEvent;
  originalStrengthSession?: PlannedStrengthSession;
  status: 'active' | 'reverted';
  revertedAt?: string;
  outcomeObservationId?: string;
}

export interface CoachClosedLoopState {
  version: 1;
  interventions: CoachAppliedInterventionRecord[];
  outcomes: CoachInterventionOutcomeObservation[];
  updatedAt: string;
}

export interface CoachClosedLoopSummary {
  dueFollowUp?: CoachAppliedInterventionRecord;
  latestUndoable?: CoachAppliedInterventionRecord;
  patterns: CoachInterventionEffectPattern[];
  proactiveCue?: ProactiveCoachCue;
}

export function loadCoachClosedLoopState(): CoachClosedLoopState {
  const saved = Storage.getItemSync(COACH_CLOSED_LOOP_KEY);
  if (!saved) return emptyState();
  try {
    const parsed = JSON.parse(saved) as Partial<CoachClosedLoopState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.interventions) || !Array.isArray(parsed.outcomes)) return emptyState();
    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
    const interventions = parsed.interventions
      .filter(isValidIntervention)
      .filter((item) => new Date(item.appliedAt).getTime() >= cutoff)
      .slice(-MAX_INTERVENTIONS);
    const outcomes = parsed.outcomes
      .filter(isValidOutcome)
      .filter((item) => new Date(item.observedAt).getTime() >= cutoff)
      .slice(-MAX_OUTCOMES);
    return { version: 1, interventions, outcomes, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString() };
  } catch {
    return emptyState();
  }
}

export function saveCoachClosedLoopState(state: CoachClosedLoopState): CoachClosedLoopState {
  const next: CoachClosedLoopState = {
    version: 1,
    interventions: state.interventions.slice(-MAX_INTERVENTIONS),
    outcomes: state.outcomes.slice(-MAX_OUTCOMES),
    updatedAt: new Date().toISOString(),
  };
  Storage.setItemSync(COACH_CLOSED_LOOP_KEY, JSON.stringify(next));
  return next;
}

export function recordAppliedCoachIntervention(record: Omit<CoachAppliedInterventionRecord, 'status'>): CoachAppliedInterventionRecord {
  const state = loadCoachClosedLoopState();
  const full: CoachAppliedInterventionRecord = { ...record, status: 'active' };
  const interventions = [...state.interventions.filter((item) => item.id !== full.id), full];
  saveCoachClosedLoopState({ ...state, interventions });
  return full;
}

export function recordCoachFollowUpOutcome(interventionId: string, response: CoachFollowUpResponse): CoachInterventionOutcomeObservation | null {
  const state = loadCoachClosedLoopState();
  const intervention = state.interventions.find((item) => item.id === interventionId);
  if (!intervention || intervention.status !== 'active') return null;
  const mapped = outcomeRatingFromFollowUp(response);
  const observedAt = new Date().toISOString();
  const observation: CoachInterventionOutcomeObservation = {
    id: `coach_outcome_${interventionId}`,
    interventionId,
    observedAt,
    fingerprint: intervention.fingerprint,
    ...mapped,
  };
  const interventions = state.interventions.map((item) => item.id === interventionId ? { ...item, outcomeObservationId: observation.id } : item);
  const outcomes = [...state.outcomes.filter((item) => item.id !== observation.id), observation];
  saveCoachClosedLoopState({ ...state, interventions, outcomes });
  return observation;
}

export function markCoachInterventionReverted(interventionId: string): CoachAppliedInterventionRecord | null {
  const state = loadCoachClosedLoopState();
  let changed: CoachAppliedInterventionRecord | null = null;
  const revertedAt = new Date().toISOString();
  const interventions = state.interventions.map((item) => {
    if (item.id !== interventionId || item.status === 'reverted') return item;
    changed = { ...item, status: 'reverted', revertedAt };
    return changed;
  });
  if (!changed) return null;
  saveCoachClosedLoopState({ ...state, interventions });
  return changed;
}

export function getCoachClosedLoopSummary(now = new Date().toISOString()): CoachClosedLoopSummary {
  const state = loadCoachClosedLoopState();
  const nowMs = new Date(now).getTime();
  const dueFollowUp = state.interventions
    .filter((item) => item.status === 'active' && !item.outcomeObservationId && new Date(item.followUp.dueAt).getTime() <= nowMs)
    .sort((left, right) => priorityRank(right.followUp.priority) - priorityRank(left.followUp.priority) || left.followUp.dueAt.localeCompare(right.followUp.dueAt))[0];
  const latestUndoable = [...state.interventions]
    .filter((item) => item.status === 'active')
    .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))[0];
  const patterns = learnCoachInterventionEffects(state.outcomes);
  const proactiveCue = patterns.map(buildProactiveCoachCue).find((cue): cue is ProactiveCoachCue => Boolean(cue));
  return { dueFollowUp, latestUndoable, patterns, proactiveCue };
}

export function clearCoachClosedLoopState(): void {
  Storage.removeItemSync(COACH_CLOSED_LOOP_KEY);
}

export function exportCoachClosedLoopState(): CoachClosedLoopState {
  return loadCoachClosedLoopState();
}

function emptyState(): CoachClosedLoopState {
  return { version: 1, interventions: [], outcomes: [], updatedAt: new Date().toISOString() };
}

function priorityRank(priority: CoachFollowUpPlan['priority']): number {
  return priority === 'high' ? 2 : 1;
}

function isValidIntervention(value: unknown): value is CoachAppliedInterventionRecord {
  const item = value as Partial<CoachAppliedInterventionRecord> | null | undefined;
  return Boolean(
    item?.id
    && item.blockId
    && item.target?.sessionId
    && item.optionId
    && item.optionTitle
    && item.snapshotId
    && item.appliedAt
    && item.fingerprint?.discipline
    && item.followUp?.dueAt
    && (item.status === 'active' || item.status === 'reverted'),
  );
}

function isValidOutcome(value: unknown): value is CoachInterventionOutcomeObservation {
  const item = value as Partial<CoachInterventionOutcomeObservation> | null | undefined;
  return Boolean(item?.id && item.interventionId && item.observedAt && item.fingerprint?.discipline && item.rating && item.symptomResponse);
}
