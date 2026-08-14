import { describe, expect, it } from 'vitest';

import { machineExerciseSeed } from '../src/machine-exercises';

describe('machine exercise equipment integrity', () => {
  const expected = new Map([
    ['Machine Chest Press', 'chest_press_machine'],
    ['Seated Leg Curl', 'leg_curl_machine'],
    ['Leg Extension', 'leg_extension_machine'],
    ['Leg Press', 'leg_press'],
  ]);

  for (const [name, equipmentId] of expected) {
    it(`${name} uses ${equipmentId}`, () => {
      const exercise = machineExerciseSeed.find(
        (item) => item.name === name,
      );

      expect(exercise).toBeDefined();

      const equipmentIds = exercise!.equipmentOptions.flatMap((option) =>
        option.items.map((item) => item.equipmentId),
      );

      expect(equipmentIds).toContain(equipmentId);
    });
  }

  it('does not model dedicated chest/leg machines as generic cable machines', () => {
    const dedicatedNames = [
      'Machine Chest Press',
      'Seated Leg Curl',
      'Leg Extension',
    ];

    for (const name of dedicatedNames) {
      const exercise = machineExerciseSeed.find(
        (item) => item.name === name,
      );

      expect(exercise).toBeDefined();

      const equipmentIds = exercise!.equipmentOptions.flatMap((option) =>
        option.items.map((item) => item.equipmentId),
      );

      expect(equipmentIds).not.toContain('cable_machine');
    }
  });
});
