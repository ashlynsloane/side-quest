import { describe, expect, test } from 'vitest';
import type { CoachPolicyPortfolio, CoachPolicyReleaseRegistry } from '@circuit/domain';
import { applyPolicyRollback, assessPolicyReleaseHealth, buildPolicyRollbackPlan, createPolicyRelease, createPolicyReleaseSnapshot, evaluatePolicyReleaseGate, transitionPolicyRelease } from '../src/coach-policy-release';

const portfolio: CoachPolicyPortfolio = { portfolioId: 'p', athleteId: 'a', entries: [], maxEvaluatedPerDecision: 8, maxInfluentialPerDecision: 3, maxPerScoreDimension: 1, audit: [], safeguards: [] };

describe('coach policy release governance', () => {
  test('draft advances through shadow and canary before activation', () => {
    let registry: CoachPolicyReleaseRegistry = { portfolioId: 'p', releases: [], audit: [] };
    registry = createPolicyRelease(registry, createPolicyReleaseSnapshot(portfolio, 's1', '2026-07-29'), 'r1', '2026-07-29');
    const health = assessPolicyReleaseHealth('r1', { evaluatedDecisions: 3, harmfulOutcomes: 0, blockingConflicts: 0, driftDetected: false, missingEvidenceRate: 0, athleteRejectionRate: 0 });
    let release = registry.releases[0]!;
    release = transitionPolicyRelease(release, 'advance_to_shadow', evaluatePolicyReleaseGate(release, health, 'advance_to_shadow'), '2026-07-29');
    release = transitionPolicyRelease(release, 'advance_to_canary', evaluatePolicyReleaseGate(release, health, 'advance_to_canary'), '2026-07-29');
    expect(evaluatePolicyReleaseGate(release, health, 'activate').allowed).toBe(false);
    release = { ...release, athleteApproved: true };
    expect(evaluatePolicyReleaseGate(release, health, 'activate').allowed).toBe(true);
  });
  test('harm and drift block promotion', () => {
    const health = assessPolicyReleaseHealth('r', { evaluatedDecisions: 5, harmfulOutcomes: 1, blockingConflicts: 0, driftDetected: true, missingEvidenceRate: 0, athleteRejectionRate: 0 });
    expect(health.healthy).toBe(false);
  });
  test('rollback restores prior active release and preserves audit', () => {
    const registry: CoachPolicyReleaseRegistry = { portfolioId: 'p', activeReleaseId: 'r2', audit: [], releases: [
      { releaseId: 'r1', portfolioId: 'p', version: 1, state: 'paused', snapshot: createPolicyReleaseSnapshot(portfolio, 's1', '2026-07-29'), athleteApproved: true, reasons: [], safeguards: [] },
      { releaseId: 'r2', portfolioId: 'p', version: 2, state: 'active', snapshot: createPolicyReleaseSnapshot(portfolio, 's2', '2026-07-29'), previousReleaseId: 'r1', athleteApproved: true, reasons: [], safeguards: [] },
    ] };
    const plan = buildPolicyRollbackPlan(registry, 'r2')!;
    const rolled = applyPolicyRollback(registry, plan, '2026-07-29');
    expect(rolled.activeReleaseId).toBe('r1');
    expect(rolled.audit).toHaveLength(1);
    expect(plan.preservesAuditHistory).toBe(true);
  });
});
