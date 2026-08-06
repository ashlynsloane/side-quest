import { describe, expect, it } from 'vitest';
import type { UnifiedCoachEngineResult } from '@circuit/domain';
import { buildCoachEvidenceConfidence } from '../src/coach-evidence-confidence';

const result: UnifiedCoachEngineResult = {
  generatedAt: '2026-07-29T09:00:00-06:00',
  status: 'adjustment_proposed',
  confidence: 'high',
  signals: [
    {
      signalId: 'capacity:quad',
      source: 'capacity_forecast',
      sessionId: 'strength-1',
      severity: 'meaningful',
      confidence: 'high',
      message: 'Projected quad capacity is below the planning threshold.',
      reasons: ['Recent structural load is elevated.'],
    },
    {
      signalId: 'athlete:fatigue',
      source: 'athlete_response',
      sessionId: 'strength-1',
      severity: 'watch',
      confidence: 'moderate',
      message: 'Fatigue is above the athlete baseline.',
      reasons: ['The athlete reported unusually heavy legs.'],
    },
  ],
  decisions: [
    {
      decisionId: 'coach:strength-1',
      sessionId: 'strength-1',
      action: 'shorten',
      priority: 'high',
      confidence: 'high',
      requiresAthleteApproval: true,
      title: 'Shorten session',
      explanation: 'Capacity is below the planning threshold.',
      supportingSignalIds: ['capacity:quad', 'athlete:fatigue'],
      rejectedAlternatives: ['Compensatory volume'],
    },
  ],
  protectedSessionIds: [],
  coachSummary: [],
  requiresAthleteApproval: true,
  safeguards: [],
};

describe('buildCoachEvidenceConfidence', () => {
  it('builds traceable evidence and a calibrated explanation', () => {
    const evidence = buildCoachEvidenceConfidence({ generatedAt: result.generatedAt, coachResult: result });
    expect(evidence.explanations).toHaveLength(1);
    expect(evidence.explanations[0]?.primaryEvidenceIds).toHaveLength(2);
    expect(evidence.explanations[0]?.confidence.label).toBe('high');
    expect(evidence.explanationByDecisionId['coach:strength-1']?.recommendation).toContain('Shorten');
  });

  it('caps confidence when expected evidence is missing', () => {
    const coachResult: UnifiedCoachEngineResult = {
      ...result,
      signals: result.signals.slice(0, 1),
      decisions: [{ ...result.decisions[0]!, supportingSignalIds: ['capacity:quad'] }],
    };
    const evidence = buildCoachEvidenceConfidence({ generatedAt: result.generatedAt, coachResult });
    expect(evidence.explanations[0]?.missingEvidenceIds).toHaveLength(1);
    expect(evidence.explanations[0]?.confidence.label).not.toBe('high');
    expect(evidence.explanations[0]?.confidence.cappedByMissingEvidence).toBe(true);
  });

  it('uses outcome learning as context rather than automatic authority', () => {
    const evidence = buildCoachEvidenceConfidence({
      generatedAt: result.generatedAt,
      coachResult: result,
      outcomeLearning: {
        generatedAt: result.generatedAt,
        observations: [],
        aggregates: [{ action: 'shorten', observations: 3, helped: 2, neutral: 1, hurt: 0, unknown: 0, confidence: 'moderate', summary: 'Shortening usually helped.' }],
        helpfulDecisionIds: [], harmfulDecisionIds: [], insufficientEvidenceActions: [], coachingNotes: [], safeguards: [],
      },
    });
    expect(evidence.evidence.some((item) => item.source === 'outcome_learning' && item.role === 'context')).toBe(true);
    expect(evidence.safeguards.join(' ')).toContain('cannot independently authorize');
  });
});
