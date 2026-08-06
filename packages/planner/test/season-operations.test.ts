import { describe, expect, it } from 'vitest';
import type { SeasonOperationEvent, SeasonSessionContext } from '@circuit/domain';
import { buildSeasonAdjustmentProposal, buildSeasonTimeline, evaluateSeasonConstraints } from '../src/season-operations';

const trip: SeasonOperationEvent = {
  eventId: 'trip', athleteId: 'athlete', kind: 'travel', title: 'Work trip',
  startsOn: '2026-09-12', endsOn: '2026-09-18', timezone: 'America/Denver', severity: 'hard',
  allowedSports: ['run', 'strength', 'recovery'], unavailableEquipment: ['bike', 'trainer'],
  availableEquipment: ['hotel_gym'], environmentTags: [], provenance: ['athlete'],
};

const ride: SeasonSessionContext = {
  sessionId: 'ride', sport: 'bike', localDate: '2026-09-14', equipmentRequired: ['bike'],
  environmentRequired: [], movable: true,
};

describe('season operations', () => {
  it('blocks an equipment-dependent ride during travel', () => {
    const timeline = buildSeasonTimeline('athlete', '2026-09-01', '2026-09-30', [trip]);
    expect(evaluateSeasonConstraints(ride, timeline).allowed).toBe(false);
  });

  it('proposes an athlete-approved adjustment instead of silently deleting training', () => {
    const proposal = buildSeasonAdjustmentProposal(trip, [ride]);
    expect(proposal.moveSessionIds).toContain('ride');
    expect(proposal.requiresAthleteApproval).toBe(true);
  });
});
