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

  it('passes an athlete-local date and a precise as-of instant into the production plan', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');

    expect(runtime).toContain('progressionDate: localDateKey(now)');
    expect(runtime).toContain('progressionAsOf: now.toISOString()');
    expect(runtime).toContain("new Intl.DateTimeFormat('en-US'");
  });

  it('applies history progression only to the current reconciliation week before event persistence', () => {
    const plan = source('apps/mobile/src/services/whole-athlete-plan.ts');

    expect(plan).toContain('const progressionApplies = Boolean(');
    expect(plan).toContain('inCurrentWeek(input.progressionDate)');
    expect(plan).toContain('buildWholeAthleteProgressionContextFromHistory');
    expect(plan).toContain('applyProgressionToWholeAthleteWeek');
    expect(plan.indexOf('applyProgressionToWholeAthleteWeek')).toBeLessThan(plan.indexOf('plannedSessionToCalendarEvent(session, input.block.id)'));
  });
});
