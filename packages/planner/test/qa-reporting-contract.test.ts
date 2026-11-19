import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../../scripts/qa/summarize-junit.mjs', import.meta.url));
const folders: string[] = [];

function invoke(
  reports: Record<string, string>,
  names: string[],
  gates: Record<string, string> = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'sidequest-junit-evidence-'));
  folders.push(directory);
  for (const [name, content] of Object.entries(reports)) {
    writeFileSync(join(directory, name), content);
  }
  const result = spawnSync(process.execPath, [script, ...names], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: '',
      ...gates,
    },
  });
  return {
    status: result.status,
    report: JSON.parse(readFileSync(join(directory, 'qa-summary.json'), 'utf8')) as {
      status: string;
      uniquePlannerTests?: { tests: number } | null;
      totals: { tests: number; failures: number };
      files: Array<{ file: string; status: string }>;
    },
  };
}

const good = '<testsuites><testsuite name="valid" tests="3" failures="0" errors="0" skipped="0"><testcase name="a"/><testcase name="b"/><testcase name="c"/></testsuite></testsuites>';
const malformed = '<testsuites><testsuite name="truncated" tests="3" failures="0">';
const allSkipped = '<testsuites><testsuite name="skipped" tests="2" failures="0" errors="0" skipped="2"><testcase name="a"><skipped/></testcase><testcase name="b"><skipped/></testcase></testsuite></testsuites>';
const contradictory = '<testsuites><testsuite name="disagree" tests="1" failures="0" errors="0" skipped="0"><testcase name="a"><failure message="oops"/></testcase></testsuite></testsuites>';

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('auditable CI result parser', () => {
  it('counts full-regression tests once even when named acceptance suites repeat them', () => {
    const { status, report } = invoke({
      'planner-regression-junit.xml': good,
      'mobile-workout-qa-junit.xml': good,
    }, ['planner-regression-junit.xml', 'mobile-workout-qa-junit.xml'], {
      QA_PLANNER_TYPECHECK: 'success',
      QA_MOBILE_TYPECHECK: 'success',
    });
    expect(status).toBe(0);
    expect(report.status).toBe('PASS');
    expect(report.uniquePlannerTests).toEqual(expect.objectContaining({ tests: 3 }));
    expect(report.totals.tests).toBe(6); // named suites intentionally overlap
  });

  it('never calls a missing acceptance report passing', () => {
    const { status, report } = invoke({}, ['missing-junit.xml']);
    expect(status).not.toBe(0);
    expect(report.status).toBe('INCOMPLETE');
    expect(report.files[0]?.status).toBe('MISSING');
  });

  it('rejects truncated XML and suites with no executed tests', () => {
    for (const source of [malformed, allSkipped]) {
      const { status, report } = invoke({ 'bad.xml': source }, ['bad.xml']);
      expect(status).not.toBe(0);
      expect(report.status).toBe('INCOMPLETE');
    }
  });

  it('rejects a failure element hidden by incorrect zero-failure attributes', () => {
    const { status, report } = invoke({ 'bad.xml': contradictory }, ['bad.xml']);
    expect(status).not.toBe(0);
    expect(report.status).toBe('FAIL');
    expect(report.files[0]?.status).toBe('INCONSISTENT_XML_FAILURES');
  });

  it('fails the gate when typechecking failed even if all tests report success', () => {
    const { status, report } = invoke({ 'good.xml': good }, ['good.xml'], {
      QA_MOBILE_TYPECHECK: 'failure',
    });
    expect(status).not.toBe(0);
    expect(report.status).toBe('FAIL');
  });
});
