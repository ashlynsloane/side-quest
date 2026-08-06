/**
 * V31.7A canonical product shell and visual foundation.
 *
 * Expo Router filenames remain index/train/plan/library/profile for compatibility,
 * while athlete-facing labels are Today/Train/Plan/Progress/You.
 */
export const sideQuestV317DesignSystem = {
  navigation: [
    { route: 'index', label: 'Today', canonicalTab: 'today' },
    { route: 'train', label: 'Train', canonicalTab: 'train' },
    { route: 'plan', label: 'Plan', canonicalTab: 'plan' },
    { route: 'library', label: 'Progress', canonicalTab: 'progress' },
    { route: 'profile', label: 'You', canonicalTab: 'you' },
  ],
  spacing: {
    pageGutter: 20,
    pageTop: 18,
    sectionGap: 24,
    cardPadding: 18,
    contentBottom: 104,
  },
  radius: {
    card: 22,
    control: 16,
    pill: 999,
  },
  controls: {
    minimumTapTarget: 44,
    buttonHeight: 52,
    tabBarHeight: 74,
  },
  terminology: {
    coach: 'Side Quest Coach',
    humanCoach: 'Human Coach Access',
    progress: 'Progress',
    profile: 'You',
  },
} as const;

export type SideQuestV317Tab = typeof sideQuestV317DesignSystem.navigation[number]['canonicalTab'];
