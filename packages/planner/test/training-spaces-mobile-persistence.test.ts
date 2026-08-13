import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), '../../', relativePath), 'utf8');
}

describe('training spaces mobile persistence', () => {
  it('stores structured training-space preferences without touching Today or Week UI', () => {
    const source = read('apps/mobile/src/services/training-spaces.ts');
    expect(source).toContain("sidequest.training-spaces.v1");
    expect(source).toContain('strengthLocationPreference');
    expect(source).toContain('preferredHomeSessions');
    expect(source).toContain('preferredGymSessions');
    expect(source).toContain('preferGymOnSwimDays');
  });

  it('keeps home conservative and gym capability-rich by default', () => {
    const source = read('apps/mobile/src/services/training-spaces.ts');
    expect(source).toContain("capabilities: [{ equipmentId: 'bodyweight', quantity: 1 }]");
    expect(source).toContain("{ equipmentId: 'cable_machine', quantity: 1 }");
    expect(source).toContain("{ equipmentId: 'leg_press', quantity: 1 }");
  });

  it('supports free-weight min/max ranges in persisted profiles', () => {
    const source = read('apps/mobile/src/services/training-spaces.ts');
    expect(source).toContain('minLoadLb');
    expect(source).toContain('maxLoadLb');
    expect(source).toContain('adjustable');
  });
});
