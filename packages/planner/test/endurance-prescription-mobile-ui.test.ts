import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('endurance prescription mobile UI', () => {
  it('resolves Side Quest calendar events back to the production whole-athlete session with athlete endurance context', () => {
    const runtime = source('apps/mobile/src/services/endurance-prescription-runtime.ts');
    expect(runtime).toContain('refreshLatestWholeAthletePlan()');
    expect(runtime).toContain('resolveWholeAthleteSession(event, generated)');
    expect(runtime).toContain('session.date === eventDate');
    expect(runtime).toContain('session.discipline === event.discipline');
    expect(runtime).toContain('session.title === event.title');
    expect(runtime).toContain('session.durationMinutes === eventDuration');
    expect(runtime).toContain('loadEndurancePrescriptionProfile()');
    expect(runtime).toContain('goal?.terrain');
    expect(runtime).toContain('cssSecondsPer100: profile.cssSecondsPer100');
    expect(runtime).toContain('returnToRunProtocol: profile.returnToRunProtocol');
    expect(runtime).toContain('buildEndurancePrescription(toPrescriptionSession(planned), context)');
  });

  it('renders distance, rest, CSS pace, terrain, and run-walk structure as first-class workout details', () => {
    const preview = source('apps/mobile/src/app/endurance-preview.tsx');
    expect(preview).toContain('block.repeatDistance');
    expect(preview).toContain('block.restSeconds');
    expect(preview).toContain('formatPaceTarget');
    expect(preview).toContain("block.kind === 'walk_run'");
    expect(preview).toContain('prescription.environmentLabel');
    expect(preview).toContain('WORKOUT');
    expect(preview).toContain('EFFORT');
    expect(preview).toContain('WHY TODAY');
    expect(preview).toContain('KEEP IN MIND');
  });

  it('provides athlete-controlled endurance setup instead of hidden hard-coded thresholds', () => {
    const settings = source('apps/mobile/src/app/endurance-settings.tsx');
    const profile = source('apps/mobile/src/services/endurance-profile.ts');
    expect(settings).toContain('CSS pace');
    expect(settings).toContain('25 yd');
    expect(settings).toContain('25 m');
    expect(settings).toContain('50 m');
    expect(settings).toContain('Run / walk stage');
    expect(settings).toContain('Treadmill');
    expect(settings).toContain('Trail');
    expect(profile).toContain('4 × 3 min run / 1 min walk');
    expect(profile).toContain('cssSecondsPer100');
  });

  it('opens generated swim, bike, and run prescriptions directly from Week', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(plan).toContain('/endurance-preview?id=');
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
