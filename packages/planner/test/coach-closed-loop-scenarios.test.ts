import { describe, expect, it } from 'vitest';

import {
  buildCycleTrainingForecast,
  evaluateProtectiveTrainingRequest,
  interpretAthleteContextMessage,
  type PainContextObservation,
} from '../src/athlete-context-intelligence';
import {
  buildProactiveCoachCue,
  fingerprintCoachIntervention,
  learnCoachInterventionEffects,
  outcomeRatingFromFollowUp,
  type CoachInterventionOutcomeObservation,
} from '../src/coach-closed-loop';
import { buildCoachMessageAdaptation } from '../src/coach-message-adaptation';
import { simulateCoachScenarios } from '../src/coach-scenario-simulator';
import type { UnifiedTrainingSession } from '../src/unified-training';

function runSession(overrides: Partial<UnifiedTrainingSession> = {}): UnifiedTrainingSession {
  return {
    id: 'run-quality', date: '2026-08-07', title: 'Track workout', discipline: 'run', durationMinutes: 60, intensity: 'hard',
    cardiovascularDemand: 'high', musculoskeletalDemand: 'high', lowerBodyDemand: 'high', upperBodyDemand: 'none',
    impact: 'high', technicalDemand: 'moderate', recoveryCost: 4, priority: 'recommended', source: 'side_quest', keySession: true,
    ...overrides,
  };
}

function bikeSession(overrides: Partial<UnifiedTrainingSession> = {}): UnifiedTrainingSession {
  return {
    id: 'bike-session', date: '2026-08-08', title: 'Bike workout', discipline: 'bike', durationMinutes: 75, intensity: 'hard',
    cardiovascularDemand: 'high', musculoskeletalDemand: 'moderate', lowerBodyDemand: 'moderate', upperBodyDemand: 'none',
    impact: 'none', technicalDemand: 'moderate', recoveryCost: 3, priority: 'recommended', source: 'side_quest', keySession: false,
    ...overrides,
  };
}

function observationFromMessage(id: string, occurredAt: string, message: string, discipline: 'run' | 'bike'): PainContextObservation {
  const pain = interpretAthleteContextMessage(message).pain!;
  return { ...pain, id, occurredAt, discipline };
}

