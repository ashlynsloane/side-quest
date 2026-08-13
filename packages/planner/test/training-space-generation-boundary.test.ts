import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('training-space generation boundary', () => {
  it('assigns training spaces only after weekly scheduling is complete', async () => {
    const source = await readFile(
      new URL(
        '../../../apps/mobile/src/services/whole-athlete-plan.ts',
        import.meta.url,
      ),
      'utf8',
    );

    const scheduling = source.indexOf(
      'applyAvailabilityToWholeAthleteWeeks([returnToRunPlan], availabilityProfile)',
    );

    const spaceAssignment = source.indexOf(
      'applyPersistedTrainingSpaces(scheduledPlan.sessions)',
    );

    const persistedWeek = source.indexOf(
      'weeks.push(scheduledPlan)',
    );

    expect(scheduling).toBeGreaterThan(-1);
    expect(spaceAssignment).toBeGreaterThan(scheduling);
    expect(persistedWeek).toBeGreaterThan(spaceAssignment);

    // Space allocation must not replace the planner-produced schedule.
    expect(source).not.toContain(
      'weeks.push(applyPersistedTrainingSpaces',
    );
    expect(source).not.toContain(
      'scheduledPlan = applyPersistedTrainingSpaces',
    );
  });

  it('changes workout content at preview time without changing the planned session', async () => {
    const source = await readFile(
      new URL(
        '../../../apps/mobile/src/state/workout-context.tsx',
        import.meta.url,
      ),
      'utf8',
    );

    expect(source).toContain(
      'trainingSpaceAssignmentForPlannedSession(session.id)',
    );

    expect(source).toContain(
      'generateWorkoutForAssignedTrainingSpace({',
    );

    expect(source).toContain(
      'request: session.workout.request',
    );

    expect(source).toContain(
      'exercises: exerciseSeed',
    );

    // If no assignment exists or generation fails, preserve the original workout.
    expect(source).toContain(
      '...session.workout',
    );

    // The resolved session inherits the original session structure.
    expect(source).toContain(
      'const resolvedSession: PlannedStrengthSession = {',
    );
    expect(source).toContain(
      '...session,',
    );
  });
});
