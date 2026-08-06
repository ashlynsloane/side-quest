import { describe, expect, it } from 'vitest';
import type { CoachLearningContext, CoachLearningEpisode } from '@circuit/domain';
import { assessStrategyTransfer, buildCoachMetaLearningReport, compareCoachLearningContexts } from '../src/coach-meta-learning';

const baseContext: CoachLearningContext = {
  contextId: 'base',
  observedAt: '2026-07-01T00:00:00Z',
  dimensions: {
    training_phase: 'base', sport_mix: 'triathlon', recovery_state: 'normal',
    schedule_pattern: 'stable', injury_context: 'none', experience_level: 'intermediate',
  },
};
const target: CoachLearningContext = { ...baseContext, contextId: 'target', observedAt: '2026-07-29T00:00:00Z' };
const episode: CoachLearningEpisode = {
  episodeId: 'episode-1', strategyId: 'retain-strength', context: baseContext,
  outcome: 'beneficial', evidenceStrength: 'moderate', athleteApproved: true,
  safetyViolation: false, provenance: ['decision-ledger-1'],
};

describe('coach meta-learning', () => {
  it('recognizes highly transferable contexts', () => {
    expect(compareCoachLearningContexts(baseContext, target).transferability).toBe('high');
  });

  it('never applies a transferred strategy automatically', () => {
    const result = assessStrategyTransfer('retain-strength', [episode], target);
    expect(result.recommendation).toBe('reuse');
    expect(result.automaticApplicationAllowed).toBe(false);
    expect(result.athleteConfirmationRequired).toBe(true);
  });

  it('blocks transfer after safety violations', () => {
    const unsafe: CoachLearningEpisode = { ...episode, episodeId: 'unsafe', safetyViolation: true };
    expect(assessStrategyTransfer('retain-strength', [unsafe], target).recommendation).toBe('do_not_transfer');
  });

  it('preserves conflicting prior outcomes', () => {
    const harmful: CoachLearningEpisode = { ...episode, episodeId: 'episode-2', outcome: 'harmful' };
    const result = assessStrategyTransfer('retain-strength', [episode, harmful], target);
    expect(result.recommendation).toBe('retest');
    expect(result.conflictingEpisodeIds).toEqual(['episode-2']);
  });

  it('builds an auditable governance report', () => {
    const report = buildCoachMetaLearningReport([episode], target);
    expect(report.governanceRequired).toBe(true);
    expect(report.assessments[0]?.auditable).toBe(true);
  });
});
