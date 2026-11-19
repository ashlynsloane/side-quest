import type { BodyRegion, EquipmentId } from '@circuit/domain';

export type FastStartLocation = 'home' | 'full_gym' | 'travel' | 'bodyweight';
export type FastStartRestriction = 'none' | 'lower_body' | 'upper_body' | 'back' | 'other';
export type ProtectedArea = 'shoulder' | 'upper_back' | 'elbow_wrist' | 'lower_back'
  | 'hip' | 'knee' | 'achilles_calf' | 'foot_ankle';
export type ProtectedSide = 'left' | 'right' | 'bilateral';
export type ProtectedAreaDetail = { area: ProtectedArea; side: ProtectedSide };
export type CrossTrainingMode = 'swim' | 'bike' | 'run' | 'elliptical' | 'arc_trainer';

export const FAST_START_LOCATIONS: ReadonlyArray<{
  id: FastStartLocation; title: string; detail: string;
}> = [
  { id: 'home', title: 'Home setup', detail: 'Bodyweight, bands, small tools, and the weights you own.' },
  { id: 'full_gym', title: 'Full gym', detail: 'Free weights, cables, machines, benches, and pull-up options.' },
  { id: 'travel', title: 'Hotel / travel', detail: 'Portable equipment when traveling.' },
  { id: 'bodyweight', title: 'Bodyweight only', detail: 'No equipment required.' },
];
export const PROTECTED_AREAS: ReadonlyArray<{ id: ProtectedArea; label: string }> = [
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'upper_back', label: 'Upper back / shoulder blade' },
  { id: 'elbow_wrist', label: 'Elbow / wrist / hand' },
  { id: 'lower_back', label: 'Lower back' },
  { id: 'hip', label: 'Hip / groin' },
  { id: 'knee', label: 'Knee' },
  { id: 'achilles_calf', label: 'Achilles / calf' },
  { id: 'foot_ankle', label: 'Foot / ankle' },
];
export const CROSS_TRAINING_MODES: ReadonlyArray<{
  id: CrossTrainingMode; label: string;
}> = [
  { id: 'swim', label: 'Swimming' },
  { id: 'bike', label: 'Cycling' },
  { id: 'run', label: 'Running' },
  { id: 'elliptical', label: 'Elliptical' },
  { id: 'arc_trainer', label: 'Arc trainer' },
];

/** Reconcile legacy single-value drafts without discarding the original selection. */
export function normalizeFastStartLocations(
  values: unknown, legacyLocation: FastStartLocation = 'home',
): FastStartLocation[] {
  const allowed = new Set(FAST_START_LOCATIONS.map((item) => item.id));
  const candidates = Array.isArray(values) ? values : [];
  const locations = [...new Set(candidates.filter((v): v is FastStartLocation =>
    typeof v === 'string' && allowed.has(v as FastStartLocation)))];
  if (locations.length === 0) return [legacyLocation];
  return locations.includes('bodyweight') ? ['bodyweight'] : locations;
}
export function toggleFastStartLocation(
  current: FastStartLocation[], choice: FastStartLocation,
): FastStartLocation[] {
  if (choice === 'bodyweight') return ['bodyweight'];
  const remaining = current.filter((v) => v !== 'bodyweight');
  const next = remaining.includes(choice)
    ? remaining.filter((v) => v !== choice) : [...remaining, choice];
  // Do not silently produce a plan with unselected/unknown equipment.
  return next.length > 0 ? next : current;
}
export function fastStartPrimaryLocation(
  selected: FastStartLocation[], preferred: FastStartLocation,
): FastStartLocation {
  return selected.includes(preferred) ? preferred : selected[0] ?? 'bodyweight';
}

export function normalizeFastStartRestrictions(
  values: unknown, legacy: FastStartRestriction = 'none',
): FastStartRestriction[] {
  const allowed = new Set<FastStartRestriction>(['none','lower_body','upper_body','back','other']);
  const next = (Array.isArray(values) ? values : []).filter(
    (v): v is FastStartRestriction => allowed.has(v as FastStartRestriction));
  const result = [...new Set(next)];
  const actual = result.filter((v) => v !== 'none');
  return actual.length > 0 ? actual : [legacy];
}
export function toggleFastStartRestriction(
  current: FastStartRestriction[], choice: FastStartRestriction,
): FastStartRestriction[] {
  if (choice === 'none') return ['none'];
  const selected = current.filter((v) => v !== 'none');
  const next = selected.includes(choice)
    ? selected.filter((v) => v !== choice) : [...selected, choice];
  return next.length > 0 ? next : ['none'];
}

