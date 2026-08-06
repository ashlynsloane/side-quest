import type {
  CoachSessionProposal,
  CoachSessionProposalSnapshot,
  GeneratedWorkout,
  PlannedStrengthSession,
  TrainingBlockPlan,
} from '@circuit/domain';
import {
  applyCoachSessionRevision,
  publicWorkoutForCollaboration,
  type CoachSessionRevision,
} from '@circuit/planner';

import {
  getLatestPlanSnapshot,
  getLatestTrainingBlock,
  markPlanSnapshotRestored,
  savePlanSnapshot,
  saveTrainingBlock,
} from '@/services/database';
import { supabase } from '@/services/supabase';

export interface CoachAccessGrant {
  id: string;
  athleteId: string;
  coachId: string;
  athleteDisplayName: string;
  coachDisplayName: string;
  status: 'active' | 'revoked';
  canViewFutureStrength: boolean;
  canEditFutureStrength: boolean;
  acceptedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface CoachInvite {
  code: string;
  expiresAt: string;
}

export interface CoachFutureSession {
  athleteId: string;
  planId: string;
  localSessionId: string;
  sessionDate: string;
  title: string;
  intendedLoad: PlannedStrengthSession['intendedLoad'];
  purpose: PlannedStrengthSession['purpose'];
  workout: GeneratedWorkout;
  coachNote?: string;
  coachRevision: number;
  lastEditedBy: string;
  lastEditorDisplayName: string;
  updatedAt: string;
}

export interface CoachPlanSyncResult {
  block: TrainingBlockPlan | null;
  sharedFutureSessions: number;
  pendingProposalCount: number;
}

export type CoachProposalApplyResult =
  | { ok: true; block: TrainingBlockPlan; snapshotId: string }
  | { ok: false; reasons: string[] };

type GrantRow = {
  id: string;
  athlete_id: string;
  coach_id: string;
  athlete_display_name: string;
  coach_display_name: string;
  status: 'active' | 'revoked';
  can_view_future_strength: boolean;
  can_edit_future_strength: boolean;
  accepted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

type SessionRow = {
  athlete_id: string;
  plan_id: string;
  local_session_id: string;
  session_date: string;
  title: string;
  intended_load: PlannedStrengthSession['intendedLoad'];
  purpose: PlannedStrengthSession['purpose'];
  workout_json: GeneratedWorkout;
  coach_note: string | null;
  coach_revision: number;
  last_edited_by: string;
  last_editor_display_name: string;
  updated_at: string;
};

type ProposalRow = {
  id: string;
  athlete_id: string;
  coach_id: string;
  coach_display_name: string;
  local_session_id: string;
  baseline_json: CoachSessionProposalSnapshot;
  proposed_json: CoachSessionProposalSnapshot;
  coach_note: string | null;
  status: CoachSessionProposal['status'];
  created_at: string;
  reviewed_at: string | null;
  athlete_note: string | null;
};

function client() {
  if (!supabase) throw new Error('Coach access requires a cloud-enabled Side Quest account.');
  return supabase;
}

function grantFromRow(row: GrantRow): CoachAccessGrant {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    coachId: row.coach_id,
    athleteDisplayName: row.athlete_display_name,
    coachDisplayName: row.coach_display_name,
    status: row.status,
    canViewFutureStrength: row.can_view_future_strength,
    canEditFutureStrength: row.can_edit_future_strength,
    acceptedAt: row.accepted_at,
    expiresAt: row.expires_at ?? row.accepted_at,
    revokedAt: row.revoked_at ?? undefined,
  };
}

function sessionFromRow(row: SessionRow): CoachFutureSession {
  return {
    athleteId: row.athlete_id,
    planId: row.plan_id,
    localSessionId: row.local_session_id,
    sessionDate: row.session_date,
    title: row.title,
    intendedLoad: row.intended_load,
    purpose: row.purpose,
    workout: row.workout_json,
    coachNote: row.coach_note ?? undefined,
    coachRevision: row.coach_revision,
    lastEditedBy: row.last_edited_by,
    lastEditorDisplayName: row.last_editor_display_name,
    updatedAt: row.updated_at,
  };
}

function proposalFromRow(row: ProposalRow): CoachSessionProposal {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    coachId: row.coach_id,
    coachDisplayName: row.coach_display_name,
    localSessionId: row.local_session_id,
    baseline: row.baseline_json,
    proposed: row.proposed_json,
    coachNote: row.coach_note ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? undefined,
    athleteNote: row.athlete_note ?? undefined,
  };
}

