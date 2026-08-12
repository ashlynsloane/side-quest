import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRepo(path: string): string {
  return readFileSync(resolve(process.cwd(), '../../', path), 'utf8');
}

function importSpecs(source: string, moduleName: string): string[] {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(
    new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escaped}['"]\\s*;`),
  );
  return (match?.[1] ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

describe('mobile final planner import contract', () => {
  it('routes the builder through the exported whole-athlete-week alias', () => {
    const source = readRepo('apps/mobile/src/services/whole-athlete-plan.ts');
    const rootSpecs = importSpecs(source, '@circuit/planner');
    const weekSpecs = importSpecs(source, '@circuit/planner/whole-athlete-week');

    expect(rootSpecs).not.toContain('buildWholeAthleteWeek');
    expect(rootSpecs).toContain('normalizeCalendarEvent');
    expect(rootSpecs).toContain('normalizeStrengthSession');
    expect(weekSpecs).toContain('buildWholeAthleteWeek');
    expect(source).not.toContain('@circuit/planner/whole-athlete-week-block');
  });

  it('maps that alias to the final product-level planner', () => {
    const pkg = JSON.parse(readRepo('packages/planner/package.json')) as {
      exports?: Record<string, string>;
    };
    expect(pkg.exports?.['./whole-athlete-week'])
      .toBe('./src/whole-athlete-week-block.ts');
  });

  it('lets availability assign time without changing the planner day', () => {
    const source = readRepo('apps/mobile/src/services/training-availability.ts');

    expect(source).toContain(
      'const sameDayWindows = windows.filter((window) => window.date === session.date);',
    );
    expect(source).toMatch(
      /const candidate = bestPlacement\(\s*session,\s*placed,\s*sameDayWindows,\s*preference,/s,
    );
  });
});
