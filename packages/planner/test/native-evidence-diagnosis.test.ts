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
    stages: Array<{ stage: string; status: string; diagnosis: string | null }>;
  };
  return { run, report };
}
afterEach(() => {
  for (const root of folders.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native UI failure evidence diagnosis', () => {
  it('reports passing only when all four native stages have nonempty passing evidence', () => {
    const root = fixture();
    for (const stage of ['profile', 'onboarding', 'ride', 'restart']) {
      writeFileSync(join(root, stage + '-junit.xml'), junit(1));
    }
    const { run, report } = diagnose(root);
    expect(run.status, run.stderr).toBe(0);
    expect(report.allPassed).toBe(true);
    expect(report.stages.map(x => x.status)).toEqual(Array(4).fill('PASSED'));
  });

  it('detects email mistakenly entered into Name without publishing input values', () => {
    const root = fixture();
    writeFileSync(join(root, 'profile-junit.xml'), junit(1, true));
    for (const stage of ['onboarding', 'ride', 'restart']) {
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
    expect(report.stages.slice(1).map(x => x.status)).toEqual(Array(3).fill('BLOCKED'));
    expect(readFileSync(join(root, 'native-ui-summary.json'), 'utf8'))
      .not.toContain('synthetic-secret@example.invalid');
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
