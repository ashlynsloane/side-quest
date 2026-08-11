import { describe, expect, it } from 'vitest';

import { enduranceCoachLines } from '../src/endurance-coach-format';
import { buildEndurancePrescription } from '../src/endurance-prescription';
import type { PlannedMultisportSession } from '../src/multisport';

function session(values: Partial<PlannedMultisportSession> = {}): PlannedMultisportSession {
  return {
    id: 'swim-1',
    date: '2026-08-13',
    day: 'thursday',
    discipline: 'swim',
    title: 'Swim endurance',
    durationMinutes: 30,
    intensity: 'moderate',
    priority: 'support',
    ownership: 'generated',
    rationale: ['Fits the current weekly plan.'],
    ...values,
  };
}

describe('coach-style endurance formatting', () => {
  it('turns a short pool swim into a real practice-style warm-up, main set, and cool-down', () => {
    const prescription = buildEndurancePrescription(session(), {
      swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'average' },
    });
    expect(prescription?.totalDistance).toBe(1400);
    const warmup = prescription?.blocks.find((block) => block.id === 'warmup');
    const main = prescription?.blocks.find((block) => block.id === 'main');
    const cooldown = prescription?.blocks.find((block) => block.id === 'cooldown');
    expect(warmup && prescription ? enduranceCoachLines(prescription, warmup).map((line) => line.text) : []).toEqual([
      '100 yd easy choice',
      '4 × 50 yd as 25 drill / 25 swim',
    ]);
    expect(main && prescription ? enduranceCoachLines(prescription, main)[0]?.text : '').toBe('3 × 300 yd descending 1–3');
    expect(cooldown && prescription ? enduranceCoachLines(prescription, cooldown)[0]?.text : '').toBe('4 × 50 yd easy choice');
  });

  it('keeps technique swims form-led instead of displaying one generic aerobic block', () => {
    const prescription = buildEndurancePrescription(session({
      id: 'swim-technique',
      title: 'Aerobic + technique swim',
      durationMinutes: 31,
      intensity: 'easy',
    }), {
      swim: { environment: 'pool', poolLength: 25, distanceUnit: 'yd', proficiency: 'average' },
    });
    const drill = prescription?.blocks.find((block) => block.kind === 'drill');
    const main = prescription?.blocks.find((block) => block.id === 'main');
    expect(drill && prescription ? enduranceCoachLines(prescription, drill)[0]?.text : '').toBe('6 × 50 yd as drill / swim by 25');
    expect(main && prescription ? enduranceCoachLines(prescription, main)[0]?.text : '').toBe('3 × 200 yd negative split with clean mechanics');
  });

  it('formats quality runs like a coached workout with warm-up, activation, reps, recovery, and cool-down', () => {
    const prescription = buildEndurancePrescription(session({
      id: 'run-quality',
      discipline: 'run',
      title: 'Tempo run',
      durationMinutes: 60,
      intensity: 'hard',
      priority: 'key',
    }));
    const warmup = prescription?.blocks.find((block) => block.id === 'warmup');
    const main = prescription?.blocks.find((block) => block.id === 'main');
    const cooldown = prescription?.blocks.find((block) => block.id === 'cooldown');
    const warmupLines = warmup && prescription ? enduranceCoachLines(prescription, warmup) : [];
    expect(warmupLines.map((line) => line.text)).toContain('Finish with activation + mobility and 4–6 relaxed strides');
    expect(main && prescription ? enduranceCoachLines(prescription, main)[0] : undefined).toEqual({
      text: '3 × 10 min tempo / 10K-like effort',
      secondary: '5 min easy jog between reps',
    });
    expect(cooldown && prescription ? enduranceCoachLines(prescription, cooldown)[0]?.text : '').toBe('10 min easy cool-down');
  });
});
