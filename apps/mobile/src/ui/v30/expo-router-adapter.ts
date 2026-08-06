import type { SideQuestPrimaryTab } from '@circuit/domain';
import type { SideQuestRouterAdapter } from '../../services/runtime-orchestrator';

export interface ExpoLikeRouter {
  push: (href: string | { pathname: string; params?: Record<string, string> }) => void;
  replace?: (href: string) => void;
}

const TAB_ROUTES: Record<SideQuestPrimaryTab, string> = {
  today: '/(tabs)',
  train: '/(tabs)/train',
  plan: '/(tabs)/plan',
  progress: '/(tabs)/library',
  you: '/(tabs)/profile',
};

export function createExpoRouterAdapter(router: ExpoLikeRouter): SideQuestRouterAdapter {
  return {
    replaceTab: tab => router.replace?.(TAB_ROUTES[tab]),
    push: (pathname, params) => router.push(params ? { pathname, params } : pathname),
  };
}

export function routeNameToPrimaryTab(routeName: string | undefined): SideQuestPrimaryTab {
  const normalized = routeName?.toLowerCase() ?? '';
  if (normalized.includes('train')) return 'train';
  if (normalized.includes('plan')) return 'plan';
  if (normalized.includes('progress')) return 'progress';
  if (normalized.includes('you') || normalized.includes('profile') || normalized.includes('settings')) return 'you';
  return 'today';
}
