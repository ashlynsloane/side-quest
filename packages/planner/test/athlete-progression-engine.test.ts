import { describe, expect, it } from 'vitest';
import { decideAthleteProgression } from '../src/athlete-progression-engine';

const absorbed = [
  { completedAt: '2026-08-06T12:00:00.000Z', completedAsPlanned: true, rpe: 6 },
  { completedAt: '2026-08-03T12:00:00.000Z', completedAsPlanned: true, rpe: 6 },
];

describe('Athlete Progression Engine V1', () => {
  it('schedules a reload instead of allowing indefinite week-over-week progression', () => {
    const decision = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'bike',
      baseline: { durationMinutes: 60, rpeLow: 4, rpeHigh: 6 },
      continuity: { daysSinceExposure: 2 },
      recentEvidence: absorbed,
      weeksSinceLastReload: 4,
    });

    expect(decision.phase).toBe('reload');
    expect(decision.reloadKind).toBe('consolidation');
    expect(decision.progressionAllowed).toBe(false);
    expect(decision.target.durationMinutes).toBeLessThan(60);
    expect(decision.makeUpMissedTraining).toBe(false);
  });

  it('returns strength below the prior dose after a two-week vacation', () => {
    const decision = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'strength',
      baseline: { load: 100, reps: 10 },
      continuity: { daysSinceExposure: 14, interruptionReason: 'vacation' },
      recentEvidence: absorbed,
    });

    expect(decision.phase).toBe('rebuild');
    expect(decision.direction).toBe('reduce');
    expect(decision.progressionAllowed).toBe(false);
    expect(decision.strengthLoadCeiling).toBeLessThan(100);
    expect(decision.target.reps).toBeLessThan(10);
    expect(decision.makeUpMissedTraining).toBe(false);
    expect(decision.rationale.join(' ')).toMatch(/training debt/i);
  });

  it('shortens and eases bike intervals after a two-week gap', () => {
    const decision = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'bike',
      baseline: {
        durationMinutes: 90,
        intervalCount: 4,
        intervalMinutes: 10,
        rpeLow: 6,
        rpeHigh: 7,
        wattsLow: 200,
        wattsHigh: 220,
      },
      continuity: { daysSinceExposure: 14, interruptionReason: 'vacation' },
      recentEvidence: [
        ...absorbed,
        { completedAt: '2026-07-24T12:00:00.000Z', completedAsPlanned: true, rpe: 6, weightedAverageWatts: 205 },
      ],
      prescriptionStyle: 'hybrid',
    });

    expect(decision.phase).toBe('rebuild');
    expect(decision.target.durationMinutes).toBeLessThan(90);
    expect(decision.target.intervalCount).toBeLessThan(4);
    expect(decision.target.intervalMinutes).toBeLessThan(10);
    expect(decision.target.rpeHigh).toBeLessThan(7);
    expect(decision.target.wattsHigh).toBeLessThan(220);
  });

  it('uses discipline-specific continuity instead of treating a vacation as total detraining', () => {
    const swim = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'swim',
      baseline: { durationMinutes: 45, rpeLow: 3, rpeHigh: 5 },
      continuity: { daysSinceExposure: 3, interruptionReason: 'vacation' },
      recentEvidence: absorbed,
    });
    const bike = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'bike',
      baseline: { durationMinutes: 60, rpeLow: 3, rpeHigh: 5 },
      continuity: { daysSinceExposure: 16, interruptionReason: 'vacation' },
      recentEvidence: absorbed,
    });

    expect(swim.phase).toBe('build');
    expect(swim.target.durationMinutes).toBeGreaterThan(45);
    expect(bike.phase).toBe('rebuild');
    expect(bike.target.durationMinutes).toBeLessThan(60);
  });

  it('progresses endurance interval structure before intensity', () => {
    const decision = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'bike',
      baseline: {
        durationMinutes: 75,
        intervalCount: 3,
        intervalMinutes: 10,
        rpeLow: 6,
        rpeHigh: 7,
        wattsLow: 210,
        wattsHigh: 225,
      },
      continuity: { daysSinceExposure: 2 },
      recentEvidence: [
        { completedAt: '2026-08-06T12:00:00.000Z', completedAsPlanned: true, rpe: 6, weightedAverageWatts: 218 },
        { completedAt: '2026-08-02T12:00:00.000Z', completedAsPlanned: true, rpe: 6, weightedAverageWatts: 216 },
      ],
      prescriptionStyle: 'hybrid',
    });

    expect(decision.phase).toBe('build');
    expect(decision.progressionAllowed).toBe(true);
    expect(decision.target.intervalMinutes).toBeGreaterThan(10);
    expect(decision.target.rpeHigh).toBe(7);
    expect(decision.target.wattsLow).toBe(210);
    expect(decision.target.wattsHigh).toBe(225);
  });

  it('does not expose bike power targets without recorded power evidence', () => {
    const decision = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'bike',
      baseline: { durationMinutes: 60, rpeLow: 4, rpeHigh: 6, wattsLow: 190, wattsHigh: 210 },
      continuity: { daysSinceExposure: 2 },
      recentEvidence: absorbed,
      prescriptionStyle: 'numeric',
    });

    expect(decision.numericTargetsAllowed).toBe(false);
    expect(decision.prescriptionStyle).toBe('effort');
  });

  it('blocks progression during taper and race week even when recent work felt easy', () => {
    const taper = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'run',
      baseline: { durationMinutes: 50, rpeLow: 3, rpeHigh: 5 },
      continuity: { daysSinceExposure: 2 },
      recentEvidence: absorbed,
      trainingState: 'taper',
    });
    const raceWeek = decideAthleteProgression({
      weekStartDate: '2026-08-17',
      discipline: 'run',
      baseline: { durationMinutes: 50, rpeLow: 3, rpeHigh: 5 },
      continuity: { daysSinceExposure: 2 },
      recentEvidence: absorbed,
      trainingState: 'race_week',
    });

    expect(taper.progressionAllowed).toBe(false);
    expect(taper.target.durationMinutes).toBeLessThan(50);
    expect(raceWeek.progressionAllowed).toBe(false);
    expect(raceWeek.target.durationMinutes).toBeLessThan(taper.target.durationMinutes!);
  });
});
