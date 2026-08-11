import type { EnduranceActivity } from '@circuit/domain';
import { describe, expect, it } from 'vitest';

import { buildRaceTargetEvidence } from '../src/race-target-evidence';
import type { RaceIntentV2 } from '../src/race-intent';

function activity(overrides: Partial<EnduranceActivity>): EnduranceActivity {
  return {
    id: 'activity-1',
    source: 'strava',
    externalId: 'external-1',
    name: 'Training ride',
    discipline: 'bike',
    startAt: '2026-08-01T14:00:00.000Z',
    movingTimeSeconds: 5_400,
    elapsedTimeSeconds: 5_500,
    intensity: 'moderate',
    importedAt: '2026-08-01T16:00:00.000Z',
    updatedAt: '2026-08-01T16:00:00.000Z',
    ...overrides,
  };
}

function raceIntent(overrides: Partial<RaceIntentV2> = {}): RaceIntentV2 {
  return {
    version: 2,
    overallObjective: 'discipline_performance',
    primaryDiscipline: 'bike',
    disciplinePriorities: { swim: 'maintain', bike: 'primary_focus', run: 'maintain' },
    tradeoffTolerance: 'moderate_tradeoff',
    disciplineTargets: { bike: { kind: 'power', value: '210 W' } },
    ...overrides,
  };
}

describe('race target evidence', () => {
  it('shows a recent power reference without converting it into a race-readiness score', () => {
    const evidence = buildRaceTargetEvidence({
      raceIntent: raceIntent(),
      effectiveStrategy: {
        primaryFocus: 'bike',
        disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
        racePriority: { discipline: 'bike', objective: 'time_goal', target: '210 W' },
      },
      activities: [activity({ weightedAverageWatts: 203 })],
    });

    expect(evidence.status).toBe('recent_reference');
    expect(evidence.targetLabel).toContain('210 W');
    expect(evidence.evidenceLabel).toContain('203 W');
    expect(evidence.caveat).toContain('not a race projection or readiness score');
    expect(JSON.stringify(evidence)).not.toContain('%');
  });

  it('shows a recent run pace reference when the target is pace-based', () => {
    const intent = raceIntent({
      primaryDiscipline: 'run',
      disciplinePriorities: { swim: 'maintain', bike: 'maintain', run: 'primary_focus' },
      disciplineTargets: { run: { kind: 'pace', value: '7:30/mi' } },
    });
    const evidence = buildRaceTargetEvidence({
      raceIntent: intent,
      effectiveStrategy: {
        primaryFocus: 'run',
        disciplineObjectives: { run: 'primary_focus', swim: 'maintain', bike: 'maintain' },
        racePriority: { discipline: 'run', objective: 'time_goal', target: '7:30/mi' },
      },
      activities: [activity({
        id: 'run-1',
        externalId: 'run-ext',
        name: 'Steady run',
        discipline: 'run',
        movingTimeSeconds: 3_600,
        elapsedTimeSeconds: 3_650,
        distanceMeters: 12_000,
      })],
    });

    expect(evidence.status).toBe('recent_reference');
    expect(evidence.evidenceLabel).toMatch(/\/mi average/);
    expect(evidence.caveat).toContain('training reference');
  });

  it('does not pretend a generic PR goal has a comparable benchmark', () => {
    const evidence = buildRaceTargetEvidence({
      raceIntent: raceIntent({ disciplineTargets: { bike: { kind: 'pr' } } }),
      effectiveStrategy: {
        primaryFocus: 'bike',
        disciplineObjectives: { bike: 'maximize', swim: 'maintain', run: 'maintain' },
        racePriority: { discipline: 'bike', objective: 'personal_best' },
      },
      activities: [activity({ weightedAverageWatts: 250 })],
    });

    expect(evidence.status).toBe('target_defined');
    expect(evidence.evidenceLabel).toBeUndefined();
    expect(evidence.caveat).toContain('comparable race or benchmark history');
  });

  it('does not compare an overall race-time target with arbitrary training duration', () => {
    const evidence = buildRaceTargetEvidence({
      raceIntent: raceIntent({
        overallObjective: 'specific_overall_time',
        overallTarget: '5:15:00',
      }),
      effectiveStrategy: { disciplineObjectives: { swim: 'develop', bike: 'develop', run: 'develop' } },
      activities: [activity({ movingTimeSeconds: 18_900 })],
    });

    expect(evidence.status).toBe('target_defined');
    expect(evidence.targetLabel).toBe('Overall time · 5:15:00');
    expect(evidence.caveat).toContain('does not treat arbitrary training duration');
  });

  it('ignores deleted activities when selecting a recent reference', () => {
    const evidence = buildRaceTargetEvidence({
      raceIntent: raceIntent(),
      effectiveStrategy: {
        primaryFocus: 'bike',
        disciplineObjectives: { bike: 'primary_focus' },
        racePriority: { discipline: 'bike', objective: 'time_goal', target: '210 W' },
      },
      activities: [activity({ weightedAverageWatts: 240, deletedAt: '2026-08-02T00:00:00.000Z' })],
    });
    expect(evidence.status).toBe('target_defined');
    expect(evidence.evidenceLabel).toBeUndefined();
  });
});
