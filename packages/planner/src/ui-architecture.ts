import type {
  SideQuestPrimaryTab,
  UiArchitectureAudit,
  UiArchitectureDefinition,
  UiPageBlueprint,
  UiPageSection,
} from '@circuit/domain';

const section = (value: UiPageSection): UiPageSection => value;

export function buildSideQuestUiArchitecture(): UiArchitectureDefinition {
  const pages: UiPageBlueprint[] = [
    {
      tab: 'today',
      title: 'Today',
      coreQuestion: 'What should I do today, and does it still make sense?',
      primaryObject: "Today's recommendation",
      sections: [
        section({
          id: 'today-recommendation',
          title: "Today's recommendation",
          purpose: 'Make the recommended action understandable and immediately startable.',
          presentation: 'hero',
          visibility: 'always',
          directInformation: ['workout name', 'duration', 'purpose', 'timing', 'equipment', 'why today'],
          actions: [
            { id: 'start', label: 'Start workout', kind: 'primary', interaction: 'full-screen-mode' },
            { id: 'edit', label: 'Edit', kind: 'secondary', interaction: 'bottom-sheet' },
            { id: 'replace', label: 'Replace', kind: 'tertiary', interaction: 'bottom-sheet' },
          ],
        }),
        section({
          id: 'readiness',
          title: 'Readiness',
          purpose: 'Show whether the recommendation remains appropriate without forcing a separate page visit.',
          presentation: 'inline-summary',
          visibility: 'always',
          directInformation: ['readiness state', 'pain or restriction context', 'one-sentence interpretation'],
          actions: [{ id: 'check-in', label: 'Update check-in', kind: 'secondary', interaction: 'inline' }],
        }),
        section({
          id: 'day-timeline',
          title: 'Your day',
          purpose: 'Place training beside imported commitments and expose conflicts directly.',
          presentation: 'timeline',
          visibility: 'when-populated',
          directInformation: ['session time', 'sport', 'flexibility', 'commitments', 'conflicts'],
          actions: [{ id: 'move-session', label: 'Move', kind: 'secondary', interaction: 'bottom-sheet' }],
        }),
        section({
          id: 'coaching-response',
          title: 'What changed',
          purpose: 'Present the actual coaching response only when new information changes the day.',
          presentation: 'inline-summary',
          visibility: 'when-relevant',
          directInformation: ['trigger', 'recommended adjustment', 'available alternatives'],
          actions: [{ id: 'resolve', label: 'Choose an option', kind: 'primary', interaction: 'bottom-sheet' }],
        }),
      ],
      excludedContent: ['full workout history', 'long-term analytics', 'settings directory', 'generic feature cards'],
    },
    {
      tab: 'train',
      title: 'Train',
      coreQuestion: 'What workout can I do now?',
      primaryObject: 'Workout builder',
      sections: [
        section({
          id: 'active-workout',
          title: 'Active workout',
          purpose: 'Keep an interrupted workout impossible to lose.',
          presentation: 'hero',
          visibility: 'when-active',
          directInformation: ['workout name', 'elapsed time', 'station', 'round'],
          actions: [{ id: 'resume', label: 'Resume', kind: 'primary', interaction: 'full-screen-mode' }],
        }),
        section({
          id: 'workout-builder',
          title: 'Start a Side Quest',
          purpose: 'Create a workout directly from time, equipment, focus, intensity, location, and restrictions.',
          presentation: 'workspace',
          visibility: 'always',
          directInformation: ['available time', 'equipment', 'focus', 'intensity', 'location', 'restrictions'],
          actions: [{ id: 'build', label: 'Build my workout', kind: 'primary', interaction: 'inline' }],
        }),
        section({
          id: 'recommended-workouts',
          title: 'Recommended for you',
          purpose: 'Offer a small number of relevant workouts with explanations.',
          presentation: 'horizontal-rail',
          visibility: 'when-populated',
          maximumVisibleItems: 4,
          directInformation: ['name', 'duration', 'focus', 'equipment', 'muscle emphasis', 'why recommended'],
          actions: [{ id: 'preview', label: 'Preview', kind: 'secondary', interaction: 'modal' }],
        }),
        section({
          id: 'saved-recent',
          title: 'Saved and recent',
          purpose: 'Expose actual favorite and recent workouts instead of navigation-only cards.',
          presentation: 'horizontal-rail',
          visibility: 'when-populated',
          maximumVisibleItems: 6,
          directInformation: ['workout name', 'duration', 'focus', 'last completed'],
          actions: [{ id: 'repeat', label: 'Repeat', kind: 'secondary', interaction: 'bottom-sheet' }],
        }),
      ],
      excludedContent: ['full training calendar', 'dense analytics', 'account settings', 'feature-entry grid'],
    },
    {
      tab: 'plan',
      title: 'Plan',
      coreQuestion: 'How does my training fit together over the coming days and weeks?',
      primaryObject: 'Weekly plan',
      sections: [
        section({
          id: 'current-phase',
          title: 'Current phase',
          purpose: 'Explain the current block, goal, week, and planning priority.',
          presentation: 'inline-summary',
          visibility: 'always',
          directInformation: ['phase', 'goal', 'week', 'planning priority'],
          actions: [{ id: 'adjust-phase', label: 'Adjust', kind: 'secondary', interaction: 'bottom-sheet' }],
        }),
        section({
          id: 'week-view',
          title: 'This week',
          purpose: 'Make the seven-day plan the central editable object.',
          presentation: 'workspace',
          visibility: 'always',
          directInformation: ['swim', 'bike', 'run', 'strength', 'recovery', 'commitments', 'proposals'],
          actions: [{ id: 'edit-session', label: 'Edit session', kind: 'primary', interaction: 'bottom-sheet' }],
        }),
        section({
          id: 'planning-alerts',
          title: 'Needs attention',
          purpose: 'Show only meaningful conflicts with actionable resolutions.',
          presentation: 'inline-summary',
          visibility: 'when-relevant',
          directInformation: ['issue', 'reason', 'recommended resolution'],
          actions: [{ id: 'resolve-plan', label: 'Resolve', kind: 'primary', interaction: 'bottom-sheet' }],
        }),
        section({
          id: 'roadmap',
          title: 'Roadmap',
          purpose: 'Show block direction, race date, and upcoming emphasis changes without a dense spreadsheet.',
          presentation: 'timeline',
          visibility: 'when-populated',
          directInformation: ['current block', 'next block', 'race date', 'taper', 'recovery'],
          actions: [{ id: 'view-roadmap', label: 'Explore', kind: 'secondary', interaction: 'push' }],
        }),
      ],
      excludedContent: ['exercise logging', 'completed workout analytics', 'routine check-in form', 'generic coach inbox'],
    },
    {
      tab: 'progress',
      title: 'Progress',
      coreQuestion: 'What is changing, and what should I build next?',
      primaryObject: 'Regional status',
      sections: [
        section({
          id: 'regional-status',
          title: 'Current training picture',
          purpose: 'Communicate useful regional states without pressure-heavy exposure percentages.',
          presentation: 'body-map',
          visibility: 'always',
          directInformation: ['ready to progress', 'on plan', 'recently trained', 'strength opportunity', 'recover before loading'],
          actions: [{ id: 'inspect-region', label: 'View region', kind: 'secondary', interaction: 'modal' }],
        }),
        section({
          id: 'recent-improvements',
          title: 'Recent improvements',
          purpose: 'Translate progression into concrete athlete-readable changes.',
          presentation: 'horizontal-rail',
          visibility: 'when-populated',
          maximumVisibleItems: 5,
          directInformation: ['load change', 'rep change', 'duration change', 'variation change', 'tolerance change'],
          actions: [{ id: 'inspect-improvement', label: 'View details', kind: 'secondary', interaction: 'modal' }],
        }),
        section({
          id: 'training-balance',
          title: 'Training balance',
          purpose: 'Synthesize strength and endurance demands and identify the next opportunity.',
          presentation: 'inline-summary',
          visibility: 'always',
          directInformation: ['substantial stimulus', 'maintained areas', 'opportunity', 'next emphasis'],
          actions: [],
        }),
        section({
          id: 'recent-history',
          title: 'Recent workouts',
          purpose: 'Show useful completed sessions directly with repeat access.',
          presentation: 'horizontal-rail',
          visibility: 'when-populated',
          maximumVisibleItems: 6,
          directInformation: ['name', 'date', 'duration', 'focus', 'completion state', 'note'],
          actions: [{ id: 'repeat-history', label: 'Repeat', kind: 'secondary', interaction: 'bottom-sheet' }],
        }),
      ],
      excludedContent: ['streaks', 'completion percentage', 'generic consistency score', 'wall of charts'],
    },
    {
      tab: 'you',
      title: 'You',
      coreQuestion: 'What does Side Quest know about me, and what can I control?',
      primaryObject: 'Athlete profile',
      sections: [
        section({
          id: 'athlete-summary',
          title: 'Athlete profile',
          purpose: 'Expose the core context currently shaping recommendations.',
          presentation: 'workspace',
          visibility: 'always',
          directInformation: ['primary goal', 'next event', 'phase', 'availability', 'strength frequency', 'equipment'],
          actions: [{ id: 'edit-profile', label: 'Edit profile', kind: 'primary', interaction: 'bottom-sheet' }],
        }),
        section({
          id: 'current-context',
          title: 'Current context',
          purpose: 'Summarize active restrictions, commitments, windows, equipment, and coach access.',
          presentation: 'inline-summary',
          visibility: 'when-populated',
          directInformation: ['restrictions', 'return status', 'protected commitments', 'training windows', 'coach access'],
          actions: [{ id: 'edit-context', label: 'Update', kind: 'secondary', interaction: 'bottom-sheet' }],
        }),
        section({
          id: 'connections',
          title: 'Connections',
          purpose: 'Make integration status understandable without opening every provider page.',
          presentation: 'settings-group',
          visibility: 'always',
          directInformation: ['Strava', 'calendar', 'device data', 'health data', 'coach access'],
          actions: [{ id: 'manage-connections', label: 'Manage', kind: 'secondary', interaction: 'push' }],
        }),
        section({
          id: 'app-controls',
          title: 'App controls',
          purpose: 'Contain conventional settings where navigation rows are appropriate.',
          presentation: 'settings-group',
          visibility: 'always',
          directInformation: ['notifications', 'appearance', 'accessibility', 'units', 'privacy', 'data', 'support'],
          actions: [{ id: 'open-setting', label: 'Open', kind: 'tertiary', interaction: 'push' }],
        }),
      ],
      excludedContent: ['daily recommendation', 'workout generation', 'progress analytics', 'active workout player'],
    },
  ];

  return {
    version: '28.0',
    tabs: ['today', 'train', 'plan', 'progress', 'you'],
    pages,
    contextualSurfaces: ['coaching inbox', 'global search', 'workout player', 'exercise detail', 'daily check-in'],
    principles: [
      'Every primary tab must answer one athlete question.',
      'Every primary page must expose useful information before navigation.',
      'Routine actions should resolve inline or in a bottom sheet.',
      'Coaching intelligence appears in context rather than in a standalone destination.',
      'Main pages must not degrade into lists of subpage reroutes.',
    ],
  };
}

