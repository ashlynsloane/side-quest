import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const plan = readFileSync(resolve(repoRoot, 'apps/mobile/src/app/(tabs)/plan.tsx'), 'utf8');
const synthesis = readFileSync(resolve(repoRoot, 'apps/mobile/src/services/training-synthesis.ts'), 'utf8');
const catalog = readFileSync(resolve(repoRoot, 'apps/mobile/src/services/workout-name-catalog.ts'), 'utf8');
const personality = readFileSync(resolve(repoRoot, 'apps/mobile/src/services/workout-name-personality.ts'), 'utf8');
const namingContext = readFileSync(resolve(repoRoot, 'apps/mobile/src/services/workout-name-context.ts'), 'utf8');
const wholeAthletePlan = readFileSync(resolve(repoRoot, 'apps/mobile/src/services/whole-athlete-plan.ts'), 'utf8');

describe('week plan readability', () => {
  it('switches training durations to hours and minutes only after 120 minutes', () => {
    expect(plan).toContain('function formatTrainingDuration(minutes: number)');
    expect(plan).toContain('if (rounded <= 120) return `${rounded} min`');
    expect(plan).toContain("`${hours} ${hours === 1 ? 'hour' : 'hours'}`");
    expect(plan).toContain("`${hourLabel}, ${remainder} ${remainder === 1 ? 'min' : 'mins'}`");
  });

  it('uses athlete-facing identities instead of exercise-list titles for strength', () => {
    expect(plan).toContain('title: plannedStrengthDisplayName(session)');
    expect(synthesis).toContain('export function plannedStrengthDisplayName(session: PlannedStrengthSession, hints: StrengthNamingHints = {})');
    expect(synthesis).toContain('session.workout.stations');
    expect(synthesis).toContain('fingerprint || session.workout.name || session.title');
    expect(synthesis).toContain("discipline: 'strength'");
    expect(catalog).toContain("n('Catch & Core'");
    expect(catalog).toContain("n('Lats & Lines'");
    expect(catalog).toContain("n('Chain Reaction'");
    expect(catalog).toContain("n('The Unsexy Stuff'");
    expect(personality).toContain("p('Pick Things Up, Put Them Down'");
    expect(personality).toContain("p('Leg Day, But Responsible'");
    expect(personality).toContain("p('Hinge Responsibly'");
    expect(plan).not.toContain('compactExerciseName(exercise.exerciseSnapshot.name)');
  });

  it('keeps dose-specific and structure-specific names honest and cools names down for 30 days', () => {
    expect(personality).toContain("['T-Shirt Ride', { min: 45, max: 75 }]");
    expect(personality).toContain("['Three Hours of Snacks', { min: 180 }]");
    expect(personality).toContain("['Snack Acquisition Ride', { min: 120 }]");
    expect(personality).toContain("['Twenty Minutes of Character Development', { min: 18, max: 25 }]");
    expect(personality).toContain("if (entry.intents?.includes('long') && duration < minimumLongMinutes(context.discipline)) return false");
    expect(personality).toContain("if (discipline === 'swim') return 60");
    expect(personality).toContain('passesStructureSemantics(entry, context)');
    expect(personality).toContain("const STRUCTURE_LOCKED_INTENTS = new Set<WorkoutNameIntent>(['return_to_run', 'brick', 'technique', 'fartlek', 'progressive', 'threshold'])");
    expect(personality).toContain("if (context.intensity === 'hard')");
    expect(personality).toContain('const freshCandidates = candidates.filter');
    expect(synthesis).toContain('const WORKOUT_NAME_COOLDOWN_DAYS = 30');
    expect(synthesis).toContain('const runtimeNameAssignments = new Map<string, NameHistoryItem>()');
    expect(synthesis).toContain('days >= 0 && days < WORKOUT_NAME_COOLDOWN_DAYS');
    expect(synthesis).toContain(".filter(([key]) => key !== assignmentKey)");
  });

  it('changes voice by season, holiday window, race phase, and named race context', () => {
    expect(namingContext).toContain("export type WorkoutNameSeason = 'winter' | 'spring' | 'summer' | 'fall'");
    expect(namingContext).toContain("return monthDay >= '12-15' || monthDay <= '01-02'");
    expect(namingContext).toContain("return 'race_week'");
    expect(personality).toContain("seasonal('Tan Lines & Tailwinds'");
    expect(personality).toContain("seasonal('Leaf Peeping Peloton'");
    expect(personality).toContain("seasonal('Basement World Champs'");
    expect(personality).toContain("holiday('Hinge All the Way'");
    expect(personality).toContain("raceWeek('Do Not Invent New Fitness'");
    expect(personality).toContain("raceWeek('Where Did I Put My Goggles?'");
    expect(personality).toContain("raceTheme('Pacific Pull'");
    expect(personality).toContain("raceTheme('Corniche Cruise'");
    expect(synthesis).toContain('workoutDate: date');
    expect(synthesis).toContain('weeksUntilRace(date, metadata.raceDate)');
    expect(wholeAthletePlan).toContain('generatedWorkoutNamingMetadata({');
    expect(wholeAthletePlan).toContain('raceDate: input.goal.eventDate');
    expect(wholeAthletePlan).toContain('raceName: input.goal.name');
  });

  it('does not render a Side Quest generated event that cannot be reconciled to the current scheduled week', () => {
    expect(plan).toContain('const planned = scheduledSessionForEvent(event, scheduled)');
    expect(plan).toContain('event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID && scheduled.length > 0 && !planned');
  });
});
