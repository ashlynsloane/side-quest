
import type {
  CoachDecisionRecord,
  CoachPolicy,
  CoachPolicyApplication,
  CoachPolicyConflict,
  CoachPolicyContext,
  CoachPolicyEvidence,
  CoachPolicyPriority,
  CoachPolicyRule,
  CoachScenarioScore,
  DigitalTwinConfidence,
  TwinGovernanceState,
} from '@circuit/domain';

const PRIORITY: Record<CoachPolicyPriority, number> = {
  clinician: 7,
  safety: 6,
  athlete_restriction: 5,
  protected_session: 4,
  physiological: 3,
  schedule_preference: 2,
  population_default: 1,
};

const confidenceWeight = (value: DigitalTwinConfidence): number =>
  value === 'high' ? 1 : value === 'moderate' ? 0.6 : 0.25;

const comparable = (required: string[], observed: string[]): boolean =>
  required.every((tag) => observed.includes(tag));

export function createDefaultCoachPolicy(athleteId: string, policyId = `policy-${athleteId}`): CoachPolicy {
  return {
    policyId,
    athleteId,
    rules: [],
    maxAbsoluteAdjustment: 5,
    safeguards: [
      'Policy cannot create, delete, or automatically reschedule workouts.',
      'Clinician restrictions, safety constraints, athlete restrictions, and protected sessions remain authoritative.',
      'Policy adjustments are bounded and require contextual matching.',
      'Excluded decisions and unselected scenarios cannot support policy learning.',
      'Every policy rule is auditable, reversible, and subordinate to athlete approval.',
    ],
  };
}

export function derivePolicyCandidates(records: CoachDecisionRecord[], now: string): CoachPolicyRule[] {
  const evidenceByAction = new Map<string, CoachPolicyEvidence[]>();
  for (const record of records) {
    if (record.reviewState !== 'reviewed' || !record.learning?.eligibleForLearning || !record.outcome) continue;
    const optionId = record.learning.observedOptionId;
    if (!optionId) continue;
    const option = record.options.find((item) => item.optionId === optionId);
    if (!option) continue;
    const key = option.label;
    const supporting = record.outcome.athleteHelpful === true && record.outcome.painIncreased !== true;
    const contradicting = record.outcome.painIncreased === true || record.outcome.requiredAnotherAdjustment === true;
    const evidence: CoachPolicyEvidence = {
      decisionId: record.decisionId,
      optionId,
      outcomeDirection: supporting ? 'supporting' : contradicting ? 'contradicting' : 'neutral',
      contextTags: [...record.context.athleteStateSummary],
      quality: record.learning.confidence === 'high' ? 1 : record.learning.confidence === 'moderate' ? 0.7 : 0.4,
      excluded: false,
    };
    evidenceByAction.set(key, [...(evidenceByAction.get(key) ?? []), evidence]);
  }

  return [...evidenceByAction.entries()].map(([label, evidence], index) => {
    const valid = evidence.filter((item) => !item.excluded);
    const supporting = valid.filter((item) => item.outcomeDirection === 'supporting').length;
    const contradicting = valid.filter((item) => item.outcomeDirection === 'contradicting').length;
    const count = valid.length;
    const state = count >= 8 && supporting > contradicting ? 'active' : count >= 4 && supporting > contradicting ? 'limited' : 'candidate';
    const confidence: DigitalTwinConfidence = count >= 8 ? 'high' : count >= 4 ? 'moderate' : 'low';
    return {
      ruleId: `learned-${index + 1}`,
      label,
      state,
      origin: 'observed_outcome',
      priority: 'physiological',
      requiredContextTags: valid[0]?.contextTags ?? [],
      action: { actionId: `action-${index + 1}`, actionType: label, scoreAdjustment: supporting > contradicting ? 4 : -2 },
      evidence,
      confidence,
      createdAt: now,
      updatedAt: now,
    } satisfies CoachPolicyRule;
  });
}

export function evaluatePolicyCandidate(rule: CoachPolicyRule): CoachPolicyRule {
  const valid = rule.evidence.filter((item) => !item.excluded);
  const supporting = valid.filter((item) => item.outcomeDirection === 'supporting').length;
  const contradicting = valid.filter((item) => item.outcomeDirection === 'contradicting').length;
  let state = rule.state;
  if (state !== 'frozen' && state !== 'retired') {
    if (valid.length >= 8 && supporting > contradicting * 1.5) state = 'active';
    else if (valid.length >= 4 && supporting > contradicting) state = 'limited';
    else state = 'candidate';
  }
  return { ...rule, state, confidence: valid.length >= 8 ? 'high' : valid.length >= 4 ? 'moderate' : 'low' };
}

