import { describe, expect, it } from 'vitest';
import type { UnifiedCoachingOsDecision } from '@circuit/domain';
import {
  assessAthleteDecisionAppeal,
  createAthleteDecisionAppeal,
  createAthleteDecisionResponse,
} from '../src/athlete-decision-appeals';

const decision: UnifiedCoachingOsDecision = {
  decisionId: 'decision-1',
  requestId: 'request-1',
  disposition: 'recommend',
  selectedCandidateId: 'candidate-a',
  eligibleCandidateIds: ['candidate-a', 'candidate-b'],
  rejectedCandidateIds: [],
  stageResults: [],
  automaticPlanChangeAllowed: false,
  athleteConfirmationRequired: true,
  informationRequested: [],
  explanation: [],
  provenance: [],
  auditable: true,
  governanceRequired: true,
};

describe('athlete decision appeals', () => {
  it('accepts an eligible requested alternative without bypassing confirmation', () => {
    const response = createAthleteDecisionResponse({
      responseId: 'response-1',
      decisionId: decision.decisionId,
      athleteId: 'athlete-1',
      kind: 'request_alternative',
      submittedAt: '2026-07-29T19:00:00Z',
      requestedCandidateId: 'candidate-b',
      reasonKinds: ['preference_mismatch'],
    });
    const appeal = createAthleteDecisionAppeal(response, '2026-07-29T19:01:00Z');
    const assessment = assessAthleteDecisionAppeal({
      decision,
      response,
      eligibleAlternativeCandidateIds: ['candidate-b'],
    }, appeal);
    expect(assessment.disposition).toBe('accepted');
    expect(assessment.selectedAlternativeCandidateId).toBe('candidate-b');
    expect(assessment.automaticOverrideAllowed).toBe(true);
  });

  it('requires reassessment when the athlete reports a safety concern', () => {
    const response = createAthleteDecisionResponse({
      responseId: 'response-2',
      decisionId: decision.decisionId,
      athleteId: 'athlete-1',
      kind: 'appeal',
      submittedAt: '2026-07-29T19:00:00Z',
      reasonKinds: ['safety_concern'],
    });
    const appeal = createAthleteDecisionAppeal(response, '2026-07-29T19:01:00Z');
    const assessment = assessAthleteDecisionAppeal({ decision, response }, appeal);
    expect(assessment.fullReassessmentRequired).toBe(true);
    expect(assessment.automaticOverrideAllowed).toBe(false);
  });
});
