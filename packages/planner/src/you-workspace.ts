import type {
  YouAthleteProfileSummary,
  YouCoachAccessSummary,
  YouConnectionItem,
  YouContextItem,
  YouSettingRow,
  YouSocialSummary,
  YouWorkspaceModel,
} from '@circuit/domain';

export interface BuildYouWorkspaceInput {
  profile?: Partial<YouAthleteProfileSummary>;
  currentContext?: YouContextItem[];
  connections?: YouConnectionItem[];
  coachAccess?: Partial<YouCoachAccessSummary>;
  social?: Partial<YouSocialSummary>;
  appControls?: YouSettingRow[];
}

const defaultProfile = (): YouAthleteProfileSummary => ({
  primaryGoalLabel: 'Set your primary training goal',
  phaseLabel: 'No active phase',
  weeklyAvailabilityLabel: 'Add weekly availability',
  strengthFrequencyLabel: 'Choose a strength frequency',
  equipmentProfileLabel: 'Add available equipment',
});

const defaultCoachAccess = (): YouCoachAccessSummary => ({
  state: 'none',
  detail: 'No coach currently has access to your Side Quest training information.',
});

const defaultSocial = (): YouSocialSummary => ({
  friendCount: 0,
  pendingInvitationCount: 0,
  sharingDefaultLabel: 'Ask each time',
  privacyLabel: 'Private account',
});

export function buildYouWorkspace(input: BuildYouWorkspaceInput = {}): YouWorkspaceModel {
  return {
    profile: { ...defaultProfile(), ...input.profile },
    currentContext: dedupeBy(input.currentContext ?? [], (item) => item.contextId).slice(0, 8),
    connections: dedupeBy(input.connections ?? [], (item) => item.connectionId).slice(0, 10),
    coachAccess: { ...defaultCoachAccess(), ...input.coachAccess },
    social: { ...defaultSocial(), ...input.social },
    appControls: dedupeBy(input.appControls ?? [], (item) => item.settingId).slice(0, 20),
  };
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function youAttentionItems(model: YouWorkspaceModel): string[] {
  const context = model.currentContext
    .filter((item) => item.needsAttention)
    .map((item) => item.contextId);
  const connections = model.connections
    .filter((item) => item.state === 'attention')
    .map((item) => item.connectionId);
  const settings = model.appControls
    .filter((item) => item.attention)
    .map((item) => item.settingId);
  if (model.coachAccess.state === 'pending' || model.coachAccess.state === 'expired') {
    connections.push('coach-access');
  }
  return [...context, ...connections, ...settings];
}

export function youConnectionSummary(model: YouWorkspaceModel): string {
  const connected = model.connections.filter((item) => item.state === 'connected').length;
  const attention = model.connections.filter((item) => item.state === 'attention').length;
  if (attention > 0) return `${attention} connection${attention === 1 ? '' : 's'} need attention.`;
  if (connected > 0) return `${connected} connection${connected === 1 ? '' : 's'} active.`;
  return 'No training services are connected yet.';
}

export function youProfileCompletionPrompt(model: YouWorkspaceModel): string | undefined {
  const missing: string[] = [];
  if (model.profile.primaryGoalLabel === defaultProfile().primaryGoalLabel) missing.push('primary goal');
  if (model.profile.weeklyAvailabilityLabel === defaultProfile().weeklyAvailabilityLabel) missing.push('weekly availability');
  if (model.profile.equipmentProfileLabel === defaultProfile().equipmentProfileLabel) missing.push('equipment');
  if (missing.length === 0) return undefined;
  return `Add ${missing.join(', ')} so recommendations fit your actual training context.`;
}

export function assertYouWorkspace(model: YouWorkspaceModel): void {
  for (const [field, value] of Object.entries(model.profile)) {
    if (field !== 'displayName' && field !== 'nextEventLabel' && typeof value === 'string' && !value.trim()) {
      throw new Error(`You profile field ${field} cannot be empty.`);
    }
  }
  if (!Number.isInteger(model.social.friendCount) || model.social.friendCount < 0) {
    throw new Error('You social friend count must be a non-negative integer.');
  }
  if (!Number.isInteger(model.social.pendingInvitationCount) || model.social.pendingInvitationCount < 0) {
    throw new Error('You social invitation count must be a non-negative integer.');
  }
  for (const item of model.currentContext) {
    if (!item.label.trim() || !item.value.trim()) throw new Error(`You context ${item.contextId} requires direct information.`);
  }
  for (const connection of model.connections) {
    if (!connection.providerLabel.trim() || !connection.statusLabel.trim() || !connection.actionLabel.trim()) {
      throw new Error(`You connection ${connection.connectionId} requires visible status and action.`);
    }
  }
  for (const setting of model.appControls) {
    if (!setting.label.trim()) throw new Error(`You setting ${setting.settingId} requires a label.`);
  }
}
