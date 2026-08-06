import type {
  AutomaticReplanRecord,
  StrengthAdjustmentProposal,
  TrainingIntelligencePreferences,
  TrainingIntelligenceSnapshot,
} from '@circuit/domain';
import {
  applyStrengthAdjustmentProposal,
  buildTrainingIntelligence,
  defaultTrainingIntelligencePreferences,
} from '@circuit/planner';

import {
  getActiveTrainingCheckIn,
  getLatestPTProfile,
  getLatestTrainingBlock,
  getLatestTrainingIntelligenceSnapshot,
  getTrainingCalendarEvents,
  getTrainingIntelligencePreferences,
  listEnduranceActivities,
  saveAutomaticReplanRecord,
  savePlanSnapshot,
  saveTrainingAdjustmentDecision,
  saveTrainingBlock,
  saveTrainingIntelligencePreferences,
  saveTrainingIntelligenceSnapshot,
} from './database';

export interface RefreshTrainingIntelligenceResult {
  snapshot: TrainingIntelligenceSnapshot | null;
  automaticApplied: number;
}

export async function refreshTrainingIntelligence({
  applyAutomatic = false,
  triggerActivityIds = [],
}: {
  applyAutomatic?: boolean;
  triggerActivityIds?: string[];
} = {}): Promise<RefreshTrainingIntelligenceResult> {
  const saved = await getLatestTrainingBlock();
  if (!saved) return { snapshot: null, automaticApplied: 0 };
  const preferences = await loadTrainingIntelligencePreferences();
  const now = new Date().toISOString();
  const today = localDate(new Date());
  const [activities, events, pt, checkIn] = await Promise.all([
    listEnduranceActivities({ from: addDaysIso(now, -preferences.lookbackDays - 2), limit: 5_000 }),
    getTrainingCalendarEvents({ from: addDaysIso(now, -3), to: addDaysIso(now, 14) }),
    getLatestPTProfile(),
    getActiveTrainingCheckIn(),
  ]);
  const returningFromInjury = Boolean(pt?.conditions.some((condition) => condition.status === 'returning' || condition.status === 'improving'));
  const activePainRestriction = Boolean(
    checkIn?.active && (checkIn.status === 'tightness_pain' || checkIn.status === 'unable_to_train'),
  );
  let snapshot = buildTrainingIntelligence({
    block: saved.block,
    activities,
    calendarEvents: events,
    preferences,
    returningFromInjury,
    activePainRestriction,
    today,
    now,
  });

  let automaticApplied = 0;
  if (applyAutomatic && preferences.mode === 'auto_high_confidence') {
    const triggerSet = new Set(triggerActivityIds);
    const eligible = snapshot.proposals.filter((proposal) =>
      proposal.automaticEligible
      && proposal.confidence === 'high'
      && proposal.status === 'pending'
      && (triggerSet.size === 0 || proposal.triggerActivityIds.some((id) => triggerSet.has(id))),
    );
    if (eligible.length) {
      const planSnapshot = await savePlanSnapshot(saved.block, 'Before V18.5 high-confidence endurance guardrail');
      let block = saved.block;
      const appliedIds: string[] = [];
      for (const proposal of eligible) {
        const result = applyStrengthAdjustmentProposal(block, proposal, now);
        if (!result.applied) continue;
        block = result.block;
        automaticApplied += 1;
        appliedIds.push(proposal.sessionId);
        const updated = { ...proposal, status: 'auto_applied' as const, updatedAt: now };
        await saveTrainingAdjustmentDecision(updated);
        snapshot = {
          ...snapshot,
          proposals: snapshot.proposals.map((item) => item.id === proposal.id ? updated : item),
        };
      }
      if (automaticApplied > 0) {
        await saveTrainingBlock(block);
        const first = eligible[0]!;
        const record: AutomaticReplanRecord = {
          id: `automatic_intelligence_${stableHash(`${now}:${appliedIds.join('|')}`)}`,
          triggerActivityId: first.triggerActivityIds[0] ?? 'training-intelligence',
          snapshotId: planSnapshot.id,
          previousBlockId: saved.block.id,
          updatedBlockId: block.id,
          movedSessionIds: appliedIds,
          reason: `V18.5 applied ${automaticApplied} high-confidence extreme-load guardrail${automaticApplied === 1 ? '' : 's'}. Direct strength was moved, not deleted.`,
          createdAt: now,
        };
        await saveAutomaticReplanRecord(record);
      }
    }
  }
  const finalSnapshot = { ...snapshot, generatedAt: now };
  await saveTrainingIntelligenceSnapshot(finalSnapshot);
  return { snapshot: finalSnapshot, automaticApplied };
}

export async function loadTrainingIntelligencePreferences(): Promise<TrainingIntelligencePreferences> {
  const saved = await getTrainingIntelligencePreferences();
  return saved ?? defaultTrainingIntelligencePreferences();
}

export async function updateTrainingIntelligencePreferences(
  patch: Partial<Pick<TrainingIntelligencePreferences, 'mode' | 'lookbackDays' | 'useStravaRelativeEffort'>>,
): Promise<TrainingIntelligencePreferences> {
  const current = await loadTrainingIntelligencePreferences();
  const updated: TrainingIntelligencePreferences = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await saveTrainingIntelligencePreferences(updated);
  await refreshTrainingIntelligence();
  return updated;
}

export async function acceptTrainingAdjustment(proposalId: string): Promise<string> {
  const [snapshot, saved] = await Promise.all([
    getLatestTrainingIntelligenceSnapshot(),
    getLatestTrainingBlock(),
  ]);
  if (!snapshot) throw new Error('No current Training Intelligence review is available.');
  if (!saved) throw new Error('No active strength plan is available.');
  const proposal = snapshot.proposals.find((item) => item.id === proposalId);
  if (!proposal) throw new Error('That recommendation is no longer available. Refresh the review.');
  if (proposal.status !== 'pending') return 'This recommendation has already been reviewed.';
  const now = new Date().toISOString();
  const planSnapshot = await savePlanSnapshot(saved.block, `Before accepted V18.5 recommendation: ${proposal.headline}`);
  const result = applyStrengthAdjustmentProposal(saved.block, proposal, now);
  if (result.applied) await saveTrainingBlock(result.block);
  const accepted = { ...proposal, status: 'accepted' as const, updatedAt: now };
  await saveTrainingAdjustmentDecision(accepted);
  await saveTrainingIntelligenceSnapshot({
    ...snapshot,
    generatedAt: now,
    proposals: snapshot.proposals.map((item) => item.id === proposalId ? accepted : item),
    summary: `${proposal.headline} was accepted. A pre-change snapshot (${planSnapshot.id}) is available for undo.`,
  });
  return result.message;
}

export async function dismissTrainingAdjustment(proposalId: string): Promise<void> {
  const snapshot = await getLatestTrainingIntelligenceSnapshot();
  if (!snapshot) return;
  const proposal = snapshot.proposals.find((item) => item.id === proposalId);
  if (!proposal) return;
  const now = new Date().toISOString();
  const dismissed = { ...proposal, status: 'dismissed' as const, updatedAt: now };
  await saveTrainingAdjustmentDecision(dismissed);
  await saveTrainingIntelligenceSnapshot({
    ...snapshot,
    generatedAt: now,
    proposals: snapshot.proposals.map((item) => item.id === proposalId ? dismissed : item),
  });
}

export async function getTrainingIntelligenceSnapshot(): Promise<TrainingIntelligenceSnapshot | null> {
  return getLatestTrainingIntelligenceSnapshot();
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
