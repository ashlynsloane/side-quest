import { describe, expect, it } from 'vitest';
import type { MechanicalLoadCandidate } from '@circuit/domain';
import { deriveMechanicalLoadProfile, summarizeSessionMechanicalLoad } from '../src/mechanical-load';

function candidate(overrides: Partial<MechanicalLoadCandidate> & { exerciseId: string }): MechanicalLoadCandidate {
  return {
    movementPatterns: [], avoidanceTags: [], laterality: 'bilateral', impactLevel: 0,
    balanceDemand: 0, technicalComplexity: 1, bodyRegions: [], jointLoads: [], stationRoles: [], equipmentIds: [],
    ...overrides,
  };
}

describe('V24.4 mechanical load metadata', () => {
  it('detects high trunk and axial demand in a loaded carry', () => {
    const profile = deriveMechanicalLoadProfile(candidate({
      exerciseId: 'farmer-carry', movementPatterns: ['carry'], equipmentIds: ['dumbbell'],
      bodyRegions: [{ region: 'forearms_grip', role: 'primary', load: 3 }, { region: 'lower_back', role: 'stabilizer', load: 2 }],
      jointLoads: [{ region: 'lumbar_spine', load: 2 }],
    }));
    expect(profile.axialLoad).toBe('high');
    expect(profile.spinalStabilization).toBe('high');
    expect(profile.gripDemand).toBe('high');
  });

  it('separates impact from cardiovascular demand', () => {
    const profile = deriveMechanicalLoadProfile(candidate({
      exerciseId: 'pogos', movementPatterns: ['jump_hop'], avoidanceTags: ['high_impact'], impactLevel: 4,
      bodyRegions: [{ region: 'gastrocnemius', role: 'primary', load: 3 }], jointLoads: [{ region: 'ankle', load: 3 }],
    }));
    expect(profile.impactDemand).toBe('high');
    expect(profile.tendonDemand).toBe('high');
  });

  it('shows accumulated spinal demand across exercises targeting different muscles', () => {
    const profiles = [
      deriveMechanicalLoadProfile(candidate({ exerciseId: 'carry', movementPatterns: ['carry'], equipmentIds: ['dumbbell'], bodyRegions: [{ region: 'forearms_grip', role: 'primary', load: 3 }], jointLoads: [{ region: 'lumbar_spine', load: 2 }] })),
      deriveMechanicalLoadProfile(candidate({ exerciseId: 'split-squat', movementPatterns: ['lunge'], laterality: 'unilateral', equipmentIds: ['dumbbell'], bodyRegions: [{ region: 'quadriceps', role: 'primary', load: 3 }], jointLoads: [{ region: 'lumbar_spine', load: 1 }] })),
      deriveMechanicalLoadProfile(candidate({ exerciseId: 'press', movementPatterns: ['vertical_push'], avoidanceTags: ['overhead'], equipmentIds: ['dumbbell'], bodyRegions: [{ region: 'shoulders', role: 'primary', load: 3 }], jointLoads: [{ region: 'lumbar_spine', load: 1 }, { region: 'shoulder', load: 3 }] })),
    ];
    const summary = summarizeSessionMechanicalLoad(profiles);
    expect(summary.accumulated.spinalStabilization).toBeGreaterThanOrEqual(7);
    expect(summary.explanation.some((line) => line.includes('trunk or axial'))).toBe(true);
  });

  it('allows reviewed explicit overrides', () => {
    const profile = deriveMechanicalLoadProfile(candidate({ exerciseId: 'supported-row', movementPatterns: ['horizontal_pull'] }), {
      exerciseId: 'supported-row', values: { spinalStabilization: 'low' }, rationale: 'Chest-supported implementation.',
    });
    expect(profile.source).toBe('explicit');
    expect(profile.confidence).toBe('high');
    expect(profile.spinalStabilization).toBe('low');
  });
});
