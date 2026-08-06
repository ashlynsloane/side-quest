
import type { CoachPolicy, CoachPolicyApplication, CoachPolicyRule } from '@circuit/domain';

export interface CoachPolicyRuleCard {
  id: string;
  title: string;
  state: CoachPolicyRule['state'];
  origin: CoachPolicyRule['origin'];
  confidence: CoachPolicyRule['confidence'];
  evidenceCount: number;
  scoreImpact: number;
}

export interface CoachPolicyExplanation {
  headline: string;
  reasons: string[];
  scoreImpact: number;
  populationFallbackUsed: boolean;
}

export function buildCoachPolicyCards(policy: CoachPolicy): CoachPolicyRuleCard[] {
  return policy.rules.map((rule) => ({
    id: rule.ruleId,
    title: rule.label,
    state: rule.state,
    origin: rule.origin,
    confidence: rule.confidence,
    evidenceCount: rule.evidence.filter((item) => !item.excluded).length,
    scoreImpact: rule.action.scoreAdjustment,
  }));
}

export function buildCoachPolicyExplanation(application: CoachPolicyApplication): CoachPolicyExplanation {
  const scoreImpact = application.finalScore - application.baseScore;
  return {
    headline: application.populationFallbackUsed ? 'Using conservative defaults' : 'How your coach adapted this recommendation',
    reasons: application.explanation,
    scoreImpact,
    populationFallbackUsed: application.populationFallbackUsed,
  };
}
