import type { SideQuestPrimaryTab } from '@circuit/domain';

export const SIDE_QUEST_TAB_ROUTES: Readonly<Record<SideQuestPrimaryTab, string>> = {
  today: '/(tabs)/today',
  train: '/(tabs)/train',
  plan: '/(tabs)/plan',
  progress: '/(tabs)/progress',
  you: '/(tabs)/you',
};

export const SIDE_QUEST_RUNTIME_ROUTES = [
  '/inbox',
  '/search',
  '/check-in',
  '/train/build',
  '/train/saved',
  '/workout/preview',
  '/workout/edit',
  '/workout/replace',
  '/workout/swap',
  '/workout-together',
  '/plan/session',
  '/plan/session/new',
  '/plan/edit',
  '/plan/move',
  '/plan/alerts',
  '/plan/emphasis',
  '/plan/event/new',
  '/plan/commitment/new',
  '/plan/roadmap',
  '/coach/reasoning',
  '/health/restrictions/new',
  '/history/workout',
  '/progress/region',
  '/progress/movement',
  '/progress/milestones',
  '/progress/training-balance',
  '/you/profile',
  '/you/training-context',
  '/you/availability',
  '/you/connections',
  '/you/coach-access',
  '/you/friends',
  '/you/sharing',
  '/you/privacy',
  '/you/notifications',
  '/you/accessibility',
  '/you/data-controls',
  '/you/support',
] as const;

export type SideQuestRuntimePathname = typeof SIDE_QUEST_RUNTIME_ROUTES[number];

export function isSideQuestRuntimeRoute(pathname: string): pathname is SideQuestRuntimePathname {
  return (SIDE_QUEST_RUNTIME_ROUTES as readonly string[]).includes(pathname);
}
