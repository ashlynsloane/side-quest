import { describe, expect, it } from 'vitest';
import { decideCoachClarification } from '../src/coach-clarification';
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
});
