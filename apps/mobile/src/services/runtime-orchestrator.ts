import type { SideQuestPrimaryTab } from '@circuit/domain';
import type { SideQuestRuntimeAction, SideQuestRuntimeNavigator } from '../ui/v29/SideQuestRuntimeBridge';
import { resolveSideQuestRouteIntent, type SideQuestRouteIntent } from './runtime-route-intents';

export interface SideQuestRouterAdapter {
  replaceTab?: (tab: SideQuestPrimaryTab) => void;
  push: (pathname: string, params?: Record<string, string>) => void;
}

export interface SideQuestRuntimeCommands {
  startWorkout?: (id?: string) => void | Promise<void>;
  resumeWorkout?: (id: string) => void | Promise<void>;
  applyAdjustment?: (id?: string) => void | Promise<void>;
  keepOriginal?: (id?: string) => void | Promise<void>;
  takeRecoveryDay?: (id?: string) => void | Promise<void>;
  onUnhandled?: (event: SideQuestRuntimeAction, intent: SideQuestRouteIntent) => void;
  onError?: (error: unknown, event: SideQuestRuntimeAction) => void;
}

export interface SideQuestRuntimeOrchestratorOptions {
  router: SideQuestRouterAdapter;
  commands?: SideQuestRuntimeCommands;
  initialTab?: SideQuestPrimaryTab;
  onTabChanged?: (tab: SideQuestPrimaryTab) => void | Promise<void>;
}

export function createRuntimeOrchestrator({
  router,
  commands = {},
  initialTab = 'today',
  onTabChanged,
}: SideQuestRuntimeOrchestratorOptions): SideQuestRuntimeNavigator {
  let activeTab = initialTab;

  const execute = async (event: SideQuestRuntimeAction) => {
    const intent = resolveSideQuestRouteIntent(event);
    try {
      if (intent.kind === 'tab') {
        activeTab = intent.tab;
        router.replaceTab?.(intent.tab);
        await onTabChanged?.(intent.tab);
        return;
      }
      if (intent.kind === 'route') {
        router.push(intent.pathname, intent.params);
        return;
      }
      if (intent.kind === 'command') {
        switch (intent.command) {
          case 'start_workout': await commands.startWorkout?.(intent.id); return;
          case 'resume_workout':
            if (intent.id) await commands.resumeWorkout?.(intent.id);
            else commands.onUnhandled?.(event, intent);
            return;
          case 'apply_adjustment': await commands.applyAdjustment?.(intent.id); return;
          case 'keep_original': await commands.keepOriginal?.(intent.id); return;
          case 'recovery_day': await commands.takeRecoveryDay?.(intent.id); return;
        }
      }
      commands.onUnhandled?.(event, intent);
    } catch (error) {
      commands.onError?.(error, event);
    }
  };

  return {
    getActiveTab: () => activeTab,
    navigateToTab: tab => {
      activeTab = tab;
      router.replaceTab?.(tab);
      void onTabChanged?.(tab);
    },
    dispatch: event => { void execute(event); },
  };
}
