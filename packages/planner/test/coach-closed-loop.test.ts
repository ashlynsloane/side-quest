import { describe, expect, it } from 'vitest';

import {
  buildCoachDecisionExplanation,
  buildProactiveCoachCue,
  findCoachInterventionEffectPattern,
  fingerprintCoachIntervention,
  learnCoachInterventionEffects,
  outcomeRatingFromFollowUp,
  scheduleCoachFollowUp,
  type CoachInterventionOutcomeObservation,
} from '../src/coach-closed-loop';
import { buildCoachMessageAdaptation } from '../src/coach-message-adaptation';
import type { UnifiedTrainingSession } from '../src/unified-training';

function session(discipline: 'swim' | 'bike' | 'run' | 'strength', overrides: Partial<UnifiedTrainingSession> = {}): UnifiedTrainingSession {
  return {
    id: `${discipline}-1`,
    date: '2026-08-10',
    title: discipline === 'bike' ? 'Bike workout' : `${discipline} workout`,
    discipline,
    durationMinutes: 60,
    intensity: 'hard',
    cardiovascularDemand: discipline === 'strength' ? 'moderate' : 'high',
    musculoskeletalDemand: discipline === 'swim' ? 'low' : 'moderate',
    lowerBodyDemand: discipline === 'swim' ? 'none' : 'moderate',
    upperBodyDemand: discipline === 'swim' || discipline === 'strength' ? 'moderate' : 'none',
    impact: discipline === 'run' ? 'high' : 'none',
    technicalDemand: discipline === 'swim' ? 'high' : 'moderate',
    recoveryCost: 3,
    priority: 'recommended',
    source: 'side_quest',
    keySession: false,
    ...overrides,
  };
}

function adaptation(message: string, discipline: 'swim' | 'bike' | 'run' | 'strength' = 'run') {
  const planned = session(discipline);
  return buildCoachMessageAdaptation({
    message,
    session: planned,
    weekSessions: [planned],
    availableDates: ['2026-08-11', '2026-08-12'],
    availableDisciplines: discipline === 'swim' ? ['bike', 'run'] : ['swim', 'bike'],
  });
}

function observation(
  id: string,
  fingerprint: ReturnType<typeof fingerprintCoachIntervention>,
  response: 'better' | 'same' | 'worse' | 'not_completed',
): CoachInterventionOutcomeObservation {
  const mapped = outcomeRatingFromFollowUp(response);
  return {
    id,
    interventionId: `intervention-${id}`,
    observedAt: `2026-08-${String(10 + Number(id.replace(/\D/g, '') || 0)).padStart(2, '0')}T20:00:00.000Z`,
    fingerprint,
    ...mapped,
  };
}

