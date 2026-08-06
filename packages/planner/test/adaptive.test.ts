import { exerciseSeed } from '@circuit/exercise-content';
import type { PerformanceGoal, TrainingBlockPlan, TrainingCalendarEvent, WeeklyPlanRequest } from '@circuit/domain';
import { describe, expect, it } from 'vitest';

import {
  analyzePlanHealth,
  applyReplanProposals,
  buildReplanProposals,
  generateTrainingBlock,
} from '../src/index';

const equipment: WeeklyPlanRequest['availableEquipment'] = ['bodyweight', 'dumbbell', 'long_band', 'mini_band', 'bench'];

function goal(): PerformanceGoal {
  return {
    id: 'adaptive_goal',
    type: 'road_half_marathon',
    name: 'Road Half Marathon',
    eventDate: '2026-09-13',
    weeksUntilEvent: 8,
    disciplines: ['run'],
    priority: 'perform',
    sessionsPerWeek: 3,
    defaultSessionMinutes: 32,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
  };
}

function block(): TrainingBlockPlan {
  const result = generateTrainingBlock({
    goal: goal(),
    numberOfWeeks: 2,
    weekStartDate: '2026-07-20',
    availableEquipment: equipment,
    excludedRegions: [],
    excludedMovementTags: [],
    difficulty: 'intermediate',
    preferredStrengthDays: ['monday', 'wednesday', 'friday'],
    randomSeed: 'adaptive-test',
  }, { exercises: exerciseSeed, now: '2026-07-20T08:00:00.000Z' });
  if (!result.ok) throw new Error(result.messages.join(' '));
  return result.block;
}

function event(date: string, discipline: TrainingCalendarEvent['discipline'], title: string): TrainingCalendarEvent {
  return {
    id: `event_${date}_${discipline}`,
    sourceId: 'manual',
    title,
    startAt: `${date}T08:00:00.000Z`,
    allDay: false,
    discipline,
  };
}

describe('adaptive plan health', () => {
  it('detects a run conflict on a planned strength day', () => {
    const plan = block();
    const session = plan.weeks[0]?.sessions[0];
    expect(session).toBeDefined();
    if (!session) return;
    const health = analyzePlanHealth({
      block: plan,
      calendarEvents: [event(session.date, 'run', 'Long Run')],
      today: '2026-07-20',
    });
    expect(health.conflicts.some((item) => item.kind === 'same_day_endurance' && item.sessionId === session.id)).toBe(true);
    expect(health.label).toBe('needs_attention');
    expect(health.context).toContain('not an overall score');
  });

  it('detects a designated rest-day conflict', () => {
    const plan = block();
    const session = plan.weeks[0]?.sessions[0];
    if (!session) throw new Error('Missing generated session');
    const health = analyzePlanHealth({
      block: plan,
      calendarEvents: [event(session.date, 'rest', 'Complete Rest')],
      today: '2026-07-20',
    });
    expect(health.conflicts.some((item) => item.kind === 'rest_day' && item.severity === 'high')).toBe(true);
  });

  it('proposes a different date within the same week', () => {
    const plan = block();
    const session = plan.weeks[0]?.sessions[0];
    if (!session) throw new Error('Missing generated session');
    const proposals = buildReplanProposals({
      block: plan,
      calendarEvents: [event(session.date, 'rest', 'Complete Rest')],
      today: '2026-07-20',
    });
    const proposal = proposals.find((item) => item.sessionId === session.id);
    expect(proposal).toBeDefined();
    expect(proposal?.toDate).not.toBe(session.date);
    expect(proposal?.toDate.slice(0, 8)).toBe(session.date.slice(0, 8));
  });

  it('applies proposals without changing completed sessions', () => {
    const plan = block();
    const first = plan.weeks[0]?.sessions[0];
    const second = plan.weeks[0]?.sessions[1];
    if (!first || !second) throw new Error('Missing generated sessions');
    const completedPlan: TrainingBlockPlan = {
      ...plan,
      weeks: plan.weeks.map((week, index) => index === 0
        ? { ...week, sessions: week.sessions.map((session) => session.id === second.id ? { ...session, completionStatus: 'completed' as const } : session) }
        : week),
    };
    const proposals = buildReplanProposals({
      block: completedPlan,
      calendarEvents: [event(first.date, 'rest', 'Complete Rest')],
      today: '2026-07-20',
    });
    const updated = applyReplanProposals(completedPlan, proposals, '2026-07-20T10:00:00.000Z');
    const updatedFirst = updated.weeks.flatMap((week) => week.sessions).find((session) => session.id === first.id);
    const updatedSecond = updated.weeks.flatMap((week) => week.sessions).find((session) => session.id === second.id);
    expect(updatedFirst?.date).not.toBe(first.date);
    expect(updatedFirst?.completionStatus).toBe('modified');
    expect(updatedSecond?.completionStatus).toBe('completed');
    expect(updated.parentBlockId).toBe(completedPlan.id);
  });
});
