import { describe, expect, it } from 'vitest';
import type { TrainingCalendarEvent } from '@circuit/domain';
import { buildFirstWeekTrainingSummary } from '../src/first-week-training-summary';
import { createManualEnduranceActivity } from '../src/manual-endurance';

const base = Date.parse('2026-11-02T00:00:00.000Z');
const day = (offset: number) =>
  new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe('seeded proposed-week invariants, deterministic across CI runs', () => {
  it.each(Array.from({ length: 48 }, (_, i) => i + 1))(
    'seed %i keeps planned training separate from observed exposure', seed => {
      const rand = random(seed);
      const events: TrainingCalendarEvent[] = [];
      const eligible: { id: string; minutes: number | null; date: string }[] = [];
      for (let index = 0; index < 24; index += 1) {
        const localDay = day(Math.floor(rand() * 12) - 3);
        const sourceId = rand() < 0.7
          ? 'side_quest_generated_plan' : 'trainingpeaks_ics';
        const sport = (['run', 'bike', 'swim'] as const)[Math.floor(rand() * 3)]!;
        const known = rand() < 0.7;
        const minutes = known ? Math.floor(rand() * 200) + 1 : null;
        const id = 'seed-' + seed + '-' + index;
        events.push({
          id, sourceId, allDay: true, discipline: sport,
          startAt: localDay + 'T12:00:00.000Z',
          title: sport,
          description: minutes === null ? 'Duration not recorded'
            : 'Side Quest generated · ' + minutes + ' min · easy',
        });
        if (sourceId === 'side_quest_generated_plan'
          && localDay >= '2026-11-02' && localDay <= '2026-11-08') {
          eligible.push({ id: 'calendar:' + id, minutes, date: localDay });
        }
      }
      const actual = buildFirstWeekTrainingSummary({
        weekStartDate: day(0), timezone: 'America/Denver',
        strengthSessions: [], generatedEvents: events,
      });
      expect(actual.days.map(d => d.date), 'seed ' + seed).toEqual(
        Array.from({ length: 7 }, (_, offset) => day(offset)),
      );
      expect(actual.sessions.map(s => s.id).sort(), 'seed ' + seed)
        .toEqual(eligible.map(s => s.id).sort());
      expect(actual.knownPlannedMinutes).toBe(eligible.reduce(
        (sum, item) => sum + (item.minutes ?? 0), 0,
      ));
      expect(actual.unknownDurationCount).toBe(
        eligible.filter(item => item.minutes === null).length,
      );
      expect(actual.evidenceStatus).toBe('provisional_unverified');
      expect(actual.sessions.every(s => s.source === 'generated_endurance')).toBe(true);
    },
  );
});

describe('seeded manual-workout dose integrity', () => {
  it.each(Array.from({ length: 32 }, (_, i) => i + 1))(
    'seed %i preserves actual minutes and deliberately unknown distance', seed => {
      const minutes = seed * 9.5;
      const distance = seed % 3 ? null : seed / 10;
      const result = createManualEnduranceActivity({
        id: 'seeded-completion-' + seed,
        name: 'Completed workout ' + seed,
        discipline: (['bike', 'run', 'swim'] as const)[seed % 3]!,
        localDate: '2026-10-28',
        durationMinutes: minutes,
        distanceKm: distance,
        intensity: 'easy',
        recordedAt: '2026-10-30T12:00:00.000Z',
      });
      expect(result.movingTimeSeconds).toBe(Math.round(minutes * 60));
      expect(result.elapsedTimeSeconds).toBe(Math.round(minutes * 60));
      expect(result.source).toBe('manual');
      if (distance === null) {
        expect(result.distanceMeters).toBeUndefined();
      } else {
        expect(result.distanceMeters).toBe(Math.round(distance * 1000));
      }
    },
  );
});
