import { describe, expect, it } from 'vitest';
import { adaptAthletePeriodContext } from '../src/athlete-period-adapter';
import { evaluateProtectiveTrainingRequest, interpretAthleteContextMessage, type PainContextObservation } from '../src/athlete-context-intelligence';
import { decideCoachClarification } from '../src/coach-clarification';
import { buildCoachMessageAdaptation, interpretCoachMessage } from '../src/coach-message-adaptation';
import { classifyCoachObservedExecution } from '../src/coach-observed-outcome';
import type { UnifiedTrainingSession } from '../src/unified-training';

function session(discipline: 'swim' | 'bike' | 'run' | 'strength', date = '2026-08-10'): UnifiedTrainingSession {
  return {
    id: `${discipline}-${date}`,
    date,
    title: `${discipline} session`,
    discipline,
    durationMinutes: 60,
    intensity: 'hard',
    cardiovascularDemand: discipline === 'strength' ? 'moderate' : 'high',
    musculoskeletalDemand: discipline === 'swim' ? 'low' : 'moderate',
    lowerBodyDemand: discipline === 'swim' ? 'none' : 'moderate',
    upperBodyDemand: discipline === 'swim' || discipline === 'strength' ? 'moderate' : 'none',
    impact: discipline === 'run' ? 'high' : 'none',
    technicalDemand: 'moderate',
    recoveryCost: 4,
    priority: 'recommended',
    source: 'side_quest',
    keySession: true,
  };
}

function painObservation(message: string, occurredAt: string): PainContextObservation {
  const report = interpretAthleteContextMessage(message).pain!;
  return { ...report, id: `pain-${occurredAt}`, occurredAt, discipline: 'run' };
}

describe('Coaching OS integration stories', () => {
  it('asks for function when a body complaint is ambiguous rather than guessing', () => {
    const message = 'My hip feels weird today.';
    const clarification = decideCoachClarification(message, interpretCoachMessage(message));
    expect(clarification.required).toBe(true);
    expect(clarification.kind).toBe('function');
  });

  it('protects the next load after a modest pain score stopped a run', () => {
    const recent = painObservation('My knee is 4/10 and I had to stop my run.', '2026-08-07T18:00:00.000Z');
    const decision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T18:00:00.000Z',
      recentPain: [recent],
      requestedDiscipline: 'bike',
      requestedLargeTrainingLoad: true,
      compensatoryTrainingIntent: true,
      headspace: 'frustrated',
    });
    expect(decision.action).toBe('protect');
    expect(decision.maximumSuggestedDurationMinutes).toBe(45);
  });

  it('does not turn life stress alone into a rest prescription', () => {
    const context = interpretAthleteContextMessage('Work is incredibly stressful and I am frustrated, but physically I feel okay.');
    expect(context.headspace).not.toBe('neutral');
    expect(context.pain).toBeUndefined();
  });

  it('keeps an easy non-loading modality available after lower-body pain', () => {
    const recent = painObservation('My knee hurt and I had to stop my run.', '2026-08-07T18:00:00.000Z');
    const decision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T12:00:00.000Z',
      recentPain: [recent],
      requestedDiscipline: 'swim',
      requestedDurationMinutes: 40,
      requestedIntensity: 'easy',
    });
    expect(decision.action).toBe('allow');
  });

  it('separates observed compliance from athlete-reported symptom outcome', () => {
    const observed = classifyCoachObservedExecution({
      prescribedDurationMinutes: 45,
      actualDurationMinutes: 44,
      matchedPlannedSession: true,
      completed: true,
    });
    expect(observed.status).toBe('followed');
    expect(observed.evidence.join(' ')).not.toMatch(/symptom.*better/i);
  });

  it('flags doing far more than a protective cap as execution evidence', () => {
    const observed = classifyCoachObservedExecution({
      prescribedDurationMinutes: 45,
      actualDurationMinutes: 105,
      matchedPlannedSession: true,
      completed: true,
    });
    expect(observed.status).toBe('exceeded_prescription');
  });

  it('does not preemptively reduce training from a cycle prediction without personal evidence', () => {
    const signal = adaptAthletePeriodContext({ predictedPeriodStart: '2026-08-10', predictionConfidence: 'high' }, '2026-08-09');
    expect(signal.forecast.mode).toBe('context_only');
    expect(signal.automaticReductionAllowed).toBe(false);
  });

  it('still lets active menstrual symptoms generate an athlete-selected easier modality', () => {
    const planned = session('bike');
    const adaptation = buildCoachMessageAdaptation({
      message: 'I am on my period with cramps and I would rather ride easy indoors.',
      session: planned,
      weekSessions: [planned],
      availableDates: ['2026-08-11', '2026-08-12'],
      availableDisciplines: ['swim', 'run'],
    });
    expect(adaptation.adjustment.recommendedOptionId).toContain('cycle_indoor');
  });
});
