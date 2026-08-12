import { describe, expect, it } from 'vitest';

import { buildEndurancePrescription } from '../src/endurance-prescription-block-aware';
import { enduranceCoachLines } from '../src/endurance-coach-format';
import type { PlannedMultisportSession } from '../src/multisport';

function session(values: Partial<PlannedMultisportSession>): PlannedMultisportSession {
  return {
    id: 'session-1',
    date: '2026-08-17',
    day: 'monday',
    discipline: 'swim',
    title: 'Fartlek · Change of Pace',
    durationMinutes: 30,
    intensity: 'moderate',
    priority: 'support',
    ownership: 'generated',
    rationale: ['Block variation.'],
    ...values,
  };
}

describe('block-aware endurance prescription', () => {
  it('materializes a swim fartlek as continuous 50 steady / 25 fast / 25 easy changes', () => {
    const prescription = buildEndurancePrescription(session({}), {
      swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'average' },
    });
    const main = prescription?.blocks.find((block) => block.id === 'main');
    expect(main?.shapeId).toBe('swim-fartlek-50-25-25');
    expect(main?.restSeconds).toBeUndefined();
    expect(main?.totalDistance).toBe(900);
    expect(main && prescription ? enduranceCoachLines(prescription, main)[0]?.text : '').toBe('9 × [50 yd steady + 25 yd fast + 25 yd easy]');
    expect(main && prescription ? enduranceCoachLines(prescription, main)[0]?.secondary : '').toMatch(/Continuous/);
  });

  it('breaks a 3000 yd long-water swim into two different main-set structures', () => {
    const prescription = buildEndurancePrescription(session({
      title: 'Endurance · Long Water',
      durationMinutes: 65,
      intensity: 'moderate',
    }), {
      swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'average' },
    });
    const main = prescription?.blocks.find((block) => block.id === 'main');
    const secondary = prescription?.blocks.find((block) => block.id === 'secondary');
    const mainText = main && prescription ? enduranceCoachLines(prescription, main)[0]?.text ?? '' : '';
    const secondaryText = secondary && prescription ? enduranceCoachLines(prescription, secondary)[0]?.text ?? '' : '';

    expect(prescription?.totalDistance).toBe(3000);
    expect(main?.repeatDistance).toBe(300);
    expect(main?.repeats).toBe(4);
    expect(secondary?.repeatDistance).toBe(200);
    expect(secondary?.repeats).toBe(6);
    expect(mainText).not.toContain('600');
    expect(`${mainText} ${secondaryText}`).toContain('300 yd');
    expect(`${mainText} ${secondaryText}`).toContain('200 yd');
  });

  it('keeps a 3000 yd swim fartlek varied instead of repeating the same 100 yd pattern for the whole main set', () => {
    const prescription = buildEndurancePrescription(session({
      title: 'Fartlek · Change of Pace',
      durationMinutes: 65,
      intensity: 'moderate',
    }), {
      swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'average' },
    });
    const main = prescription?.blocks.find((block) => block.id === 'main');
    const secondary = prescription?.blocks.find((block) => block.id === 'secondary');

    expect(prescription?.totalDistance).toBe(3000);
    expect(main?.shapeId).toBe('swim-fartlek-50-25-25');
    expect(main?.repeats).toBe(12);
    expect(secondary?.totalDistance).toBe(1200);
    expect(secondary?.repeatDistance).toBe(200);
  });

  it('turns an aerobic bike into a cadence fartlek without increasing the approved 90-minute dose', () => {
    const prescription = buildEndurancePrescription(session({
      discipline: 'bike',
      title: 'Fartlek · Cadence Change-Up',
      durationMinutes: 90,
      intensity: 'easy',
    }));
    const main = prescription?.blocks.find((block) => block.id === 'main');
    expect(prescription?.totalMinutes).toBe(90);
    expect(main?.shapeId).toBe('bike-fartlek-4-1');
    expect(main && prescription ? enduranceCoachLines(prescription, main)[0]?.text : '').toMatch(/4 min steady \+ 1 min brisk cadence/);
  });

  it('materializes distinct VO2, tempo, threshold, over-under, and race-specific bike stimuli', () => {
    const cases = [
      ['VO2 · 6 × 4', 'bike-vo2-6x4-r4', 6, 4, 4],
      ['Tempo · Aerobic Strength', 'bike-tempo-3x15-r5', 3, 15, 5],
      ['VO2 · 8 × 2', 'bike-vo2-8x2-r2', 8, 2, 2],
      ['Over / Under · 4 × 10', 'bike-over-under-4x10-r5', 4, 10, 5],
      ['Threshold · Cruise Control', 'bike-threshold-cruise-4x10-r5', 4, 10, 5],
      ['VO2 · 5 × 5', 'bike-vo2-5x5-r5', 5, 5, 5],
      ['Threshold · Long Repeats', 'bike-threshold-3x12-r4', 3, 12, 4],
      ['Over / Under · 3 × 12', 'bike-over-under-3x12-r5', 3, 12, 5],
      ['Race Pace · 3 × 15', 'bike-race-pace-3x15-r5', 3, 15, 5],
      ['VO2 · 6 × 3', 'bike-vo2-6x3-r3', 6, 3, 3],
      ['Threshold · 3 × 10', 'bike-threshold-3x10-r5', 3, 10, 5],
      ['Race Pace + Surges · 4 × 10', 'bike-race-pace-surges-4x10-r5', 4, 10, 5],
    ] as const;

    const shapes = cases.map(([title, shapeId, repeats, workMinutes, recoveryMinutes]) => {
      const prescription = buildEndurancePrescription(session({
        discipline: 'bike',
        title,
        durationMinutes: 105,
        intensity: 'hard',
        priority: 'key',
      }));
      const main = prescription?.blocks.find((block) => block.id === 'main');

      expect(prescription?.totalMinutes).toBe(105);
      expect(prescription?.workoutShapeId).toBe(shapeId);
      expect(main).toMatchObject({
        shapeId,
        repeats,
        workMinutes,
        recoveryMinutes,
      });

      return JSON.stringify(main);
    });

    expect(new Set(shapes).size).toBe(cases.length);
  });

  it('creates a continuous running fartlek rather than making every quality change a passive-rest interval workout', () => {
    const prescription = buildEndurancePrescription(session({
      discipline: 'run',
      title: 'Fartlek · Change of Pace',
      durationMinutes: 50,
      intensity: 'moderate',
    }));
    const main = prescription?.blocks.find((block) => block.id === 'main');
    expect(prescription?.totalMinutes).toBe(50);
    expect(main?.shapeId).toBe('run-fartlek-3-1-2');
    expect(main && prescription ? enduranceCoachLines(prescription, main)[0]?.text : '').toMatch(/3 min steady \+ 1 min quick \+ 2 min easy/);
  });

  it('keeps return-to-run protocol logic untouched by the novelty layer', () => {
    const prescription = buildEndurancePrescription(session({
      discipline: 'run',
      title: 'Easy return-to-run',
      durationMinutes: 20,
      intensity: 'easy',
    }), {
      run: { returnToRunProtocol: { warmupWalkMinutes: 3, repeats: 4, runMinutes: 3, walkMinutes: 1, cooldownWalkMinutes: 2 } },
    });
    const main = prescription?.blocks.find((block) => block.kind === 'walk_run');
    expect(prescription?.workoutType).toBe('run_return_to_run');
    expect(main?.repeats).toBe(4);
    expect(main?.workMinutes).toBe(3);
    expect(main?.recoveryMinutes).toBe(1);
  });
});
