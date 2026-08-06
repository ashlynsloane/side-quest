import type { CoachPolicyRelease, CoachPolicyReleaseGate, CoachPolicyReleaseHealth, CoachPolicyRollbackPlan } from '@circuit/domain';

export interface CoachPolicyReleaseCard { title: string; version: number; state: CoachPolicyRelease['state']; ruleCount: number; athleteApproved: boolean; reasons: string[]; }
export interface CoachPolicyReleaseHealthCard { status: 'healthy' | 'needs_review'; evaluatedDecisions: number; reasons: string[]; }
export interface CoachPolicyReleaseGateCard { action: string; allowed: boolean; requiresAthleteApproval: boolean; reasons: string[]; }
export interface CoachPolicyRollbackCard { fromReleaseId: string; toReleaseId: string; reversible: true; preservesAuditHistory: true; reasons: string[]; }

export const buildPolicyReleaseCard = (release: CoachPolicyRelease): CoachPolicyReleaseCard => ({ title: `Coaching policy release ${release.version}`, version: release.version, state: release.state, ruleCount: release.snapshot.ruleIds.length, athleteApproved: release.athleteApproved, reasons: [...release.reasons] });
export const buildPolicyReleaseHealthCard = (health: CoachPolicyReleaseHealth): CoachPolicyReleaseHealthCard => ({ status: health.healthy ? 'healthy' : 'needs_review', evaluatedDecisions: health.evaluatedDecisions, reasons: [...health.reasons] });
export const buildPolicyReleaseGateCard = (gate: CoachPolicyReleaseGate): CoachPolicyReleaseGateCard => ({ action: gate.requestedDecision, allowed: gate.allowed, requiresAthleteApproval: gate.requiresAthleteApproval, reasons: [...gate.reasons] });
export const buildPolicyRollbackCard = (plan: CoachPolicyRollbackPlan): CoachPolicyRollbackCard => ({ fromReleaseId: plan.fromReleaseId, toReleaseId: plan.toReleaseId, reversible: true, preservesAuditHistory: true, reasons: [...plan.reasons] });
