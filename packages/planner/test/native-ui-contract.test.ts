import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
function source(path: string) {
  return readFileSync(new URL(path, root), 'utf8');
}
function present(path: string) {
  return existsSync(new URL(path, root));
}

describe('native synthetic UI automation contract', () => {
  it('keeps a separate iOS identifier and non-production simulator credentials', () => {
    const flow = source('e2e/maestro/synthetic-onboarding-first-week.yaml');
    const profileFlow = source('e2e/maestro/synthetic-profile-entry.yaml');
    const workflow = source('.github/workflows/native-ios-simulator-smoke.yml');
    expect(flow).toContain('appId: com.sidequest.synthetic.qa');
    expect(flow).toContain('- runFlow: synthetic-profile-entry.yaml');
    expect(profileFlow).toContain('clearState: true');
    expect(workflow).toContain('QA_BUNDLE_ID: com.sidequest.synthetic.qa');
    expect(workflow).toContain('app.expo.ios.bundleIdentifier = process.env.QA_BUNDLE_ID');
    expect(workflow).not.toContain('EXPO_PUBLIC_BETA_INVITE_CODE=');
    expect(workflow).not.toContain('EXPO_PUBLIC_SUPABASE_');
  });

  it('enters Email before Name to avoid the iOS keyboard occluding lower controls', () => {
    const profile = source('e2e/maestro/synthetic-profile-entry.yaml');
    const emailIndex = profile.indexOf('id: "sidequest-qa-athlete-email"');
    const nameIndex = profile.indexOf('id: "sidequest-qa-athlete-name"');
    expect(emailIndex).toBeGreaterThan(0);
    expect(nameIndex).toBeGreaterThan(emailIndex);
    expect(profile).not.toMatch(/^- hideKeyboard/m);
    // The numeric activity keyboard must also avoid the unreliable dismiss API.
    expect(source('e2e/maestro/synthetic-completed-ride.yaml'))
      .not.toMatch(/^- hideKeyboard/m);
  });

  it('keeps the recorded flow targets backed by live accessible controls', () => {
    const cases: Array<[string, string]> = [
      ['apps/mobile/src/app/sign-in.tsx', 'sidequest-qa-athlete-name'],
      ['apps/mobile/src/app/sign-in.tsx', 'sidequest-qa-athlete-email'],
      ['apps/mobile/src/app/sign-in.tsx', 'sidequest-qa-enter-beta'],
      ['apps/mobile/src/app/onboarding.tsx', 'sidequest-qa-onboarding-next'],
      ['apps/mobile/src/app/onboarding-first-week.tsx', 'sidequest-qa-review-first-week'],
      ['apps/mobile/src/app/log-endurance.tsx', 'sidequest-qa-save-endurance'],
    ];
    for (const [path, id] of cases) {
      expect(source(path), path + ' must expose ' + id)
        .toContain('testID="' + id + '"');
    }
  });

  it('reuses the same manual endurance record identity on a failed save retry', () => {
    const sourceText = source('apps/mobile/src/app/log-endurance.tsx');
    expect(sourceText).toContain('const submissionRef = useRef<');
    expect(sourceText).toContain('submissionRef.current = submission;');
    expect(sourceText).toContain('id: submission.id');
    expect(sourceText).toContain('recordedAt: submission.recordedAt');
    expect(sourceText).not.toContain("id: 'manual-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 10),\\n        name:");
  });

  it('prevents signed-out screen effects from writing the previous athlete checkpoint', () => {
    const screen = source('apps/mobile/src/app/active-workout.tsx');
    expect(screen.split("if (!user || !workout || !sessionHydrated || phase === 'complete') return;"))
      .toHaveLength(3);
    expect(screen).toContain("loadLiveWorkoutSession(user?.id ?? null)");
    expect(screen).toContain("clearLiveWorkoutSession(user?.id ?? null)");
    expect(source('apps/mobile/src/services/active-workout-persistence.ts'))
      .toContain("if (profileId === null) return null;");
  });

  it('uses one staged native runner and refuses a non-synthetic app identity', () => {
    const runner = source('scripts/qa/run-native-maestro.sh');
    for (const flow of ['profile', 'onboarding', 'ride', 'restart']) {
      expect(runner).toMatch(new RegExp('run_flow ' + flow + ' e2e/maestro/'));
    }
    expect(runner).toContain('QA_BUNDLE_ID');
    expect(runner).toContain('com.sidequest.synthetic.qa');
    expect(runner).toContain('99=blocked');
    const script = new URL('../../../scripts/qa/run-native-maestro.sh', import.meta.url);
    const check = spawnSync('bash', ['-n', script.pathname], { encoding: 'utf8' });
    expect(check.status, check.stderr).toBe(0);
    const refused = spawnSync('bash', [script.pathname], {
      encoding: 'utf8',
      env: { ...process.env, MAESTRO_UDID: 'synthetic-do-not-run', QA_BUNDLE_ID: 'com.production.sidequest' },
    });
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('non-synthetic');
  });

  it('fails closed when trying to reuse a stale native binary for updated sources', () => {
    const workflow = source('.github/workflows/native-ios-ui-only.yml');
    const fingerprintScript = source('scripts/qa/native-source-fingerprint.mjs');
    expect(workflow).toContain('diff -u native-binary/native-source.sha256 current-native-source.sha256');
    expect(workflow).toContain('refusing to test an old binary');
    expect(workflow).toContain('QA_BUNDLE_ID: com.sidequest.synthetic.qa');
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('scripts/qa/run-native-maestro.sh');
    expect(fingerprintScript).toContain("path.startsWith('apps/mobile/src/')");
    expect(fingerprintScript).toContain("path.startsWith('packages/domain/src/')");
    expect(fingerprintScript).toContain("path.startsWith('packages/planner/src/')");
    expect(fingerprintScript).not.toContain("path.startsWith('e2e/maestro/')");
    const fingerprintPath = new URL('../../../scripts/qa/native-source-fingerprint.mjs', import.meta.url);
    const first = spawnSync(process.execPath, [fingerprintPath.pathname], {
      cwd: new URL('../../../', import.meta.url).pathname, encoding: 'utf8',
    });
    const second = spawnSync(process.execPath, [fingerprintPath.pathname], {
      cwd: new URL('../../../', import.meta.url).pathname, encoding: 'utf8',
    });
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout.trim()).toMatch(/^[a-f0-9]{64}$/);
    expect(second.stdout).toBe(first.stdout);
  });

  it('scrolls onboarding using the visible native button ID rather than hidden child text', () => {
    const flow = source('e2e/maestro/synthetic-onboarding-first-week.yaml');
    expect(flow).not.toContain('element: "Continue"');
    expect(flow).not.toContain('element: "Build my first week"');
    const scrolls = [...flow.matchAll(/- scrollUntilVisible:\n    element:\n      id: "sidequest-qa-onboarding-next"\n    direction: DOWN\n    visibilityPercentage: 50/g)];
    expect(scrolls.length).toBeGreaterThanOrEqual(6);
    expect(flow).toContain('id: "sidequest-qa-review-first-week"');
    expect(source('apps/mobile/src/app/onboarding.tsx'))
      .toContain('testID="sidequest-qa-onboarding-next"');
  });

  it('requires nested journeys to point at committed sibling flows', () => {
    const flowNames = [
      'synthetic-profile-entry.yaml',
      'synthetic-onboarding-first-week.yaml',
      'synthetic-completed-ride.yaml',
      'synthetic-ride-restart.yaml',
    ];
    for (const name of flowNames) {
      const path = 'e2e/maestro/' + name;
      expect(present(path), path).toBe(true);
      const value = source(path);
      expect(value).toMatch(/^appId: com\.sidequest\.synthetic\.qa/m);
      expect(value).toMatch(/^---$/m);
      for (const match of value.matchAll(/^- runFlow:\s*([^\s]+)$/gm)) {
        expect(present('e2e/maestro/' + match[1]), name + ' calls ' + match[1]).toBe(true);
        expect(match[1]).not.toBe(name);
      }
    }
  });

  it('records native screenshots and uploads failure evidence', () => {
    const workflow = source('.github/workflows/native-ios-simulator-smoke.yml');
    expect(workflow).toContain('synthetic-ios-first-launch.png');
    expect(workflow).toContain('maestro-evidence/');
    expect(workflow).toContain('if: always()');
    const runner = source('scripts/qa/run-native-maestro.sh');
    expect(workflow).toContain('MAESTRO_UDID:');
    expect(workflow).toContain('bash scripts/qa/run-native-maestro.sh');
    expect(workflow).toContain('name: sidequest-synthetic-ios-app');
    expect(workflow).toContain('native-source.sha256');
    expect(runner).toContain('${label}-junit.xml');
    expect(runner).toContain('run_flow profile e2e/maestro/synthetic-profile-entry.yaml');
    expect(runner).toContain('run_flow restart e2e/maestro/synthetic-ride-restart.yaml');
    expect(runner).toContain('e2e/maestro/synthetic-onboarding-first-week.yaml');
    expect(runner).toContain('e2e/maestro/synthetic-completed-ride.yaml');
    expect(runner).toContain('exit 1');
  });
});
