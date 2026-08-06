import { describe, expect, it } from 'vitest';
import type { UnifiedCoachingOsDecision } from '@circuit/domain';
import { buildCoachDecisionAuditTrail, createCoachDecisionAuditEvent, replayCoachDecision } from '../src/coach-decision-audit';

const first = createCoachDecisionAuditEvent({ eventId: 'e1', decisionId: 'd1', occurredAt: '2026-07-29T12:00:00Z', sequence: 1, kind: 'request_received', actor: 'system', summary: 'Request received', inputRefs: ['request-1'], outputRefs: [], policyRefs: [] });
const second = createCoachDecisionAuditEvent({ eventId: 'e2', decisionId: 'd1', occurredAt: '2026-07-29T12:00:01Z', sequence: 2, kind: 'candidate_selected', actor: 'system', summary: 'Recovery option selected', inputRefs: [], outputRefs: ['recovery'], policyRefs: ['policy-1'], previousEventHash: first.eventHash });
const expected: UnifiedCoachingOsDecision = { decisionId: 'd1', requestId: 'r1', disposition: 'recommend', selectedCandidateId: 'recovery', eligibleCandidateIds: ['recovery'], rejectedCandidateIds: [], stageResults: [], automaticPlanChangeAllowed: false, athleteConfirmationRequired: true, informationRequested: [], explanation: [], provenance: [], auditable: true, governanceRequired: true };

describe('coach decision audit replay', () => {
  it('verifies and replays an intact decision chain', () => {
    const trail = buildCoachDecisionAuditTrail('d1', [second, first]);
    expect(trail.integrityVerified).toBe(true);
    expect(replayCoachDecision(trail, expected).deterministicMatch).toBe(true);
  });
  it('detects a modified event', () => {
    const trail = buildCoachDecisionAuditTrail('d1', [{ ...first, summary: 'Changed' }, second]);
    expect(trail.integrityVerified).toBe(false);
  });
});
