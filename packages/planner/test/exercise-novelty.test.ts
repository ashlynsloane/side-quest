import { describe, expect, it } from 'vitest';
import type { ExerciseExposureRecord, StrengthLoadDecision } from '@circuit/domain';
import { buildExerciseNoveltyDecision, classifyExerciseFamiliarity, profileExerciseNovelty } from '../src/exercise-novelty';

const loadDecision = (action: StrengthLoadDecision['action']): StrengthLoadDecision => ({
  action,
  baselineSessionsPerWeek: 1,
  recentSessionsPerWeek: 1,
  requestedSessions: 4,
  allowedSessions: action === 'restrict' ? 1 : 2,
  durationMultiplier: action === 'restrict' ? 0.5 : action === 'consolidate' ? 0.8 : 1,
  allowFrequencyProgression: action === 'progress',
  allowDurationProgression: false,
  allowRepProgression: false,
  reduceNovelty: action !== 'progress',
  reasons: [],
  evaluatedAt: '2026-07-28T00:00:00.000Z',
});

const history: ExerciseExposureRecord[] = [
  '2026-07-01', '2026-07-08', '2026-07-15',
].map((date, index) => ({
  id: `exposure_${index}`,
  exerciseId: 'goblet_squat',
  completedAt: `${date}T12:00:00.000Z`,
  response: 'tolerated' as const,
}));

describe('V24.3 exercise familiarity and novelty load', () => {
  it('classifies repeated tolerated recent exposure as familiar', () => {
    expect(classifyExerciseFamiliarity({ exerciseId: 'goblet_squat', exposureHistory: history, now: '2026-07-28T12:00:00.000Z' })).toBe('familiar');
  });

  it('treats past but remote experience as detrained', () => {
    const old = history.map((entry, index) => ({ ...entry, completedAt: `2026-0${index + 1}-01T12:00:00.000Z` }));
    expect(classifyExerciseFamiliarity({ exerciseId: 'goblet_squat', exposureHistory: old, now: '2026-07-28T12:00:00.000Z' })).toBe('detrained');
  });

  it('assigns a half-dose introduction to a new high-demand exercise', () => {
    const profile = profileExerciseNovelty({
      candidate: { exerciseId: 'heavy_suitcase_carry', demand: 'high' },
      exposureHistory: [],
      now: '2026-07-28T12:00:00.000Z',
    });
    expect(profile.familiarity).toBe('new');
    expect(profile.noveltyCost).toBe(3);
    expect(profile.introductoryDoseMultiplier).toBe(0.5);
  });

  it('allows only one unfamiliar movement while strength frequency is held', () => {
    const decision = buildExerciseNoveltyDecision({
      candidates: [
        { exerciseId: 'goblet_squat', demand: 'moderate' },
        { exerciseId: 'push_press', demand: 'high' },
        { exerciseId: 'single_leg_rdl', demand: 'moderate' },
      ],
      exposureHistory: history,
      loadDecision: loadDecision('hold'),
      now: '2026-07-28T12:00:00.000Z',
    });
    expect(decision.selectedExerciseIds).toEqual(['goblet_squat', 'push_press']);
    expect(decision.deferredExerciseIds).toEqual(['single_leg_rdl']);
  });

  it('defers high-demand novelty during consolidation', () => {
    const decision = buildExerciseNoveltyDecision({
      candidates: [
        { exerciseId: 'push_press', demand: 'high' },
        { exerciseId: 'band_row', demand: 'low' },
      ],
      loadDecision: loadDecision('consolidate'),
      now: '2026-07-28T12:00:00.000Z',
    });
    expect(decision.selectedExerciseIds).toEqual(['band_row']);
    expect(decision.deferredExerciseIds).toEqual(['push_press']);
  });

  it('uses familiar movements only during restriction', () => {
    const decision = buildExerciseNoveltyDecision({
      candidates: [
        { exerciseId: 'goblet_squat', demand: 'moderate' },
        { exerciseId: 'band_row', demand: 'low' },
      ],
      exposureHistory: history,
      loadDecision: loadDecision('restrict'),
      now: '2026-07-28T12:00:00.000Z',
    });
    expect(decision.selectedExerciseIds).toEqual(['goblet_squat']);
    expect(decision.deferredExerciseIds).toEqual(['band_row']);
  });
});
