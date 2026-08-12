import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('endurance prescription mobile UI', () => {
  it('resolves Side Quest calendar events back to the production session without requiring the exact persisted event row', () => {
    const runtime = source('apps/mobile/src/services/endurance-prescription-runtime.ts');
    expect(runtime).toContain('getLatestWholeAthletePlanSnapshot');
    expect(runtime).toContain('refreshLatestWholeAthletePlan().catch(() => null)');
    expect(runtime).toContain('resolveWholeAthleteSession(eventId, date, routeHint, exactEvent, generated)');
    expect(runtime).toContain('resolveGeneratedSessionForPreview(');
    expect(runtime).toContain('eventFromPlannedSession(eventId, planned, routeHint)');
    expect(runtime).toContain("source: 'whole_athlete_plan' | 'calendar_fallback' | 'route_snapshot'");
    expect(runtime).toContain('loadEndurancePrescriptionProfile()');
    expect(runtime).toContain('cssSecondsPer100: profile.cssSecondsPer100');
    expect(runtime).toContain('returnToRunProtocol: profile.returnToRunProtocol');
    expect(runtime).not.toContain('profile.bikeEnvironment');
    expect(runtime).not.toContain('profile.runEnvironment');
    expect(runtime).not.toContain('goalTerrain:');
    expect(runtime).toContain('buildEndurancePrescription(toPrescriptionSession(planned), context)');
  });

  it('renders sport-native workout details plus flexible venue guidance', () => {
    const preview = source('apps/mobile/src/app/endurance-preview.tsx');
    expect(preview).toContain('block.repeatDistance');
    expect(preview).toContain('block.restSeconds');
    expect(preview).toContain('formatPaceTarget');
    expect(preview).toContain("block.kind === 'walk_run'");
    expect(preview).toContain('compatibleEnvironments');
    expect(preview).toContain('FLEXIBLE SETUP');
    expect(preview).toContain('These are examples, not requirements. The training stimulus matters more than the venue.');
    expect(preview).toContain('Ask Coach about terrain or setup');
    expect(preview).toContain('WORKOUT');
    expect(preview).toContain('EFFORT');
    expect(preview).toContain('WHY TODAY');
    expect(preview).toContain('KEEP IN MIND');
  });

  it('keeps persistent endurance setup limited to swim prescription inputs and explicit return-to-run stage', () => {
    const settings = source('apps/mobile/src/app/endurance-settings.tsx');
    const profile = source('apps/mobile/src/services/endurance-profile.ts');
    expect(settings).toContain('CSS pace');
    expect(settings).toContain('25 yd');
    expect(settings).toContain('25 m');
    expect(settings).toContain('50 m');
    expect(settings).toContain('Run / walk stage');
    expect(settings).toContain('Keep the environment flexible');
    expect(settings).not.toContain('Default environment');
    expect(settings).not.toContain('BikeEnvironment');
    expect(settings).not.toContain('RunEnvironment');
    expect(profile).toContain('4 × 3 min run / 1 min walk');
    expect(profile).toContain('cssSecondsPer100');
    expect(profile).not.toContain('bikeEnvironment');
    expect(profile).not.toContain('runEnvironment');
  });

  it('hands terrain and surface questions to Coach with the exact endurance workout context', () => {
    const preview = source('apps/mobile/src/app/endurance-preview.tsx');
    const coach = source('apps/mobile/src/components/coach-screen-v2.tsx');
    const guidance = source('apps/mobile/src/services/endurance-environment-coach.ts');
    expect(preview).toContain('/coach?draft=');
    expect(preview).toContain('enduranceId=');
    expect(preview).toContain('enduranceDate=');
    expect(coach).toContain('useLocalSearchParams');
    expect(coach).toContain('loadEndurancePrescriptionPreview(enduranceId, enduranceDate)');
    expect(coach).toContain('answerEnduranceEnvironmentQuestion');
    expect(coach).toContain('I want to do this uphill');
    expect(guidance).toContain('4–5 minute uphill reps');
    expect(guidance).toContain('flat, predictable, and nontechnical');
    expect(guidance).toContain('Technical trail is not a great match for controlled quality intervals');
  });

  it('surfaces Endurance setup from the athlete profile', () => {
    const profile = source('apps/mobile/src/app/(tabs)/profile.tsx');
    expect(profile).toContain('title="Endurance setup"');
    expect(profile).toContain('Pool length, CSS pace, and return-to-run stage.');
    expect(profile).toContain("router.push('/endurance-settings' as Href)");
  });

  it('opens generated swim, bike, and run prescriptions directly from Week with a recovery snapshot', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(plan).toContain('const params = new URLSearchParams({');
    expect(plan).toContain('title: event.title');
    expect(plan).toContain('discipline: event.discipline');
    expect(plan).toContain('startAt: event.startAt');
    expect(plan).toContain("endAt: event.endAt ?? ''");
    expect(plan).toContain('router.push(`/endurance-preview?${params.toString()}` as Href)');
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
