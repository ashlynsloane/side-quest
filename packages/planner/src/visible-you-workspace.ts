import type {
  V29YouAction,
  V29YouVisibleScreenModel,
  YouWorkspaceModel,
} from '@circuit/domain';

const action = (
  actionId: string,
  kind: V29YouAction['kind'],
  label: string,
  targetId?: string,
  primary = false,
): V29YouAction => ({
  actionId,
  kind,
  label,
  accessibilityLabel: targetId ? `${label}: ${targetId}` : label,
  targetId,
  primary,
});

export function buildVisibleYouWorkspace(source: YouWorkspaceModel): V29YouVisibleScreenModel {
  const invitationLabel = source.social.pendingInvitationCount > 0
    ? `${source.social.pendingInvitationCount} pending invitation${source.social.pendingInvitationCount === 1 ? '' : 's'}`
    : undefined;

  return {
    profile: {
      ...source.profile,
      actions: [action('edit-profile', 'edit_profile', 'Edit athlete profile', undefined, true)],
    },
    currentContext: source.currentContext.map(item => ({
      contextId: item.contextId,
      label: item.label,
      value: item.value,
      detail: item.detail,
      needsAttention: item.needsAttention,
      actions: [action(`edit-context-${item.contextId}`, 'edit_context', 'Edit', item.label)],
    })),
    connections: source.connections.map(connection => ({
      connectionId: connection.connectionId,
      providerLabel: connection.providerLabel,
      stateLabel: connection.statusLabel,
      detail: connection.detail,
      lastSyncLabel: connection.lastSyncLabel,
      attention: connection.state === 'attention',
      actions: [action(`connection-${connection.connectionId}`, 'manage_connection', connection.actionLabel, connection.providerLabel)],
    })),
    coachAccess: {
      stateLabel: source.coachAccess.state.replaceAll('_', ' '),
      coachLabel: source.coachAccess.coachLabel,
      detail: source.coachAccess.detail,
      actions: source.coachAccess.actionLabel
        ? [action('manage-coach', 'manage_coach_access', source.coachAccess.actionLabel, source.coachAccess.coachLabel)]
        : [],
    },
    social: {
      friendCountLabel: `${source.social.friendCount} friend${source.social.friendCount === 1 ? '' : 's'}`,
      invitationLabel,
      sharingDefaultLabel: source.social.sharingDefaultLabel,
      privacyLabel: source.social.privacyLabel,
      actions: [
        action('open-friends', 'open_friends', 'Friends'),
        action('open-sharing', 'open_sharing', 'Sharing controls'),
        action('open-privacy', 'open_privacy', 'Privacy'),
      ],
    },
    appControls: source.appControls.map(setting => ({
      settingId: setting.settingId,
      label: setting.label,
      valueLabel: setting.valueLabel,
      detail: setting.detail,
      attention: setting.attention === true,
      actions: [action(`setting-${setting.settingId}`, settingKind(setting.settingId), 'Open', setting.label)],
    })),
    screenReaderOrder: ['profile', 'context', 'connections', 'coach', 'social', 'controls'],
    bottomInsetForNavigation: 104,
  };
}

function settingKind(settingId: string): V29YouAction['kind'] {
  const normalized = settingId.toLowerCase();
  if (normalized.includes('notification')) return 'open_notifications';
  if (normalized.includes('accessib')) return 'open_accessibility';
  if (normalized.includes('data') || normalized.includes('delete') || normalized.includes('export')) return 'open_data_controls';
  return 'open_support';
}

export function assertVisibleYouWorkspace(model: V29YouVisibleScreenModel): void {
  if (model.screenReaderOrder[0] !== 'profile') throw new Error('Profile must be the first visible You section.');
  if (model.bottomInsetForNavigation < 88) throw new Error('Visible You workspace must clear bottom navigation.');
  if (model.profile.actions.length === 0) throw new Error('Athlete profile must remain editable.');
  if (model.social.actions.length < 3) throw new Error('Friends, sharing, and privacy must remain directly accessible.');
}
