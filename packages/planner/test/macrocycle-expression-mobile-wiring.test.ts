import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), '../../', path), 'utf8');
}

describe('macrocycle expression in mobile', () => {
  it('shows a colored stimulus tag next to every Week workout instead of relying on easy/hard', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    const tags = source('apps/mobile/src/services/training-stimulus-tag.ts');
    expect(plan).toContain('<StimulusTagBadge tag={item.stimulusTag}');
    expect(plan).toContain('RACE HORIZON · WEEK');
    expect(plan).toContain('developmentWeek.weekPurpose');
    expect(tags).toContain("tag('VO₂'");
    expect(tags).toContain("tag('LONG · HILLS'");
    expect(tags).toContain("tag('RTR'");
    expect(tags).toContain("tag('DELOAD'");
  });

  it('makes recovery/absorption actually reduce the strength workout opened by the athlete', () => {
    const dose = source('apps/mobile/src/services/race-horizon-strength-dose.ts');
    const plan = source('apps/mobile/src/services/whole-athlete-plan.ts');
    const week = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(dose).toContain("developmentWeek.loadIntent === 'recovery'");
    expect(dose).toContain("? 'reduced'");
    expect(dose).toContain('id: session.workout.id');
    expect(plan).toContain('applyRaceHorizonStrengthDose(session, developmentWeek)');
    expect(week).toContain('applyRaceHorizonStrengthDose(session, developmentWeek)');
  });

  it('keeps race identity out of novelty naming because course knowledge is not available in that layer', () => {
    const naming = source('apps/mobile/src/services/training-synthesis.ts');
    const endurance = naming.slice(
      naming.indexOf('export function generatedEnduranceDisplayName'),
      naming.indexOf('/** Strength identity', naming.indexOf('export function generatedEnduranceDisplayName')),
    );
    expect(endurance).not.toContain('raceName,');
    expect(endurance).not.toContain('raceLocation:');
    expect(naming).toContain('Race identity belongs to planning context, not novelty naming.');
  });
});
