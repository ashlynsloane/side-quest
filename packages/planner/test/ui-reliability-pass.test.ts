import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveGeneratedSessionForPreview } from '../src/generated-session-link';

const ROOT = resolve(__dirname, '../../..');
const source = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

describe('UI reliability pass', () => {
  it('resolves a tapped generated session by stable event suffix even when the event row is replaced', () => {
    const sessions = [
      {
        id: 'whole_bike_2026-08-25_1',
        date: '2026-08-25',
        discipline: 'bike',
        title: 'Tempo · Aerobic Strength',
        durationMinutes: 105,
      },
    ];
    const result = resolveGeneratedSessionForPreview(
      'sq_plan_old-block_whole_bike_2026-08-25_1',
      { date: '2026-08-25', discipline: 'bike' },
      sessions,
    );
    expect(result?.title).toBe('Tempo · Aerobic Strength');
  });

  it('uses conservative route hints when generated identity changes but the session remains unambiguous', () => {
    const sessions = [
      {
        id: 'whole_bike_2026-08-25_2',
        date: '2026-08-25',
        discipline: 'bike',
        title: 'Tempo · Aerobic Strength',
        durationMinutes: 105,
      },
      {
        id: 'whole_swim_2026-08-25_1',
        date: '2026-08-25',
        discipline: 'swim',
        title: 'Technique',
        durationMinutes: 50,
      },
    ];
    const result = resolveGeneratedSessionForPreview(
      'sq_plan_old-block_whole_bike_2026-08-25_1',
      {
        date: '2026-08-25',
        discipline: 'bike',
        title: 'Tempo · Aerobic Strength',
        durationMinutes: 105,
      },
      sessions,
    );
    expect(result?.discipline).toBe('bike');
    expect(result?.durationMinutes).toBe(105);
  });

  it('refuses to guess between ambiguous preview candidates', () => {
    const sessions = [
      { id: 'a', date: '2026-08-25', discipline: 'bike', title: 'Easy', durationMinutes: 45 },
      { id: 'b', date: '2026-08-25', discipline: 'bike', title: 'Easy', durationMinutes: 45 },
    ];
    expect(resolveGeneratedSessionForPreview(
      'missing-id',
      { date: '2026-08-25', discipline: 'bike', title: 'Easy', durationMinutes: 45 },
      sessions,
    )).toBeNull();
  });

  it('carries a compact event snapshot from Week into endurance detail', () => {
    const week = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(week).toContain("title: event.title");
    expect(week).toContain("discipline: event.discipline");
    expect(week).toContain("startAt: event.startAt");
    expect(week).toContain("router.push(`/endurance-preview?${params.toString()}`");
  });

  it('resolves planner identity before requiring an exact persisted calendar row', () => {
    const runtime = source('apps/mobile/src/services/endurance-prescription-runtime.ts');
    expect(runtime).toContain("const exactEvent = events.find((candidate) => candidate.id === eventId) ?? null");
    expect(runtime).toContain('resolveGeneratedSessionForPreview(');
    expect(runtime).toContain('eventFromPlannedSession(eventId, planned, routeHint)');
    expect(runtime).toContain("source: 'whole_athlete_plan' | 'calendar_fallback' | 'route_snapshot'");
  });

  it('offers in-place retry instead of a dead-end Workout unavailable screen', () => {
    const preview = source('apps/mobile/src/app/endurance-preview.tsx');
    expect(preview).not.toContain('title="Workout unavailable"');
    expect(preview).toContain('title="Workout changed"');
    expect(preview).toContain('Refresh workout');
    expect(preview).toContain('setRetryToken((value) => value + 1)');
  });

  it('uses readable detail typography for strength and endurance body copy', () => {
    const endurance = source('apps/mobile/src/app/endurance-preview.tsx');
    const strength = source('apps/mobile/src/components/workout-preview-screen-v2.tsx');
    expect(endurance).toContain("blockInstruction: { color: tokens.textMuted, fontSize: 14, lineHeight: 21");
    expect(endurance).toContain("infoBody: { color: tokens.textMuted, fontSize: 14, lineHeight: 21");
    expect(strength).toContain("exerciseName: { color: tokens.text, fontSize: 15.5, lineHeight: 20");
    expect(strength).toContain("exerciseMeta: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17");
    expect(strength).toContain("stationTitle: { color: tokens.text, fontSize: 16.5, lineHeight: 21");
  });
});