describe('coach closed loop', () => {
  it('explains protection using function instead of the pain number alone', () => {
    const result = adaptation('My knee is only 4/10 but I had to stop my run.', 'run');
    const option = result.adjustment.options.find((item) => item.id === result.adjustment.recommendedOptionId)!;
    const explanation = buildCoachDecisionExplanation({ discipline: 'run', adaptation: result, option });

    expect(explanation.tier).toBe('protection');
    expect(explanation.whatChanged).toContain('changed or stopped training');
    expect(explanation.whatChanged).toContain('functional effect');
    expect(explanation.whatWouldChangeTheCall).toContain('pain number alone');
  });

  it('schedules a higher-priority follow-up after a pain-protective change', () => {
    const result = adaptation('I have sharp knee pain on my run.', 'run');
    const option = result.adjustment.options[0]!;
    const followUp = scheduleCoachFollowUp({
      appliedAt: '2026-08-10T12:00:00.000Z',
      sessionDate: '2026-08-10',
      adaptation: result,
      option,
    });

    expect(followUp.priority).toBe('high');
    expect(followUp.promptKind).toBe('safety_check');
    expect(followUp.question).toContain('symptoms and function');
    const hours = (new Date(followUp.dueAt).getTime() - new Date('2026-08-10T12:00:00.000Z').getTime()) / 3_600_000;
    expect(hours).toBeGreaterThanOrEqual(12);
    expect(hours).toBeLessThanOrEqual(30);
  });

  it('uses a normal outcome follow-up for an ordinary time adaptation', () => {
    const result = adaptation('I only have 30 minutes for my bike ride.', 'bike');
    const option = result.adjustment.options.find((item) => item.id === result.adjustment.recommendedOptionId)!;
    const followUp = scheduleCoachFollowUp({
      appliedAt: '2026-08-10T10:00:00.000Z',
      sessionDate: '2026-08-10',
      adaptation: result,
      option,
    });
    expect(followUp.priority).toBe('normal');
    expect(followUp.promptKind).toBe('adaptation_outcome');
  });

  it('does not claim a personal effect pattern from one or two outcomes', () => {
    const result = adaptation('My legs are sore; make the ride easier.', 'bike');
    const option = result.adjustment.options.find((item) => item.id === result.adjustment.recommendedOptionId)!;
    const fingerprint = fingerprintCoachIntervention('bike', result, option);
    const patterns = learnCoachInterventionEffects([
      observation('1', fingerprint, 'better'),
      observation('2', fingerprint, 'better'),
    ]);

    expect(patterns[0]?.confidence).toBe('low');
    expect(patterns[0]?.direction).toBe('mixed');
    expect(buildProactiveCoachCue(patterns[0]!)).toBeNull();
  });

  it('learns a helpful intervention only after repeated athlete-specific outcomes', () => {
    const result = adaptation('My legs are sore; make the ride easier.', 'bike');
    const option = result.adjustment.options.find((item) => item.id === result.adjustment.recommendedOptionId)!;
    const fingerprint = fingerprintCoachIntervention('bike', result, option);
    const patterns = learnCoachInterventionEffects([
      observation('1', fingerprint, 'better'),
      observation('2', fingerprint, 'better'),
      observation('3', fingerprint, 'better'),
    ]);

    expect(patterns[0]?.confidence).toBe('moderate');
    expect(patterns[0]?.direction).toBe('helpful');
    expect(patterns[0]?.helpedRate).toBe(1);
    const cue = buildProactiveCoachCue(patterns[0]!);
    expect(cue?.automaticChangeAllowed).toBe(false);
    expect(cue?.headline).toContain('personal response pattern');
  });

  it('learns caution when a repeated intervention has more harmful outcomes', () => {
    const result = adaptation('My legs are sore; make the ride easier.', 'bike');
    const option = result.adjustment.options.find((item) => item.id === result.adjustment.recommendedOptionId)!;
    const fingerprint = fingerprintCoachIntervention('bike', result, option);
    const patterns = learnCoachInterventionEffects([
      observation('1', fingerprint, 'worse'),
      observation('2', fingerprint, 'worse'),
      observation('3', fingerprint, 'same'),
    ]);

    expect(patterns[0]?.direction).toBe('caution');
    expect(buildProactiveCoachCue(patterns[0]!)?.level).toBe('attention');
  });

  it('keeps non-completion separate from a harmful symptom outcome', () => {
    const result = adaptation('I only have 30 minutes for my bike ride.', 'bike');
    const option = result.adjustment.options.find((item) => item.id === result.adjustment.recommendedOptionId)!;
    const fingerprint = fingerprintCoachIntervention('bike', result, option);
    const pattern = learnCoachInterventionEffects([
      observation('1', fingerprint, 'not_completed'),
      observation('2', fingerprint, 'better'),
      observation('3', fingerprint, 'same'),
    ])[0]!;

    expect(pattern.notCompleted).toBe(1);
    expect(pattern.hurt).toBe(0);
    expect(pattern.completionRate).toBeCloseTo(2 / 3);
  });

  it('does not mix menstrual intervention learning with focal musculoskeletal pain', () => {
    const menstrual = adaptation('I am on my period with cramps and I would rather ride easy indoors.', 'bike');
    const menstrualOption = menstrual.adjustment.options.find((item) => item.id === menstrual.adjustment.recommendedOptionId)!;
    const menstrualFingerprint = fingerprintCoachIntervention('bike', menstrual, menstrualOption);
    const pain = adaptation('My knee hurts on the bike and I need to stop.', 'bike');
    const painOption = pain.adjustment.options.find((item) => item.id === pain.adjustment.recommendedOptionId)!;
    const painFingerprint = fingerprintCoachIntervention('bike', pain, painOption);

    const patterns = learnCoachInterventionEffects([
      observation('1', menstrualFingerprint, 'better'),
      observation('2', menstrualFingerprint, 'better'),
      observation('3', menstrualFingerprint, 'better'),
      observation('4', painFingerprint, 'worse'),
    ]);

    expect(patterns).toHaveLength(2);
    const menstrualPattern = findCoachInterventionEffectPattern(menstrualFingerprint, patterns);
    const painPattern = findCoachInterventionEffectPattern(painFingerprint, patterns);
    expect(menstrualPattern?.fingerprint.menstrual).toBe(true);
    expect(painPattern?.fingerprint.painKind).toBe('focal_musculoskeletal');
  });

  it('deduplicates repeated outcome writes by observation id', () => {
    const result = adaptation('I only have 30 minutes for my bike ride.', 'bike');
    const option = result.adjustment.options.find((item) => item.id === result.adjustment.recommendedOptionId)!;
    const fingerprint = fingerprintCoachIntervention('bike', result, option);
    const repeated = observation('1', fingerprint, 'better');
    const pattern = learnCoachInterventionEffects([repeated, repeated, observation('2', fingerprint, 'same')])[0]!;
    expect(pattern.observations).toBe(2);
  });

  it('builds a contextual learned explanation without allowing it to become a safety override', () => {
    const fatigue = adaptation('My legs are sore; make the ride easier.', 'bike');
    const fatigueOption = fatigue.adjustment.options.find((item) => item.id === fatigue.adjustment.recommendedOptionId)!;
    const fingerprint = fingerprintCoachIntervention('bike', fatigue, fatigueOption);
    const pattern = learnCoachInterventionEffects([
      observation('1', fingerprint, 'better'),
      observation('2', fingerprint, 'better'),
      observation('3', fingerprint, 'better'),
    ])[0]!;
    const explanation = buildCoachDecisionExplanation({ discipline: 'bike', adaptation: fatigue, option: fatigueOption, learnedPattern: pattern });
    expect(explanation.learnedContext).toContain('has helped');

    const pain = adaptation('My knee is 4/10 and I had to stop my bike workout.', 'bike');
    const painOption = pain.adjustment.options.find((item) => item.id === pain.adjustment.recommendedOptionId)!;
    const protectedExplanation = buildCoachDecisionExplanation({ discipline: 'bike', adaptation: pain, option: painOption, learnedPattern: pattern });
    expect(protectedExplanation.tier).toBe('protection');
  });
});
