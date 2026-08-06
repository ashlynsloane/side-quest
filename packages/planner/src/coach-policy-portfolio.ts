import type {
  CoachPolicyPortfolio,
  CoachPolicyPortfolioDecision,
  CoachPolicyPortfolioEntry,
  CoachPolicyRelationship,
  CoachPolicyRule,
  CoachPolicyContext,
  CoachPolicyScopeAssessment,
  CoachPolicyConsolidation,
  CoachPolicyContradiction,
  CoachPolicyPortfolioReview,
  CoachPolicyPriority,
  DigitalTwinConfidence,
} from '@circuit/domain';

const PRIORITY: Record<CoachPolicyPriority, number> = {
  clinician: 7, safety: 6, athlete_restriction: 5, protected_session: 4,
  physiological: 3, schedule_preference: 2, population_default: 1,
};

const confidenceWeight = (value: DigitalTwinConfidence): number => value === 'high' ? 3 : value === 'moderate' ? 2 : 1;
const evidenceStrength = (rule: CoachPolicyRule): number => rule.evidence.filter((e) => !e.excluded).length + confidenceWeight(rule.confidence);
const sameDimension = (a: CoachPolicyRule, b: CoachPolicyRule): boolean => a.action.actionType === b.action.actionType;
const contextOverlap = (a: CoachPolicyRule, b: CoachPolicyRule): string[] => a.requiredContextTags.filter((tag) => b.requiredContextTags.includes(tag));
const applicable = (rule: CoachPolicyRule, context: CoachPolicyContext): boolean => rule.requiredContextTags.every((tag) => context.tags.includes(tag));
const sign = (value: number): number => value === 0 ? 0 : value > 0 ? 1 : -1;

export function createCoachPolicyPortfolio(athleteId: string, portfolioId = `portfolio-${athleteId}`): CoachPolicyPortfolio {
  return {
    portfolioId, athleteId, entries: [], maxEvaluatedPerDecision: 8, maxInfluentialPerDecision: 3,
    maxPerScoreDimension: 1, audit: [],
    safeguards: [
      'Duplicate policies cannot stack equivalent adjustments.',
      'Safety, clinician constraints, athlete boundaries, and protected sessions outrank learned policies.',
      'Shadow policies never influence the displayed recommendation.',
      'Unresolved blocking conflicts trigger population fallback and cannot automatically change the plan.',
      'Consolidation is reversible and preserves evidence provenance.',
    ],
  };
}

export function addPolicyToPortfolio(portfolio: CoachPolicyPortfolio, rule: CoachPolicyRule, occurredAt: string): CoachPolicyPortfolio {
  const entry: CoachPolicyPortfolioEntry = { rule, state: rule.state === 'active' ? 'active' : rule.state === 'limited' ? 'limited' : 'candidate', sourceRuleIds: [rule.ruleId], scopeRating: 'narrow' };
  return { ...portfolio, entries: [...portfolio.entries, entry], audit: [...portfolio.audit, { eventId: `added-${rule.ruleId}-${occurredAt}`, ruleIds: [rule.ruleId], eventType: 'added', occurredAt, reasons: ['Policy added to governed portfolio.'] }] };
}

export function assessPolicyRelationship(left: CoachPolicyRule, right: CoachPolicyRule): CoachPolicyRelationship {
  const overlap = contextOverlap(left, right);
  const sameAction = sameDimension(left, right);
  if (sameAction && sign(left.action.scoreAdjustment) !== sign(right.action.scoreAdjustment)) return { leftRuleId: left.ruleId, rightRuleId: right.ruleId, type: 'contradictory', severity: PRIORITY[left.priority] === PRIORITY[right.priority] ? 'blocking' : 'resolvable', reasons: ['Rules modify the same action dimension in opposing directions.'] };
  if (sameAction && overlap.length === Math.min(left.requiredContextTags.length, right.requiredContextTags.length)) return { leftRuleId: left.ruleId, rightRuleId: right.ruleId, type: left.requiredContextTags.length === right.requiredContextTags.length ? 'duplicate' : left.requiredContextTags.length < right.requiredContextTags.length ? 'subsumes' : 'subsumed_by', severity: 'resolvable', reasons: ['Rules share an action and materially equivalent context.'] };
  if (sameAction && overlap.length > 0) return { leftRuleId: left.ruleId, rightRuleId: right.ruleId, type: 'overlapping', severity: 'resolvable', reasons: ['Rules may affect the same score dimension in overlapping contexts.'] };
  return { leftRuleId: left.ruleId, rightRuleId: right.ruleId, type: 'independent', severity: 'informational', reasons: ['No material portfolio interaction detected.'] };
}

