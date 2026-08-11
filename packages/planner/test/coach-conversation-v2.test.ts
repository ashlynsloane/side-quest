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

  it('rejects requested event references that are missing from the frame', () => {
    const result = validateCoachTurnFrame(frame({
      intent: 'modify_planned_session',
      requestedChange: { action: 'move', targetEventSemanticId: 'missing-event', date: '2026-08-09' },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('requestedChange.targetEventSemanticId must reference an event in the frame.');
  });

  it('allows a completed workout to be symptom context without making it the target', () => {
    const result = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      intent: 'report_symptom',
      horizon: 'past',
      events: [{ semanticId: 'ride-source', eventId: 'ride-1', discipline: 'bike', temporalRole: 'completed', relationToTurn: 'symptom_source' }],
      symptoms: [{ semanticId: 'hip-1', bodyArea: 'hip', category: 'musculoskeletal', functionChanged: true, changedMovement: true, sourceEventSemanticId: 'ride-source' }],
    }));
    expect(result.directive.targetEventId).toBeUndefined();
    expect(result.directive.action).toBe('none');
    expect(result.directive.safetyFacts.functionChanged).toBe(true);
    expect(result.directive.safetyFacts.changedMovement).toBe(true);
  });

  it('keeps symptom source and future change target as separate events', () => {
    const result = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      intent: 'modify_planned_session',
      events: [
        { semanticId: 'ride-source', eventId: 'ride-done', discipline: 'bike', temporalRole: 'completed', relationToTurn: 'symptom_source' },
        { semanticId: 'run-target', eventId: 'run-tomorrow', discipline: 'run', temporalRole: 'planned', date: '2026-08-08', relationToTurn: 'change_target' },
      ],
      symptoms: [{ semanticId: 'hip-1', bodyArea: 'hip', functionChanged: true, changedMovement: true, sourceEventSemanticId: 'ride-source' }],
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

  it('does not leak an old editable target into a new retrospective symptom report', () => {
    const first = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      turnId: 'turn-old-target',
      intent: 'modify_planned_session',
      events: [{ semanticId: 'old-bike', eventId: 'bike-old', discipline: 'bike', temporalRole: 'planned', date: '2026-08-07', relationToTurn: 'change_target' }],
      requestedChange: { action: 'shorten', targetEventSemanticId: 'old-bike', durationMinutes: 45 },
    }));
    const symptom = reduceCoachDialogue(first.state, frame({
      turnId: 'turn-new-symptom',
      intent: 'report_symptom',
      horizon: 'past',
      events: [{ semanticId: 'completed-run', eventId: 'run-done', discipline: 'run', temporalRole: 'completed', relationToTurn: 'symptom_source' }],
      symptoms: [{ semanticId: 'knee-1', bodyArea: 'knee', category: 'musculoskeletal', functionChanged: true, changedMovement: true, sourceEventSemanticId: 'completed-run' }],
    }));
    expect(symptom.directive.action).toBe('none');
    expect(symptom.directive.targetEventId).toBeUndefined();
  });

  it('uses the future focus date instead of a previous active target', () => {
    const first = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      turnId: 'turn-bike',
      intent: 'modify_planned_session',
      events: [{ semanticId: 'today-bike', eventId: 'bike-today', discipline: 'bike', temporalRole: 'planned', date: '2026-08-07', relationToTurn: 'change_target' }],
      requestedChange: { action: 'shorten', targetEventSemanticId: 'today-bike', durationMinutes: 45 },
    }));
    const tomorrow = reduceCoachDialogue(first.state, frame({
      turnId: 'turn-tomorrow',
      intent: 'ask_about_future_training',
      horizon: 'tomorrow',
      events: [{ semanticId: 'tomorrow-run', eventId: 'run-tomorrow', discipline: 'run', temporalRole: 'planned', date: '2026-08-08', relationToTurn: 'context' }],
      requestedChange: { action: 'evaluate', date: '2026-08-08' },
    }));
    expect(tomorrow.directive.action).toBe('evaluate');
    expect(tomorrow.directive.targetEventId).toBe('run-tomorrow');
    expect(tomorrow.directive.targetDiscipline).toBe('run');
  });

  it('applies a correction to the active symptom fact instead of creating an unrelated topic', () => {
    const first = reduceCoachDialogue(emptyCoachDialogueState(), frame({
      turnId: 'turn-1',
      intent: 'report_symptom',
      symptoms: [{ semanticId: 'hip-1', bodyArea: 'hip', functionChanged: false, changedMovement: false, changedTraining: false }],
    }));
    const corrected = reduceCoachDialogue(first.state, frame({
      turnId: 'turn-2',
      intent: 'correct_previous_statement',
      symptoms: [{ semanticId: 'hip-1', bodyArea: 'hip', functionChanged: true, changedMovement: true, changedTraining: true }],
      correction: { target: 'symptom_function' },
    }));
    expect(corrected.state.activeConcern?.semanticId).toBe('hip-1');
    expect(corrected.directive.safetyFacts.functionChanged).toBe(true);
    expect(corrected.directive.safetyFacts.changedMovement).toBe(true);
    expect(corrected.directive.safetyFacts.changedTraining).toBe(true);
  });

  it('represents a vague body concern before deciding what it means', () => {
    const vague = buildDeterministicCoachTurnFrame('My hip feels weird today.', undefined, {
      turnId: 'vague-hip',
      referenceDate: '2026-08-07',
    });
    const transition = reduceCoachDialogue(emptyCoachDialogueState(), vague);
    expect(vague.intent).toBe('report_symptom');
    expect(vague.symptoms[0]?.category).toBe('unknown');
    expect(vague.symptoms[0]?.functionChanged).toBeUndefined();
    expect(transition.directive.clarification?.kind).toBe('clarify_function');
  });

  it('records a negative function answer on the same semantic concern', () => {
    const vague = buildDeterministicCoachTurnFrame('My hip feels weird today.', undefined, {
      turnId: 'vague-hip',
      referenceDate: '2026-08-07',
    });
    const first = reduceCoachDialogue(emptyCoachDialogueState(), vague);
    const answer = buildDeterministicCoachTurnFrame('No, I trained normally.', undefined, {
      turnId: 'hip-answer-no',
      referenceDate: '2026-08-07',
      pendingQuestionKind: first.state.pendingQuestion?.kind,
      activeConcern: first.state.activeConcern,
    });
    const second = reduceCoachDialogue(first.state, answer);
    expect(answer.intent).toBe('correct_previous_statement');
    expect(second.state.activeConcern?.semanticId).toBe(first.state.activeConcern?.semanticId);
    expect(second.state.activeConcern?.functionChanged).toBe(false);
    expect(second.directive.safetyFacts.functionChanged).toBe(false);
    expect(second.state.pendingQuestion).toBeUndefined();
  });

  it('can correct that function answer later without starting a new concern', () => {
    const vague = buildDeterministicCoachTurnFrame('My hip feels weird today.', undefined, {
      turnId: 'vague-hip',
      referenceDate: '2026-08-07',
    });
    const first = reduceCoachDialogue(emptyCoachDialogueState(), vague);
    const noAnswer = buildDeterministicCoachTurnFrame('No, I trained normally.', undefined, {
      turnId: 'hip-answer-no',
      referenceDate: '2026-08-07',
      pendingQuestionKind: first.state.pendingQuestion?.kind,
      activeConcern: first.state.activeConcern,
    });
    const second = reduceCoachDialogue(first.state, noAnswer);
    const correction = frame({
      turnId: 'hip-correction',
      intent: 'correct_previous_statement',
      symptoms: [{
        semanticId: second.state.activeConcern!.semanticId,
        bodyArea: second.state.activeConcern?.bodyArea,
        category: second.state.activeConcern?.category,
        functionChanged: true,
        changedMovement: true,
      }],
      correction: { target: 'symptom_function' },
    });
    const third = reduceCoachDialogue(second.state, correction);
    expect(third.state.activeConcern?.semanticId).toBe(first.state.activeConcern?.semanticId);
    expect(third.directive.safetyFacts.functionChanged).toBe(true);
    expect(third.directive.safetyFacts.changedMovement).toBe(true);
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
