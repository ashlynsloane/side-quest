import { describe, expect, it } from 'vitest';
import {
  decideCoachClarification,
  isCoachClarificationCorrection,
  resolveCoachClarificationAnswer,
} from '../src/coach-clarification';
import { interpretCoachMessage } from '../src/coach-message-adaptation';

describe('coach clarification', () => {
  it('asks about function instead of guessing from a vague body sensation', () => {
    const message = 'My hip feels weird today.';
    const decision = decideCoachClarification(message, interpretCoachMessage(message));
    expect(decision.required).toBe(true);
    expect(decision.kind).toBe('function');
    expect(decision.question).toContain('movement or training');
  });

  it('does not interrupt a clear time constraint', () => {
    const message = 'I only have 30 minutes for my bike ride.';
    const decision = decideCoachClarification(message, interpretCoachMessage(message));
    expect(decision.required).toBe(false);
  });

  it('does not use clarification to weaken a clear function-limiting pain report', () => {
    const message = 'My knee is 4/10 and I had to stop my run.';
    const interpretation = interpretCoachMessage(message);
    const decision = decideCoachClarification(message, interpretation);
    expect(interpretation.painContext?.stoppedSession).toBe(true);
    expect(decision.required).toBe(false);
  });

  it('turns an affirmative function answer into structured function-limiting context', () => {
    const resolved = resolveCoachClarificationAnswer('function', 'My hip feels weird today.', 'Yes, I started limping.');
    expect(resolved.resolved).toBe(true);
    expect(resolved.effectiveMessage).toContain('function-limiting injury-like symptom');
    const interpretation = interpretCoachMessage(resolved.effectiveMessage!);
    expect(interpretation.reason).toBe('pain');
    expect(interpretation.painContext?.functionalInterference).toBe('modified_session');
  });

  it('does not invent a training restriction when function was unaffected', () => {
    const resolved = resolveCoachClarificationAnswer('function', 'My hip feels weird today.', 'No, I moved and trained normally.');
    expect(resolved.resolved).toBe(true);
    expect(resolved.noTrainingChange).toBe(true);
    expect(resolved.coachResponse).toContain('would not change the plan');
  });

  it('recognizes a natural correction to a recently resolved function question', () => {
    expect(isCoachClarificationCorrection('function', 'Well actually I did start limping yesterday.')).toBe(true);
    expect(isCoachClarificationCorrection('function', 'I only have 30 minutes tomorrow.')).toBe(false);
  });

  it('keeps asking when the answer does not resolve the ambiguity', () => {
    const resolved = resolveCoachClarificationAnswer('function', 'My hip feels weird today.', 'I am not sure.');
    expect(resolved.resolved).toBe(false);
  });
});
