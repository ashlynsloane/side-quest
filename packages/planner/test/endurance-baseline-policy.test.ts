import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unverifiedEnduranceDisciplines } from '../src/endurance-baseline-policy';
const observed = { sessionsPerWeek: 2, minutesPerWeek: 60, longestSessionMinutes: 45 };

describe('whole-athlete first-week sport-specific dose eligibility', () => {
  it('never prescribes a sport just because it is in a goal', () => {
    expect(unverifiedEnduranceDisciplines(['swim', 'bike', 'run'], {}))
      .toEqual(['swim', 'bike', 'run']);
  });
  it('permits only the sports with actual discipline-specific exposure', () => {
    expect(unverifiedEnduranceDisciplines(['swim', 'bike', 'run'], { bike: observed }))
      .toEqual(['swim', 'run']);
    expect(unverifiedEnduranceDisciplines(['bike'], { bike: observed }))
      .toEqual(['swim', 'run']);
  });
  it('never treats unrelated historical sport exposure as consent to schedule', () => {
    expect(unverifiedEnduranceDisciplines([], { bike: observed, swim: observed }))
      .toEqual(['swim', 'bike', 'run']);
  });
  it('rejects zero and invalid baseline minutes instead of inventing defaults', () => {
    expect(unverifiedEnduranceDisciplines(['bike'], { bike: { ...observed, minutesPerWeek: 0 } }))
      .toEqual(['swim', 'bike', 'run']);
    expect(unverifiedEnduranceDisciplines(['bike'], { bike: { ...observed, longestSessionMinutes: Number.NaN } }))
      .toEqual(['swim', 'bike', 'run']);
  });
  it('the runtime gates generated sports on the policy and never fabricates modality splits', () => {
    const source = readFileSync(new URL('../../../apps/mobile/src/services/whole-athlete-plan.ts',
      import.meta.url), 'utf8');
    expect(source).toContain('unverifiedEnduranceDisciplines(input.goal.disciplines, baselines)');
    expect(source).not.toContain('goalFallbackWeights');
    expect(source).not.toContain('const fallbackMinutes = capacity.currentEnduranceHours * 60');
  });
  it('general strength can request bike, swim or run without fabricating their dose', () => {
    const firstWeek = readFileSync(new URL('../../../apps/mobile/src/app/onboarding-first-week.tsx',
      import.meta.url), 'utf8');
    expect(firstWeek).toContain("goal === 'general_offseason'");
    expect(firstWeek).toContain('desiredModes.filter');
    expect(firstWeek).toContain('cardioDoseStatus: \'requires_review\'');
  });
});
