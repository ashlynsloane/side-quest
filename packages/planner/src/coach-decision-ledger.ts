import type {
  CoachDecisionContext,
  CoachDecisionLedgerExplanation,
  CoachDecisionHistorySummary,
  CoachDecisionLearningResult,
  CoachDecisionOption,
  CoachDecisionOutcome,
  CoachDecisionRecord,
  CoachDecisionSelection,
  CoachDecisionSource,
  DigitalTwinConfidence,
  TwinGovernanceState,
} from '@circuit/domain';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface CreateCoachDecisionRecordInput {
  decisionId: string;
  athleteId: string;
  createdAt: string;
  source: CoachDecisionSource;
  context: CoachDecisionContext;
  options: CoachDecisionOption[];
  recommendedOptionId?: string;
  explanation: CoachDecisionLedgerExplanation;
}

export function createCoachDecisionRecord(input: CreateCoachDecisionRecordInput): CoachDecisionRecord {
  if (input.recommendedOptionId && !input.options.some((option) => option.optionId === input.recommendedOptionId)) {
    throw new Error('Recommended option must exist in the captured decision options.');
  }
  return {
    decisionId: input.decisionId,
    athleteId: input.athleteId,
    createdAt: input.createdAt,
    source: input.source,
    context: clone(input.context),
    options: clone(input.options),
    recommendedOptionId: input.recommendedOptionId,
    explanation: clone(input.explanation),
    reviewState: 'pending_outcome',
  };
}

export function recordAthleteDecision(
  record: CoachDecisionRecord,
  selection: CoachDecisionSelection,
): CoachDecisionRecord {
  if (selection.selectedOptionId && !record.options.some((option) => option.optionId === selection.selectedOptionId)) {
    throw new Error('Selected option must exist in the immutable decision snapshot.');
  }
  return { ...record, selection: clone(selection) };
}

export function attachDecisionOutcome(
  record: CoachDecisionRecord,
  outcome: CoachDecisionOutcome,
): CoachDecisionRecord {
  if (!record.selection) throw new Error('An athlete decision must be recorded before its outcome.');
  return { ...record, outcome: clone(outcome), reviewState: 'ready_for_review' };
}

export function evaluateDecisionOutcome(record: CoachDecisionRecord): string[] {
  if (!record.outcome) return ['Outcome has not been observed yet.'];
  const result: string[] = [];
  if (record.outcome.workoutCompleted === true) result.push('Selected workout option was completed.');
  if (record.outcome.workoutCompleted === false) result.push('Selected workout option was not completed.');
  if (record.outcome.protectedSessionCompleted === true) result.push('Protected session was preserved.');
  if (record.outcome.painIncreased === true) result.push('Pain increased after the selected option.');
  if (record.outcome.requiredAnotherAdjustment === true) result.push('A further adjustment was required.');
  if (record.outcome.athleteHelpful === true) result.push('Athlete reported that the adjustment was helpful.');
  return result.length ? result : ['Outcome was recorded without a directional conclusion.'];
}

function learningConfidence(similarEvidenceCount: number): DigitalTwinConfidence {
  return similarEvidenceCount >= 20 ? 'high' : similarEvidenceCount >= 5 ? 'moderate' : 'low';
}

export function deriveDecisionLearning(
  record: CoachDecisionRecord,
  similarEvidenceCount: number,
  governance?: TwinGovernanceState,
): CoachDecisionLearningResult {
  const selectedOptionId = record.selection?.selectedOptionId;
  const governanceBlocked = Boolean(
    governance && (governance.frozenParameters.length > 0 || Object.values(governance.drift).some((item) => item?.reliability === 'fallback')),
  );
  const eligibleForLearning = Boolean(record.outcome && selectedOptionId && record.reviewState !== 'excluded_from_learning' && !governanceBlocked);
  const preferenceSignals: string[] = [];
  const complianceSignals: string[] = [];
  const modelSignals: string[] = [];

  if (record.selection?.kind === 'modified' || record.selection?.kind === 'rejected') {
    preferenceSignals.push('Athlete preferred a different implementation than the recommendation.');
  }
  if (record.selection?.athleteReason) preferenceSignals.push(record.selection.athleteReason);
  if (record.outcome?.workoutCompleted === true) complianceSignals.push('Selected option was completed.');
  if (record.outcome?.workoutCompleted === false) complianceSignals.push('Selected option was not completed; cause remains separate from preference.');
  if (record.outcome?.painIncreased === true) modelSignals.push('Selected option was followed by increased pain.');
  if (record.outcome?.protectedSessionCompleted === true) modelSignals.push('Protected session was preserved after the decision.');

  return {
    generatedAt: record.outcome?.observedAt ?? record.createdAt,
    eligibleForLearning,
    observedOptionId: eligibleForLearning ? selectedOptionId : undefined,
    preferenceSignals,
    complianceSignals,
    modelSignals,
    confidence: learningConfidence(similarEvidenceCount),
    evidenceCount: similarEvidenceCount,
    safeguards: [
      'Only the selected option may receive observed-outcome evidence.',
      'Unselected options remain counterfactual predictions and are never labeled failures.',
      'Athlete overrides are preference evidence, not automatic compliance failures.',
      'Clinician restrictions, hard constraints, and athlete approval remain authoritative.',
    ],
  };
}

export function excludeDecisionFromLearning(record: CoachDecisionRecord, reason: string): CoachDecisionRecord {
  return { ...record, reviewState: 'excluded_from_learning', excludedReason: reason, learning: undefined };
}

export function markDecisionReviewed(record: CoachDecisionRecord, learning?: CoachDecisionLearningResult): CoachDecisionRecord {
  if (!record.outcome) throw new Error('Cannot review a decision before an outcome is attached.');
  return { ...record, learning: learning ? clone(learning) : record.learning, reviewState: 'reviewed' };
}

export function summarizeDecisionHistory(records: CoachDecisionRecord[]): CoachDecisionHistorySummary {
  return {
    totalDecisions: records.length,
    pendingOutcomes: records.filter((record) => record.reviewState === 'pending_outcome').length,
    reviewed: records.filter((record) => record.reviewState === 'reviewed').length,
    excludedFromLearning: records.filter((record) => record.reviewState === 'excluded_from_learning').length,
    athleteOverrides: records.filter((record) => record.selection?.kind === 'modified' || record.selection?.kind === 'rejected').length,
    recentDecisionIds: [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10).map((record) => record.decisionId),
  };
}

export function buildDecisionExplanation(record: CoachDecisionRecord): CoachDecisionLedgerExplanation {
  return clone(record.explanation);
}
