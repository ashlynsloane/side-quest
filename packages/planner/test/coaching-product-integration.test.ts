import { describe, expect, it } from 'vitest';
import type { ExecutablePlanAction } from '@circuit/domain';
import {
  applyExecutablePlanChangeSet,
  buildExecutablePlanChangeSet,
  previewExecutablePlanChangeSet,
  undoExecutablePlanChangeSet,
} from '../src/coaching-product-integration';

const actions: ExecutablePlanAction[] = [
  {
    actionId: 'move-ride', kind: 'move_session', sourceDecisionId: 'decision-1',
    before: { sessionId: 'ride', title: 'Endurance ride', sport: 'bike', localDate: '2026-08-04', localStartTime: '07:00', durationMinutes: 60, protected: false },
    after: { sessionId: 'ride', title: 'Endurance ride', sport: 'bike', localDate: '2026-08-04', localStartTime: '17:00', durationMinutes: 60, protected: false },
    reason: 'Move the ride around protected masters swimming.',
  },
  {
    actionId: 'keep-swim', kind: 'preserve_session', sourceDecisionId: 'decision-1',
    before: { sessionId: 'masters', title: 'Masters swimming', sport: 'swim', localDate: '2026-08-04', localStartTime: '07:00', durationMinutes: 60, protected: true },
    after: { sessionId: 'masters', title: 'Masters swimming', sport: 'swim', localDate: '2026-08-04', localStartTime: '07:00', durationMinutes: 60, protected: true },
    reason: 'Protected recurring commitment stays here.',
  },
];

describe('coaching product integration', () => {
  it('previews an executable change while preserving protected sessions', () => {
    const changeSet = buildExecutablePlanChangeSet({ changeSetId: 'change-1', athleteId: 'athlete', sourceDecisionId: 'decision-1', createdAt: '2026-07-29T12:00:00Z', actions });
    const preview = previewExecutablePlanChangeSet(changeSet);
    expect(preview.preservedSessionIds).toContain('masters');
    expect(preview.changedSessionIds).toContain('ride');
  });

  it('requires approval, applies atomically, and can be undone', () => {
    const changeSet = buildExecutablePlanChangeSet({ changeSetId: 'change-1', athleteId: 'athlete', sourceDecisionId: 'decision-1', createdAt: '2026-07-29T12:00:00Z', actions });
    expect(applyExecutablePlanChangeSet({ changeSet, athleteApproved: false }).status).toBe('blocked');
    const applied = applyExecutablePlanChangeSet({ changeSet, athleteApproved: true });
    expect(applied.status).toBe('applied');
    expect(undoExecutablePlanChangeSet(changeSet, applied.undoToken ?? '').status).toBe('undone');
  });

  it('blocks attempts to move a protected session', () => {
    const unsafe = [{ ...actions[1], kind: 'move_session' as const }];
    const changeSet = buildExecutablePlanChangeSet({ changeSetId: 'change-2', athleteId: 'athlete', sourceDecisionId: 'decision-1', createdAt: '2026-07-29T12:00:00Z', actions: unsafe });
    expect(changeSet.status).toBe('blocked');
  });
});
