import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('race-location workout-name personality', () => {
  it('lets the athlete enter an optional race location in Goal Setup', () => {
    const route = source('apps/mobile/src/app/goal-plan.tsx');
    const runtime = source('apps/mobile/src/services/goal-setup-runtime.ts');
    expect(route).toContain('RACE LOCATION · OPTIONAL');
    expect(route).toContain("patch({ raceLocation })");
    expect(route).toContain('Used for workout-name personality only.');
    expect(runtime).toContain('raceLocation?: string');
    expect(runtime).toContain('[option.title, location, draft.eventDate].filter(Boolean).join');
  });

  it('derives location context generically instead of hard-coding individual races', () => {
    const location = source('apps/mobile/src/services/race-location-personality.ts');
    const personality = source('apps/mobile/src/services/workout-name-personality.ts');
    expect(location).toContain('deriveRaceLocationPersonality');
    expect(location).toContain('RaceLocationEnrichment');
    expect(personality).toContain('buildRaceLocationEntries');
    expect(personality).toContain('`${place} Lane Lines`');
    expect(personality).toContain('`Roads to ${place}`');
    expect(personality.toLowerCase()).not.toContain("location.includes('oceanside')");
    expect(personality.toLowerCase()).not.toContain("location.includes('nice')");
    expect(personality).not.toContain("raceTheme('Pacific Pull'");
    expect(personality).not.toContain("raceTheme('Riviera Roll'");
  });

  it('keeps an enrichment seam for factual terrain and culture context later', () => {
    const location = source('apps/mobile/src/services/race-location-personality.ts');
    const personality = source('apps/mobile/src/services/workout-name-personality.ts');
    expect(location).toContain('environmentTags?: readonly RaceLocationEnvironment[]');
    expect(location).toContain('cultureTags?: readonly string[]');
    expect(personality).toContain("environment === 'coastal'");
    expect(personality).toContain("environment === 'mountain' || environment === 'high_altitude'");
    expect(personality).toContain("environment === 'lake'");
  });

  it('preserves the existing semantic naming safeguards', () => {
    const personality = source('apps/mobile/src/services/workout-name-personality.ts');
    expect(personality).toContain('Hinge Responsibly');
    expect(personality).toContain('HARD_DURATION_GATES');
    expect(personality).toContain('passesStructureSemantics');
    expect(personality).toContain('recentNames');
    expect(personality).toContain("if (discipline === 'swim') return 60");
  });
});
