import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../..');
const source = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

describe('athlete-facing naming and calendar tag semantics', () => {
  it('does not ship workout names that lie about the weekday', () => {
    const catalog = source('apps/mobile/src/services/workout-name-catalog.ts');
    expect(catalog).not.toContain('Big Gear Tuesday');
    expect(catalog).not.toContain('Sunday Spin');
    expect(catalog).not.toContain('Tempo Tuesday');
    expect(catalog).not.toContain('Save It for Sunday');
    expect(catalog).toContain('Big Gear Work');
    expect(catalog).toContain('Easy Spin Club');
    expect(catalog).toContain('Tempo Miles');
    expect(catalog).toContain('Save It for Race Day');
  });

  it('does not classify early September as fall for novelty naming', () => {
    const context = source('apps/mobile/src/services/workout-name-context.ts');
    expect(context).toContain("monthDay >= '09-22' && monthDay <= '11-30'");
    expect(context).not.toContain("if (month >= 6 && month <= 8) return 'summer'");
  });

  it('classifies calendar stimulus from the structured session title before week-level rationale', () => {
    const tags = source('apps/mobile/src/services/training-stimulus-tag.ts');
    expect(tags).toContain("const title = event.title.toLowerCase()");
    expect(tags).toContain("const description = event.description?.toLowerCase() ?? ''");
    expect(tags).not.toContain("`${event.title} ${event.description ?? ''}`.toLowerCase()");
    expect(tags).toContain("if (/threshold/.test(title)) return TAGS.threshold");
    expect(tags).toContain("if (/tempo/.test(title)) return TAGS.tempo");
  });

  it('cannot label a short support bike as a long ride', () => {
    const tags = source('apps/mobile/src/services/training-stimulus-tag.ts');
    expect(tags).toContain("durationMinutes >= 120");
    expect(tags).toContain("if (/long ride|long aerobic/.test(title) && durationMinutes >= 120) return TAGS.long");
    expect(tags).toContain("Never infer VO2/threshold/tempo/long from week-level rationale");
  });

  it('labels macro load intent without masquerading as the training phase', () => {
    const week = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(week).toContain("if (value === 'build') return 'PROGRESS WEEK'");
    expect(week).toContain("if (value === 'recovery') return 'RECOVERY WEEK'");
    expect(week).toContain('{developmentLoadLabel(developmentWeek.loadIntent)}');
  });
});
