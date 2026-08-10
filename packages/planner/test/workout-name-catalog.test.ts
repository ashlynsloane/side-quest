import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function sectionCount(text: string, start: string, end: string, token: string): number {
  const section = text.split(start)[1]?.split(end)[0] ?? '';
  return section.split(token).length - 1;
}

describe('athlete-facing workout naming catalog', () => {
  const catalog = source('apps/mobile/src/services/workout-name-catalog.ts');
  const synthesis = source('apps/mobile/src/services/training-synthesis.ts');

  it('has a substantial human-curated vocabulary for every Side Quest discipline', () => {
    expect(sectionCount(catalog, 'SWIM_WORKOUT_NAMES', 'BIKE_WORKOUT_NAMES', "n('")).toBeGreaterThanOrEqual(40);
    expect(sectionCount(catalog, 'BIKE_WORKOUT_NAMES', 'RUN_WORKOUT_NAMES', "n('")).toBeGreaterThanOrEqual(40);
    expect(sectionCount(catalog, 'RUN_WORKOUT_NAMES', 'STRENGTH_WORKOUT_NAMES', "n('")).toBeGreaterThanOrEqual(40);
    expect(sectionCount(catalog, 'STRENGTH_WORKOUT_NAMES', 'TRIATHLON_WORKOUT_NAMES', "n('")).toBeGreaterThanOrEqual(40);
  });

  it('keeps a separate triathlon vocabulary instead of making every name generic fitness copy', () => {
    expect(sectionCount(catalog, 'TRIATHLON_WORKOUT_NAMES', 'WORKOUT_NAME_CATALOG', "tri('")).toBeGreaterThanOrEqual(30);
    expect(catalog).toContain("tri('T1 Legs'");
    expect(catalog).toContain("tri('Aero Then Go'");
    expect(catalog).toContain("tri('Wet Hair, Bike Helmet'");
    expect(catalog).toContain("tri('The Fourth Discipline'");
    expect(catalog).toContain("tri('Sharp, Not Tired'");
  });

  it('keeps race and phase context as first-class future naming inputs', () => {
    expect(catalog).toContain('weeksToRace?: number');
    expect(catalog).toContain('raceName?: string');
    expect(catalog).toContain('raceLocation?: string');
    expect(catalog).toContain("phase?: WorkoutNamePhase");
    expect(catalog).toContain('extraEntries: WorkoutNameEntry[] = []');
  });

  it('selects generated endurance and strength names from stable workout identity', () => {
    expect(synthesis).toContain('selectWorkoutName({');
    expect(synthesis).toContain("seedKey: `${event.discipline}|${raw}|${durationMinutes}|${intensity}`");
    expect(synthesis).toContain("seedKey: fingerprint || session.workout.name || session.title");
    expect(synthesis).toContain('generatedNameIntents');
  });
});
