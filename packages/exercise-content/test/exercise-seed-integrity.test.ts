import { describe, expect, it } from 'vitest';

import { exerciseSeed } from '../src';

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('exercise seed integrity', () => {
  it('contains unique exercise IDs', () => {
    const ids = exerciseSeed.map((exercise) => exercise.id);

    const duplicates = ids.filter(
      (id, index) => ids.indexOf(id) !== index,
    );

    expect([...new Set(duplicates)]).toEqual([]);
  });

  it('contains unique canonical exercise names', () => {
    const names = exerciseSeed.map((exercise) =>
      normalizeName(exercise.name),
    );

    const duplicates = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );

    expect([...new Set(duplicates)]).toEqual([]);
  });
});