export const activateCoachPolicyRule = (rule: CoachPolicyRule): CoachPolicyRule => ({ ...rule, state: 'active' });
export const freezeCoachPolicyRule = (rule: CoachPolicyRule): CoachPolicyRule => ({ ...rule, state: 'frozen' });
export const retireCoachPolicyRule = (rule: CoachPolicyRule): CoachPolicyRule => ({ ...rule, state: 'retired' });

export function resolvePolicyConflicts(rules: CoachPolicyRule[]): { rules: CoachPolicyRule[]; conflicts: CoachPolicyConflict[] } {
  const byAction = new Map<string, CoachPolicyRule[]>();
  for (const rule of rules) byAction.set(rule.action.actionType, [...(byAction.get(rule.action.actionType) ?? []), rule]);
  const winners: CoachPolicyRule[] = [];
  const conflicts: CoachPolicyConflict[] = [];
  for (const [actionType, group] of byAction) {
    const ordered = [...group].sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority] || a.ruleId.localeCompare(b.ruleId));
    winners.push(ordered[0]);
    if (ordered.length > 1) conflicts.push({
      conflictId: `conflict-${actionType}`,
      ruleIds: ordered.map((rule) => rule.ruleId),
      winningRuleId: ordered[0].ruleId,
      reason: `Higher-priority ${ordered[0].priority} policy prevailed deterministically.`,
    });
  }
  return { rules: winners, conflicts };
}

export function applyCoachPolicy(
  policy: CoachPolicy,
  context: CoachPolicyContext,
  scenario: CoachScenarioScore,
  governance?: TwinGovernanceState,
): CoachPolicyApplication {
  const governanceBlocked = Boolean(governance && (governance.frozenParameters.length > 0 || Object.values(governance.drift).some((item) => item?.reliability === 'fallback')));
  const eligible = policy.rules.filter((rule) =>
    rule.state !== 'retired' && rule.state !== 'frozen' &&
    comparable(rule.requiredContextTags, context.tags) &&
    (!rule.action.scenarioId || rule.action.scenarioId === scenario.scenarioId),
  );
  const resolved = resolvePolicyConflicts(eligible);
  const adjustments = governanceBlocked ? [] : resolved.rules.map((rule) => {
    const stateWeight = rule.state === 'active' ? 1 : rule.state === 'limited' ? 0.5 : 0.1;
    const requested = rule.action.scoreAdjustment * confidenceWeight(rule.confidence) * stateWeight;
    const applied = Math.max(-policy.maxAbsoluteAdjustment, Math.min(policy.maxAbsoluteAdjustment, requested));
    return {
      ruleId: rule.ruleId,
      scenarioId: scenario.scenarioId,
      requestedAdjustment: requested,
      appliedAdjustment: applied,
      confidence: rule.confidence,
      reason: `${rule.label}; matched ${rule.requiredContextTags.length} contextual tag(s).`,
    };
  });
  const total = Math.max(-policy.maxAbsoluteAdjustment, Math.min(policy.maxAbsoluteAdjustment, adjustments.reduce((sum, item) => sum + item.appliedAdjustment, 0)));
  return {
    baseScore: scenario.utilityScore,
    finalScore: scenario.utilityScore + total,
    adjustments,
    conflicts: resolved.conflicts,
    matchedRuleIds: resolved.rules.map((rule) => rule.ruleId),
    populationFallbackUsed: governanceBlocked,
    explanation: governanceBlocked
      ? ['Digital Twin governance blocked personalized policy influence; population fallback remains in use.']
      : adjustments.map((item) => `${item.ruleId}: ${item.appliedAdjustment >= 0 ? '+' : ''}${item.appliedAdjustment.toFixed(1)} points.`),
  };
}

// Counterfactual learning safeguards:
// Unselected scenarios never contribute observed outcome evidence.
// Excluded decisions and unselected scenarios cannot support policy learning.

export function summarizeCoachPolicy(policy: CoachPolicy): string[] {
  return [
    `${policy.rules.filter((rule) => rule.state === 'active').length} active rules`,
    `${policy.rules.filter((rule) => rule.state === 'limited').length} limited rules`,
    `${policy.rules.filter((rule) => rule.state === 'frozen').length} frozen rules`,
    `Maximum policy influence: ±${policy.maxAbsoluteAdjustment} points`,
  ];
}

export function explainPolicyApplication(application: CoachPolicyApplication): string[] {
  return [
    `Base scenario score: ${application.baseScore.toFixed(1)}`,
    `Final scenario score: ${application.finalScore.toFixed(1)}`,
    ...application.explanation,
    ...application.conflicts.map((conflict) => conflict.reason),
  ];
}
