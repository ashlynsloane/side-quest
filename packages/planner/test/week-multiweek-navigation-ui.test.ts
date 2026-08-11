import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Week multi-week navigation', () => {
  it('lets athletes move through the full training block without leaving the Week tab', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(plan).toContain('const selectPlanWeek = useCallback');
    expect(plan).toContain("<Text style={styles.weekNavText}>Next</Text>");
    expect(plan).toContain("<Text style={styles.weekNavArrow}>‹</Text><Text style={styles.weekNavText}>Previous</Text>");
    expect(plan).toContain("isCurrentCalendarWeek ? 'Current week' : 'This week'");
  });

  it('updates the selected week calendar and whole-athlete state together', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(plan).toContain('getTrainingCalendarEvents({ from, to })');
    expect(plan).toContain('findWholeAthleteWeek(wholeAthletePlan, nextAnchor)');
    expect(plan).toContain('setScheduledSessions((wholeWeek?.sessions ?? [])');
    expect(plan).toContain('setPlanningState(wholeWeek?.planningState ?? null)');
    expect(plan).toContain('setWeekDecision(wholeWeek?.weekDecision ?? null)');
  });

  it('does not use the legacy Full schedule button as the way to see future weeks', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(plan).not.toContain('>Full schedule</Text>');
    expect(plan).toContain('>Next week</Text>');
    expect(plan).toContain('clampPlanWeekAnchor');
  });
});
