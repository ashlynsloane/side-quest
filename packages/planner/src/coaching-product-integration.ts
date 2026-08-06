import type {
  ExecutablePlanAction,
  ExecutablePlanChangeSet,
  PlanChangeApplicationResult,
  PlanChangePreview,
  PlanChangeUndoResult,
  ProtectedCommitmentConflict,
  SeasonConstraintEvaluation,
} from '@circuit/domain';

export interface BuildExecutablePlanChangeSetInput {
  changeSetId: string;
  athleteId: string;
  sourceDecisionId: string;
  createdAt: string;
  actions: ExecutablePlanAction[];
  protectedCommitmentConflicts?: ProtectedCommitmentConflict[];
  seasonConstraintEvaluations?: SeasonConstraintEvaluation[];
  requiresAthleteApproval?: boolean;
  provenance?: string[];
}

export interface ApplyExecutablePlanChangeSetInput {
  changeSet: ExecutablePlanChangeSet;
  athleteApproved: boolean;
  previouslyAppliedIdempotencyKeys?: string[];
}

function stableActionSignature(action: ExecutablePlanAction): string {
  const before = action.before
    ? `${action.before.sessionId}:${action.before.localDate}:${action.before.localStartTime ?? ''}:${action.before.durationMinutes}`
    : '-';
  const after = action.after
    ? `${action.after.sessionId}:${action.after.localDate}:${action.after.localStartTime ?? ''}:${action.after.durationMinutes}`
    : '-';
  return `${action.kind}|${before}|${after}|${action.sourceDecisionId}|${action.sourceProposalId ?? ''}`;
}

export function createPlanChangeIdempotencyKey(
  sourceDecisionId: string,
  actions: ExecutablePlanAction[],
): string {
  const signature = actions.map(stableActionSignature).sort().join('||');
  let hash = 2166136261;
  const input = `${sourceDecisionId}::${signature}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `plan-change:${sourceDecisionId}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildExecutablePlanChangeSet(
  input: BuildExecutablePlanChangeSetInput,
): ExecutablePlanChangeSet {
  const hardCommitmentConflicts = (input.protectedCommitmentConflicts ?? []).filter(
    (conflict) => conflict.hardConflict,
  );
  const blockedSeasonEvaluations = (input.seasonConstraintEvaluations ?? []).filter(
    (evaluation) => !evaluation.allowed,
  );
  const protectedActionIds = input.actions
    .filter((action) => action.before?.protected && action.kind !== 'preserve_session')
    .map((action) => action.actionId);

  const blockedReasons = [
    ...hardCommitmentConflicts.map(
      (conflict) => `Protected commitment ${conflict.commitmentId} blocks ${conflict.placementId}.`,
    ),
    ...blockedSeasonEvaluations.flatMap((evaluation) => evaluation.reasons),
    ...protectedActionIds.map((actionId) => `Action ${actionId} would modify a protected session.`),
  ];

  return {
    changeSetId: input.changeSetId,
    athleteId: input.athleteId,
    sourceDecisionId: input.sourceDecisionId,
    createdAt: input.createdAt,
    status: blockedReasons.length ? 'blocked' : 'preview',
    actions: input.actions,
    blockedReasons,
    requiresAthleteApproval: input.requiresAthleteApproval ?? input.actions.some((action) => action.kind !== 'preserve_session'),
    idempotencyKey: createPlanChangeIdempotencyKey(input.sourceDecisionId, input.actions),
    provenance: input.provenance ?? [`decision:${input.sourceDecisionId}`],
    auditable: true,
  };
}

export function previewExecutablePlanChangeSet(changeSet: ExecutablePlanChangeSet): PlanChangePreview {
  const changed = changeSet.actions.filter((action) => action.kind !== 'preserve_session');
  const preserved = changeSet.actions.filter((action) => action.kind === 'preserve_session');
  return {
    changeSetId: changeSet.changeSetId,
    headline: changeSet.blockedReasons.length ? 'Plan update needs attention' : 'Review plan update',
    summary: changeSet.blockedReasons.length
      ? changeSet.blockedReasons
      : changed.map((action) => action.reason),
    preservedSessionIds: preserved
      .map((action) => action.before?.sessionId ?? action.after?.sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
    changedSessionIds: changed
      .flatMap((action) => [action.before?.sessionId, action.after?.sessionId])
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
    blockedActionIds: changeSet.blockedReasons.length
      ? changeSet.actions.filter((action) => action.kind !== 'preserve_session').map((action) => action.actionId)
      : [],
    requiresAthleteApproval: changeSet.requiresAthleteApproval,
  };
}

export function applyExecutablePlanChangeSet(
  input: ApplyExecutablePlanChangeSetInput,
): PlanChangeApplicationResult {
  if (input.previouslyAppliedIdempotencyKeys?.includes(input.changeSet.idempotencyKey)) {
    return {
      changeSetId: input.changeSet.changeSetId,
      status: 'already_applied',
      appliedActionIds: [],
      skippedActionIds: input.changeSet.actions.map((action) => action.actionId),
      explanation: ['This exact plan update was already applied. No duplicate changes were made.'],
      auditable: true,
    };
  }
  if (input.changeSet.blockedReasons.length) {
    return {
      changeSetId: input.changeSet.changeSetId,
      status: 'blocked',
      appliedActionIds: [],
      skippedActionIds: input.changeSet.actions.map((action) => action.actionId),
      explanation: input.changeSet.blockedReasons,
      auditable: true,
    };
  }
  if (input.changeSet.requiresAthleteApproval && !input.athleteApproved) {
    return {
      changeSetId: input.changeSet.changeSetId,
      status: 'blocked',
      appliedActionIds: [],
      skippedActionIds: input.changeSet.actions.map((action) => action.actionId),
      explanation: ['Athlete approval is required before this plan update can be applied.'],
      auditable: true,
    };
  }
  return {
    changeSetId: input.changeSet.changeSetId,
    status: 'applied',
    appliedActionIds: input.changeSet.actions.map((action) => action.actionId),
    skippedActionIds: [],
    undoToken: `undo:${input.changeSet.changeSetId}:${input.changeSet.idempotencyKey}`,
    explanation: ['The approved changes were applied atomically.', 'An undo token was created for rollback.'],
    auditable: true,
  };
}

export function undoExecutablePlanChangeSet(
  changeSet: ExecutablePlanChangeSet | undefined,
  undoToken: string,
): PlanChangeUndoResult {
  if (!changeSet) {
    return { changeSetId: 'unknown', status: 'not_found', restoredSessionIds: [], explanation: ['The plan update could not be found.'], auditable: true };
  }
  const expected = `undo:${changeSet.changeSetId}:${changeSet.idempotencyKey}`;
  if (undoToken !== expected) {
    return { changeSetId: changeSet.changeSetId, status: 'not_allowed', restoredSessionIds: [], explanation: ['The undo token is invalid for this plan update.'], auditable: true };
  }
  const restoredSessionIds = changeSet.actions
    .map((action) => action.before?.sessionId)
    .filter((sessionId): sessionId is string => Boolean(sessionId));
  return {
    changeSetId: changeSet.changeSetId,
    status: 'undone',
    restoredSessionIds,
    explanation: ['The previous session placements and prescriptions were restored.'],
    auditable: true,
  };
}
