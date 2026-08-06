import { describe, expect, it } from 'vitest';
import {
  assertYouWorkspace,
  buildYouWorkspace,
  youAttentionItems,
  youConnectionSummary,
  youProfileCompletionPrompt,
} from '../src/you-workspace';

describe('You workspace', () => {
  it('shows the athlete context directly instead of only routing rows', () => {
    const model = buildYouWorkspace({
      profile: {
        primaryGoalLabel: '70.3 in December',
        phaseLabel: 'Strength emphasis · Week 3 of 8',
        weeklyAvailabilityLabel: '10 hours per week',
        strengthFrequencyLabel: '3 sessions per week',
        equipmentProfileLabel: 'Home and hotel gym',
      },
      currentContext: [
        {
          contextId: 'restriction-left-femur',
          label: 'Current restriction',
          value: 'Return-to-run progression',
          detail: 'Avoid automatic impact progression.',
          needsAttention: false,
          editPresentation: 'bottom_sheet',
        },
      ],
    });
    expect(model.profile.primaryGoalLabel).toContain('70.3');
    expect(model.currentContext[0]?.value).toContain('Return-to-run');
    expect(() => assertYouWorkspace(model)).not.toThrow();
  });

  it('surfaces connection and access problems', () => {
    const model = buildYouWorkspace({
      connections: [
        { connectionId: 'strava', providerLabel: 'Strava', state: 'connected', statusLabel: 'Connected', actionLabel: 'Manage' },
        { connectionId: 'calendar', providerLabel: 'Training calendar', state: 'attention', statusLabel: 'Sync failed', actionLabel: 'Reconnect' },
      ],
      coachAccess: { state: 'pending', coachLabel: 'Coach Taylor', detail: 'Access request awaiting approval.', actionLabel: 'Review' },
    });
    expect(youConnectionSummary(model)).toContain('need attention');
    expect(youAttentionItems(model)).toEqual(['calendar', 'coach-access']);
  });

  it('gives a useful profile prompt without using completion pressure', () => {
    const model = buildYouWorkspace();
    expect(youProfileCompletionPrompt(model)).toContain('primary goal');
    expect(youProfileCompletionPrompt(model)).not.toContain('%');
  });

  it('deduplicates settings and connections', () => {
    const model = buildYouWorkspace({
      connections: [
        { connectionId: 'strava', providerLabel: 'Strava', state: 'connected', statusLabel: 'Connected', actionLabel: 'Manage' },
        { connectionId: 'strava', providerLabel: 'Strava duplicate', state: 'attention', statusLabel: 'Problem', actionLabel: 'Fix' },
      ],
      appControls: [
        { settingId: 'privacy-sharing', label: 'Privacy', presentation: 'route' },
        { settingId: 'privacy-sharing', label: 'Duplicate privacy', presentation: 'route' },
      ],
    });
    expect(model.connections).toHaveLength(1);
    expect(model.appControls).toHaveLength(1);
  });
});
