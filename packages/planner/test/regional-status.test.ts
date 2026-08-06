import { describe, expect, it } from 'vitest';
import { classifyRegionalStrengthStatus } from '../src/regional-status';

const now = '2026-07-23T12:00:00.000Z';

function base(overrides: Partial<Parameters<typeof classifyRegionalStrengthStatus>[0]> = {}) {
  return classifyRegionalStrengthStatus({
    region: 'quadriceps',
    plannedExposures: 2,
    completedExposures: 1,
    currentSportLoad: 4,
    baselineSportLoad: 4,
    baselineHistoryDays: 28,
    readinessBand: 'steady',
    muscleFreshness: 4,
    now,
    ...overrides,
  });
}

describe('regional strength status', () => {
  it('does not let sport load erase a planned direct-strength gap', () => {
    const result = base({ currentSportLoad: 7, baselineSportLoad: 4 });
    expect(result.status).toBe('sport_loaded_strength_needed');
    expect(result.remainingExposures).toBe(1);
    expect(result.recommendation).toContain('sport load cannot erase a direct-strength gap');
  });

  it('marks a plan target complete without requiring equal body-part percentages', () => {
    const result = base({ completedExposures: 2, currentSportLoad: 3 });
    expect(result.status).toBe('on_plan');
    expect(result.coverageLabel).toContain('2 of 2');
  });

  it('does not invent a target for an unplanned region', () => {
    const result = base({ plannedExposures: 0, completedExposures: 0, currentSportLoad: 0 });
    expect(result.status).toBe('not_targeted');
    expect(result.recommendation).toContain('No universal body-part quota');
  });

  it('prioritizes explicit restrictions over plan coverage', () => {
    const result = base({ restricted: true, restrictionReason: 'Avoid loaded knee flexion.' });
    expect(result.status).toBe('restricted');
    expect(result.confidence).toBe('high');
  });

  it('uses symptom and readiness signals for review rather than injury prediction', () => {
    const result = base({ painSeverity: 4, readinessBand: 'recover' });
    expect(result.status).toBe('review_before_loading');
    expect(result.recommendation).toContain('does not diagnose injury');
  });

  it('uses personal baseline bands rather than a universal regional percentage target', () => {
    const result = base({ currentSportLoad: 10, baselineSportLoad: 4 });
    expect(result.sportDemand).toBe('much_above_usual');
    expect(result.sportDemandLabel).toContain('Much above usual');
  });
});
