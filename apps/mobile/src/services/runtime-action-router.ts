import type { SideQuestPrimaryTab } from '@circuit/domain';
import type {
  SideQuestRuntimeAction,
  SideQuestRuntimeNavigator,
} from '../ui/v29/SideQuestRuntimeBridge';

export interface SideQuestRuntimeDestinations {
  tab?: (tab: SideQuestPrimaryTab) => void;
  today?: (action: Extract<SideQuestRuntimeAction, { workspace: 'today' }>['action']) => void;
  train?: (action: Extract<SideQuestRuntimeAction, { workspace: 'train' }>['action']) => void;
  plan?: (action: Extract<SideQuestRuntimeAction, { workspace: 'plan' }>['action']) => void;
  progress?: (action: Extract<SideQuestRuntimeAction, { workspace: 'progress' }>['action']) => void;
  you?: (action: Extract<SideQuestRuntimeAction, { workspace: 'you' }>['action']) => void;
  shell?: (action: Extract<SideQuestRuntimeAction, { workspace: 'shell' }>['action']) => void;
  resumeWorkout?: (workoutId: string) => void;
  unhandled?: (event: SideQuestRuntimeAction) => void;
}

export function createSideQuestRuntimeNavigator(
  destinations: SideQuestRuntimeDestinations,
  initialTab: SideQuestPrimaryTab = 'today',
): SideQuestRuntimeNavigator {
  let activeTab = initialTab;

  return {
    getActiveTab: () => activeTab,
    navigateToTab: tab => {
      activeTab = tab;
      destinations.tab?.(tab);
    },
    dispatch: event => {
      switch (event.workspace) {
        case 'today': return destinations.today?.(event.action) ?? destinations.unhandled?.(event);
        case 'train': return destinations.train?.(event.action) ?? destinations.unhandled?.(event);
        case 'plan': return destinations.plan?.(event.action) ?? destinations.unhandled?.(event);
        case 'progress': return destinations.progress?.(event.action) ?? destinations.unhandled?.(event);
        case 'you': return destinations.you?.(event.action) ?? destinations.unhandled?.(event);
        case 'shell': return destinations.shell?.(event.action) ?? destinations.unhandled?.(event);
        case 'workout': return destinations.resumeWorkout?.(event.workoutId) ?? destinations.unhandled?.(event);
      }
    },
  };
}
