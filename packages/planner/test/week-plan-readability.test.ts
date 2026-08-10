import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const plan = readFileSync(resolve(repoRoot, 'apps/mobile/src/app/(tabs)/plan.tsx'), 'utf8');
const synthesis = readFileSync(resolve(repoRoot, 'apps/mobile/src/services/training-synthesis.ts'), 'utf8');
const catalog = readFileSync(resolve(repoRoot, 'apps/mobile/src/services/workout-name-catalog.ts'), 'utf8');
const personality = readFileSync(resolve(repoRoot, 'apps/mobile/src/services/workout-name-personality.ts'), 'utf8');

describe('week plan readability', () => {
  it('switches training durations to hours and minutes only after 120 minutes', () => {
    expect(plan).toContain('function formatTrainingDuration(minutes: number)');
    expect(plan).toContain('if (rounded <= 120) return `${rounded} min`');
    expect(plan).toContain("`${hours} ${hours === 1 ? 'hour' : 'hours'}`");
    expect(plan).toContain("`${hourLabel}, ${remainder} ${remainder === 1 ? 'min' : 'mins'}`");
  });

  it('uses athlete-facing identities instead of exercise-list titles for strength', () => {
    expect(plan).toContain('title: plannedStrengthDisplayName(session)');
    expect(synthesis).toContain('export function plannedStrengthDisplayName(session: PlannedStrengthSession)');
    expect(synthesis).toContain('session.workout.stations');
    expect(synthesis).toContain('`${session.id}|${session.date}|${fingerprint || session.workout.name || session.title}`');
    expect(synthesis).toContain("discipline: 'strength'");
    expect(catalog).toContain("n('Catch & Core'");
    expect(catalog).toContain("n('Lats & Lines'");
    expect(catalog).toContain("n('Chain Reaction'");
    expect(catalog).toContain("n('The Unsexy Stuff'");
    expect(personality).toContain("p('Pick Things Up, Put Them Down'");
    expect(personality).toContain("p('Leg Day, But Responsible'");
    expect(plan).not.toContain('compactExerciseName(exercise.exerciseSnapshot.name)');
  });

  it('does not render a Side Quest generated event that cannot be reconciled to the current scheduled week', () => {
    expect(plan).toContain('const planned = scheduledSessionForEvent(event, scheduled)');
    expect(plan).toContain('event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID && scheduled.length > 0 && !planned');
  });
});
