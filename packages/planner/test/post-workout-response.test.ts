import { describe, expect, it } from 'vitest';
import type { PostWorkoutResponseRecord } from '@circuit/domain';
import { buildExerciseToleranceProfile, evaluatePostWorkoutResponse } from '../src/post-workout-response';

const response = (overrides: Partial<PostWorkoutResponseRecord> = {}): PostWorkoutResponseRecord => ({
  responseId: 'response-1',
  sessionId: 'session-1',
  completedAt: '2026-07-28T18:00:00.000Z',
  completedAsPlanned: true,
  sessionDifficulty: 'appropriate',
  sorenessRegions: [],
  painRegions: [],
  affectedNextWorkout: false,
  recoveryConfidence: 'high',
  exerciseResponses: [],
  ...overrides,
});

describe('V24.9 post-workout response loop', () => {
  it('progresses only after a clean session that felt too easy', () => {
    const decision = evaluatePostWorkoutResponse({ response: response({ sessionDifficulty: 'too_easy' }), recentResponses: [] });
    expect(decision.sessionAction).toBe('progress');
    expect(decision.progressionAllowed).toBe(true);
  });

  it('reduces the next dose after prolonged soreness', () => {
    const decision = evaluatePostWorkoutResponse({ response: response({ sorenessResolvedHours: 72 }), recentResponses: [] });
    expect(decision.sessionAction).toBe('reduce');
    expect(decision.nextSessionScale).toBeLessThan(1);
  });

  it('restricts the involved region when pain affects another workout', () => {
    const decision = evaluatePostWorkoutResponse({
      response: response({ painRegions: ['shoulder_complex'], affectedNextWorkout: true }),
      recentResponses: [],
    });
    expect(decision.sessionAction).toBe('restrict_region');
    expect(decision.restrictedRegions).toContain('shoulder_complex');
  });

  it('learns repeated exercise-specific pain and substitutes that exercise', () => {
    const histories = [1, 2].map((index) => response({
      responseId: `response-${index}`,
      completedAt: `2026-07-${20 + index}T18:00:00.000Z`,
      exerciseResponses: [{ exerciseId: 'overhead-press', completed: true, painRegions: ['shoulder_complex'] }],
    }));
    const profile = buildExerciseToleranceProfile('overhead-press', histories);
    expect(profile.status).toBe('avoid_temporarily');
  });

  it('does not let a positive response override an active recovery-week progression hold', () => {
    const decision = evaluatePostWorkoutResponse({
      response: response({ sessionDifficulty: 'too_easy' }),
      recentResponses: [],
      currentLoadManagement: {
        kind: 'deload', triggers: ['athlete_request'], strengthFrequencyScale: 0.75,
        sessionDurationScale: 0.7, mechanicalDemandScale: 0.65, noveltyBudget: 0,
        progressionAllowed: false, protectedSessionIds: [], adjustments: [], explanations: [],
      },
    });
    expect(decision.progressionAllowed).toBe(false);
    expect(decision.noveltyAllowed).toBe(false);
  });
});
