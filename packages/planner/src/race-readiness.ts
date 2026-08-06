import type { PerformanceGoal, TrainingPhase } from '@circuit/domain';

export type RaceChecklistCategory = 'training' | 'strength' | 'equipment' | 'logistics' | 'recovery';

export interface RaceChecklistItem {
  id: string;
  category: RaceChecklistCategory;
  title: string;
  detail: string;
  timing: 'now' | 'two_weeks' | 'race_week' | 'race_day';
  due: boolean;
}

export function buildRaceChecklist({
  goal,
  phase,
  today = new Date().toISOString().slice(0, 10),
}: {
  goal: PerformanceGoal;
  phase: TrainingPhase;
  today?: string;
}): RaceChecklistItem[] {
  const daysRemaining = goal.eventDate ? differenceInDays(today, goal.eventDate) : null;
  const items: RaceChecklistItem[] = [
    item('confirm-event-details', 'logistics', 'Confirm event details', 'Verify the start time, location, check-in requirements, course rules, and transportation plan.', 'now', true),
    item('protect-key-sessions', 'training', 'Protect the final key endurance sessions', 'Keep the final race-specific sessions high quality rather than adding unplanned volume.', 'two_weeks', isDue(daysRemaining, 14)),
    item('no-new-strength', 'strength', 'Stop introducing new strength exercises', 'Retain familiar movements only. New exercises can create avoidable soreness or coordination demands.', 'two_weeks', isDue(daysRemaining, 14)),
    item('reduce-strength-dose', 'strength', 'Reduce strength volume', 'Use reduced or minimum versions while maintaining movement quality and confidence.', 'race_week', isDue(daysRemaining, 7) || phase === 'race_week'),
    item('symptom-review', 'recovery', 'Review pain, tightness, and PT restrictions', 'Resolve or appropriately manage active issues before race day. The app cannot provide medical clearance.', 'race_week', isDue(daysRemaining, 7)),
    item('sleep-routine', 'recovery', 'Protect the normal sleep routine', 'Prioritize consistency rather than trying to compensate with one unusually long night immediately before the event.', 'race_week', isDue(daysRemaining, 7)),
    item('race-day-plan', 'training', 'Write the race-day pacing and fueling plan', 'Use a plan already practiced in training; avoid untested last-minute changes.', 'race_week', isDue(daysRemaining, 7)),
    item('event-day-strength', 'strength', 'No additional strength work on event day', 'Event performance and freshness take priority over completing a strength streak.', 'race_day', isDue(daysRemaining, 0)),
  ];

  if (goal.disciplines.includes('bike')) {
    items.push(
      item('bike-safety-check', 'equipment', 'Complete the bike safety check', 'Inspect tires, brakes, drivetrain, bolts, hydration storage, and the repair kit early enough to fix problems.', 'two_weeks', isDue(daysRemaining, 14)),
      item('bike-charge', 'equipment', 'Charge electronic bike equipment', 'Charge shifting, head unit, lights, power meter, and other required electronics.', 'race_week', isDue(daysRemaining, 3)),
    );
  }
  if (goal.disciplines.includes('swim')) {
    items.push(
      item('swim-gear', 'equipment', 'Confirm swim equipment', 'Check goggles, backup goggles, cap, wetsuit or swimrun gear, anti-chafe products, and event-specific rules.', 'two_weeks', isDue(daysRemaining, 14)),
    );
  }
  if (goal.disciplines.includes('run')) {
    items.push(
      item('run-equipment', 'equipment', 'Finalize shoes and running kit', 'Use equipment already tested during relevant long or race-specific sessions.', 'two_weeks', isDue(daysRemaining, 14)),
    );
  }
  if (goal.type === 'swimrun') {
    items.push(
      item('swimrun-transitions', 'training', 'Rehearse swim–run transitions', 'Confirm tether, paddles, pull buoy, footwear, partner communication, and repeated transition routines.', 'two_weeks', isDue(daysRemaining, 14)),
    );
  }
  if (goal.type.startsWith('triathlon') || goal.type.startsWith('ironman')) {
    items.push(
      item('transition-layout', 'logistics', 'Plan transition layout', 'Write the order of equipment and actions for each transition rather than relying on race-morning memory.', 'race_week', isDue(daysRemaining, 7)),
    );
  }
  if (goal.type === 'trail_50k' || goal.type === 'trail_100k') {
    items.push(
      item('trail-mandatory-kit', 'equipment', 'Verify mandatory trail equipment', 'Review the official mandatory-kit list, weather contingencies, lighting, and aid-station access.', 'two_weeks', isDue(daysRemaining, 14)),
    );
  }

  return items.sort((left, right) => timingRank(left.timing) - timingRank(right.timing)
    || categoryRank(left.category) - categoryRank(right.category));
}

function item(
  id: string,
  category: RaceChecklistCategory,
  title: string,
  detail: string,
  timing: RaceChecklistItem['timing'],
  due: boolean,
): RaceChecklistItem {
  return { id, category, title, detail, timing, due };
}

function isDue(daysRemaining: number | null, threshold: number) {
  return daysRemaining !== null && daysRemaining <= threshold;
}

function differenceInDays(from: string, to: string) {
  return Math.ceil((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

function timingRank(value: RaceChecklistItem['timing']) {
  return { now: 0, two_weeks: 1, race_week: 2, race_day: 3 }[value];
}

function categoryRank(value: RaceChecklistCategory) {
  return { training: 0, strength: 1, equipment: 2, logistics: 3, recovery: 4 }[value];
}
