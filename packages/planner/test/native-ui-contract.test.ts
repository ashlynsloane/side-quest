import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

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
    const workflow = source('.github/workflows/native-ios-simulator-smoke.yml');
    expect(flow).toContain('appId: com.sidequest.synthetic.qa');
    expect(flow).toContain('clearState: true');
    expect(workflow).toContain('QA_BUNDLE_ID: com.sidequest.synthetic.qa');
    expect(workflow).toContain('app.expo.ios.bundleIdentifier = process.env.QA_BUNDLE_ID');
    expect(workflow).not.toContain('EXPO_PUBLIC_BETA_INVITE_CODE=');
    expect(workflow).not.toContain('EXPO_PUBLIC_SUPABASE_');
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

  it('requires nested journeys to point at committed sibling flows', () => {
    const flowNames = [
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
    expect(workflow).toContain('onboarding-junit.xml');
    expect(workflow).toContain('ride-junit.xml');
    expect(workflow).toContain('e2e/maestro/synthetic-onboarding-first-week.yaml');
    expect(workflow).toContain('e2e/maestro/synthetic-completed-ride.yaml');
    expect(workflow).toContain('exit 1');
  });
});
