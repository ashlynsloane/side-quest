import { describe, expect, it } from 'vitest';
import {
  buildEndurancePrescription,
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
    expect(result?.prescriptionVersion).toBe(2);
    expect(result?.workoutType).toBe('bike_long_aerobic');
    expect(result?.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(120);
    expect(result?.blocks.reduce((sum, block) => sum + block.totalMinutes, 0)).toBe(120);
    expect(result?.objective).toBe('Aerobic durability');
    expect(result?.whyThisSession).toContain('Placed on Saturday because it is the protected long-session slot.');
  });

  it('uses effort ranges instead of inventing athlete-specific power or running pace thresholds', () => {
    const result = buildEndurancePrescription(session());
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).toContain('rpe');
    expect(serialized).not.toContain('ftp');
    expect(serialized).not.toContain('watts');
    expect(serialized).not.toContain('min/mile');
  });

  it('turns a quality bike session into repeatable work and recovery blocks', () => {
    const result = buildEndurancePrescription(session({ id: 'bike-quality', title: 'Bike · quality intervals', durationMinutes: 60, intensity: 'hard' }));
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(result?.workoutType).toBe('bike_quality_intervals');
    expect(main?.kind).toBe('intervals');
    expect(main?.repeats).toBeGreaterThanOrEqual(2);
    expect(main?.workMinutes).toBeGreaterThanOrEqual(2);
    expect(main?.recoveryMinutes).toBeGreaterThanOrEqual(1);
    expect(result?.blocks.reduce((sum, item) => sum + item.totalMinutes, 0)).toBe(60);
  });

  it('makes pool swims distance-based instead of minute-based cardio blocks', () => {
    const result = buildEndurancePrescription(session({
      id: 'swim-endurance', discipline: 'swim', title: 'Swim endurance', durationMinutes: 60, intensity: 'moderate', priority: 'support',
    }), {
      swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'average' },
    });
    expect(result?.distanceUnit).toBe('yd');
    expect(result?.totalDistance).toBeGreaterThan(1000);
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

  it('uses CSS to create real swim pace targets when CSS is explicitly known', () => {
    const result = buildEndurancePrescription(session({
      id: 'swim-quality', discipline: 'swim', title: 'Swim quality', durationMinutes: 60, intensity: 'hard', priority: 'key',
    }), {
      swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', cssSecondsPer100: 85, proficiency: 'strong' },
    });
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(main?.repeatDistance).toBe(200);
    expect(main?.repeats).toBe(6);
    expect(main?.paceTarget).toEqual({ unit: 'yd', fastSecondsPer100: 85, slowSecondsPer100: 91, basis: 'css' });
    expect(result?.effortGuide.toLowerCase()).toContain('css');
  });

  it('never fabricates a numeric swim pace when CSS is absent', () => {
    const result = buildEndurancePrescription(session({
      id: 'swim-quality-no-css', discipline: 'swim', title: 'Swim quality', durationMinutes: 60, intensity: 'hard', priority: 'key',
    }), { swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'strong' } });
    expect(result?.blocks.every((item) => item.paceTarget === undefined)).toBe(true);
  });

  it('materializes an explicit return-to-run stage as walk-only warmup, run/walk repeats, and walk-only cooldown', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-return', discipline: 'run', title: 'Easy return-to-run', durationMinutes: 20, intensity: 'easy', priority: 'support',
    }), { run: { environment: 'outdoor', returnToRunProtocol: runWalkStage } });
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

  it('makes hilly run quality terrain-specific instead of prescribing flat-road pace', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-hills', discipline: 'run', title: 'Run quality', durationMinutes: 50, intensity: 'hard', priority: 'key',
    }), { goalTerrain: 'hilly', run: { environment: 'outdoor' } });
    const main = result?.blocks.find((item) => item.id === 'main');
    expect(main?.label).toBe('Hill set');
    expect(main?.instruction.toLowerCase()).toContain('uphill');
    expect(main?.instruction.toLowerCase()).toContain('rpe, not pace');
    expect(result?.environmentLabel).toBe('Hilly');
  });

  it('distinguishes treadmill and trail environments in the prescription', () => {
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
