import { describe, expect, it } from 'vitest';
import type { UnifiedCoachCandidate, UnifiedCoachRequest } from '@circuit/domain';
import { orchestrateUnifiedCoachDecision, summarizeUnifiedCoachDecision } from '../src/unified-coaching-os';

const request: UnifiedCoachRequest = {
  requestId: 'request-1', athleteId: 'athlete-1', createdAt: '2026-07-29T00:00:00Z',
  candidateIds: ['retain', 'reduce'], requestedAutomaticChange: true,
  unresolvedInformationGaps: [], provenance: ['ledger-1'],
};
const strong: UnifiedCoachCandidate = {
  candidateId: 'retain', label: 'Retain the planned session', feasible: true, robust: true,
  recommendationStrength: 'strong', athleteConfirmationRequired: false, safetyViolation: false,
  clinicianRestrictionViolation: false, governanceApproved: true, explanation: ['The option preserves the primary goal.'],
};
const moderate: UnifiedCoachCandidate = {
  ...strong, candidateId: 'reduce', label: 'Reduce the session', recommendationStrength: 'moderate',
};

describe('unified coaching OS', () => {
  it('selects the strongest fully eligible candidate', () => {
    const decision = orchestrateUnifiedCoachDecision(request, [strong, moderate]);
    expect(decision.disposition).toBe('recommend');
    expect(decision.selectedCandidateId).toBe('retain');
    expect(decision.automaticPlanChangeAllowed).toBe(true);
  });

  it('blocks safety and clinician violations regardless of performance value', () => {
    const unsafe: UnifiedCoachCandidate = { ...strong, safetyViolation: true };
    const decision = orchestrateUnifiedCoachDecision({ ...request, candidateIds: ['retain'] }, [unsafe]);
    expect(decision.disposition).toBe('block');
    expect(decision.automaticPlanChangeAllowed).toBe(false);
  });

  it('requests material missing information before a non-strong decision', () => {
    const decision = orchestrateUnifiedCoachDecision(
      { ...request, candidateIds: ['reduce'], unresolvedInformationGaps: ['current pain status'] },
      [moderate],
    );
    expect(decision.disposition).toBe('request_information');
    expect(decision.informationRequested).toEqual(['current pain status']);
  });

  it('offers a choice when equally supported options remain', () => {
    const equal = { ...moderate, candidateId: 'alternate', label: 'Move the session' };
    const decision = orchestrateUnifiedCoachDecision(
      { ...request, candidateIds: ['reduce', 'alternate'] },
      [moderate, equal],
    );
    expect(decision.disposition).toBe('offer_choice');
    expect(decision.athleteConfirmationRequired).toBe(true);
  });

  it('produces a concise athlete-facing summary while retaining technical details', () => {
    const decision = orchestrateUnifiedCoachDecision(request, [strong, moderate]);
    const summary = summarizeUnifiedCoachDecision(decision, [strong, moderate]);
    expect(summary.recommendation).toBe('Retain the planned session');
    expect(summary.technicalDetailsAvailable).toBe(true);
    expect(decision.auditable).toBe(true);
  });
});
