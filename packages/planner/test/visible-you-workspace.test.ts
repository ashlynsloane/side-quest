import { describe, expect, it } from 'vitest';
import type { YouWorkspaceModel } from '@circuit/domain';
import { assertVisibleYouWorkspace, buildVisibleYouWorkspace } from '../src/visible-you-workspace';

const fixture: YouWorkspaceModel = {
  profile: {
    displayName: 'Ashlyn',
    primaryGoalLabel: 'Half Ironman',
    nextEventLabel: 'December A race',
    phaseLabel: 'Strength emphasis',
    weeklyAvailabilityLabel: '10 hours per week',
    strengthFrequencyLabel: '3 sessions per week',
    equipmentProfileLabel: 'Home and gym equipment',
  },
  currentContext: [{ contextId: 'pain', label: 'Pain and restrictions', value: 'None active', needsAttention: false, editPresentation: 'bottom_sheet' }],
  connections: [{ connectionId: 'strava', providerLabel: 'Strava', state: 'connected', statusLabel: 'Connected', lastSyncLabel: 'Synced today', actionLabel: 'Manage' }],
  coachAccess: { state: 'none', detail: 'No coach currently has access.', actionLabel: 'Invite a coach' },
  social: { friendCount: 2, pendingInvitationCount: 1, sharingDefaultLabel: 'Private by default', privacyLabel: 'Friends only' },
  appControls: [{ settingId: 'notifications', label: 'Notifications', valueLabel: 'Important only', presentation: 'route' }],
};

describe('visible You workspace', () => {
  it('keeps the athlete profile and current context editable', () => {
    const model = buildVisibleYouWorkspace(fixture);
    expect(model.profile.actions[0]?.label).toBe('Edit athlete profile');
    expect(model.currentContext[0]?.actions[0]?.label).toBe('Edit');
  });

  it('surfaces integrations, coach access, friends, sharing, and privacy', () => {
    const model = buildVisibleYouWorkspace(fixture);
    expect(model.connections[0]?.providerLabel).toBe('Strava');
    expect(model.coachAccess.actions[0]?.label).toBe('Invite a coach');
    expect(model.social.actions.map(item => item.label)).toEqual(['Friends', 'Sharing controls', 'Privacy']);
  });

  it('passes visible workspace invariants', () => {
    expect(() => assertVisibleYouWorkspace(buildVisibleYouWorkspace(fixture))).not.toThrow();
  });
});
