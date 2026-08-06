import { describe, expect, it } from 'vitest';
import { assessCoachUncertainty, detectInformationGaps, evaluateDecisionStability } from '../src/coach-uncertainty';

describe('coach uncertainty reasoning', () => {
  it('requires confirmation when reasonable alternatives change the decision', () => {
    expect(evaluateDecisionStability({ baselineRecommendation: 'shorten', alternativeRecommendations: ['keep', 'shorten'] }).requiresAthleteConfirmation).toBe(true);
  });

  it('does not request irrelevant missing information', () => {
    const gaps = detectInformationGaps([{ field: 'weather', observed: false, materialToDecision: false, couldChangeRecommendation: false }]);
    expect(gaps[0]?.requestFromAthlete).toBe(false);
  });

  it('preserves conflicts and blocks automatic action under tentative evidence', () => {
    const result = assessCoachUncertainty({
      assessmentId: 'a1', recommendationId: 'r1',
      dimensions: [
        { kind: 'evidence', level: 'moderate', reasons: ['Recent evidence is incomplete.'], evidenceIds: ['e1'] },
        { kind: 'model', level: 'low', reasons: [], evidenceIds: [] },
        { kind: 'context', level: 'moderate', reasons: ['Prior evidence comes from base phase.'], evidenceIds: ['e2'] },
        { kind: 'outcome', level: 'moderate', reasons: [], evidenceIds: [] },
        { kind: 'decision', level: 'moderate', reasons: [], evidenceIds: [] },
      ],
      evidence: [
        { id: 'e1', conclusion: 'favor', description: 'Fatigue favors shortening.' },
        { id: 'e2', conclusion: 'oppose', description: 'Long-term strength response favors retaining work.' },
      ],
      candidateGaps: [{ field: 'pain status', observed: false, materialToDecision: true, couldChangeRecommendation: true }],
      baselineRecommendation: 'shorten', alternativeRecommendations: ['shorten', 'keep'], governanceApproved: true,
    });
    expect(result.conflicts[0]?.preserved).toBe(true);
    expect(result.recommendationStrength).toBe('tentative');
    expect(result.automaticPlanChangeAllowed).toBe(false);
    expect(result.stability.requiresAthleteConfirmation).toBe(true);
  });

  it('keeps binding safety rules authoritative', () => {
    const result = assessCoachUncertainty({
      assessmentId: 'a2', recommendationId: 'r2',
      dimensions: [{ kind: 'evidence', level: 'high', reasons: ['Sparse data.'], evidenceIds: [] }],
      evidence: [], candidateGaps: [], baselineRecommendation: 'stop', alternativeRecommendations: ['continue'],
      governanceApproved: true, safetyProhibitsAction: true, bindingSafetyRule: true,
    });
    expect(result.recommendationStrength).toBe('do_not_recommend');
    expect(result.automaticPlanChangeAllowed).toBe(false);
    expect(result.explanation.avoidsNumericPrecision).toBe(true);
  });
});
