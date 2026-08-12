import { describe, expect, it } from 'vitest';

import { buildEndurancePrescription } from '../src/endurance-prescription-block-aware';
import type { PlannedMultisportSession } from '../src/multisport';

function bike(title: string, durationMinutes: number, intensity: 'easy' | 'moderate' | 'hard' = 'easy'): PlannedMultisportSession {
  return {
    id: `bike-${title}`,
    date: '2026-08-20',
    day: 'thursday',
    discipline: 'bike',
    title,
    durationMinutes,
    intensity,
    priority: intensity === 'hard' ? 'key' : 'support',
    ownership: 'generated',
    rationale: [],
  } as PlannedMultisportSession;
}

describe('race-horizon support and long-ride prescriptions', () => {
  it('gives support rides visibly different structures instead of generic aerobic filler', () => {
    const cadence = buildEndurancePrescription(bike('Aerobic · Cadence Economy', 85));
    const torque = buildEndurancePrescription(bike('Aerobic Strength · Low Cadence', 85));
    const tempo = buildEndurancePrescription(bike('Tempo Inserts · Controlled', 85));

    expect(cadence?.workoutShapeId).toBe('bike-support-cadence-economy');
    expect(torque?.workoutShapeId).toBe('bike-support-low-cadence-5x5-r3');
    expect(tempo?.workoutShapeId).toBe('bike-support-tempo-3x10-r5');
    expect(new Set([cadence?.workoutShapeId, torque?.workoutShapeId, tempo?.workoutShapeId]).size).toBe(3);
  });

  it('makes long-ride purpose change the actual workout structure', () => {
    const fueling = buildEndurancePrescription(bike('Long Ride · Fueling Practice', 240, 'moderate'));
    const tempo = buildEndurancePrescription(bike('Long Ride · Tempo Inserts', 240, 'moderate'));
    const race = buildEndurancePrescription(bike('Long Ride · Race Pace Blocks', 240, 'moderate'));
    const hills = buildEndurancePrescription(bike('Long Ride · Hills + Rolling Terrain', 240, 'moderate'));

    expect(fueling?.workoutShapeId).toBe('bike-long-fueling-practice');
    expect(tempo?.workoutShapeId).toBe('bike-long-tempo-3x20-r10');
    expect(race?.workoutShapeId).toBe('bike-long-race-pace-3x30-r10');
    expect(hills?.workoutShapeId).toBe('bike-long-rolling-durability');
    expect(hills?.blocks.find((block) => block.id === 'main')?.instruction).toMatch(/hilly|climb|crest/i);

    const tempoMain = tempo?.blocks.find((block) => block.id === 'main');
    const raceMain = race?.blocks.find((block) => block.id === 'main');
    expect(tempoMain).toMatchObject({ repeats: 3, workMinutes: 20, recoveryMinutes: 10 });
    expect(raceMain).toMatchObject({ repeats: 3, workMinutes: 30, recoveryMinutes: 10 });
  });

  it('makes every explicit bike interval minute visible and reconciles exactly to the approved ride duration', () => {
    const cases = [
      bike('VO2 · 6 × 4', 105, 'hard'),
      bike('Tempo · Aerobic Strength', 105, 'hard'),
      bike('Threshold · Cruise Control', 105, 'hard'),
      bike('Long Ride · Tempo Inserts', 220, 'moderate'),
      bike('Long Ride · Race Pace Blocks', 240, 'moderate'),
    ];

    for (const session of cases) {
      const prescription = buildEndurancePrescription(session);
      expect(prescription).not.toBeNull();
      if (!prescription) continue;
      expect(prescription.blocks.reduce((sum, block) => sum + block.totalMinutes, 0)).toBe(session.durationMinutes);

      const main = prescription.blocks.find((block) => block.id === 'main');
      if (main?.kind === 'intervals' && main.repeats && main.workMinutes && main.recoveryMinutes !== undefined) {
        const visibleIntervalMinutes = main.repeats * main.workMinutes
          + Math.max(0, main.repeats - 1) * main.recoveryMinutes;
        expect(main.totalMinutes).toBe(visibleIntervalMinutes);

        const aerobicFinish = prescription.blocks.find((block) => /aerobic finish/i.test(block.label));
        if (session.title.startsWith('Long Ride ·')) {
          expect(aerobicFinish?.totalMinutes).toBeGreaterThan(0);
        }
      }
    }
  });

});
