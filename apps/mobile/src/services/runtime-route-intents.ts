import type { SideQuestPrimaryTab } from '@circuit/domain';
import type { SideQuestRuntimeAction } from '../ui/v29/SideQuestRuntimeBridge';

export type SideQuestRouteIntent =
  | { kind: 'tab'; tab: SideQuestPrimaryTab }
  | { kind: 'route'; pathname: string; params?: Record<string, string> }
  | { kind: 'command'; command: 'start_workout' | 'resume_workout' | 'apply_adjustment' | 'keep_original' | 'recovery_day'; id?: string }
  | { kind: 'noop'; reason: string };

const param = (value: string | undefined): Record<string, string> | undefined =>
  value ? { id: value } : undefined;

export function resolveSideQuestRouteIntent(event: SideQuestRuntimeAction): SideQuestRouteIntent {
  if (event.workspace === 'workout') {
    return { kind: 'command', command: 'resume_workout', id: event.workoutId };
  }

  if (event.workspace === 'shell') {
    switch (event.action) {
      case 'inbox': return { kind: 'route', pathname: '/inbox' };
      case 'search': return { kind: 'route', pathname: '/search' };
      case 'profile': return { kind: 'tab', tab: 'you' };
      case 'none': return { kind: 'noop', reason: 'No shell action was requested.' };
    }
  }

  const action = event.action;
  switch (event.workspace) {
    case 'today':
      switch (action.kind) {
        case 'start': return { kind: 'command', command: 'start_workout', id: action.actionId };
        case 'edit': return { kind: 'route', pathname: '/workout/edit', params: param(action.actionId) };
        case 'move': return { kind: 'route', pathname: '/plan/move', params: param(action.actionId) };
        case 'replace': return { kind: 'route', pathname: '/workout/replace', params: param(action.actionId) };
        case 'check_in': return { kind: 'route', pathname: '/check-in' };
        case 'add_restriction': return { kind: 'route', pathname: '/health/restrictions/new' };
        case 'apply_adjustment': return { kind: 'command', command: 'apply_adjustment', id: action.actionId };
        case 'keep_original': return { kind: 'command', command: 'keep_original', id: action.actionId };
        case 'view_reasoning': return { kind: 'route', pathname: '/coach/reasoning', params: param(action.actionId) };
        case 'build_workout': return { kind: 'route', pathname: '/train/build' };
        case 'add_session': return { kind: 'route', pathname: '/plan/session/new' };
        case 'recovery_day': return { kind: 'command', command: 'recovery_day', id: action.actionId };
      }
    case 'train':
      switch (action.kind) {
        case 'resume_workout': return { kind: 'command', command: 'resume_workout', id: action.workoutId };
        case 'build_workout': return { kind: 'route', pathname: '/train/build' };
        case 'apply_preset': return { kind: 'route', pathname: '/train/build', params: action.presetId ? { presetId: action.presetId } : undefined };
        case 'start_workout': return { kind: 'command', command: 'start_workout', id: action.workoutId };
        case 'preview_workout': return { kind: 'route', pathname: '/workout/preview', params: param(action.workoutId) };
        case 'swap_workout': return { kind: 'route', pathname: '/workout/swap', params: param(action.workoutId) };
        case 'open_saved': return { kind: 'route', pathname: '/train/saved' };
        case 'open_together': return { kind: 'route', pathname: '/workout-together' };
      }
    case 'plan':
      switch (action.kind) {
        case 'open_session': return { kind: 'route', pathname: '/plan/session', params: param(action.actionId) };
        case 'move_session': return { kind: 'route', pathname: '/plan/move', params: param(action.actionId) };
        case 'edit_session': return { kind: 'route', pathname: '/plan/edit', params: param(action.actionId) };
        case 'resolve_alert': return { kind: 'route', pathname: '/plan/alerts', params: param(action.actionId) };
        case 'adjust_availability': return { kind: 'route', pathname: '/you/availability' };
        case 'change_emphasis': return { kind: 'route', pathname: '/plan/emphasis' };
        case 'add_event': return { kind: 'route', pathname: '/plan/event/new' };
        case 'add_commitment': return { kind: 'route', pathname: '/plan/commitment/new' };
        case 'open_roadmap': return { kind: 'route', pathname: '/plan/roadmap', params: param(action.actionId) };
      }
    case 'progress':
      switch (action.kind) {
        case 'open_region': return { kind: 'route', pathname: '/progress/region', params: param(action.targetId) };
        case 'open_movement': return { kind: 'route', pathname: '/progress/movement', params: param(action.targetId) };
        case 'open_workout': return { kind: 'route', pathname: '/history/workout', params: param(action.targetId) };
        case 'repeat_workout': return { kind: 'route', pathname: '/workout/preview', params: action.targetId ? { id: action.targetId, mode: 'repeat' } : { mode: 'repeat' } };
        case 'open_milestones': return { kind: 'route', pathname: '/progress/milestones' };
        case 'open_training_balance': return { kind: 'route', pathname: '/progress/training-balance' };
      }
    case 'you':
      switch (action.kind) {
        case 'edit_profile': return { kind: 'route', pathname: '/you/profile' };
        case 'edit_context': return { kind: 'route', pathname: '/you/training-context' };
        case 'manage_connection': return { kind: 'route', pathname: '/you/connections', params: param(action.targetId) };
        case 'manage_coach_access': return { kind: 'route', pathname: '/you/coach-access' };
        case 'open_friends': return { kind: 'route', pathname: '/you/friends' };
        case 'open_sharing': return { kind: 'route', pathname: '/you/sharing' };
        case 'open_privacy': return { kind: 'route', pathname: '/you/privacy' };
        case 'open_notifications': return { kind: 'route', pathname: '/you/notifications' };
        case 'open_accessibility': return { kind: 'route', pathname: '/you/accessibility' };
        case 'open_data_controls': return { kind: 'route', pathname: '/you/data-controls' };
        case 'open_support': return { kind: 'route', pathname: '/you/support' };
      }
  }

  return { kind: 'noop', reason: `Unsupported runtime action: ${event.workspace}` };
}
