import { describe, expect, it } from 'vitest';
import {
  buildEndurancePrescription,
  canonicalEnduranceMinutes,
  returnToRunProtocolMinutes,
  type ReturnToRunProtocol,
} from '../src/endurance-prescription';
import type { PlannedMultisportSession } from '../src/multisport';

function session(values: Partial<PlannedMultisportSession> = {}): PlannedMultisportSession {
  return {
    id: 'bike-1',
    date: '2026-08-15',
    day: 'saturday',
    discipline: 'bike',
    title: 'Bike · long aerobic endurance',
    durationMinutes: 120,
    intensity: 'moderate',
    priority: 'key',
    ownership: 'generated',
    rationale: ['Placed on Saturday because it is the protected long-session slot.'],
    ...values,
  };
}

const runWalkStage: ReturnToRunProtocol = {
  warmupWalkMinutes: 3,
  repeats: 4,
  runMinutes: 3,
  walkMinutes: 1,
  cooldownWalkMinutes: 2,
};

describe('endurance prescription', () => {
  it('materializes a complete inspectable bike prescription', () => {
    const result = buildEndurancePrescription(session());
    expect(result?.prescriptionVersion).toBe(3);
    expect(result?.workoutType).toBe('bike_long_aerobic');
    expect(result?.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(120);
    expect(result?.blocks.reduce((sum, block) => sum + block.totalMinutes, 0)).toBe(120);
    expect(result?.objective).toBe('Aerobic durability');
    expect(result?.whyThisSession).toContain('Placed on Saturday because it is the protected long-session slot.');
  });

  it('uses coach-like five-minute duration boundaries instead of exposing planner arithmetic', () => {
    expect(canonicalEnduranceMinutes(83)).toBe(85);
    const result = buildEndurancePrescription(session({
      id: 'bike-aerobic-odd', title: 'Aerobic ride', durationMinutes: 83, intensity: 'easy', priority: 'support',
    }));
    expect(result?.totalMinutes).toBe(85);
    expect(result?.blocks.map((item) => item.totalMinutes)).toEqual([15, 60, 10]);
  });

  it('uses effort ranges instead of inventing athlete-specific power or running pace thresholds', () => {
    const result = buildEndurancePrescription(session());
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).toContain('rpe');
    expect(serialized).not.toContain('ftp');
    expect(serialized).not.toContain('watts');
    expect(serialized).not.toContain('min/mile');
  });

  it('selects a canonical 3 x 10 bike-quality workout instead of solving arbitrary repeat math', () => {
    const result = buildEndurancePrescription(session({ id: 'bike-quality', title: 'Bike · quality intervals', durationMinutes: 60, intensity: 'hard' }));
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(result?.workoutType).toBe('bike_quality_intervals');
    expect(result?.workoutShapeId).toBe('bike-3x10-r5');
    expect(main?.kind).toBe('intervals');
    expect(main?.repeats).toBe(3);
    expect(main?.workMinutes).toBe(10);
    expect(main?.recoveryMinutes).toBe(5);
    expect(result?.blocks.map((item) => item.totalMinutes)).toEqual([10, 40, 10]);
  });

  it('selects a canonical 3 x 10 run-quality workout when the dose supports it', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-quality-60', discipline: 'run', title: 'Run quality', durationMinutes: 60, intensity: 'hard', priority: 'key',
    }));
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(result?.workoutShapeId).toBe('run-3x10-r5');
    expect(main?.repeats).toBe(3);
    expect(main?.workMinutes).toBe(10);
    expect(main?.recoveryMinutes).toBe(5);
    expect(result?.blocks.map((item) => item.totalMinutes)).toEqual([10, 40, 10]);
  });

  it('uses the workout title to prefer sustained canonical reps for tempo work', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-tempo-50', discipline: 'run', title: 'Tempo run', durationMinutes: 50, intensity: 'hard', priority: 'key',
    }));
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(result?.workoutShapeId).toBe('run-3x8-r3');
    expect(main?.repeats).toBe(3);
    expect(main?.workMinutes).toBe(8);
    expect(main?.recoveryMinutes).toBe(3);
  });

  it('makes pool swims distance-based instead of minute-based cardio blocks', () => {
    const result = buildEndurancePrescription(session({
      id: 'swim-endurance', discipline: 'swim', title: 'Swim endurance', durationMinutes: 60, intensity: 'moderate', priority: 'support',
    }), {
      swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'average' },
    });
    expect(result?.distanceUnit).toBe('yd');
    expect(result?.totalDistance).toBeGreaterThan(1000);
    expect(result?.workoutShapeId).toMatch(/^swim-endurance-/);
    expect(result?.blocks.every((item) => item.totalDistance && item.distanceUnit === 'yd')).toBe(true);
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(main?.repeatDistance).toBeGreaterThanOrEqual(200);
    expect(main?.repeats).toBeGreaterThanOrEqual(2);
    expect(main?.restSeconds).toBeGreaterThan(0);
    expect(result?.blocks.reduce((sum, item) => sum + item.totalMinutes, 0)).toBe(60);
  });

  it('gives technique swims an explicit drill set', () => {
    const result = buildEndurancePrescription(session({
      id: 'swim-technique', discipline: 'swim', title: 'Swim · aerobic technique', durationMinutes: 45, intensity: 'easy', priority: 'support',
    }), { swim: { environment: 'pool', poolLength: 25, distanceUnit: 'm' } });
    const drill = result?.blocks.find((item) => item.kind === 'drill');
    expect(result?.workoutType).toBe('swim_technique');
    expect(drill?.repeatDistance).toBe(50);
    expect(drill?.repeats).toBeGreaterThanOrEqual(4);
    expect(drill?.restSeconds).toBe(15);
  });

  it('turns a short technique swim into a complete 1400 yd coach-shaped workout', () => {
    const result = buildEndurancePrescription(session({
      id: 'swim-technique-odd', discipline: 'swim', title: 'Aerobic + technique swim', durationMinutes: 31, intensity: 'easy', priority: 'support',
    }), { swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'average' } });
    const drill = result?.blocks.find((item) => item.kind === 'drill');
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(result?.totalMinutes).toBe(30);
    expect(result?.totalDistance).toBe(1400);
    expect(result?.workoutShapeId).toBe('swim-technique-1400');
    expect(drill?.repeats).toBe(6);
    expect(drill?.repeatDistance).toBe(50);
    expect(main?.repeats).toBe(3);
    expect(main?.repeatDistance).toBe(200);
  });

  it('uses CSS on the quality set inside a named long swim template', () => {
    const result = buildEndurancePrescription(session({
      id: 'swim-quality', discipline: 'swim', title: 'Swim quality', durationMinutes: 60, intensity: 'hard', priority: 'key',
    }), {
      swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', cssSecondsPer100: 85, proficiency: 'strong' },
    });
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(result?.workoutShapeId).toBe('swim-quality-3200');
    expect(result?.totalDistance).toBe(3200);
    expect(main?.repeatDistance).toBe(300);
    expect(main?.repeats).toBe(6);
    expect(main?.paceTarget).toEqual({ unit: 'yd', fastSecondsPer100: 85, slowSecondsPer100: 91, basis: 'css' });
    expect(result?.blocks.find((item) => item.id === 'secondary')?.repeatDistance).toBe(200);
    expect(result?.effortGuide.toLowerCase()).toContain('css');
  });

  it('never fabricates a numeric swim pace when CSS is absent', () => {
    const result = buildEndurancePrescription(session({
      id: 'swim-quality-no-css', discipline: 'swim', title: 'Swim quality', durationMinutes: 60, intensity: 'hard', priority: 'key',
    }), { swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'strong' } });
    expect(result?.blocks.every((item) => item.paceTarget === undefined)).toBe(true);
  });

  it('keeps a normal run terrain-neutral unless a one-off environment context is supplied', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-neutral', discipline: 'run', title: 'Run quality', durationMinutes: 50, intensity: 'hard', priority: 'key',
    }));
    const text = result?.blocks.map((item) => `${item.label} ${item.instruction}`).join(' ').toLowerCase() ?? '';
    expect(result?.blocks.find((item) => item.id === 'main')?.label).toBe('Main set');
    expect(text).not.toContain('uphill');
    expect(text).not.toContain('treadmill');
    expect(text).not.toContain('technical trail');
  });

  it('materializes an explicit return-to-run stage as walk-only warmup, run/walk repeats, and walk-only cooldown', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-return', discipline: 'run', title: 'Easy return-to-run', durationMinutes: 20, intensity: 'easy', priority: 'support',
    }), { run: { returnToRunProtocol: runWalkStage } });
    expect(returnToRunProtocolMinutes(runWalkStage)).toBe(20);
    expect(result?.workoutType).toBe('run_return_to_run');
    expect(result?.totalMinutes).toBe(20);
    expect(result?.setupRequired).toBeUndefined();
    expect(result?.blocks[0]?.label).toBe('Walk warm-up');
    expect(result?.blocks[0]?.instruction.toLowerCase()).toContain('walk only');
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(main?.kind).toBe('walk_run');
    expect(main?.repeats).toBe(4);
    expect(main?.workMinutes).toBe(3);
    expect(main?.workLabel).toBe('run');
    expect(main?.recoveryMinutes).toBe(1);
    expect(main?.recoveryLabel).toBe('walk');
    expect(result?.workoutShapeId).toBe('return-to-run-4x3-r1');
    expect(result?.blocks.at(-1)?.label).toBe('Walk cool-down');
  });

  it('does not invent return-to-run intervals when no explicit stage exists', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-no-stage', discipline: 'run', title: 'Easy return-to-run', durationMinutes: 20, intensity: 'easy', priority: 'support',
    }));
    expect(result?.setupRequired).toBe('return_to_run_protocol');
    expect(result?.blocks).toHaveLength(1);
    expect(result?.blocks[0]?.repeats).toBeUndefined();
    expect(result?.blocks[0]?.instruction).toContain('will not invent impact progression');
  });

  it('can translate a hilly run while preserving the selected workout shape', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-hills', discipline: 'run', title: 'Run quality', durationMinutes: 50, intensity: 'hard', priority: 'key',
    }), { goalTerrain: 'hilly', run: { environment: 'outdoor' } });
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(main?.label).toBe('Hill set');
    expect(main?.instruction.toLowerCase()).toContain('uphill');
    expect(main?.instruction.toLowerCase()).toContain('rpe, not pace');
    expect(result?.workoutShapeId).toBe('run-4x6-r2');
    expect(result?.environmentLabel).toBe('Hilly');
  });

  it('can distinguish treadmill and trail when explicitly supplied for a one-off adaptation', () => {
    const treadmill = buildEndurancePrescription(session({ discipline: 'run', title: 'Easy aerobic run', durationMinutes: 40, intensity: 'easy' }), { run: { environment: 'treadmill' } });
    const trail = buildEndurancePrescription(session({ discipline: 'run', title: 'Easy aerobic run', durationMinutes: 40, intensity: 'easy' }), { goalTerrain: 'technical_trail', run: { environment: 'trail' } });
    expect(treadmill?.environmentLabel).toBe('Treadmill');
    expect(treadmill?.blocks.map((item) => item.instruction).join(' ').toLowerCase()).toContain('treadmill');
    expect(trail?.environmentLabel).toBe('Technical trail');
    expect(trail?.blocks.map((item) => item.instruction).join(' ').toLowerCase()).toContain('technical terrain');
  });

  it('refuses to fabricate endurance details for strength/recovery sessions', () => {
    expect(buildEndurancePrescription(session({ discipline: 'strength' }))).toBeNull();
    expect(buildEndurancePrescription(session({ discipline: 'recovery' }))).toBeNull();
  });
});
