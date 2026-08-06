import type {
  SideQuestActiveWorkoutBar,
  SideQuestHeaderActionKind,
  SideQuestPrimaryTab,
  SideQuestShellModel,
  SideQuestVisualTokens,
} from '@circuit/domain';

const PAGE_LABELS: Record<SideQuestPrimaryTab, string> = {
  today: 'Today',
  train: 'Train',
  plan: 'Plan',
  progress: 'Progress',
  you: 'You',
};

const HEADER_ACTIONS: Record<SideQuestPrimaryTab, SideQuestHeaderActionKind> = {
  today: 'inbox',
  train: 'search',
  plan: 'none',
  progress: 'none',
  you: 'profile',
};

export const SIDE_QUEST_NAVIGATION = [
  { tab: 'today', label: 'Today', iconKey: 'sun', accessibilityLabel: 'Today, daily training' },
  { tab: 'train', label: 'Train', iconKey: 'dumbbell', accessibilityLabel: 'Train, build or start a workout' },
  { tab: 'plan', label: 'Plan', iconKey: 'calendar', accessibilityLabel: 'Plan, weekly training schedule' },
  { tab: 'progress', label: 'Progress', iconKey: 'body', accessibilityLabel: 'Progress, training interpretation' },
  { tab: 'you', label: 'You', iconKey: 'person', accessibilityLabel: 'You, athlete profile and settings' },
] as const;

export const V29_VISUAL_TOKENS: SideQuestVisualTokens = {
  outerGutter: 18,
  cardRadius: 22,
  cardGap: 14,
  mastheadHeight: 60,
  bottomNavigationHeight: 76,
  minimumTapTarget: 44,
  canvasTone: 'warm_neutral',
  density: 'comfortable',
  useCardBorders: true,
  useCardShadow: false,
};

export interface BuildSideQuestShellInput {
  activeTab: SideQuestPrimaryTab;
  contextLabel?: string;
  unresolvedAttentionCount?: number;
  activeWorkout?: Omit<SideQuestActiveWorkoutBar, 'resumeLabel' | 'visibleAcrossTabs'>;
  workoutPlayerOpen?: boolean;
}

export function buildSideQuestShell(input: BuildSideQuestShellInput): SideQuestShellModel {
  const action = HEADER_ACTIONS[input.activeTab];
  const attentionCount = action === 'inbox' && (input.unresolvedAttentionCount ?? 0) > 0
    ? input.unresolvedAttentionCount
    : undefined;

  return {
    activeTab: input.activeTab,
    masthead: {
      wordmark: 'Side Quest',
      pageLabel: PAGE_LABELS[input.activeTab],
      contextLabel: input.contextLabel,
      action,
      attentionCount,
      compact: true,
    },
    navigation: SIDE_QUEST_NAVIGATION.map((item) => ({ ...item })),
    tokens: { ...V29_VISUAL_TOKENS },
    activeWorkout: input.activeWorkout
      ? {
          ...input.activeWorkout,
          resumeLabel: 'Resume',
          visibleAcrossTabs: true,
        }
      : undefined,
    hideBottomNavigation: input.workoutPlayerOpen === true,
    screenReaderOrder: [
      'masthead',
      'page-content',
      ...(input.activeWorkout ? ['active-workout-resume'] : []),
      ...(input.workoutPlayerOpen ? [] : ['primary-navigation']),
    ],
  };
}

export function validateSideQuestShell(model: SideQuestShellModel): string[] {
  const issues: string[] = [];
  const tabs = model.navigation.map((item) => item.tab);
  const expected: SideQuestPrimaryTab[] = ['today', 'train', 'plan', 'progress', 'you'];

  if (tabs.join('|') !== expected.join('|')) issues.push('Primary navigation must remain Today, Train, Plan, Progress, You.');
  if (model.tokens.minimumTapTarget < 44) issues.push('Tap targets must be at least 44 points.');
  if (model.tokens.cardRadius < 16) issues.push('Cards must preserve the rounded V29 visual language.');
  if (!model.masthead.compact) issues.push('The masthead must remain compact.');
  if (model.activeWorkout && !model.activeWorkout.visibleAcrossTabs) issues.push('An active workout must remain recoverable across tabs.');
  if (model.hideBottomNavigation && model.screenReaderOrder.includes('primary-navigation')) issues.push('Workout mode must remove hidden navigation from screen-reader order.');

  return issues;
}
