import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Readiness + training protection UI V3', () => {
  it('routes both check-in entry points through focused V3 screens', () => {
    const readinessRoute = source('apps/mobile/src/app/readiness.tsx');
    const protectionRoute = source('apps/mobile/src/app/today-check-in.tsx');
    expect(readinessRoute).toContain("@/components/readiness-screen-v3");
    expect(protectionRoute).toContain("@/components/training-check-in-screen-v3");
  });

  it('uses readiness as recovery context without displaying a readiness score', () => {
    const readiness = source('apps/mobile/src/components/readiness-screen-v3.tsx');
    expect(readiness).toContain('readinessScore(preview)');
    expect(readiness).toContain('CURRENT COACHING READ');
    expect(readiness).toContain('No readiness score is shown or rewarded');
    expect(readiness).not.toContain('/ 5');
    expect(readiness).toContain('Something hurts or movement is limited?');
    expect(readiness).toContain("router.push('/today-check-in'");
  });

  it('keeps symptoms and restrictions separate from ordinary recovery context', () => {
    const protection = source('apps/mobile/src/components/training-check-in-screen-v3.tsx');
    expect(protection).toContain('TRAINING PROTECTION');
    expect(protection).toContain('No limitation');
    expect(protection).toContain('Muscle soreness');
    expect(protection).toContain('Pain or tightness');
    expect(protection).toContain('Pause strength');
    expect(protection).toContain('WHAT SIDE QUEST WILL DO');
  });

  it('keeps area, movement, severity, and duration detail progressive', () => {
    const protection = source('apps/mobile/src/components/training-check-in-screen-v3.tsx');
    expect(protection).toContain('ProductDisclosure');
    expect(protection).toContain('Pinpoint an area');
    expect(protection).toContain('Movements that aggravate it');
    expect(protection).toContain('Severity + duration');
    expect(protection).toContain('PainBodyMap');
  });

  it('preserves deterministic protection and plan-reconciliation behavior', () => {
    const protection = source('apps/mobile/src/components/training-check-in-screen-v3.tsx');
    expect(protection).toContain('buildRestrictionsFromPainAreas');
    expect(protection).toContain('adaptTrainingBlock');
    expect(protection).toContain('saveTrainingCheckIn');
    expect(protection).toContain('saveTrainingBlock');
    expect(protection).toContain('clearActiveTrainingCheckIn');
    expect(protection).toContain('pauseStrengthTraining');
  });
});
