import { describe, expect, it } from 'vitest';
import type { GeneratedWorkout, PlannedStrengthSession } from '@circuit/domain';
import { strengthSessionSignature, type StrengthChoiceDecision } from '../src/daily-strength-decision-sqlite';
import {
  reviewStrengthRevisionForDecision, type CurrentStrengthReviewEvidence,
} from '../src/strength-revision-decision-review';

const exercise = (target: number) => ({
  exerciseId: 'calf-raise',
  exerciseSnapshot: { id: 'calf-raise', name: 'Synthetic calf raise' },
  equipmentOptionId: 'bodyweight',
  prescriptionId: 'rx',
  target, unit: 'total' as const, order: 0,
});
function workout(): GeneratedWorkout {
  return {
    id: 'synthetic-workout', name: 'synthetic', createdAt: '2026-11-14T08:00:00Z',
    randomSeed: '1', request: {} as GeneratedWorkout['request'],
    stations: [{
      id: 'station-a', order: 0, durationSeconds: 1800,
      format: 'amrap', purpose: 'synthetic', exercises: [exercise(10)],
    }],
    totalWorkSeconds: 1800, totalRestSeconds: 600, estimatedElapsedSeconds: 2400,
    requiredEquipment: [], targetRegions: [], recentLoadAdjustments: [],
    source: 'generated',
  } as GeneratedWorkout;
}
function source(): PlannedStrengthSession {
  return {
    id: 'session-a', date: '2026-11-17', order: 0, title: 'Synthetic',
    purpose: 'maintenance', intendedLoad: 'light', focusTargets: [],
    workout: workout(), rationale: 'synthetic', completionStatus: 'planned',
  } as PlannedStrengthSession;
}
function candidate(): GeneratedWorkout {
  const w = workout();
  return {
    ...w, estimatedElapsedSeconds: 1920,
    totalWorkSeconds: 1500, totalRestSeconds: 420,
    stations: [{ ...w.stations[0]!, durationSeconds: 1500,
      exercises: [{ ...w.stations[0]!.exercises[0]!, target: 8 }] }],
  };
}
function decision(): StrengthChoiceDecision {
  return {
    id: 'decision-a', athleteId: 'synthetic-athlete', blockId: 'block-a',
    sessionId: 'session-a', sourceSignature: strengthSessionSignature(source()),
    action: 'reduce', decision: 'accepted',
    proposedMinutes: 32, createdAt: '2026-11-15T10:00:00Z',
  };
}
function evidence(): CurrentStrengthReviewEvidence {
  return {
    athleteId: 'synthetic-athlete', todayLocalDate: '2026-11-15',
    symptoms: 'clear', readiness: 'reviewed_adequate',
    providerRestrictions: 'verified_none', exerciseRestrictionsReviewed: true,
    sourceCoverage: 'complete',
  };
}
const review = (changes: {
  current?: Partial<CurrentStrengthReviewEvidence>;
  action?: Partial<StrengthChoiceDecision>;
  original?: PlannedStrengthSession;
  proposed?: GeneratedWorkout | null;
} = {}) => reviewStrengthRevisionForDecision({
  source: changes.original ?? source(), candidate: changes.proposed === undefined
    ? candidate() : changes.proposed,
  decision: { ...decision(), ...changes.action },
  evidence: { ...evidence(), ...changes.current },
});

describe('pre-approval strength decision reconciliation is never an authorization', () => {
  it('marks an intact synthetic proposal reviewable without authorizing execution', () => {
    expect(review()).toEqual({
      status: 'reviewable', reasons: [],
      sourceSignatureMatches: true, structuralReviewPassed: true,
      requiresAthleteApproval: true, requiresWriteTimeRevalidation: true,
      executableWorkoutApproved: false,
    });
  });
  it('fails closed for absent symptom, readiness, provider or history evidence', () => {
    for (const current of [
      { symptoms: 'unknown' as const },
      { symptoms: 'active' as const },
      { readiness: 'recover' as const },
      { readiness: 'unknown' as const },
      { providerRestrictions: 'unknown' as const },
      { providerRestrictions: 'active' as const },
      { exerciseRestrictionsReviewed: false },
      { sourceCoverage: 'incomplete' as const },
      { sourceCoverage: 'unknown' as const },
    ]) {
      const result = review({ current });
      expect(result.status).toBe('blocked');
      expect(result.executableWorkoutApproved).toBe(false);
    }
  });
  it('rejects wrong owner, stale source and changed session identity', () => {
    expect(review({ current: { athleteId: 'other' } }).status).toBe('blocked');
    expect(review({ original: { ...source(), title: 'regenerated' } })
      .sourceSignatureMatches).toBe(false);
    expect(review({ original: { ...source(), id: 'other' } }).status).toBe('blocked');
  });
  it('rejects closed, past and malformed session dates', () => {
    for (const original of [
      { ...source(), completionStatus: 'completed' as const },
      { ...source(), date: '2026-11-14' },
      { ...source(), date: '2026-02-30' },
    ]) expect(review({ original }).status).toBe('blocked');
    expect(review({ current: { todayLocalDate: '2026-11-31' } }).status).toBe('blocked');
  });
  it('rejects nonexistent candidate and inappropriate decision shapes', () => {
    expect(review({ proposed: null }).status).toBe('blocked');
    expect(review({ action: { action: 'defer', proposedMinutes: null } }).status).toBe('blocked');
    expect(review({ action: { proposedMinutes: 40 } }).status).toBe('blocked');
    expect(review({ action: { proposedMinutes: Number.NaN } }).status).toBe('blocked');
    expect(review({ action: { decision: 'restored' } }).status).toBe('blocked');
  });
  it('rejects structurally invalid exercise changes', () => {
    const increased = candidate();
    increased.stations[0]!.exercises[0]!.target = 15;
    const result = review({ proposed: increased });
    expect(result.status).toBe('blocked');
    expect(result.structuralReviewPassed).toBe(false);
  });
});
