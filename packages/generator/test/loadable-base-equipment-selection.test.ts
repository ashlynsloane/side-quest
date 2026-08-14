import { describe, expect, it } from 'vitest';

import { exerciseSeed } from '@circuit/exercise-content';
import type {
  EquipmentId,
  Exercise,
  WorkoutGenerationRequest,
} from '@circuit/domain';

import { selectEquipmentOption } from '../src/core';

function exercise(name: string): Exercise {
  const match = exerciseSeed.find((item) => item.name === name);
  expect(match, `${name} should exist`).toBeDefined();
  return match!;
}

function available(...ids: EquipmentId[]) {
  return new Set<EquipmentId>(['bodyweight', ...ids]);
}

describe('loadable-base equipment selection', () => {
  it('prefers external load for an intermediate athlete when the movement asks for it', () => {
    const option = selectEquipmentOption(
      exercise('Standing Calf Raise'),
      available('dumbbell', 'kettlebell'),
      'intermediate',
    );

    expect(option).toBeDefined();

    expect(
      option!.items.some((item) =>
        item.equipmentId === 'dumbbell'
        || item.equipmentId === 'kettlebell',
      ),
    ).toBe(true);
  });

  it('preserves the simpler option for beginners', () => {
    const option = selectEquipmentOption(
      exercise('Standing Calf Raise'),
      available('dumbbell'),
      'beginner',
    );

    expect(option?.items.map((item) => item.equipmentId))
      .toEqual(['bodyweight']);
  });

  it('falls back safely when external load is unavailable', () => {
    const option = selectEquipmentOption(
      exercise('Standing Calf Raise'),
      available(),
      'advanced',
    );

    expect(option?.items.map((item) => item.equipmentId))
      .toEqual(['bodyweight']);
  });

  it('can prescribe loaded Dead Bug rather than treating the movement as obsolete', () => {
    const option = selectEquipmentOption(
      exercise('Dead Bug'),
      available('weight_plate', 'dumbbell'),
      'intermediate',
    );

    expect(option).toBeDefined();

    expect(
      option!.items.some((item) =>
        item.equipmentId === 'weight_plate'
        || item.equipmentId === 'dumbbell',
      ),
    ).toBe(true);
  });

  it('loads a simple supported strength movement while retaining its support equipment', () => {
    const option = selectEquipmentOption(
      exercise('Single-Leg Sit-to-Stand'),
      available('bench', 'dumbbell'),
      'intermediate',
    );

    expect(option?.items.map((item) => item.equipmentId))
      .toEqual(['bench', 'dumbbell']);
  });

  it('does not invent external loading for a skill-regression pogo movement', () => {
    const option = selectEquipmentOption(
      exercise('Double-Leg Pogo Hop'),
      available('dumbbell', 'kettlebell', 'weight_plate'),
      'advanced',
    );

    expect(option?.items.map((item) => item.equipmentId))
      .toEqual(['bodyweight']);
  });
});
