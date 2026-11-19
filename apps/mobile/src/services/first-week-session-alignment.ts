import type { BodyRegion, GeneratedWorkout, PlannedStrengthSession } from '@circuit/domain';

/**
 * Last-mile consistency gate for an already saved planned strength session.
 * Regeneration can repair an incompatible blueprint; historical previews must
 * never be silently authorized simply because their workout title looks right.
 */
export function inspectPlannedSessionCoherence(
  workout: GeneratedWorkout,
  planned: PlannedStrengthSession | null | undefined,
): { ok: true } | { ok: false; message: string } {
  if (!planned) return { ok: true }; // One-off workouts have their own safety gate.
  const focus = planned.focusTargets.filter((item) => item.emphasis === 'strong');
  const anchorTargets = focus.length > 0 ? focus
    : planned.focusTargets.filter((item) => item.emphasis === 'moderate');
  if (anchorTargets.length === 0) {
    return { ok: false, message: 'This planned session has no verifiable focus region. Regenerate or review the session before starting.' };
  }
  const excluded = new Set(workout.request.excludedRegions);
  const avoid = new Set(workout.request.regionRestrictions
    ?.filter((item) => item.mode === 'avoid' || item.mode === 'keep_light')
    .map((item) => item.region) ?? []);
  const viableAnchors = anchorTargets.filter((item) =>
    !excluded.has(item.region) && !avoid.has(item.region));
  if (viableAnchors.length === 0) {
    return { ok: false, message: 'The planned session focus conflicts with your protected regions. Regenerate or edit the plan before training.' };
  }
  const actual = workout.stations.flatMap((station) =>
    station.exercises.flatMap((item) => item.exerciseSnapshot.bodyRegions
      .map((load) => load.region)));
  const actualRegions = new Set<BodyRegion>(actual);
  if (!viableAnchors.some((item) => actualRegions.has(item.region))) {
    return { ok: false, message: 'The selected exercises do not support this planned session focus. Regenerate or edit before training.' };
  }
  const excludedActual = actual.filter((region) => excluded.has(region));
  if (excludedActual.length > 0) {
    return { ok: false, message: 'A selected exercise still loads a protected body region. Review the exercise list and regenerate before training.' };
  }
  const notAtVenue = workout.requiredEquipment.filter((id) =>
    !workout.request.availableEquipment.includes(id));
  if (notAtVenue.length > 0) {
    return { ok: false, message: 'The workout requires equipment that is not available at the selected location. Choose a valid training space.' };
  }
  return { ok: true };
}
