import { describe, expect, it } from 'vitest';

import {
  assessPainContext,
  buildCycleTrainingForecast,
  buildPainCalibration,
  evaluateProtectiveTrainingRequest,
  interpretAthleteContextMessage,
  type PainContextObservation,
} from '../src/athlete-context-intelligence';

function observation(overrides: Partial<PainContextObservation> = {}): PainContextObservation {
  return {
    id: 'pain-1',
    occurredAt: '2026-08-07T12:00:00.000Z',
    discipline: 'run',
    kind: 'focal_musculoskeletal',
    score0to10: 4,
    focal: true,
    newOrUnfamiliar: true,
    worsening: false,
    functionalInterference: 'stopped_session',
    affectedArea: 'lower_body',
    stoppedSession: true,
    signals: [],
    ...overrides,
  };
}

describe('athlete context intelligence', () => {
  it('protects a modest numeric pain score when focal pain stopped the session', () => {
    const report = interpretAthleteContextMessage('My knee pain was only 4/10 but I had to quit my track workout.').pain!;
    const assessment = assessPainContext(report);

    expect(report.score0to10).toBe(4);
    expect(report.functionalInterference).toBe('stopped_session');
    expect(report.focal).toBe(true);
    expect(assessment.level).toBe('protect');
    expect(assessment.explanations.some((line) => line.includes('session to stop'))).toBe(true);
  });

  it('protects explicit bone-stress context without needing high pain or the literal word pain', () => {
    const report = interpretAthleteContextMessage('I have a stress fracture in my foot and it is 4/10.').pain!;
    const assessment = assessPainContext(report);

    expect(report.kind).toBe('focal_musculoskeletal');
    expect(report.score0to10).toBe(4);
    expect(report.signals).toContain('Bone-stress/fracture context');
    expect(assessment.level).toBe('protect');
  });

  it('does not classify familiar non-limiting menstrual pain as a focal musculoskeletal injury signal', () => {
    const context = interpretAthleteContextMessage('My period cramps are 7/10 today but I can train; I would rather ride easier indoors.');
    const assessment = assessPainContext(context.pain!);

    expect(context.pain?.kind).toBe('menstrual');
    expect(context.pain?.focal).toBe(false);
    expect(context.menstrual?.preferredAdjustments).toContain('indoor_bike');
    expect(context.menstrual?.preferredAdjustments).toContain('easier');
    expect(assessment.level).toBe('monitor');
  });

  it('treats ordinary DOMS as recovery context rather than injury-like pain', () => {
    const report = interpretAthleteContextMessage('My quads are 6/10 sore from lifting yesterday, but it is just muscle soreness.').pain!;
    const assessment = assessPainContext(report);

    expect(report.kind).toBe('post_exercise_soreness');
    expect(assessment.level).toBe('monitor');
  });

  it('recognizes normal effort discomfort separately from injury-like pain', () => {
    const report = interpretAthleteContextMessage('My legs are burning from pushing hard in the intervals.').pain!;
    const assessment = assessPainContext(report);

    expect(report.kind).toBe('training_exertion');
    expect(assessment.level).toBe('expected');
  });

  it('learns when an athlete uses low pain numbers despite meaningful functional impact', () => {
    const calibration = buildPainCalibration([
      observation({ id: 'a', score0to10: 3 }),
      observation({ id: 'b', score0to10: 4, functionalInterference: 'modified_session', stoppedSession: false }),
      observation({ id: 'c', score0to10: 4 }),
      observation({ id: 'd', score0to10: 2, functionalInterference: 'noticeable', stoppedSession: false }),
    ]);

    expect(calibration.ratingPattern).toBe('numbers_run_low');
    expect(calibration.confidence).toBe('moderate');
  });

  it('can learn that high numbers often have limited functional impact without dismissing them', () => {
    const calibration = buildPainCalibration([
      observation({ id: 'a', kind: 'menstrual', score0to10: 7, focal: false, newOrUnfamiliar: false, functionalInterference: 'noticeable', stoppedSession: false }),
      observation({ id: 'b', kind: 'menstrual', score0to10: 8, focal: false, newOrUnfamiliar: false, functionalInterference: 'noticeable', stoppedSession: false }),
      observation({ id: 'c', kind: 'menstrual', score0to10: 6, focal: false, newOrUnfamiliar: false, functionalInterference: 'none', stoppedSession: false }),
    ]);

    expect(calibration.ratingPattern).toBe('numbers_run_high');
    expect(calibration.explanations.some((line) => line.includes('function and pain type'))).toBe(true);
  });

  it('never lets pain-scale calibration downgrade focal function-limiting pain', () => {
    const calibration = buildPainCalibration([
      observation({ id: 'a', score0to10: 7, functionalInterference: 'noticeable', stoppedSession: false, newOrUnfamiliar: false }),
      observation({ id: 'b', score0to10: 8, functionalInterference: 'noticeable', stoppedSession: false, newOrUnfamiliar: false }),
      observation({ id: 'c', score0to10: 6, functionalInterference: 'none', stoppedSession: false, newOrUnfamiliar: false }),
    ]);
    const assessment = assessPainContext(observation({ score0to10: 4 }), calibration);

    expect(calibration.ratingPattern).toBe('numbers_run_high');
    expect(assessment.level).toBe('protect');
  });

  it('does not prescribe a cycle-based reduction without an athlete-specific pattern', () => {
    const forecast = buildCycleTrainingForecast({
      daysUntilPredictedPeriod: 1,
      predictionConfidence: 'high',
      observations: [
        { id: 'c1', occurredAt: '2026-06-01', daysFromPeriodStart: 0, symptoms: ['cramps'], affectedTraining: true, selectedAdjustments: ['shorter'] },
      ],
    });

    expect(forecast.mode).toBe('context_only');
    expect(forecast.suggestedAdjustments).toEqual([]);
  });

  it('offers pre-emptive options when a repeated personal cycle pattern is established', () => {
    const forecast = buildCycleTrainingForecast({
      daysUntilPredictedPeriod: 1,
      predictionConfidence: 'high',
      observations: [
        { id: 'c1', occurredAt: '2026-05-01', daysFromPeriodStart: 0, symptoms: ['cramps', 'fatigue'], affectedTraining: true, selectedAdjustments: ['shorter', 'indoor_bike'] },
        { id: 'c2', occurredAt: '2026-06-01', daysFromPeriodStart: -1, symptoms: ['cramps'], affectedTraining: true, selectedAdjustments: ['shorter'] },
        { id: 'c3', occurredAt: '2026-07-01', daysFromPeriodStart: 1, symptoms: ['cramps', 'fatigue'], affectedTraining: true, selectedAdjustments: ['indoor_bike'] },
      ],
    });

    expect(forecast.mode).toBe('offer_preemptive_options');
    expect(forecast.likelySymptoms).toContain('cramps');
    expect(forecast.suggestedAdjustments.length).toBeGreaterThan(0);
  });

  it('uses active menstrual symptoms before any predicted phase', () => {
    const active = interpretAthleteContextMessage('I am on my period with cramps and I want a shorter easy ride indoors.').menstrual!;
    const forecast = buildCycleTrainingForecast({
      daysUntilPredictedPeriod: 0,
      predictionConfidence: 'low',
      observations: [],
      activeSymptoms: active,
    });

    expect(forecast.mode).toBe('active_symptom_adjustment');
    expect(forecast.suggestedAdjustments).toContain('indoor_bike');
    expect(forecast.suggestedAdjustments).toContain('shorter');
  });

  it('blocks a compensatory century after a recent pain-limited track workout even when the prior score was only 4/10', () => {
    const decision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T12:00:00.000Z',
      recentPain: [observation({ occurredAt: '2026-08-07T12:00:00.000Z', score0to10: 4 })],
      requestedDiscipline: 'bike',
      requestedLargeTrainingLoad: true,
      compensatoryTrainingIntent: true,
      headspace: 'frustrated',
    });

    expect(decision.action).toBe('protect');
    expect(decision.maximumSuggestedIntensity).toBe('easy');
    expect(decision.maximumSuggestedDurationMinutes).toBe(45);
    expect(decision.explanations.some((line) => line.includes('compensatory'))).toBe(true);
    expect(decision.explanations.some((line) => line.includes('frustrated'))).toBe(true);
  });

  it('holds progression after a recent lower-body pain interruption when the next session loads the same area', () => {
    const decision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T12:00:00.000Z',
      recentPain: [observation({ occurredAt: '2026-08-07T12:00:00.000Z' })],
      requestedDiscipline: 'bike',
      requestedIntensity: 'moderate',
    });

    expect(decision.action).toBe('hold_escalation');
    expect(decision.maximumSuggestedIntensity).toBe('moderate');
  });

  it('keeps low-load cross-training available when it does not meaningfully load the affected area', () => {
    const decision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T12:00:00.000Z',
      recentPain: [observation({ occurredAt: '2026-08-07T12:00:00.000Z', affectedArea: 'lower_body' })],
      requestedDiscipline: 'swim',
      requestedIntensity: 'easy',
      requestedDurationMinutes: 40,
    });

    expect(decision.action).toBe('allow');
    expect(decision.explanations.some((line) => line.includes('cross-training'))).toBe(true);
  });

  it('does not route menstrual symptoms through the recent injury-like pain escalation guard', () => {
    const menstrual = observation({
      id: 'cycle-1',
      kind: 'menstrual',
      focal: false,
      newOrUnfamiliar: false,
      functionalInterference: 'stopped_session',
      affectedArea: 'general',
      stoppedSession: true,
      score0to10: 7,
    });
    const decision = evaluateProtectiveTrainingRequest({
      now: '2026-08-08T12:00:00.000Z',
      recentPain: [menstrual],
      requestedDiscipline: 'bike',
      requestedIntensity: 'moderate',
    });

    expect(decision.action).toBe('allow');
  });
});
