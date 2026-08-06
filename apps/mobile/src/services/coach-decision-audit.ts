import type { CoachDecisionAuditTrail, CoachDecisionReplayResult } from '@circuit/domain';

export interface CoachDecisionAuditCard { title: string; body: string; status: 'verified' | 'attention'; action: string; }
export interface CoachDecisionTimelineCard { title: string; entries: string[]; technicalDetailsAvailable: boolean; }

export function createCoachDecisionAuditCard(trail: CoachDecisionAuditTrail, replay?: CoachDecisionReplayResult): CoachDecisionAuditCard {
  const verified = trail.integrityVerified && trail.complete && (!replay || replay.deterministicMatch);
  return { title: verified ? 'How this decision was made' : 'Decision record needs review', body: verified ? 'The stored decision can be reconstructed from its evidence and policy trail.' : trail.explanation.join(' '), status: verified ? 'verified' : 'attention', action: verified ? 'View decision timeline.' : 'Do not reuse this decision until the record is reviewed.' };
}
export function createCoachDecisionTimelineCard(trail: CoachDecisionAuditTrail): CoachDecisionTimelineCard {
  return { title: 'Decision timeline', entries: trail.events.map((event) => event.summary), technicalDetailsAvailable: trail.events.some((event) => event.inputRefs.length + event.outputRefs.length + event.policyRefs.length > 0) };
}
