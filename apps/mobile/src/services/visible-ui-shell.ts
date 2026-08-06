import type { SideQuestPrimaryTab, SideQuestShellModel } from '@circuit/domain';
import { buildSideQuestShell } from '@circuit/planner';

export interface MobileShellStateInput {
  routeName: string;
  contextLabel?: string;
  unresolvedAttentionCount?: number;
  activeWorkout?: {
    workoutId: string;
    workoutName: string;
    progressLabel: string;
  };
  workoutPlayerOpen?: boolean;
}

const ROUTE_TO_TAB: Record<string, SideQuestPrimaryTab> = {
  index: 'today',
  today: 'today',
  train: 'train',
  plan: 'plan',
  progress: 'progress',
  profile: 'you',
  settings: 'you',
  you: 'you',
};

export function buildMobileShellState(input: MobileShellStateInput): SideQuestShellModel {
  return buildSideQuestShell({
    activeTab: ROUTE_TO_TAB[input.routeName] ?? 'today',
    contextLabel: input.contextLabel,
    unresolvedAttentionCount: input.unresolvedAttentionCount,
    activeWorkout: input.activeWorkout,
    workoutPlayerOpen: input.workoutPlayerOpen,
  });
}