export async function createCoachInvite(displayName: string): Promise<CoachInvite> {
  const db = client();
  const { data, error } = await db.rpc('create_coach_invite', { p_display_name: displayName.trim() });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The coach invitation could not be created.');
  return { code: String(row.code), expiresAt: String(row.expires_at) };
}

export async function acceptCoachInvite(code: string, displayName: string): Promise<CoachAccessGrant> {
  const db = client();
  const { data, error } = await db.rpc('accept_coach_invite', {
    p_code: code.trim().toUpperCase(),
    p_display_name: displayName.trim(),
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The coach invitation could not be accepted.');
  return grantFromRow(row as GrantRow);
}

export async function listCoachAccess(userId: string): Promise<{
  coaches: CoachAccessGrant[];
  athletes: CoachAccessGrant[];
}> {
  const db = client();
  const { data, error } = await db
    .from('coach_access_grants')
    .select('*')
    .or(`athlete_id.eq.${userId},coach_id.eq.${userId}`)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('accepted_at', { ascending: false });
  if (error) throw new Error(error.message);
  const grants = ((data ?? []) as GrantRow[]).map(grantFromRow);
  return {
    coaches: grants.filter((grant) => grant.athleteId === userId),
    athletes: grants.filter((grant) => grant.coachId === userId),
  };
}

export async function revokeCoachAccess(grantId: string): Promise<void> {
  const db = client();
  const { error } = await db.rpc('revoke_coach_access', { p_grant_id: grantId });
  if (error) throw new Error(error.message);
}

export async function renewCoachAccess(grantId: string): Promise<CoachAccessGrant> {
  const db = client();
  const { data, error } = await db.rpc('renew_coach_access', { p_grant_id: grantId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Coach access could not be renewed.');
  return grantFromRow(row as GrantRow);
}

function futureSessions(block: TrainingBlockPlan): PlannedStrengthSession[] {
  const today = new Date().toISOString().slice(0, 10);
  return block.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.date >= today && !['completed', 'skipped'].includes(session.completionStatus));
}

function cloudSessionPayload(session: PlannedStrengthSession) {
  return {
    local_session_id: session.id,
    session_date: session.date,
    title: session.title,
    intended_load: session.intendedLoad,
    purpose: session.purpose,
    workout_json: publicWorkoutForCollaboration(session.workout),
    applied_coach_revision: session.coachReview ? 1 : 0,
  };
}

export async function syncAthleteFuturePlan(
  athleteId: string,
  blockInput?: TrainingBlockPlan | null,
): Promise<CoachPlanSyncResult> {
  const db = client();
  const saved = blockInput ? { block: blockInput } : await getLatestTrainingBlock();
  if (!saved?.block) return { block: null, sharedFutureSessions: 0, pendingProposalCount: 0 };
  const sessions = futureSessions(saved.block).map((session) => cloudSessionPayload(session));
  const { error } = await db.rpc('sync_athlete_future_sessions', {
    p_plan_id: saved.block.id,
    p_sessions: sessions,
  });
  if (error) throw new Error(error.message);
  const pending = await listCoachSessionProposals({ athleteId, status: 'pending' });
  return {
    block: saved.block,
    sharedFutureSessions: sessions.length,
    pendingProposalCount: pending.length,
  };
}

export async function listCoachFutureSessions(athleteId: string): Promise<CoachFutureSession[]> {
  const db = client();
  const { data, error } = await db
    .from('coach_future_sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('session_date', new Date().toISOString().slice(0, 10))
    .order('session_date')
    .order('local_session_id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as SessionRow[]).map(sessionFromRow);
}

export async function listCoachSessionProposals({
  athleteId,
  coachId,
  status,
}: {
  athleteId?: string;
  coachId?: string;
  status?: CoachSessionProposal['status'];
} = {}): Promise<CoachSessionProposal[]> {
  const db = client();
  let query = db.from('coach_session_proposals').select('*').order('created_at', { ascending: false });
  if (athleteId) query = query.eq('athlete_id', athleteId);
  if (coachId) query = query.eq('coach_id', coachId);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProposalRow[]).map(proposalFromRow);
}

export async function proposeCoachFutureSession(input: {
  athleteId: string;
  session: CoachFutureSession;
  date: string;
  title: string;
  intendedLoad: PlannedStrengthSession['intendedLoad'];
  workout: GeneratedWorkout;
  note?: string;
  coachDisplayName: string;
}): Promise<CoachSessionProposal> {
  const db = client();
  const proposed: CoachSessionProposalSnapshot = {
    sessionDate: input.date,
    title: input.title.trim() || input.session.title,
    intendedLoad: input.intendedLoad,
    purpose: input.session.purpose,
    workout: publicWorkoutForCollaboration(input.workout),
  };
  const { data, error } = await db.rpc('propose_coach_future_session', {
    p_athlete_id: input.athleteId,
    p_session_id: input.session.localSessionId,
    p_proposed_json: proposed,
    p_note: input.note?.trim() || null,
    p_coach_display_name: input.coachDisplayName.trim(),
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The coach proposal could not be sent.');
  return proposalFromRow(row as ProposalRow);
}

function proposalRevision(proposal: CoachSessionProposal): CoachSessionRevision {
  return {
    sessionId: proposal.localSessionId,
    date: proposal.proposed.sessionDate,
    title: proposal.proposed.title,
    intendedLoad: proposal.proposed.intendedLoad,
    workout: proposal.proposed.workout,
    coachUserId: proposal.coachId,
    coachDisplayName: proposal.coachDisplayName,
    editedAt: proposal.createdAt,
    revisionId: proposal.id,
    note: proposal.coachNote,
  };
}

async function reviewProposalCloud(
  proposalId: string,
  decision: 'accepted' | 'rejected',
  athleteNote?: string,
): Promise<CoachSessionProposal> {
  const db = client();
  const { data, error } = await db.rpc('review_coach_session_proposal', {
    p_proposal_id: proposalId,
    p_decision: decision,
    p_athlete_note: athleteNote?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The coach proposal decision could not be saved.');
  return proposalFromRow(row as ProposalRow);
}

export async function rejectCoachSessionProposal(
  proposalId: string,
  athleteNote?: string,
): Promise<CoachSessionProposal> {
  return reviewProposalCloud(proposalId, 'rejected', athleteNote);
}

export async function applyCoachSessionProposal(
  proposal: CoachSessionProposal,
  athleteNote?: string,
): Promise<CoachProposalApplyResult> {
  const saved = await getLatestTrainingBlock();
  if (!saved?.block) return { ok: false, reasons: ['No active local strength plan was found.'] };
  const localSession = saved.block.weeks
    .flatMap((week) => week.sessions)
    .find((session) => session.id === proposal.localSessionId);
  if (!localSession) return { ok: false, reasons: ['The local future session no longer exists. Sync the plan and ask the coach to review it again.'] };
  const result = applyCoachSessionRevision(localSession, proposalRevision(proposal));
  if (!result.ok) return result;
  const nextBlock: TrainingBlockPlan = {
    ...saved.block,
    weeks: saved.block.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => session.id === localSession.id ? result.session : session),
    })),
  };
  const snapshot = await savePlanSnapshot(saved.block, `Before accepting coach proposal ${proposal.id}`);
  await saveTrainingBlock(nextBlock);
  try {
    await reviewProposalCloud(proposal.id, 'accepted', athleteNote);
  } catch (cause) {
    await saveTrainingBlock(saved.block);
    await markPlanSnapshotRestored(snapshot.id);
    throw cause;
  }
  return { ok: true, block: nextBlock, snapshotId: snapshot.id };
}

export async function undoLatestCoachPlanChange(): Promise<boolean> {
  const snapshot = await getLatestPlanSnapshot();
  if (!snapshot || !snapshot.reason.startsWith('Before accepting coach proposal ')) return false;
  await saveTrainingBlock(snapshot.block);
  await markPlanSnapshotRestored(snapshot.id);
  return true;
}
