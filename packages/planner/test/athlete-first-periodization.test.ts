import { describe, expect, it } from 'vitest';
import {
  assertAthleteFirstProgress,
  buildAthleteFirstProgress,
  buildRaceHierarchy,
  evaluateTrainingWin,
} from '../src/athlete-first-periodization';

describe('A/B/C race periodization', () => {
  it('keeps secondary races embedded inside the A-race macrocycle', () => {
    const hierarchy = buildRaceHierarchy({
      currentDate: '2026-08-01',
      activePhaseLabel: 'Race-specific build',
      races: [
        { raceId: 'b', name: 'Harvest Olympic', date: '2026-10-25', sportLabel: 'Triathlon', priority: 'B', intent: 'race_fully' },
        { raceId: 'c', name: 'Local 10K', date: '2026-11-15', sportLabel: 'Run', priority: 'C', intent: 'training_day' },
        { raceId: 'a', name: 'December 70.3', date: '2026-12-13', sportLabel: 'Triathlon', priority: 'A' },
      ],
    });
    expect(hierarchy.aRace.raceId).toBe('a');
    expect(hierarchy.secondaryRaces.map((race) => race.priority)).toEqual(['B', 'C']);
    expect(hierarchy.adjustments[0]?.preserveARaceOrientation).toBe(true);
    expect(hierarchy.adjustments[0]?.treatment).toBe('short_taper');
    expect(hierarchy.adjustments[1]?.replaceExistingKeySession).toBe(true);
  });

  it('requires exactly one A race in a planning cycle', () => {
    expect(() => buildRaceHierarchy({ currentDate: '2026-08-01', activePhaseLabel: 'Build', races: [] })).toThrow(/exactly one A race/);
  });
});

describe('athlete-first Training Wins', () => {
  it('celebrates recovery, maintenance, and appropriate modification', () => {
    const model = buildAthleteFirstProgress({
      candidates: [
        { winId: 'recovery', category: 'recovery', title: 'Protected recovery', detail: 'Took the planned recovery day.', occurredAtLabel: 'Today' },
        { winId: 'modify', category: 'judgment', title: 'Adjusted appropriately', detail: 'Used the modified session.', occurredAtLabel: 'Yesterday', reflectsAppropriateModification: true },
        { winId: 'maintain', category: 'maintenance', title: 'Maintained strength', detail: 'Preserved capacity during race-specific training.', occurredAtLabel: 'This block' },
      ],
    });
    expect(model.trainingWins).toHaveLength(3);
    expect(() => assertAthleteFirstProgress(model)).not.toThrow();
  });

  it('never celebrates pushing through pain or ignoring safety guidance', () => {
    const unsafe = evaluateTrainingWin({
      winId: 'unsafe',
      category: 'performance',
      title: 'More weight',
      detail: 'Increased load despite pain.',
      occurredAtLabel: 'Today',
      painIncreased: true,
    });
    expect(unsafe.safetyState).toBe('suppress');
    const model = buildAthleteFirstProgress({ candidates: [unsafe] });
    expect(model.trainingWins).toHaveLength(0);
  });

  it('uses neutral trend states rather than demanding constant improvement', () => {
    const model = buildAthleteFirstProgress({
      movementTrends: [
        { movementId: 'squat', movementLabel: 'Squat', state: 'maintained', summary: 'Maintained intentionally during high bike volume.', evidenceCount: 4 },
        { movementId: 'run', movementLabel: 'Running', state: 'returning', summary: 'Rebuilding from current capacity.', evidenceCount: 2 },
      ],
    });
    expect(model.movementTrends.map((trend) => trend.state)).toEqual(['maintained', 'returning']);
  });
});
