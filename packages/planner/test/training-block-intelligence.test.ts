import { describe, expect, it } from 'vitest';
import type { TrainingBlockIntelligenceInput } from '@circuit/domain';
import { evaluateTrainingBlockIntelligence } from '../src/training-block-intelligence';

const input: TrainingBlockIntelligenceInput = {
  generatedAt: '2026-07-29T12:00:00.000Z',
  block: {
    blockId: 'build-1',
    phase: 'build',
    primaryObjective: 'lactate_threshold',
    secondaryObjectives: [{ objective: 'max_strength', priority: 70, minimumWeeklyExposures: 1, maximumWeeklyExposures: 2, rationale: 'Preserve strength.' }],
    startsOn: '2026-08-03',
    endsOn: '2026-08-30',
    strengthPriority: 3,
  },
  sessions: [
    { sessionId: 'threshold', weekIndex: 0, startsAt: '2026-08-04T17:00:00.000Z', durationMinutes: 60, title: 'Threshold ride', discipline: 'bike', objective: 'lactate_threshold', role: 'key', movable: false, targetLoad: 70 },
    { sessionId: 'strength', weekIndex: 0, startsAt: '2026-08-05T12:00:00.000Z', durationMinutes: 45, title: 'Heavy strength', discipline: 'strength', objective: 'max_strength', role: 'supporting', movable: true, targetLoad: 45 },
    { sessionId: 'optional', weekIndex: 0, startsAt: '2026-08-06T17:00:00.000Z', durationMinutes: 25, title: 'Optional mobility', discipline: 'strength', objective: 'mobility', role: 'optional', movable: true, targetLoad: 10 },
  ],
};

describe('training block intelligence', () => {
  it('protects the primary objective and key sessions', () => {
    const result = evaluateTrainingBlockIntelligence(input);
    expect(result.protectedSessionIds).toContain('threshold');
    expect(result.primaryObjective).toBe('lactate_threshold');
  });

  it('sacrifices optional work before supporting or key work', () => {
    const result = evaluateTrainingBlockIntelligence(input);
    expect(result.sacrificeOrderSessionIds[0]).toBe('optional');
    expect(result.sacrificeOrderSessionIds).not.toContain('threshold');
  });

  it('tracks missed adaptation value instead of replaying every missed workout', () => {
    const result = evaluateTrainingBlockIntelligence({ ...input, missedSessionIds: ['strength'] });
    expect(result.trainingDebt[0]?.objective).toBe('max_strength');
    expect(result.explanations.join(' ').toLowerCase()).toContain('does not automatically replay');
  });

  it('never turns training debt into compensatory exercise', () => {
    const result = evaluateTrainingBlockIntelligence({ ...input, missedSessionIds: ['strength'] });
    expect(result.safeguards.join(' ').toLowerCase()).toContain('never triggers compensatory exercise');
  });
});