export function auditUiArchitecture(definition: UiArchitectureDefinition): UiArchitectureAudit {
  const issues: UiArchitectureAudit['issues'] = [];
  const expectedTabs: SideQuestPrimaryTab[] = ['today', 'train', 'plan', 'progress', 'you'];

  for (const tab of expectedTabs) {
    const page = definition.pages.find((candidate) => candidate.tab === tab);
    if (!page) {
      issues.push({ page: tab, code: 'empty-main-page', message: `Missing ${tab} page blueprint.` });
      continue;
    }
    if (!page.primaryObject.trim()) {
      issues.push({ page: tab, code: 'missing-primary-object', message: `${page.title} has no primary object.` });
    }
    if (page.sections.length === 0) {
      issues.push({ page: tab, code: 'empty-main-page', message: `${page.title} has no direct content sections.` });
    }

    const seen = new Set<string>();
    for (const item of page.sections) {
      if (seen.has(item.id)) {
        issues.push({ page: tab, sectionId: item.id, code: 'duplicate-section', message: `Duplicate section ${item.id}.` });
      }
      seen.add(item.id);
      if (item.directInformation.length === 0) {
        issues.push({ page: tab, sectionId: item.id, code: 'missing-direct-information', message: `${item.title} only routes; it shows no direct information.` });
      }
      const primaryActions = item.actions.filter((action) => action.kind === 'primary');
      if (primaryActions.length > 1) {
        issues.push({ page: tab, sectionId: item.id, code: 'too-many-primary-actions', message: `${item.title} has competing primary actions.` });
      }
      const navigationalOnly = item.actions.length > 0 && item.directInformation.length <= 1 && item.actions.every((action) => action.interaction === 'push');
      if (navigationalOnly) {
        issues.push({ page: tab, sectionId: item.id, code: 'router-list-risk', message: `${item.title} behaves like a subpage reroute instead of a page section.` });
      }
    }
  }

  return { passed: issues.length === 0, issues };
}

export function getPageBlueprint(tab: SideQuestPrimaryTab): UiPageBlueprint {
  const page = buildSideQuestUiArchitecture().pages.find((candidate) => candidate.tab === tab);
  if (!page) throw new Error(`Unknown Side Quest primary tab: ${tab}`);
  return page;
}
