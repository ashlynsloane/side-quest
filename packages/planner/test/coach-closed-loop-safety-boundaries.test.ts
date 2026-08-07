import { describe, expect, it } from 'vitest';

import {
  findCoachInterventionEffectPattern,
  learnCoachInterventionEffects,
  type CoachInterventionFingerprint,
  type CoachInterventionOutcomeObservation,
} from '../src/coach-closed-loop';

function outcomes(fingerprint: CoachInterventionFingerprint): CoachInterventionOutcomeObservation[] {
  return [1, 2, 3].map((index) => ({
    id: `outcome-${index}`,
    interventionId: `intervention-${index}`,
    observedAt: `2026-08-0${index + 1}T20:00:00.000Z`,
    fingerprint,
    rating: 'helped' as const,
    symptomResponse: 'better' as const,
    completedAsPlanned: true,
  }));
}

describe('coach closed-loop learning safety boundaries', () => {
  it('does not reuse a DOMS outcome pattern as evidence for focal musculoskeletal pain', () => {
    const doms: CoachInterventionFingerprint = {
      discipline: 'bike', reason: 'fatigue', action: 'modify', painKind: 'post_exercise_soreness', menstrual: false, affectedArea: 'lower_body',
    };
    const focal: CoachInterventionFingerprint = {
      discipline: 'bike', reason: 'pain', action: 'modify', painKind: 'focal_musculoskeletal', menstrual: false, affectedArea: 'lower_body',
    };
    const patterns = learnCoachInterventionEffects(outcomes(doms));
    expect(findCoachInterventionEffectPattern(doms, patterns)?.direction).toBe('helpful');
    expect(findCoachInterventionEffectPattern(focal, patterns)).toBeUndefined();
  });

  it('does not reuse lower-body intervention evidence for a different affected area', () => {
    const lower: CoachInterventionFingerprint = {
      discipline: 'strength', reason: 'pain', action: 'modify', painKind: 'focal_musculoskeletal', menstrual: false, affectedArea: 'lower_body',
    };
    const upper: CoachInterventionFingerprint = { ...lower, affectedArea: 'upper_body' };
    const patterns = learnCoachInterventionEffects(outcomes(lower));
    expect(findCoachInterventionEffectPattern(upper, patterns)).toBeUndefined();
  });
});
