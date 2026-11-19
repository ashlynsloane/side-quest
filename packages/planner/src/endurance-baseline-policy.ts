import type { EnduranceDiscipline } from '@circuit/domain';

/** A per-sport observed baseline is required before suggesting a dose.
 * A goal, available time, or aggregate reported cardio hours is insufficient.
 */
export function unverifiedEnduranceDisciplines(
  selected: EnduranceDiscipline[],
  baselines: Partial<Record<EnduranceDiscipline, {
    sessionsPerWeek: number; minutesPerWeek: number; longestSessionMinutes: number;
  }>>,
): EnduranceDiscipline[] {
  return (['swim', 'bike', 'run'] as const).filter((discipline) => {
    if (!selected.includes(discipline)) return true;
    const baseline = baselines[discipline];
    return !baseline
      || !Number.isFinite(baseline.sessionsPerWeek) || baseline.sessionsPerWeek <= 0
      || !Number.isFinite(baseline.minutesPerWeek) || baseline.minutesPerWeek <= 0
      || !Number.isFinite(baseline.longestSessionMinutes) || baseline.longestSessionMinutes <= 0;
  });
}
