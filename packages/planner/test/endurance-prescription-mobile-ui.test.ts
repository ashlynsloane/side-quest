import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('endurance prescription mobile UI', () => {
  it('resolves Side Quest calendar events back to the production whole-athlete session', () => {
    const runtime = source('apps/mobile/src/services/endurance-prescription-runtime.ts');
    expect(runtime).toContain('refreshLatestWholeAthletePlan()');
    expect(runtime).toContain('resolveWholeAthleteSession(event, generated)');
    expect(runtime).toContain('session.date === eventDate');
    expect(runtime).toContain('session.discipline === event.discipline');
    expect(runtime).toContain('session.title === event.title');
    expect(runtime).toContain('session.durationMinutes === eventDuration');
    expect(runtime).toContain('buildEndurancePrescription(toPrescriptionSession(planned))');
  });

  it('renders the structured prescription as a first-class workout preview', () => {
    const preview = source('apps/mobile/src/app/endurance-preview.tsx');
    expect(preview).toContain('prescription.blocks.map');
    expect(preview).toContain("block.kind === 'intervals'");
    expect(preview).toContain("block.kind === 'drill'");
    expect(preview).toContain("block.kind === 'walk_run'");
    expect(preview).toContain('WORKOUT');
    expect(preview).toContain('EFFORT');
    expect(preview).toContain('WHY TODAY');
    expect(preview).toContain('KEEP IN MIND');
  });

  it('opens generated swim, bike, and run prescriptions directly from Week', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(plan).toContain("pathname: '/endurance-preview'");
    expect(plan).toContain('item.event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID');
    expect(plan).toContain('openEndurance(item.event)');
  });

  it('turns generated endurance cards in Full Schedule into workouts instead of all-day placeholders', () => {
    const schedule = source('apps/mobile/src/app/schedule.tsx');
    expect(schedule).toContain('previewEndurance(event)');
    expect(schedule).toContain('plannedEnduranceMeta(event)');
    expect(schedule).toContain("event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID && isEnduranceEvent(event)");
    expect(schedule).toContain('<Text style={styles.smallButtonText}>Open</Text>');
  });
});
