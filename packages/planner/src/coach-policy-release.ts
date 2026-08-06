import type {
  CoachPolicyPortfolio,
  CoachPolicyRelease,
  CoachPolicyReleaseAuditEvent,
  CoachPolicyReleaseDecision,
  CoachPolicyReleaseGate,
  CoachPolicyReleaseHealth,
  CoachPolicyReleaseRegistry,
  CoachPolicyReleaseSnapshot,
  CoachPolicyRollbackPlan,
} from '@circuit/domain';

const stableHash = (values: string[]): string => values.slice().sort().join('|');

export function createPolicyReleaseSnapshot(portfolio: CoachPolicyPortfolio, snapshotId: string, createdAt: string, sourceReleaseId?: string): CoachPolicyReleaseSnapshot {
  const ruleIds = portfolio.entries.filter((entry) => !['retired', 'merged'].includes(entry.state)).map((entry) => entry.rule.ruleId).sort();
  return { snapshotId, portfolioId: portfolio.portfolioId, ruleIds, createdAt, portfolioHash: stableHash(ruleIds), sourceReleaseId };
}

export function createPolicyRelease(registry: CoachPolicyReleaseRegistry, snapshot: CoachPolicyReleaseSnapshot, releaseId: string, now: string): CoachPolicyReleaseRegistry {
  const version = registry.releases.reduce((max, release) => Math.max(max, release.version), 0) + 1;
  const release: CoachPolicyRelease = {
    releaseId, portfolioId: registry.portfolioId, version, state: 'draft', snapshot,
    previousReleaseId: registry.activeReleaseId, athleteApproved: false, reasons: ['Release created from an immutable policy snapshot.'],
    safeguards: ['Shadow and canary releases cannot automatically change the plan.', 'Activation requires athlete approval for inferred preference changes.', 'Rollback preserves audit history and restores a known prior snapshot.'],
  };
  const event: CoachPolicyReleaseAuditEvent = { eventId: `created-${releaseId}-${now}`, releaseId, eventType: 'created', occurredAt: now, actor: 'system', reasons: [...release.reasons] };
  return { ...registry, releases: [...registry.releases, release], audit: [...registry.audit, event] };
}

export function assessPolicyReleaseHealth(releaseId: string, input: Omit<CoachPolicyReleaseHealth, 'releaseId' | 'healthy' | 'reasons'>): CoachPolicyReleaseHealth {
  const reasons: string[] = [];
  if (input.harmfulOutcomes > 0) reasons.push('Harmful outcomes were observed.');
  if (input.blockingConflicts > 0) reasons.push('Blocking policy conflicts remain unresolved.');
  if (input.driftDetected) reasons.push('Digital Twin drift is active.');
  if (input.missingEvidenceRate > 0.4) reasons.push('Too much outcome evidence is missing.');
  if (input.athleteRejectionRate > 0.5) reasons.push('The athlete rejected most affected recommendations.');
  const healthy = reasons.length === 0 && input.evaluatedDecisions >= 3;
  if (input.evaluatedDecisions < 3) reasons.push('Insufficient evaluated decisions for promotion.');
  return { releaseId, ...input, healthy, reasons };
}

export function evaluatePolicyReleaseGate(release: CoachPolicyRelease, health: CoachPolicyReleaseHealth, requestedDecision: CoachPolicyReleaseDecision): CoachPolicyReleaseGate {
  const reasons: string[] = [];
  const requiresAthleteApproval = requestedDecision === 'activate';
  if (['advance_to_canary', 'activate'].includes(requestedDecision) && !health.healthy) reasons.push(...health.reasons);
  if (requestedDecision === 'activate' && !release.athleteApproved) reasons.push('Athlete approval is required before personalized policy activation.');
  if (requestedDecision === 'activate' && release.state !== 'canary') reasons.push('Only a canary release may become active.');
  if (requestedDecision === 'advance_to_canary' && release.state !== 'shadow') reasons.push('Only a shadow release may enter canary evaluation.');
  if (requestedDecision === 'advance_to_shadow' && release.state !== 'draft') reasons.push('Only a draft release may enter shadow mode.');
  return { releaseId: release.releaseId, requestedDecision, allowed: reasons.length === 0, requiresAthleteApproval, reasons };
}

export function transitionPolicyRelease(release: CoachPolicyRelease, decision: CoachPolicyReleaseDecision, gate: CoachPolicyReleaseGate, now: string): CoachPolicyRelease {
  if (!gate.allowed) return { ...release, reasons: [...release.reasons, ...gate.reasons] };
  const state = decision === 'advance_to_shadow' ? 'shadow' : decision === 'advance_to_canary' ? 'canary' : decision === 'activate' ? 'active' : decision === 'pause' ? 'paused' : decision === 'rollback' ? 'rolled_back' : decision === 'retire' ? 'retired' : release.state;
  return { ...release, state, activatedAt: decision === 'activate' ? now : release.activatedAt, pausedAt: decision === 'pause' ? now : release.pausedAt, rolledBackAt: decision === 'rollback' ? now : release.rolledBackAt, reasons: [...release.reasons, `Release transition approved: ${decision}.`] };
}

export function buildPolicyRollbackPlan(registry: CoachPolicyReleaseRegistry, fromReleaseId: string): CoachPolicyRollbackPlan | undefined {
  const from = registry.releases.find((release) => release.releaseId === fromReleaseId);
  if (!from?.previousReleaseId) return undefined;
  const target = registry.releases.find((release) => release.releaseId === from.previousReleaseId);
  if (!target) return undefined;
  return { rollbackId: `rollback-${from.releaseId}-to-${target.releaseId}`, fromReleaseId: from.releaseId, toReleaseId: target.releaseId, reversible: true, preservesAuditHistory: true, reasons: ['Restore the prior known release without deleting the failed release or its evidence.'] };
}

export function applyPolicyRollback(registry: CoachPolicyReleaseRegistry, plan: CoachPolicyRollbackPlan, now: string): CoachPolicyReleaseRegistry {
  const releases = registry.releases.map((release) => release.releaseId === plan.fromReleaseId ? { ...release, state: 'rolled_back' as const, rolledBackAt: now } : release.releaseId === plan.toReleaseId ? { ...release, state: 'active' as const, activatedAt: release.activatedAt ?? now } : release);
  const event: CoachPolicyReleaseAuditEvent = { eventId: `${plan.rollbackId}-${now}`, releaseId: plan.fromReleaseId, eventType: 'rolled_back', occurredAt: now, actor: 'system', reasons: [...plan.reasons] };
  return { ...registry, releases, activeReleaseId: plan.toReleaseId, audit: [...registry.audit, event] };
}

export function summarizePolicyRelease(release: CoachPolicyRelease, health?: CoachPolicyReleaseHealth): string[] {
  return [`Policy release ${release.version} is ${release.state}.`, `Snapshot contains ${release.snapshot.ruleIds.length} governed rules.`, ...(health ? health.reasons : []), 'No release transition has automatic plan authority.'];
}
