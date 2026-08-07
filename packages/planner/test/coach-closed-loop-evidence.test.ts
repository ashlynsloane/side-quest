import { describe, expect, it } from 'vitest';

import {
  buildProactiveCoachCue,
  learnCoachInterventionEffects,
  type CoachInterventionFingerprint,
  type CoachInterventionOutcomeObservation,
} from '../src/coach-closed-loop';

const fingerprint: CoachInterventionFingerprint = {
  discipline: 'bike', reason: 'fatigue', action: 'modify', painKind: 'post_exercise_soreness', menstrual: false, affectedArea: 'lower_body',
};

function observation(index: number, rating: CoachInterventionOutcomeObservation['rating']): CoachInterventionOutcomeObservation {
  return {
    id: `o-${index}`,
    interventionId: `i-${index}`,
    observedAt: `2026-08-${String(index + 1).padStart(2, '0')}T20:00:00.000Z`,
    fingerprint,
    rating,
    symptomResponse: rating === 'helped' ? 'better' : rating === 'hurt' ? 'worse' : rating === 'neutral' ? 'same' : 'not_applicable',
    completedAsPlanned: rating !== 'not_completed',
  };
}

describe('coach closed-loop evidence accounting', () => {
  it('does not let non-completions manufacture confidence in intervention effectiveness', () => {
    const pattern = learnCoachInterventionEffects([
      ...Array.from({ length: 7 }, (_, index) => observation(index, 'not_completed')),
      observation(8, 'helped'),
    ])[0]!;
    expect(pattern.observations).toBe(8);
    expect(pattern.evaluableOutcomes).toBe(1);
    expect(pattern.confidence).toBe('low');
    expect(pattern.direction).toBe('mixed');
    expect(buildProactiveCoachCue(pattern)).toBeNull();
  });

  it('uses completed evaluable responses—not raw prompt count—to reach moderate confidence', () => {
    const pattern = learnCoachInterventionEffects([
      observation(1, 'helped'),
      observation(2, 'helped'),
      observation(3, 'neutral'),
      observation(4, 'not_completed'),
      observation(5, 'not_completed'),
    ])[0]!;
    expect(pattern.evaluableOutcomes).toBe(3);
    expect(pattern.confidence).toBe('moderate');
    expect(pattern.notCompleted).toBe(2);
  });
});