export function detectPolicyOverlaps(rules: CoachPolicyRule[]): CoachPolicyRelationship[] {
  const result: CoachPolicyRelationship[] = [];
  for (let i = 0; i < rules.length; i += 1) for (let j = i + 1; j < rules.length; j += 1) {
    const relationship = assessPolicyRelationship(rules[i]!, rules[j]!);
    if (relationship.type !== 'independent' && relationship.type !== 'contradictory') result.push(relationship);
  }
  return result;
}

export function detectPolicyContradictions(rules: CoachPolicyRule[]): CoachPolicyContradiction[] {
  const result: CoachPolicyContradiction[] = [];
  for (let i = 0; i < rules.length; i += 1) for (let j = i + 1; j < rules.length; j += 1) {
    const relationship = assessPolicyRelationship(rules[i]!, rules[j]!);
    if (relationship.type !== 'contradictory') continue;
    const left = rules[i]!; const right = rules[j]!;
    const leftRank = PRIORITY[left.priority]; const rightRank = PRIORITY[right.priority];
    result.push({ ...relationship, blocking: relationship.severity === 'blocking', winningRuleId: leftRank === rightRank ? undefined : leftRank > rightRank ? left.ruleId : right.ruleId });
  }
  return result;
}

export function assessPolicyScope(rule: CoachPolicyRule): CoachPolicyScopeAssessment {
  const valid = rule.evidence.filter((item) => !item.excluded);
  const contexts = new Set(valid.flatMap((item) => item.contextTags));
  const rating = valid.length === 0 ? 'unsupported' : valid.length < 4 ? 'narrow' : rule.requiredContextTags.length === 0 && contexts.size > 0 ? 'overgeneralized' : valid.length >= 10 ? 'appropriate' : 'broad';
  return { ruleId: rule.ruleId, rating, comparableContexts: valid.length, distinctPhases: new Set(valid.flatMap((item) => item.contextTags.filter((tag) => tag.startsWith('phase:')))).size, distinctSessionTypes: new Set(valid.flatMap((item) => item.contextTags.filter((tag) => tag.startsWith('session:')))).size, reasons: [rating === 'overgeneralized' ? 'Observed evidence is contextual but the rule has no contextual boundary.' : 'Scope is bounded by observed comparable evidence.'] };
}

export function rankPortfolioPolicies(entries: CoachPolicyPortfolioEntry[]): CoachPolicyPortfolioEntry[] {
  return [...entries].sort((a, b) => PRIORITY[b.rule.priority] - PRIORITY[a.rule.priority] || evidenceStrength(b.rule) - evidenceStrength(a.rule) || a.rule.ruleId.localeCompare(b.rule.ruleId));
}

export function selectApplicablePortfolioPolicies(portfolio: CoachPolicyPortfolio, context: CoachPolicyContext, maxAbsoluteAdjustment: number): CoachPolicyPortfolioDecision {
  const considered = rankPortfolioPolicies(portfolio.entries).slice(0, portfolio.maxEvaluatedPerDecision);
  const applicableEntries = considered.filter((entry) => applicable(entry.rule, context) && !['suspended', 'retired', 'merged'].includes(entry.state));
  const conflicts = detectPolicyContradictions(applicableEntries.map((entry) => entry.rule));
  const blocking = conflicts.filter((item) => item.blocking && !item.winningRuleId);
  const suppressionReasons: Record<string, CoachPolicyPortfolioDecision['suppressionReasons'][string]> = {};
  const selected: CoachPolicyPortfolioEntry[] = [];
  const usedDimensions = new Set<string>();
  for (const entry of applicableEntries) {
    if (entry.state === 'shadow' || entry.rule.state === 'candidate') { suppressionReasons[entry.rule.ruleId] = 'shadow_only'; continue; }
    if (entry.scopeRating === 'overgeneralized' || entry.scopeRating === 'unsupported') { suppressionReasons[entry.rule.ruleId] = 'overbroad_scope'; continue; }
    if (usedDimensions.has(entry.rule.action.actionType)) { suppressionReasons[entry.rule.ruleId] = 'duplicate_adjustment'; continue; }
    if (selected.length >= portfolio.maxInfluentialPerDecision) { suppressionReasons[entry.rule.ruleId] = 'portfolio_budget'; continue; }
    if (conflicts.some((conflict) => [conflict.leftRuleId, conflict.rightRuleId].includes(entry.rule.ruleId) && conflict.winningRuleId && conflict.winningRuleId !== entry.rule.ruleId)) { suppressionReasons[entry.rule.ruleId] = 'lower_authority'; continue; }
    selected.push(entry); usedDimensions.add(entry.rule.action.actionType);
  }
  const raw = selected.reduce((sum, entry) => sum + entry.rule.action.scoreAdjustment, 0);
  const totalAdjustment = Math.max(-maxAbsoluteAdjustment, Math.min(maxAbsoluteAdjustment, raw));
  const fallbackUsed = blocking.length > 0;
  return { consideredPolicyIds: considered.map((entry) => entry.rule.ruleId), applicablePolicyIds: applicableEntries.map((entry) => entry.rule.ruleId), selectedPolicyIds: fallbackUsed ? [] : selected.map((entry) => entry.rule.ruleId), suppressedPolicyIds: Object.keys(suppressionReasons), suppressionReasons, unresolvedConflicts: blocking, totalAdjustment: fallbackUsed ? 0 : totalAdjustment, portfolioConfidence: selected.some((entry) => entry.rule.confidence === 'high') ? 'high' : selected.some((entry) => entry.rule.confidence === 'moderate') ? 'moderate' : 'low', fallbackUsed };
}

