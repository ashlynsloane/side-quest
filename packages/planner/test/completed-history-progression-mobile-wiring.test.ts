import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('completed training history progression mobile wiring', () => {
  it('loads the unified deduplicated history during whole-athlete reconciliation', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    const history = source('apps/mobile/src/services/training-history.ts');

    expect(runtime).toContain('loadTrainingHistory(PROGRESSION_HISTORY_LIMIT)');
    expect(runtime).toContain('progressionHistoryFromTrainingHistory(trainingHistory)');
    expect(history).toContain('linkedActivityIds');
    expect(history).toContain("kind: 'strength'");
    expect(history).toContain("kind: 'endurance'");
  });

  it('does not use unresolved or deleted activity records as progression evidence', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');

    expect(runtime).toContain('if (item.needsReview) continue');
    expect(runtime).toContain('if (item.activity.deletedAt) continue');
    expect(runtime).toContain("value === 'strength' || value === 'hiit'");
  });

  it('uses athlete-local today but freezes continuity at entry into the current week', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');

    expect(runtime).toContain('const progressionDate = localDateKey(now)');
    expect(runtime).toContain('historyEnteringWeek(allCompletedHistory, currentWeekStart)');
    expect(runtime).toContain('weekEntryInstant(currentWeekStart)');
    expect(runtime).toContain("new Intl.DateTimeFormat('en-US'");
    expect(runtime).toContain("exposure.completedAt.slice(0, 10) < weekStartDate");
  });

  it('applies history progression only to the current reconciliation week before event persistence', () => {
    const plan = source('apps/mobile/src/services/whole-athlete-plan.ts');

    expect(plan).toContain('const progressionApplies = Boolean(');
    expect(plan).toContain('inCurrentWeek(input.progressionDate)');
    expect(plan).toContain('buildWholeAthleteProgressionContextFromHistory');
    expect(plan).toContain('applyProgressionToWholeAthleteWeek');
    expect(plan.indexOf('applyProgressionToWholeAthleteWeek')).toBeLessThan(plan.indexOf('plannedSessionToCalendarEvent(session, input.block.id)'));
  });

  it('persists current-week strength progression before Week and Today are regenerated', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');

    expect(runtime).toContain('applyCurrentWeekStrengthProgression(');
    expect(runtime).toContain('progressionContext.disciplineAssignments?.strength');
    expect(runtime).toContain('if (strengthProgression.changed) await saveTrainingBlock(workingBlock)');
    expect(runtime.indexOf('saveTrainingBlock(workingBlock)')).toBeLessThan(runtime.indexOf('generateAndPersistWholeAthleteBlock({'));
  });

  it('re-derives strength changes from a canonical baseline instead of compounding reductions', () => {
    const persistence = source('apps/mobile/src/services/strength-progression-persistence.ts');

    expect(persistence).toContain('baselineWorkouts');
    expect(persistence).toContain('lastAppliedWorkouts');
    expect(persistence).toContain('currentMatchesLastApplied');
    expect(persistence).toContain('applyProgressionToStrengthBlock(baselineBlock');
    expect(persistence).toContain('explicit edits are never silently overwritten');
  });

  it('keeps whole-athlete reconciliation alive if optional history retrieval fails', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');

    expect(runtime).toContain('loadTrainingHistory(PROGRESSION_HISTORY_LIMIT).catch(() => [] as TrainingHistoryItem[])');
  });
});
