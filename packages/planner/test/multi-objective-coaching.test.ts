import { describe, expect, it } from 'vitest';
import { buildParetoFrontier, selectMultiObjectiveCandidate } from '../src/multi-objective-coaching';
import type { CoachObjective, CoachOptimizationCandidate } from '@circuit/domain';

const objectives: CoachObjective[] = [
  { objectiveId: 'recovery', kind: 'recovery', direction: 'maximize', importance: 'high', evidenceIds: [] },
  { objectiveId: 'performance', kind: 'performance', direction: 'maximize', importance: 'high', evidenceIds: [] },
  { objectiveId: 'safety', kind: 'injury_risk', direction: 'minimize', importance: 'binding', evidenceIds: [] },
];
const candidates: CoachOptimizationCandidate[] = [
  { candidateId: 'shorten', label: 'Shorten', governanceApproved: true, constraintViolations: [], outcomes: [
    { objectiveId: 'recovery', expectedDirection: 'improve', magnitude: 'moderate', confidence: 'high', explanation: '' },
    { objectiveId: 'performance', expectedDirection: 'preserve', magnitude: 'small', confidence: 'medium', explanation: '' },
    { objectiveId: 'safety', expectedDirection: 'preserve', magnitude: 'small', confidence: 'high', explanation: '' },
  ] },
  { candidateId: 'full', label: 'Full', governanceApproved: true, constraintViolations: [], outcomes: [
    { objectiveId: 'recovery', expectedDirection: 'worsen', magnitude: 'moderate', confidence: 'medium', explanation: '' },
    { objectiveId: 'performance', expectedDirection: 'improve', magnitude: 'small', confidence: 'medium', explanation: '' },
    { objectiveId: 'safety', expectedDirection: 'worsen', magnitude: 'small', confidence: 'medium', explanation: '' },
  ] },
];

describe('multi-objective coaching', () => {
  it('excludes options that worsen a binding objective', () => {
    const frontier = buildParetoFrontier({ candidates, objectives });
    expect(frontier.find((item) => item.candidateId === 'full')?.status).toBe('infeasible');
  });
  it('requires athlete choice for unresolved material tradeoffs', () => {
    const alternatives = candidates.map((candidate) => ({ ...candidate, outcomes: candidate.outcomes.map((outcome) => outcome.objectiveId === 'safety' ? { ...outcome, expectedDirection: 'preserve' as const } : outcome) }));
    const decision = selectMultiObjectiveCandidate({ candidates: alternatives, objectives, preferences: [], uncertaintyStable: true });
    expect(decision.requiresAthleteChoice).toBe(true);
    expect(decision.automaticPlanChangeAllowed).toBe(false);
  });
  it('preserves separate objectives instead of returning an opaque composite score', () => {
    const decision = selectMultiObjectiveCandidate({ candidates, objectives, preferences: [{ objectiveId: 'recovery', rank: 1, source: 'athlete', declared: true }], uncertaintyStable: true });
    expect(decision.objectives).toHaveLength(3);
    expect('score' in decision).toBe(false);
  });
});
