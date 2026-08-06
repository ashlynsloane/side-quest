import type { SideQuestPrimaryTab, UiPageBlueprint, UiPageSection } from '@circuit/domain';
import { auditUiArchitecture, buildSideQuestUiArchitecture, getPageBlueprint } from '@circuit/planner';

export interface MobileTabDefinition {
  key: SideQuestPrimaryTab;
  label: string;
  accessibilityLabel: string;
  primaryObject: string;
}

export interface MobilePageModel {
  page: UiPageBlueprint;
  visibleSections: UiPageSection[];
  hasContextualAction: boolean;
}

export function buildPrimaryTabs(): MobileTabDefinition[] {
  return buildSideQuestUiArchitecture().pages.map((page) => ({
    key: page.tab,
    label: page.title,
    accessibilityLabel: `${page.title}: ${page.coreQuestion}`,
    primaryObject: page.primaryObject,
  }));
}

export function buildMobilePageModel(
  tab: SideQuestPrimaryTab,
  state: { activeWorkout?: boolean; relevantChange?: boolean; populatedSectionIds?: string[] } = {},
): MobilePageModel {
  const page = getPageBlueprint(tab);
  const populated = new Set(state.populatedSectionIds ?? []);
  const visibleSections = page.sections.filter((section) => {
    switch (section.visibility) {
      case 'always': return true;
      case 'when-active': return Boolean(state.activeWorkout);
      case 'when-relevant': return Boolean(state.relevantChange);
      case 'when-populated': return populated.has(section.id);
    }
  });
  return {
    page,
    visibleSections,
    hasContextualAction: visibleSections.some((section) => section.actions.length > 0),
  };
}

export function assertValidMobileUiArchitecture(): void {
  const audit = auditUiArchitecture(buildSideQuestUiArchitecture());
  if (!audit.passed) throw new Error(audit.issues.map((issue) => issue.message).join('\n'));
}
