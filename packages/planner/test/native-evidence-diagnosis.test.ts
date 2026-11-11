import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../../scripts/qa/diagnose-native-evidence.mjs', import.meta.url));
const folders: string[] = [];
const junit = (count: number, fail = false) => `<testsuites><testsuite name="QA" tests="${count}" failures="${Number(fail)}" errors="0" skipped="0"><testcase name="case">${fail ? '<failure>Assertion failed</failure>' : ''}</testcase></testsuite></testsuites>`;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'native-evidence-'));
  folders.push(root);
  return root;
}
function diagnose(root: string) {
  const run = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  const report = JSON.parse(readFileSync(join(root, 'native-ui-summary.json'), 'utf8')) as {
    allPassed: boolean;
    stages: Array<{ stage: string; status: string; diagnosis: string | null; failure: string | null }>;
  };
  return { run, report };
}
afterEach(() => {
  for (const root of folders.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native UI failure evidence diagnosis', () => {
  it('reports passing only when all six native stages have nonempty passing evidence', () => {
    const root = fixture();
    for (const stage of ['profile', 'onboarding', 'ride', 'restart', 'isolation', 'strength']) {
      writeFileSync(join(root, stage + '-junit.xml'), junit(1));
    }
    const { run, report } = diagnose(root);
    expect(run.status, run.stderr).toBe(0);
    expect(report.allPassed).toBe(true);
    expect(report.stages.map(x => x.status)).toEqual(Array(6).fill('PASSED'));
  });

  it('detects email mistakenly entered into Name without publishing input values', () => {
    const root = fixture();
    writeFileSync(join(root, 'profile-junit.xml'), junit(1, true));
    for (const stage of ['onboarding', 'ride', 'restart', 'isolation', 'strength']) {
      writeFileSync(join(root, stage + '-console.log'), 'BLOCKED: prerequisite failed');
    }
    const folder = join(root, 'profile', 'screen-hierarchy');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'step-last.json'), JSON.stringify({
      children: [
        { attributes: { 'resource-id': 'sidequest-qa-athlete-name',
          value: 'Synthetic QA Athlete synthetic-secret@example.invalid' } },
        { attributes: { 'resource-id': 'sidequest-qa-athlete-email', enabled: 'true' } },
        { attributes: { 'resource-id': 'sidequest-qa-enter-beta', enabled: 'false' } },
      ],
    }));
    const { report } = diagnose(root);
    expect(report.allPassed).toBe(false);
    expect(report.stages[0]?.status).toBe('FAILED');
    expect(report.stages[0]?.diagnosis).toMatch(/keyboard-focus leak/);
    expect(report.stages.slice(1).map(x => x.status)).toEqual(Array(5).fill('BLOCKED'));
    expect(readFileSync(join(root, 'native-ui-summary.json'), 'utf8'))
      .not.toContain('synthetic-secret@example.invalid');
  });

  it('distinguishes a tapped-but-stuck final onboarding screen from generation errors', () => {
    for (const [label, diagnosis] of [
      ['Ready to build.', 'route did not advance'],
      ['Making the first draft.', 'did not reach a completed'],
      ['The week needs one more review.', 'generation error state'],
      ['First-week navigation error: synthetic message', 'route threw a navigation exception'],
    ]) {
      const root = fixture();
      writeFileSync(join(root, 'profile-junit.xml'), junit(1));
      writeFileSync(join(root, 'onboarding-junit.xml'), junit(1, true));
      const folder = join(root, 'onboarding', 'screen-hierarchy');
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'step-last.json'), JSON.stringify({
        children: [
          { attributes: { accessibilityText: label } },
          { attributes: { 'resource-id': 'sidequest-qa-onboarding-next', enabled: 'true' } },
        ],
      }));
      const { report } = diagnose(root);
      expect(report.stages[1]?.status).toBe('FAILED');
      expect(report.stages[1]?.diagnosis).toContain(diagnosis);
      expect(report.allPassed).toBe(false);
    }
  });

  it('identifies a composite native duration label after a successfully saved ride', () => {
    for (const [stage, durationLabel] of [
      ['ride', '75 minutes · Intensity unavailable'],
      ['restart', '75 min · intensity unavailable'],
    ]) {
      const root = fixture();
      const expected = stage === 'ride' ? '75 minutes' : '75 min';
      writeFileSync(join(root, stage + '-junit.xml'),
        junit(1, true).replace('Assertion failed',
          'Assertion is false: "' + expected + '" is visible'));
      const folder = join(root, stage, 'screen-hierarchy');
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'step-last.json'), JSON.stringify({
        children: [
          { attributes: { accessibilityText: 'Completed bike' } },
          { attributes: { accessibilityText: durationLabel } },
        ],
      }));
      const { report } = diagnose(root);
      const result = report.stages.find(x => x.stage === stage);
      expect(result?.status).toBe('FAILED');
      expect(result?.diagnosis).toContain('composite native accessibility label');
      expect(report.allPassed).toBe(false);
    }
  });

  it('identifies the restored Today screen and composite Week tab after cold restart', () => {
    const root = fixture();
    writeFileSync(join(root, 'restart-junit.xml'),
      junit(1, true).replace('Assertion failed',
        'Element not found: Text matching regex: Week'));
    const folder = join(root, 'restart', 'screen-hierarchy');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'step-last.json'), JSON.stringify({
      children: [
        { attributes: { accessibilityText: 'TODAY' } },
        { attributes: { accessibilityText: 'Week, tab, 2 of 6' } },
      ],
    }));
    const { report } = diagnose(root);
    expect(report.allPassed).toBe(false);
    expect(report.stages[3]?.status).toBe('FAILED');
    expect(report.stages[3]?.diagnosis).toMatch(/Cold restart restored the Today screen/);
    expect(readFileSync(join(root, 'native-ui-summary.json'), 'utf8'))
      .not.toContain('synthetic-secret');
  });

  it('recognizes the native History link hidden behind bottom tabs after restart', () => {
    const root = fixture();
    writeFileSync(join(root, 'restart-junit.xml'), junit(1, true).replace(
      'Assertion failed',
      'Assertion is false: "Training history" is visible',
    ));
    const folder = join(root, 'restart', 'screen-hierarchy');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'step-009-assertCondition-Training_history.json'), JSON.stringify({
      children: [
        { attributes: { accessibilityText: 'Inspect full training history',
          bounds: '[38,828][224,861]' } },
        { attributes: { 'resource-id': 'sidequest-qa-week-tab',
          accessibilityText: 'Week, tab, 2 of 6', bounds: '[80,807][160,864]' } },
      ],
    }));
    const { report } = diagnose(root);
    expect(report.stages[3]?.status).toBe('FAILED');
    expect(report.stages[3]?.diagnosis).toMatch(/under the bottom navigation bar/);
    expect(report.stages[3]?.diagnosis).toMatch(/persistence after restart is unverified/);
    expect(report.allPassed).toBe(false);
  });

  it('reports XCTest startup failure as infrastructure, never an app assertion failure', () => {
    const root = fixture();
    writeFileSync(join(root, 'profile-console.log'),
      'iOS driver not ready in time, consider increasing timeout by configuring MAESTRO_DRIVER_STARTUP_TIMEOUT');
    writeFileSync(join(root, 'onboarding-console.log'),
      'BLOCKED: onboarding requires passing profile creation');
    const { report } = diagnose(root);
    expect(report.allPassed).toBe(false);
    expect(report.stages[0]?.status).toBe('DRIVER_STARTUP_TIMEOUT');
    expect(report.stages[1]?.status).toBe('BLOCKED');
  });

  it('keeps isolation mandatory even when original four journeys pass', () => {
    const root = fixture();
    for (const stage of ['profile', 'onboarding', 'ride', 'restart']) {
      writeFileSync(join(root, stage + '-junit.xml'), junit(1));
    }
    const { report } = diagnose(root);
    expect(report.stages.map((stage) => stage.status))
      .toEqual(['PASSED', 'PASSED', 'PASSED', 'PASSED', 'NOT_RUN', 'NOT_RUN']);
    expect(report.allPassed).toBe(false);
  });

  it('requires the strength restart stage even when the first five pass', () => {
    const root = fixture();
    for (const stage of ['profile', 'onboarding', 'ride', 'restart', 'isolation']) {
      writeFileSync(join(root, stage + '-junit.xml'), junit(1));
    }
    const { report } = diagnose(root);
    expect(report.stages[5]?.status).toBe('NOT_RUN');
    expect(report.allPassed).toBe(false);
  });

  it('fails closed on skipped, empty or inconsistent native JUnit evidence', () => {
    for (const broken of [
      '<testsuites><testsuite tests="1" failures="0" errors="0" skipped="1"><testcase name="x"><skipped/></testcase></testsuite></testsuites>',
      '<testsuites><testsuite tests="1" failures="0" errors="0"><testcase name="x"><skipped/></testcase></testsuite></testsuites>',
      '<testsuites><testsuite tests="1" failures="0" errors="0" skipped="0"></testsuite></testsuites>',
      '<testsuites><testsuite tests="2" failures="0" errors="0" skipped="0"><testcase name="x"/></testsuite></testsuites>',
    ]) {
      const root = fixture();
      for (const stage of ['profile', 'onboarding', 'ride', 'restart']) {
        writeFileSync(join(root, stage + '-junit.xml'), junit(1));
      }
      writeFileSync(join(root, 'isolation-junit.xml'), broken);
      const { report } = diagnose(root);
      expect(report.allPassed).toBe(false);
      expect(report.stages[4]?.status).toBe('INVALID_REPORT');
      expect(report.stages[4]?.failure).toMatch(/no passing evidence/i);
    }
  });

  it('never counts a missing or truncated JUnit report as passing', () => {
    const root = fixture();
    writeFileSync(join(root, 'profile-junit.xml'), '<testsuite name="incomplete" tests="1">');
    const { report } = diagnose(root);
    expect(report.allPassed).toBe(false);
    expect(report.stages[0]?.status).toBe('INVALID_REPORT');
    expect(report.stages.slice(1).every(x => x.status === 'NOT_RUN')).toBe(true);
  });
});
