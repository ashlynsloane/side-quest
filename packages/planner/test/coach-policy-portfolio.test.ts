import { describe, expect, test } from 'vitest';
import type { CoachPolicyRule } from '@circuit/domain';
import { addPolicyToPortfolio, assessPolicyRelationship, consolidatePolicies, createCoachPolicyPortfolio, selectApplicablePortfolioPolicies } from '../src/coach-policy-portfolio';

const rule = (id: string, adjustment: number, priority: CoachPolicyRule['priority'] = 'physiological', state: CoachPolicyRule['state'] = 'active'): CoachPolicyRule => ({ ruleId: id, label: id, state, origin: 'observed_outcome', priority, requiredContextTags: ['fatigue:high'], action: { actionId: `a-${id}`, actionType: 'recovery', scoreAdjustment: adjustment }, evidence: [{ decisionId: `d-${id}`, optionId: id, outcomeDirection: 'supporting', contextTags: ['fatigue:high'], quality: 1, excluded: false }], confidence: 'moderate', createdAt: '2026-07-29', updatedAt: '2026-07-29' });

describe('coach policy portfolio', () => {
  test('duplicate rules do not stack equivalent adjustments', () => {
    let portfolio = createCoachPolicyPortfolio('athlete');
    portfolio = addPolicyToPortfolio(portfolio, rule('strong', 4), '2026-07-29');
    portfolio = addPolicyToPortfolio(portfolio, rule('duplicate', 3), '2026-07-29');
    const decision = selectApplicablePortfolioPolicies(portfolio, { tags: ['fatigue:high'], protectedSessionIds: [], clinicianRestrictions: [], athleteRestrictions: [] }, 5);
    expect(decision.selectedPolicyIds).toHaveLength(1);
    expect(decision.totalAdjustment).toBeLessThanOrEqual(5);
    expect(Object.values(decision.suppressionReasons)).toContain('duplicate_adjustment');
  });
  test('contradictions honor authoritative priority', () => {
    const learned = rule('learned', 4);
    const clinician = rule('clinician', -4, 'clinician');
    expect(assessPolicyRelationship(learned, clinician).type).toBe('contradictory');
    let portfolio = addPolicyToPortfolio(createCoachPolicyPortfolio('athlete'), learned, '2026-07-29');
    portfolio = addPolicyToPortfolio(portfolio, clinician, '2026-07-29');
    const decision = selectApplicablePortfolioPolicies(portfolio, { tags: ['fatigue:high'], protectedSessionIds: [], clinicianRestrictions: ['clinician'], athleteRestrictions: [] }, 5);
    expect(decision.selectedPolicyIds).toContain('clinician');
    expect(decision.selectedPolicyIds).not.toContain('learned');
  });
  test('shadow rules remain non-influential', () => {
    const shadow = rule('shadow', 4, 'physiological', 'candidate');
    let portfolio = addPolicyToPortfolio(createCoachPolicyPortfolio('athlete'), shadow, '2026-07-29');
    portfolio = { ...portfolio, entries: portfolio.entries.map((entry) => ({ ...entry, state: 'shadow' as const })) };
    const decision = selectApplicablePortfolioPolicies(portfolio, { tags: ['fatigue:high'], protectedSessionIds: [], clinicianRestrictions: [], athleteRestrictions: [] }, 5);
    expect(decision.totalAdjustment).toBe(0);
  });
  test('consolidation preserves source ids and requires review for athlete preference', () => {
    const athleteRule = { ...rule('athlete-rule', 4), origin: 'athlete_preference' as const };
    const merged = consolidatePolicies(athleteRule, rule('other', 3), 'merged', '2026-07-29');
    expect(merged.sourceRuleIds).toEqual(['athlete-rule', 'other']);
    expect(merged.reversible).toBe(true);
    expect(merged.requiresAthleteReview).toBe(true);
  });
});
