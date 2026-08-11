import { describe, expect, it } from 'vitest';

import { evaluateCoachLanguageInterpreter, evaluateFrame } from '../src/coach-language-evals';
import type { CoachTurnFrameV2 } from '../src/coach-semantic-frame';

function validFrame(overrides: Partial<CoachTurnFrameV2> = {}): CoachTurnFrameV2 {
  return {
    version: 2,
    turnId: 'eval-turn',
    intent: 'ask_about_future_training',
    horizon: 'tomorrow',
    events: [],
    symptoms: [],
    requestedChange: { action: 'evaluate', date: '2026-08-08' },
    constraints: [],
    unresolved: [],
    confidence: 0.9,
    source: 'test_fixture',
    ...overrides,
  };
}

describe('Coach language interpreter eval harness', () => {
  it('reports semantic expectation failures without changing the frame', () => {
    const frame = validFrame();
    const failures = evaluateFrame(frame, { intent: 'modify_planned_session', action: 'move' });
    expect(failures).toHaveLength(2);
    expect(frame.intent).toBe('ask_about_future_training');
    expect(frame.requestedChange?.action).toBe('evaluate');
  });

  it('flags a completed event used as a target', () => {
    const frame = validFrame({
      events: [{ semanticId: 'done-bike', eventId: 'bike-1', discipline: 'bike', temporalRole: 'completed' }],
      requestedChange: { action: 'evaluate', targetEventSemanticId: 'done-bike', date: '2026-08-08' },
    });
    const failures = evaluateFrame(frame, { mustNotTargetCompleted: true });
    expect(failures).toContain('A completed event was used as an editable target.');
  });

  it('runs a custom corpus and returns a pass/fail report', async () => {
    const report = await evaluateCoachLanguageInterpreter({
      id: 'fixture-interpreter',
      interpret: async () => validFrame(),
    }, [
      {
        id: 'tomorrow-evaluate',
        input: { message: 'What about tomorrow?', referenceDate: '2026-08-07' },
        expected: { intent: 'ask_about_future_training', horizon: 'tomorrow', action: 'evaluate' },
      },
      {
        id: 'should-fail',
        input: { message: 'Move it', referenceDate: '2026-08-07' },
        expected: { intent: 'modify_planned_session', action: 'move' },
      },
    ]);
    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
  });
});