export function consolidatePolicies(left: CoachPolicyRule, right: CoachPolicyRule, mergedRuleId: string, now: string): CoachPolicyConsolidation {
  const requiresAthleteReview = left.origin === 'athlete_preference' || right.origin === 'athlete_preference';
  const mergedRule: CoachPolicyRule = { ...left, ruleId: mergedRuleId, label: `${left.label} / ${right.label}`, requiredContextTags: [...new Set([...left.requiredContextTags, ...right.requiredContextTags])], evidence: [...left.evidence, ...right.evidence], action: { ...left.action, actionId: `merged-${left.action.actionId}-${right.action.actionId}`, scoreAdjustment: Math.abs(left.action.scoreAdjustment) <= Math.abs(right.action.scoreAdjustment) ? left.action.scoreAdjustment : right.action.scoreAdjustment }, confidence: evidenceStrength(left) >= evidenceStrength(right) ? left.confidence : right.confidence, createdAt: now, updatedAt: now };
  return { consolidationId: `consolidation-${mergedRuleId}`, sourceRuleIds: [left.ruleId, right.ruleId], mergedRule, reversible: true, requiresAthleteReview, reasons: ['Evidence provenance and source rule IDs are preserved.', 'The stricter adjustment bound is retained.'] };
}

export function constrainOverbroadPolicy(entry: CoachPolicyPortfolioEntry): CoachPolicyPortfolioEntry { return { ...entry, state: 'constrained', scopeRating: 'overgeneralized' }; }
export function suspendConflictingPolicy(entry: CoachPolicyPortfolioEntry): CoachPolicyPortfolioEntry { return { ...entry, state: 'suspended' }; }
export function retireRedundantPolicy(entry: CoachPolicyPortfolioEntry): CoachPolicyPortfolioEntry { return { ...entry, state: 'retired' }; }

export function reviewPolicyPortfolio(entry: CoachPolicyPortfolioEntry, now: string): CoachPolicyPortfolioReview {
  const stale = Boolean(entry.lastApplicableAt && Date.parse(now) - Date.parse(entry.lastApplicableAt) > 1000 * 60 * 60 * 24 * 120);
  const athleteReview = entry.rule.origin === 'athlete_preference' && (entry.state === 'merged' || entry.scopeRating === 'overgeneralized');
  return { ruleId: entry.rule.ruleId, outcome: athleteReview ? 'request_athlete_review' : stale ? 'suspend' : entry.scopeRating === 'overgeneralized' ? 'narrow' : 'retain', requiresAthleteReview: athleteReview, reasons: athleteReview ? ['Athlete-declared preferences cannot be merged or broadened without review.'] : stale ? ['Policy has not applied in a comparable context recently.'] : ['Policy remains contextually supported.'] };
}

export function summarizePolicyPortfolio(portfolio: CoachPolicyPortfolio): string[] { return [`${portfolio.entries.length} policy rule(s) are governed.`, `${portfolio.entries.filter((entry) => entry.state === 'active').length} active rule(s).`, `${portfolio.entries.filter((entry) => ['suspended', 'retired'].includes(entry.state)).length} inactive rule(s) remain auditable.`]; }
export function explainPortfolioDecision(decision: CoachPolicyPortfolioDecision): string[] { return [`${decision.applicablePolicyIds.length} coaching rule(s) were relevant.`, `Used: ${decision.selectedPolicyIds.join(', ') || 'none'}.`, ...decision.suppressedPolicyIds.map((id) => `Not used: ${id} — ${decision.suppressionReasons[id]}.`), decision.fallbackUsed ? 'A blocking conflict triggered fallback; no learned policy changed the recommendation.' : `Total personalized adjustment: ${decision.totalAdjustment}.`]; }