describe('coach closed-loop multi-day scenarios', () => {
  it('does not let frustration convert a pain-limited track workout into next-day training debt', () => {
    const prior = observationFromMessage('knee-day-1', '2026-08-07T17:00:00.000Z', 'My knee is 4/10 and I had to quit the track workout.', 'run');
    const dayTwo = interpretAthleteContextMessage('I am pissed about missing it and want to ride a century tomorrow to make up for it.');
    const decision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T10:00:00.000Z',
      recentPain: [prior],
      requestedDiscipline: 'bike',
      requestedDurationMinutes: 360,
      requestedIntensity: 'hard',
      requestedLargeTrainingLoad: dayTwo.requestedLargeTrainingLoad,
      compensatoryTrainingIntent: dayTwo.compensatoryTrainingIntent,
      headspace: dayTwo.headspace,
    });

    expect(prior.score0to10).toBe(4);
    expect(prior.stoppedSession).toBe(true);
    expect(dayTwo.headspace).toBe('angry');
    expect(decision.action).toBe('protect');
    expect(decision.maximumSuggestedDurationMinutes).toBe(45);
    expect(decision.explanations.join(' ')).toContain('should not be repaid');

    const scenarios = simulateCoachScenarios({
      generatedAt: '2026-08-08T10:00:00.000Z',
      maximumInjuryRisk: 0.5,
      candidates: [
        {
          scenarioId: 'century', kind: 'keep', title: 'Ride the century', description: 'Use the requested compensatory load.',
          hardConstraintViolations: ['Conflicts with the recent function-limiting pain protection ceiling.'],
          projection: { adaptation: 0.7, recovery: 0.15, performance: 0.3, injuryRisk: 0.8, calendarFit: 0.7, preferenceFit: 1, disruption: 0.4 },
        },
        {
          scenarioId: 'easy-check', kind: 'shorten', title: 'Easy tolerance check', description: 'Ride easy for no more than 45 minutes.',
          projection: { adaptation: 0.35, recovery: 0.8, performance: 0.65, injuryRisk: 0.25, calendarFit: 0.9, preferenceFit: 0.7, disruption: 0.1 },
        },
      ],
    });
    expect(scenarios.scenarioById.century?.eligible).toBe(false);
    expect(scenarios.recommendedScenarioId).toBe('easy-check');
  });

  it('does not treat life stress by itself as a reason to remove training', () => {
    const context = interpretAthleteContextMessage('Work is incredibly stressful and I am frustrated, but physically I feel okay.');
    const decision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T10:00:00.000Z',
      recentPain: [],
      requestedDiscipline: 'bike',
      requestedDurationMinutes: 60,
      requestedIntensity: 'easy',
      headspace: context.headspace,
    });
    expect(context.headspace).toBe('frustrated');
    expect(decision.action).toBe('allow');
  });

  it('keeps predicted menstrual timing optional until a personal pattern exists, then learns from actual responses', () => {
    const noPattern = buildCycleTrainingForecast({ daysUntilPredictedPeriod: 1, predictionConfidence: 'high', observations: [] });
    expect(noPattern.mode).toBe('context_only');

    const withPattern = buildCycleTrainingForecast({
      daysUntilPredictedPeriod: 1,
      predictionConfidence: 'high',
      observations: [
        { id: 'c1', occurredAt: '2026-05-01', daysFromPeriodStart: 0, symptoms: ['cramps'], affectedTraining: true, selectedAdjustments: ['indoor_bike', 'easier'] },
        { id: 'c2', occurredAt: '2026-06-01', daysFromPeriodStart: -1, symptoms: ['cramps', 'fatigue'], affectedTraining: true, selectedAdjustments: ['indoor_bike', 'easier'] },
        { id: 'c3', occurredAt: '2026-07-01', daysFromPeriodStart: 1, symptoms: ['cramps'], affectedTraining: true, selectedAdjustments: ['indoor_bike', 'easier'] },
      ],
    });
    expect(withPattern.mode).toBe('offer_preemptive_options');
    expect(withPattern.suggestedAdjustments).toContain('indoor_bike');

    const bike = bikeSession();
    const adaptation = buildCoachMessageAdaptation({
      message: 'I am on my period with cramps and I would rather ride easy indoors.',
      session: bike,
      weekSessions: [bike],
      availableDates: ['2026-08-09'],
    });
    const option = adaptation.adjustment.options.find((item) => item.id === adaptation.adjustment.recommendedOptionId)!;
    const fingerprint = fingerprintCoachIntervention('bike', adaptation, option);
    const outcomes: CoachInterventionOutcomeObservation[] = ['1', '2', '3'].map((id) => ({
      id: `outcome-${id}`,
      interventionId: `cycle-${id}`,
      observedAt: `2026-0${Number(id) + 5}-02T12:00:00.000Z`,
      fingerprint,
      ...outcomeRatingFromFollowUp('better'),
    }));
    const pattern = learnCoachInterventionEffects(outcomes)[0]!;
    const cue = buildProactiveCoachCue(pattern);
    expect(pattern.direction).toBe('helpful');
    expect(cue?.automaticChangeAllowed).toBe(false);
  });

  it('allows a low-load unrelated cross-training option after lower-body pain without interpreting it as proof of recovery', () => {
    const prior = observationFromMessage('knee-day-1', '2026-08-07T17:00:00.000Z', 'My knee hurt and I had to stop my run.', 'run');
    const swimDecision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T10:00:00.000Z',
      recentPain: [prior],
      requestedDiscipline: 'swim',
      requestedDurationMinutes: 30,
      requestedIntensity: 'easy',
    });
    const runDecision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T10:00:00.000Z',
      recentPain: [prior],
      requestedDiscipline: 'run',
      requestedDurationMinutes: 60,
      requestedIntensity: 'hard',
    });
    expect(swimDecision.action).toBe('allow');
    expect(swimDecision.explanations.join(' ')).toContain('not evidence that the injured area is ready for progression');
    expect(runDecision.action).not.toBe('allow');
  });
});
