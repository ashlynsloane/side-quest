import { describe, expect, it } from 'vitest';
import type { CalendarIntelligenceInput } from '@circuit/domain';
import { buildCalendarIntelligence } from '../src/calendar-intelligence';

const base: CalendarIntelligenceInput = {
  generatedAt: '2026-07-29T12:00:00.000Z',
  sessions: [{
    sessionId: 'strength-1',
    startsAt: '2026-07-30T18:00:00.000Z',
    durationMinutes: 45,
    title: 'Strength support',
    discipline: 'strength',
    priority: 'supporting',
    movable: true,
    requiredEquipment: ['dumbbells'],
  }],
  constraints: [{
    constraintId: 'work-1',
    startsAt: '2026-07-30T17:00:00.000Z',
    endsAt: '2026-07-30T20:00:00.000Z',
    kind: 'work',
    severity: 'hard',
    title: 'Work meeting',
  }],
  windows: [{
    startsAt: '2026-07-31T16:00:00.000Z',
    endsAt: '2026-07-31T17:00:00.000Z',
    availableMinutes: 60,
    availableEquipment: ['dumbbells'],
    source: 'calendar_gap',
  }],
};

describe('calendar intelligence', () => {
  it('proposes a valid move instead of forcing training through a hard constraint', () => {
    const result = buildCalendarIntelligence(base);
    expect(result.proposals[0]?.action).toBe('move');
    expect(result.proposals[0]?.proposedStartsAt).toBe('2026-07-31T16:00:00.000Z');
    expect(result.proposals[0]?.requiresAthleteApproval).toBe(true);
  });

  it('protects a key session and directs supporting work to adapt around it', () => {
    const result = buildCalendarIntelligence({
      ...base,
      sessions: [{ ...base.sessions[0], priority: 'key' }],
    });
    expect(result.proposals[0]?.action).toBe('keep');
    expect(result.protectedSessionIds).toContain('strength-1');
  });

  it('does not move a session into a window without required equipment', () => {
    const result = buildCalendarIntelligence({
      ...base,
      windows: [{ ...base.windows[0], availableEquipment: ['bands'] }],
    });
    expect(result.proposals[0]?.action).toBe('remove');
  });

  it('never applies calendar changes without athlete approval', () => {
    const result = buildCalendarIntelligence(base);
    const changes = result.proposals.filter((proposal) => proposal.action !== 'keep');
    expect(changes.every((proposal) => proposal.requiresAthleteApproval)).toBe(true);
  });
});
