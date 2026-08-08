import { describe, expect, it } from 'vitest';

import { emptyCoachDialogueState, reduceCoachDialogue } from '../src/coach-dialogue-engine';
import { runCoachLanguageInterpreter } from '../src/coach-language-interpreter';
import { validateCoachTurnFrame, type CoachTurnFrameV2 } from '../src/coach-semantic-frame';
import { buildDeterministicCoachTurnFrame } from '../src/coach-semantic-fallback';

function frame(overrides: Partial<CoachTurnFrameV2> = {}): CoachTurnFrameV2 {
  return {
    version: 2,
    turnId: 'turn-1',
    intent: 'general_update',
    horizon: 'today',
    events: [],
    symptoms: [],
    constraints: [],
    unresolved: [],
    confidence: 0.9,
    source: 'test_fixture',
    ...overrides,
  };
}

describe('Coach Conversation Engine V2', () => {
  it('rejects a frame that tries to rewrite completed training', () => {
    const candidate = frame({
      intent: 'modify_planned_session',
      events: [{ semanticId: 'ride-1', eventId: 'ride-1', discipline: 'bike', temporalRole: 'completed' }],
      requestedChange: { action: 'move', targetEventSemanticId: 'ride-1', date: '2026-08-09' },
    });
    const result = validateCoachTurnFrame(candidate);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('A completed event cannot be an editable training target.');
  });

  it('allows a completed workout to be symptom context without making it the target', () => {
    const result = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      intent: 'report_symptom',
      horizon: 'past',
      events: [{ semanticId: 'ride-source', eventId: 'ride-1', discipline: 'bike', temporalRole: 'completed', relationToTurn: 'symptom_source' }],
      symptoms: [{ semanticId: 'hip-1', bodyArea: 'hip', category: 'musculoskeletal', changedMovement: true, sourceEventSemanticId: 'ride-source' }],
    }));
    expect(result.directive.targetEventId).toBeUndefined();
    expect(result.directive.action).toBe('none');
    expect(result.directive.safetyFacts.changedMovement).toBe(true);
  });

  it('keeps symptom source and future change target as separate events', () => {
    const result = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      intent: 'modify_planned_session',
      events: [
        { semanticId: 'ride-source', eventId: 'ride-done', discipline: 'bike', temporalRole: 'completed', relationToTurn: 'symptom_source' },
        { semanticId: 'run-target', eventId: 'run-tomorrow', discipline: 'run', temporalRole: 'planned', date: '2026-08-08', relationToTurn: 'change_target' },
      ],
      symptoms: [{ semanticId: 'hip-1', bodyArea: 'hip', changedMovement: true, sourceEventSemanticId: 'ride-source' }],
      requestedChange: { action: 'evaluate', targetEventSemanticId: 'run-target', date: '2026-08-08' },
    }));
    expect(result.directive.targetEventId).toBe('run-tomorrow');
    expect(result.directive.targetDiscipline).toBe('run');
  });

  it('treats a future date question as evaluation rather than rescheduling', () => {
    const result = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      intent: 'ask_about_future_training',
      horizon: 'tomorrow',
      events: [{ semanticId: 'tomorrow-run', eventId: 'run-1', discipline: 'run', temporalRole: 'planned', date: '2026-08-08', relationToTurn: 'context' }],
      requestedChange: { action: 'evaluate', date: '2026-08-08' },
    }));
    expect(result.directive.action).toBe('evaluate');
    expect(result.directive.focusDate).toBe('2026-08-08');
    expect(result.directive.requestedDate).toBe('2026-08-08');
  });

  it('applies a correction to the active symptom fact instead of creating an unrelated topic', () => {
    const first = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      turnId: 'turn-1',
      intent: 'report_symptom',
      symptoms: [{ semanticId: 'hip-1', bodyArea: 'hip', changedMovement: false, changedTraining: false }],
    }));
    const corrected = reduceCoachDialogue(first.state, frame({
      turnId: 'turn-2',
      intent: 'correct_previous_statement',
      symptoms: [{ semanticId: 'hip-1', bodyArea: 'hip', changedMovement: true, changedTraining: true }],
      correction: { target: 'symptom_function' },
    }));
    expect(corrected.state.activeConcern?.semanticId).toBe('hip-1');
    expect(corrected.directive.safetyFacts.changedMovement).toBe(true);
    expect(corrected.directive.safetyFacts.changedTraining).toBe(true);
  });

  it('asks for a target rather than guessing when a modification has no planned target', () => {
    const result = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      intent: 'modify_planned_session',
      requestedChange: { action: 'move', date: '2026-08-09' },
    }));
    expect(result.directive.clarification?.kind).toBe('clarify_target');
    expect(result.directive.targetEventId).toBeUndefined();
  });

  it('uses unresolved semantic slots as the clarification contract', () => {
    const result = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      intent: 'report_schedule_constraint',
      unresolved: ['which workout changed', 'available time'],
      confidence: 0.45,
    }));
    expect(result.directive.clarification?.missing).toEqual(['which workout changed', 'available time']);
  });

  it('rejects invalid model output before it reaches dialogue state', async () => {
    const result = await runCoachLanguageInterpreter({
      id: 'fake-model',
      interpret: async () => ({ intent: 'move everything' }),
    }, { message: 'Do something', referenceDate: '2026-08-07' });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts a valid model frame but gives it no plan-mutation authority', async () => {
    const candidate = frame({ intent: 'ask_about_future_training', requestedChange: { action: 'evaluate', date: '2026-08-08' } });
    const result = await runCoachLanguageInterpreter({ id: 'fake-model', interpret: async () => candidate }, {
      message: 'What about tomorrow?',
      referenceDate: '2026-08-07',
    });
    expect(result.ok).toBe(true);
    expect(result.frame?.requestedChange?.action).toBe('evaluate');
  });

  it('maps the current deterministic parser into V2 without treating after-my-ride as the target', () => {
    const result = buildDeterministicCoachTurnFrame('I was limping for a few minutes after my ride.', undefined, {
      turnId: 'fallback-1',
      referenceDate: '2026-08-07',
      knownPlannedEvents: [{ eventId: 'run-tomorrow', title: 'Easy run', discipline: 'run', date: '2026-08-08' }],
    });
    expect(result.intent).toBe('report_symptom');
    expect(result.events.find((event) => event.discipline === 'bike')?.temporalRole).toBe('completed');
    expect(result.requestedChange?.targetEventId).toBeUndefined();
  });

  it('maps what-about-tomorrow into evaluate rather than move', () => {
    const result = buildDeterministicCoachTurnFrame('What about tomorrow?', undefined, {
      turnId: 'fallback-2',
      referenceDate: '2026-08-07',
      knownPlannedEvents: [{ eventId: 'run-tomorrow', title: 'Easy run', discipline: 'run', date: '2026-08-08' }],
    });
    expect(result.intent).toBe('ask_about_future_training');
    expect(result.requestedChange?.action).toBe('evaluate');
    expect(result.requestedChange?.date).toBe('2026-08-08');
  });
});
