import { describe, expect, it } from 'vitest';

import {
  resolveGeneratedSessionByEventId,
  safeGeneratedSessionId,
} from '../src/generated-session-link';

describe('generated calendar-event session linking', () => {
  it('resolves the planner session from the stable event-id suffix even when display semantics change', () => {
    const sessions = [
      { id: 'bike_volume_support_2026-08-23_4', title: 'Aerobic · Endurance Support' },
      { id: 'run:2026-08-23:return-to-run', title: 'Easy return-to-run' },
    ];

    const bike = resolveGeneratedSessionByEventId(
      'sq_plan_block_123_bike_volume_support_2026-08-23_4',
      sessions,
    );
    const run = resolveGeneratedSessionByEventId(
      `sq_plan_block_123_${safeGeneratedSessionId('run:2026-08-23:return-to-run')}`,
      sessions,
    );

    expect(bike?.id).toBe('bike_volume_support_2026-08-23_4');
    expect(run?.id).toBe('run:2026-08-23:return-to-run');
  });

  it('prefers the longest matching suffix when one session id could suffix-match another', () => {
    const sessions = [
      { id: 'support' },
      { id: 'bike_support' },
    ];
    expect(resolveGeneratedSessionByEventId('sq_plan_block_bike_support', sessions)?.id)
      .toBe('bike_support');
  });
});
