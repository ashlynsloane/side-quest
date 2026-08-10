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
  const personality = source('apps/mobile/src/services/workout-name-personality.ts');
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

  it('prefers playful human copy and protects specific workout identity from generic easy labels', () => {
    expect(personality).toContain("p('Chlorine & Delusion'");
    expect(personality).toContain("p('Three Hours of Snacks'");
    expect(personality).toContain("p('The Silly Little Run'");
    expect(personality).toContain("p('Tiny Run Club'");
    expect(personality).toContain("tri('Brick Happens'");
    expect(personality).toContain("if (has('return_to_run')) return 'return_to_run'");
    expect(personality).toContain("context.discipline === 'bike' && duration >= 150");
    expect(personality).toContain("'Swim. Bike. Side Quest.'");
  });

  it('keeps each calendar event stable while rotating recurring workout shapes across dates', () => {
    expect(synthesis).toContain('selectHumanWorkoutName({');
    expect(synthesis).toContain('`${event.id}|${date}|${event.discipline}|${raw}|${durationMinutes}|${intensity}|${contextFingerprint}`');
    expect(synthesis).toContain('`${session.id}|${session.date}|${fingerprint || session.workout.name || session.title}|${contextFingerprint}`');
    expect(synthesis).toContain('generatedNameIntents');
    expect(synthesis).toContain('cached?.fingerprint === contextFingerprint');
  });
});
