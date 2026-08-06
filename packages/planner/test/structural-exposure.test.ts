import { describe, expect, it } from 'vitest';
import type { ExerciseMechanicalLoadProfile, StructuralExposureEntry } from '@circuit/domain';
import {
  candidateFitsStructuralDecision,
  decideStructuralExposure,
  structuralExposureFromEnduranceActivity,
  structuralExposureFromMechanicalProfiles,
} from '../src/structural-exposure';

const base = (id: string): ExerciseMechanicalLoadProfile => ({
  exerciseId: id, axialLoad: 'low', spinalStabilization: 'low', spinalFlexion: 'none', spinalExtension: 'low', rotation: 'none', antiRotation: 'none',
  eccentricDemand: 'low', impactDemand: 'none', tendonDemand: 'low', overheadDemand: 'none', shoulderRepetition: 'low', gripDemand: 'low',
  balanceDemand: 'low', unilateralStabilization: 'none', technicalDemand: 'low', rangeOfMotionDemand: 'low', source: 'derived', confidence: 'moderate', reviewReasons: [],
});

describe('regional and structural exposure', () => {
  it('detects lumbar accumulation across exercises targeting different muscles', () => {
    const row = { ...base('row'), spinalStabilization: 'high' as const, gripDemand: 'moderate' as const };
    const carry = { ...base('carry'), axialLoad: 'high' as const, spinalStabilization: 'high' as const, antiRotation: 'moderate' as const };
    const splitSquat = { ...base('split-squat'), spinalStabilization: 'moderate' as const, unilateralStabilization: 'high' as const };
    const entries = structuralExposureFromMechanicalProfiles({ profiles: [row, carry, splitSquat], occurredAt: '2026-07-28T12:00:00Z', sessionId: 's1' });
    expect(entries.filter((entry) => entry.region === 'lumbar_spine').length).toBe(3);
  });

  it('combines swim and overhead strength as shoulder exposure', () => {
    const swim = structuralExposureFromEnduranceActivity({ activityId: 'swim-1', discipline: 'swim', occurredAt: '2026-07-27T12:00:00Z', durationMinutes: 75, intensity: 'moderate', usedPaddles: true });
    const overhead = { ...base('press'), overheadDemand: 'high' as const, shoulderRepetition: 'high' as const };
    const strength = structuralExposureFromMechanicalProfiles({ profiles: [overhead], occurredAt: '2026-07-28T12:00:00Z', sessionId: 'strength-1' });
    expect([...swim, ...strength].filter((entry) => entry.region === 'shoulder_complex').length).toBeGreaterThanOrEqual(2);
  });

  it('modifies a region when the seven-day dose spikes above the three-week pattern', () => {
    const entries: StructuralExposureEntry[] = [];
    for (let week = 1; week <= 3; week += 1) entries.push({ id: `old-${week}`, occurredAt: `2026-07-${7 + week * 6}T12:00:00Z`, source: 'strength', region: 'lumbar_spine', dose: 3, confidence: 'high', rationale: 'baseline' });
    entries.push({ id: 'new-1', occurredAt: '2026-07-27T12:00:00Z', source: 'strength', region: 'lumbar_spine', dose: 10, confidence: 'high', rationale: 'spike' });
    const decision = decideStructuralExposure({ entries, now: '2026-07-28T12:00:00Z' });
    expect(decision.action).toBe('modify');
    expect(decision.constrainedRegions).toContain('lumbar_spine');
  });

  it('restricts symptomatic lower-back loading while preserving unrelated work', () => {
    const decision = decideStructuralExposure({ entries: [], symptomRegions: ['lumbar_spine'], symptomsAffectDailyActivity: true, now: '2026-07-28T12:00:00Z' });
    expect(decision.action).toBe('restrict_region');
    const heavyBack = { ...base('heavy-back'), spinalStabilization: 'high' as const };
    const supportedCurl = { ...base('supported-curl'), gripDemand: 'moderate' as const };
    expect(candidateFitsStructuralDecision(heavyBack, decision)).toBe(false);
    expect(candidateFitsStructuralDecision(supportedCurl, decision)).toBe(true);
  });
});