export function normalizeProtectedAreas(value: unknown): ProtectedAreaDetail[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(PROTECTED_AREAS.map((item) => item.id));
  const unique = new Map<ProtectedArea, ProtectedAreaDetail>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<ProtectedAreaDetail>;
    if (!allowed.has(item.area as ProtectedArea)) continue;
    const side: ProtectedSide =
      item.side === 'left' || item.side === 'right' ? item.side : 'bilateral';
    unique.set(item.area as ProtectedArea, { area: item.area as ProtectedArea, side });
  }
  return [...unique.values()];
}
export function normalizeCrossTrainingModes(value: unknown): CrossTrainingMode[] {
  const allowed = new Set(CROSS_TRAINING_MODES.map((item) => item.id));
  return [...new Set((Array.isArray(value) ? value : []).filter(
    (item): item is CrossTrainingMode => allowed.has(item as CrossTrainingMode)))];
}

const REGION_GROUPS: Record<Exclude<FastStartRestriction, 'none' | 'other'>, BodyRegion[]> = {
  lower_body: ['quadriceps','hamstrings','glutes','hip_abductors','hip_adductors',
    'hip_flexors','gastrocnemius','soleus','tibialis_anterior','feet_ankles'],
  upper_body: ['chest','shoulders','upper_back','lats','biceps','triceps','forearms_grip'],
  back: ['upper_back','lower_back','core_rotation','core_anterior','core_lateral'],
};
const AREA_REGIONS: Record<ProtectedArea, BodyRegion[]> = {
  shoulder: ['shoulders','chest','upper_back','lats'],
  upper_back: ['upper_back','lats','core_rotation'],
  elbow_wrist: ['biceps','triceps','forearms_grip'],
  lower_back: ['lower_back','core_rotation','core_anterior'],
  hip: ['glutes','hip_abductors','hip_adductors','hip_flexors'],
  knee: ['quadriceps','hamstrings'],
  achilles_calf: ['gastrocnemius','soleus','feet_ankles'],
  foot_ankle: ['feet_ankles','tibialis_anterior','gastrocnemius','soleus'],
};

/** Side is stored for review, but generator exclusion is bilateral until validated. */
export function excludedRegionsFromFastStart(
  restrictions: FastStartRestriction[], protectedAreas: ProtectedAreaDetail[],
): BodyRegion[] {
  return [...new Set([
    ...restrictions.flatMap((id) => id !== 'none' && id !== 'other'
      ? REGION_GROUPS[id] : []),
    ...protectedAreas.flatMap((item) => AREA_REGIONS[item.area]),
  ])];
}
export function fastStartNeedsSpecificReview(
  restrictions: FastStartRestriction[],
): boolean {
  return restrictions.includes('other');
}

/**
 * A chosen modality is a planning preference, not proof of current volume or
 * clearance to swim/run/ride. No durations or completed records are fabricated.
 */
export function fastStartCrossTrainingReview(
  modes: CrossTrainingMode[],
): Array<{ mode: CrossTrainingMode; label: string; status: 'requires_dose_review' }> {
  return normalizeCrossTrainingModes(modes).map((mode) => ({
    mode,
    label: CROSS_TRAINING_MODES.find((item) => item.id === mode)!.label,
    status: 'requires_dose_review',
  }));
}

/**
 * Never combine equipment from locations when authorizing a particular
 * strength session. Only the primary chosen venue supplies availableEquipment.
 */
export function allowedFastStartEquipment(
  selectedLocations: FastStartLocation[],
  primary: FastStartLocation,
  profiles: Array<{ kind: string; equipment: EquipmentId[]; isDefault?: boolean }>,
): EquipmentId[] {
  const venue = fastStartPrimaryLocation(selectedLocations, primary);
  if (venue === 'bodyweight') return ['bodyweight'];
  const selected = profiles.find((p) => p.kind === venue);
  return selected?.equipment ?? ['bodyweight'];
}
