import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const plan = readFileSync(resolve(repoRoot, 'apps/mobile/src/app/(tabs)/plan.tsx'), 'utf8');

describe('week plan readability', () => {
  it('switches training durations to hours and minutes only after 120 minutes', () => {
    expect(plan).toContain('function formatTrainingDuration(minutes: number)');
    expect(plan).toContain('if (rounded <= 120) return `${rounded} min`');
    expect(plan).toContain("`${hours} ${hours === 1 ? 'hour' : 'hours'}`");
    expect(plan).toContain("`${hourLabel}, ${remainder} ${remainder === 1 ? 'min' : 'mins'}`");
  });

  it('uses actual workout content to distinguish repeated strength purposes in the Week list', () => {
    expect(plan).toContain('title: strengthDisplayTitle(session)');
    expect(plan).toContain('session.workout.stations.flatMap');
    expect(plan).toContain('compactExerciseName(exercise.exerciseSnapshot.name)');
  });

  it('does not render a Side Quest generated event that cannot be reconciled to the current scheduled week', () => {
    expect(plan).toContain('const planned = scheduledSessionForEvent(event, scheduled)');
    expect(plan).toContain('event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID && scheduled.length > 0 && !planned');
  });
});
