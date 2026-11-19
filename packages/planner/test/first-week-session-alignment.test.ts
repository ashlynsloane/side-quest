import { describe, expect, it } from 'vitest';
import type { GeneratedWorkout, PlannedStrengthSession } from '@circuit/domain';
import { inspectPlannedSessionCoherence } from '../../../apps/mobile/src/services/first-week-session-alignment';

const planned = {
  title: 'Upper-Body Strength Foundation',
  focusTargets: [{ region: 'upper_back', emphasis: 'strong' },
    { region: 'chest', emphasis: 'moderate' }],
} as PlannedStrengthSession;

function workout(
  regions: Array<'upper_back' | 'chest' | 'glutes' | 'quadriceps'>,
  excludedRegions: Array<'upper_back' | 'chest'> = [],
): GeneratedWorkout {
  return {
    name: 'Upper-Body Strength Foundation',
    request: { excludedRegions, availableEquipment: ['dumbbell'], regionRestrictions: [] },
    requiredEquipment: ['dumbbell'],
    stations: [{
      exercises: [{ exerciseSnapshot: {
        bodyRegions: regions.map((region) => ({ region, role: 'primary', load: 3 })),
      } }],
    }],
  } as unknown as GeneratedWorkout;
}

describe('native planned-workout start alignment', () => {
  it('never approves a lower-body workout under an upper-body label', () => {
    const status = inspectPlannedSessionCoherence(workout(['glutes', 'quadriceps']), planned);
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.message).toMatch(/focus/);
  });
  it('blocks conflicting saved upper-body sessions even before regeneration', () => {
    expect(inspectPlannedSessionCoherence(
      workout(['glutes', 'quadriceps'], ['upper_back','chest']), planned).ok).toBe(false);
  });
  it('allows a coherent and available upper-body session', () => {
    expect(inspectPlannedSessionCoherence(workout(['upper_back','chest']), planned))
      .toEqual({ ok: true });
  });
  it('rejects any exercise that loads an explicitly excluded area', () => {
    expect(inspectPlannedSessionCoherence(workout(['upper_back', 'chest'], ['chest']), planned).ok)
      .toBe(false);
  });
  it('does not use an unchosen location to fill equipment gaps', () => {
    const session = workout(['upper_back']);
    session.requiredEquipment = ['cable_machine'];
    expect(inspectPlannedSessionCoherence(session, planned).ok).toBe(false);
  });
  it('does not impose plan-title checks on independent one-off workouts', () => {
    expect(inspectPlannedSessionCoherence(workout(['glutes']), null)).toEqual({ ok: true });
  });
});
