import { describe, expect, it } from 'vitest';
import { buildAthleteResponseProfile, personalizeAdaptiveDose } from '../src/athlete-response-model';
import type { AthleteResponseObservation } from '@circuit/domain';

const clean = (id: number): AthleteResponseObservation => ({
  observationId: `o-${id}`, athleteId: 'athlete-1', completedAt: `2026-07-${String(10 + id).padStart(2, '0')}T12:00:00Z`,
  sessionId: `s-${id}`, discipline: 'strength', exerciseIds: ['goblet-squat'], regions: ['knee'], plannedLoad: 40,
  completedLoad: 40, sessionDifficulty: 'appropriate', sorenessResolvedHours: 18, painRegions: [], affectedNextWorkout: false,
});

describe('athlete response model', () => {
  it('requires established repeated evidence before athlete-specific progression', () => {
    const profile = buildAthleteResponseProfile({ athleteId: 'athlete-1', generatedAt: '2026-07-29T12:00:00Z', observations: [1,2,3].map(clean) });
    const decision = personalizeAdaptiveDose({ profile, exerciseIds: ['goblet-squat'], requestedDirection: 'progress' });
    expect(decision.direction).toBe('hold');
  });

  it('permits only a bounded progression after established clean tolerance', () => {
    const profile = buildAthleteResponseProfile({ athleteId: 'athlete-1', generatedAt: '2026-07-29T12:00:00Z', observations: [1,2,3,4,5,6].map(clean) });
    const decision = personalizeAdaptiveDose({ profile, exerciseIds: ['goblet-squat'], requestedDirection: 'progress' });
    expect(decision.direction).toBe('progress');
    expect(decision.loadScale).toBeLessThanOrEqual(1.1);
  });

  it('reduces dose when repeated pain or next-workout interference appears', () => {
    const observations: AthleteResponseObservation[] = [1,2,3,4].map((id) => ({ ...clean(id), painRegions: ['knee'], affectedNextWorkout: true }));
    const profile = buildAthleteResponseProfile({ athleteId: 'athlete-1', generatedAt: '2026-07-29T12:00:00Z', observations });
    const decision = personalizeAdaptiveDose({ profile, regions: ['knee'], requestedDirection: 'progress' });
    expect(decision.direction).toBe('reduce');
    expect(decision.noveltyScale).toBe(0);
  });

  it('never models calorie restriction or weight loss as a training target', () => {
    const profile = buildAthleteResponseProfile({ athleteId: 'athlete-1', generatedAt: '2026-07-29T12:00:00Z', observations: [] });
    expect(profile.explanations.join(' ').toLowerCase()).toContain('does not recommend calorie restriction');
    expect(profile.explanations.join(' ').toLowerCase()).toContain('weight loss');
    expect(profile).not.toHaveProperty('calorieTarget');
    expect(profile).not.toHaveProperty('weightLossTarget');
  });
});
