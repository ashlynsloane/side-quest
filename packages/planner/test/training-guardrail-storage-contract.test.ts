import { describe, expect, it } from 'vitest';
import { evaluateTrainingAddition } from '../src/daily-training-guardrails';
describe('missing budget is not implicit clearance', () => { it('requires explicit prescription', () => { expect(evaluateTrainingAddition({ date: '2026-11-09', planned: [], recovery: { general: 'stable' }, restrictUnplanned: true }, { activity: 'bike', regions: ['general'], minutes: 10, scheduled: true }).decision).toBe('defer'); }); });
