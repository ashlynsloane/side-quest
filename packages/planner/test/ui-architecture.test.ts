import { describe, expect, it } from 'vitest';
import { auditUiArchitecture, buildSideQuestUiArchitecture, getPageBlueprint } from '../src/ui-architecture';

describe('V28.0 UI architecture', () => {
  it('defines five question-led primary tabs', () => {
    const architecture = buildSideQuestUiArchitecture();
    expect(architecture.tabs).toEqual(['today', 'train', 'plan', 'progress', 'you']);
    expect(architecture.pages).toHaveLength(5);
    expect(architecture.pages.every((page) => page.coreQuestion.length > 10)).toBe(true);
  });

  it('gives every page a primary object and direct information', () => {
    const architecture = buildSideQuestUiArchitecture();
    expect(auditUiArchitecture(architecture)).toEqual({ passed: true, issues: [] });
  });

  it('keeps workout generation directly on Train', () => {
    const train = getPageBlueprint('train');
    const builder = train.sections.find((section) => section.id === 'workout-builder');
    expect(builder?.presentation).toBe('workspace');
    expect(builder?.directInformation).toContain('available time');
    expect(builder?.actions.some((action) => action.id === 'build')).toBe(true);
  });

  it('uses Progress for regional status rather than completion pressure', () => {
    const progress = getPageBlueprint('progress');
    expect(progress.primaryObject).toBe('Regional status');
    expect(progress.excludedContent).toContain('completion percentage');
    expect(progress.excludedContent).toContain('generic consistency score');
  });
});
