import { describe, expect, it } from 'vitest';

import { resolveCoachConversationMessage } from '../src/coach-conversation';
import { buildDailyAdjustmentOptions } from '../src/daily-adjustment';
import { interpretCoachMessage } from '../src/coach-message-adaptation';
import type { UnifiedTrainingSession } from '../src/unified-training';

function session(overrides: Partial<UnifiedTrainingSession> = {}): UnifiedTrainingSession {
  return {
    id: 'bike-1',
    date: '2026-08-12',
    title: 'Threshold ride',
    discipline: 'bike',
    durationMinutes: 75,
    intensity: 'hard',
    cardiovascularDemand: 'high',
    musculoskeletalDemand: 'moderate',
    lowerBodyDemand: 'high',
    upperBodyDemand: 'none',
    impact: 'none',
    technicalDemand: 'moderate',
    recoveryCost: 4,
    priority: 'required',
    source: 'side_quest',
    keySession: true,
    ...overrides,
  };
}

describe('coach conversation resolver', () => {
  it('keeps the prior target when the athlete asks to move it to a named weekday', () => {
    const previous = interpretCoachMessage('My legs are sore during my bike week.');
    const result = resolveCoachConversationMessage('Could we move it to Friday instead?', undefined, {
      previousInterpretation: previous,
      previousTargetDiscipline: 'bike',
      previousSessionDate: '2026-08-12',
      referenceDate: '2026-08-10',
    });

    expect(result.intent).toBe('refine_move');
    expect(result.targetDiscipline).toBe('bike');
    expect(result.preferredTargetDate).toBe('2026-08-14');
    expect(result.interpretation.requestedAction).toBe('move');
    expect(result.keepPriorTarget).toBe(true);
  });

  it('treats "I would rather swim" as a replacement preference, not a new swim target', () => {
    const previous = interpretCoachMessage('The weather is too icy for my bike ride.');
    const result = resolveCoachConversationMessage("I'd rather swim instead.", undefined, {
      previousInterpretation: previous,
      previousTargetDiscipline: 'bike',
      previousSessionDate: '2026-08-12',
      referenceDate: '2026-08-10',
    });

    expect(result.intent).toBe('refine_replacement');
    expect(result.targetDiscipline).toBe('bike');
    expect(result.preferredReplacementDiscipline).toBe('swim');
    expect(result.interpretation.requestedAction).toBe('different');
  });

  it('turns a duration-only reply into a refinement of the same session', () => {
    const previous = interpretCoachMessage('My legs are heavy on the bike today.');
    const result = resolveCoachConversationMessage('Make it 30 minutes.', undefined, {
      previousInterpretation: previous,
      previousTargetDiscipline: 'bike',
      previousSessionDate: '2026-08-12',
      referenceDate: '2026-08-10',
    });

    expect(result.intent).toBe('refine_duration');
    expect(result.targetDiscipline).toBe('bike');
    expect(result.interpretation.availableMinutes).toBe(30);
    expect(result.interpretation.requestedAction).toBe('shorter');
  });

  it('escalates worsening fatigue without losing the original target or affected area', () => {
    const previous = interpretCoachMessage('My legs are sore and heavy after yesterday.');
    const result = resolveCoachConversationMessage('Actually I feel worse now.', undefined, {
      previousInterpretation: previous,
      previousTargetDiscipline: 'run',
      previousSessionDate: '2026-08-12',
      referenceDate: '2026-08-10',
    });

    expect(result.intent).toBe('worsening');
    expect(result.recentFatigueTrend).toBe('worsening');
    expect(result.targetDiscipline).toBe('run');
    expect(result.interpretation.reason).toBe('fatigue');
    expect(result.interpretation.affectedArea).toBe('lower_body');
  });

  it('lets new focal pain override a previous ordinary-fatigue interpretation', () => {
    const previous = interpretCoachMessage('My legs are tired.');
    const result = resolveCoachConversationMessage('Actually my knee has sharp pain too.', undefined, {
      previousInterpretation: previous,
      previousTargetDiscipline: 'run',
      referenceDate: '2026-08-10',
    });

    expect(result.interpretation.reason).toBe('pain');
    expect(result.interpretation.focalPain).toBe(true);
    expect(result.interpretation.symptomSeverity).toBe(4);
    expect(result.targetDiscipline).toBe('run');
  });

  it('does not forget a prior pain signal just because the athlete asks to reschedule', () => {
    const previous = interpretCoachMessage('I have sharp knee pain on my run.');
    const result = resolveCoachConversationMessage('Could we just move it to Friday?', undefined, {
      previousInterpretation: previous,
      previousTargetDiscipline: 'run',
      referenceDate: '2026-08-10',
    });

    expect(result.interpretation.reason).toBe('pain');
    expect(result.interpretation.focalPain).toBe(true);
    expect(result.preferredTargetDate).toBe('2026-08-14');
  });

  it('allows a fresh adaptation after the athlete explicitly reports the pain is gone', () => {
    const previous = interpretCoachMessage('I have sharp knee pain on my run.');
    const result = resolveCoachConversationMessage('The pain is gone. Could we move it to Friday?', undefined, {
      previousInterpretation: previous,
      previousTargetDiscipline: 'run',
      referenceDate: '2026-08-10',
    });

    expect(result.interpretation.reason).toBe('preference');
    expect(result.interpretation.focalPain).toBeUndefined();
    expect(result.interpretation.requestedAction).toBe('move');
    expect(result.preferredTargetDate).toBe('2026-08-14');
  });

  it('recognizes confirmation and cancellation as conversation actions', () => {
    const context = { referenceDate: '2026-08-10' } as const;
    expect(resolveCoachConversationMessage('Do it', undefined, context).confirmProposal).toBe(true);
    expect(resolveCoachConversationMessage('Never mind, keep the original.', undefined, context).cancelProposal).toBe(true);
  });

  it('honors a requested move date only when it passes the existing spacing checks', () => {
    const planned = session();
    const hardFriday = session({ id: 'run-hard', date: '2026-08-14', discipline: 'run' });
    const result = buildDailyAdjustmentOptions({
      sessionId: planned.id,
      reason: 'preference',
      requestedAction: 'move',
      preferredTargetDate: '2026-08-14',
    }, {
      plannedSession: planned,
      weekSessions: [planned, hardFriday],
      availableDates: ['2026-08-13', '2026-08-14', '2026-08-15'],
    });

    const move = result.options.find((option) => option.action === 'move');
    expect(move?.targetDate).toBe('2026-08-13');
    expect(move?.description).toContain('requested date conflicts');
  });

  it('honors a safe requested replacement discipline before another available sport', () => {
    const planned = session({ lowerBodyDemand: 'moderate' });
    const result = buildDailyAdjustmentOptions({
      sessionId: planned.id,
      reason: 'preference',
      requestedAction: 'different',
      availableDisciplines: ['run', 'swim'],
      preferredReplacementDiscipline: 'swim',
    }, {
      plannedSession: planned,
      weekSessions: [planned],
      availableDates: ['2026-08-13'],
    });

    const replacement = result.options.find((option) => option.action === 'replace');
    expect(replacement?.replacementDiscipline).toBe('swim');
    expect(result.recommendedOptionId).toBe(replacement?.id);
  });
});
