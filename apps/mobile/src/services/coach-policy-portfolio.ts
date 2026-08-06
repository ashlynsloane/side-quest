import type { CoachPolicyPortfolio, CoachPolicyPortfolioDecision, CoachPolicyConsolidation, CoachPolicyScopeAssessment } from '@circuit/domain';

export interface CoachPolicyPortfolioCard { title: string; totalRules: number; activeRules: number; inactiveAuditableRules: number; safeguards: string[]; }
export interface CoachPolicyInfluenceSummary { considered: number; relevant: number; usedRuleIds: string[]; suppressed: Array<{ ruleId: string; reason: string }>; fallbackUsed: boolean; totalAdjustment: number; }
export interface CoachPolicyMergeCard { sourceRuleIds: string[]; mergedLabel: string; requiresAthleteReview: boolean; reversible: true; reasons: string[]; }
export interface CoachPolicyScopeCard { ruleId: string; rating: CoachPolicyScopeAssessment['rating']; reasons: string[]; }

export function buildPolicyPortfolioCard(portfolio: CoachPolicyPortfolio): CoachPolicyPortfolioCard {
  return { title: 'Your coaching rules', totalRules: portfolio.entries.length, activeRules: portfolio.entries.filter((entry) => entry.state === 'active').length, inactiveAuditableRules: portfolio.entries.filter((entry) => ['suspended', 'retired', 'merged'].includes(entry.state)).length, safeguards: [...portfolio.safeguards] };
}
export function buildPolicyInfluenceSummary(decision: CoachPolicyPortfolioDecision): CoachPolicyInfluenceSummary {
  return { considered: decision.consideredPolicyIds.length, relevant: decision.applicablePolicyIds.length, usedRuleIds: [...decision.selectedPolicyIds], suppressed: decision.suppressedPolicyIds.map((ruleId) => ({ ruleId, reason: decision.suppressionReasons[ruleId] ?? 'governance_suspension' })), fallbackUsed: decision.fallbackUsed, totalAdjustment: decision.totalAdjustment };
}
export function buildPolicyMergeCard(consolidation: CoachPolicyConsolidation): CoachPolicyMergeCard { return { sourceRuleIds: [...consolidation.sourceRuleIds], mergedLabel: consolidation.mergedRule.label, requiresAthleteReview: consolidation.requiresAthleteReview, reversible: true, reasons: [...consolidation.reasons] }; }
export function buildPolicyScopeCard(scope: CoachPolicyScopeAssessment): CoachPolicyScopeCard { return { ruleId: scope.ruleId, rating: scope.rating, reasons: [...scope.reasons] }; }
