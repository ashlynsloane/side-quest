import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { retryablePreInteractionDriverFailure } from '../../../scripts/qa/native-driver-retry.mjs';

const script = fileURLToPath(new URL('../../../scripts/qa/native-driver-retry.mjs', import.meta.url));
const dirs: string[] = [];
function fixture(junit: string, records: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'native-driver-retry-'));
  dirs.push(dir);
  const evidence = join(dir, 'onboarding');
  mkdirSync(evidence);
  writeFileSync(join(dir, 'onboarding-junit.xml'), junit);
  writeFileSync(join(evidence, 'commands.json'), JSON.stringify(records));
  return { report: join(dir, 'onboarding-junit.xml'), evidence };
}
const transport = '<failure>maestro.DeviceUnreachableException: Device became unreachable during setPermissions</failure>';
const commands = [
  { command: { defineVariablesCommand: {} }, metadata: { status: 'COMPLETED' } },
  { command: { applyConfigurationCommand: {} }, metadata: { status: 'COMPLETED' } },
  { command: { launchAppCommand: {} }, metadata: { status: 'RUNNING' } },
];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe('safe native driver retry policy', () => {
  it('retries only the observed transport failure before any UI step', () => {
    expect(retryablePreInteractionDriverFailure(transport, commands)).toBe(true);
    const f = fixture(transport, commands);
    expect(spawnSync(process.execPath, [script, f.report, f.evidence]).status).toBe(0);
  });
  it('never retries a failed UI assertion or a completed UI tap', () => {
    const tap = { command: { tapOnElementCommand: {} }, metadata: { status: 'COMPLETED' } };
    for (const [xml, steps] of [
      ['<failure>Assertion is false</failure>', commands],
      [transport, [...commands, tap]],
      [transport, [...commands.slice(0, 2), { ...commands[2], metadata: { status: 'COMPLETED' } }]],
      [transport, []],
    ] as Array<[string, unknown[]]>) {
      expect(retryablePreInteractionDriverFailure(xml, steps)).toBe(false);
      const f = fixture(xml, steps);
      expect(spawnSync(process.execPath, [script, f.report, f.evidence]).status).toBe(1);
    }
  });
  it('rejects ambiguous or missing command evidence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'native-driver-retry-missing-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'onboarding-junit.xml'), transport);
    expect(spawnSync(process.execPath, [script, join(dir, 'onboarding-junit.xml'), join(dir, 'no-commands')]).status).toBe(1);
  });
});
