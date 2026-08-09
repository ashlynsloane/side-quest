import { describe, expect, it } from 'vitest';

import { decideAthleteProgression } from '../src/athlete-progression-engine';
import {
  applyProgressionToWholeAthleteWeek,
  buildAdaptiveWholeAthleteWeek,
} from '../src/whole-athlete-progression';
import { buildWholeAthleteWeek } from '../src/whole-athlete-week';
import type { UnifiedTrainingSession } from '../src/unified-training';

const absorbed = [
  { completedAt: '2026-08-06T12:00:00.000Z', completedAsPlanned: true, rpe: 6 },
  { completedAt: '2026-08-03T12:00:00.000Z', completedAsPlanned: true, rpe: 6 },
];

function fixedSession(
  id: string,
  discipline: 'swim' | 'bike' | 'run' | 'strength',
  durationMinutes: number,
): UnifiedTrainingSession {
  return {
    id,
    date: '2026-08-12',
    title: id,
    discipline,
    durationMinutes,
    intensity: 'moderate',
    cardiovascularDemand: discipline === 'strength' ? 'low' : 'moderate',
    musculoskeletalDemand: discipline === 'strength' || discipline === 'run' ? 'moderate' : 'low',
    lowerBodyDemand: discipline === 'bike' || discipline === 'run' || discipline === 'strength' ? 'moderate' : 'none',
    upperBodyDemand: discipline === 'swim' ? 'moderate' : 'none',
    impact: discipline === 'run' ? 'moderate' : 'none',
    technicalDemand: 'moderate',
    recoveryCost: 2,
    priority: 'required',
    source: 'manual',
    keySession: false,
  };
}

function baseInput() {
  return {
    weekStartDate: '2026-08-10',
    availableMinutes: 600,
    goalType: 'ironman_70_3' as const,
    phase: 'build' as const,
    health: {
      energyAvailability: 'adequate' as const,
      mentalEnergy: 'good' as const,
      lifeStress: 'moderate' as const,
    },
  };
}

describe('whole-athlete progression governor integration', () => {
  it('turns a scheduled bike reload into a real lower-volume production week', () => {
    const baseline = { durationMinutes: 60, rpeLow: 4, rpeHigh: 6 };
    const decision = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'bike',
      baseline,
      continuity: { daysSinceExposure: 2 },
      recentEvidence: absorbed,
      weeksSinceLastReload: 4,
    });
    const original = buildWholeAthleteWeek(baseInput());
    const adjusted = applyProgressionToWholeAthleteWeek(original, {
      disciplineAssignments: { bike: { baseline, decision } },
    });

    const originalGeneratedBikeMinutes = original.sessions
      .filter((session) => session.discipline === 'bike' && session.planningCommitment === 'generated')
      .reduce((sum, session) => sum + session.durationMinutes, 0);
    const adjustedGeneratedBikeMinutes = adjusted.sessions
      .filter((session) => session.discipline === 'bike' && session.planningCommitment === 'generated')
      .reduce((sum, session) => sum + session.durationMinutes, 0);

    expect(decision.phase).toBe('reload');
    expect(adjustedGeneratedBikeMinutes).toBeLessThan(originalGeneratedBikeMinutes);
    expect(adjusted.guardrails.join(' ')).toMatch(/do not refill reduced minutes/i);
    expect(adjusted.plannedMinutes).toBeLessThan(original.plannedMinutes);
  });

  it('preserves a fixed calendar ride while exposing the lower recommendation', () => {
    const baseline = { durationMinutes: 120, rpeLow: 4, rpeHigh: 6 };
    const decision = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'bike',
      baseline,
      continuity: { daysSinceExposure: 14, interruptionReason: 'vacation' },
      recentEvidence: absorbed,
    });
    const original = buildWholeAthleteWeek({
      ...baseInput(),
      fixedSessions: [fixedSession('club-ride', 'bike', 120)],
    });
    const adjusted = applyProgressionToWholeAthleteWeek(original, {
      disciplineAssignments: { bike: { baseline, decision } },
    });
    const ride = adjusted.sessions.find((session) => session.id === 'club-ride');

    expect(decision.phase).toBe('rebuild');
    expect(ride?.durationMinutes).toBe(120);
    expect(ride?.progression?.recommendedDurationMinutes).toBeLessThan(120);
    expect(ride?.progression?.fixedSessionPreserved).toBe(true);
    expect(adjusted.warnings.join(' ')).toMatch(/preserved the athlete\/calendar commitment/i);
  });

  it('makes a two-week gap discipline-specific instead of deloading sports that stayed current', () => {
    const bikeBaseline = { durationMinutes: 60, rpeLow: 4, rpeHigh: 6 };
    const bikeDecision = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'bike',
      baseline: bikeBaseline,
      continuity: { daysSinceExposure: 15, interruptionReason: 'vacation' },
      recentEvidence: absorbed,
    });
    const original = buildWholeAthleteWeek(baseInput());
    const adjusted = applyProgressionToWholeAthleteWeek(original, {
      disciplineAssignments: { bike: { baseline: bikeBaseline, decision: bikeDecision } },
    });

    const originalSwim = original.sessions
      .filter((session) => session.discipline === 'swim')
      .map((session) => [session.id, session.durationMinutes, session.intensity]);
    const adjustedSwim = adjusted.sessions
      .filter((session) => session.discipline === 'swim')
      .map((session) => [session.id, session.durationMinutes, session.intensity]);
    const originalBikeMinutes = original.sessions
      .filter((session) => session.discipline === 'bike' && session.planningCommitment !== 'fixed')
      .reduce((sum, session) => sum + session.durationMinutes, 0);
    const adjustedBikeMinutes = adjusted.sessions
      .filter((session) => session.discipline === 'bike' && session.planningCommitment !== 'fixed')
      .reduce((sum, session) => sum + session.durationMinutes, 0);

    expect(adjustedSwim).toEqual(originalSwim);
    expect(adjustedBikeMinutes).toBeLessThan(originalBikeMinutes);
    expect(adjusted.guardrails.join(' ')).toMatch(/discipline-specific/i);
  });

  it('uses the adaptive production wrapper without bypassing whole-athlete health and spacing rules', () => {
    const baseline = { durationMinutes: 45, rpeLow: 3, rpeHigh: 5 };
    const decision = decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline: 'run',
      baseline,
      continuity: { daysSinceExposure: 14 },
      recentEvidence: absorbed,
    });
    const adjusted = buildAdaptiveWholeAthleteWeek(
      {
        ...baseInput(),
        returnToRun: true,
        recentBoneStress: true,
        health: {
          ...baseInput().health,
          boneStress: 'recent',
        },
      },
      { disciplineAssignments: { run: { baseline, decision } } },
    );
    const runs = adjusted.sessions.filter((session) => session.discipline === 'run');

    expect(adjusted.planningState).toBe('protect');
    expect(runs.every((session) => session.intensity === 'easy' && session.durationMinutes <= 30)).toBe(true);
    expect(adjusted.guardrails.join(' ')).toMatch(/return-to-run/i);
  });
});
