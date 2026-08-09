import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('You + Progress V3 workspace', () => {
  it('keeps five visible tabs and places Progress inside You as a hidden sibling route', () => {
    const tabs = source('apps/mobile/src/app/(tabs)/_layout.tsx');
    expect(tabs).toContain('title: \'Today\'');
    expect(tabs).toContain('title: \'Week\'');
    expect(tabs).toContain('title: \'Train\'');
    expect(tabs).toContain('title: \'Coach\'');
    expect(tabs).toContain('title: \'You\'');
    expect(tabs).toContain('name="profile-progress" options={{ href: null }}');
  });

  it('provides a dedicated Progress/Profile mode switch without adding navigation clutter', () => {
    const mode = source('apps/mobile/src/components/you-mode-switch.tsx');
    const profile = source('apps/mobile/src/app/(tabs)/profile.tsx');
    const progressRoute = source('apps/mobile/src/app/(tabs)/profile-progress.tsx');
    const progress = source('apps/mobile/src/components/progress-screen-v3.tsx');

    expect(mode).toContain('/(tabs)/profile-progress');
    expect(mode).toContain('/(tabs)/profile');
    expect(profile).toContain('<YouModeSwitch active="profile" />');
    expect(progress).toContain('<YouModeSwitch active="progress" />');
    expect(progressRoute).toContain("@/components/progress-screen-v3");
  });

  it('builds Progress from completed training and plan-relative regional evidence rather than a synthetic score', () => {
    const runtime = source('apps/mobile/src/services/progress-dashboard.ts');
    const progress = source('apps/mobile/src/components/progress-screen-v3.tsx');

    expect(runtime).toContain('loadTrainingHistory(500)');
    expect(runtime).toContain('getRegionalStrengthStatusSnapshot(now, windowDays)');
    expect(runtime).toContain('More volume is context, not automatically better.');
    expect(runtime).toContain('Lower volume is not treated as training debt.');
    expect(progress).toContain('Training history');
    expect(progress).toContain('Recent sessions, progression signals, and anything that needs attention.');
    expect(progress).not.toContain('completionFraction');
  });

  it('gives body-area status, recent sessions, progression, body map, history, and weekly review clear homes', () => {
    const progress = source('apps/mobile/src/components/progress-screen-v3.tsx');
    expect(progress).toContain('BODY AREAS');
    expect(progress).toContain('Anything that needs attention');
    expect(progress).toContain('RECENT');
    expect(progress).toContain('Recent sessions');
    expect(progress).toContain('/progressions');
    expect(progress).toContain('/insights');
    expect(progress).toContain('/training-history');
    expect(progress).toContain('/weekly-review');
  });

  it('makes Profile show the current plan and training setup before secondary settings', () => {
    const profile = source('apps/mobile/src/app/(tabs)/profile.tsx');
    expect(profile).toContain('CURRENT PLAN');
    expect(profile).toContain('TRAINING SETUP');
    expect(profile).toContain('getLatestTrainingBlock()');
    expect(profile).toContain('getDefaultEquipmentProfile()');
    expect(profile).toContain('getLatestPTProfile()');
    expect(profile).toContain('getActiveTrainingCheckIn()');
    expect(profile).toContain('/training-intelligence');
    expect(profile).toContain('ProductDisclosure');
  });
});
