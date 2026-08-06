import type {
  AdaptiveDecisionConfidence,
  CoachDecisionAction,
  CoachPreferencePolicyDecision,
  CoachPreferencePolicyInput,
  CoachPreferencePolicyResult,
} from '@circuit/domain';

const ACTION_ORDER: CoachDecisionAction[] = ['keep', 'move', 'shorten', 'replace', 'remove', 'recover', 'review'];

function evidenceIsConcerning(action: CoachDecisionAction, input: CoachPreferencePolicyInput): boolean {
  const aggregate = input.outcomeLearning?.aggregates.find((item) => item.action === action);
  return Boolean(aggregate && aggregate.confidence !== 'low' && aggregate.hurt > aggregate.helped);
}

function confidenceRank(confidence: AdaptiveDecisionConfidence): number {
  return confidence === 'high' ? 3 : confidence === 'moderate' ? 2 : 1;
}

export function applyCoachPreferencePolicy(
  input: CoachPreferencePolicyInput,
): CoachPreferencePolicyResult {
  const allowed = new Set(input.preferences.allowedActions);
  const blocked = new Set(input.preferences.blockedActions ?? []);
  const protectedSessions = new Set(input.preferences.protectedSessionIds ?? []);

  const decisions: CoachPreferencePolicyDecision[] = input.coachResult.decisions.map((decision) => {
    const reasons: string[] = [];
    let disposition: CoachPreferencePolicyDecision['disposition'] = 'approval_required';

    if (input.preferences.autonomyLevel === 'advisory_only') {
      disposition = 'review_only';
      reasons.push('Athlete preferences keep all coach recommendations advisory.');
    } else if (blocked.has(decision.action) || !allowed.has(decision.action)) {
      disposition = 'blocked';
      reasons.push(`${decision.action} is not permitted by the athlete coaching preferences.`);
    } else if (decision.sessionId && protectedSessions.has(decision.sessionId)) {
      disposition = 'review_only';
      reasons.push('The affected session is explicitly protected by the athlete.');
    } else if (evidenceIsConcerning(decision.action, input)) {
      disposition = 'review_only';
      reasons.push('Moderate-or-higher outcome evidence is unfavorable for this action, so manual review is required.');
    } else if (input.preferences.autonomyLevel === 'ask_before_changes') {
      disposition = 'approval_required';
      reasons.push('The athlete requires approval before any plan change.');
    } else {
      const maximumPriority = input.preferences.maximumAutomaticPriority ?? 'low';
      const priorityAllowed = decision.priority === 'low' || (maximumPriority === 'normal' && decision.priority === 'normal');
      const confidenceAllowed = confidenceRank(decision.confidence) >= confidenceRank('moderate');
      const actionMinor = decision.action === 'keep' || decision.action === 'move' || decision.action === 'shorten';
      if (priorityAllowed && confidenceAllowed && actionMinor && !decision.requiresAthleteApproval) {
        disposition = 'allowed';
        reasons.push('This is a permitted minor adjustment within the athlete autonomy boundary.');
      } else {
        disposition = 'approval_required';
        reasons.push('The recommendation exceeds the athlete automatic-change boundary.');
      }
    }

    if (decision.priority === 'critical' || decision.priority === 'high') {
      if (disposition === 'allowed') disposition = 'approval_required';
      reasons.push('High-priority and critical decisions cannot be applied silently.');
    }

    return { decision, disposition, policyReasons: reasons };
  });

  const ids = (kind: CoachPreferencePolicyDecision['disposition']) =>
    decisions.filter((item) => item.disposition === kind).map((item) => item.decision.decisionId);

  return {
    generatedAt: input.generatedAt,
    autonomyLevel: input.preferences.autonomyLevel,
    decisions,
    allowedDecisionIds: ids('allowed'),
    approvalRequiredDecisionIds: ids('approval_required'),
    blockedDecisionIds: ids('blocked'),
    reviewOnlyDecisionIds: ids('review_only'),
    safeguards: [
      'Athlete preferences constrain coaching automation but never suppress safety warnings.',
      'Pain, injury, illness, and medical restrictions remain higher priority than preference settings.',
      'High-priority and critical decisions always require athlete review.',
      'Protected sessions cannot be silently changed.',
      'Learned outcome history can increase review requirements but cannot authorize a blocked action.',
    ],
  };
}

export const coachPreferenceActionOrder = ACTION_ORDER;
